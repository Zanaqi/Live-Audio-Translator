'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Volume2, VolumeX, Languages, Users, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'
import { wsManager } from '@/lib/utils/WebSocketManager'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function JoinRoomPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  
  // Debug the parameters
  console.log('Join Room Page - Params:', params);
  
  const roomCode = params.roomCode as string;
  console.log('Room Code:', roomCode);
  
  // Local state
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [originalMessages, setOriginalMessages] = useState<string[]>([]);
  const [translations, setTranslations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  
  // Check authentication
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user?.role !== 'tourist') {
      router.push('/dashboard');
    }
  }, [loading, user, router]);

  // Load room data and connect to WebSocket
  useEffect(() => {
    const loadRoom = async () => {
      if (!user || !roomCode) {
        console.error('Missing user or roomCode parameter:', { user: !!user, roomCode });
        setError('Invalid room code or not authenticated');
        setIsLoading(false);
        return;
      }
      
      console.log('Loading room with code:', roomCode);
      setIsLoading(true);
      
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication token not found');
        }
        
        // Get room information
        console.log('Fetching room info for code:', roomCode);
        const response = await fetch(`/api/rooms?code=${roomCode}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log('Room info response status:', response.status);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          
          if (response.status === 404) {
            throw new Error('Room not found or inactive');
          }
          throw new Error('Failed to fetch room data');
        }
        
        const roomData = await response.json();
        console.log('Room data retrieved:', roomData);
        setRoomName(roomData.name);
        setRoomId(roomData.id);
        setParticipants(roomData.participantCount || 0);
        
        // Join the room via API
        console.log('Joining room with code:', roomCode);
        const joinResponse = await fetch('/api/rooms/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ code: roomCode })
        });
        
        if (!joinResponse.ok) {
          const joinErrorText = await joinResponse.text();
          console.error('Join error response:', joinErrorText);
          throw new Error('Failed to join room');
        }
        
        const joinData = await joinResponse.json();
        console.log('Join successful:', joinData);
        
        // Connect to WebSocket
        console.log('Connecting to WebSocket...');
        await connectToWebSocket(joinData.roomId, roomCode, user.id, user.name, user.preferredLanguage);
        console.log('WebSocket connected successfully');
        
      } catch (error) {
        console.error('Error joining room:', error);
        setError(error instanceof Error ? error.message : 'Failed to join room');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadRoom();
    
    return () => {
      // Clean up WebSocket connection
      wsManager.disconnect();
    };
  }, [roomCode, user, router]);

  // Set up WebSocket listeners
  useEffect(() => {
    const handleMessage = (data: any) => {
      console.log('Received message:', data);
      
      switch (data.type) {
        case 'joined':
          setParticipants(data.participantCount);
          setError(null);
          setReconnecting(false);
          break;
          
        case 'participant_joined':
        case 'participant_left':
          setParticipants(data.participantCount);
          break;
          
        case 'transcript':
          setOriginalMessages(prev => [...prev, data.text]);
          setTranscript(data.text);
          break;
          
        case 'translation':
          setTranslations(prev => [...prev, data.text]);
          setTranslation(data.text);
          
          // Auto-play speech if not already playing
          if (!isPlaying && data.text) {
            speakTranslation(data.text);
          }
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          setError(data.message);
          setReconnecting(false);
          break;
      }
    };
    
    wsManager.on('message', handleMessage);
    
    return () => {
      wsManager.removeListener('message', handleMessage);
    };
  }, [isPlaying]); // Added isPlaying as dependency for auto-speak feature

  // Monitor WebSocket connection
  useEffect(() => {
    const interval = setInterval(() => {
      setWsConnected(wsManager.isConnected());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Connect to WebSocket 
  const connectToWebSocket = async (roomId: string, roomCode: string, userId: string, userName: string, preferredLanguage?: string) => {
    try {
      await wsManager.connect({
        roomId: roomId,
        roomCode: roomCode,
        participantId: userId,
        role: 'tourist',
        preferredLanguage: preferredLanguage,
        touristName: userName
      });
      return true;
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      setError('Failed to connect to translation service');
      return false;
    }
  };

  // Text-to-speech for translation
  const speakTranslation = (textToSpeak: string = translation) => {
    if (!textToSpeak) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = getLangCode(user?.preferredLanguage || '');
      
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      
      window.speechSynthesis.speak(utterance);
    } else {
      setError('Text-to-speech is not supported in your browser.');
    }
  };

  // Get language code for speech synthesis
  const getLangCode = (language: string): string => {
    const langCodes: { [key: string]: string } = {
      'French': 'fr-FR',
      'Spanish': 'es-ES',
      'German': 'de-DE',
      'Italian': 'it-IT',
      'Japanese': 'ja-JP',
      'Chinese': 'zh-CN'
    };
    return langCodes[language] || 'en-US';
  };

  // Manual reconnect
  const handleReconnect = async () => {
    if (!wsManager.getConfig()) return;
    
    setError('Reconnecting...');
    setReconnecting(true);
    
    try {
      await wsManager.connect(wsManager.getConfig()!);
    } catch (error) {
      console.error('Failed to reconnect:', error);
      setError('Failed to reconnect. Please try again.');
      setReconnecting(false);
    }
  };

  // Leave room
  const leaveRoom = () => {
    wsManager.disconnect();
    router.push('/dashboard');
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-teal-600 p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Tour Translation</h1>
              <p className="text-teal-100">Welcome, {user?.name}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-white hover:text-teal-200"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Room Info */}
          <div className="flex justify-between items-center p-4 bg-teal-50 rounded-lg">
            <div>
              <h2 className="text-xl font-semibold text-black">{roomName}</h2>
              <div className="flex items-center space-x-2 text-gray-600">
                <Users size={16} />
                <span>{participants} participants</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full">
              <Languages size={16} />
              <span>{user?.preferredLanguage}</span>
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
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
            <h3 className="text-sm font-medium text-gray-500">
              Translation ({user?.preferredLanguage})
            </h3>
            <div className="p-4 bg-teal-50 rounded-lg min-h-[100px]">
              <p className="text-gray-700">{translation || 'Translation will appear here...'}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => {
                if (isPlaying) {
                  window.speechSynthesis.cancel();
                  setIsPlaying(false);
                } else {
                  speakTranslation();
                }
              }}
              disabled={!translation}
              className="p-4 rounded-full bg-teal-500 text-white hover:bg-teal-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isPlaying ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            
            <button
              onClick={leaveRoom}
              className="p-4 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Leave Tour
            </button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}