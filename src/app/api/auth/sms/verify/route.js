import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { setAuthCookie } from '@/lib/admin/company';
import { logActivity } from '@/lib/admin/activityLog';
import { normalizePhoneE164, verifySmsCode } from '@/lib/admin/phoneAuth';

export const runtime = 'nodejs';

async function makeUniquePhoneUsername(sql, phone) {
  const lastDigits = phone.replace(/\D/g, '').slice(-4) || 'user';
  const base = `phone_${lastDigits}`;
  for (let index = 0; index < 20; index += 1) {
    const username = index === 0 ? base : `${base}_${index + 1}`;
    const [existing] = await sql`SELECT id FROM users WHERE lower(username) = ${username.toLowerCase()} LIMIT 1`;
    if (!existing) return username;
  }
  return `phone_${Date.now().toString(36)}`.slice(0, 32);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhoneE164(body.phone);
    const code = String(body.code || '').replace(/\D/g, '').slice(0, 8);
    if (!phone || code.length < 4) {
      return NextResponse.json({ ok: false, message: 'Укажите телефон и код из SMS' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();
    const [sms] = await sql`
      SELECT id, code_hash, attempts
      FROM auth_sms_codes
      WHERE phone_e164 = ${phone}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!sms) {
      return NextResponse.json({ ok: false, message: 'Код устарел. Запросите новый.' }, { status: 401 });
    }
    if (Number(sms.attempts || 0) >= 5) {
      return NextResponse.json({ ok: false, message: 'Слишком много попыток. Запросите новый код.' }, { status: 429 });
    }

    const codeOk = await verifySmsCode(code, sms.code_hash);
    if (!codeOk) {
      await sql`UPDATE auth_sms_codes SET attempts = attempts + 1 WHERE id = ${sms.id}`;
      return NextResponse.json({ ok: false, message: 'Неверный код' }, { status: 401 });
    }

    await sql`UPDATE auth_sms_codes SET consumed_at = NOW() WHERE id = ${sms.id}`;

    let [user] = await sql`
      SELECT u.*, COALESCE(cm.role, u.role) AS session_role
      FROM users u
      LEFT JOIN company_members cm
        ON cm.user_id = u.id
       AND cm.company_id = u.active_company_id
       AND cm.status = 'active'
      WHERE u.phone_e164 = ${phone}
      LIMIT 1
    `;

    if (!user) {
      const username = await makeUniquePhoneUsername(sql, phone);
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      [user] = await sql`
        INSERT INTO users (username, password_hash, role, name, phone, phone_e164, profile_completed)
        VALUES (${username}, ${passwordHash}, 'agent', 'Пользователь', ${phone}, ${phone}, false)
        RETURNING *
      `;
    }

    await sql`UPDATE users SET last_login_at = NOW(), phone_e164 = COALESCE(phone_e164, ${phone}) WHERE id = ${user.id}`;
    await logActivity({
      userId: user.id,
      action: 'user_login',
      entityType: 'user',
      entityId: user.id,
      message: `${user.name || user.username} вошел в CRM по SMS`,
      meta: { method: 'sms' },
    });

    const [sessionUser] = await sql`
      SELECT COALESCE(profile_completed, false) AS profile_completed, active_company_id
      FROM users
      WHERE id = ${user.id}
      LIMIT 1
    `;
    const redirectTo = sessionUser?.profile_completed && sessionUser?.active_company_id ? '/admin/dashboard' : '/admin/onboarding';
    const response = NextResponse.json({ ok: true, redirectTo });
    await setAuthCookie(response, user.id);
    return response;
  } catch (error) {
    console.error('[SMS auth verify] failed:', error);
    return NextResponse.json({ ok: false, message: 'Ошибка сервера' }, { status: 500 });
  }
}
