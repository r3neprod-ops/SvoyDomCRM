import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { addLeadEvent } from '@/lib/admin/leadEvents';

const STATUS_LABELS = { new: 'Новый', in_progress: 'В работе', closed: 'Закрыт' };

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [lead] = await sql`SELECT * FROM leads WHERE id = ${id}`;
  if (!lead) return NextResponse.json({ ok: false, message: 'Лид не найден' }, { status: 404 });

  const body = await request.json();
  const updates = {};
  let isClaiming = false;

  if (user.role === 'admin') {
    if (body.status !== undefined) updates.status = body.status;
    if (body.assigned_to !== undefined) {
      const newAssignee = body.assigned_to === null || body.assigned_to === ''
        ? null
        : Number(body.assigned_to);
      updates.assigned_to = newAssignee;
      if (body.status === undefined) {
        updates.status = newAssignee !== null ? 'in_progress' : 'new';
      }
    }
  } else {
    if (body.assigned_to !== undefined) {
      if (Number(body.assigned_to) !== user.id) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
      if (lead.assigned_to !== null) {
        return NextResponse.json({ ok: false, message: 'Лид уже назначен' }, { status: 409 });
      }
      updates.assigned_to = user.id;
      updates.status = 'in_progress';
      isClaiming = true;
    } else if (body.status !== undefined) {
      if (body.status === 'in_progress' && lead.assigned_to === null) {
        updates.assigned_to = user.id;
        updates.status = 'in_progress';
        isClaiming = true;
      } else {
        if (lead.assigned_to !== user.id) {
          return NextResponse.json({ ok: false }, { status: 403 });
        }
        updates.status = body.status;
      }
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ ok: false, message: 'Нет данных для обновления' }, { status: 400 });
  }

  const oldStatus = lead.status;
  const oldAssignee = lead.assigned_to;

  if (isClaiming) {
    const [updated] = await sql`
      UPDATE leads SET ${sql(updates)}
      WHERE id = ${id} AND assigned_to IS NULL
      RETURNING id
    `;
    if (!updated) {
      return NextResponse.json({ ok: false, message: 'Лид уже назначен' }, { status: 409 });
    }
    await sql`
      UPDATE users SET
        leads_count = leads_count + 1,
        last_assigned_at = NOW()
      WHERE id = ${user.id}
    `;
  } else {
    await sql`UPDATE leads SET ${sql(updates)} WHERE id = ${id}`;
  }

  const [freshLead] = await sql`
    SELECT l.status, l.assigned_to, u.name AS assigned_to_name
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.id = ${id}
  `;

  if (updates.assigned_to !== undefined && oldAssignee !== freshLead.assigned_to) {
    await addLeadEvent(sql, {
      leadId: id,
      userId: user.id,
      type: freshLead.assigned_to ? 'assigned' : 'unassigned',
      message: freshLead.assigned_to
        ? `Назначен ответственный: ${freshLead.assigned_to_name || `#${freshLead.assigned_to}`}`
        : 'Ответственный снят',
      meta: { from: oldAssignee, to: freshLead.assigned_to },
    });
  }
  if (updates.status !== undefined && oldStatus !== freshLead.status) {
    await addLeadEvent(sql, {
      leadId: id,
      userId: user.id,
      type: 'status_changed',
      message: `Статус: ${STATUS_LABELS[oldStatus] || oldStatus} → ${STATUS_LABELS[freshLead.status] || freshLead.status}`,
      meta: { from: oldStatus, to: freshLead.status },
    });
  }
  revalidateTag('leads');

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM leads WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
