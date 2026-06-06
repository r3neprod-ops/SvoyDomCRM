import postgres from 'postgres';
import webpush from 'web-push';

const ACTIVE_STATUSES = new Set(['new', 'in_progress', 'meeting', 'documents', 'deal']);
const STATUS_LABELS = {
  new: 'Новый',
  in_progress: 'В работе',
  meeting: 'Встреча',
  documents: 'Документы',
  deal: 'Сделка',
};

const REMINDER_DAYS = Number(process.env.LEAD_REMINDER_DAYS || 3);
const LIMIT = Number(process.env.LEAD_REMINDER_LIMIT || 100);
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());

function cleanEnvValue(value) {
  return String(value || '').trim().replace(/^['"]+|['"]+$/g, '');
}

function encodeUrlPart(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function normalizeDatabaseUrl(value) {
  const cleaned = cleanEnvValue(value);
  const match = cleaned.match(/^(postgres(?:ql)?:\/\/)(.+)$/i);
  if (!match) return cleaned;

  const [, protocol, rest] = match;
  const pathIndex = rest.indexOf('/');
  const authority = pathIndex >= 0 ? rest.slice(0, pathIndex) : rest;
  const path = pathIndex >= 0 ? rest.slice(pathIndex) : '';
  const atIndex = authority.lastIndexOf('@');
  if (atIndex < 0) return cleaned;

  const credentials = authority.slice(0, atIndex);
  const host = authority.slice(atIndex + 1);
  const colonIndex = credentials.indexOf(':');
  if (colonIndex < 0) return cleaned;

  const username = credentials.slice(0, colonIndex);
  const password = credentials.slice(colonIndex + 1);
  return `${protocol}${encodeUrlPart(username)}:${encodeUrlPart(password)}@${host}${path}`;
}

function getSslOptions(dbUrl) {
  try {
    const sslMode = new URL(dbUrl).searchParams.get('sslmode')?.toLowerCase();
    if (!sslMode || sslMode === 'disable' || sslMode === 'allow') return false;
  } catch {
    if (!dbUrl.includes('sslmode=')) return false;
  }

  return { rejectUnauthorized: false };
}

function normalizeSubscription(subscription) {
  if (typeof subscription === 'string') {
    try {
      return JSON.parse(subscription);
    } catch {
      return null;
    }
  }
  return subscription && typeof subscription === 'object' ? subscription : null;
}

function buildBody(lead) {
  const leadTitle = `${lead.name || `Лид #${lead.id}`}${lead.phone ? `, ${lead.phone}` : ''}`;
  if (lead.status === 'meeting') {
    return `${leadTitle}. Подтвердите встречу и обновите следующий шаг в CRM.`;
  }
  if (lead.status === 'documents') {
    return `${leadTitle}. Проверьте документы, уточните недостающее и оставьте комментарий.`;
  }
  if (lead.status === 'deal') {
    return `${leadTitle}. Доведите сделку до финала или закройте в отказ с причиной.`;
  }
  return `${leadTitle}. Свяжитесь с клиентом, уточните данные и обновите этап в CRM.`;
}

function buildPayload(lead) {
  return JSON.stringify({
    title: `Напоминание по лиду: ${STATUS_LABELS[lead.status] || lead.status}`,
    body: buildBody(lead),
    url: '/admin/dashboard',
    tag: `svoydom-crm-auto-lead-reminder-${lead.id}`,
    type: 'lead_auto_reminder',
    icon: '/icon-192.png',
    badge: '/favicon-96x96.png',
    badgeCount: 1,
    requireInteraction: false,
    timestamp: Date.now(),
  });
}

async function markSuccess(sql, id, statusCode) {
  await sql`
    UPDATE push_subscriptions
    SET last_success_at = NOW(),
        last_error_at = NULL,
        last_status_code = ${statusCode || 201},
        last_error = NULL,
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

async function markFailure(sql, id, statusCode, message) {
  await sql`
    UPDATE push_subscriptions
    SET last_error_at = NOW(),
        last_status_code = ${statusCode || null},
        last_error = ${String(message || '').slice(0, 500)},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

async function sendLeadPushes(sql, lead) {
  const rows = await sql`
    SELECT id, endpoint, subscription
    FROM push_subscriptions
    WHERE user_id = ${lead.assigned_to}
  `;

  if (!rows.length) {
    return { sent: 0, failed: 0, total: 0, note: 'no_subscriptions' };
  }

  const payload = buildPayload(lead);
  let sent = 0;
  let failed = 0;
  const expiredIds = [];

  for (const row of rows) {
    const subscription = normalizeSubscription(row.subscription);
    try {
      if (!subscription?.endpoint) throw new Error('Subscription endpoint is missing');
      const result = await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 });
      sent += 1;
      await markSuccess(sql, row.id, result?.statusCode || 201);
    } catch (error) {
      failed += 1;
      const statusCode = error?.statusCode || null;
      const message = error?.body || error?.message || String(error);
      await markFailure(sql, row.id, statusCode, message);
      if ([404, 410].includes(statusCode)) expiredIds.push(row.id);
    }
  }

  if (expiredIds.length) {
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${expiredIds})`;
  }

  return { sent, failed, total: rows.length };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!DRY_RUN) {
    const publicKey = cleanEnvValue(process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY);
    const subject = cleanEnvValue(process.env.VAPID_SUBJECT || 'mailto:r3neprod@gmail.com');
    if (!publicKey || !privateKey || !subject) {
      throw new Error('VAPID keys are not configured');
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  const dbUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  const sql = postgres(dbUrl, {
    ssl: getSslOptions(dbUrl),
    max: 4,
    idle_timeout: 5,
    connect_timeout: 20,
  });

  try {
    const dueLeads = await sql`
      WITH lead_due AS (
        SELECT
          l.id,
          l.name,
          l.phone,
          l.status,
          l.assigned_to,
          u.name AS assigned_to_name,
          COALESCE((
            SELECT MAX(le.created_at)
            FROM lead_events le
            WHERE le.lead_id = l.id AND le.type = 'assigned'
          ), l.created_at) AS assigned_at,
          (
            SELECT MAX(le.created_at)
            FROM lead_events le
            WHERE le.lead_id = l.id AND le.type = 'auto_reminder'
          ) AS last_auto_reminder_at
        FROM leads l
        JOIN users u ON u.id = l.assigned_to
        WHERE l.assigned_to IS NOT NULL
          AND l.status = ANY(${Array.from(ACTIVE_STATUSES)})
          AND u.is_active IS DISTINCT FROM false
      )
      SELECT *
      FROM lead_due
      WHERE GREATEST(assigned_at, COALESCE(last_auto_reminder_at, 'epoch'::timestamptz))
            <= NOW() - (${REMINDER_DAYS}::int * INTERVAL '1 day')
      ORDER BY assigned_at ASC
      LIMIT ${LIMIT}
    `;

    let sent = 0;
    let failed = 0;
    for (const lead of dueLeads) {
      if (DRY_RUN) continue;

      const result = await sendLeadPushes(sql, lead);
      sent += result.sent;
      failed += result.failed;

      await sql`
        INSERT INTO lead_events (lead_id, user_id, type, message, meta)
        VALUES (
          ${lead.id},
          ${lead.assigned_to},
          'auto_reminder',
          ${`Автонапоминание ответственному: ${buildBody(lead)}`},
          ${sql.json({
            status: lead.status,
            assigned_to: lead.assigned_to,
            assigned_to_name: lead.assigned_to_name,
            sent: result.sent,
            failed: result.failed,
            total: result.total,
            note: result.note || null,
            reminder_days: REMINDER_DAYS,
          })}
        )
      `;
    }

    console.log(JSON.stringify({
      ok: true,
      dryRun: DRY_RUN,
      due: dueLeads.length,
      preview: DRY_RUN
        ? dueLeads.slice(0, 10).map((lead) => ({
            id: lead.id,
            status: lead.status,
            assigned_to: lead.assigned_to,
            assigned_to_name: lead.assigned_to_name,
          }))
        : undefined,
      sent,
      failed,
      reminderDays: REMINDER_DAYS,
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('[lead-reminders] failed:', error);
  process.exitCode = 1;
});
