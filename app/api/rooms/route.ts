import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';

// Create a new room
export async function POST(req: NextRequest) {
    try {
      const { name, guideId, guideName } = await req.json();
      
      if (!name || !guideId) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      
      const roomId = uuidv4(); // Generate roomId first
      
      const room = await mongoRoomStore.createRoom({
        name,
        guideId,
        participants: [{
          id: uuidv4(),
          roomId: roomId, // Set the roomId here
          role: 'guide',
          name: guideName || 'Tour Guide',
        }],
        active: true
      });
      
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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    
    if (!code) {
      return NextResponse.json({ error: 'Room code is required' }, { status: 400 });
    }
    
    const room = await mongoRoomStore.getRoomByCode(code);
    
    if (!room) {
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }
    
    return NextResponse.json({
      id: room.id,
      code: room.code,
      name: room.name,
      participantCount: room.participants.length
    });
    
  } catch (error) {
    console.error('Error getting room:', error);
    return NextResponse.json({ error: 'Failed to get room' }, { status: 500 });
  }
}