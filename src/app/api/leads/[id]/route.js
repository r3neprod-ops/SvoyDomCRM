import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { addLeadEvent } from '@/lib/admin/leadEvents';
import { sendPushToAll } from '@/lib/admin/push';
import { canManageLeads } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

const STATUS_LABELS = {
  new: 'Новый',
  in_progress: 'В работе',
  meeting: 'Встреча',
  documents: 'Документы',
  deal: 'Сделка',
  closed_won: 'Закрыт успешно',
  closed_lost: 'Отказ / сорвался',
  closed: 'Закрыт успешно',
};
const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));

function normalizeAssignee(value) {
  if (value === null || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function getActiveEmployee(sql, id, companyId) {
  if (!id) return null;
  const [employee] = await sql`
    SELECT u.id, u.name
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${companyId}
      AND cm.user_id = ${id}
      AND cm.status = 'active'
      AND cm.role IN ('admin', 'manager', 'agent', 'employee')
      AND is_active = true
  `;
  return employee || null;
}

async function runManualLeadAssignment(sql, { id, companyId, updates, user, wantsAssignee }) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL app.manual_lead_assignment = 'on'`;

    if (!canManageLeads(user) && wantsAssignee) {
      const [claimed] = await tx`
        UPDATE leads SET ${tx(updates)}
        WHERE id = ${id} AND company_id = ${companyId} AND assigned_to IS NULL
        RETURNING id
      `;
      return claimed || null;
    }

    const [changed] = await tx`
      UPDATE leads SET ${tx(updates)}
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id
    `;
    return changed || null;
  });
}

export async function PATCH(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [lead] = await sql`SELECT * FROM leads WHERE id = ${id} AND company_id = ${companyId}`;
  if (!lead) return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });

  const body = await request.json();
  const updates = {};
  const wantsStatus = body.status !== undefined;
  const wantsAssignee = body.assigned_to !== undefined;

  if (canManageLeads(user)) {
    if (wantsStatus) {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ ok: false, message: 'Некорректный статус' }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (wantsAssignee) {
      const newAssignee = normalizeAssignee(body.assigned_to);
      if (Number.isNaN(newAssignee)) {
        return NextResponse.json({ ok: false, message: 'Некорректный сотрудник' }, { status: 400 });
      }
      if (newAssignee !== null && !await getActiveEmployee(sql, newAssignee, companyId)) {
        return NextResponse.json({ ok: false, message: 'Сотрудник не найден или выключен' }, { status: 400 });
      }

      updates.assigned_to = newAssignee;
      if (!wantsStatus) updates.status = newAssignee === null ? 'new' : 'in_progress';
    }
  } else {
    if (wantsAssignee) {
      if (normalizeAssignee(body.assigned_to) !== user.id) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
      if (lead.assigned_to !== null) {
        return NextResponse.json({ ok: false, message: 'Лид уже назначен' }, { status: 409 });
      }
      updates.assigned_to = user.id;
      updates.status = 'in_progress';
    } else if (wantsStatus) {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ ok: false, message: 'Некорректный статус' }, { status: 400 });
      }
      if (lead.assigned_to !== user.id) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
      updates.status = body.status;
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ ok: false, message: 'Нет данных для обновления' }, { status: 400 });
  }

  const oldStatus = lead.status;
  const oldAssignee = lead.assigned_to;

  if (updates.assigned_to !== undefined) {
    const updated = await runManualLeadAssignment(sql, { id, companyId, updates, user, wantsAssignee });
    if (!updated) {
      return NextResponse.json({ ok: false, message: 'Лид уже назначен' }, { status: 409 });
    }
  } else {
    await sql`UPDATE leads SET ${sql(updates)} WHERE id = ${id} AND company_id = ${companyId}`;
  }

  const [freshLead] = await sql`
    SELECT l.status, l.assigned_to, u.name AS assigned_to_name
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.id = ${id} AND l.company_id = ${companyId}
  `;

  if (updates.assigned_to !== undefined && oldAssignee !== freshLead.assigned_to) {
    await addLeadEvent(sql, {
      leadId: id,
      userId: user.id,
      companyId,
      type: freshLead.assigned_to ? 'assigned' : 'unassigned',
      message: freshLead.assigned_to
        ? `Назначен ответственный: ${freshLead.assigned_to_name || `#${freshLead.assigned_to}`}`
        : 'Ответственный снят',
      meta: { from: oldAssignee, to: freshLead.assigned_to },
    });
    await logActivity({
      userId: user.id,
      action: freshLead.assigned_to ? 'lead_assigned' : 'lead_unassigned',
      entityType: 'lead',
      entityId: id,
      companyId,
      message: freshLead.assigned_to
        ? `${user.name || user.username} назначил ответственного: ${freshLead.assigned_to_name || `#${freshLead.assigned_to}`}`
        : `${user.name || user.username} снял ответственного`,
      meta: { from: oldAssignee, to: freshLead.assigned_to },
    });
  }

  if (updates.status !== undefined && oldStatus !== freshLead.status) {
    await addLeadEvent(sql, {
      leadId: id,
      userId: user.id,
      companyId,
      type: 'status_changed',
      message: `Статус: ${STATUS_LABELS[oldStatus] || oldStatus} -> ${STATUS_LABELS[freshLead.status] || freshLead.status}`,
      meta: { from: oldStatus, to: freshLead.status },
    });
    await logActivity({
      userId: user.id,
      action: 'lead_status_changed',
      entityType: 'lead',
      entityId: id,
      companyId,
      message: `${user.name || user.username} изменил статус лида: ${STATUS_LABELS[oldStatus] || oldStatus} -> ${STATUS_LABELS[freshLead.status] || freshLead.status}`,
      meta: { from: oldStatus, to: freshLead.status },
    });
  }

  if (oldAssignee !== freshLead.assigned_to || oldStatus !== freshLead.status) {
    const parts = [];
    if (oldAssignee !== freshLead.assigned_to) {
      parts.push(freshLead.assigned_to ? `назначен: ${freshLead.assigned_to_name || `#${freshLead.assigned_to}`}` : 'ответственный снят');
    }
    if (oldStatus !== freshLead.status) {
      parts.push(`статус: ${STATUS_LABELS[freshLead.status] || freshLead.status}`);
    }

    try {
      await sendPushToAll({
        title: `Лид #${id} изменен`,
        body: `${user.name || 'CRM'}: ${parts.join(', ')}`,
        url: '/admin/dashboard',
        companyId,
        excludeUserId: user.id,
        tag: `svoydom-crm-lead-update-${id}-${Date.now()}`,
        type: 'lead_update',
      });
    } catch (pushError) {
      console.error('Lead update push notification error:', pushError);
    }
  }

  revalidateTag('leads');
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;
  if (!canManageLeads(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  try {
    const [lead] = await sql`SELECT id, name, phone FROM leads WHERE id = ${id} AND company_id = ${companyId}`;
    if (!lead) return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });

    await sql.begin(async (tx) => {
      await tx`DELETE FROM comments WHERE lead_id = ${id} AND company_id = ${companyId}`;
      await tx`DELETE FROM lead_events WHERE lead_id = ${id} AND company_id = ${companyId}`;
      await tx`DELETE FROM leads WHERE id = ${id} AND company_id = ${companyId}`;
    });
    await logActivity({
      userId: user.id,
      action: 'lead_deleted',
      entityType: 'lead',
      entityId: id,
      companyId,
      message: `${user.name || user.username} удалил лид${lead.name ? `: ${lead.name}` : ''}${lead.phone ? `, ${lead.phone}` : ''}`,
      meta: { name: lead.name, phone: lead.phone },
    });
    try {
      await sendPushToAll({
        title: `Лид #${id} удален`,
        body: `${user.name || 'CRM'} удалил лид${lead.name ? `: ${lead.name}` : ''}${lead.phone ? `, ${lead.phone}` : ''}`,
        url: '/admin/dashboard',
        companyId,
        excludeUserId: user.id,
        tag: `svoydom-crm-lead-delete-${id}-${Date.now()}`,
        type: 'lead_delete',
      });
    } catch (pushError) {
      console.error('Lead delete push notification error:', pushError);
    }
    revalidateTag('leads');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Lead delete] Failed:', err);
    return NextResponse.json({
      ok: false,
      message: 'Не удалось удалить лид. Сервер вернул ошибку, детали записаны в логи.',
      detail: err?.message || 'unknown error',
    }, { status: 500 });
  }
}
