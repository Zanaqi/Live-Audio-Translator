// lib/middleware/apiAuth.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AuthService } from '../services/authService'

export async function apiAuthMiddleware(req: NextRequest) {
  // Skip auth routes
  if (req.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  try {
    const token = req.headers.get('Authorization')?.split(' ')[1]
    
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const user = await AuthService.getUserFromToken(token)
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }

    // Add user info to request headers
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-user-id', user.id)
    requestHeaders.set('x-user-role', user.role)

    // Return response with modified headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  } catch (error) {
    console.error('Auth middleware error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    )
  }
}

// Helper to get user from request
export function getUserFromRequest(req: NextRequest) {
  return {
    id: req.headers.get('x-user-id'),
    role: req.headers.get('x-user-role')
  }
}