import { NextRequest, NextResponse } from 'next/server';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';
import { AuthService } from '@/lib/services/authService';
import { v4 as uuidv4 } from 'uuid';

// GET handler for fetching a room by code
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    
    if (!code) {
      return NextResponse.json({ error: 'Room code is required' }, { status: 400 });
    }
    
    // Get room by code
    const room = await mongoRoomStore.getRoomByCode(code);
    
    if (!room || !room.active) {
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }
    
    return NextResponse.json({
      id: room.id,
      code: room.code,
      name: room.name,
      participantCount: room.participants.length
    });
    
  } catch (error) {
    console.error('Error fetching room:', error);
    return NextResponse.json({ error: 'Failed to fetch room' }, { status: 500 });
  }
}

// POST handler for creating a new room
export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const token = req.headers.get('Authorization')?.split(' ')[1];
    
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await AuthService.getUserFromToken(token);
    
    if (!user || user.role !== 'guide') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Get request body
    const { name, guideId, guideName } = await req.json();
    
    if (!name || !guideId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Create room
    const roomId = uuidv4();
    const roomCode = generateRoomCode();
    
    const room = await mongoRoomStore.createRoom({
      id: roomId,
      code: roomCode,
      name,
      guideId,
      createdAt: new Date(),
      active: true,
      participants: [
        {
          id: guideId,
          roomId,
          role: 'guide',
          name: guideName || user.name,
          userId: user.id
        }
      ],
      createdBy: user.id
    });
    
    // Add room to user's history
    await AuthService.addRoomToUser(user.id, roomId, name, 'guide', roomCode);
    
    return NextResponse.json({
      id: room.id,
      code: room.code,
      name: room.name
    });
    
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
  }
}

// Helper function to generate a 6-digit room code
function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}