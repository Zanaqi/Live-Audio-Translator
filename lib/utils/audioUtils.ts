export const processAudioChunk = (chunk: Float32Array): Float32Array => {
    // Implement noise reduction
    const processedChunk = new Float32Array(chunk.length);
    
    // Simple noise gate
    const noiseThreshold = 0.01;
    for (let i = 0; i < chunk.length; i++) {
      processedChunk[i] = Math.abs(chunk[i]) < noiseThreshold ? 0 : chunk[i];
    }
    
    return processedChunk;
  };
  
  export const convertToWav = (pcmData: Float32Array, sampleRate = 16000): Blob => {
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
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length * 2, true);
  
    // Write PCM data
    const length = pcmData.length;
    let index = 44;
    for (let i = 0; i < length; i++) {
      view.setInt16(index, pcmData[i] * 0x7FFF, true);
      index += 2;
    }
  
    return new Blob([buffer], { type: 'audio/wav' });
  };
  
  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }