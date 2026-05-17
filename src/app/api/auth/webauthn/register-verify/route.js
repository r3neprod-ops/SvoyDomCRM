import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { getRpId, getOrigin, getDeviceName, popChallenge } from '@/lib/admin/webauthn';

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();

  const body = await request.json().catch(() => null);
  if (!body?.credential) {
    return NextResponse.json({ ok: false, message: 'Неверные параметры' }, { status: 400 });
  }

  const saved = await popChallenge(sql, `wa_reg:${user.id}`);
  if (!saved) {
    return NextResponse.json({ ok: false, message: 'Сессия регистрации истекла, попробуйте снова' }, { status: 400 });
  }

  const rpID = getRpId(request);
  const origin = getOrigin(request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    console.error('[WebAuthn register-verify]', err.message);
    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  }

  const { verified, registrationInfo } = verification;
  if (!verified || !registrationInfo) {
    return NextResponse.json({ ok: false, message: 'Верификация не прошла' }, { status: 400 });
  }

  const { credential } = registrationInfo;
  const deviceName = body.device_name || getDeviceName(request);

  await sql`
    INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_name)
    VALUES (
      ${user.id},
      ${credential.id},
      ${Buffer.from(credential.publicKey).toString('base64url')},
      ${credential.counter},
      ${deviceName}
    )
    ON CONFLICT (credential_id) DO NOTHING
  `;

  return NextResponse.json({ ok: true });
}
