import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import webpush from 'web-push';

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  console.log(`[Push/test] user=${user.id}, VAPID_PUBLIC_KEY=${vapidPublic ? vapidPublic.slice(0, 20) + '…' : 'NOT SET'}, VAPID_PRIVATE_KEY=${vapidPrivate ? 'SET' : 'NOT SET'}`);

  if (!vapidPublic || !vapidPrivate) {
    console.error('[Push/test] VAPID keys are not configured! Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env');
    return NextResponse.json({ ok: false, message: 'VAPID keys not configured' }, { status: 500 });
  }

  webpush.setVapidDetails('mailto:r3neprod@gmail.com', vapidPublic, vapidPrivate);

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, subscription FROM push_subscriptions WHERE user_id = ${user.id}
  `;

  console.log(`[Push/test] Found ${rows.length} subscription(s) for user ${user.id}`);

  if (!rows.length) {
    console.warn('[Push/test] No subscriptions found — user has not subscribed or subscription was deleted');
    return NextResponse.json({ ok: false, message: 'No subscriptions found for this user' }, { status: 404 });
  }

  rows.forEach((row, i) => {
    console.log(`[Push/test] Subscription ${i + 1}: id=${row.id}, endpoint=${row.endpoint}`);
  });

  const payload = JSON.stringify({
    title: 'Тест уведомлений',
    body: 'Если вы это видите — push-уведомления работают!',
    url: '/admin/dashboard',
  });

  const results = await Promise.allSettled(
    rows.map((row) => webpush.sendNotification(row.subscription, payload))
  );

  const expiredIds = [];
  let successCount = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      successCount++;
      console.log(`[Push/test] OK subscription ${rows[i].id}, statusCode=${result.value?.statusCode}`);
    } else {
      const code = result.reason?.statusCode;
      const body = result.reason?.body ?? result.reason?.message;
      console.error(`[Push/test] FAILED subscription ${rows[i].id}: statusCode=${code}, body=${body}`);
      if (code === 401) console.error('[Push/test] 401 = Invalid VAPID keys — regenerate and update env vars');
      if (code === 410 || code === 404) {
        console.warn(`[Push/test] ${code} = Expired subscription, removing`);
        expiredIds.push(rows[i].id);
      }
    }
  });

  if (expiredIds.length > 0) {
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${expiredIds})`;
    console.log(`[Push/test] Removed ${expiredIds.length} expired subscription(s)`);
  }

  return NextResponse.json({ ok: successCount > 0, sent: successCount, total: rows.length });
}
