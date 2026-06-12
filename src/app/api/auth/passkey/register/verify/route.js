import { NextResponse } from 'next/server';
import { getCurrentUserContext } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { credentialPublicKeyToString, verifyPasskeyRegistration } from '@/lib/admin/passkeys';
import { logActivity } from '@/lib/admin/activityLog';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const context = await getCurrentUserContext();
    if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const registrationResponse = body.response || body;
    if (!registrationResponse?.id) {
      return NextResponse.json({ ok: false, message: 'Быстрый вход не был подтвержден устройством' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();
    const [challenge] = await sql`
      SELECT id, challenge
      FROM webauthn_challenges
      WHERE user_id = ${context.user.id}
        AND type = 'registration'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!challenge) {
      return NextResponse.json({ ok: false, message: 'Сессия настройки устарела. Попробуйте еще раз.' }, { status: 401 });
    }

    const verification = await verifyPasskeyRegistration({
      request,
      response: registrationResponse,
      expectedChallenge: challenge.challenge,
    });
    if (!verification.verified) {
      return NextResponse.json({ ok: false, message: 'Не удалось подтвердить быстрый вход' }, { status: 401 });
    }

    const { credential } = verification.registrationInfo;
    const transports = registrationResponse.response?.transports || credential.transports || [];
    await sql`
      INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, updated_at)
      VALUES (
        ${context.user.id},
        ${credential.id},
        ${credentialPublicKeyToString(credential.publicKey)},
        ${credential.counter || 0},
        ${JSON.stringify(transports)},
        NOW()
      )
      ON CONFLICT (credential_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        public_key = EXCLUDED.public_key,
        counter = EXCLUDED.counter,
        transports = EXCLUDED.transports,
        updated_at = NOW()
    `;
    await sql`DELETE FROM webauthn_challenges WHERE id = ${challenge.id}`;
    await logActivity({
      userId: context.user.id,
      companyId: context.companyId || null,
      action: 'passkey_created',
      entityType: 'user',
      entityId: context.user.id,
      message: `${context.user.name || context.user.username} подключил быстрый вход`,
      meta: { method: 'passkey' },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Passkey registration verify] failed:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось сохранить быстрый вход' }, { status: 500 });
  }
}
