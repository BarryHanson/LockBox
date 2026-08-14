import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

// Public API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/logout',
  '/api/auth/callback',
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/auth/error',
  '/api/webhooks/stripe',
  '/api/share-items/redeem',
  '/api/share-items/file',
  '/api/2fa/email/verify',
  '/api/2fa/email/send',
  '/api/2fa/method',
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
}

// CSRF: validate Origin/Referer on state-changing requests
function csrfCheck(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  // Only enforce on state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  // Skip CSRF for webhook endpoints (called by external services)
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/webhooks/')) return true;

  // Skip CSRF for browser extension requests — they can't set a matching Origin header
  // and authenticate via Authorization Bearer token with an explicit client-type header.
  const authHeader = request.headers.get('Authorization');
  const clientType = request.headers.get('x-client-type');
  if (authHeader?.startsWith('Bearer ') && clientType === 'extension') return true;

  // Also skip CSRF for Bearer token auth without any cookie (e.g. API clients)
  const cookieToken = request.cookies.get('token')?.value || request.cookies.get('__Host-token')?.value;
  if (authHeader?.startsWith('Bearer ') && !cookieToken) return true;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  if (!host) return false;

  // Allow if Origin matches host
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }

  // Fall back to Referer if Origin is absent
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      return refererHost === host;
    } catch {
      return false;
    }
  }

  // No Origin or Referer — reject
  return false;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect already-authenticated users away from auth pages
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  if (isAuthPage) {
    const token = request.cookies.get('token')?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (payload.userId && typeof payload.userId === 'string') {
          return NextResponse.redirect(new URL('/vault', request.url));
        }
      } catch {
        // Invalid token — let them see the auth page
      }
    }
    return NextResponse.next();
  }

  // Protect /vault/* pages and all /api/* routes (except public ones)
  const isAppPage = pathname.startsWith('/vault');
  const isApiRoute = pathname.startsWith('/api/');
  const isProtectedRoute = isAppPage || (isApiRoute && !isPublicApiRoute(pathname));

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const isApiRequest = isApiRoute;

  // CSRF protection for API routes
  if (isApiRequest && !csrfCheck(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  // Get token from cookie or Authorization header
  let token: string | undefined = request.cookies.get('token')?.value;

  // Only use Authorization header when cookie is absent.
  // This avoids accidental override by stale client headers (e.g. Bearer null).
  const authHeader = request.headers.get('Authorization');
  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    if (isApiRequest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    if (!payload.userId || typeof payload.userId !== 'string') {
      if (isApiRequest) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Token is valid, pass userId to downstream handlers via request headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch (error) {
    if (isApiRequest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/vault/:path*',
    '/api/:path*'
  ]
};
