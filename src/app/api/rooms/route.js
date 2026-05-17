import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();

  const rooms = await sql`
    SELECT
      cr.id,
      cr.name,
      cr.description,
      cr.created_by,
      cr.created_at,
      crm.role AS my_role,
      (SELECT COUNT(*)::int FROM chat_room_members WHERE room_id = cr.id) AS member_count,
      (
        SELECT COUNT(*)::int FROM chat_messages cm
        LEFT JOIN room_reads rr ON rr.room_id = cm.room_id AND rr.user_id = ${user.id}
        WHERE cm.room_id = cr.id
          AND cm.user_id <> ${user.id}
          AND cm.id > COALESCE(rr.last_read_message_id, 0)
      ) AS unread_count,
      (
        SELECT cm2.created_at FROM chat_messages cm2
        WHERE cm2.room_id = cr.id
        ORDER BY cm2.created_at DESC LIMIT 1
      ) AS last_message_at
    FROM chat_rooms cr
    JOIN chat_room_members crm ON crm.room_id = cr.id AND crm.user_id = ${user.id}
    ORDER BY last_message_at DESC NULLS LAST, cr.created_at DESC
  `;

  return NextResponse.json({ ok: true, rooms });
}

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = body.name?.trim();
  const memberIds = Array.isArray(body.member_ids)
    ? body.member_ids.map(Number).filter((id) => id && id !== user.id)
    : [];

  if (!name || name.length > 100) {
    return NextResponse.json({ ok: false, message: 'Название обязательно (до 100 символов)' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [room] = await sql`
    INSERT INTO chat_rooms (name, created_by)
    VALUES (${name}, ${user.id})
    RETURNING id, name, created_by, created_at
  `;

  await sql`
    INSERT INTO chat_room_members (room_id, user_id, role)
    VALUES (${room.id}, ${user.id}, 'admin')
    ON CONFLICT DO NOTHING
  `;

  if (memberIds.length > 0) {
    const validUsers = await sql`SELECT id FROM users WHERE id = ANY(${memberIds}) AND is_active = true`;
    for (const u of validUsers) {
      await sql`
        INSERT INTO chat_room_members (room_id, user_id, role)
        VALUES (${room.id}, ${u.id}, 'member')
        ON CONFLICT DO NOTHING
      `;
    }
  }

  return NextResponse.json({ ok: true, room });
}
