// app/api/rooms/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';
import { IParticipant } from '@/lib/db/models/Room';

export async function POST(req: NextRequest) {
  try {
    const { code, touristName, preferredLanguage } = await req.json();
    
    if (!code || !preferredLanguage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Find the room by code
    const room = await mongoRoomStore.getRoomByCode(code);
    
    if (!room) {
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }
    
    const participantId = uuidv4();
    
    // Create new participant
    const participant: IParticipant = {
      id: participantId,
      roomId: room.id,
      role: 'tourist',
      preferredLanguage,
      name: touristName || 'Tourist'
    };
    
    // Add participant to the room
    const success = await mongoRoomStore.addParticipant(room.id, participant);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
    }
    
    return NextResponse.json({
      roomId: room.id,
      participantId,
      roomName: room.name
    });
    
  } catch (error) {
    console.error('Error joining room:', error);
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
  }
}