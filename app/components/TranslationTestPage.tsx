import React, { useState, useEffect, useRef } from 'react';
import { EnhancedTranslationService } from '../../lib/services/EnhancedTranslationService';

type ModelName = 'marian' | 'google' | 'chatgpt' | 'm2m100';

interface TestResult {
  id: string;
  originalText: string;
  targetLanguage: string;
  marianResult: string;
  googleResult: string;
  chatgptResult?: string;
  m2m100Result?: string;
  marianTime: number;
  googleTime: number;
  chatgptTime?: number;
  m2m100Time?: number;
  timestamp: Date;
  accuracyMetrics?: AccuracyMetrics;
  // Audio-specific fields
  transcribedText?: string;
  transcriptionAccuracy?: number;
  audioScript?: TestScript;
  totalLatency?: number;
  fullComparison?: any;
}

interface AccuracyMetrics {
  bleuScore: {
    [key: string]: number;
  };
  rougeScore: {
    [key: string]: number;
  };
  editDistance: {
    [key: string]: number;
  };
  semanticSimilarity: {
    [key: string]: number;
  };
  referenceTranslation: string;
}

interface Language {
  code: string;
  name: string;
  native: string;
  flag: string;
  supported: {
    marian: boolean;
    google: boolean;
  };
}

interface TestScript {
  id: string;
  text: string;
  context: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keywords: string[];
  expectedChallenges: string[];
}

const TranslationTestPage: React.FC = () => {
  const [isServiceOnline, setIsServiceOnline] = useState<boolean | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [currentTest, setCurrentTest] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('french');
  const [selectedTestSet, setSelectedTestSet] = useState<string>('museum_tour');
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [showAccuracyMetrics, setShowAccuracyMetrics] = useState<boolean>(true);
  const [testingMode, setTestingMode] = useState<'text' | 'audio'>('text');
  const [selectedModels, setSelectedModels] = useState<ModelName[]>(['marian', 'm2m100']);
  const [referenceModel, setReferenceModel] = useState<ModelName>('google');

  // Audio testing state
  const [isRecording, setIsRecording] = useState(false);
  const [currentScript, setCurrentScript] = useState<TestScript | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for audio handling
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Language definitions
  const languages: Language[] = [
    { code: 'chinese', name: 'Chinese', native: '中文', flag: '🇨🇳', supported: { marian: true, google: true }},
    { code: 'tamil', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳', supported: { marian: true, google: true }},
    { code: 'french', name: 'French', native: 'Français', flag: '🇫🇷', supported: { marian: true, google: true }},
    { code: 'spanish', name: 'Spanish', native: 'Español', flag: '🇪🇸', supported: { marian: true, google: true }},
    { code: 'german', name: 'German', native: 'Deutsch', flag: '🇩🇪', supported: { marian: true, google: true }},
  ];

  // Test script collections organized by difficulty
  const testScripts: { [key in 'easy' | 'medium' | 'hard']: TestScript[] } = {
    easy: [
      {
        id: 'museum_easy_1',
        text: 'Welcome to the museum.',
        context: 'Museum greeting',
        difficulty: 'easy',
        keywords: ['welcome', 'museum'],
        expectedChallenges: ['formal greeting']
      },
      {
        id: 'restaurant_easy_1',
        text: 'Table for two, please.',
        context: 'Restaurant reservation',
        difficulty: 'easy',
        keywords: ['table', 'two'],
        expectedChallenges: ['polite request']
      }
    ],
    medium: [
      {
        id: 'museum_medium_1',
        text: 'This Renaissance painting depicts the struggle between light and darkness.',
        context: 'Art description',
        difficulty: 'medium',
        keywords: ['Renaissance', 'painting', 'struggle', 'light', 'darkness'],
        expectedChallenges: ['art terminology', 'abstract concepts']
      }
    ],
    hard: [
      {
        id: 'technical_hard_1',
        text: 'The quantum entanglement phenomenon demonstrates non-local correlations.',
        context: 'Scientific explanation',
        difficulty: 'hard',
        keywords: ['quantum', 'entanglement', 'phenomenon', 'correlations'],
        expectedChallenges: ['scientific terminology', 'complex concepts']
      }
    ]
  };

  // Predefined test sets
  const testSets: { [key: string]: string[] } = {
    museum_tour: [
      "Welcome to the museum.",
      "Please follow the guided tour.",
      "This painting is from the Renaissance period.",
      "Photography is not allowed in this gallery.",
      "The exhibition closes at 6 PM."
    ],
    restaurant: [
      "Good evening, table for two?",
      "What would you like to drink?",
      "The special today is grilled salmon.",
      "Would you like dessert?",
      "Here is your check."
    ],
    airport: [
      "Flight 402 is now boarding at gate 12.",
      "Please have your boarding pass ready.",
      "All passengers should be seated.",
      "We apologize for the delay.",
      "Thank you for flying with us."
    ],
    business: [
      "Let's schedule a meeting for next week.",
      "Please review the quarterly report.",
      "The project deadline is approaching.",
      "We need to increase our market share.",
      "Customer satisfaction is our priority."
    ]
  };

  // Check service health on component mount
  useEffect(() => {
    checkServiceHealth();
  }, []);

  const checkServiceHealth = async () => {
    try {
      const health = await EnhancedTranslationService.getHealthStatus();
      setIsServiceOnline(health.status === 'healthy');
    } catch (error) {
      setIsServiceOnline(false);
      console.error('Service health check failed:', error);
    }
  };

  const runSingleTest = async () => {
    if (!currentTest.trim()) return;

    setIsRunningTests(true);
    
    try {
      const result = await EnhancedTranslationService.compareCustomModels(
        currentTest,
        selectedLanguage,
        selectedModels
      );

      const testResult: TestResult = {
        id: Date.now().toString(),
        originalText: currentTest,
        targetLanguage: selectedLanguage,
        marianResult: result.results.marian?.translation || 'Failed',
        googleResult: result.results.google?.translation || 'Failed',
        chatgptResult: result.results.chatgpt?.translation,
        m2m100Result: result.results.m2m100?.translation,
        marianTime: result.results.marian?.latency || 0,
        googleTime: result.results.google?.latency || 0,
        chatgptTime: result.results.chatgpt?.latency,
        m2m100Time: result.results.m2m100?.latency,
        timestamp: new Date(),
        fullComparison: result
      };

      setTestResults(prev => [testResult, ...prev]);
    } catch (error) {
      console.error('Translation test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const runBatchTests = async () => {
    const texts = testSets[selectedTestSet] || [];
    if (texts.length === 0) return;

    setIsRunningTests(true);
    
    try {
      for (const text of texts) {
        const result = await EnhancedTranslationService.compareCustomModels(
          text,
          selectedLanguage,
          selectedModels
        );

        const testResult: TestResult = {
          id: Date.now().toString() + Math.random(),
          originalText: text,
          targetLanguage: selectedLanguage,
          marianResult: result.results.marian?.translation || 'Failed',
          googleResult: result.results.google?.translation || 'Failed',
          chatgptResult: result.results.chatgpt?.translation,
          m2m100Result: result.results.m2m100?.translation,
          marianTime: result.results.marian?.latency || 0,
          googleTime: result.results.google?.latency || 0,
          chatgptTime: result.results.chatgpt?.latency,
          m2m100Time: result.results.m2m100?.latency,
          timestamp: new Date(),
          fullComparison: result
        };

        setTestResults(prev => [testResult, ...prev]);
        
        // Small delay between requests to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Batch test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const generateRandomScript = (): TestScript => {
    const scripts = testScripts[selectedDifficulty];
    return scripts[Math.floor(Math.random() * scripts.length)];
  };

  const startAudioTest = () => {
    const script = generateRandomScript();
    setCurrentScript(script);
    setTranscriptionText('');
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setTranscriptionText('');

      // Start speech recognition
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        
        if (recognitionRef.current) {
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;
          recognitionRef.current.lang = 'en-US';

          recognitionRef.current.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript;
            }
            setTranscriptionText(transcript);
          };

          recognitionRef.current.start();
        }
      }

      // Also start media recording for potential future use
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const processAudioTest = async () => {
    if (!currentScript || !transcriptionText.trim()) return;

    setIsProcessing(true);

    try {
      // Calculate transcription accuracy (simple word-based comparison)
      const originalWords = currentScript.text.toLowerCase().split(/\s+/);
      const transcribedWords = transcriptionText.toLowerCase().split(/\s+/);
      const accuracy = calculateTranscriptionAccuracy(originalWords, transcribedWords);

      // Run translation test on transcribed text
      const result = await EnhancedTranslationService.compareCustomModels(
        transcriptionText,
        selectedLanguage,
        selectedModels
      );

      const testResult: TestResult = {
        id: Date.now().toString(),
        originalText: currentScript.text,
        targetLanguage: selectedLanguage,
        marianResult: result.results.marian?.translation || 'Failed',
        googleResult: result.results.google?.translation || 'Failed',
        chatgptResult: result.results.chatgpt?.translation,
        m2m100Result: result.results.m2m100?.translation,
        marianTime: result.results.marian?.latency || 0,
        googleTime: result.results.google?.latency || 0,
        chatgptTime: result.results.chatgpt?.latency,
        m2m100Time: result.results.m2m100?.latency,
        timestamp: new Date(),
        transcribedText: transcriptionText,
        transcriptionAccuracy: accuracy,
        audioScript: currentScript,
        fullComparison: result
      };

      setTestResults(prev => [testResult, ...prev]);
      setCurrentScript(null);
      setTranscriptionText('');
    } catch (error) {
      console.error('Audio test processing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateTranscriptionAccuracy = (original: string[], transcribed: string[]): number => {
    const maxLength = Math.max(original.length, transcribed.length);
    if (maxLength === 0) return 100;

    let matches = 0;
    const minLength = Math.min(original.length, transcribed.length);
    
    for (let i = 0; i < minLength; i++) {
      if (original[i] === transcribed[i]) {
        matches++;
      }
    }

    return (matches / maxLength) * 100;
  };

  const formatLatency = (latency: number): string => {
    return `${(latency * 1000).toFixed(0)}ms`;
  };

  const getModelDisplayName = (model: ModelName): string => {
    const displayNames = {
      marian: 'MarianMT',
      google: 'Google',
      chatgpt: 'ChatGPT',
      m2m100: 'M2M-100'
    };
    return displayNames[model];
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Translation Testing Suite</h1>
        <p className="text-gray-600">Compare multiple translation models with comprehensive testing</p>
        
        {/* Service Status */}
        <div className="mt-4 flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isServiceOnline === null ? 'bg-yellow-400' : isServiceOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className="text-sm text-gray-600">
            Service Status: {isServiceOnline === null ? 'Checking...' : isServiceOnline ? 'Online' : 'Offline'}
          </span>
          <button 
            onClick={checkServiceHealth}
            className="text-blue-500 hover:text-blue-700 text-sm underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Testing Mode Toggle */}
      <div className="mb-6">
        <div className="flex space-x-2">
          <button
            onClick={() => setTestingMode('text')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              testingMode === 'text'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            📝 Text Testing
          </button>
          <button
            onClick={() => setTestingMode('audio')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              testingMode === 'audio'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🎙️ Audio Testing
          </button>
        </div>
      </div>

      {/* Model Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Two Translation Models to Compare</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['marian', 'google', 'm2m100', 'chatgpt'] as const).map(model => (
            <button
              key={model}
              onClick={() => {
                setSelectedModels(prev => {
                  if (prev.includes(model as ModelName)) {
                    // Remove model if already selected
                    return prev.filter(m => m !== model);
                  } else if (prev.length < 2) {
                    // Add model if less than 2 selected
                    return [...prev, model as ModelName];
                  } else {
                    // Replace oldest model if 2 already selected
                    return [prev[1], model as ModelName];
                  }
                });
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedModels.includes(model as ModelName)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {getModelDisplayName(model as ModelName)}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500">
          Selected: {selectedModels.map(m => getModelDisplayName(m)).join(', ')} 
          {selectedModels.length < 2 && ` (Select ${2 - selectedModels.length} more)`}
        </p>
      </div>

      {/* Language Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {languages.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name} ({lang.native})
            </option>
          ))}
        </select>
      </div>

      {testingMode === 'text' ? (
        /* Text Testing Interface */
        <div className="space-y-6">
          {/* Single Test */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Single Translation Test</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Text to Translate</label>
                <textarea
                  value={currentTest}
                  onChange={(e) => setCurrentTest(e.target.value)}
                  placeholder="Enter text to translate..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
              <button
                onClick={runSingleTest}
                disabled={!currentTest.trim() || isRunningTests || selectedModels.length < 2}
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isRunningTests ? 'Testing...' : 'Run Test'}
              </button>
            </div>
          </div>

          {/* Batch Testing */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Batch Testing</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Test Set</label>
                <select
                  value={selectedTestSet}
                  onChange={(e) => setSelectedTestSet(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Object.keys(testSets).map(set => (
                    <option key={set} value={set}>
                      {set.replace('_', ' ').toUpperCase()} ({testSets[set].length} texts)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={runBatchTests}
                  disabled={isRunningTests || selectedModels.length < 2}
                  className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isRunningTests ? 'Running Tests...' : 'Run Batch Tests'}
                </button>
                <button
                  onClick={clearResults}
                  className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
                >
                  Clear Results
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Audio Testing Interface */
        <div className="space-y-6">
          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Audio Translation Testing</h3>
            
            {/* Difficulty Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty Level</label>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="easy">Easy - Simple phrases</option>
                <option value="medium">Medium - Complex sentences</option>
                <option value="hard">Hard - Technical content</option>
              </select>
            </div>

            {!currentScript ? (
              <button
                onClick={startAudioTest}
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600"
              >
                Generate Test Script
              </button>
            ) : (
              <div className="space-y-4">
                {/* Test Script Display */}
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-800 mb-2">Read This Text:</h4>
                  <p className="text-lg text-gray-900 mb-2">{currentScript.text}</p>
                  <div className="text-sm text-gray-600">
                    <p><strong>Context:</strong> {currentScript.context}</p>
                    <p><strong>Difficulty:</strong> {currentScript.difficulty}</p>
                    <p><strong>Keywords:</strong> {currentScript.keywords.join(', ')}</p>
                  </div>
                </div>

                {/* Recording Controls */}
                <div className="flex space-x-3">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={selectedModels.length < 2}
                      className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      <span>🎙️</span>
                      <span>Start Recording</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 flex items-center space-x-2 animate-pulse"
                    >
                      <span>⏹️</span>
                      <span>Stop Recording</span>
                    </button>
                  )}
                  
                  <button
                    onClick={() => setCurrentScript(null)}
                    className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
                  >
                    New Script
                  </button>
                </div>

                {/* Transcription Display */}
                {transcriptionText && (
                  <div className="bg-white p-4 rounded-lg border">
                    <h4 className="font-semibold text-gray-800 mb-2">Live Transcription:</h4>
                    <p className="text-gray-900">{transcriptionText}</p>
                    {!isRecording && transcriptionText.trim() && (
                      <button
                        onClick={processAudioTest}
                        disabled={isProcessing || selectedModels.length < 2}
                        className="mt-3 bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? 'Processing...' : 'Process & Translate'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Section */}
      {testResults.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Test Results ({testResults.length})</h2>
          <div className="space-y-4">
            {testResults.map((result) => (
              <div key={result.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                <div className="mb-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {result.transcribedText ? 'Audio Test' : 'Text Test'}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {result.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {/* Original Text */}
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700">Original:</p>
                    <p className="text-gray-900">{result.originalText}</p>
                  </div>

                  {/* Audio-specific info */}
                  {result.transcribedText && (
                    <div className="mb-3 p-3 bg-purple-50 rounded">
                      <p className="text-sm font-medium text-purple-700">Transcribed:</p>
                      <p className="text-purple-900">{result.transcribedText}</p>
                      {result.transcriptionAccuracy !== undefined && (
                        <p className="text-sm text-purple-600 mt-1">
                          Transcription Accuracy: {result.transcriptionAccuracy.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  )}

                  {/* Translation Results */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedModels.includes('marian') && (
                      <div className="p-3 bg-blue-50 rounded">
                        <p className="text-sm font-medium text-blue-700">MarianMT ({formatLatency(result.marianTime)}):</p>
                        <p className="text-blue-900">{result.marianResult}</p>
                      </div>
                    )}
                    
                    {selectedModels.includes('google') && (
                      <div className="p-3 bg-green-50 rounded">
                        <p className="text-sm font-medium text-green-700">Google ({formatLatency(result.googleTime)}):</p>
                        <p className="text-green-900">{result.googleResult}</p>
                      </div>
                    )}
                    
                    {selectedModels.includes('m2m100') && result.m2m100Result && (
                      <div className="p-3 bg-yellow-50 rounded">
                        <p className="text-sm font-medium text-yellow-700">M2M-100 ({formatLatency(result.m2m100Time || 0)}):</p>
                        <p className="text-yellow-900">{result.m2m100Result}</p>
                      </div>
                    )}
                    
                    {selectedModels.includes('chatgpt') && result.chatgptResult && (
                      <div className="p-3 bg-purple-50 rounded">
                        <p className="text-sm font-medium text-purple-700">ChatGPT ({formatLatency(result.chatgptTime || 0)}):</p>
                        <p className="text-purple-900">{result.chatgptResult}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationTestPage;