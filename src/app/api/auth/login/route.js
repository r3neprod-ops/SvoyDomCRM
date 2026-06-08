import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { logActivity } from '@/lib/admin/activityLog';
import { setAuthCookie } from '@/lib/admin/company';

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const login = String(username || '').trim();
    const normalizedLogin = login.replace(/^@+/, '').toLowerCase();
    if (!login || !password) {
      return NextResponse.json({ ok: false, message: 'Укажите логин или @никнейм и пароль' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();
    const [user] = await sql`
      SELECT u.*, COALESCE(cm.role, u.role) AS session_role
      FROM users u
      LEFT JOIN company_members cm
        ON cm.user_id = u.id
       AND cm.company_id = u.active_company_id
       AND cm.status = 'active'
      WHERE lower(u.username) = ${normalizedLogin}
         OR lower(u.email) = ${normalizedLogin}
      LIMIT 1
    `;

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ ok: false, message: 'Неверный логин/@никнейм или пароль' }, { status: 401 });
    }

    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
    await logActivity({
      userId: user.id,
      action: 'user_login',
      entityType: 'user',
      entityId: user.id,
      message: `${user.name || user.username} вошел в CRM`,
      meta: { method: 'password' },
    });

    const redirectTo = user.profile_completed && user.active_company_id ? '/admin/dashboard' : '/admin/onboarding';
    const response = NextResponse.json({ ok: true, role: user.session_role || user.role, name: user.name, redirectTo });
    await setAuthCookie(response, user.id);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ ok: false, message: 'Ошибка сервера' }, { status: 500 });
  }
}
