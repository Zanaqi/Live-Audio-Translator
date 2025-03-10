// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Protected routes that require authentication
const protectedPaths = ['/dashboard', '/guide', '/join']

// Routes that should only be accessible when NOT authenticated
const authPaths = ['/login', '/register'] 

// Routes to completely bypass middleware
const bypassPaths = [
  '/_next', 
  '/favicon.ico',
  '/api/',
  '/clear-tokens'
]

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key-here'

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  
  // Skip middleware for static assets, API routes, and the token clearing page
  if (bypassPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }
  
  console.log('Middleware processing path:', pathname, 'search:', search);

  // Extract token (prefer cookie, then header)
  const token = request.cookies.get('auth-token')?.value || 
                request.headers.get('Authorization')?.split(' ')[1] || null;
  
  console.log('Token present:', token ? true : false);

  let isValidToken = false;
  let tokenPayload: any = null;

  // Verify token if present
  if (token) {
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      
      // Use basic verification without maxTokenAge to avoid iat requirement
      const verificationResult = await jwtVerify(token, secret);
      
      tokenPayload = verificationResult.payload;
      
      // Check if token has minimum required payload
      if (tokenPayload && tokenPayload.id && tokenPayload.role) {
        if (tokenPayload.exp && tokenPayload.exp * 1000 > Date.now()) {
          isValidToken = true;
        } else {
          console.log('Token is expired');
          // For expired tokens, redirect to login
          return NextResponse.redirect(new URL('/login', request.url));
        }
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      isValidToken = false;
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // PROTECTED ROUTES: Require valid authentication
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    if (!isValidToken) {
      console.log('Access to protected route denied, redirecting to login');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname + search);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based access control
    if (pathname.startsWith('/guide') && tokenPayload.role !== 'guide') {
      console.log('Not authorized as guide, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (pathname.startsWith('/join') && tokenPayload.role !== 'tourist') {
      console.log('Not authorized as tourist, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // User is authenticated and authorized, add user info to headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', tokenPayload.id);
    requestHeaders.set('x-user-role', tokenPayload.role);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // AUTH ROUTES: Only accessible when NOT authenticated
  if (authPaths.some(path => pathname.startsWith(path))) {
    if (isValidToken) {
      console.log('Already authenticated, redirecting from auth page to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // All other routes: proceed normally
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. /_static (static files)
     * 4. /_vercel (Vercel internals)
     * 5. /favicon.ico, /sitemap.xml, /robots.txt (public files)
     */
    '/((?!api/|_next/|_static/|_vercel/|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}