import { NextResponse } from 'next/server';
import { getCurrentUserContext } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { makeRegistrationOptions } from '@/lib/admin/passkeys';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const context = await getCurrentUserContext();
    if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });

    await ensureSchema();
    const sql = getSql();
    const credentials = await sql`
      SELECT credential_id, transports
      FROM webauthn_credentials
      WHERE user_id = ${context.user.id}
    `;
    const options = await makeRegistrationOptions({ request, user: context.user, existingCredentials: credentials });

    await sql`
      INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at)
      VALUES (${options.challenge}, ${context.user.id}, 'registration', NOW() + INTERVAL '10 minutes')
    `;

    return NextResponse.json({ ok: true, options });
  } catch (error) {
    console.error('[Passkey registration options] failed:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось подготовить быстрый вход' }, { status: 500 });
  }
}
