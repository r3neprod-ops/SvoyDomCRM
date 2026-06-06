import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'auth_token';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('[auth] JWT_SECRET is not set — using insecure fallback. Set JWT_SECRET in production!');
  }
  return new TextEncoder().encode(secret || 'fallback-dev-secret-change-in-production');
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function getAuthUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}
