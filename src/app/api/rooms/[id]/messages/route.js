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

async function buildReactionsMap(sql, msgIds, userId) {
  if (!msgIds.length) return {};
  const rows = await sql`
    SELECT message_id, emoji, COUNT(*)::int AS count,
           bool_or(user_id = ${userId}) AS has_mine
    FROM message_reactions
    WHERE message_id = ANY(${msgIds})
    GROUP BY message_id, emoji
    ORDER BY message_id, count DESC
  `;
  const map = {};
  for (const r of rows) {
    (map[r.message_id] ??= []).push({ emoji: r.emoji, count: r.count, has_mine: r.has_mine });
  }
  return map;
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
      SELECT cm.id, cm.user_id, cm.text, cm.media_url, cm.media_type, cm.media_mime, cm.media_size, cm.media_name,
             cm.reply_to_id, cm.reply_to_text, cm.reply_to_author, cm.created_at,
             u.name AS author_name, u.avatar_url AS author_avatar_url,
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
    SELECT COUNT(*)::int AS unread_count FROM chat_messages
    WHERE room_id = ${roomId}
      AND user_id <> ${user.id} AND id > ${lastReadMessageId}
  `;

  const memberReads = await sql`
    SELECT rr.user_id, COALESCE(rr.last_read_message_id, 0)::int AS last_read, u.name
    FROM room_reads rr
    JOIN users u ON u.id = rr.user_id
    WHERE rr.room_id = ${roomId} AND rr.user_id <> ${user.id}
  `;

  const msgIds = messages.map((m) => m.id);
  const reactionsMap = await buildReactionsMap(sql, msgIds, user.id);

  const messagesOut = messages.map((msg) => ({
    ...msg,
    reply_to: msg.reply_to_id ? { id: msg.reply_to_id, text: msg.reply_to_text, author_name: msg.reply_to_author } : null,
    reactions: reactionsMap[msg.id] || [],
    readers: memberReads
      .filter((r) => r.last_read >= msg.id && r.user_id !== msg.user_id)
      .map((r) => ({ id: r.user_id, name: r.name })),
  }));

  return NextResponse.json({
    ok: true,
    messages: messagesOut,
    unread_count: unreadCount,
    last_read_message_id: lastReadMessageId,
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

  const replyToId = body.reply_to_id ? Number(body.reply_to_id) : null;
  let replyToText = null, replyToAuthor = null;
  if (replyToId) {
    const [ref] = await sql`
      SELECT cm.text, u.name AS author_name FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.id = ${replyToId} AND cm.room_id = ${roomId}
    `;
    if (ref) { replyToText = ref.text; replyToAuthor = ref.author_name; }
  }

  const [message] = await sql`
    INSERT INTO chat_messages (user_id, room_id, text, media_type, reply_to_id, reply_to_text, reply_to_author)
    VALUES (${user.id}, ${roomId}, ${text}, 'text', ${replyToId}, ${replyToText}, ${replyToAuthor})
    RETURNING id, text, media_url, media_type, media_mime, media_size, media_name,
              reply_to_id, reply_to_text, reply_to_author, created_at
  `;

  const [room] = await sql`SELECT name FROM chat_rooms WHERE id = ${roomId}`;
  const members = await sql`
    SELECT user_id FROM chat_room_members WHERE room_id = ${roomId} AND user_id <> ${user.id}
  `;
  const memberIds = members.map((m) => m.user_id);
  if (memberIds.length > 0) {
    try {
      await sendPushToUsers({
        userIds: memberIds,
        title: `${room?.name || 'Канал'}: ${user.name}`,
        body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
        url: '/admin/dashboard',
        tag: `svoydom-crm-room-${message.id}`,
        type: 'room_chat',
      });
    } catch (pushError) {
      console.error('Room chat push notification error:', pushError);
    }
  }

  return NextResponse.json({
    ok: true,
    message: {
      ...message,
      user_id: user.id,
      readers: [],
      reactions: [],
      reply_to: replyToId ? { id: replyToId, text: replyToText, author_name: replyToAuthor } : null,
      author_name: user.name,
      author_username: user.username,
      author_role: user.role,
      author_avatar_url: '',
      author_status_text: '',
    },
  });
}
