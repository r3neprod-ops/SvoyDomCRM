import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { getVapidKeys } from '@/lib/admin/pushConfig';

export const dynamic = 'force-dynamic';

function maskEndpoint(endpoint = '') {
  if (!endpoint) return '';
  if (endpoint.length <= 28) return endpoint;
  return `${endpoint.slice(0, 18)}...${endpoint.slice(-8)}`;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { publicKey, privateKey } = getVapidKeys();
  const diagnostics = {
    vapidPublicKey: { ok: Boolean(publicKey), label: publicKey ? 'configured' : 'missing' },
    vapidPrivateKey: { ok: Boolean(privateKey), label: privateKey ? 'configured' : 'missing' },
    database: { ok: false, label: 'not_checked' },
    subscriptions: { ok: false, count: 0, items: [] },
  };

  try {
    await ensureSchema();
    const sql = getSql();
    diagnostics.database = { ok: true, label: 'connected' };

    const subscriptions = await sql`
      SELECT id, endpoint, created_at
      FROM push_subscriptions
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    diagnostics.subscriptions = {
      ok: subscriptions.length > 0,
      count: subscriptions.length,
      items: subscriptions.map((row) => ({
        id: row.id,
        endpoint: maskEndpoint(row.endpoint),
        created_at: row.created_at,
      })),
    };
  } catch (err) {
    diagnostics.database = { ok: false, label: err?.message || 'database_error' };
  }

  return NextResponse.json({ ok: true, diagnostics });
}
