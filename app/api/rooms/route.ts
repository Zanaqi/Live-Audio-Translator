// app/api/auth/user/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/authService';

export async function GET(req: NextRequest) {
  try {
    console.log('GET /api/auth/user/rooms called');
    
    const token = req.headers.get('Authorization')?.split(' ')[1];
    console.log('Token present:', !!token);
    
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const user = await AuthService.getUserFromToken(token);
    console.log('User found:', user ? 'yes' : 'no');
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const rooms = await AuthService.getUserRooms(user.id);
    console.log('Fetched rooms:', rooms);
    
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('Error getting user rooms:', error);
    return NextResponse.json(
      { error: 'Failed to get user rooms' },
      { status: 500 }
    );
  }
}