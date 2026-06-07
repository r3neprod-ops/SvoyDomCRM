import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { canManageTeam, normalizeRole } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canManageTeam(user)) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await request.json();
  const username = body.username?.trim();
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
  const [created] = await sql`
    INSERT INTO users (username, password_hash, role, name)
    VALUES (${username}, ${passwordHash}, ${role}, ${name})
    RETURNING id, username, name, role, is_active
  `;

  await logActivity({
    userId: user.id,
    action: 'user_created',
    entityType: 'user',
    entityId: created.id,
    message: `${user.name || user.username} добавил пользователя ${created.name}`,
    meta: { username: created.username, role: created.role },
  });

  return NextResponse.json({ ok: true, user: created }, { status: 201 });
}
