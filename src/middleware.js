import { jwtVerify, SignJWT } from 'jose';
import { NextResponse } from 'next/server';

function getSecret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production'
  );
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Страница логина — пропускаем без проверки
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);

    const response = NextResponse.next();

    // Скользящая сессия: если осталось меньше 15 дней — обновляем токен
    const expiresAt = payload.exp * 1000;
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;

    if (expiresAt - Date.now() < fifteenDays) {
      const newToken = await new SignJWT({
        id: payload.id,
        username: payload.username,
        role: payload.role,
        name: payload.name,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('30d')
        .sign(secret);

      response.cookies.set('auth_token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
    }

    return response;
  } catch {
    const response = NextResponse.redirect(new URL('/admin/login', request.url));
    response.cookies.delete('auth_token');
    return response;
  }
}

export const config = {
  matcher: ['/admin/:path*'],
};
