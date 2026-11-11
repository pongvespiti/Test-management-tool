import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { isUnder, PUBLIC_PATHS } from '@/lib/routes';

/**
 * Runs before every matched request (Next.js "proxy", formerly middleware):
 * 1. `/api/*` is forwarded to the NestJS API (API_URL, read at runtime — never hard-coded),
 *    so the browser talks to one origin and the session cookie stays first-party.
 * 2. Pages of the signed-in area redirect to /login early when there is no session cookie.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, serverEnv.apiUrl));
  }

  const isPublic = PUBLIC_PATHS.some((p) => isUnder(pathname, p));
  if (!isPublic && !request.cookies.has(serverEnv.sessionCookieName)) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|svg|ico|woff2?)$).*)'],
};
