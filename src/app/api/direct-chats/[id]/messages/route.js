import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { sendPushToUser } from '@/lib/admin/push';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

async function checkAccess(sql, userId, chatId, companyId) {
  const [row] = await sql`
    SELECT id FROM direct_chats
    WHERE id = ${chatId}
      AND company_id = ${companyId}
      AND (user1_id = ${userId} OR user2_id = ${userId})
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
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  const chatId = Number(params.id);
  if (!chatId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  if (!await checkAccess(sql, user.id, chatId, companyId)) {
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
      WHERE cm.direct_chat_id = ${chatId}
        AND cm.company_id = ${companyId}
      ORDER BY cm.created_at DESC
      LIMIT ${limit}
    ) latest
    ORDER BY created_at ASC
  `;

  const [readRow] = await sql`
    SELECT last_read_message_id FROM direct_chat_reads
    WHERE direct_chat_id = ${chatId} AND user_id = ${user.id}
  `;
  const lastReadMessageId = readRow?.last_read_message_id || 0;

  const [{ unread_count: unreadCount = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS unread_count FROM chat_messages
    WHERE direct_chat_id = ${chatId}
      AND company_id = ${companyId}
      AND user_id <> ${user.id} AND id > ${lastReadMessageId}
  `;

  const otherReads = await sql`
    SELECT dcr.user_id, COALESCE(dcr.last_read_message_id, 0)::int AS last_read, u.name
    FROM direct_chat_reads dcr
    JOIN users u ON u.id = dcr.user_id
    WHERE dcr.direct_chat_id = ${chatId} AND dcr.user_id <> ${user.id}
  `;

  const msgIds = messages.map((m) => m.id);
  const reactionsMap = await buildReactionsMap(sql, msgIds, user.id);

  const messagesOut = messages.map((msg) => ({
    ...msg,
    reply_to: msg.reply_to_id ? { id: msg.reply_to_id, text: msg.reply_to_text, author_name: msg.reply_to_author } : null,
    reactions: reactionsMap[msg.id] || [],
    readers: otherReads
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
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  const chatId = Number(params.id);
  if (!chatId) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  if (!await checkAccess(sql, user.id, chatId, companyId)) {
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
      WHERE cm.id = ${replyToId}
        AND cm.company_id = ${companyId}
        AND cm.direct_chat_id = ${chatId}
    `;
    if (ref) { replyToText = ref.text; replyToAuthor = ref.author_name; }
  }

  const [message] = await sql`
    INSERT INTO chat_messages (user_id, company_id, direct_chat_id, text, media_type, reply_to_id, reply_to_text, reply_to_author)
    VALUES (${user.id}, ${companyId}, ${chatId}, ${text}, 'text', ${replyToId}, ${replyToText}, ${replyToAuthor})
    RETURNING id, text, media_url, media_type, media_mime, media_size, media_name,
              reply_to_id, reply_to_text, reply_to_author, created_at
  `;

  const [chatRow] = await sql`SELECT user1_id, user2_id FROM direct_chats WHERE id = ${chatId} AND company_id = ${companyId}`;
  const otherId = chatRow.user1_id === user.id ? chatRow.user2_id : chatRow.user1_id;
  try {
    await sendPushToUser({
      userId: otherId,
      title: `Личное от ${user.name}`,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      url: '/admin/dashboard',
      companyId,
      tag: `svoydom-crm-dm-${message.id}`,
      type: 'direct_chat',
    });
  } catch (pushError) {
    console.error('Direct chat push notification error:', pushError);
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
