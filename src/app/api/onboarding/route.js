import { NextResponse } from 'next/server';
import { getCurrentUserContext, normalizeUsername, setAuthCookie, USERNAME_PATTERN } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { normalizePhoneE164 } from '@/lib/admin/phoneAuth';

function cleanText(value, limit = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const requests = await sql`
    SELECT r.id, r.status, r.message, r.created_at,
           c.id AS company_id, c.name AS company_name, c.public_id
    FROM company_join_requests r
    JOIN companies c ON c.id = r.company_id
    WHERE r.user_id = ${context.user.id}
    ORDER BY r.created_at DESC
    LIMIT 20
  `;

  return NextResponse.json({
    ok: true,
    user: context.user,
    company: context.company,
    needsOnboarding: context.needsOnboarding,
    requests,
  });
}

export async function PATCH(request) {
  const context = await getCurrentUserContext();
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name, 80);
  const username = normalizeUsername(body.username);
  const phone = cleanText(body.phone, 40);
  const statusText = cleanText(body.status_text, 160);

  if (!name) {
    return NextResponse.json({ ok: false, message: 'Укажите имя' }, { status: 400 });
  }
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ ok: false, message: 'Никнейм: 3-32 символа, латиница, цифры и _' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();
  const phoneE164 = phone ? normalizePhoneE164(phone) : '';
  if (phone && !phoneE164) {
    return NextResponse.json({ ok: false, message: 'Укажите корректный номер телефона' }, { status: 400 });
  }

  const [existing] = await sql`
    SELECT id
    FROM users
    WHERE lower(username) = lower(${username})
      AND id <> ${context.user.id}
    LIMIT 1
  `;
  if (existing) {
    return NextResponse.json({ ok: false, message: 'Этот никнейм уже занят' }, { status: 409 });
  }

  if (phoneE164) {
    const [existingPhone] = await sql`
      SELECT id
      FROM users
      WHERE phone_e164 = ${phoneE164}
        AND id <> ${context.user.id}
      LIMIT 1
    `;
    if (existingPhone) {
      return NextResponse.json({ ok: false, message: 'Этот телефон уже привязан к другому аккаунту' }, { status: 409 });
    }
  }

  const [profile] = await sql`
    UPDATE users
    SET name = ${name},
        username = ${username},
        phone = ${phone},
        phone_e164 = ${phoneE164 || null},
        status_text = ${statusText},
        profile_completed = true
    WHERE id = ${context.user.id}
    RETURNING id, username, role, name, email, phone, status_text, avatar_url, profile_completed, active_company_id
  `;

  const response = NextResponse.json({ ok: true, user: profile });
  await setAuthCookie(response, context.user.id);
  return response;
}
