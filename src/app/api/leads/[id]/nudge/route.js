import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { addLeadEvent } from '@/lib/admin/leadEvents';
import { sendPushToUser } from '@/lib/admin/push';

const DEFAULT_NUDGE_TEXT = 'Пожалуйста, свяжитесь с клиентом и обновите статус или комментарий в CRM.';

function normalizeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 1000);
}

async function getOrCreateDirectChat(sql, userId, otherUserId) {
  const user1 = Math.min(userId, otherUserId);
  const user2 = Math.max(userId, otherUserId);

  const [chat] = await sql`
    INSERT INTO direct_chats (user1_id, user2_id)
    VALUES (${user1}, ${user2})
    ON CONFLICT (user1_id, user2_id) DO UPDATE SET created_at = direct_chats.created_at
    RETURNING id
  `;

  return chat.id;
}

export async function POST(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));

  const customText = normalizeText(body.message);
  const nudgeText = customText || DEFAULT_NUDGE_TEXT;

  const [lead] = await sql`
    SELECT l.id, l.name, l.phone, l.status, l.assigned_to, u.name AS assigned_to_name
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.id = ${id}
  `;

  if (!lead) {
    return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });
  }

  if (!lead.assigned_to) {
    return NextResponse.json({ ok: false, message: 'Сначала назначьте ответственного сотрудника' }, { status: 400 });
  }

  const leadTitle = `${lead.name || `Заявка #${lead.id}`}${lead.phone ? `, ${lead.phone}` : ''}`;
  const messageText = [
    `Напоминание по заявке: ${leadTitle}`,
    nudgeText,
  ].join('\n\n');

  const chatId = await getOrCreateDirectChat(sql, user.id, lead.assigned_to);
  const [message] = await sql`
    INSERT INTO chat_messages (user_id, direct_chat_id, text, media_type)
    VALUES (${user.id}, ${chatId}, ${messageText}, 'text')
    RETURNING id, text, created_at
  `;

  const [event] = await addLeadEvent(sql, {
    leadId: id,
    userId: user.id,
    type: 'nudge',
    message: `Напоминание ответственному: ${lead.assigned_to_name || `#${lead.assigned_to}`}. ${nudgeText}`,
    meta: {
      assigned_to: lead.assigned_to,
      default_used: !customText,
      direct_chat_id: chatId,
      message_id: message.id,
    },
  });

  let pushResult = null;
  try {
    pushResult = await sendPushToUser({
      userId: lead.assigned_to,
      title: `Напоминание по заявке: ${lead.name || `#${lead.id}`}`,
      body: nudgeText,
      url: '/admin/dashboard',
      tag: `svoydom-crm-lead-nudge-${id}-${message.id}`,
      type: 'lead_nudge',
    });
  } catch (pushError) {
    console.error('Lead nudge push notification error:', pushError);
  }

  return NextResponse.json({
    ok: true,
    chat_id: chatId,
    message,
    event,
    push: pushResult,
  });
}
