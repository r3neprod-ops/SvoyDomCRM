import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { sendPushToAll } from '@/lib/admin/push';

function mapMessage(message) {
  return {
    ...message,
    author_name: message.author_name || 'Неизвестно',
    author_username: message.author_username || '',
    author_role: message.author_role || 'employee',
  };
}

export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 200);

  await ensureSchema();
  const sql = getSql();

  const messages = await sql`
    SELECT *
    FROM (
      SELECT cm.id, cm.user_id, cm.text, cm.media_url, cm.media_type, cm.media_mime, cm.media_size, cm.media_name,
             cm.created_at, u.name AS author_name, u.avatar_url AS author_avatar_url,
             u.status_text AS author_status_text, u.username AS author_username, u.role AS author_role
      FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.direct_chat_id IS NULL AND cm.room_id IS NULL
      ORDER BY cm.created_at DESC
      LIMIT ${limit}
    ) latest
    ORDER BY created_at ASC
  `;

  const [{ last_read_message_id: lastReadMessageId = 0 } = {}] = await sql`
    SELECT last_read_message_id
    FROM chat_reads
    WHERE user_id = ${user.id}
  `;
  const [{ unread_count: unreadCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM chat_messages
    WHERE direct_chat_id IS NULL AND room_id IS NULL
      AND user_id <> ${user.id}
      AND id > ${lastReadMessageId || 0}
  `;
  const readsData = await sql`
    SELECT cr.user_id, COALESCE(cr.last_read_message_id, 0)::int AS last_read, u.name
    FROM chat_reads cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.user_id <> ${user.id}
  `;

  const messagesOut = messages.map((msg) => ({
    ...mapMessage(msg),
    readers: readsData
      .filter((r) => r.last_read >= msg.id && r.user_id !== msg.user_id)
      .map((r) => ({ id: r.user_id, name: r.name })),
  }));

  return NextResponse.json({
    ok: true,
    messages: messagesOut,
    unread_count: unreadCount,
    last_read_message_id: lastReadMessageId || 0,
  });
}

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: false, message: 'Текст сообщения обязателен' }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ ok: false, message: 'Сообщение слишком длинное' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [message] = await sql`
    INSERT INTO chat_messages (user_id, text, media_type)
    VALUES (${user.id}, ${text}, 'text')
    RETURNING id, text, media_url, media_type, media_mime, media_size, media_name, created_at
  `;

  try {
    await sendPushToAll({
      title: `Новое сообщение от ${user.name || 'CRM'}`,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      url: '/admin/dashboard',
      excludeUserId: user.id,
      tag: `svoydom-crm-chat-${message.id}`,
      type: 'chat',
    });
  } catch (pushError) {
    console.error('Chat push notification error:', pushError);
  }

  return NextResponse.json({
    ok: true,
    message: mapMessage({
      ...message,
      user_id: user.id,
      readers: [],
      author_name: user.name,
      author_username: user.username,
      author_role: user.role,
    }),
  });
}
