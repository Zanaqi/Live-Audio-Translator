'use client'

import { useState, useEffect, useRef } from 'react'
import { TranslationBridge } from '@/lib/services/TranslationBridge'
import { Mic, MicOff } from 'lucide-react'

interface AudioTranslatorProps {
  targetLanguage: string
  onTranscriptChange?: (transcript: string) => void
  onTranslationChange?: (translation: string) => void
}

export default function AudioTranslator({ 
  targetLanguage, 
  onTranscriptChange,
  onTranslationChange 
}: AudioTranslatorProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [currentWord, setCurrentWord] = useState('')
  const [isVoiceDetected, setIsVoiceDetected] = useState(false)
  const [isBrowser, setIsBrowser] = useState(false)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const bridgeRef = useRef<TranslationBridge | null>(null)
  const recognitionRef = useRef<any>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Check if we're in the browser on mount
  useEffect(() => {
    setIsBrowser(true)
  }, [])

  const startRecording = async () => {
    if (!isBrowser) return

    try {
      // Initialize audio context
      audioContextRef.current = new AudioContext()
      
      // Get microphone stream
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })

      // Initialize speech recognition
      if ('webkitSpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true

        recognitionRef.current.onstart = () => {
          setIsRecording(true)
        }

        recognitionRef.current.onaudiostart = () => {
          setIsVoiceDetected(true)
        }

        recognitionRef.current.onaudioend = () => {
          setIsVoiceDetected(false)
        }

        recognitionRef.current.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('')
          
          // Update current word being spoken
          const currentResult = event.results[event.results.length - 1]
          if (!currentResult.isFinal) {
            setCurrentWord(currentResult[0].transcript)
          } else {
            setCurrentWord('')
          }

          onTranscriptChange?.(transcript)

          // Initialize translation bridge if needed
          if (!bridgeRef.current) {
            bridgeRef.current = new TranslationBridge()
            
            bridgeRef.current.on('translation', (data: any) => {
              onTranslationChange?.(data.translation || '')
            })

            bridgeRef.current.on('error', (err: any) => {
              console.error('Translation error:', err)
              setError('Translation failed')
            })
          }

          // Send for translation
          if (bridgeRef.current) {
            const textBlob = new Blob([transcript], { type: 'text/plain' })
            bridgeRef.current.translate(textBlob, targetLanguage)
              .catch(err => console.error('Translation error:', err))
          }
        }

        recognitionRef.current.onerror = (event: any) => {
          console.error('Recognition error:', event.error)
          setError(`Speech recognition error: ${event.error}`)
        }

        recognitionRef.current.start()
      } else {
        throw new Error('Speech recognition not supported in this browser')
      }

      // Set up audio processing
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      
      source.connect(analyserRef.current)
      
      // Audio level monitoring
      const updateAudioLevel = () => {
        if (!analyserRef.current) return
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        
        // Calculate audio level (simple average)
        const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length
        setAudioLevel(average)
        
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
      }
      
      updateAudioLevel()
      
      setError(null)

    } catch (error) {
      console.error('Error starting recording:', error)
      setError(error instanceof Error ? error.message : 'Failed to start recording')
      stopRecording()
    }
  }

  const stopRecording = () => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Stop recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    // Stop audio processing
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Clean up audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Clean up translation bridge
    if (bridgeRef.current) {
      bridgeRef.current.disconnect()
      bridgeRef.current = null
    }

    setIsRecording(false)
    setAudioLevel(0)
    setIsVoiceDetected(false)
    setCurrentWord('')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [])

  // Loading state when not in browser
  if (!isBrowser) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col items-center space-y-4">
          <button
            disabled
            className="p-4 rounded-full bg-gray-300 text-white"
          >
            <Mic className="w-6 h-6" />
          </button>
          <div className="text-sm text-gray-600">
            Loading...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col items-center space-y-4">
        {/* Recording Button with Status Ring */}
        <div className="relative">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-4 rounded-full ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-indigo-500 hover:bg-indigo-600'
            } text-white transition-colors`}
          >
            {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          {/* Voice Activity Ring */}
          {isRecording && (
            <div 
              className={`absolute -inset-1 rounded-full border-2 
                ${isVoiceDetected ? 'border-green-500 animate-pulse' : 'border-gray-300'}
                -z-10`} 
            />
          )}
        </div>

        {/* Recording Status */}
        <div className="text-sm text-gray-600">
          {isRecording && (
            <>
              <span className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Recording
              </span>
              {isVoiceDetected && <span className="text-green-500 ml-2">Voice Detected</span>}
            </>
          )}
        </div>

        {/* Audio Level Meter */}
        <div className="w-full space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Audio Level</span>
            <span>{Math.round((audioLevel / 255) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-100 ${
                audioLevel > 128 ? 'bg-green-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${(audioLevel / 255) * 100}%` }}
            />
          </div>
        </div>

        {/* Live Word Preview */}
        {currentWord && (
          <div className="text-sm text-gray-600 italic">
            Hearing: "{currentWord}"
          </div>
        )}

        {error && (
          <div className="w-full p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}