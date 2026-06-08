import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam, normalizeRole } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

const ACTIVE_LEAD_STATUSES = ['new', 'in_progress', 'meeting', 'documents', 'deal'];

export async function DELETE(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  if (id === user.id) {
    return NextResponse.json({ ok: false, message: 'Нельзя удалить себя' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [target] = await sql`
    SELECT u.id, u.name, u.username, cm.role
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${companyId}
      AND cm.user_id = ${id}
      AND cm.status = 'active'
    LIMIT 1
  `;
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
          AND company_id = ${companyId}
        RETURNING id
      `;
      await tx`UPDATE comments SET user_id = NULL WHERE user_id = ${id} AND company_id = ${companyId}`;
      await tx`UPDATE lead_events SET user_id = NULL WHERE user_id = ${id} AND company_id = ${companyId}`;
      await tx`UPDATE chat_messages SET user_id = NULL WHERE user_id = ${id} AND company_id = ${companyId}`;
      await tx`UPDATE chat_rooms SET created_by = NULL WHERE created_by = ${id} AND company_id = ${companyId}`;
      await tx`DELETE FROM push_subscriptions WHERE user_id = ${id} AND company_id = ${companyId}`;
      await tx`
        UPDATE company_members
        SET status = 'removed', updated_at = NOW()
        WHERE company_id = ${companyId}
          AND user_id = ${id}
      `;
      await tx`
        UPDATE users
        SET active_company_id = NULL
        WHERE id = ${id}
          AND active_company_id = ${companyId}
      `;
      return [{ reassigned_leads: reassignedLeads.length }];
    });

    await logActivity({
      userId: user.id,
      action: 'user_deleted',
      entityType: 'user',
      entityId: target.id,
      companyId,
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
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json();
  const name = body.name?.trim();
  const role = body.role ? normalizeRole(body.role, 'agent') : null;
  if (!name) return NextResponse.json({ ok: false, message: 'Имя обязательно' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [target] = await sql`
    SELECT u.id, u.name, u.username, cm.role
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${companyId}
      AND cm.user_id = ${id}
      AND cm.status = 'active'
    LIMIT 1
  `;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  if (target.role === 'owner' && user.role !== 'owner') {
    return NextResponse.json({ ok: false, message: 'Владельца может менять только владелец' }, { status: 403 });
  }
  if (target.role === 'owner' && role && role !== 'owner') {
    return NextResponse.json({ ok: false, message: 'Нельзя понизить владельца' }, { status: 400 });
  }

  const [updated] = role
    ? await sql.begin(async (tx) => {
        const [updatedUser] = await tx`
        UPDATE users
        SET name = ${name}
        WHERE id = ${id}
        RETURNING id, username, name, role, is_active
        `;
        await tx`
          UPDATE company_members
          SET role = ${role}, updated_at = NOW()
          WHERE company_id = ${companyId}
            AND user_id = ${id}
        `;
        return [{ ...updatedUser, role }];
      })
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
    companyId,
    message: `${user.name || user.username} обновил пользователя ${updated.name}`,
    meta: { from: { name: target.name, role: target.role }, to: { name: updated.name, role: updated.role } },
  });

  return NextResponse.json({ ok: true, user: updated });
}
