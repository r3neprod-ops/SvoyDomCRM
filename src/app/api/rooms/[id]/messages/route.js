import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { sendPushToUsers } from '@/lib/admin/push';

async function checkAccess(sql, userId, roomId) {
  const [row] = await sql`
    SELECT role FROM chat_room_members WHERE room_id = ${roomId} AND user_id = ${userId}
  `;
  return !!row;
}

export async function GET(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  if (!await checkAccess(sql, user.id, roomId)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 200);

  const messages = await sql`
    SELECT *
    FROM (
      SELECT cm.id, cm.user_id, cm.text, cm.media_url, cm.media_type, cm.media_mime, cm.media_size,
             cm.created_at, u.name AS author_name, u.avatar_url AS author_avatar_url,
             u.status_text AS author_status_text, u.username AS author_username, u.role AS author_role
      FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.room_id = ${roomId}
      ORDER BY cm.created_at DESC
      LIMIT ${limit}
    ) latest
    ORDER BY created_at ASC
  `;

  const [readRow] = await sql`
    SELECT last_read_message_id FROM room_reads
    WHERE room_id = ${roomId} AND user_id = ${user.id}
  `;
  const lastReadMessageId = readRow?.last_read_message_id || 0;

  const [{ unread_count: unreadCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM chat_messages
    WHERE room_id = ${roomId}
      AND user_id <> ${user.id}
      AND id > ${lastReadMessageId}
  `;

  const [{ read_by_others_up_to: readByOthersUpTo = 0 } = {}] = await sql`
    SELECT COALESCE(MAX(last_read_message_id), 0)::int AS read_by_others_up_to
    FROM room_reads
    WHERE room_id = ${roomId} AND user_id <> ${user.id}
  `;

  return NextResponse.json({
    ok: true,
    messages,
    unread_count: unreadCount,
    last_read_message_id: lastReadMessageId,
    read_by_others_up_to: readByOthersUpTo,
  });
}

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const roomId = Number(params.id);
  if (!roomId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  if (!await checkAccess(sql, user.id, roomId)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const text = body.text?.trim();
  if (!text || text.length > 4000) {
    return NextResponse.json({ ok: false, message: 'Некорректный текст' }, { status: 400 });
  }

  const [message] = await sql`
    INSERT INTO chat_messages (user_id, room_id, text, media_type)
    VALUES (${user.id}, ${roomId}, ${text}, 'text')
    RETURNING id, text, media_url, media_type, media_mime, media_size, created_at
  `;

  const [room] = await sql`SELECT name FROM chat_rooms WHERE id = ${roomId}`;
  const members = await sql`
    SELECT user_id FROM chat_room_members WHERE room_id = ${roomId} AND user_id <> ${user.id}
  `;
  const memberIds = members.map((m) => m.user_id);
  if (memberIds.length > 0) {
    sendPushToUsers({
      userIds: memberIds,
      title: `${room?.name || 'Канал'}: ${user.name}`,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      url: '/admin/dashboard',
    }).catch(console.error);
  }

  return NextResponse.json({
    ok: true,
    message: {
      ...message,
      author_name: user.name,
      author_username: user.username,
      author_role: user.role,
      author_avatar_url: '',
      author_status_text: '',
    },
  });
}
