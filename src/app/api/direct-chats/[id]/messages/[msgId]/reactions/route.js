import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

const ALLOWED = new Set(['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏']);

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const chatId = Number(params.id);
  const msgId  = Number(params.msgId);
  if (!chatId || !msgId) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const emoji = body.emoji;
  if (!emoji || !ALLOWED.has(emoji)) {
    return NextResponse.json({ ok: false, message: 'Некорректный эмодзи' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [access] = await sql`
    SELECT id FROM direct_chats WHERE id = ${chatId} AND (user1_id = ${user.id} OR user2_id = ${user.id})
  `;
  if (!access) return NextResponse.json({ ok: false }, { status: 403 });

  const [msg] = await sql`
    SELECT id FROM chat_messages WHERE id = ${msgId} AND direct_chat_id = ${chatId}
  `;
  if (!msg) return NextResponse.json({ ok: false }, { status: 404 });

  const [existing] = await sql`
    SELECT id FROM message_reactions WHERE message_id = ${msgId} AND user_id = ${user.id} AND emoji = ${emoji}
  `;
  if (existing) {
    await sql`DELETE FROM message_reactions WHERE message_id = ${msgId} AND user_id = ${user.id} AND emoji = ${emoji}`;
  } else {
    await sql`
      INSERT INTO message_reactions (message_id, user_id, emoji)
      VALUES (${msgId}, ${user.id}, ${emoji})
      ON CONFLICT DO NOTHING
    `;
  }

  const rows = await sql`
    SELECT emoji, COUNT(*)::int AS count, bool_or(user_id = ${user.id}) AS has_mine
    FROM message_reactions WHERE message_id = ${msgId}
    GROUP BY emoji ORDER BY count DESC
  `;

  return NextResponse.json({ ok: true, reactions: rows });
}
