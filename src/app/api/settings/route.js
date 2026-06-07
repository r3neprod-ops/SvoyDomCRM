import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam } from '@/lib/admin/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT key, value FROM settings`;
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  await ensureSchema();
  const sql = getSql();
  const body = await request.json();

  for (const [key, value] of Object.entries(body)) {
    await sql`
      INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  return NextResponse.json({ ok: true });
}
