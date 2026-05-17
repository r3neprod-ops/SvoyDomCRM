import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [callerRow] = await sql`
    SELECT role FROM chat_room_members WHERE room_id = ${roomId} AND user_id = ${user.id}
  `;
  if (callerRow?.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Нет прав' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.map(Number).filter((id) => id && id !== user.id)
    : [];

  if (!userIds.length) {
    return NextResponse.json({ ok: false, message: 'Укажите пользователей' }, { status: 400 });
  }

  const validUsers = await sql`SELECT id FROM users WHERE id = ANY(${userIds}) AND is_active = true`;
  for (const u of validUsers) {
    await sql`
      INSERT INTO chat_room_members (room_id, user_id, role)
      VALUES (${roomId}, ${u.id}, 'member')
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json({ ok: true, added: validUsers.length });
}
