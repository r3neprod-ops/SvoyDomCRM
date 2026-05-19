import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { getVapidDiagnostics } from '@/lib/admin/pushConfig';

export const dynamic = 'force-dynamic';

function maskEndpoint(endpoint = '') {
  if (!endpoint) return '';
  if (endpoint.length <= 28) return endpoint;
  return `${endpoint.slice(0, 18)}...${endpoint.slice(-8)}`;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const vapid = getVapidDiagnostics();
  const diagnostics = {
    vapidPublicKey: {
      ok: Boolean(vapid.publicKey),
      label: vapid.publicKey ? `configured (${vapid.publicKeyLength} chars)` : 'missing',
    },
    vapidPrivateKey: {
      ok: Boolean(vapid.privateKey),
      label: vapid.privateKey ? `configured (${vapid.privateKeyLength} chars)` : 'missing',
    },
    vapidSubject: {
      ok: Boolean(vapid.subject),
      label: vapid.subject || 'missing',
    },
    database: { ok: false, label: 'not_checked' },
    subscriptions: { ok: false, count: 0, allCount: 0, items: [] },
  };

  try {
    await ensureSchema();
    const sql = getSql();
    diagnostics.database = { ok: true, label: 'connected' };

    const [{ count: allCount }] = await sql`
      SELECT COUNT(*)::int AS count FROM push_subscriptions
    `;

    const subscriptions = await sql`
      SELECT
        id,
        endpoint,
        platform,
        created_at,
        updated_at,
        last_success_at,
        last_error_at,
        last_status_code,
        last_error
      FROM push_subscriptions
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 10
    `;

    diagnostics.subscriptions = {
      ok: subscriptions.length > 0,
      count: subscriptions.length,
      allCount,
      items: subscriptions.map((row) => ({
        id: row.id,
        endpoint: maskEndpoint(row.endpoint),
        platform: row.platform || 'unknown',
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_success_at: row.last_success_at,
        last_error_at: row.last_error_at,
        last_status_code: row.last_status_code,
        last_error: row.last_error,
      })),
    };
  } catch (err) {
    diagnostics.database = { ok: false, label: err?.message || 'database_error' };
  }

  return NextResponse.json({ ok: true, diagnostics });
}
