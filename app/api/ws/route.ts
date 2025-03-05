// app/api/ws/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/utils/authHelper';

const WS_PORT = 3002;

export async function GET(req: NextRequest) {
  try {
    // Get authentication state
    const token = req.headers.get('Authorization')?.split(' ')[1] || 
                  req.cookies.get('auth-token')?.value;
    
    let isAuthenticated = false;
    let userData = null;
    
    if (token) {
      // Verify token
      try {
        userData = await getUserFromToken(token);
        if (userData && userData.id) {
          isAuthenticated = true;
          console.log('WS route - authenticated user:', userData.id);
        }
      } catch (error) {
        console.error('WS route - token verification error:', error);
      }
    }

    // Return WebSocket server info
    return NextResponse.json({
      wsUrl: `ws://localhost:${WS_PORT}`,
      isAuthenticated,
      user: isAuthenticated ? {
        id: userData?.id,
        role: userData?.role
      } : null
    });
  } catch (error) {
    console.error('Error in WS route:', error);
    return NextResponse.json(
      { error: 'Failed to get WebSocket info' },
      { status: 500 }
    );
  }
}