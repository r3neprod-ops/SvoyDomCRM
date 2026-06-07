import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/admin/db';
import {
  buildOAuthSessionResponse,
  exchangeCode,
  fetchOAuthProfile,
  findOrCreateOAuthUser,
  getBaseUrl,
  getOAuthConfig,
} from '@/lib/admin/oauth';

export const runtime = 'nodejs';

function loginRedirect(request, code) {
  return NextResponse.redirect(new URL(`/admin/login?oauth_error=${encodeURIComponent(code)}`, getBaseUrl(request)));
}

export async function GET(request, { params }) {
  const provider = String(params.provider || '').toLowerCase();
  const config = getOAuthConfig(provider);
  if (!config) return loginRedirect(request, 'unknown_provider');
  if (!config.configured) return loginRedirect(request, `${provider}_not_configured`);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = request.cookies.get(`oauth_state_${provider}`)?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return loginRedirect(request, 'oauth_state_error');
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const tokenData = await exchangeCode({ provider, code, request });
    const profile = await fetchOAuthProfile(provider, tokenData);
    if (!profile.provider_account_id) throw new Error('oauth_profile_error');
    const user = await findOrCreateOAuthUser(sql, provider, profile);
    const session = await buildOAuthSessionResponse(user, provider);
    const response = NextResponse.redirect(new URL(session.redirectTo, getBaseUrl(request)));
    response.cookies.set('auth_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    response.cookies.set(`oauth_state_${provider}`, '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    console.error('[OAuth callback] failed:', error);
    return loginRedirect(request, error?.message || 'oauth_error');
  }
}
