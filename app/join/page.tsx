// app/join/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Volume2, VolumeX, Languages, Users } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

export default function JoinPage() {
  const searchParams = useSearchParams()
  const [roomCode, setRoomCode] = useState<string>('')
  const [touristName, setTouristName] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('French')
  const [isJoined, setIsJoined] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [transcript, setTranscript] = useState('')
  const [translation, setTranslation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [touristId, setTouristId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [originalMessages, setOriginalMessages] = useState<string[]>([])
  const [translations, setTranslations] = useState<string[]>([])
  
  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Initialize tourist ID and check for room code in URL
  useEffect(() => {
    // Get tourist ID from localStorage or generate new one
    const storedTouristId = localStorage.getItem('touristId')
    if (storedTouristId) {
      setTouristId(storedTouristId)
    } else {
      const newTouristId = uuidv4()
      localStorage.setItem('touristId', newTouristId)
      setTouristId(newTouristId)
    }
    
    // Check for room code in URL
    const code = searchParams.get('code')
    if (code) {
      setRoomCode(code)
      checkRoom(code)
    }
  }, [searchParams])
  
  // Check if room exists
  const checkRoom = async (code: string) => {
    try {
      const response = await fetch(`/api/rooms?code=${code}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Room not found. Please check the code and try again.')
          return
        }
        throw new Error('Failed to check room')
      }
      
      const data = await response.json()
      setRoomName(data.name)
      setParticipants(data.participantCount)
      setError(null)
      
    } catch (error) {
      console.error('Error checking room:', error)
      setError('Failed to check room. Please try again.')
    }
  }
  
  // Join the room
  const joinRoom = async () => {
    if (!roomCode.trim() || !touristName.trim()) {
      setError('Room code and your name are required')
      return
    }
    
    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: roomCode,
          touristName,
          preferredLanguage
        }),
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Room not found. Please check the code and try again.')
          return
        }
        throw new Error('Failed to join room')
      }
      
      const data = await response.json()
      setRoomId(data.roomId)
      setIsJoined(true)
      setError(null)
      
      // Connect to WebSocket
      connectWebSocket(data.roomId)
      
    } catch (error) {
      console.error('Error joining room:', error)
      setError('Failed to join room. Please try again.')
    }
  }
  
  // Connect to WebSocket server
  const connectWebSocket = async (roomId: string) => {
    try {
      const response = await fetch('/api/ws')
      const { wsUrl } = await response.json()
      
      wsRef.current = new WebSocket(wsUrl)
      
      wsRef.current.onopen = () => {
        // Join the room as tourist
        wsRef.current?.send(JSON.stringify({
          type: 'join',
          roomId,
          participantId: touristId,
          role: 'tourist',
          preferredLanguage
        }))
      }
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('WebSocket message received:', data) // Debug log
          
          switch (data.type) {
            case 'joined':
              console.log('Successfully joined room as tourist')
              break
              
            case 'participant_joined':
            case 'participant_left':
              setParticipants(data.participantCount)
              break
              
            case 'transcript':
              // Keep a history of original messages
              setOriginalMessages(prev => [...prev, data.text])
              // Also update the current transcript for display
              setTranscript(data.text)
              break
              
            case 'translation':
              console.log('Translation received:', data) // Debug log
              // Keep a history of translations
              setTranslations(prev => [...prev, data.text])
              // Update the current translation
              setTranslation(data.text)
              // Speak if enabled
            //   if (autoSpeak) {
            //     speakTranslation(data.text)
            //   }
              break
              
            case 'error':
              setError(data.message)
              break
              
            default:
              console.log('Unknown message type:', data.type)
          }
          
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }
      
      wsRef.current.onclose = () => {
        console.log('WebSocket connection closed')
      }
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Connection error. Please refresh and try again.')
      }
      
    } catch (error) {
      console.error('Error connecting to WebSocket:', error)
      setError('Failed to connect. Please refresh and try again.')
    }
  }
  
  // Text-to-speech for translation
  const speakTranslation = (text: string) => {
    if (!text) return
    
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel()
      
      const utterance = new SpeechSynthesisUtterance(text)
      
      // Set language based on preferred language
      switch (preferredLanguage) {
        case 'French':
          utterance.lang = 'fr-FR'
          break
        case 'Spanish':
          utterance.lang = 'es-ES'
          break
        case 'German':
          utterance.lang = 'de-DE'
          break
        case 'Italian':
          utterance.lang = 'it-IT'
          break
        case 'Japanese':
          utterance.lang = 'ja-JP'
          break
        case 'Chinese':
          utterance.lang = 'zh-CN'
          break
        default:
          utterance.lang = 'en-US'
      }
      
      // Speak the translation
      window.speechSynthesis.speak(utterance)
      
      // Update UI state
      setIsPlaying(true)
      
      utterance.onend = () => {
        setIsPlaying(false)
      }
    }
  }
  
  // Toggle audio playback
  const togglePlayback = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
    } else {
      speakTranslation(translation)
    }
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-teal-600 p-6 text-white">
          <h1 className="text-2xl font-bold">Tour Translation</h1>
          <p className="text-teal-100">Join a tour and get real-time translations</p>
        </div>
        
        {!isJoined ? (
          /* Join Form */
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">Join a Tour</h2>
            
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-1">
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value)
                  if (e.target.value.length === 6) {
                    checkRoom(e.target.value)
                  }
                }}
                placeholder="Enter 6-digit code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            
            {roomName && (
              <div className="p-3 bg-teal-50 text-teal-700 rounded-md">
                Found tour: <span className="font-semibold">{roomName}</span> ({participants} participants)
              </div>
            )}
            
            <div>
              <label htmlFor="touristName" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                id="touristName"
                type="text"
                value={touristName}
                onChange={(e) => setTouristName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            
            <div>
              <label htmlFor="preferredLanguage" className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Language
              </label>
              <select
                id="preferredLanguage"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="Chinese">Chinese (Mandarin)</option>
                <option value="French">French</option>
                <option value="Spanish">Spanish</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Japanese">Japanese</option>
              </select>
            </div>
            
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}
            
            <button
              onClick={joinRoom}
              disabled={!roomCode || !touristName}
              className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Join Tour
            </button>
          </div>
        ) : (
          /* Active Tour View */
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center p-4 bg-teal-50 rounded-lg">
              <div>
                <h2 className="text-xl font-semibold">{roomName}</h2>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Users size={16} />
                  <span>{participants} participants</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full">
                <Languages size={16} />
                <span>{preferredLanguage}</span>
              </div>
            </div>
            
            {/* Original Text */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">Original (English)</h3>
              <div className="p-4 bg-gray-50 rounded-lg min-h-[100px]">
                <p className="text-gray-700">{transcript || 'Waiting for guide to speak...'}</p>
              </div>
            </div>
            
            {/* Translation */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">Translation ({preferredLanguage})</h3>
              <div className="p-4 bg-teal-50 rounded-lg min-h-[100px]">
                <p className="text-gray-700">{translation || 'Translation will appear here...'}</p>
              </div>
            </div>

            {/* Message History */}
            <div className="space-y-4 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg">Message History</h3>
                
                {originalMessages.length === 0 ? (
                <p className="text-gray-500 italic">No messages yet. Wait for the guide to speak.</p>
                ) : (
                originalMessages.map((message, index) => (
                    <div key={index} className="mb-4 pb-4 border-b border-gray-100">
                    <div className="bg-gray-50 p-3 rounded-lg mb-2">
                        <p className="text-xs text-gray-500">Original (English):</p>
                        <p className="text-gray-700">{message}</p>
                    </div>
                    
                    {translations[index] && (
                        <div className="bg-teal-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-500">Translation ({preferredLanguage}):</p>
                        <p className="text-gray-700">{translations[index]}</p>
                        </div>
                    )}
                    </div>
                ))
                )}
            </div>
            
            {/* Audio Controls */}
            <div className="flex justify-center">
              <button
                onClick={togglePlayback}
                className={`p-4 rounded-full ${
                  isPlaying 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-teal-500 hover:bg-teal-600'
                } text-white transition-colors`}
                disabled={!translation}
              >
                {isPlaying ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            </div>
            
            <audio ref={audioRef} className="hidden" />
            
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Debug Section - only visible during development */}
        {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <h3 className="font-semibold mb-2">Debug Info</h3>
            <p>Room ID: {roomId}</p>
            <p>WebSocket State: {wsRef.current ? wsRef.current.readyState : 'Not connected'}</p>
            <p>Messages Received: {originalMessages.length}</p>
            <p>Translations Received: {translations.length}</p>
            <button 
            onClick={() => console.log('Current state:', { 
                roomId, 
                originalMessages, 
                translations, 
                wsRef: wsRef.current?.readyState 
            })}
            className="mt-2 px-2 py-1 bg-gray-200 text-xs rounded"
            >
            Log Debug Info
            </button>
        </div>
        )}
                
        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t">
          <div className="text-center text-sm text-gray-500">
            Listen in your preferred language
          </div>
        </div>
      </div>
    </div>
  )
}