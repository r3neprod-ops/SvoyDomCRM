import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSql, ensureSchema } from '@/lib/admin/db';
import { signToken } from '@/lib/admin/auth';

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ ok: false, message: 'Укажите логин и пароль' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();
    const [user] = await sql`SELECT * FROM users WHERE username = ${username}`;

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ ok: false, message: 'Неверный логин или пароль' }, { status: 401 });
    }

    const token = await signToken({ id: user.id, role: user.role, name: user.name, username: user.username });

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
    if (error?.message === 'DATABASE_URL environment variable is not set') {
      return NextResponse.json(
        { ok: false, message: 'База данных не подключена: задайте DATABASE_URL в окружении сервера или .env.local' },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, message: 'Ошибка сервера' }, { status: 500 });
  }
}
