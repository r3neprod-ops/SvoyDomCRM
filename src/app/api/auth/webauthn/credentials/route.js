import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();

  const credentials = await sql`
    SELECT id, device_name, created_at
    FROM webauthn_credentials
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ ok: true, credentials });
}
