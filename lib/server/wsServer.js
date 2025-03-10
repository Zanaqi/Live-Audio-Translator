const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3002 });

// Store active rooms and connections
const rooms = new Map();

// Store participant information
const participants = new Map();

console.log('WebSocket server started on port 3002');

wss.on('connection', (ws) => {
  console.log('New connection established');
  let participantId = null;
  let roomId = null;

  // Message handler
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data.type);

      switch (data.type) {
        case 'ping':
          // Respond with pong to keep connection alive
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'join':
          // Handle room joining
          handleJoin(ws, data);
          participantId = data.participantId;
          roomId = data.roomId;
          break;

        case 'transcript':
          // Handle transcript message from guide
          await handleTranscript(ws, data);
          break;

        case 'tourist_message':
          // Handle message from tourist to guide
          handleTouristMessage(ws, data);
          break;

        default:
          console.warn('Unknown message type:', data.type);
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Error processing message' }));
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    if (roomId && participantId) {
      // Remove participant from room
      handleParticipantLeave(roomId, participantId);
    }
  });
});

// Handler for join message
function handleJoin(ws, data) {
  const { roomId, participantId, role, preferredLanguage } = data;
  
  // Store participant info
  participants.set(participantId, {
    ws,
    roomId,
    role,
    preferredLanguage
  });
  
  // Create room if not exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  
  // Add participant to room
  const room = rooms.get(roomId);
  room.set(participantId, { ws, role, preferredLanguage });
  
  // Notify all room participants about new join
  broadcastToRoom(roomId, {
    type: 'participant_joined',
    participantId,
    role,
    participantCount: room.size
  });
  
  // Confirm join
  ws.send(JSON.stringify({
    type: 'joined',
    roomId,
    participantCount: room.size
  }));
  
  console.log(`Participant ${participantId} joined room ${roomId} as ${role}`);
}

// Handle participant leave
function handleParticipantLeave(roomId, participantId) {
  // Remove participant from tracking
  participants.delete(participantId);
  
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    
    // Remove from room
    room.delete(participantId);
    
    // Broadcast leave
    broadcastToRoom(roomId, {
      type: 'participant_left',
      participantId,
      participantCount: room.size
    });
    
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} removed (empty)`);
    }
    
    console.log(`Participant ${participantId} left room ${roomId}`);
  }
}

// Handle transcript message (from guide)
async function handleTranscript(ws, data) {
  const { roomId, text, participantId } = data;
  
  if (!roomId || !text) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
    return;
  }
  
  console.log(`Processing transcript in room ${roomId}: "${text}"`);
  
  try {
    // Broadcast original transcript to all in the room
    broadcastToRoom(roomId, {
      type: 'transcript',
      text,
      fromParticipantId: participantId
    });
    
    // Get all tourists in the room
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      
      // For each tourist, translate the transcript
      for (const [touristId, tourist] of room.entries()) {
        if (tourist.role === 'tourist' && tourist.preferredLanguage) {
          try {
            console.log(`Translating for tourist ${touristId} to ${tourist.preferredLanguage}`);
            const translatedText = await callTranslationService(text, tourist.preferredLanguage);
            
            if (!translatedText) {
              throw new Error('Empty translation received');
            }
            
            // Send translated text to tourist
            tourist.ws.send(JSON.stringify({
              type: 'translation',
              text: translatedText,
              originalText: text,
              language: tourist.preferredLanguage
            }));
            
            console.log(`Successfully translated for ${touristId} to ${tourist.preferredLanguage}`);
          } catch (error) {
            console.error(`Translation error for ${touristId}:`, error);
            tourist.ws.send(JSON.stringify({
              type: 'error',
              message: 'Translation failed: ' + error.message
            }));
          }
        }
      }
    }
  } catch (error) {
    console.error('Error handling transcript:', error);
    ws.send(JSON.stringify({ 
      type: 'error',
      message: 'Failed to process transcript: ' + error.message 
    }));
  }
}

// Call existing translation service
async function callTranslationService(text, targetLanguage) {
  try {
    console.log(`Calling translation service for text: "${text}" to language: ${targetLanguage}`);
    
    const requestBody = {
      text,
      targetLanguage,
      action: 'translate'
    };
    
    console.log('Translation request body:', requestBody);

    const response = await fetch('http://localhost:5000/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Translation service error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Translation service error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Translation service response:', result);

    if (result.error) {
      throw new Error(result.error);
    }
    
    return result.translation;
  } catch (error) {
    console.error('Translation service error:', error);
    throw error;
  }
}

// Handle tourist message
function handleTouristMessage(ws, data) {
  const { roomId, text, participantId, language } = data;
  
  if (!roomId || !text) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
    return;
  }
  
  // Send to all guides in the room
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    
    for (const [memberId, member] of room.entries()) {
      if (member.role === 'guide') {
        member.ws.send(JSON.stringify({
          type: 'tourist_message',
          text,
          fromParticipantId: participantId,
          language
        }));
      }
    }
  }
}

// Broadcast message to all participants in a room
function broadcastToRoom(roomId, message) {
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    
    for (const [_, participant] of room.entries()) {
      try {
        participant.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    }
  }
}

module.exports = wss;