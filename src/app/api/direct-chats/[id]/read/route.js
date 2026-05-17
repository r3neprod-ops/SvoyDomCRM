import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const chatId = Number(params.id);
  if (!chatId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const [access] = await sql`
    SELECT id FROM direct_chats
    WHERE id = ${chatId} AND (user1_id = ${user.id} OR user2_id = ${user.id})
  `;
  if (!access) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const requestedId = Number(body.last_read_message_id) || null;

  const [{ latest_message_id: latestMessageId = 0 } = {}] = await sql`
    SELECT COALESCE(MAX(id), 0)::int AS latest_message_id
    FROM chat_messages WHERE direct_chat_id = ${chatId}
  `;
  const lastReadMessageId = requestedId
    ? Math.min(requestedId, latestMessageId || requestedId)
    : latestMessageId;

  await sql`
    INSERT INTO direct_chat_reads (direct_chat_id, user_id, last_read_message_id, updated_at)
    VALUES (${chatId}, ${user.id}, ${lastReadMessageId || null}, NOW())
    ON CONFLICT (direct_chat_id, user_id) DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      updated_at           = EXCLUDED.updated_at
  `;

  const [{ unread_count: unreadCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM chat_messages
    WHERE direct_chat_id = ${chatId}
      AND user_id <> ${user.id}
      AND id > ${lastReadMessageId || 0}
  `;

  return NextResponse.json({ ok: true, unread_count: unreadCount });
}
