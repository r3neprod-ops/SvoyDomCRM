import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';

export async function PATCH(request, { params }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
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
    UPDATE users
    SET is_active = ${body.is_active}
    WHERE id = ${id} AND role <> 'owner'
    RETURNING id, name, username, role, is_active
  `;
  if (!target) return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  await logActivity({
    userId: user.id,
    action: body.is_active ? 'user_activated' : 'user_deactivated',
    entityType: 'user',
    entityId: target.id,
    message: `${user.name || user.username} ${body.is_active ? 'включил' : 'выключил'} пользователя ${target.name}`,
    meta: { username: target.username, role: target.role },
  });
  revalidateTag('leads');

  return NextResponse.json({ ok: true });
}
