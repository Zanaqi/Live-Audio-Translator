// app/api/ws/route.ts
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
  const { roomId, participantId, role, preferredLanguage } = data;
  
  if (!roomId || !participantId || !role) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Missing required fields for joining' 
    }));
    return;
  }
  
  // Verify the room exists
  const room = await mongoRoomStore.getRoom(roomId);
  if (!room) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Room not found' 
    }));
    return;
  }
  
  // Add to connections
  const connection: Connection = {
    ws,
    roomId,
    participantId,
    role,
    preferredLanguage
  };
  
  // Update participant's socketId in the room if needed
  const participantInRoom = room.participants.find(p => p.id === participantId);
  if (participantInRoom) {
    participantInRoom.socketId = ws.id || 'unknown';
    // No need to update MongoDB here as we're just tracking for this session
  }
  
  global.websocketServer.connections.push(connection);
  
  // Send confirmation
  ws.send(JSON.stringify({ 
    type: 'joined', 
    roomId, 
    participantCount: room.participants.length
  }));
  
  // Notify room participants
  broadcastToRoom(roomId, {
    type: 'participant_joined',
    participantId,
    role,
    participantCount: room.participants.length
  }, participantId);
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
  
  // Find guide's connection
  const guideConnection = global.websocketServer.connections.find(c => 
    c.roomId === roomId && c.role === 'guide' && c.ws === ws
  );
  
  // If we can't find the guide connection by roomId (UUID), check if this is a room code
  if (!guideConnection) {
    // Try to find the room by code first
    const room = await mongoRoomStore.getRoomByCode(roomId);
    if (room) {
      // Check if this guide is connected to this room
      const guideInRoom = global.websocketServer.connections.find(c =>
        c.roomId === room.id && c.role === 'guide' && c.ws === ws
      );
      
      if (guideInRoom) {
        // Process the message using the actual room ID
        await processGuideMessage(ws, room.id, text);
        return;
      }
    }
    
    // If we still can't authorize, send an error
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Not authorized as guide for this room' 
    }));
    return;
  }
  
  // Process the message if guide is authorized
  await processGuideMessage(ws, roomId, text);
}

// Helper function to process guide messages
async function processGuideMessage(ws: any, roomId: string, text: string) {
  // Verify the room exists
  const room = await mongoRoomStore.getRoom(roomId);
  if (!room || !room.active) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Room not found or inactive' 
    }));
    return;
  }
  
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
  
  // Remove from room if still exists
  const room = await mongoRoomStore.getRoom(roomId);
  if (room) {
    await mongoRoomStore.removeParticipant(roomId, participantId);
    
    // If guide left, deactivate the room
    if (role === 'guide') {
      await mongoRoomStore.deactivateRoom(roomId);
    }
    
    // Notify room participants
    broadcastToRoom(roomId, {
      type: 'participant_left',
      participantId,
      role,
      participantCount: room.participants.length - 1 // Subtract the one that just left
    });
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