import { WebSocket, WebSocketServer } from "ws";
import fetch from "node-fetch";
import { ContextManager } from "./utils/ContextManager";
import { TranslationAdapter } from "./utils/TranslationAdapter";
import { evaluateTranslationImprovement } from "../../lib/utils/translationEvaluator";

interface ParticipantInfo {
  ws: WebSocket;
  roomId: string;
  role: "guide" | "tourist";
  preferredLanguage?: string;
  name: string;
  userId?: string;
}

interface MessageData {
  type: string;
  roomId: string;
  text?: string;
  participantId?: string;
  role?: string;
  preferredLanguage?: string;
  language?: string;
  sourceLanguage?: string;
  [key: string]: any;
}

interface TranslationResult {
  translation: string;
  error?: string;
}

const WS_PORT = 3002;
const wss = new WebSocketServer({ port: WS_PORT });

// Store active rooms, context managers, and translation adapters
const rooms = new Map<string, Map<string, ParticipantInfo>>();
const roomContexts = new Map<string, ContextManager>();
const translationAdapters = new Map<string, TranslationAdapter>();

// Store participant information
const participants = new Map<string, ParticipantInfo>();

console.log("WebSocket server started on port 3002");

wss.on("connection", (ws: WebSocket) => {
  console.log("New connection established");
  let participantId: string | null = null;
  let roomId: string | null = null;

  // Message handler
  ws.on("message", async (message: WebSocket.Data) => {
    try {
      const data: MessageData = JSON.parse(message.toString());
      console.log("Received message:", data.type);

      switch (data.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "join":
          handleJoin(ws, data);
          participantId = data.participantId || null;
          roomId = data.roomId || null;

          // Initialize context manager for the room if it doesn't exist
          if (roomId && !roomContexts.has(roomId)) {
            roomContexts.set(roomId, new ContextManager("museum_tour")); // Default domain
            translationAdapters.set(roomId, new TranslationAdapter());
          }
          break;

        case "transcript":
          if (data.text && data.roomId) {
            await handleTranscript(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Missing required fields for transcript",
              })
            );
          }
          break;

        case "tourist_message":
          handleTouristMessage(ws, data);
          break;

        default:
          console.warn("Unknown message type:", data.type);
          ws.send(
            JSON.stringify({ type: "error", message: "Unknown message type" })
          );
          break;
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Error processing message",
        })
      );
    }
  });

  // Handle disconnect
  ws.on("close", () => {
    if (roomId && participantId) {
      // Remove participant from room
      handleParticipantLeave(roomId, participantId);
    }
  });
});

// Handler for join message
function handleJoin(ws: WebSocket, data: MessageData): void {
  const { roomId, participantId, role, preferredLanguage, name, userId } = data;

  if (!roomId || !participantId || !role) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Missing required fields for join",
      })
    );
    return;
  }

  // Store participant info
  participants.set(participantId, {
    ws,
    roomId,
    role: role as "guide" | "tourist",
    preferredLanguage,
    name: name || "Anonymous",
    userId,
  });

  // Create room if not exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map<string, ParticipantInfo>());
  }

  // Add participant to room
  const room = rooms.get(roomId)!;
  room.set(participantId, {
    ws,
    roomId,
    role: role as "guide" | "tourist",
    preferredLanguage,
    name: name || "Anonymous",
    userId,
  });

  // Notify all room participants about new join
  broadcastToRoom(roomId, {
    type: "participant_joined",
    participantId,
    role,
    participantCount: room.size,
  });

  // Confirm join
  ws.send(
    JSON.stringify({
      type: "joined",
      roomId,
      participantCount: room.size,
    })
  );

  console.log(`Participant ${participantId} joined room ${roomId} as ${role}`);
}

// Handle participant leave
function handleParticipantLeave(roomId: string, participantId: string): void {
  // Remove participant from tracking
  participants.delete(participantId);

  if (rooms.has(roomId)) {
    const room = rooms.get(roomId)!;

    // Remove from room
    room.delete(participantId);

    // Broadcast leave
    broadcastToRoom(roomId, {
      type: "participant_left",
      participantId,
      participantCount: room.size,
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
async function handleTranscript(
  ws: WebSocket,
  data: MessageData
): Promise<void> {
  const { roomId, text, participantId } = data;

  if (!roomId || !text) {
    ws.send(
      JSON.stringify({ type: "error", message: "Missing required fields" })
    );
    return;
  }

  console.log(`Processing transcript in room ${roomId}: "${text}"`);

  try {
    // Update context with new transcript
    const contextManager = roomContexts.get(roomId);
    if (!contextManager) {
      throw new Error("Context manager not found for room");
    }
    const updatedContext = contextManager.updateContext(text);

    // Broadcast original transcript to all in the room
    broadcastToRoom(roomId, {
      type: "transcript",
      text,
      fromParticipantId: participantId,
    });

    // Get all tourists in the room
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId)!;

      // For each tourist, translate the transcript
      for (const [touristId, tourist] of room.entries()) {
        if (tourist.role === "tourist" && tourist.preferredLanguage) {
          try {
            console.log(
              `Translating for tourist ${touristId} to ${tourist.preferredLanguage}`
            );

            const baseTranslation = await callTranslationService(
              text,
              tourist.preferredLanguage
            );

            if (!baseTranslation) {
              throw new Error("Empty translation received");
            }

            // Apply context adaptation
            const translationAdapter = translationAdapters.get(roomId);
            if (!translationAdapter) {
              throw new Error("Translation adapter not found for room");
            }

            const adaptedTranslation = translationAdapter.adaptTranslation(
              baseTranslation,
              updatedContext,
              tourist.preferredLanguage,
              text
            );

            // Evaluate the improvement (if base and adapted translations differ)
            let evaluationResults = null;
            if (baseTranslation !== adaptedTranslation.text) {
              evaluationResults = await evaluateTranslationImprovement(
                text,
                baseTranslation,
                adaptedTranslation.text
              );
            }

            // Send translated text to tourist
            tourist.ws.send(
              JSON.stringify({
                type: "translation",
                text: adaptedTranslation.text,
                baseTranslation: baseTranslation,
                originalText: text,
                language: tourist.preferredLanguage,
                confidence: adaptedTranslation.confidence,
                contexts: adaptedTranslation.contexts,
                evaluation: evaluationResults,
              })
            );

            console.log(
              `Successfully translated for ${touristId} to ${tourist.preferredLanguage}`
            );
          } catch (error) {
            console.error(`Translation error for ${touristId}:`, error);
            tourist.ws.send(
              JSON.stringify({
                type: "error",
                message:
                  "Translation failed: " +
                  (error instanceof Error ? error.message : "Unknown error"),
              })
            );
          }
        }
      }
    }
  } catch (error) {
    console.error("Error handling transcript:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        message:
          "Failed to process transcript: " +
          (error instanceof Error ? error.message : "Unknown error"),
      })
    );
  }
}

// Call existing translation service
async function callTranslationService(
  text: string,
  targetLanguage: string
): Promise<string> {
  try {
    console.log(
      `Calling translation service for text: "${text}" to language: ${targetLanguage}`
    );

    const requestBody = {
      text,
      targetLanguage,
      action: "translate",
    };

    console.log("Translation request body:", requestBody);

    const response = await fetch("http://localhost:5000/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Translation service error response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(
        `Translation service error: ${response.status} - ${errorText}`
      );
    }

    const result = (await response.json()) as TranslationResult;
    console.log("Translation service response:", result);

    if (result.error) {
      throw new Error(result.error);
    }

    return result.translation;
  } catch (error) {
    console.error("Translation service error:", error);
    throw error;
  }
}

// Handle tourist message
function handleTouristMessage(ws: WebSocket, data: MessageData): void {
  const { roomId, text, participantId, language } = data;

  if (!roomId || !text) {
    ws.send(
      JSON.stringify({ type: "error", message: "Missing required fields" })
    );
    return;
  }

  // Send to all guides in the room
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId)!;

    for (const [memberId, member] of room.entries()) {
      if (member.role === "guide") {
        member.ws.send(
          JSON.stringify({
            type: "tourist_message",
            text,
            fromParticipantId: participantId,
            language,
          })
        );
      }
    }
  }
}

// Broadcast message to all participants in a room
function broadcastToRoom(roomId: string, message: any): void {
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId)!;

    for (const [_, participant] of room.entries()) {
      try {
        participant.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error broadcasting message:", error);
      }
    }
  }
}

export default wss;
