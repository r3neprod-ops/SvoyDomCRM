import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { createChatStream } from '@/lib/admin/chatStream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function checkAccess(sql, userId, chatId) {
  const [row] = await sql`
    SELECT id FROM direct_chats
    WHERE id = ${chatId} AND (user1_id = ${userId} OR user2_id = ${userId})
  `;
  return !!row;
}

export async function GET(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const chatId = Number(params.id);
  if (!chatId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  if (!await checkAccess(sql, user.id, chatId)) return NextResponse.json({ ok: false }, { status: 403 });

  const { searchParams } = new URL(request.url);
  return createChatStream({
    request,
    initialAfter: searchParams.get('after'),
    getMaxId: async () => {
      const [{ max_id: maxId = 0 } = {}] = await sql`
        SELECT COALESCE(MAX(id), 0)::int AS max_id
        FROM chat_messages
        WHERE direct_chat_id = ${chatId}
      `;
      return maxId;
    },
  });
}
