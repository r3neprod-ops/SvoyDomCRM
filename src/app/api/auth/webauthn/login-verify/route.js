import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { signToken } from '@/lib/admin/auth';
import { getRpId, getOrigin, popChallenge } from '@/lib/admin/webauthn';

export async function POST(request) {
  await ensureSchema();
  const sql = getSql();

  const body = await request.json().catch(() => ({}));
  const { username, credential: credentialResponse } = body;

  if (!username || !credentialResponse) {
    return NextResponse.json({ ok: false, message: 'Неверные параметры' }, { status: 400 });
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const saved = await popChallenge(sql, `wa_auth:${normalizedUsername}`);
  if (!saved) {
    return NextResponse.json({ ok: false, message: 'Сессия истекла, попробуйте снова' }, { status: 400 });
  }

  const { challenge, userId } = saved;

  const credentialId = credentialResponse.id;
  const [dbCred] = await sql`
    SELECT * FROM webauthn_credentials
    WHERE credential_id = ${credentialId} AND user_id = ${userId}
  `;
  if (!dbCred) {
    return NextResponse.json({ ok: false, message: 'Ключ не найден' }, { status: 400 });
  }

  const rpID = getRpId(request);
  const origin = getOrigin(request);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credentialResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: dbCred.credential_id,
        publicKey: Buffer.from(dbCred.public_key, 'base64url'),
        counter: Number(dbCred.counter),
      },
    });
  } catch (err) {
    console.error('[WebAuthn login-verify]', err.message);
    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  }

  const { verified, authenticationInfo } = verification;
  if (!verified) {
    return NextResponse.json({ ok: false, message: 'Верификация не прошла' }, { status: 400 });
  }

  await sql`
    UPDATE webauthn_credentials
    SET counter = ${authenticationInfo.newCounter}
    WHERE id = ${dbCred.id}
  `;

  const [user] = await sql`
    SELECT id, username, role, name FROM users WHERE id = ${userId}
  `;
  if (!user) return NextResponse.json({ ok: false }, { status: 404 });

  const token = await signToken({
    id: user.id,
    role: user.role,
    name: user.name,
    username: user.username,
  });

  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
