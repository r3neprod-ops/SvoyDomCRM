import { NextResponse } from 'next/server';
import { getCurrentUserContext } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { canManageTeam, normalizeRole } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';

export async function PATCH(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return NextResponse.json({ ok: false }, { status: 428 });
  if (!canManageTeam(context.user)) return NextResponse.json({ ok: false }, { status: 403 });

  const requestId = Number(params.id);
  if (!requestId) return NextResponse.json({ ok: false }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const action = body.action === 'reject' ? 'reject' : 'approve';
  const role = normalizeRole(body.role, 'agent');

  await ensureSchema();
  const sql = getSql();
  const [joinRequest] = await sql`
    SELECT r.id, r.user_id, r.company_id, r.status, u.name, u.username
    FROM company_join_requests r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ${requestId}
      AND r.company_id = ${context.companyId}
    LIMIT 1
  `;
  if (!joinRequest) return NextResponse.json({ ok: false, message: 'Заявка не найдена' }, { status: 404 });
  if (joinRequest.status !== 'pending') {
    return NextResponse.json({ ok: false, message: 'Заявка уже обработана' }, { status: 409 });
  }

  if (action === 'reject') {
    await sql`
      UPDATE company_join_requests
      SET status = 'rejected', updated_at = NOW()
      WHERE id = ${requestId}
    `;
    await logActivity({
      userId: context.user.id,
      companyId: context.companyId,
      action: 'company_join_rejected',
      entityType: 'user',
      entityId: joinRequest.user_id,
      message: `${context.user.name || context.user.username} отклонил заявку @${joinRequest.username}`,
    });
    return NextResponse.json({ ok: true });
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO company_members (company_id, user_id, role, status)
      VALUES (${context.companyId}, ${joinRequest.user_id}, ${role}, 'active')
      ON CONFLICT (company_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()
    `;
    await tx`
      UPDATE company_join_requests
      SET status = 'approved', updated_at = NOW()
      WHERE id = ${requestId}
    `;
    await tx`
      UPDATE users
      SET active_company_id = ${context.companyId}
      WHERE id = ${joinRequest.user_id}
        AND active_company_id IS NULL
    `;
  });

  await logActivity({
    userId: context.user.id,
    companyId: context.companyId,
    action: 'company_join_approved',
    entityType: 'user',
    entityId: joinRequest.user_id,
    message: `${context.user.name || context.user.username} принял @${joinRequest.username} в компанию`,
    meta: { role },
  });

  return NextResponse.json({ ok: true });
}
