import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  let subscription;
  try {
    ({ subscription } = await request.json());
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (!subscription?.endpoint) {
    return Response.json({ ok: false, message: 'Invalid subscription' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  await sql`
    INSERT INTO push_subscriptions (endpoint, subscription, user_id)
    VALUES (${subscription.endpoint}, ${JSON.stringify(subscription)}, ${user.id})
    ON CONFLICT (endpoint) DO UPDATE SET
      subscription = EXCLUDED.subscription,
      user_id = EXCLUDED.user_id
  `;

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  let endpoint;
  try {
    ({ endpoint } = await request.json());
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  if (endpoint) {
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint} AND user_id = ${user.id}`;
  } else {
    await sql`DELETE FROM push_subscriptions WHERE user_id = ${user.id}`;
  }

  return Response.json({ ok: true });
}
