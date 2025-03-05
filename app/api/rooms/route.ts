// app/api/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';
import { AuthService } from '@/lib/services/authService';

// Create a new room
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const token = req.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await AuthService.getUserFromToken(token);
    if (!user || user.role !== 'guide') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { name } = await req.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
    }
    
    const roomId = uuidv4();
    
    // Create room with user reference
    const room = await mongoRoomStore.createRoom({
      name,
      guideId: user.id,
      participants: [{
        id: user.id,
        roomId,
        role: 'guide',
        name: user.name,
        userId: user.id
      }],
      active: true,
      createdBy: user.id
    });
    
    // Add room to user's history
    await AuthService.addRoomToUser(user.id, room.id, room.name, 'guide');
    
    return NextResponse.json({ 
      id: room.id, 
      code: room.code,
      name: room.name,
      createdAt: room.createdAt
    });
    
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
  }
}

// Get room by code
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const token = req.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await AuthService.getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    
    if (!code) {
      return NextResponse.json({ error: 'Room code is required' }, { status: 400 });
    }
    
    const room = await mongoRoomStore.getRoomByCode(code);
    
    if (!room || !room.active) {
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }
    
    return NextResponse.json({
      id: room.id,
      code: room.code,
      name: room.name,
      participantCount: room.participants.length,
      isGuide: room.guideId === user.id
    });
    
  } catch (error) {
    console.error('Error getting room:', error);
    return NextResponse.json({ error: 'Failed to get room' }, { status: 500 });
  }
}