// File: app/api/translate/route.ts
import { NextRequest } from 'next/server';
import WebSocket from 'ws';

const WS_PORT = 3001;
let wsServer: WebSocket.Server | null = null;

// Initialize WebSocket server if it hasn't been created
if (!wsServer) {
  try {
    wsServer = new WebSocket.Server({ port: WS_PORT });
    console.log(`WebSocket server is running on ws://localhost:${WS_PORT}`);

    wsServer.on('connection', (ws) => {
      console.log('Client connected to WebSocket server');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          // Convert audio to text if it's an audio message
          if (data.audio) {
            // For now, we'll just use the audio data as text
            data.text = data.audio;
          }

          // Forward to Python bridge
          const response = await fetch('http://localhost:5000/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: data.text,
              targetLanguage: data.targetLanguage,
              context: data.context
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          ws.send(JSON.stringify(result));
        } catch (error) {
          console.error('Translation error:', error);
          ws.send(JSON.stringify({ 
            error: 'Translation failed. Please ensure the Python server is running.' 
          }));
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected from WebSocket server');
      });
    });
  } catch (error) {
    console.error('Failed to start WebSocket server:', error);
  }
}

export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({
    wsPort: WS_PORT,
    wsUrl: `ws://localhost:${WS_PORT}`
  }), {
    headers: {
      'Content-Type': 'application/json',
    }
  });
}