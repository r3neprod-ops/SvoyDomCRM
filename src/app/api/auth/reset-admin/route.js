import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ensureSchema, getSql } from '@/lib/admin/db';

// Emergency admin password reset.
// Requires ADMIN_RESET_TOKEN env var to be set, and the matching token in the request body.
// Usage: POST /api/auth/reset-admin  { "token": "<ADMIN_RESET_TOKEN>", "new_password": "..." }
// After use, unset ADMIN_RESET_TOKEN from environment.

export async function POST(request) {
  const resetToken = process.env.ADMIN_RESET_TOKEN;
  if (!resetToken) {
    return NextResponse.json(
      { ok: false, message: 'Сброс не настроен (переменная ADMIN_RESET_TOKEN не задана)' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));

  if (!body.token || body.token !== resetToken) {
    return NextResponse.json({ ok: false, message: 'Неверный токен' }, { status: 403 });
  }

  const newPassword = String(body.new_password || 'admin123');
  if (newPassword.length < 4) {
    return NextResponse.json({ ok: false, message: 'Пароль минимум 4 символа' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const hash = bcrypt.hashSync(newPassword, 10);

    const [user] = await sql`
      INSERT INTO users (username, password_hash, role, name)
      VALUES ('admin', ${hash}, 'admin', 'Администратор')
      ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash
      RETURNING id, username, name, role
    `;

    return NextResponse.json({
      ok: true,
      message: `Пароль пользователя "admin" обновлён. Уберите ADMIN_RESET_TOKEN из окружения.`,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('reset-admin error:', error);
    return NextResponse.json({ ok: false, message: error.message || 'Ошибка сервера' }, { status: 500 });
  }
}
