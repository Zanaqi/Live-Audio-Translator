'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Volume2, VolumeX, Languages, Users, RefreshCw, Tag, Info } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext'
import { wsManager } from '@/lib/utils/WebSocketManager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import TranslationComparison from '@/app/components/TranslationComparison';

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
  const [translationConfidence, setTranslationConfidence] = useState(0);
  const [activeContexts, setActiveContexts] = useState<string[]>([]);
  const [showContextInfo, setShowContextInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [originalMessages, setOriginalMessages] = useState<string[]>([]);
  const [translations, setTranslations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [baseTranslation, setBaseTranslation] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  const [translationImprovement, setTranslationImprovement] = useState<{ changePercentage: number; isSubstantial: boolean } | null>(null);
  const [translationEvaluation, setTranslationEvaluation] = useState<any>(null);
  
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

          // Store context information
          if (data.confidence) {
            setTranslationConfidence(data.confidence);
          }
          
          if (data.contexts) {
            setActiveContexts(data.contexts);
          }

          if (data.baseTranslation) {
            setBaseTranslation(data.baseTranslation);

            // Store evaluation metrics from server
            if (data.evaluation) {
              setTranslationEvaluation(data.evaluation);
            } else {
              setTranslationEvaluation(null);
            }
            
            // Calculate improvement metrics
            if (data.baseTranslation !== data.text) {
              const improvementScore = calculateImprovementScore(data.baseTranslation, data.text);
              setTranslationImprovement(improvementScore);
            }
          }
          
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
  }, [isPlaying]);

  const calculateImprovementScore = (base: string, contextual: string) => {
    // Simple diff-based score - more sophisticated metrics could be used
    let changedWords = 0;
    const baseWords = base.split(/\s+/);
    const contextWords = contextual.split(/\s+/);
    
    // Count word differences
    const maxLength = Math.max(baseWords.length, contextWords.length);
    const minLength = Math.min(baseWords.length, contextWords.length);
    
    for (let i = 0; i < minLength; i++) {
      if (baseWords[i] !== contextWords[i]) {
        changedWords++;
      }
    }
    
    // Add difference in length
    changedWords += Math.abs(baseWords.length - contextWords.length);
    
    // Calculate percentage of changes
    return {
      changePercentage: Math.round((changedWords / maxLength) * 100),
      isSubstantial: changedWords > 2 // Consider substantial if more than 2 words changed
    };
  };

  // Get context badge color based on confidence
  const getContextBadgeColor = (confidence: number) => {
    if (confidence > 0.8) return 'bg-green-100 text-green-800';
    if (confidence > 0.6) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  // Format context name for display
  const formatContextName = (context: string) => {
    return context.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

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

  const highlightDifferences = (base: string, enhanced: string): React.ReactNode => {
    const baseWords = base.split(/\s+/);
    const enhancedWords = enhanced.split(/\s+/);
    const result: React.ReactNode[] = [];
    
    const maxLength = Math.max(baseWords.length, enhancedWords.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (i < baseWords.length && i < enhancedWords.length) {
        if (baseWords[i] !== enhancedWords[i]) {
          // Highlight different words
          result.push(
            <span key={`diff-${i}`} className="bg-yellow-100 px-1 rounded">
              {enhancedWords[i]}
            </span>
          );
        } else {
          // Keep same words as is
          result.push(<span key={`same-${i}`}>{enhancedWords[i]}</span>);
        }
      } else if (i >= baseWords.length) {
        // New words added in enhanced translation
        result.push(
          <span key={`added-${i}`} className="bg-green-100 px-1 rounded">
            {enhancedWords[i]}
          </span>
        );
      }
      
      // Add spaces between words
      if (i < maxLength - 1) {
        result.push(<span key={`space-${i}`}> </span>);
      }
    }
    
    return <>{result}</>;
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
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-500">
                Translation ({user?.preferredLanguage})
              </h3>
              <button
                onClick={() => setShowContextInfo(!showContextInfo)}
                className="flex items-center text-xs text-teal-600 hover:text-teal-800"
              >
                <Info className="h-3 w-3 mr-1" />
                {showContextInfo ? 'Hide Context' : 'Show Context'}
              </button>
            </div>
            
            <div className="p-4 bg-teal-50 rounded-lg min-h-[100px]">
              <p className="text-gray-700">{translation || 'Translation will appear here...'}</p>
              
              {/* Translation confidence indicator */}
              {translation && showContextInfo && (
                <div className="mt-3 pt-3 border-t border-teal-100">
                  <div className="flex items-center text-xs text-gray-500 mb-2">
                    <span className="mr-1">Translation confidence:</span>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          translationConfidence > 0.7 ? 'bg-green-500' : 
                          translationConfidence > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${translationConfidence * 100}%` }}
                      />
                    </div>
                    <span className="ml-1">{Math.round(translationConfidence * 100)}%</span>
                  </div>
                  
                  {/* Active contexts */}
                  {activeContexts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {activeContexts.map((context, index) => (
                        <span 
                          key={index}
                          className={`px-2 py-1 rounded-full text-xs ${getContextBadgeColor(translationConfidence)}`}
                        >
                          <Tag className="h-3 w-3 inline mr-1" />
                          {formatContextName(context)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-500">
                Translation ({user?.preferredLanguage})
              </h3>
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="flex items-center text-xs text-teal-600 hover:text-teal-800"
              >
                <Info className="h-3 w-3 mr-1" />
                {showComparison ? 'Hide Comparison' : 'Show Comparison'}
              </button>
            </div>
            
            <div className="p-4 bg-teal-50 rounded-lg min-h-[100px]">
              <p className="text-gray-700">{translation || 'Translation will appear here...'}</p>

              {/* Comparison section */}
              {baseTranslation && (
                <TranslationComparison
                  baseTranslation={baseTranslation}
                  enhancedTranslation={translation}
                  evaluation={translationEvaluation}
                  showComparison={showComparison}
                  toggleComparison={() => setShowComparison(!showComparison)}
                />
              )}
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