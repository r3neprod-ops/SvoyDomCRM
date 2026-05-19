import webpush from 'web-push';
import { getSql, ensureSchema } from './db';
import { getVapidKeys } from './pushConfig';

function initWebPush() {
  const { publicKey, privateKey } = getVapidKeys();
  webpush.setVapidDetails(
    'mailto:r3neprod@gmail.com',
    publicKey,
    privateKey
  );
}

function buildPayload({ title, body, url = '/admin/dashboard', tag = 'svoydom-crm', type = 'crm' }) {
  return JSON.stringify({
    title: title || 'СвойДом CRM',
    body: body || 'Новое событие в CRM',
    url,
    tag,
    type,
    icon: '/icon-192.png',
    badge: '/favicon-96x96.png',
    timestamp: Date.now(),
  });
}

export async function sendPushToAll({ title, body, url = '/admin/dashboard', excludeUserId = null }) {
  const { publicKey, privateKey } = getVapidKeys();
  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys not configured, skipping push');
    return;
  }
  initWebPush();

  await ensureSchema();
  const sql = getSql();
  const rows = excludeUserId
    ? await sql`
        SELECT id, endpoint, subscription
        FROM push_subscriptions
        WHERE user_id IS NULL OR user_id <> ${excludeUserId}
      `
    : await sql`SELECT id, endpoint, subscription FROM push_subscriptions`;
  console.log(`[Push] sendPushToAll: ${rows.length} subscriptions, title="${title}"`);
  if (!rows.length) return;

  const payload = buildPayload({ title, body, url, tag: 'svoydom-crm-all' });
  const results = await Promise.allSettled(
    rows.map((row) => webpush.sendNotification(row.subscription, payload))
  );

  const expiredIds = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[Push] OK subscription ${rows[i].id}, status ${result.value?.statusCode}`);
    } else {
      console.error(`[Push] FAILED subscription ${rows[i].id}:`, result.reason?.statusCode, result.reason?.body ?? result.reason?.message);
      if ([404, 410].includes(result.reason?.statusCode)) expiredIds.push(rows[i].id);
    }
  });

  if (expiredIds.length > 0) {
    console.log(`[Push] Removing ${expiredIds.length} expired subscriptions`);
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${expiredIds})`;
  }
}

export async function sendPushToUsers({ userIds, title, body, url = '/admin/dashboard' }) {
  const { publicKey, privateKey } = getVapidKeys();
  if (!publicKey || !privateKey || !userIds?.length) {
    console.warn('[Push] VAPID keys not configured or no userIds, skipping push');
    return;
  }
  initWebPush();

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, subscription
    FROM push_subscriptions
    WHERE user_id = ANY(${userIds})
  `;
  console.log(`[Push] sendPushToUsers: ${rows.length} subscriptions for ${userIds.length} users, title="${title}"`);
  if (!rows.length) return;

  const payload = buildPayload({ title, body, url, tag: `svoydom-crm-users-${userIds.join('-')}` });
  const results = await Promise.allSettled(
    rows.map((row) => webpush.sendNotification(row.subscription, payload))
  );

  const expiredIds = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[Push] OK subscription ${rows[i].id}`);
    } else {
      console.error(`[Push] FAILED subscription ${rows[i].id}:`, result.reason?.statusCode, result.reason?.body ?? result.reason?.message);
      if ([404, 410].includes(result.reason?.statusCode)) expiredIds.push(rows[i].id);
    }
  });

  if (expiredIds.length > 0) {
    console.log(`[Push] Removing ${expiredIds.length} expired subscriptions`);
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${expiredIds})`;
  }
}

export async function sendPushToUser({ userId, title, body, url = '/admin/dashboard' }) {
  const { publicKey, privateKey } = getVapidKeys();
  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys not configured, skipping push');
    return;
  }
  initWebPush();

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, subscription
    FROM push_subscriptions
    WHERE user_id = ${userId}
  `;
  console.log(`[Push] sendPushToUser ${userId}: ${rows.length} subscriptions, title="${title}"`);
  if (!rows.length) return;

  const payload = buildPayload({ title, body, url, tag: `svoydom-crm-user-${userId}` });
  const results = await Promise.allSettled(
    rows.map((row) => webpush.sendNotification(row.subscription, payload))
  );

  const expiredIds = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[Push] OK subscription ${rows[i].id}`);
    } else {
      console.error(`[Push] FAILED subscription ${rows[i].id}:`, result.reason?.statusCode, result.reason?.body ?? result.reason?.message);
      if ([404, 410].includes(result.reason?.statusCode)) expiredIds.push(rows[i].id);
    }
  });

  if (expiredIds.length > 0) {
    console.log(`[Push] Removing ${expiredIds.length} expired subscriptions`);
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${expiredIds})`;
  }
}
