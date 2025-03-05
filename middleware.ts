// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { AuthService } from '@/lib/services/authService'

const protectedPaths = ['/dashboard', '/guide', '/join']
const authPaths = ['/login', '/register']

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  console.log('Middleware processing path:', pathname, 'search:', search);

  // Get token from either cookie or Authorization header
  const token = request.cookies.get('auth-token')?.value || 
                request.headers.get('Authorization')?.split(' ')[1]
  
  console.log('Token present:', !!token);

  // Check protected routes that require authentication
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    if (!token) {
      console.log('No token found, redirecting to login');
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname + search)
      return NextResponse.redirect(loginUrl)
    }

    try {
      // Verify token
      const secret = new TextEncoder().encode(process.env.JWT_SECRET)
      const { payload } = await jwtVerify(token, secret)

      // Verify user exists in database
      const user = await AuthService.getUserFromToken(token)
      if (!user) {
        console.log('User not found in database, redirecting to login');
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('from', pathname + search)
        return NextResponse.redirect(loginUrl)
      }

      console.log('Token verified and user found:', user);

      // Role-based route protection
      if (pathname.startsWith('/guide') && user.role !== 'guide') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      if (pathname.startsWith('/join') && user.role !== 'tourist') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      // Add user info to headers
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-user-id', user.id)
      requestHeaders.set('x-user-role', user.role)

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    } catch (error) {
      console.error('Token verification failed:', error)
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname + search)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Handle auth pages
  if (authPaths.some(path => pathname.startsWith(path))) {
    if (token) {
      try {
        const user = await AuthService.getUserFromToken(token)
        if (user) {
          // Only redirect if user exists in database
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      } catch (error) {
        // If token is invalid or user not found, continue to auth page
        console.error('Auth verification failed:', error)
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/guide/:path*',
    '/join/:path*',
    '/login/:path*',
    '/register/:path*',
    '/dashboard',
    '/guide',
    '/join',
    '/login',
    '/register'
  ]
}