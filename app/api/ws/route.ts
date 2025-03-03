// app/api/ws/route.ts - with null checks
import { NextRequest } from 'next/server';
import { Server as WebSocketServer } from 'ws';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';
import { translateText } from '@/lib/services/ServerTranslation';

const WS_PORT = 3002;

// In-memory storage of connections
interface Connection {
  ws: WebSocket;
  roomId: string;
  participantId: string;
  role: 'guide' | 'tourist';
  preferredLanguage?: string;
}

// Global state management with proper initialization
declare global {
  var websocketServer: {
    server: WebSocketServer | null;
    connections: Connection[];
    translationBridges: Record<string, any>;
  };
}

// Initialize global state if it doesn't exist
if (!global.websocketServer) {
  global.websocketServer = {
    server: null,
    connections: [],
    translationBridges: {}
  };
}

// Initialize or get WebSocket server - safer approach
function getWebSocketServer(): WebSocketServer | null {
  if (!global.websocketServer.server) {
    try {
      const server = new WebSocketServer({ port: WS_PORT });
      console.log(`WebSocket server for tour rooms is running on ws://localhost:${WS_PORT}`);

      server.on('connection', (ws: any) => {
        console.log('Client connected to tour room WebSocket server');
        
        // Handle connection setup
        ws.on('message', async (message: any) => {
          try {
            const data = JSON.parse(message.toString());
            console.log('WebSocket message received:', data);
            
            // Handle different message types
            switch (data.type) {
              case 'join':
                await handleJoin(ws, data);
                break;
                
              case 'speech':
                await handleSpeech(ws, data);
                break;
                
              case 'tourist_message':
                await handleTouristMessage(ws, data);
                break;
                
              case 'leave':
                await handleLeave(ws);
                break;
                
              default:
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Unknown message type' 
                }));
            }
            
          } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to process message' 
            }));
          }
        });
        
        ws.on('close', () => {
          handleLeave(ws);
          console.log('Client disconnected from tour room WebSocket server');
        });
      });

      server.on('error', (error: any) => {
        console.error('WebSocket server error:', error);
        
        if (error.code === 'EADDRINUSE') {
          console.log(`Port ${WS_PORT} is already in use. Using existing server.`);
        }
      });
      
      global.websocketServer.server = server;
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
      
      if ((error as any).code === 'EADDRINUSE') {
        console.log(`Port ${WS_PORT} is already in use. Using existing connection.`);
        // Don't set server to null here, we might be able to reuse it
      }
    }
  }
  
  return global.websocketServer.server;
}

// Try to get the WebSocket server
const wsServer = getWebSocketServer();

// Handle participant joining a room
async function handleJoin(ws: any, data: any) {
  console.log('Processing join request:', data);
  
  const { roomId, participantId, role, preferredLanguage, roomCode, guideName, touristName } = data;
  
  if (!roomId && !roomCode) {
    console.error('Missing both roomId and roomCode for joining');
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Missing room information for joining' 
    }));
    return;
  }
  
  if (!participantId || !role) {
    console.error('Missing participantId or role for joining');
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Missing required fields for joining' 
    }));
    return;
  }
  
  try {
    // Verify the room exists - first try by ID
    let room = roomId ? await mongoRoomStore.getRoom(roomId) : null;
    
    // If not found by ID, try by code
    if (!room && roomCode) {
      console.log(`Room not found by ID, trying code: ${roomCode}`);
      room = await mongoRoomStore.getRoomByCode(roomCode);
    }
    
    if (!room || !room.active) {
      console.error('Room not found or inactive:', roomId || roomCode);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Room not found or inactive' 
      }));
      return;
    }

    console.log('Found room:', room.id, 'Code:', room.code, 'Participants:', room.participants.length);
    
    // Add connection to our list immediately to track this websocket
    const connectionObj = {
      ws,
      roomId: room.id,
      participantId,
      role,
      preferredLanguage
    };
    
    // Remove any existing connection for this participant
    const existingConnIndex = global.websocketServer.connections.findIndex(
      c => c.participantId === participantId && c.ws !== ws
    );
    
    if (existingConnIndex !== -1) {
      console.log(`Removing existing connection for participant: ${participantId}`);
      global.websocketServer.connections.splice(existingConnIndex, 1);
    }
    
    // Check participant authorization
    if (role === 'guide') {
      // For guides, check if this is the room creator
      if (room.guideId !== participantId) {
        console.error(`Guide authentication failed: ${participantId} is not the owner of room ${room.id}`);
        console.log('Room guideId:', room.guideId, 'Participant ID:', participantId);
        
        // Check if we should update guideId (for development or if using a new device)
        // In production, you'd want stricter authentication
        const existingGuide = room.participants.find(p => p.role === 'guide');
        if (!existingGuide) {
          console.log('No guide found in room, accepting new guide');
          // Add this guide as the room owner (development only)
          await mongoRoomStore.updateRoomGuide(room.id, participantId);
        } else if (guideName) {
          console.log('Guide exists but accepting new connection for development purposes');
          // Update existing guide for development purposes
          // In production, this should be more secure
          await mongoRoomStore.updateRoomGuide(room.id, participantId);
        } else {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Not authorized as guide for this room' 
          }));
          return;
        }
      }
    } else if (role === 'tourist') {
      // Check if this tourist already exists in the room
      const existingParticipant = room.participants.find(p => p.id === participantId);
      
      // If tourist doesn't exist, add them if we have a name
      if (!existingParticipant && touristName) {
        // Add to MongoDB
        await mongoRoomStore.addParticipant(room.id, {
          id: participantId,
          roomId: room.id,
          role: 'tourist',
          preferredLanguage: preferredLanguage || 'French',
          name: touristName
        });
        
        // Refetch the room to get updated participant count
        const updatedRoom = await mongoRoomStore.getRoom(room.id);
        if (updatedRoom) {
          room = updatedRoom;
        }
      }
    }
    
    // Add to global connections
    global.websocketServer.connections.push(connectionObj);
    
    // Send confirmation
    ws.send(JSON.stringify({ 
      type: 'joined', 
      roomId: room.id, 
      participantCount: room.participants.length
    }));
    
    // Notify room participants
    broadcastToRoom(room.id, {
      type: 'participant_joined',
      participantId,
      role,
      participantCount: room.participants.length
    }, participantId);
    
    console.log('Participant joined successfully:', participantId, 'Role:', role, 'Room:', room.id);
    
  } catch (error) {
    console.error('Error joining room:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Server error while joining room' 
    }));
  }
}

// Handle speech from guide
async function handleSpeech(ws: any, data: any) {
  const { roomId, text } = data;
  
  if (!roomId || !text) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Missing required fields for speech' 
    }));
    return;
  }
  
  try {
    // Try to find the room by ID first
    let room = await mongoRoomStore.getRoom(roomId);
    
    // If not found, try by code (in case the roomId is actually a room code)
    if (!room) {
      room = await mongoRoomStore.getRoomByCode(roomId);
    }
    
    if (!room || !room.active) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Room not found or inactive' 
      }));
      return;
    }
    
    // Find which participant is sending this message
    const connection = global.websocketServer.connections.find(c => c.ws === ws);
    if (!connection) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Connection not found' 
      }));
      return;
    }
    
    // Authenticate the sender
    const isGuide = room.participants.some(p => 
      p.role === 'guide' && p.id === connection.participantId
    );
    
    if (!isGuide) {
      // For development, we'll allow any sender with role 'guide'
      const hasGuideRole = connection.role === 'guide';
      
      if (!hasGuideRole) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Not authorized as guide for this room' 
        }));
        return;
      }
      
      console.log('Warning: Allowing unregistered guide to send messages (development only)');
    }
    
    // Process the message
    await processGuideMessage(ws, room.id, text);
    
  } catch (error) {
    console.error('Error processing speech:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Server error while processing speech' 
    }));
  }
}

// Helper function to process guide messages
async function processGuideMessage(ws: any, roomId: string, text: string) {
  try {
    // Get all tourists in the room
    const tourists = global.websocketServer.connections.filter(c => 
      c.roomId === roomId && c.role === 'tourist'
    );
    
    // Send original text to all participants
    broadcastToRoom(roomId, {
      type: 'transcript',
      text,
      source: 'guide'
    });
    
    console.log(`Processing message for ${tourists.length} tourists in room ${roomId}`);
    
    // Translate for each tourist
    for (const tourist of tourists) {
      if (!tourist.preferredLanguage) continue;
      
      try {
        // Direct translation approach
        console.log(`Translating to ${tourist.preferredLanguage} for tourist ${tourist.participantId}`);
        const translation = await translateText(text, tourist.preferredLanguage);
        
        // Send to specific tourist
        tourist.ws.send(JSON.stringify({
          type: 'translation',
          text: translation,
          sourceLanguage: 'English',
          targetLanguage: tourist.preferredLanguage
        }));
        
      } catch (error) {
        console.error(`Translation error for ${tourist.participantId}:`, error);
        tourist.ws.send(JSON.stringify({
          type: 'error',
          message: 'Translation failed'
        }));
      }
    }
  } catch (error) {
    console.error('Error in processGuideMessage:', error);
    throw error;
  }
}

// Handle message from tourist
async function handleTouristMessage(ws: any, data: any) {
  const { roomId, text, language } = data;
  
  if (!roomId || !text) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Missing required fields for message' 
    }));
    return;
  }
  
  // Find tourist's connection
  const touristConnection = global.websocketServer.connections.find(c => 
    c.roomId === roomId && c.role === 'tourist' && c.ws === ws
  );
  
  if (!touristConnection) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Not authorized as tourist for this room' 
    }));
    return;
  }
  
  // Get room
  const room = await mongoRoomStore.getRoom(roomId);
  if (!room || !room.active) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Room not found or inactive' 
    }));
    return;
  }
  
  // Send to all participants (including guide)
  broadcastToRoom(roomId, {
    type: 'tourist_message',
    text,
    language,
    participantId: touristConnection.participantId
  });
}

// Handle participant leaving
async function handleLeave(ws: any) {
  const connectionIndex = global.websocketServer.connections.findIndex(c => c.ws === ws);
  
  if (connectionIndex === -1) return;
  
  const { roomId, participantId, role } = global.websocketServer.connections[connectionIndex];
  
  // Remove from connections
  global.websocketServer.connections.splice(connectionIndex, 1);
  
  try {
    // Only remove tourists from the MongoDB, not guides
    const room = await mongoRoomStore.getRoom(roomId);
    if (room && role === 'tourist') {
      await mongoRoomStore.removeParticipant(roomId, participantId);
      
      // Notify room participants about participant count change (subtract 1 for the one that just left)
      const updatedParticipantCount = room.participants.length - 1;
      
      broadcastToRoom(roomId, {
        type: 'participant_left',
        participantId,
        role,
        participantCount: updatedParticipantCount >= 0 ? updatedParticipantCount : 0
      });
    }
  } catch (error) {
    console.error('Error handling leave:', error);
  }
}

// Broadcast message to all participants in a room
function broadcastToRoom(roomId: string, message: any, exceptParticipantId?: string) {
  const roomConnections = global.websocketServer.connections.filter(c => 
    c.roomId === roomId && 
    (!exceptParticipantId || c.participantId !== exceptParticipantId)
  );
  
  for (const connection of roomConnections) {
    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Error sending message to participant ${connection.participantId}:`, error);
    }
  }
}

export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({
    wsUrl: `ws://localhost:${WS_PORT}`,
    activeConnections: global.websocketServer.connections.length,
    activeRooms: Array.from(new Set(global.websocketServer.connections.map(c => c.roomId))).length,
    registeredRooms: (await mongoRoomStore.getAllRooms()).filter(r => r.active).length,
    serverActive: global.websocketServer.server !== null
  }), {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}