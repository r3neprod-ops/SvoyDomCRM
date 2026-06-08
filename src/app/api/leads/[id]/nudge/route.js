import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { addLeadEvent } from '@/lib/admin/leadEvents';
import { sendPushToUser } from '@/lib/admin/push';
import { canManageLeads } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

const DEFAULT_NUDGE_TEXT = 'Пожалуйста, свяжитесь с клиентом и обновите статус или комментарий в CRM.';

function normalizeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 1000);
}

async function getOrCreateDirectChat(sql, userId, otherUserId, companyId) {
  const user1 = Math.min(userId, otherUserId);
  const user2 = Math.max(userId, otherUserId);

  const [chat] = await sql`
    INSERT INTO direct_chats (company_id, user1_id, user2_id)
    VALUES (${companyId}, ${user1}, ${user2})
    ON CONFLICT (company_id, user1_id, user2_id) DO UPDATE SET created_at = direct_chats.created_at
    RETURNING id
  `;

  return chat.id;
}

export async function POST(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;
  if (!canManageLeads(user)) return NextResponse.json({ ok: false }, { status: 403 });

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
      AND l.company_id = ${companyId}
  `;

  if (!lead) {
    return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });
  }

  if (!lead.assigned_to) {
    return NextResponse.json({ ok: false, message: 'Сначала назначьте ответственного сотрудника' }, { status: 400 });
  }

  if (lead.assigned_to === user.id) {
    return NextResponse.json({ ok: false, message: 'Лид назначен на вас. Напоминание самому себе не отправляется.' }, { status: 400 });
  }

  const leadTitle = `${lead.name || `Заявка #${lead.id}`}${lead.phone ? `, ${lead.phone}` : ''}`;
  const messageText = [
    `Напоминание по заявке: ${leadTitle}`,
    nudgeText,
  ].join('\n\n');

  const chatId = await getOrCreateDirectChat(sql, user.id, lead.assigned_to, companyId);
  const [message] = await sql`
    INSERT INTO chat_messages (user_id, company_id, direct_chat_id, text, media_type)
    VALUES (${user.id}, ${companyId}, ${chatId}, ${messageText}, 'text')
    RETURNING id, text, created_at
  `;

  const [event] = await addLeadEvent(sql, {
    leadId: id,
    userId: user.id,
    companyId,
    type: 'nudge',
    message: `Напоминание ответственному: ${lead.assigned_to_name || `#${lead.assigned_to}`}. ${nudgeText}`,
    meta: {
      assigned_to: lead.assigned_to,
      default_used: !customText,
      direct_chat_id: chatId,
      message_id: message.id,
    },
  });
  await logActivity({
    userId: user.id,
    action: 'lead_nudge_sent',
    entityType: 'lead',
    entityId: id,
    companyId,
    message: `${user.name || user.username} отправил напоминание ответственному по лиду #${id}`,
    meta: { assigned_to: lead.assigned_to, default_used: !customText, text: nudgeText.slice(0, 240) },
  });

  let pushResult = null;
  try {
    pushResult = await sendPushToUser({
      userId: lead.assigned_to,
      title: `Напоминание по заявке: ${lead.name || `#${lead.id}`}`,
      body: nudgeText,
      url: '/admin/dashboard',
      companyId,
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
