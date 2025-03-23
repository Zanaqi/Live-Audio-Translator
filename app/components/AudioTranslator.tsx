import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { wsManager } from "@/lib/utils/WebSocketManager";
import { AudioProcessor } from "@/lib/utils/audioUtils";
import { performanceMonitor } from "@/lib/utils/performanceMonitor";

interface AudioTranslatorProps {
  targetLanguage: string;
  onTranscriptChange?: (transcript: string) => void;
  onTranslationChange?: (translation: string) => void;
}

export default function AudioTranslator({
  targetLanguage,
  onTranscriptChange,
  onTranslationChange,
}: AudioTranslatorProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [isBrowser, setIsBrowser] = useState(false);
  const [transcript, setTranscript] = useState("");

  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const recognitionRef = useRef<any>(null);

  // Subscribe to translation events from WebSocket
  useEffect(() => {
    const handleTranslation = (data: any) => {
      if (data.type === "translation" && onTranslationChange) {
        onTranslationChange(data.text);
      }
    };

    wsManager.on("translation", handleTranslation);

    return () => {
      wsManager.removeListener("translation", handleTranslation);
    };
  }, [onTranslationChange]);

  // Check if browser is supported
  useEffect(() => {
    setIsBrowser(true);

    // Check browser compatibility
    if (typeof window !== "undefined") {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Your browser does not support audio recording");
      }
      if (!("webkitSpeechRecognition" in window)) {
        setError("Your browser does not support speech recognition");
      }
    }
  }, []);

  // Function to send transcript to WebSocket
  const sendTranscriptToWS = useCallback((text: string) => {
    console.log("Sending transcript to WebSocket:", text);
    if (wsManager.isConnected() && text.trim()) {
      wsManager.sendMessage({
        type: "transcript",
        text: text,
        sourceLanguage: "English", // Assuming guide speaks English
      });
    }
  }, []);

  const startRecording = async () => {
    if (!isBrowser) return;

    try {
      // Initialize audio processor
      audioProcessorRef.current = new AudioProcessor({
        sampleRate: 16000,
        noiseThreshold: 0.01,
        silenceThreshold: 0.02,
        minSpeechDuration: 300,
      });

      await audioProcessorRef.current.initialize();

      // Set up audio processor callbacks
      audioProcessorRef.current.setCallbacks({
        onSpeechStart: () => setIsVoiceDetected(true),
        onSpeechEnd: () => setIsVoiceDetected(false),
        onAudioLevel: (level) => {
          setAudioLevel(level * 100);
          performanceMonitor.recordAudioQuality(level * 5); // Convert to MOS scale
        },
      });

      // Initialize speech recognition
      if ("webkitSpeechRecognition" in window) {
        const SpeechRecognition = window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US"; // Set to English for the guide

        recognitionRef.current.onstart = () => {
          setIsRecording(true);
          setError(null);
        };

        recognitionRef.current.onresult = (event: any) => {
          const startTime = performance.now();

          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join("");

          // Update current word being spoken
          const currentResult = event.results[event.results.length - 1];
          if (!currentResult.isFinal) {
            setCurrentWord(currentResult[0].transcript);
          } else {
            setCurrentWord("");
            // Measure latency
            const endTime = performance.now();
            performanceMonitor.recordLatency(startTime, endTime);

            // Send final transcript to WebSocket
            sendTranscriptToWS(transcript);
          }

          setTranscript(transcript);
          if (onTranscriptChange) {
            onTranscriptChange(transcript);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Recognition error:", event.error);
          setError(`Speech recognition error: ${event.error}`);
          stopRecording();
        };

        recognitionRef.current.start();
      }
    } catch (error) {
      console.error("Error starting recording:", error);
      setError(
        error instanceof Error ? error.message : "Failed to start recording"
      );
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (audioProcessorRef.current) {
      audioProcessorRef.current.cleanup();
      audioProcessorRef.current = null;
    }

    setIsRecording(false);
    setIsVoiceDetected(false);
    setAudioLevel(0);
    setCurrentWord("");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  // Loading state when not in browser
  if (!isBrowser) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <div className="text-sm text-gray-600">
            Initializing audio system...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-center space-y-4">
        {/* Recording Button with Status Ring */}
        <div className="relative">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!!error}
            className={`p-4 rounded-full ${
              isRecording
                ? "bg-red-500 hover:bg-red-600"
                : "bg-indigo-500 hover:bg-indigo-600"
            } text-white transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed`}
            aria-label={isRecording ? "Stop Recording" : "Start Recording"}
          >
            {isRecording ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>

          {/* Voice Activity Ring */}
          {isRecording && (
            <div
              className={`absolute -inset-1 rounded-full border-2 ${
                isVoiceDetected
                  ? "border-green-500 animate-pulse"
                  : "border-gray-300"
              } -z-10`}
              role="status"
              aria-label={
                isVoiceDetected ? "Voice detected" : "No voice detected"
              }
            />
          )}
        </div>

        {/* Recording Status */}
        <div className="text-sm text-gray-600">
          {isRecording && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              Recording
              {isVoiceDetected && (
                <span className="text-green-500 ml-2">Voice Detected</span>
              )}
            </div>
          )}
        </div>

        {/* Current transcript */}
        {transcript && (
          <div className="w-full p-3 bg-gray-50 rounded-lg my-2">
            <p className="text-gray-700">{transcript}</p>
          </div>
        )}

        {/* Audio Level Meter */}
        <div className="w-full space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Audio Level</span>
            <span>{Math.round(audioLevel)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                audioLevel > 50 ? "bg-green-500" : "bg-indigo-500"
              }`}
              style={{ width: `${audioLevel}%` }}
              role="progressbar"
              aria-valuenow={audioLevel}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Live Word Preview */}
        {currentWord && (
          <div className="text-sm text-gray-600 italic">
            Hearing: {currentWord}
          </div>
        )}

        {/* Instructions */}
        <div className="text-sm text-gray-500 mt-4">
          <ul className="list-disc pl-5 space-y-1">
            <li>Speak clearly and at a moderate pace</li>
            <li>Stay close to the microphone</li>
            <li>Minimize background noise</li>
            <li>Check the transcript to ensure accuracy</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
