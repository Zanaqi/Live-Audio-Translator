// app/guide/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Users, Share2, Crown, Send } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'react-qr-code'

export default function GuidePage() {
  const [guideName, setGuideName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [roomCreated, setRoomCreated] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [roomUrl, setRoomUrl] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [participants, setParticipants] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [guideId, setGuideId] = useState('')
  const [textInput, setTextInput] = useState('')
  const [roomId, setRoomId] = useState('')
  
  const wsRef = useRef<WebSocket | null>(null)
  const recognitionRef = useRef<any>(null)
  
  // Initialize guide ID
  useEffect(() => {
    // Get from localStorage or generate new one
    const storedGuideId = localStorage.getItem('guideId')
    if (storedGuideId) {
      setGuideId(storedGuideId)
    } else {
      const newGuideId = uuidv4()
      localStorage.setItem('guideId', newGuideId)
      setGuideId(newGuideId)
    }
  }, [])
  
  // Create a new room
  const createRoom = async () => {
    if (!roomName.trim() || !guideName.trim()) {
      setError('Room name and guide name are required')
      return
    }
    
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roomName,
          guideId,
          guideName
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to create room')
      }
      
      const data = await response.json()
      setRoomCode(data.code)
      setRoomId(data.id) // Store the UUID
      
      // Generate URL for tourists
      const baseUrl = window.location.origin
      const tourUrl = `${baseUrl}/join?code=${data.code}`
      setRoomUrl(tourUrl)
      
      setRoomCreated(true)
      setError(null)
      
      // Connect to WebSocket
      connectWebSocket(data.id, data.code)
      
    } catch (error) {
      console.error('Error creating room:', error)
      setError('Failed to create room. Please try again.')
    }
  }
  
  // Connect to WebSocket server
  const connectWebSocket = async (roomId: string, code: string) => {
    try {
      const response = await fetch('/api/ws')
      const { wsUrl } = await response.json()
      
      wsRef.current = new WebSocket(wsUrl)
      
      wsRef.current.onopen = () => {
          // Join the room as guide
          wsRef.current?.send(JSON.stringify({
          type: 'join',
          roomId, // This is the UUID
          roomCode: code, // This is the 6-digit code
          participantId: guideId,
          role: 'guide'
          }))
      }
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          switch (data.type) {
            case 'joined':
              console.log('Successfully joined room as guide')
              break
              
            case 'participant_joined':
              setParticipants(data.participantCount)
              break
              
            case 'participant_left':
              setParticipants(data.participantCount)
              break
              
            case 'error':
              setError(data.message)
              break
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
  
  // Start/stop speech recognition
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }
  
  // Start speech recognition
  const startRecording = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to room. Please refresh and try again.')
      return
    }
    
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      
      recognitionRef.current.onresult = (event: any) => {
        const currentTranscript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('')
        
        setTranscript(currentTranscript)
        
        // Send to WebSocket for final results
        const lastResult = event.results[event.results.length - 1]
        if (lastResult.isFinal) {
          wsRef.current?.send(JSON.stringify({
            type: 'speech',
            roomId: roomCode,
            text: lastResult[0].transcript
          }))
        }
      }
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Recognition error:', event.error)
        setError(`Speech recognition error: ${event.error}`)
        stopRecording()
      }
      
      recognitionRef.current.start()
      setIsRecording(true)
      
    } else {
      setError('Speech recognition is not supported in your browser.')
    }
  }
  
  // Stop speech recognition
  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    
    setIsRecording(false)
  }

  const handleSendText = () => {
  if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    return
  }

  // Store roomId as state when room is created
  wsRef.current.send(JSON.stringify({
    type: 'speech',
    roomId: roomId, // Use the UUID, not the code
    text: textInput
  }))

  // Update transcript locally
  setTranscript(textInput)
  
  // Clear input
  setTextInput('')
}
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])
  
  // Copy room link to clipboard
  const copyRoomLink = () => {
    navigator.clipboard.writeText(roomUrl)
      .then(() => {
        alert('Room link copied to clipboard!')
      })
      .catch(err => {
        console.error('Failed to copy room link:', err)
      })
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-purple-600 p-6 text-white">
          <h1 className="text-2xl font-bold">Tour Guide Console</h1>
          <p className="text-purple-100">Create a room and start your multilingual tour</p>
        </div>
        
        {!roomCreated ? (
          /* Room Creation Form */
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-black">Create a New Tour Room</h2>
            
            <div>
              <label htmlFor="guideName" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                id="guideName"
                type="text"
                value={guideName}
                onChange={(e) => setGuideName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-gray-600"
              />
            </div>
            
            <div>
              <label htmlFor="roomName" className="block text-sm font-medium text-gray-700 mb-1">
                Tour Name
              </label>
              <input
                id="roomName"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter tour name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-gray-600"
              />
            </div>
            
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}
            
            <button
              onClick={createRoom}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              Create Tour Room
            </button>
          </div>
        ) : (
          /* Active Room */
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-purple-50 rounded-lg">
              <div>
                <h2 className="text-xl font-semibold text-black">{roomName}</h2>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Users size={16} />
                  <span>{participants} tourists connected</span>
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  <Crown size={16} className="text-purple-600" />
                  <span className="text-purple-600 font-medium">{guideName}</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="bg-white p-2 rounded-lg shadow-sm">
                  <QRCode value={roomUrl} size={128} />
                </div>
                <div className="mt-2 text-center">
                  <div className="text-2xl font-bold text-purple-600">{roomCode}</div>
                  <div className="text-sm text-gray-500">Room Code</div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center">
              <button
                onClick={copyRoomLink}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                <Share2 size={18} />
                <span>Share Tour Link</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {/* Recording Button */}
                <button
                  onClick={toggleRecording}
                  className={`p-6 rounded-full ${
                    isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-500 hover:bg-purple-600'
                  } text-white transition-colors`}
                >
                  {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
                
                <div className="text-sm text-gray-600">
                  {isRecording ? 'Tap to stop speaking' : 'Tap to start speaking'}
                </div>

                {/* Text Input for Testing Without Microphone */}
                <div className="mt-8 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-600">Send Text (Microphone Alternative)</h3>
                    <div className="flex space-x-2">
                        <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type a message to translate..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-gray-600"
                        onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                        />
                        <button
                        onClick={handleSendText}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                        >
                        <Send size={18} />
                        </button>
                    </div>
                    <p className="text-sm text-gray-500">
                        This allows you to test translations without a microphone.
                    </p>
                </div>
              </div>
              
              {/* Transcript */}
              {transcript && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2 text-black">You are saying:</h3>
                  <p className="text-gray-700">{transcript}</p>
                </div>
              )}
              
              {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-md">
                  {error}
                </div>
              )}
            </div>
            
            {/* Instructions */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-700 mb-2">Tour Guide Instructions:</h3>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• Share the room code or QR code with your tour group</li>
                <li>• Speak clearly and at a moderate pace for best translations</li>
                <li>• Avoid background noise when possible</li>
                <li>• Check the transcript to ensure your speech is being recognized correctly</li>
              </ul>
            </div>
          </div>
        )}
        
        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t">
          <div className="text-center text-sm text-gray-500">
            AI-Powered Real-Time Audio Translation System
          </div>
        </div>
      </div>
    </div>
  )
}