import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { makeAuthenticationOptions } from '@/lib/admin/passkeys';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    await ensureSchema();
    const sql = getSql();
    const [row] = await sql`SELECT COUNT(*) AS count FROM webauthn_credentials`;
    if (!Number(row?.count || 0)) {
      return NextResponse.json({ ok: false, message: 'Быстрый вход еще не включен ни для одного аккаунта' }, { status: 404 });
    }

    const options = await makeAuthenticationOptions(request);
    await sql`
      INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at)
      VALUES (${options.challenge}, NULL, 'authentication', NOW() + INTERVAL '10 minutes')
    `;

    const response = NextResponse.json({ ok: true, options });
    response.cookies.set('webauthn_auth_challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error('[Passkey login options] failed:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось подготовить быстрый вход' }, { status: 500 });
  }
}
