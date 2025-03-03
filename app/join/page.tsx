// app/join/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Volume2, VolumeX, Languages, Users, RefreshCw } from 'lucide-react'
import { useSession } from '@/lib/context/SessionContext'
import { wsManager } from '@/lib/utils/WebSocketManager'

export default function JoinPage() {
  // Access session context
  const { touristSession, saveTouristSession, clearTouristSession, ensureUserId } = useSession()
  
  // URL parameters
  const searchParams = useSearchParams()
  
  // Local state
  const [roomCode, setRoomCode] = useState<string>('')
  const [touristName, setTouristName] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('French')
  const [roomName, setRoomName] = useState('')
  const [transcript, setTranscript] = useState('')
  const [translation, setTranslation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [originalMessages, setOriginalMessages] = useState<string[]>([])
  const [translations, setTranslations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [roomInfo, setRoomInfo] = useState<any>(null)
  const [wsConnected, setWsConnected] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
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
          break;
          
        case 'participant_joined':
        case 'participant_left':
          console.log('Participant count update:', data.participantCount);
          setParticipants(data.participantCount);
          break;
          
        case 'transcript':
          // Keep a history of original messages
          setOriginalMessages(prev => [...prev, data.text]);
          // Also update the current transcript for display
          setTranscript(data.text);
          break;
          
        case 'translation':
          console.log('Translation received:', data);
          // Keep a history of translations
          setTranslations(prev => [...prev, data.text]);
          // Update the current translation
          setTranslation(data.text);
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          setError(data.message);
          
          // If room not found or inactive, clear session
          if (
            data.message === 'Room not found' || 
            data.message === 'Room not found or inactive' ||
            data.message === 'Not authorized as tourist for this room'
          ) {
            clearTouristSession();
          }
          break;
      }
    };
    
    // Add event listeners
    wsManager.on('message', handleMessage);
    
    // Handle connection state changes
    wsManager.on('connected', () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      setError(null);
    });
    
    wsManager.on('disconnected', () => {
      console.log('WebSocket disconnected');
      setWsConnected(false);
    });
    
    wsManager.on('error', (err) => {
      console.error('WebSocket error event:', err);
      setError(err.message || 'Connection error');
    });
    
    wsManager.on('reconnecting', () => {
      console.log('Reconnecting...');
      setError('Reconnecting...');
    });
    
    // Clean up event listeners on unmount
    return () => {
      wsManager.removeListener('message', handleMessage);
      wsManager.removeAllListeners('connected');
      wsManager.removeAllListeners('disconnected');
      wsManager.removeAllListeners('error');
      wsManager.removeAllListeners('reconnecting');
    }
  }, [clearTouristSession]);
  
  // Initialize from URL params or session
  useEffect(() => {
    // First check if we have a session already
    if (touristSession) {
      console.log('Found tourist session, connecting:', touristSession);
      setRoomCode(touristSession.roomCode);
      setTouristName(touristSession.touristName);
      setPreferredLanguage(touristSession.preferredLanguage);
      setRoomName(touristSession.roomName);
      
      // Connect to WebSocket
      connectToSession();
    } else {
      // If no session, check URL for room code
      const code = searchParams.get('code');
      if (code) {
        setRoomCode(code);
        checkRoom(code);
      }
    }
  }, [searchParams, touristSession]);
  
  // Update connection status when wsManager connection changes
  useEffect(() => {
    setWsConnected(wsManager.isConnected());
    
    // Check every second for connection status
    const interval = setInterval(() => {
      setWsConnected(wsManager.isConnected());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Connect to existing session
  const connectToSession = async () => {
    if (!touristSession) return;
    
    try {
      await wsManager.connect({
        roomId: touristSession.roomId,
        participantId: touristSession.touristId,
        role: 'tourist',
        preferredLanguage: touristSession.preferredLanguage,
        roomCode: touristSession.roomCode,
        touristName: touristSession.touristName
      });
    } catch (error) {
      console.error('Error connecting to session:', error);
      setError('Failed to connect to room. Please try again.');
    }
  };
  
  // Check if room exists
  const checkRoom = async (code: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/rooms?code=${code}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Room not found. Please check the code and try again.');
          return;
        }
        throw new Error('Failed to check room');
      }
      
      const data = await response.json();
      setRoomName(data.name);
      setParticipants(data.participantCount);
      setRoomInfo(data);
      
    } catch (error) {
      console.error('Error checking room:', error);
      setError('Failed to check room. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Join the room
  const joinRoom = async () => {
    if (!roomCode.trim() || !touristName.trim()) {
      setError('Room code and your name are required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Ensure user has ID
      const userId = ensureUserId();
      
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
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Room not found. Please check the code and try again.');
          return;
        }
        throw new Error('Failed to join room');
      }
      
      const data = await response.json();
      console.log('Join room response:', data);
      
      // Save session
      const sessionData = {
        roomId: data.roomId,
        roomCode,
        roomName: data.roomName || roomName,
        touristId: userId,
        touristName,
        preferredLanguage
      };
      
      saveTouristSession(sessionData);
      
      // Connect to WebSocket
      await wsManager.connect({
        roomId: data.roomId,
        participantId: userId,
        role: 'tourist',
        roomCode: roomCode,
        preferredLanguage,
        touristName
      });
      
    } catch (error) {
      console.error('Error joining room:', error);
      setError('Failed to join room. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Leave the room
  const leaveRoom = () => {
    // Disconnect WebSocket
    wsManager.disconnect();
    
    // Clear session
    clearTouristSession();
    
    // Reset state
    setTranscript('');
    setTranslation('');
    setOriginalMessages([]);
    setTranslations([]);
    setError(null);
  };
  
  // Manual reconnect
  const handleReconnect = async () => {
    if (!touristSession) return;
    
    setError('Reconnecting...');
    
    try {
      await connectToSession();
    } catch (error) {
      console.error('Failed to reconnect:', error);
      setError('Failed to reconnect. Please try again.');
    }
  };
  
  // Text-to-speech for translation
  const speakTranslation = () => {
    if (!translation) return;
    
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(translation);
      
      // Set language based on preferred language
      switch (preferredLanguage) {
        case 'French':
          utterance.lang = 'fr-FR';
          break;
        case 'Spanish':
          utterance.lang = 'es-ES';
          break;
        case 'German':
          utterance.lang = 'de-DE';
          break;
        case 'Italian':
          utterance.lang = 'it-IT';
          break;
        case 'Japanese':
          utterance.lang = 'ja-JP';
          break;
        case 'Chinese':
          utterance.lang = 'zh-CN';
          break;
        default:
          utterance.lang = 'en-US';
      }
      
      utterance.onstart = () => {
        setIsPlaying(true);
      };
      
      utterance.onend = () => {
        setIsPlaying(false);
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      setError('Text-to-speech is not supported in your browser.');
    }
  };
  
  // Toggle audio playback
  const togglePlayback = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      speakTranslation();
    }
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-teal-600 p-6 text-white">
          <h1 className="text-2xl font-bold">Tour Translation</h1>
          <p className="text-teal-100">Join a tour and get real-time translations</p>
        </div>
        
        {!touristSession ? (
          /* Join Form */
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-black">Join a Tour</h2>
            
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-1">
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  if (e.target.value.length === 6) {
                    checkRoom(e.target.value);
                  }
                }}
                placeholder="Enter 6-digit code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-600"
              />
            </div>
            
            {roomInfo && (
              <div className="p-3 bg-teal-50 text-teal-700 rounded-md">
                Found tour: <span className="font-semibold text-gray-600">{roomInfo.name}</span> ({roomInfo.participantCount} participants)
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-600"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-600"
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
              disabled={loading || !roomCode || !touristName}
              className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:bg-teal-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining...' : 'Join Tour'}
            </button>
          </div>
        ) : (
          /* Active Tour View */
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center p-4 bg-teal-50 rounded-lg">
              <div>
                <h2 className="text-xl font-semibold text-black">{touristSession.roomName}</h2>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Users size={16} />
                  <span>{participants} participants</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full">
                <Languages size={16} />
                <span>{touristSession.preferredLanguage}</span>
              </div>
            </div>
            
            {/* Connection status with reconnect button */}
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {!wsConnected && (
                <button 
                  onClick={handleReconnect}
                  className="flex items-center space-x-1 px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                >
                  <RefreshCw size={14} />
                  <span>Reconnect</span>
                </button>
              )}
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
              <h3 className="text-sm font-medium text-gray-500">Translation ({touristSession?.preferredLanguage})</h3>
              <div className="p-4 bg-teal-50 rounded-lg min-h-[100px]">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
                  </div>
                ) : (
                  <p className="text-gray-700">{translation || 'Translation will appear here...'}</p>
                )}
              </div>
            </div>

            {/* Message History */}
            {originalMessages.length > 0 && (
              <div className="space-y-4 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg text-gray-600">Message History</h3>
                
                {originalMessages.map((message, index) => (
                  <div key={index} className="mb-4 pb-4 border-b border-gray-100">
                    <div className="bg-gray-50 p-3 rounded-lg mb-2">
                      <p className="text-xs text-gray-500">Original (English):</p>
                      <p className="text-gray-700">{message}</p>
                    </div>
                    
                    {translations[index] && (
                      <div className="bg-teal-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-500">Translation ({touristSession.preferredLanguage}):</p>
                        <p className="text-gray-700">{translations[index]}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={togglePlayback}
                className={`p-4 rounded-full ${
                  isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'
                } text-white transition-colors`}
                disabled={!translation}
              >
                {isPlaying ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
              
              <button
                onClick={leaveRoom}
                className="p-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
              >
                <span className="text-sm">Leave Tour</span>
              </button>
            </div>
            
            <audio ref={audioRef} className="hidden" />
            
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}
            
            {originalMessages.length === 0 && (
              <div className="p-3 bg-blue-50 text-blue-700 rounded-md">
                <p className="text-center">Waiting for the guide to start speaking...</p>
                <p className="text-center text-sm mt-1">You'll see translations here once they begin.</p>
              </div>
            )}
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