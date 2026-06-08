import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam, normalizeRole } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';
import { getCurrentUserContext, normalizeUsername, onboardingResponse } from '@/lib/admin/company';

export async function POST(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await request.json();
  const username = normalizeUsername(body.username);
  const name = body.name?.trim();
  const role = normalizeRole(body.role, 'agent');
  const { password } = body;

  if (!username || !password || !name) {
    return NextResponse.json({ ok: false, message: 'Все поля обязательны' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ ok: false, message: 'Пароль минимум 4 символа' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  const [existing] = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (existing) {
    return NextResponse.json({ ok: false, message: 'Логин уже занят' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await sql.begin(async (tx) => {
    const [newUser] = await tx`
      INSERT INTO users (username, password_hash, role, name, profile_completed, active_company_id)
      VALUES (${username}, ${passwordHash}, ${role}, ${name}, true, ${companyId})
      RETURNING id, username, name, role, is_active
    `;
    await tx`
      INSERT INTO company_members (company_id, user_id, role, status)
      VALUES (${companyId}, ${newUser.id}, ${role}, 'active')
      ON CONFLICT (company_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()
    `;
    return [newUser];
  });

  await logActivity({
    userId: user.id,
    action: 'user_created',
    entityType: 'user',
    entityId: created.id,
    companyId,
    message: `${user.name || user.username} добавил пользователя ${created.name}`,
    meta: { username: created.username, role: created.role },
  });

  return NextResponse.json({ ok: true, user: created }, { status: 201 });
}
