import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getOAuthConfig, getRedirectUri } from '@/lib/admin/oauth';

export async function GET(request, { params }) {
  const provider = String(params.provider || '').toLowerCase();
  const config = getOAuthConfig(provider);
  if (!config) {
    return NextResponse.redirect(new URL('/admin/login?oauth_error=unknown_provider', request.url));
  }
  if (!config.configured) {
    return NextResponse.redirect(new URL(`/admin/login?oauth_error=${provider}_not_configured`, request.url));
  }

  const state = randomUUID();
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', getRedirectUri(request, provider));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scope);
  authUrl.searchParams.set('state', state);
  if (provider === 'vk') {
    authUrl.searchParams.set('display', 'page');
    authUrl.searchParams.set('v', '5.199');
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
