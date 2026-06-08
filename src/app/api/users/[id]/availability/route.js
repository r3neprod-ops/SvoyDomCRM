import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

export async function PATCH(request, { params }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  const body = await request.json();
  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json({ ok: false, message: 'is_active must be boolean' }, { status: 400 });
  }

  const [target] = await sql`
    SELECT u.id, u.name, u.username, cm.role
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${companyId}
      AND cm.user_id = ${id}
      AND cm.role <> 'owner'
    LIMIT 1
  `;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });

  await sql`
    UPDATE company_members
    SET status = ${body.is_active ? 'active' : 'paused'}, updated_at = NOW()
    WHERE company_id = ${companyId}
      AND user_id = ${id}
  `;

  await logActivity({
    userId: user.id,
    companyId,
    action: body.is_active ? 'user_activated' : 'user_deactivated',
    entityType: 'user',
    entityId: target.id,
    message: `${user.name || user.username} ${body.is_active ? 'включил' : 'выключил'} пользователя ${target.name}`,
    meta: { username: target.username, role: target.role },
  });
  revalidateTag('leads');

  return NextResponse.json({ ok: true });
}
