// app/api/auth/user/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/authService';

export async function GET(req: NextRequest) {
    try {
      const token = req.headers.get('Authorization')?.split(' ')[1];
      
      if (!token) {
        return NextResponse.json(
          { error: 'No token provided' },
          { status: 401 }
        );
      }
  
      const user = await AuthService.getUserFromToken(token);
      if (!user) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
  
      const rooms = await AuthService.getUserRooms(user.id!);
      return NextResponse.json({ rooms });
    } catch (error) {
      console.error('Error getting user rooms:', error);
      return NextResponse.json(
        { error: 'Failed to get user rooms' },
        { status: 500 }
      );
    }
}