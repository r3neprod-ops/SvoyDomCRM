import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { getRpId, saveChallenge } from '@/lib/admin/webauthn';

export async function POST(request) {
  await ensureSchema();
  const sql = getSql();

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ ok: false, message: 'Укажите логин' }, { status: 400 });
  }

  const [user] = await sql`SELECT id FROM users WHERE lower(username) = ${username}`;
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Пользователь не найден' }, { status: 404 });
  }

  const creds = await sql`
    SELECT credential_id FROM webauthn_credentials WHERE user_id = ${user.id}
  `;
  if (creds.length === 0) {
    return NextResponse.json(
      { ok: false, message: 'Биометрия не настроена. Войдите по паролю и включите её в профиле.' },
      { status: 404 },
    );
  }

  const rpID = getRpId(request);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: creds.map((c) => ({
      id: c.credential_id,
      type: 'public-key',
    })),
  });

  await saveChallenge(sql, `wa_auth:${username}`, {
    challenge: options.challenge,
    userId: user.id,
  });

  return NextResponse.json({ ok: true, options });
}
