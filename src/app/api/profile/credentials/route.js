import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthUser, signToken } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

// PATCH /api/profile/credentials
// Body: { current_password, new_username?, new_password?, confirm_new_password? }
// - current_password is always required
// - at least one of new_username / new_password must be provided
// - if username changes → clears auth cookie, returns { username_changed: true }
//   (frontend must redirect to login)

export async function PATCH(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();

  const body = await request.json().catch(() => ({}));
  const currentPassword  = String(body.current_password  || '').trim();
  const rawNewUsername   = String(body.new_username       || '').trim().replace(/^@+/, '').toLowerCase();
  const newPassword      = String(body.new_password       || '');
  const confirmPassword  = String(body.confirm_new_password || '');

  if (!currentPassword) {
    return NextResponse.json({ ok: false, message: 'Введите текущий пароль' }, { status: 400 });
  }

  const changingUsername = rawNewUsername.length > 0;
  const changingPassword = newPassword.length > 0;

  if (!changingUsername && !changingPassword) {
    return NextResponse.json(
      { ok: false, message: 'Укажите новый логин или новый пароль' },
      { status: 400 }
    );
  }

  if (changingUsername && !USERNAME_PATTERN.test(rawNewUsername)) {
    return NextResponse.json(
      { ok: false, message: 'Логин: 3-32 символа, только латиница, цифры и _' },
      { status: 400 }
    );
  }

  if (changingPassword) {
    if (newPassword.length < 4) {
      return NextResponse.json({ ok: false, message: 'Новый пароль минимум 4 символа' }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ ok: false, message: 'Пароли не совпадают' }, { status: 400 });
    }
  }

  // Load current record from DB
  const [dbUser] = await sql`
    SELECT id, username, password_hash, role, name
    FROM users
    WHERE id = ${user.id}
  `;
  if (!dbUser) {
    return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  }

  // Verify current password
  const passwordOk = await bcrypt.compare(currentPassword, dbUser.password_hash);
  if (!passwordOk) {
    return NextResponse.json({ ok: false, message: 'Неверный текущий пароль' }, { status: 401 });
  }

  const newUsername = changingUsername ? rawNewUsername : dbUser.username;

  // Check username uniqueness when changing
  if (changingUsername && rawNewUsername !== dbUser.username) {
    const [taken] = await sql`
      SELECT id FROM users
      WHERE lower(username) = lower(${rawNewUsername}) AND id <> ${user.id}
    `;
    if (taken) {
      return NextResponse.json({ ok: false, message: 'Этот логин уже занят' }, { status: 409 });
    }
  }

  // Apply updates
  if (changingPassword) {
    const newHash = bcrypt.hashSync(newPassword, 10);
    await sql`
      UPDATE users
      SET username = ${newUsername}, password_hash = ${newHash}
      WHERE id = ${user.id}
    `;
  } else {
    await sql`
      UPDATE users SET username = ${newUsername} WHERE id = ${user.id}
    `;
  }

  const usernameChanged = changingUsername && rawNewUsername !== dbUser.username;

  if (usernameChanged) {
    // Force re-login: clear cookie
    const response = NextResponse.json({ ok: true, username_changed: true });
    response.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
    return response;
  }

  // Password-only change: re-issue token with same claims
  const token = await signToken({ id: dbUser.id, role: dbUser.role, name: dbUser.name, username: newUsername });
  const response = NextResponse.json({ ok: true, username_changed: false });
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
