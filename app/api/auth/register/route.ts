// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/authService';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role, preferredLanguage } = await req.json();

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await AuthService.register(
      email,
      password,
      name,
      role,
      preferredLanguage
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: result.user,
      token: result.token
    });

    // Set the cookie using Response
    response.cookies.set({
      name: 'auth-token',
      value: result.token!,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}