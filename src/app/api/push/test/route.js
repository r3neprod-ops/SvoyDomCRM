import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { getVapidDiagnostics } from '@/lib/admin/pushConfig';
import { buildPushPayload, sendPushRows } from '@/lib/admin/push';

export const dynamic = 'force-dynamic';

function maskEndpoint(endpoint = '') {
  if (!endpoint) return '';
  if (endpoint.length <= 30) return endpoint;
  return `${endpoint.slice(0, 18)}...${endpoint.slice(-8)}`;
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const vapid = getVapidDiagnostics();
  if (!vapid.ok) {
    return NextResponse.json({
      ok: false,
      code: 'vapid_keys_missing',
      message: 'На сервере не настроены VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY',
      vapid: {
        publicKey: Boolean(vapid.publicKey),
        privateKey: Boolean(vapid.privateKey),
        subject: Boolean(vapid.subject),
      },
    }, { status: 500 });
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, subscription
    FROM push_subscriptions
    WHERE user_id = ${user.id}
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
  `;

  if (!rows.length) {
    return NextResponse.json({
      ok: false,
      code: 'no_subscriptions',
      message: 'Для этого пользователя нет сохраненной push-подписки',
    }, { status: 404 });
  }

  const payload = buildPushPayload({
    title: 'СвойДом CRM',
    body: 'Тестовое уведомление доставлено. Push работает.',
    url: '/admin/dashboard',
    tag: `svoydom-crm-test-${user.id}-${Date.now()}`,
    type: 'test',
    requireInteraction: false,
  });

  const result = await sendPushRows(rows, payload, { label: `test:user:${user.id}` });

  return NextResponse.json({
    ok: result.ok,
    code: result.ok ? 'sent' : 'send_failed',
    sent: result.sent,
    failed: result.failed,
    total: result.total,
    removedExpired: result.removedExpired,
    results: result.results.map((item) => ({
      ...item,
      endpoint: maskEndpoint(item.endpoint),
    })),
  }, { status: result.ok ? 200 : 502 });
}
