export const RP_NAME = 'SvoyDom CRM';

/** rpID = domain without protocol/port, e.g. "svoydom-lugansk.ru" or "localhost" */
export function getRpId(request) {
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  if (domain) return domain;
  const host = request.headers.get('host') || 'localhost';
  return host.split(':')[0];
}

/** Full origin, e.g. "https://svoydom-lugansk.ru" or "http://localhost:3000" */
export function getOrigin(request) {
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  if (domain) return `https://${domain}`;
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

/** Guess device name from User-Agent header */
export function getDeviceName(request) {
  const ua = request.headers.get('user-agent') || '';
  if (/iphone|ipad/i.test(ua)) return 'iPhone / iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/macintosh/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Устройство';
}

/** Save a WebAuthn challenge to the settings table (TTL 5 min) */
export async function saveChallenge(sql, key, data) {
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const value = JSON.stringify({ ...data, expiresAt });
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

/** Load + delete a challenge. Returns null if missing or expired. */
export async function popChallenge(sql, key) {
  const [row] = await sql`SELECT value FROM settings WHERE key = ${key}`;
  if (!row) return null;
  await sql`DELETE FROM settings WHERE key = ${key}`;
  const data = JSON.parse(row.value);
  if (Date.now() > new Date(data.expiresAt).getTime()) return null;
  return data;
}
