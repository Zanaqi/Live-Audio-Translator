import { EventEmitter } from 'events';

export class TranslationBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private isConnecting = false;

  constructor() {
    super();
    this.initializeConnection();
  }

  private async initializeConnection() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const response = await fetch('/api/translate');
      const { wsUrl } = await response.json();
      this.connect(wsUrl);
    } catch (error) {
      console.error('Failed to get WebSocket server info:', error);
      this.isConnecting = false;
      this.emit('error', error);
    }
  }

  private connect(wsUrl: string) {
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to WebSocket server');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit('translation', data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.emit('error', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        this.ws = null;
        this.isConnecting = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.isConnecting = false;
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && !this.isConnecting) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      console.log(`Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms`);
      
      setTimeout(() => {
        this.reconnectAttempts++;
        this.initializeConnection();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
    }
  }

  public async translate(text: Blob | string, targetLanguage: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      action: 'translate',
      text: typeof text === 'string' ? text : await this.blobToText(text),
      targetLanguage,
      options: {
        // Add specific options for Chinese translation
        useTraditional: false,  // Set to true for Traditional Chinese
        toneMarks: true        // Include tone marks in Pinyin
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  // Add method to handle Chinese-specific features
  private processChineseTranslation(translation: string): string {
    // Add processing for Chinese characters if needed
    // For example, converting between simplified and traditional
    return translation;
  }

  private async blobToText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.removeAllListeners();
  }
}