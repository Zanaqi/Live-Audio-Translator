// lib/utils/audioUtils.ts

export interface AudioSettings {
  sampleRate: number;
  noiseThreshold: number;
  silenceThreshold: number;
  minSpeechDuration: number;
}

const DEFAULT_SETTINGS: AudioSettings = {
  sampleRate: 16000,
  noiseThreshold: 0.01,
  silenceThreshold: 0.02,
  minSpeechDuration: 300 // milliseconds
};

export class AudioProcessor {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private settings: AudioSettings;
  private isSpeaking: boolean = false;
  private speechStartTime: number = 0;
  private onSpeechStart?: () => void;
  private onSpeechEnd?: () => void;
  private onAudioLevel?: (level: number) => void;

  constructor(settings?: Partial<AudioSettings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async initialize(): Promise<void> {
    try {
      this.context = new AudioContext({ sampleRate: this.settings.sampleRate });
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.settings.sampleRate
        }
      });

      const source = this.context.createMediaStreamSource(this.stream);
      this.analyzer = this.context.createAnalyser();
      this.analyzer.fftSize = 2048;

      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.analyzer);
      this.analyzer.connect(this.processor);
      this.processor.connect(this.context.destination);

      this.processor.onaudioprocess = this.handleAudioProcess.bind(this);
    } catch (error) {
      console.error('Error initializing audio processor:', error);
      throw error;
    }
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    const inputData = event.inputBuffer.getChannelData(0);
    const processedData = this.processAudioChunk(inputData);
    
    // Calculate audio level
    const level = this.calculateAudioLevel(processedData);
    this.onAudioLevel?.(level);

    // Voice activity detection
    const isSpeakingNow = level > this.settings.silenceThreshold;
    
    if (isSpeakingNow && !this.isSpeaking) {
      this.speechStartTime = Date.now();
      this.isSpeaking = true;
      this.onSpeechStart?.();
    } else if (!isSpeakingNow && this.isSpeaking) {
      const speechDuration = Date.now() - this.speechStartTime;
      if (speechDuration >= this.settings.minSpeechDuration) {
        this.onSpeechEnd?.();
      }
      this.isSpeaking = false;
    }
  }

  private processAudioChunk(chunk: Float32Array): Float32Array {
    const processedChunk = new Float32Array(chunk.length);
    
    // Apply noise gate
    for (let i = 0; i < chunk.length; i++) {
      processedChunk[i] = Math.abs(chunk[i]) < this.settings.noiseThreshold ? 0 : chunk[i];
    }
    
    // Apply simple noise reduction
    let sum = 0;
    const windowSize = 3;
    
    for (let i = 0; i < processedChunk.length; i++) {
      sum = 0;
      let count = 0;
      
      for (let j = Math.max(0, i - windowSize); j < Math.min(processedChunk.length, i + windowSize + 1); j++) {
        sum += processedChunk[j];
        count++;
      }
      
      processedChunk[i] = sum / count;
    }
    
    return processedChunk;
  }

  private calculateAudioLevel(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    return rms;
  }

  public setCallbacks({
    onSpeechStart,
    onSpeechEnd,
    onAudioLevel
  }: {
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onAudioLevel?: (level: number) => void;
  }): void {
    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;
    this.onAudioLevel = onAudioLevel;
  }

  public convertToWav(pcmData: Float32Array): Blob {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, this.settings.sampleRate, true);
    view.setUint32(28, this.settings.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length * 2, true);
    
    // Write PCM data
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(44 + i * 2, pcmData[i] * 0x7FFF, true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  public cleanup(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    
    if (this.analyzer) {
      this.analyzer.disconnect();
      this.analyzer = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}