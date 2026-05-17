import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function DELETE(_request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();

  const credId = Number(params.id);
  if (!credId) return NextResponse.json({ ok: false, message: 'Неверный ID' }, { status: 400 });

  await sql`
    DELETE FROM webauthn_credentials
    WHERE id = ${credId} AND user_id = ${user.id}
  `;

  return NextResponse.json({ ok: true });
}
