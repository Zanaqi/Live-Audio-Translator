import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/authService';
import User from '@/lib/db/models/User';
import connectToDatabase from '@/lib/db/mongodb';

export async function POST(req: NextRequest) {
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

    await connectToDatabase();

    // Get the user with their rooms
    const userDoc = await User.findOne({ id: user.id });
    if (!userDoc) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create a Map to store unique rooms
    const uniqueRooms = new Map();
    userDoc.rooms.forEach(room => {
      if (!uniqueRooms.has(room.roomId) || 
          new Date(room.joinedAt) > new Date(uniqueRooms.get(room.roomId).joinedAt)) {
        uniqueRooms.set(room.roomId, room);
      }
    });

    // Update user with deduplicated rooms
    const updateResult = await User.updateOne(
      { id: user.id },
      { $set: { rooms: Array.from(uniqueRooms.values()) } }
    );

    return NextResponse.json({
      success: true,
      message: 'Rooms cleaned up successfully',
      roomsRemoved: userDoc.rooms.length - uniqueRooms.size
    });
  } catch (error) {
    console.error('Error cleaning up user rooms:', error);
    return NextResponse.json(
      { error: 'Failed to clean up rooms' },
      { status: 500 }
    );
  }
}