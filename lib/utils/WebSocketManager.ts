import { EventEmitter } from 'events'

export interface ConnectionConfig {
  roomId: string;
  participantId: string;
  role: 'guide' | 'tourist';
  roomCode?: string;
  preferredLanguage?: string;
  touristName?: string;
  guideName?: string;
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
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Get server URL - use absolute URL to avoid issues
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin
        : 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/ws`);
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
        this.emit('connected');
        this.sendJoinMessage();
        this.startHeartbeat(); // Start heartbeat when connected
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
        this.stopHeartbeat(); // Stop heartbeat on close
        this.emit('disconnected');
        
        if (this.config && !this.reconnecting) {
          this.scheduleReconnect();
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { message: 'WebSocket connection error' });
      };
    } catch (error) {
      this.stopHeartbeat(); // Ensure heartbeat is stopped on error
      console.error('Error creating WebSocket:', error);
      this.emit('error', { message: 'Failed to create WebSocket connection' });
      throw error;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping' });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private messageQueue: any[] = [];
  private isProcessingQueue = false;

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue[0];
      
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
          this.messageQueue.shift(); // Remove sent message
        } else {
          break; // Stop if connection is not open
        }
      } catch (error) {
        console.error('Error sending message:', error);
        break;
      }
      
      // Add small delay between messages
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isProcessingQueue = false;
  }
  
  private sendJoinMessage(): void {
    if (!this.config) {
      console.error('No connection config set');
      return;
    }
    
    // Get token from localStorage if available
    let token = '';
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('token') || '';
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
      guideName: this.config.guideName,
      token: token // Include token for authentication
    };
    
    console.log('Sending join message:', joinMessage);
    this.sendMessage(joinMessage);
  }
  
  sendMessage(message: any): boolean {
    // Ensure message has a roomId if we have a config
    if (this.config && !message.roomId && message.type !== 'ping') {
      message.roomId = this.config.roomId;
    }
    
    // For transcript messages, add additional information
    if (message.type === 'transcript') {
      message = {
        ...message,
        participantId: this.config?.participantId,
        role: this.config?.role,
        timestamp: Date.now()
      };
    }
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message for later if not connected
      this.messageQueue.push(message);
      return false;
    }
    
    try {
      if (this.messageQueue.length > 0) {
        // Add to queue if there are pending messages
        this.messageQueue.push(message);
        this.processMessageQueue();
      } else {
        // Send immediately if no pending messages
        this.ws.send(JSON.stringify(message));
      }
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      this.messageQueue.push(message);
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
  
  // Add automatic reconnection improvements
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed', { 
        message: 'Maximum reconnection attempts reached',
        shouldReload: true // Signal that page should reload
      });
      return;
    }

    this.reconnecting = true;
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      this.emit('reconnecting', { 
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      
      try {
        if (this.config) {
          await this.connect(this.config);
          // Process any queued messages after reconnection
          this.processMessageQueue();
        }
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.scheduleReconnect();
      } finally {
        this.reconnecting = false;
      }
    }, delay);
  }
  
  // Helper methods for common message types
  sendTranscript(text: string): boolean {
    if (!this.config) return false;
    
    return this.sendMessage({
      type: 'transcript',
      roomId: this.config.roomId,
      text,
      participantId: this.config.participantId,
      role: this.config.role,
      timestamp: Date.now()
    });
  }
  
  sendTouristMessage(text: string, language: string): boolean {
    if (!this.config) return false;
    
    return this.sendMessage({
      type: 'tourist_message',
      roomId: this.config.roomId,
      text,
      language,
      participantId: this.config.participantId
    });
  }

  // Add connection status check
  checkConnection(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendMessage({ type: 'ping' });
    } else if (!this.reconnecting) {
      this.scheduleReconnect();
    }
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