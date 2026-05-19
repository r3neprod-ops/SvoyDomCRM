import webpush from 'web-push';
import { getSql, ensureSchema, pushDebugLog } from './db';
import { getVapidKeys } from './pushConfig';

const DEFAULT_URL = '/admin/dashboard';
const DEFAULT_ICON = '/icon-192.png';
const DEFAULT_BADGE = '/favicon-96x96.png';

function configureWebPush() {
  const { publicKey, privateKey, subject } = getVapidKeys();
  if (!publicKey || !privateKey || !subject) {
    return { ok: false, reason: 'vapid_keys_missing' };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { ok: true };
}

function cleanText(value, fallback) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function buildPushPayload({
  title,
  body,
  url = DEFAULT_URL,
  tag = 'svoydom-crm',
  type = 'crm',
  badgeCount = 1,
  requireInteraction = false,
} = {}) {
  return JSON.stringify({
    title: cleanText(title, 'СвойДом CRM'),
    body: cleanText(body, 'Новое событие в CRM'),
    url,
    tag,
    type,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    badgeCount,
    requireInteraction,
    timestamp: Date.now(),
  });
}

function summarizeFailure(error) {
  const raw = error?.body || error?.message || String(error || 'unknown error');
  return raw.length > 500 ? raw.slice(0, 500) : raw;
}

function normalizeStoredSubscription(subscription) {
  if (typeof subscription === 'string') {
    try {
      return JSON.parse(subscription);
    } catch {
      return null;
    }
  }
  return subscription && typeof subscription === 'object' ? subscription : null;
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
        last_error = ${message},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function sendPushRows(rows, payload, { label = 'push' } = {}) {
  const config = configureWebPush();
  console.log(`[Push] ${label}: configureWebPush result`, config);
  await pushDebugLog('configureWebPush:result', { data: { label, ...config } });

  if (!config.ok) {
    console.warn(`[Push] ${label}: VAPID keys missing`);
    return { ok: false, code: config.reason, sent: 0, failed: 0, total: rows.length, results: [] };
  }

  await ensureSchema();
  const sql = getSql();

  await pushDebugLog('sendPushRows:before_loop', { data: { label, count: rows.length } });

  if (!rows.length) {
    return { ok: false, code: 'no_subscriptions', sent: 0, failed: 0, total: 0, results: [] };
  }

  const settled = await Promise.allSettled(
    rows.map((row) => {
      const subscription = normalizeStoredSubscription(row.subscription);
      if (!subscription?.endpoint) {
        return Promise.reject(new Error('Stored push subscription is missing endpoint'));
      }
      return webpush.sendNotification(subscription, payload, { TTL: 60 * 60 });
    })
  );

  const expiredIds = [];
  const results = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < settled.length; i += 1) {
    const row = rows[i];
    const result = settled[i];

    if (result.status === 'fulfilled') {
      const statusCode = result.value?.statusCode || 201;
      sent += 1;
      results.push({ id: row.id, ok: true, statusCode, endpoint: row.endpoint });
      await markSuccess(sql, row.id, statusCode);
      await pushDebugLog('sendPushRows:row_processed', { subscriptionId: row.id, data: { ok: true, statusCode } });
      continue;
    }

    const statusCode = result.reason?.statusCode || null;
    const message = summarizeFailure(result.reason);
    failed += 1;
    results.push({ id: row.id, ok: false, statusCode, error: message, endpoint: row.endpoint });
    await markFailure(sql, row.id, statusCode, message);
    await pushDebugLog('sendPushRows:row_processed', { subscriptionId: row.id, data: { ok: false, statusCode }, error: message });
    console.error(`[Push] ${label}: failed subscription ${row.id}`, statusCode, message);

    if ([404, 410].includes(statusCode)) expiredIds.push(row.id);
  }

  if (failed > 0) {
    const failedDetails = results
      .filter((r) => !r.ok)
      .map((r) => ({
        id: r.id,
        statusCode: r.statusCode,
        error: r.error,
        endpoint: r.endpoint ? `${String(r.endpoint).slice(0, 24)}…` : 'missing',
      }));
    console.warn(`[Push] ${label}: summary — sent:${sent} failed:${failed} total:${rows.length}`, JSON.stringify(failedDetails));
  }

  if (expiredIds.length > 0) {
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${expiredIds})`;
  }

  return {
    ok: sent > 0,
    sent,
    failed,
    total: rows.length,
    removedExpired: expiredIds.length,
    results,
  };
}

export async function sendPushToAll({ title, body, url = DEFAULT_URL, excludeUserId = null, tag = 'svoydom-crm-all', type = 'broadcast' }) {
  console.log('[Push] sendPushToAll called', { title, type, excludeUserId });
  await ensureSchema();
  await pushDebugLog('sendPushToAll:called', { data: { title, type, excludeUserId } });

  const sql = getSql();
  const rows = excludeUserId
    ? await sql`
        SELECT id, endpoint, subscription
        FROM push_subscriptions
        WHERE user_id IS NULL OR user_id <> ${excludeUserId}
      `
    : await sql`SELECT id, endpoint, subscription FROM push_subscriptions`;

  await pushDebugLog('sendPushToAll:rows_loaded', { data: { count: rows.length } });

  const payload = buildPushPayload({ title, body, url, tag, type });
  let result;
  try {
    result = await sendPushRows(rows, payload, { label: 'broadcast' });
  } catch (e) {
    await pushDebugLog('sendPushToAll:error', { error: `${e.message}\n${e.stack || ''}` });
    throw e;
  }
  await pushDebugLog('sendPushToAll:done', { data: { sent: result.sent, failed: result.failed, total: result.total } });
  return result;
}

export async function sendPushToUsers({ userIds, title, body, url = DEFAULT_URL, tag = null, type = 'user' }) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, code: 'no_users', sent: 0, failed: 0, total: 0, results: [] };
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, subscription
    FROM push_subscriptions
    WHERE user_id = ANY(${ids})
  `;

  const payload = buildPushPayload({ title, body, url, tag: tag || `svoydom-crm-users-${ids.join('-')}`, type });
  return sendPushRows(rows, payload, { label: `users:${ids.join(',')}` });
}

export async function sendPushToUser({ userId, title, body, url = DEFAULT_URL, tag = null, type = 'user' }) {
  return sendPushToUsers({ userIds: [userId], title, body, url, tag, type });
}
