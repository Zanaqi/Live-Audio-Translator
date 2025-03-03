// lib/utils/WebSocketManager.ts
import { EventEmitter } from 'events'

export interface ConnectionConfig {
  roomId: string;
  participantId: string;
  role: 'guide' | 'tourist';
  roomCode?: string;
  preferredLanguage?: string;
  touristName?: string; // Added to ensure we send all needed data
  guideName?: string; // Added to ensure we send all needed data
}

class WebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: ConnectionConfig | null = null;
  private wsUrl: string = '';
  private reconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const response = await fetch('/api/ws');
      const { wsUrl } = await response.json();
      this.wsUrl = wsUrl;
      this.initialized = true;
      console.log('WebSocket manager initialized with URL:', this.wsUrl);
    } catch (error) {
      console.error('Error getting WebSocket URL:', error);
      throw new Error('Could not initialize WebSocket connection');
    }
  }

  async connect(config: ConnectionConfig): Promise<void> {
    console.log('Connecting with config:', config);
    
    // Store config first so we have it for reconnection attempts
    this.config = config;
    
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Already connected, just re-send join message
      this.sendJoinMessage();
      return;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('WebSocket connected, sending join message');
        this.emit('connected');
        
        // Send join message with complete config
        this.sendJoinMessage();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);
          
          this.emit('message', data);
          
          // Also emit specific event types
          if (data.type) {
            this.emit(data.type, data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.emit('error', { message: 'Failed to parse WebSocket message' });
        }
      };
      
      this.ws.onclose = (event) => {
        console.log('WebSocket closed, code:', event.code, 'reason:', event.reason);
        this.emit('disconnected');
        
        // Try to reconnect if this wasn't a deliberate disconnect
        if (this.config && !this.reconnecting) {
          this.scheduleReconnect();
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { message: 'WebSocket connection error' });
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.emit('error', { message: 'Failed to create WebSocket connection' });
      throw error;
    }
  }
  
  private sendJoinMessage(): void {
    if (!this.config) {
      console.error('No connection config set');
      return;
    }
    
    // Send a complete join message with all necessary fields
    const joinMessage = {
      type: 'join',
      roomId: this.config.roomId,
      participantId: this.config.participantId,
      role: this.config.role,
      roomCode: this.config.roomCode,
      preferredLanguage: this.config.preferredLanguage,
      touristName: this.config.touristName,
      guideName: this.config.guideName
    };
    
    console.log('Sending join message:', joinMessage);
    this.sendMessage(joinMessage);
  }
  
  sendMessage(message: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message - WebSocket not connected');
      this.emit('error', { message: 'WebSocket is not connected' });
      return false;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      this.emit('error', { message: 'Failed to send message' });
      return false;
    }
  }
  
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      // Clear config to prevent reconnection
      this.config = null;
      
      this.ws.close();
      this.ws = null;
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed', { message: 'Maximum reconnection attempts reached' });
      return;
    }
    
    this.reconnecting = true;
    
    // Exponential backoff for reconnect attempts
    const delay = Math.min(1000 * (2 ** this.reconnectAttempts), 30000);
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      this.emit('reconnecting', { attempt: this.reconnectAttempts });
      
      try {
        if (this.config) {
          await this.connect(this.config);
        }
      } catch (error) {
        console.error('Reconnection failed:', error);
        // Try again if we haven't reached the limit
        this.scheduleReconnect();
      } finally {
        this.reconnecting = false;
      }
    }, delay);
  }
  
  // Helper methods for common message types
  sendSpeech(text: string): boolean {
    if (!this.config) return false;
    
    return this.sendMessage({
      type: 'speech',
      roomId: this.config.roomId,
      text
    });
  }
  
  sendTouristMessage(text: string, language: string): boolean {
    if (!this.config) return false;
    
    return this.sendMessage({
      type: 'tourist_message',
      roomId: this.config.roomId,
      text,
      language
    });
  }
  
  // Check if connected
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
  
  // Get current configuration
  getConfig(): ConnectionConfig | null {
    return this.config;
  }
}

// Create a singleton instance
export const wsManager = new WebSocketManager();