// app/api/rooms/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';
import { IParticipant } from '@/lib/db/models/Room';
import { AuthService } from '@/lib/services/authService';
import { getUserFromToken } from '@/lib/utils/authHelper';

export async function POST(req: NextRequest) {
  try {
    // Extract token from request
    const token = req.headers.get('Authorization')?.split(' ')[1] || 
                  req.cookies.get('auth-token')?.value;
    
    console.log('Join room - token present:', !!token);
    
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user from token
    const tokenData = await getUserFromToken(token);
    if (!tokenData || !tokenData.id) {
      console.error('Invalid token or user data');
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    
    // Extract user data from token
    const user = {
      id: tokenData.id as string,
      name: tokenData.name as string,
      role: tokenData.role as string,
      preferredLanguage: tokenData.preferredLanguage as string
    };
    
    // Validate user role
    if (user.role !== 'tourist') {
      console.error('User is not a tourist:', user.role);
      return NextResponse.json({ error: 'Only tourists can join rooms' }, { status: 403 });
    }

    // Get room code from request body
    const { code } = await req.json();
    
    if (!code) {
      return NextResponse.json({ error: 'Room code is required' }, { status: 400 });
    }
    
    console.log('Looking for room with code:', code);
    
    // Find the room
    const room = await mongoRoomStore.getRoomByCode(code);
    
    if (!room || !room.active) {
      console.error('Room not found or inactive:', code);
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }
    
    console.log('Found room:', room.id, 'Name:', room.name);
    
    // Create participant object
    const participant: IParticipant = {
      id: user.id,
      roomId: room.id,
      role: 'tourist',
      preferredLanguage: user.preferredLanguage,
      name: user.name,
      userId: user.id // Link to user account
    };
    
    console.log('Adding participant to room:', participant);
    
    // Add participant to room
    const success = await mongoRoomStore.addParticipant(room.id, participant);
    
    if (!success) {
      console.error('Failed to add participant to room');
      return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
    }

    // Try to add room to user's history, but don't fail if it doesn't work
    try {
      await AuthService.addRoomToUser(user.id, room.id, room.name, 'tourist');
    } catch (error) {
      console.warn('Failed to add room to user history, but continuing:', error);
    }
    
    return NextResponse.json({
      roomId: room.id,
      roomName: room.name,
      roomCode: room.code,
      participantId: user.id
    });
    
  } catch (error) {
    console.error('Error joining room:', error);
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
  }
}