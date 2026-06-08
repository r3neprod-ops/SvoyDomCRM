import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { addLeadEvent } from '@/lib/admin/leadEvents';
import { logActivity } from '@/lib/admin/activityLog';
import { canManageLeads } from '@/lib/admin/roles';
import { sendPushToUser } from '@/lib/admin/push';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

const CALL_RESULT_LABELS = {
  no_answer: 'Не дозвонился',
  callback: 'Перезвонить',
};

function normalizeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 30;
  return Math.min(10080, Math.max(5, Math.round(minutes)));
}

function normalizeNote(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function formatLeadTitle(lead) {
  return `${lead.name || `Лид #${lead.id}`}${lead.phone ? `, ${lead.phone}` : ''}`;
}

export async function POST(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const body = await request.json().catch(() => ({}));
  const result = CALL_RESULT_LABELS[body.result] ? body.result : 'callback';
  const minutes = normalizeMinutes(body.minutes);
  const note = normalizeNote(body.note);
  const callbackAt = new Date(Date.now() + minutes * 60 * 1000);

  const [lead] = await sql`
    SELECT l.id, l.name, l.phone, l.status, l.assigned_to, u.name AS assigned_to_name
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.id = ${id}
      AND l.company_id = ${companyId}
  `;
  if (!lead) return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });

  const canWorkWithLead = canManageLeads(user) || lead.assigned_to === user.id;
  if (!canWorkWithLead) return NextResponse.json({ ok: false }, { status: 403 });
  if (!lead.assigned_to) {
    return NextResponse.json({ ok: false, message: 'Сначала назначьте ответственного' }, { status: 400 });
  }

  const resultLabel = CALL_RESULT_LABELS[result];
  const callbackLabel = callbackAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const message = `${resultLabel}. Перезвонить: ${callbackLabel}${note ? `. ${note}` : ''}`;

  const [updated] = await sql`
    UPDATE leads
    SET
      callback_at = ${callbackAt.toISOString()},
      callback_note = ${note || null},
      last_call_result = ${result},
      last_call_at = NOW()
    WHERE id = ${id}
      AND company_id = ${companyId}
    RETURNING id, callback_at, callback_note, last_call_result, last_call_at
  `;

  const event = await addLeadEvent(sql, {
    leadId: id,
    userId: user.id,
    companyId,
    type: result === 'no_answer' ? 'call_no_answer' : 'callback_scheduled',
    message,
    meta: {
      result,
      minutes,
      callback_at: updated.callback_at,
      assigned_to: lead.assigned_to,
      assigned_to_name: lead.assigned_to_name,
      note: note || null,
    },
  });

  await logActivity({
    userId: user.id,
    action: result === 'no_answer' ? 'lead_call_no_answer' : 'lead_callback_scheduled',
    entityType: 'lead',
    entityId: id,
    companyId,
    message: `${user.name || user.username}: ${message}`,
    meta: {
      result,
      minutes,
      callback_at: updated.callback_at,
      assigned_to: lead.assigned_to,
      note: note || null,
    },
  });

  if (lead.assigned_to !== user.id) {
    try {
      await sendPushToUser({
        userId: lead.assigned_to,
        title: `Перезвон по лиду: ${formatLeadTitle(lead)}`,
        body: message,
        url: '/admin/dashboard',
        companyId,
        tag: `svoydom-crm-callback-${id}-${Date.now()}`,
        type: 'lead_callback',
      });
    } catch (pushError) {
      console.error('Lead callback push notification error:', pushError);
    }
  }

  revalidateTag('leads');
  return NextResponse.json({ ok: true, lead: updated, event: event?.[0] || null });
}
