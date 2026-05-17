import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getAuthUser } from '@/lib/admin/auth';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { RP_NAME, getRpId, saveChallenge } from '@/lib/admin/webauthn';

export async function POST(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const rpID = getRpId(request);

  const existingCreds = await sql`
    SELECT credential_id FROM webauthn_credentials WHERE user_id = ${user.id}
  `;

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.username,
    userDisplayName: user.name || user.username,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none',
    excludeCredentials: existingCreds.map((c) => ({
      id: c.credential_id,
      type: 'public-key',
    })),
    authenticatorSelection: {
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
  });

  await saveChallenge(sql, `wa_reg:${user.id}`, { challenge: options.challenge });

  return NextResponse.json({ ok: true, options });
}
