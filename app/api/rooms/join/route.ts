// app/api/rooms/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';
import { IParticipant } from '@/lib/db/models/Room';
import { AuthService } from '@/lib/services/authService';

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const token = req.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await AuthService.getUserFromToken(token);
    if (!user || user.role !== 'tourist') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { code } = await req.json();
    
    if (!code) {
      return NextResponse.json({ error: 'Room code is required' }, { status: 400 });
    }
    
    // Find the room
    const room = await mongoRoomStore.getRoomByCode(code);
    
    if (!room || !room.active) {
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }
    
    // Create participant object
    const participant: IParticipant = {
      id: user.id,
      roomId: room.id,
      role: 'tourist',
      preferredLanguage: user.preferredLanguage,
      name: user.name,
      userId: user.id // Link to user account
    };
    
    // Add participant to room
    const success = await mongoRoomStore.addParticipant(room.id, participant);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
    }

    // Add room to user's history
    await AuthService.addRoomToUser(user.id, room.id, room.name, 'tourist');
    
    return NextResponse.json({
      roomId: room.id,
      roomName: room.name,
      participantId: user.id
    });
    
  } catch (error) {
    console.error('Error joining room:', error);
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
  }
}