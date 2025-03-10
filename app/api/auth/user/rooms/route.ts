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

    // Get rooms and remove duplicates based on roomId
    const rooms = await AuthService.getUserRooms(user.id!);
    
    // Create a Map to store unique rooms, using roomId as key
    const uniqueRooms = new Map();
    rooms.forEach(room => {
      // If room already exists, keep the one with the latest joinedAt
      if (!uniqueRooms.has(room.roomId) || 
          new Date(room.joinedAt) > new Date(uniqueRooms.get(room.roomId).joinedAt)) {
        uniqueRooms.set(room.roomId, room);
      }
    });

    // Convert Map back to array
    const deduplicatedRooms = Array.from(uniqueRooms.values());

    return NextResponse.json({ rooms: deduplicatedRooms });
  } catch (error) {
    console.error('Error getting user rooms:', error);
    return NextResponse.json(
      { error: 'Failed to get user rooms' },
      { status: 500 }
    );
  }
}