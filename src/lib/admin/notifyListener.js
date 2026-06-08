import postgres from 'postgres';
import { getSql, ensureSchema, getSslOptions, normalizeDatabaseUrl, pushDebugLog } from './db.js';
import { sendPushToAll, sendPushToUser } from './push.js';

let started = false;
let pollTimer = null;

// ─── helpers ────────────────────────────────────────────────────────────────

async function getLastSeenLeadId() {
  try {
    const sql = getSql();
    const [row] = await sql`SELECT value FROM settings WHERE key = 'listener:last_lead_id'`;
    return row ? (parseInt(row.value, 10) || 0) : null; // null = not yet initialized
  } catch {
    return 0;
  }
}

async function setLastSeenLeadId(id) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO settings (key, value) VALUES ('listener:last_lead_id', ${String(id)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  } catch (e) {
    console.error('[listener] setLastSeenLeadId error:', e.message);
  }
}

async function handleNewLead(leadId, name, phone) {
  console.log('[listener] New lead detected, id =', leadId);
  await pushDebugLog('listener:new_lead', { leadId, data: { name, phone } });
  try {
    const body = name
      ? `${name}${phone ? ` — тел. ${phone}` : ''}`
      : 'Новая заявка с сайта';
    await sendPushToAll({
      title: 'Новый лид!',
      body,
      url: '/admin/dashboard',
      tag: `svoydom-crm-lead-${leadId}`,
      type: 'lead_created',
    });
    await pushDebugLog('listener:push_sent', { leadId, data: { ok: true } });
    console.log('[listener] Push sent for lead', leadId);
  } catch (e) {
    await pushDebugLog('listener:push_error', { leadId, error: String(e?.message || e) });
    console.error('[listener] Push error for lead', leadId, e?.message);
  }
}

// ─── polling fallback ────────────────────────────────────────────────────────

async function pollOnce() {
  try {
    let lastId = await getLastSeenLeadId();

    if (lastId === null) {
      // First ever start: set checkpoint to current MAX to avoid firing for old leads
      const sql = getSql();
      const [row] = await sql`SELECT COALESCE(MAX(id), 0)::int AS m FROM leads`;
      const maxId = row?.m ?? 0;
      await setLastSeenLeadId(maxId);
      await pushDebugLog('listener:poll_init', { data: { initializedAt: maxId } });
      console.log('[listener] Poll initialized at lead id', maxId);
      return;
    }

    const sql = getSql();
    const newLeads = await sql`
      SELECT id, name, phone FROM leads WHERE id > ${lastId} ORDER BY id ASC LIMIT 20
    `;
    if (!newLeads.length) {
      await sendDueCallbackReminders();
      return;
    }

    await pushDebugLog('listener:poll_found', { data: { count: newLeads.length, fromId: lastId } });
    for (const lead of newLeads) {
      await handleNewLead(lead.id, lead.name, lead.phone);
      await setLastSeenLeadId(lead.id);
    }

    await sendDueCallbackReminders();
  } catch (e) {
    console.error('[listener] Poll error:', e.message);
    await pushDebugLog('listener:poll_error', { error: String(e?.message || e) }).catch(() => {});
  }
}

async function sendDueCallbackReminders() {
  const sql = getSql();
  const dueLeads = await sql`
    SELECT
      l.id,
      l.name,
      l.phone,
      l.callback_at,
      l.callback_note,
      l.assigned_to,
      u.name AS assigned_to_name
    FROM leads l
    JOIN users u ON u.id = l.assigned_to
    WHERE l.callback_at IS NOT NULL
      AND l.callback_at <= NOW()
      AND l.status IN ('new', 'in_progress', 'meeting', 'documents', 'deal')
      AND u.is_active IS DISTINCT FROM false
      AND NOT EXISTS (
        SELECT 1
        FROM lead_events le
        WHERE le.lead_id = l.id
          AND le.type = 'callback_reminder_sent'
          AND le.created_at >= l.callback_at
      )
    ORDER BY l.callback_at ASC
    LIMIT 25
  `;

  for (const lead of dueLeads) {
    const title = `Пора перезвонить: ${lead.name || `Лид #${lead.id}`}`;
    const body = `${lead.phone ? `${lead.phone}. ` : ''}${lead.callback_note || 'Свяжитесь с клиентом и обновите статус в CRM.'}`;
    let pushResult = null;
    try {
      pushResult = await sendPushToUser({
        userId: lead.assigned_to,
        title,
        body,
        url: '/admin/dashboard',
        tag: `svoydom-crm-callback-due-${lead.id}-${new Date(lead.callback_at).getTime()}`,
        type: 'lead_callback_due',
      });
    } catch (error) {
      console.error('[listener] callback reminder push error:', error?.message);
      await pushDebugLog('listener:callback_due_push_error', { leadId: lead.id, error: String(error?.message || error) });
    }

    await sql`
      INSERT INTO lead_events (lead_id, user_id, type, message, meta)
      VALUES (
        ${lead.id},
        ${lead.assigned_to},
        'callback_reminder_sent',
        ${`Напоминание о перезвоне отправлено ответственному: ${lead.assigned_to_name || `#${lead.assigned_to}`}`},
        ${sql.json({
          callback_at: lead.callback_at,
          callback_note: lead.callback_note,
          assigned_to: lead.assigned_to,
          assigned_to_name: lead.assigned_to_name,
          push: pushResult ? { sent: pushResult.sent, failed: pushResult.failed, total: pushResult.total } : null,
        })}
      )
    `;
  }
}

function schedulePoll(intervalMs) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await pollOnce();
    schedulePoll(intervalMs);
  }, intervalMs);
}

// ─── LISTEN / NOTIFY ─────────────────────────────────────────────────────────

async function startListenNotify() {
  if (!process.env.DATABASE_URL) return false;

  try {
    const dbUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
    const listenSql = postgres(dbUrl, {
      ssl: getSslOptions(dbUrl),
      max: 1,
      idle_timeout: null,
      connect_timeout: 30,
      onnotice: () => {},
    });

    await listenSql.listen('new_lead', async (payload) => {
      await pushDebugLog('listener:notify_recv', { data: { channel: 'new_lead', payload } });
      try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : (payload ?? {});
        const leadId = Number(data.lead_id);
        if (!leadId) return;

        // Skip if polling already processed this lead
        const lastId = (await getLastSeenLeadId()) ?? 0;
        if (leadId <= lastId) {
          await pushDebugLog('listener:notify_skip_dup', { leadId, data: { lastId } });
          return;
        }

        await handleNewLead(leadId, data.name, data.phone);
        await setLastSeenLeadId(leadId);
      } catch (e) {
        console.error('[listener] new_lead handler error:', e.message);
        await pushDebugLog('listener:notify_error', { error: String(e?.message || e) }).catch(() => {});
      }
    });

    await pushDebugLog('listener:connected', { data: { channel: 'new_lead' } });
    console.log('[listener] LISTEN/NOTIFY active on channel: new_lead');
    return true;
  } catch (e) {
    console.error('[listener] LISTEN/NOTIFY setup failed:', e.message);
    await pushDebugLog('listener:listen_failed', { error: String(e?.message || e) }).catch(() => {});
    return false;
  }
}

// ─── entry point ─────────────────────────────────────────────────────────────

export async function startListener() {
  if (started) return;
  started = true;

  console.log('[listener] Starting push notification listener...');

  try {
    await ensureSchema();
  } catch (e) {
    console.error('[listener] ensureSchema error on startup:', e.message);
  }

  const listenOk = await startListenNotify();

  // Polling always runs as safety net; shorter interval when LISTEN is unavailable
  const pollIntervalMs = listenOk ? 7000 : 5000;
  schedulePoll(pollIntervalMs);

  await pushDebugLog('listener:started', {
    data: { listenOk, pollIntervalMs },
  }).catch(() => {});

  console.log(
    '[listener] Ready. LISTEN/NOTIFY:',
    listenOk ? 'active' : 'disabled (polling only)',
    `| polling every ${pollIntervalMs / 1000}s`
  );
}
