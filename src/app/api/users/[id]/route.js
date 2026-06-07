import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam, normalizeRole } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';

const ACTIVE_LEAD_STATUSES = ['new', 'in_progress', 'meeting', 'documents', 'deal'];

export async function DELETE(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  if (id === user.id) {
    return NextResponse.json({ ok: false, message: 'Нельзя удалить себя' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [target] = await sql`SELECT id, name, username, role FROM users WHERE id = ${id}`;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  if (target.role === 'owner') {
    return NextResponse.json({ ok: false, message: 'Нельзя удалить владельца' }, { status: 400 });
  }

  try {
    const [result] = await sql.begin(async (tx) => {
      const reassignedLeads = await tx`
        UPDATE leads
        SET
          assigned_to = NULL,
          status = CASE WHEN status = ANY(${ACTIVE_LEAD_STATUSES}) THEN 'new' ELSE status END
        WHERE assigned_to = ${id}
        RETURNING id
      `;
      await tx`UPDATE comments SET user_id = NULL WHERE user_id = ${id}`;
      await tx`UPDATE lead_events SET user_id = NULL WHERE user_id = ${id}`;
      await tx`UPDATE chat_messages SET user_id = NULL WHERE user_id = ${id}`;
      await tx`UPDATE chat_rooms SET created_by = NULL WHERE created_by = ${id}`;
      await tx`DELETE FROM push_subscriptions WHERE user_id = ${id}`;
      await tx`DELETE FROM message_reactions WHERE user_id = ${id}`;
      await tx`DELETE FROM users WHERE id = ${id}`;
      return [{ reassigned_leads: reassignedLeads.length }];
    });

    await logActivity({
      userId: user.id,
      action: 'user_deleted',
      entityType: 'user',
      entityId: target.id,
      message: `${user.name || user.username} удалил пользователя ${target.name}`,
      meta: { username: target.username, role: target.role, reassigned_leads: result.reassigned_leads },
    });

    revalidateTag('leads');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[User delete] Failed:', err);
    return NextResponse.json({
      ok: false,
      message: 'Не удалось удалить сотрудника. Сервер вернул ошибку, детали записаны в логи.',
      detail: err?.message || 'unknown error',
    }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json();
  const name = body.name?.trim();
  const role = body.role ? normalizeRole(body.role, 'agent') : null;
  if (!name) return NextResponse.json({ ok: false, message: 'Имя обязательно' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [target] = await sql`SELECT id, name, username, role FROM users WHERE id = ${id}`;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  if (target.role === 'owner' && user.role !== 'owner') {
    return NextResponse.json({ ok: false, message: 'Владельца может менять только владелец' }, { status: 403 });
  }
  if (target.role === 'owner' && role && role !== 'owner') {
    return NextResponse.json({ ok: false, message: 'Нельзя понизить владельца' }, { status: 400 });
  }

  const [updated] = role
    ? await sql`
        UPDATE users
        SET name = ${name}, role = ${role}
        WHERE id = ${id}
        RETURNING id, username, name, role, is_active
      `
    : await sql`
        UPDATE users
        SET name = ${name}
        WHERE id = ${id}
        RETURNING id, username, name, role, is_active
      `;

  await logActivity({
    userId: user.id,
    action: 'user_updated',
    entityType: 'user',
    entityId: updated.id,
    message: `${user.name || user.username} обновил пользователя ${updated.name}`,
    meta: { from: { name: target.name, role: target.role }, to: { name: updated.name, role: updated.role } },
  });

  return NextResponse.json({ ok: true, user: updated });
}
