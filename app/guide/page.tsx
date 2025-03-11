// app/guide/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, Users, Share2, Crown, RefreshCw } from 'lucide-react'
import QRCode from 'react-qr-code'
import { useAuth } from '@/lib/context/AuthContext'
import { wsManager } from '@/lib/utils/WebSocketManager'
import AudioTranslator from '../components/AudioTranslator'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function GuidePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Local state
  const [roomName, setRoomName] = useState('');
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [translations, setTranslations] = useState<{[lang: string]: string}>({});
  
  // Check authentication
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user?.role !== 'guide') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle WebSocket setup
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
          
        case 'translation':
          if (data.language && data.text) {
            setTranslations(prev => ({
              ...prev,
              [data.language]: data.text
            }));
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
  }, []);

  // Monitor WebSocket connection
  useEffect(() => {
    const interval = setInterval(() => {
      setWsConnected(wsManager.isConnected());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Create a new room
  const createRoom = async () => {
    if (!roomName.trim() || !user) {
      setError('Room name is required');
      return;
    }
    
    setCreatingRoom(true);
    setError(null);
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Add token to headers
        },
        body: JSON.stringify({
          name: roomName,
          guideId: user.id,
          guideName: user.name
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create room');
      }
      
      const data = await response.json();
      
      // Generate URL for tourists
      const baseUrl = window.location.origin;
      const tourUrl = `${baseUrl}/join?code=${data.code}`;
      setRoomUrl(tourUrl);
      
      // Connect to WebSocket
      await wsManager.connect({
        roomId: data.id,
        participantId: user.id,
        role: 'guide',
        roomCode: data.code,
        guideName: user.name
      });
      
    } catch (error) {
      console.error('Error creating room:', error);
      setError('Failed to create room. Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  // Handler for transcript changes from AudioTranslator
  const handleTranscriptChange = (transcript: string) => {
    console.log('Transcript changed:', transcript);
    setCurrentTranscript(transcript);
  };

  // Handler for translation changes
  const handleTranslationChange = (translation: string) => {
    console.log('Translation received:', translation);
  };

  // Leave room
  const handleEndTour = async () => {
    try {
      // Disconnect WebSocket
      wsManager.disconnect();
      
      // Clear state
      setRoomUrl('');
      setParticipants(0);
      setError(null);
      
      // Navigate to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Error ending tour:', error);
      setError('Failed to end tour');
    }
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

  if (loading) {
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
        <div className="bg-purple-600 p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Tour Guide Console</h1>
              <p className="text-purple-100">Welcome, {user?.name}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-white hover:text-purple-200"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {!roomUrl ? (
          /* Room Creation Form */
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-black">Create a New Tour Room</h2>
            
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
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <button
              onClick={createRoom}
              disabled={creatingRoom || !roomName}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:bg-purple-300 disabled:cursor-not-allowed"
            >
              {creatingRoom ? 'Creating...' : 'Create Tour Room'}
            </button>
          </div>
        ) : (
          /* Active Room */
          <div className="p-6 space-y-6">
            {/* Room Info */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-purple-50 rounded-lg">
              <div>
                <h2 className="text-xl font-semibold text-black">{roomName}</h2>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Users size={16} />
                  <span>{participants} tourists connected</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="bg-white p-2 rounded-lg shadow-sm">
                  <QRCode value={roomUrl} size={128} />
                </div>
                <div className="mt-2 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {roomUrl.split('code=')[1]}
                  </div>
                  <div className="text-sm text-gray-500">Room Code</div>
                </div>
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

            {/* Audio Translator */}
            <AudioTranslator
              targetLanguage="English"
              onTranscriptChange={handleTranscriptChange}
              onTranslationChange={handleTranslationChange}
            />

            {/* Current Transcript Display */}
            {currentTranscript && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">Current Transcript:</h3>
                <p className="text-gray-800">{currentTranscript}</p>
              </div>
            )}
            
            {/* Active Translations Display */}
            {Object.keys(translations).length > 0 && (
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">Active Translations:</h3>
                <div className="space-y-2">
                  {Object.entries(translations).map(([language, text]) => (
                    <div key={language} className="border-b pb-2">
                      <span className="font-medium text-purple-600">{language}: </span>
                      <span className="text-gray-800">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomUrl);
                  alert('Room link copied to clipboard!');
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                <Share2 size={18} />
                <span>Share Tour Link</span>
              </button>
              
              <button
                onClick={handleEndTour}
                className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                <span>End Tour</span>
              </button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
}