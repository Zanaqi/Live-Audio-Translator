// app/guide/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Users, Share2, Crown, Send, RefreshCw } from 'lucide-react'
import QRCode from 'react-qr-code'
import { useSession } from '@/lib/context/SessionContext'
import { wsManager } from '@/lib/utils/WebSocketManager'

export default function GuidePage() {
  // Get session context
  const { guideSession, saveGuideSession, clearGuideSession, ensureUserId } = useSession()
  
  // Local state
  const [guideName, setGuideName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [participants, setParticipants] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [roomUrl, setRoomUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  
  const recognitionRef = useRef<any>(null)
  
  // Set up WebSocket event listeners
  useEffect(() => {
    // Handle WebSocket messages
    const handleMessage = (data: any) => {
      console.log('Received message:', data);
      
      switch (data.type) {
        case 'joined':
          console.log('Successfully joined room, participant count:', data.participantCount);
          setParticipants(data.participantCount);
          setError(null);
          setReconnecting(false);
          break;
          
        case 'participant_joined':
        case 'participant_left':
          console.log('Participant count update:', data.participantCount);
          setParticipants(data.participantCount);
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          setError(data.message);
          setReconnecting(false);
          
          // If room not found, clear session
          if (
            data.message === 'Room not found' || 
            data.message === 'Room not found or inactive'
          ) {
            clearGuideSession();
          }
          break;
      }
    }
    
    // Add event listeners
    wsManager.on('message', handleMessage)
    
    // Handle connection state changes
    wsManager.on('connected', () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      setError(null);
    })
    
    wsManager.on('disconnected', () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    })
    
    wsManager.on('error', (err) => {
      console.error('WebSocket error event:', err);
      setError(err.message || 'Connection error');
      setReconnecting(false);
    })
    
    wsManager.on('reconnecting', () => {
      console.log('Reconnecting...');
      setError('Reconnecting...');
      setReconnecting(true);
    })
    
    // Clean up event listeners on unmount
    return () => {
      wsManager.removeListener('message', handleMessage);
      wsManager.removeAllListeners('connected');
      wsManager.removeAllListeners('disconnected');
      wsManager.removeAllListeners('error');
      wsManager.removeAllListeners('reconnecting');
    }
  }, [clearGuideSession])
  
  // Connect to room if session exists
  useEffect(() => {
    if (guideSession) {
      console.log('Found guide session, connecting:', guideSession);
      setGuideName(guideSession.guideName);
      setRoomName(guideSession.roomName);
      
      // Generate tourist URL
      const baseUrl = window.location.origin;
      const tourUrl = `${baseUrl}/join?code=${guideSession.roomCode}`;
      setRoomUrl(tourUrl);
      
      // Connect via WebSocket
      connectWebSocket();
    }
  }, [guideSession])
  
  // Update connection status when wsManager connection changes
  useEffect(() => {
    setWsConnected(wsManager.isConnected());
    
    // Check every second for connection status
    const interval = setInterval(() => {
      setWsConnected(wsManager.isConnected());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Connect to WebSocket
  const connectWebSocket = async () => {
    if (!guideSession) return;
    
    try {
      setReconnecting(true);
      
      await wsManager.connect({
        roomId: guideSession.roomId,
        roomCode: guideSession.roomCode,
        participantId: guideSession.guideId,
        role: 'guide',
        guideName: guideSession.guideName
      });
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      setError('Failed to connect to room. Please try again.');
      setReconnecting(false);
    }
  }
  
  // Create a new room
  const createRoom = async () => {
    if (!roomName.trim() || !guideName.trim()) {
      setError('Room name and guide name are required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Ensure user has an ID
      const userId = ensureUserId();
      
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roomName,
          guideId: userId,
          guideName
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create room');
      }
      
      const data = await response.json();
      console.log('Room created:', data);
      
      // Generate URL for tourists
      const baseUrl = window.location.origin;
      const tourUrl = `${baseUrl}/join?code=${data.code}`;
      setRoomUrl(tourUrl);
      
      // Save session
      const sessionData = {
        roomId: data.id,
        roomCode: data.code,
        roomName,
        guideId: userId,
        guideName
      };
      
      saveGuideSession(sessionData);
      
      // Connect to WebSocket
      await wsManager.connect({
        roomId: data.id,
        roomCode: data.code,
        participantId: userId,
        role: 'guide',
        guideName
      });
      
    } catch (error) {
      console.error('Error creating room:', error);
      setError('Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  
  // Start/stop speech recognition
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }
  
  // Start speech recognition
  const startRecording = () => {
    if (!wsManager.isConnected()) {
      setError('Not connected to room. Please reconnect and try again.');
      return;
    }
    
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        const currentTranscript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        
        setTranscript(currentTranscript);
        
        // Send to WebSocket for final results
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          wsManager.sendSpeech(lastResult[0].transcript);
        }
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
        stopRecording();
      };
      
      recognitionRef.current.start();
      setIsRecording(true);
      
    } else {
      setError('Speech recognition is not supported in your browser.');
    }
  }
  
  // Stop speech recognition
  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    setIsRecording(false);
  }
  
  // Send text input
  const handleSendText = () => {
    if (!textInput.trim() || !wsManager.isConnected()) {
      setError('Cannot send message - not connected to room');
      return;
    }

    // Use roomId from session to ensure correct routing
    if (guideSession) {
      wsManager.sendMessage({
        type: 'speech',
        roomId: guideSession.roomId, // Send the actual roomId, not the code
        text: textInput
      });

      // Update transcript locally
      setTranscript(textInput);
      
      // Clear input
      setTextInput('');
    }
  }
  
  // End tour and leave room
  const handleEndTour = () => {
    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }
    
    // Disconnect WebSocket
    wsManager.disconnect();
    
    // Clear session
    clearGuideSession();
    
    // Reset UI state
    setTranscript('');
    setParticipants(0);
    setError(null);
  }
  
  // Manually reconnect
  const handleReconnect = async () => {
    if (!guideSession) return;
    
    setError('Reconnecting...');
    setReconnecting(true);
    
    try {
      await connectWebSocket();
    } catch (error) {
      console.error('Failed to reconnect:', error);
      setError('Failed to reconnect. Please try again.');
      setReconnecting(false);
    }
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  }, []);
  
  // Copy room link to clipboard
  const copyRoomLink = () => {
    navigator.clipboard.writeText(roomUrl)
      .then(() => {
        alert('Room link copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy room link:', err);
      });
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-purple-600 p-6 text-white">
          <h1 className="text-2xl font-bold">Tour Guide Console</h1>
          <p className="text-purple-100">Create a room and start your multilingual tour</p>
        </div>
        
        {!guideSession ? (
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
              disabled={loading || !roomName || !guideName}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:bg-purple-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Tour Room'}
            </button>
          </div>
        ) : (
          /* Active Room */
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-purple-50 rounded-lg">
              <div>
                <h2 className="text-xl font-semibold text-black">{guideSession.roomName}</h2>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Users size={16} />
                  <span>{participants} tourists connected</span>
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  <Crown size={16} className="text-purple-600" />
                  <span className="text-purple-600 font-medium">{guideSession.guideName}</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="bg-white p-2 rounded-lg shadow-sm">
                  <QRCode value={roomUrl} size={128} />
                </div>
                <div className="mt-2 text-center">
                  <div className="text-2xl font-bold text-purple-600">{guideSession.roomCode}</div>
                  <div className="text-sm text-gray-500">Room Code</div>
                </div>
              </div>
            </div>
            
            {/* Connection status with ability to reconnect */}
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {!wsConnected && !reconnecting && (
                <button 
                  onClick={handleReconnect}
                  className="flex items-center space-x-1 px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                >
                  <RefreshCw size={14} />
                  <span>Reconnect</span>
                </button>
              )}
              
              {reconnecting && (
                <div className="flex items-center space-x-2 text-sm text-blue-600">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                  <span>Reconnecting...</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-center space-x-4">
              <button
                onClick={copyRoomLink}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                <Share2 size={18} />
                <span>Share Tour Link</span>
              </button>
              
              <button
                onClick={handleEndTour}
                className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                <span>End Tour</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {/* Recording Button */}
                <button
                  onClick={toggleRecording}
                  disabled={!wsConnected || reconnecting}
                  className={`p-6 rounded-full ${
                    isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-500 hover:bg-purple-600'
                  } text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
                
                <div className="text-sm text-gray-600">
                  {!wsConnected 
                    ? 'Connect to start speaking' 
                    : isRecording ? 'Tap to stop speaking' : 'Tap to start speaking'}
                </div>

                {/* Text Input for Testing Without Microphone */}
                <div className="mt-8 space-y-4 w-full max-w-xl">
                    <h3 className="text-lg font-semibold text-gray-600">Send Text (Microphone Alternative)</h3>
                    <div className="flex space-x-2">
                        <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type a message to translate..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-gray-600"
                        onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                        disabled={!wsConnected || reconnecting}
                        />
                        <button
                        onClick={handleSendText}
                        disabled={!wsConnected || reconnecting || !textInput.trim()}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:bg-purple-300 disabled:cursor-not-allowed"
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
              
              {error && !reconnecting && (
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