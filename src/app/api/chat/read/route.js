import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

async function getUnreadState(sql, userId) {
  const [{ latest_message_id: latestMessageId = 0 } = {}] = await sql`
    SELECT COALESCE(MAX(id), 0)::int AS latest_message_id
    FROM chat_messages
  `;
  const [{ last_read_message_id: lastReadMessageId = 0 } = {}] = await sql`
    SELECT last_read_message_id
    FROM chat_reads
    WHERE user_id = ${userId}
  `;
  const [{ unread_count: unreadCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM chat_messages
    WHERE user_id <> ${userId}
      AND id > ${lastReadMessageId || 0}
  `;

  return {
    latest_message_id: latestMessageId || 0,
    last_read_message_id: lastReadMessageId || 0,
    unread_count: unreadCount || 0,
  };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  return NextResponse.json({ ok: true, ...(await getUnreadState(sql, user.id)) });
}

export async function PATCH(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const requestedId = Number(body.last_read_message_id) || null;
  const [{ latest_message_id: latestMessageId = 0 } = {}] = await sql`
    SELECT COALESCE(MAX(id), 0)::int AS latest_message_id
    FROM chat_messages
  `;
  const lastReadMessageId = requestedId ? Math.min(requestedId, latestMessageId || requestedId) : latestMessageId;

  await sql`
    INSERT INTO chat_reads (user_id, last_read_message_id, updated_at)
    VALUES (${user.id}, ${lastReadMessageId || null}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      updated_at = EXCLUDED.updated_at
  `;

  return NextResponse.json({ ok: true, ...(await getUnreadState(sql, user.id)) });
}
