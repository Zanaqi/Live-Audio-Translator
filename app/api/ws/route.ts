import { NextRequest } from 'next/server';
import { Server as WebSocketServer } from 'ws';
import { TranslationBridge } from '@/lib/services/TranslationBridge';
import { mongoRoomStore } from '@/lib/store/mongoRoomStore';

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
    translationBridges: Record<string, TranslationBridge>;
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

// Use the global variables
const { connections, translationBridges } = global.websocketServer;

// Initialize or get WebSocket server - safer approach
function getWebSocketServer(): WebSocketServer {
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
      }
    }
  }
  
  return global.websocketServer.server as WebSocketServer;
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
    participantInRoom.socketId = ws.id || 'unknown'; // If ws has an id property
    await mongoRoomStore.getRoom(roomId); // Refresh room data after update
  }
  
  connections.push(connection);
  
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
  const guideConnection = connections.find(c => 
    c.roomId === roomId && c.role === 'guide' && c.ws === ws
  );
  
  if (!guideConnection) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Not authorized as guide for this room' 
    }));
    return;
  }
  
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
  const tourists = connections.filter(c => 
    c.roomId === roomId && c.role === 'tourist'
  );
  
  // Send original text to all participants
  broadcastToRoom(roomId, {
    type: 'transcript',
    text,
    source: 'guide'
  });
  
  // Translate for each tourist
  for (const tourist of tourists) {
    if (!tourist.preferredLanguage) continue;
    
    try {
      // Get or create translation bridge for this language
      const bridgeKey = `${roomId}-${tourist.preferredLanguage}`;
      
      if (!translationBridges[bridgeKey]) {
        translationBridges[bridgeKey] = new TranslationBridge();
        
        // Set up event listeners
        translationBridges[bridgeKey].on('translation', (translationData: any) => {
          // Send to specific tourist
          tourist.ws.send(JSON.stringify({
            type: 'translation',
            text: translationData.translation,
            sourceLanguage: 'English', // Assuming guide speaks English
            targetLanguage: tourist.preferredLanguage
          }));
        });
        
        translationBridges[bridgeKey].on('error', (err: any) => {
          tourist.ws.send(JSON.stringify({
            type: 'error',
            message: 'Translation failed',
            details: err.message
          }));
        });
      }
      
      // Send text for translation
      const textBlob = new Blob([text], { type: 'text/plain' });
      await translationBridges[bridgeKey].translate(textBlob, tourist.preferredLanguage);
      
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
  const touristConnection = connections.find(c => 
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
  const connectionIndex = connections.findIndex(c => c.ws === ws);
  
  if (connectionIndex === -1) return;
  
  const { roomId, participantId, role } = connections[connectionIndex];
  
  // Remove from connections
  connections.splice(connectionIndex, 1);
  
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
  
  // Clean up translation bridges if this was the last tourist for a language
  const languagesToCleanup = Object.keys(translationBridges)
    .filter(key => key.startsWith(`${roomId}-`));
    
  for (const key of languagesToCleanup) {
    const language = key.split('-')[1];
    
    // Check if any tourists still need this language
    const stillNeeded = connections.some(c => 
      c.roomId === roomId && 
      c.role === 'tourist' && 
      c.preferredLanguage === language
    );
    
    if (!stillNeeded) {
      translationBridges[key].disconnect();
      delete translationBridges[key];
    }
  }
}

// Broadcast message to all participants in a room
function broadcastToRoom(roomId: string, message: any, exceptParticipantId?: string) {
    const roomConnections = global.websocketServer.connections.filter(c => 
      c.roomId === roomId && 
      (!exceptParticipantId || c.participantId !== exceptParticipantId)
    );
    
    for (const connection of roomConnections) {
      connection.ws.send(JSON.stringify(message));
    }
}

export async function GET(req: NextRequest) {
    return new Response(JSON.stringify({
      wsUrl: `ws://localhost:${WS_PORT}`,
      activeConnections: global.websocketServer.connections.length,
      activeRooms: Array.from(new Set(connections.map(c => c.roomId))).length,
      registeredRooms: (await mongoRoomStore.getAllRooms()).filter(r => r.active).length,
      serverActive: global.websocketServer.server !== null
    }), {
      headers: {
        'Content-Type': 'application/json',
      }
    });
}