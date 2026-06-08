import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { signToken } from '@/lib/admin/auth';
import { logActivity } from '@/lib/admin/activityLog';

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
      SELECT *
      FROM users
      WHERE lower(username) = ${normalizedLogin}
      LIMIT 1
    `;

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ ok: false, message: 'Неверный логин/@никнейм или пароль' }, { status: 401 });
    }

    const token = await signToken({ id: user.id, role: user.role, name: user.name, username: user.username });
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
    await logActivity({
      userId: user.id,
      action: 'user_login',
      entityType: 'user',
      entityId: user.id,
      message: `${user.name || user.username} вошел в CRM`,
      meta: { method: 'password' },
    });

    const response = NextResponse.json({ ok: true, role: user.role, name: user.name });
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ ok: false, message: 'Ошибка сервера' }, { status: 500 });
  }
}
