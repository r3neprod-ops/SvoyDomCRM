import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { signToken } from './auth';
import { logActivity } from './activityLog';

export const OAUTH_PROVIDERS = {
  yandex: {
    label: 'Яндекс',
    authUrl: 'https://oauth.yandex.ru/authorize',
    tokenUrl: 'https://oauth.yandex.ru/token',
    scope: 'login:info',
    clientIdEnv: 'YANDEX_CLIENT_ID',
    clientSecretEnv: 'YANDEX_CLIENT_SECRET',
  },
  vk: {
    label: 'VK',
    authUrl: 'https://oauth.vk.com/authorize',
    tokenUrl: 'https://oauth.vk.com/access_token',
    scope: 'email',
    clientIdEnv: 'VK_CLIENT_ID',
    clientSecretEnv: 'VK_CLIENT_SECRET',
  },
  mailru: {
    label: 'Mail.ru',
    authUrl: 'https://connect.mail.ru/oauth/authorize',
    tokenUrl: 'https://connect.mail.ru/oauth/token',
    scope: '',
    clientIdEnv: 'MAILRU_CLIENT_ID',
    clientSecretEnv: 'MAILRU_CLIENT_SECRET',
  },
};

export function getOAuthConfig(provider) {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) return null;
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) return { ...config, provider, configured: false };
  return { ...config, provider, clientId, clientSecret, configured: true };
}

export function getBaseUrl(request) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const proto = forwardedProto || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  return request.nextUrl.origin.replace(/\/+$/, '');
}

export function getRedirectUri(request, provider) {
  return `${getBaseUrl(request)}/api/auth/oauth/${provider}/callback`;
}

function makeUsername(value, fallback) {
  const base = String(value || fallback || 'user')
    .split('@')[0]
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  return base.length >= 3 ? base : `${base || 'user'}_${String(fallback || 'crm').slice(0, 6)}`;
}

async function uniqueUsername(sql, preferred) {
  const base = makeUsername(preferred, 'crm_user');
  for (let i = 0; i < 50; i += 1) {
    const username = i === 0 ? base : `${base}_${i + 1}`.slice(0, 32);
    const [existing] = await sql`SELECT id FROM users WHERE lower(username) = lower(${username})`;
    if (!existing) return username;
  }
  return `user_${Date.now().toString(36)}`.slice(0, 32);
}

function buildMailRuSignature(params, secret) {
  const source = Object.entries(params)
    .filter(([key]) => key !== 'sig')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('');
  return createHash('md5').update(`${source}${secret}`).digest('hex');
}

export async function exchangeCode({ provider, code, request }) {
  const config = getOAuthConfig(provider);
  if (!config?.configured) throw new Error('provider_not_configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: getRedirectUri(request, provider),
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'oauth_token_error');
  }
  return data;
}

export async function fetchOAuthProfile(provider, tokenData) {
  if (provider === 'google') {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    return {
      provider_account_id: String(data.sub),
      email: data.email || '',
      name: data.name || data.email || 'Google user',
      avatar_url: data.picture || '',
    };
  }

  if (provider === 'yandex') {
    const res = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${tokenData.access_token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    return {
      provider_account_id: String(data.id),
      email: data.default_email || '',
      name: data.real_name || data.display_name || data.login || 'Yandex user',
      avatar_url: data.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200`
        : '',
    };
  }

  if (provider === 'vk') {
    const accountId = String(tokenData.user_id || '');
    const url = new URL('https://api.vk.com/method/users.get');
    url.searchParams.set('user_ids', accountId);
    url.searchParams.set('fields', 'photo_200');
    url.searchParams.set('access_token', tokenData.access_token);
    url.searchParams.set('v', '5.199');
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    const profile = data.response?.[0] || {};
    return {
      provider_account_id: accountId,
      email: tokenData.email || '',
      name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'VK user',
      avatar_url: profile.photo_200 || '',
    };
  }

  if (provider === 'mailru') {
    const config = getOAuthConfig(provider);
    const accountId = String(tokenData.x_mailru_vid || tokenData.user_id || '');
    let mailProfile = null;

    if (accountId && config?.configured) {
      const params = {
        app_id: config.clientId,
        format: 'json',
        method: 'users.getInfo',
        secure: '1',
        session_key: tokenData.access_token,
        uids: accountId,
      };
      const url = new URL('https://www.appsmail.ru/platform/api');
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      url.searchParams.set('sig', buildMailRuSignature(params, config.clientSecret));

      try {
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        mailProfile = Array.isArray(data) ? data[0] : null;
      } catch (error) {
        console.error('[OAuth Mail.ru] profile fetch failed:', error?.message);
      }
    }

    const name = [mailProfile?.first_name, mailProfile?.last_name].filter(Boolean).join(' ');
    return {
      provider_account_id: accountId,
      email: '',
      name: name || mailProfile?.nick || 'Mail.ru user',
      avatar_url: mailProfile?.pic_big || mailProfile?.pic || '',
    };
  }

  throw new Error('unknown_provider');
}

export async function findOrCreateOAuthUser(sql, provider, profile) {
  const [linked] = await sql`
    SELECT u.id, u.username, u.role, u.name
    FROM user_auth_accounts a
    JOIN users u ON u.id = a.user_id
    WHERE a.provider = ${provider}
      AND a.provider_account_id = ${profile.provider_account_id}
    LIMIT 1
  `;
  if (linked) return linked;

  const normalizedEmail = String(profile.email || '').trim().toLowerCase();
  let user = null;
  if (normalizedEmail) {
    [user] = await sql`
      SELECT id, username, role, name
      FROM users
      WHERE lower(email) = ${normalizedEmail}
      LIMIT 1
    `;
  }

  if (!user) {
    const username = await uniqueUsername(sql, normalizedEmail || `${provider}_${profile.provider_account_id}`);
    const passwordHash = await bcrypt.hash(randomUUID(), 10);
    [user] = await sql`
      INSERT INTO users (username, password_hash, role, name, email, avatar_url, profile_completed)
      VALUES (${username}, ${passwordHash}, 'agent', ${profile.name}, ${normalizedEmail || null}, ${profile.avatar_url || null}, false)
      RETURNING id, username, role, name
    `;
  }

  await sql`
    INSERT INTO user_auth_accounts (user_id, provider, provider_account_id, email, updated_at)
    VALUES (${user.id}, ${provider}, ${profile.provider_account_id}, ${normalizedEmail || null}, NOW())
    ON CONFLICT (provider, provider_account_id)
    DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email, updated_at = NOW()
  `;
  await sql`
    UPDATE users
    SET
      email = COALESCE(email, ${normalizedEmail || null}),
      avatar_url = COALESCE(NULLIF(avatar_url, ''), ${profile.avatar_url || null}),
      last_login_at = NOW()
    WHERE id = ${user.id}
  `;

  return user;
}

export async function buildOAuthSessionResponse(user, provider, redirectTo = '/admin/dashboard') {
  const { getSql } = await import('./db');
  const sql = getSql();
  const [sessionUser] = await sql`
    SELECT u.id, u.username, u.name, COALESCE(u.profile_completed, false) AS profile_completed,
           u.active_company_id, COALESCE(cm.role, u.role) AS role
    FROM users u
    LEFT JOIN company_members cm
      ON cm.user_id = u.id
     AND cm.company_id = u.active_company_id
     AND cm.status = 'active'
    WHERE u.id = ${user.id}
    LIMIT 1
  `;
  const finalUser = sessionUser || user;
  const needsOnboarding = !finalUser.profile_completed || !finalUser.active_company_id;
  const token = await signToken({
    id: finalUser.id,
    role: finalUser.role,
    name: finalUser.name,
    username: finalUser.username,
    profile_completed: Boolean(finalUser.profile_completed),
    active_company_id: finalUser.active_company_id || null,
  });
  await logActivity({
    userId: user.id,
    action: 'user_login',
    entityType: 'user',
    entityId: user.id,
    message: `${user.name || user.username} вошел в CRM через ${OAUTH_PROVIDERS[provider]?.label || provider}`,
    meta: { method: provider },
  });
  return { token, redirectTo: needsOnboarding ? '/admin/onboarding' : redirectTo };
}
