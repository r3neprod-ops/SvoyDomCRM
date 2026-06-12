import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { setAuthCookie } from '@/lib/admin/company';
import { logActivity } from '@/lib/admin/activityLog';
import { credentialPublicKeyFromString, parseTransports, verifyPasskeyAuthentication } from '@/lib/admin/passkeys';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const authResponse = body.response || body;
    const credentialId = authResponse?.id;
    const expectedChallenge = request.cookies.get('webauthn_auth_challenge')?.value;
    if (!credentialId || !expectedChallenge) {
      return NextResponse.json({ ok: false, message: 'Сессия быстрого входа устарела' }, { status: 401 });
    }

    await ensureSchema();
    const sql = getSql();
    const [challenge] = await sql`
      SELECT id
      FROM webauthn_challenges
      WHERE challenge = ${expectedChallenge}
        AND type = 'authentication'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!challenge) {
      return NextResponse.json({ ok: false, message: 'Сессия быстрого входа устарела' }, { status: 401 });
    }

    const [stored] = await sql`
      SELECT c.*, u.name, u.username, COALESCE(u.profile_completed, false) AS profile_completed, u.active_company_id
      FROM webauthn_credentials c
      JOIN users u ON u.id = c.user_id
      WHERE c.credential_id = ${credentialId}
      LIMIT 1
    `;
    if (!stored) {
      return NextResponse.json({ ok: false, message: 'Этот быстрый вход не привязан к CRM' }, { status: 401 });
    }

    const verification = await verifyPasskeyAuthentication({
      request,
      response: authResponse,
      expectedChallenge,
      credential: {
        id: stored.credential_id,
        publicKey: credentialPublicKeyFromString(stored.public_key),
        counter: Number(stored.counter || 0),
        transports: parseTransports(stored.transports),
      },
    });
    if (!verification.verified) {
      return NextResponse.json({ ok: false, message: 'Не удалось подтвердить быстрый вход' }, { status: 401 });
    }

    await sql`
      UPDATE webauthn_credentials
      SET counter = ${verification.authenticationInfo.newCounter || 0}, updated_at = NOW()
      WHERE id = ${stored.id}
    `;
    await sql`DELETE FROM webauthn_challenges WHERE id = ${challenge.id}`;
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${stored.user_id}`;
    await logActivity({
      userId: stored.user_id,
      action: 'user_login',
      entityType: 'user',
      entityId: stored.user_id,
      message: `${stored.name || stored.username} вошел в CRM через быстрый вход`,
      meta: { method: 'passkey' },
    });

    const redirectTo = stored.profile_completed && stored.active_company_id ? '/admin/dashboard' : '/admin/onboarding';
    const response = NextResponse.json({ ok: true, redirectTo });
    response.cookies.set('webauthn_auth_challenge', '', { maxAge: 0, path: '/' });
    await setAuthCookie(response, stored.user_id);
    return response;
  } catch (error) {
    console.error('[Passkey login verify] failed:', error);
    return NextResponse.json({ ok: false, message: 'Не удалось выполнить быстрый вход' }, { status: 500 });
  }
}
