import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

async function getMyRole(sql, roomId, userId) {
  const [row] = await sql`
    SELECT role FROM chat_room_members WHERE room_id = ${roomId} AND user_id = ${userId}
  `;
  return row?.role || null;
}

export async function GET(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const myRole = await getMyRole(sql, roomId, user.id);
  if (!myRole) return NextResponse.json({ ok: false }, { status: 403 });

  const [room] = await sql`
    SELECT cr.id, cr.name, cr.description, cr.created_by, cr.created_at,
      (SELECT COUNT(*)::int FROM chat_room_members WHERE room_id = cr.id) AS member_count
    FROM chat_rooms cr WHERE cr.id = ${roomId}
  `;
  if (!room) return NextResponse.json({ ok: false }, { status: 404 });

  const members = await sql`
    SELECT crm.user_id, crm.role, crm.joined_at,
           u.name, u.username, u.avatar_url, u.role AS user_role
    FROM chat_room_members crm
    JOIN users u ON u.id = crm.user_id
    WHERE crm.room_id = ${roomId}
    ORDER BY CASE WHEN crm.role = 'admin' THEN 0 ELSE 1 END, crm.joined_at ASC
  `;

  return NextResponse.json({ ok: true, room: { ...room, my_role: myRole, members } });
}

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const myRole = await getMyRole(sql, roomId, user.id);
  if (myRole !== 'admin') return NextResponse.json({ ok: false, message: 'Нет прав' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = body.name?.trim();
  if (!name || name.length > 100) {
    return NextResponse.json({ ok: false, message: 'Некорректное название' }, { status: 400 });
  }

  await sql`UPDATE chat_rooms SET name = ${name} WHERE id = ${roomId}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const myRole = await getMyRole(sql, roomId, user.id);
  if (myRole !== 'admin') return NextResponse.json({ ok: false, message: 'Нет прав' }, { status: 403 });

  await sql`DELETE FROM chat_rooms WHERE id = ${roomId}`;
  return NextResponse.json({ ok: true });
}
