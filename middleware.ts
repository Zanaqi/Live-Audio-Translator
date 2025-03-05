// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const protectedPaths = ['/dashboard', '/guide', '/join'];
const authPaths = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get token from either cookie or Authorization header
  const token = request.cookies.get('auth-token')?.value || 
                request.headers.get('Authorization')?.split(' ')[1];

  // Authentication check for protected routes
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    if (!token) {
      // Save the attempted URL to redirect back after login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }

    try {
      // Verify JWT token
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      // Route-specific role checks
      if (pathname.startsWith('/guide') && payload.role !== 'guide') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      if (pathname.startsWith('/join') && payload.role !== 'tourist') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      // Add user info to headers
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-id', payload.id as string);
      requestHeaders.set('x-user-role', payload.role as string);

      // Continue with modified headers
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      // If token is invalid, redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Prevent authenticated users from accessing auth pages
  if (authPaths.some(path => pathname.startsWith(path))) {
    if (token) {
      try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        await jwtVerify(token, secret);
        // If token is valid, redirect to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } catch (error) {
        // If token is invalid, continue to auth page
        return NextResponse.next();
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * 1. /api routes (handled separately)
     * 2. /_next (Next.js internals)
     * 3. /_static (static files)
     * 4. /_vercel (Vercel internals)
     * 5. /favicon.ico, /robots.txt (static files)
     */
    '/((?!api|_next|_static|_vercel|favicon.ico|robots.txt).*)',
  ],
};