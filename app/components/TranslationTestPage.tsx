"use client";

import React, { useState, useEffect, useRef } from 'react';
import { EnhancedTranslationService } from '@/lib/services/EnhancedTranslationService';

// Import the actual types from the service
import type { 
  ThreeModelComparisonResponse,
  CustomComparisonResponse,
  ModelResult
} from '@/lib/services/EnhancedTranslationService';

// Define ModelName type to include all available models
type ModelName = 'marian' | 'google' | 'chatgpt' | 'm2m100' | 'madlad';

interface ModelSet {
  name: string;
  models: ModelName[];
}

// Define the ComparisonResponse type locally since it's not exported
interface ComparisonResponse {
  source_text: string;
  target_language: string;
  marian: {
    translation: string;
    latency: number;
    model: string;
    status?: string;
    error?: string;
  };
  google: {
    translation: string;
    latency: number;
    model: string;
    status?: string;
    error?: string;
  };
  comparison: {
    are_same: boolean;
    length_diff: number;
    speed_diff: number;
    note?: string;
  };
}

// Add HuggingFace comparison response type
interface HuggingFaceComparisonResponse {
  source_text: string;
  target_language: string;
  results: {
    m2m100?: ModelResult;
    madlad?: ModelResult;
    marian?: ModelResult;
    google?: ModelResult;
  };
  comparison: {
    successful_models: string[];
    total_models: number;
    success_rate: number;
  };
}

// Create union type for all possible response types
type AnyComparisonResponse = ComparisonResponse | ThreeModelComparisonResponse | CustomComparisonResponse | HuggingFaceComparisonResponse;

interface TestResult {
  id: string;
  type: 'text' | 'audio';
  text: string;
  language: string;
  marianResult: string;
  googleResult: string;
  chatgptResult?: string;
  m2m100Result?: string;
  madladResult?: string;
  marianTime: number;
  googleTime: number;
  chatgptTime?: number;
  m2m100Time?: number;
  madladTime?: number;
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
  const [selectedLanguage, setSelectedLanguage] = useState<string>('malay');
  const [selectedTestSet, setSelectedTestSet] = useState<string>('museum_tour');
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [showAccuracyMetrics, setShowAccuracyMetrics] = useState<boolean>(true);
  const [testingMode, setTestingMode] = useState<'text' | 'audio'>('text');
  const [selectedModels, setSelectedModels] = useState<ModelName[]>(['marian', 'm2m100']);

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
    { code: 'malay', name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾', supported: { marian: true, google: true } },
    { code: 'chinese', name: 'Chinese', native: '中文', flag: '🇨🇳', supported: { marian: true, google: true } },
    { code: 'tamil', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳', supported: { marian: true, google: true } },
    { code: 'french', name: 'French', native: 'Français', flag: '🇫🇷', supported: { marian: true, google: true } },
    { code: 'spanish', name: 'Spanish', native: 'Español', flag: '🇪🇸', supported: { marian: true, google: true } },
    { code: 'german', name: 'German', native: 'Deutsch', flag: '🇩🇪', supported: { marian: true, google: true } },
    { code: 'japanese', name: 'Japanese', native: '日本語', flag: '🇯🇵', supported: { marian: false, google: true } },
    { code: 'korean', name: 'Korean', native: '한국어', flag: '🇰🇷', supported: { marian: false, google: true } }
  ];

  // Test scripts for audio testing
  const testScripts = {
    easy: [
      {
        id: 'easy_welcome',
        text: 'Welcome to the National Museum. Please follow me for the guided tour.',
        context: 'Museum greeting',
        difficulty: 'easy' as const,
        keywords: ['welcome', 'museum', 'follow', 'tour'],
        expectedChallenges: ['Clear pronunciation', 'Basic vocabulary']
      },
      {
        id: 'easy_directions',
        text: 'This way to the historical artifacts section. We have many ancient items here.',
        context: 'Navigation',
        difficulty: 'easy' as const,
        keywords: ['way', 'historical', 'artifacts', 'ancient'],
        expectedChallenges: ['Direction words', 'Simple descriptions']
      }
    ],
    medium: [
      {
        id: 'medium_architecture',
        text: 'This building showcases traditional Malaysian architecture, blending Islamic, Chinese, and Indian influences.',
        context: 'Cultural explanation',
        difficulty: 'medium' as const,
        keywords: ['traditional', 'architecture', 'Islamic', 'Chinese', 'Indian', 'cultural'],
        expectedChallenges: ['Cultural terms', 'Multiple ethnicities', 'Architectural vocabulary']
      },
      {
        id: 'medium_ceremony',
        text: 'The royal coronation ceremony incorporates ancient rituals that have been preserved for over six hundred years.',
        context: 'Ceremonial description',
        difficulty: 'medium' as const,
        keywords: ['coronation', 'ceremony', 'rituals', 'preserved', 'hundred'],
        expectedChallenges: ['Formal language', 'Historical context', 'Time expressions']
      }
    ],
    hard: [
      {
        id: 'hard_archaeological',
        text: 'The stratigraphic analysis reveals that this particular stratum contains ceramic fragments characteristic of the transitional period between the Hindu-Buddhist and Islamic epochs in Southeast Asian civilization.',
        context: 'Academic archaeological description',
        difficulty: 'hard' as const,
        keywords: ['stratigraphic', 'stratum', 'ceramic', 'transitional', 'Hindu-Buddhist', 'Islamic', 'epochs', 'civilization'],
        expectedChallenges: ['Academic vocabulary', 'Technical terminology', 'Complex sentence structure', 'Historical periods']
      }
    ]
  };

  // Test sets for text testing
  const testSets = {
    museum_tour: {
      name: 'Museum Tour Guide',
      category: 'Tourism',
      tests: [
        'Welcome to our national museum. This building houses over 10,000 artifacts from Malaysian history.',
        'The ancient Malay kingdoms flourished through maritime trade with China and India.',
        'This ceremonial sword belonged to Sultan Abdullah and dates back to the 16th century.',
        'Traditional batik patterns often incorporate Islamic geometric designs with natural motifs.'
      ]
    },
    technical: {
      name: 'Technical Documentation',
      category: 'Technical',
      tests: [
        'The application utilizes machine learning algorithms for real-time speech recognition.',
        'Database optimization requires indexing strategies and query performance monitoring.',
        'The API endpoint returns JSON responses with nested object structures.',
        'Authentication middleware validates JWT tokens and manages session state.'
      ]
    }
  };

  // Model sets for comparison
  const predefinedSets: ModelSet[] = [
    { name: 'All Models', models: ['marian', 'google', 'chatgpt'] },
    { name: 'MT Only', models: ['marian', 'google'] },
    { name: 'AI Focus', models: ['google', 'chatgpt'] }
  ];

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      if (recognitionRef.current) {
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');
          setTranscriptionText(transcript);
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }
    }
  }, []);

  // Service status check
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        const status = await EnhancedTranslationService.healthCheck();
        // Health check returns an object, extract the boolean status
        if (typeof status === 'object' && status !== null) {
          setIsServiceOnline(true);
        } else {
          setIsServiceOnline(Boolean(status));
        }
      } catch (error) {
        console.error('Service check failed:', error);
        setIsServiceOnline(false);
      }
    };

    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Helper functions
  const calculateTranscriptionAccuracy = (original: string, transcribed: string): number => {
    const originalWords = original.toLowerCase().split(/\s+/);
    const transcribedWords = transcribed.toLowerCase().split(/\s+/);
    const maxLength = Math.max(originalWords.length, transcribedWords.length);
    
    let matches = 0;
    for (let i = 0; i < Math.min(originalWords.length, transcribedWords.length); i++) {
      if (originalWords[i] === transcribedWords[i]) {
        matches++;
      }
    }
    
    return Math.round((matches / maxLength) * 100);
  };

  const downloadTestScripts = () => {
    const allScripts = Object.values(testScripts).flat();
    const content = allScripts.map(script => 
      `ID: ${script.id}\nDifficulty: ${script.difficulty}\nText: ${script.text}\nContext: ${script.context}\nKeywords: ${script.keywords.join(', ')}\n\n`
    ).join('');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audio-test-scripts.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateRandomScript = () => {
    const scripts = testScripts[selectedDifficulty];
    const randomScript = scripts[Math.floor(Math.random() * scripts.length)];
    setCurrentScript(randomScript);
    setTranscriptionText('');
  };

  const startRecording = async () => {
    if (!recognitionRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start();
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
  };

  // Helper function to calculate BLEU and ROUGE scores
  const calculateAccuracyMetrics = (translation1: string, translation2: string, referenceTranslation: string) => {
    // Simple BLEU score approximation (word-level n-gram overlap)
    const calculateBLEU = (candidate: string, reference: string): number => {
      const candidateWords = candidate.toLowerCase().split(/\s+/);
      const referenceWords = reference.toLowerCase().split(/\s+/);
      
      if (candidateWords.length === 0) return 0;
      
      let matches = 0;
      candidateWords.forEach(word => {
        if (referenceWords.includes(word)) {
          matches++;
        }
      });
      
      return matches / candidateWords.length;
    };

    // Simple ROUGE score approximation (recall-based)
    const calculateROUGE = (candidate: string, reference: string): number => {
      const candidateWords = candidate.toLowerCase().split(/\s+/);
      const referenceWords = reference.toLowerCase().split(/\s+/);
      
      if (referenceWords.length === 0) return 0;
      
      let matches = 0;
      referenceWords.forEach(word => {
        if (candidateWords.includes(word)) {
          matches++;
        }
      });
      
      return matches / referenceWords.length;
    };

    // Edit distance (Levenshtein distance)
    const calculateEditDistance = (str1: string, str2: string): number => {
      const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
      
      for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
      for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
      
      for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
          const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[j][i] = Math.min(
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1,
            matrix[j - 1][i - 1] + indicator
          );
        }
      }
      
      return matrix[str2.length][str1.length];
    };

    // Semantic similarity (simple word overlap ratio)
    const calculateSemanticSimilarity = (str1: string, str2: string): number => {
      const words1 = new Set(str1.toLowerCase().split(/\s+/));
      const words2 = new Set(str2.toLowerCase().split(/\s+/));
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      
      return union.size > 0 ? intersection.size / union.size : 0;
    };

    const bleu1 = calculateBLEU(translation1, referenceTranslation);
    const bleu2 = calculateBLEU(translation2, referenceTranslation);
    
    const rouge1 = calculateROUGE(translation1, referenceTranslation);
    const rouge2 = calculateROUGE(translation2, referenceTranslation);
    
    const edit1 = calculateEditDistance(translation1, referenceTranslation);
    const edit2 = calculateEditDistance(translation2, referenceTranslation);
    
    const semantic1 = calculateSemanticSimilarity(translation1, referenceTranslation);
    const semantic2 = calculateSemanticSimilarity(translation2, referenceTranslation);

    return {
      model1: {
        bleuScore: bleu1,
        rougeScore: rouge1,
        editDistance: edit1,
        semanticSimilarity: semantic1
      },
      model2: {
        bleuScore: bleu2,
        rougeScore: rouge2,
        editDistance: edit2,
        semanticSimilarity: semantic2
      }
    };
  };
  // Helper function to extract translation data from any response type
  const extractTranslationData = (comparison: AnyComparisonResponse, referenceTranslation?: string) => {
    let marianResult = '';
    let googleResult = '';
    let chatgptResult = '';
    let m2m100Result = '';
    let madladResult = '';
    let marianTime = 0;
    let googleTime = 0;
    let chatgptTime = 0;
    let m2m100Time = 0;
    let madladTime = 0;

    if ('results' in comparison) {
      // Handle ThreeModelComparisonResponse, CustomComparisonResponse, or HuggingFaceComparisonResponse
      const results = comparison.results;
      
      if ('marian' in results && results.marian) {
        marianResult = results.marian.translation || '';
        marianTime = results.marian.latency || 0;
      }
      if ('google' in results && results.google) {
        googleResult = results.google.translation || '';
        googleTime = results.google.latency || 0;
      }
      if ('chatgpt' in results && results.chatgpt) {
        chatgptResult = results.chatgpt.translation || '';
        chatgptTime = results.chatgpt.latency || 0;
      }
      if ('m2m100' in results && results.m2m100) {
        m2m100Result = results.m2m100.translation || '';
        m2m100Time = results.m2m100.latency || 0;
      }
      if ('madlad' in results && results.madlad) {
        madladResult = results.madlad.translation || '';
        madladTime = results.madlad.latency || 0;
      }
    } else {
      // Handle ComparisonResponse
      if ('marian' in comparison && comparison.marian) {
        marianResult = comparison.marian.translation || '';
        marianTime = comparison.marian.latency || 0;
      }
      if ('google' in comparison && comparison.google) {
        googleResult = comparison.google.translation || '';
        googleTime = comparison.google.latency || 0;
      }
    }

    // Calculate accuracy metrics if reference translation is available
    let accuracyMetrics = undefined;
    if (referenceTranslation && selectedModels.length === 2) {
      const getTranslationByModel = (model: ModelName): string => {
        switch (model) {
          case 'marian': return marianResult;
          case 'google': return googleResult;
          case 'chatgpt': return chatgptResult;
          case 'm2m100': return m2m100Result;
          case 'madlad': return madladResult;
          default: return '';
        }
      };

      const translation1 = getTranslationByModel(selectedModels[0]);
      const translation2 = getTranslationByModel(selectedModels[1]);
      
      if (translation1 && translation2) {
        const metrics = calculateAccuracyMetrics(translation1, translation2, referenceTranslation);
        
        accuracyMetrics = {
          bleuScore: {
            [selectedModels[0]]: metrics.model1.bleuScore,
            [selectedModels[1]]: metrics.model2.bleuScore,
          },
          rougeScore: {
            [selectedModels[0]]: metrics.model1.rougeScore,
            [selectedModels[1]]: metrics.model2.rougeScore,
          },
          editDistance: {
            [selectedModels[0]]: metrics.model1.editDistance,
            [selectedModels[1]]: metrics.model2.editDistance,
          },
          semanticSimilarity: {
            [selectedModels[0]]: metrics.model1.semanticSimilarity,
            [selectedModels[1]]: metrics.model2.semanticSimilarity,
          },
          referenceTranslation
        };
      }
    }

    return {
      marianResult,
      googleResult,
      chatgptResult,
      m2m100Result,
      madladResult,
      marianTime,
      googleTime,
      chatgptTime,
      m2m100Time,
      madladTime,
      accuracyMetrics
    };
  };

  // Helper function to get model display name
  const getModelDisplayName = (model: ModelName): string => {
    switch (model) {
      case 'marian': return 'MarianMT';
      case 'google': return 'Google Translate';
      case 'chatgpt': return 'ChatGPT';
      case 'm2m100': return 'M2M-100';
      case 'madlad': return 'MADLAD-400';
      default: return model;
    }
  };

  // Helper function to get all available models
  const getAllModels = (): ModelName[] => ['marian', 'google', 'chatgpt', 'm2m100', 'madlad'];

  // Helper function to get reference model
  const getReferenceModel = (): ModelName | undefined => {
    return getAllModels().find(model => !selectedModels.includes(model));
  };
    if (!currentScript || !transcriptionText) return;

    setIsProcessing(true);
    const startTime = Date.now();

    try {
  const processAudioTest = async () => {
    if (!currentScript || !transcriptionText) return;

    setIsProcessing(true);
    const startTime = Date.now();

    try {
      // Get reference translation from unselected model
      const allModels = getAllModels();
      const unselectedModel = allModels.find(model => !selectedModels.includes(model));
      let referenceTranslation = '';

      // Get reference translation first if there's an unselected model
      if (unselectedModel) {
        try {
          const referenceResponse = await EnhancedTranslationService.translateText(transcriptionText, selectedLanguage, unselectedModel);
          referenceTranslation = referenceResponse;
        } catch (error) {
          console.warn('Failed to get reference translation:', error);
        }
      }
      
      let comparison: AnyComparisonResponse;
      
      if (selectedModels.length === 2 && selectedModels.includes('marian') && selectedModels.includes('google')) {
        comparison = await EnhancedTranslationService.compareTranslations(transcriptionText, selectedLanguage);
      } else {
        comparison = await EnhancedTranslationService.compareCustomModels(transcriptionText, selectedLanguage, selectedModels);
      }

      const transcriptionAccuracy = calculateTranscriptionAccuracy(
        currentScript.text, 
        transcriptionText
      );

      // Use helper function to extract data safely with reference translation
      const translationData = extractTranslationData(comparison, referenceTranslation);

      const totalLatency = (Date.now() - startTime) / 1000;

      const testResult: TestResult = {
        id: `audio_${Date.now()}`,
        type: 'audio',
        text: transcriptionText,
        language: selectedLanguage,
        marianResult: translationData.marianResult,
        googleResult: translationData.googleResult,
        chatgptResult: translationData.chatgptResult,
        m2m100Result: translationData.m2m100Result,
        madladResult: translationData.madladResult,
        marianTime: translationData.marianTime,
        googleTime: translationData.googleTime,
        chatgptTime: translationData.chatgptTime,
        m2m100Time: translationData.m2m100Time,
        madladTime: translationData.madladTime,
        timestamp: new Date(),
        transcribedText: transcriptionText,
        transcriptionAccuracy,
        audioScript: currentScript,
        totalLatency,
        fullComparison: comparison,
        accuracyMetrics: translationData.accuracyMetrics
      };

      setTestResults(prev => [testResult, ...prev]);
      setCurrentScript(null);
      setTranscriptionText('');
    } catch (error) {
      console.error('Error processing audio test:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const runTextTests = async () => {
    if (!testSets[selectedTestSet as keyof typeof testSets]) return;

    setIsRunningTests(true);
    const tests = testSets[selectedTestSet as keyof typeof testSets].tests;

    for (const test of tests) {
      setCurrentTest(test);

      try {
        // Get reference translation from unselected model
        const allModels = getAllModels();
        const unselectedModel = allModels.find(model => !selectedModels.includes(model));
        let referenceTranslation = '';

        // Get reference translation first if there's an unselected model
        if (unselectedModel) {
          try {
            const referenceResponse = await EnhancedTranslationService.translateText(test, selectedLanguage, unselectedModel);
            referenceTranslation = referenceResponse;
          } catch (error) {
            console.warn('Failed to get reference translation:', error);
          }
        }

        let comparison: AnyComparisonResponse;
        
        if (selectedModels.length === 2 && selectedModels.includes('marian') && selectedModels.includes('google')) {
          comparison = await EnhancedTranslationService.compareTranslations(test, selectedLanguage);
        } else {
          comparison = await EnhancedTranslationService.compareCustomModels(test, selectedLanguage, selectedModels);
        }

        // Use helper function to extract data safely with reference translation
        const translationData = extractTranslationData(comparison, referenceTranslation);

        const testResult: TestResult = {
          id: `text_${Date.now()}_${Math.random()}`,
          type: 'text',
          text: test,
          language: selectedLanguage,
          marianResult: translationData.marianResult,
          googleResult: translationData.googleResult,
          chatgptResult: translationData.chatgptResult,
          m2m100Result: translationData.m2m100Result,
          madladResult: translationData.madladResult,
          marianTime: translationData.marianTime,
          googleTime: translationData.googleTime,
          chatgptTime: translationData.chatgptTime,
          m2m100Time: translationData.m2m100Time,
          madladTime: translationData.madladTime,
          timestamp: new Date(),
          fullComparison: comparison,
          accuracyMetrics: translationData.accuracyMetrics
        };

        setTestResults(prev => [testResult, ...prev]);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error running test:', error);
      }
    }

    setIsRunningTests(false);
    setCurrentTest('');
  };

  // Calculate comprehensive statistics (moved before usage)
  const calculateStats = () => {
    if (testResults.length === 0) return null;

    // Helper function to get result by model
    const getResultByModel = (result: TestResult, model: ModelName): string => {
      switch (model) {
        case 'marian': return result.marianResult;
        case 'google': return result.googleResult;
        case 'chatgpt': return result.chatgptResult || '';
        case 'm2m100': return result.m2m100Result || '';
        case 'madlad': return result.madladResult || '';
        default: return '';
      }
    };

    // Helper function to get time by model
    const getTimeByModel = (result: TestResult, model: ModelName): number => {
      switch (model) {
        case 'marian': return result.marianTime;
        case 'google': return result.googleTime;
        case 'chatgpt': return result.chatgptTime || 0;
        case 'm2m100': return result.m2m100Time || 0;
        case 'madlad': return result.madladTime || 0;
        default: return 0;
      }
    };

    return {
      // Overall metrics
      total: testResults.length,
      textTests: testResults.filter(r => r.type === 'text').length,
      audioTests: testResults.filter(r => r.type === 'audio').length,
      
      // Performance metrics for selected models only
      avgSelectedModelTimes: selectedModels.reduce((acc, model) => {
        const validResults = testResults.filter(r => getTimeByModel(r, model) > 0);
        acc[model] = validResults.length > 0 
          ? (validResults.reduce((sum, r) => sum + getTimeByModel(r, model), 0) / validResults.length).toFixed(2)
          : 'N/A';
        return acc;
      }, {} as Record<string, string>),
      
      // Success rates for selected models only
      selectedModelSuccessRates: selectedModels.reduce((acc, model) => {
        const successfulResults = testResults.filter(r => {
          const result = getResultByModel(r, model);
          return result && result !== 'Failed' && result !== '';
        });
        acc[model] = ((successfulResults.length / testResults.length) * 100).toFixed(1);
        return acc;
      }, {} as Record<string, string>),
      
      // Performance comparisons between selected models
      fasterSelectedModel: (() => {
        if (selectedModels.length === 2) {
          const model1Times = testResults.reduce((acc, r) => acc + getTimeByModel(r, selectedModels[0]), 0) / testResults.length;
          const model2Times = testResults.reduce((acc, r) => acc + getTimeByModel(r, selectedModels[1]), 0) / testResults.length;
          
          const faster = model1Times <= model2Times ? selectedModels[0] : selectedModels[1];
          return getModelDisplayName(faster);
        }
        return 'N/A';
      })(),
      
      // Audio-specific metrics
      avgTranscriptionAccuracy: testResults.filter(r => r.type === 'audio' && r.transcriptionAccuracy).length > 0
        ? (testResults.filter(r => r.type === 'audio' && r.transcriptionAccuracy).reduce((acc, r) => acc + (r.transcriptionAccuracy || 0), 0) / testResults.filter(r => r.type === 'audio' && r.transcriptionAccuracy).length).toFixed(1)
        : 'N/A',
      avgTotalLatency: testResults.filter(r => r.type === 'audio' && r.totalLatency).length > 0
        ? (testResults.filter(r => r.type === 'audio' && r.totalLatency).reduce((acc, r) => acc + (r.totalLatency || 0), 0) / testResults.filter(r => r.type === 'audio' && r.totalLatency).length).toFixed(2)
        : 'N/A',
      
      // Language distribution
      languageDistribution: testResults.reduce((acc, r) => {
        acc[r.language] = (acc[r.language] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      
      // Test type distribution by difficulty (for audio tests)
      difficultyDistribution: testResults.filter(r => r.type === 'audio' && r.audioScript).reduce((acc, r) => {
        const difficulty = r.audioScript?.difficulty || 'unknown';
        acc[difficulty] = (acc[difficulty] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      
      // BLEU/ROUGE statistics for tests with accuracy metrics
      accuracyStats: testResults.filter(r => r.accuracyMetrics).length > 0 ? {
        avgBLEUScores: selectedModels.reduce((acc, model) => {
          const validResults = testResults.filter(r => r.accuracyMetrics?.bleuScore?.[model] !== undefined);
          acc[model] = validResults.length > 0 
            ? (validResults.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore?.[model] || 0), 0) / validResults.length).toFixed(3)
            : 'N/A';
          return acc;
        }, {} as Record<string, string>),
        
        avgROUGEScores: selectedModels.reduce((acc, model) => {
          const validResults = testResults.filter(r => r.accuracyMetrics?.rougeScore?.[model] !== undefined);
          acc[model] = validResults.length > 0 
            ? (validResults.reduce((sum, r) => sum + (r.accuracyMetrics?.rougeScore?.[model] || 0), 0) / validResults.length).toFixed(3)
            : 'N/A';
          return acc;
        }, {} as Record<string, string>),
        
        avgEditDistance: selectedModels.reduce((acc, model) => {
          const validResults = testResults.filter(r => r.accuracyMetrics?.editDistance?.[model] !== undefined);
          acc[model] = validResults.length > 0 
            ? (validResults.reduce((sum, r) => sum + (r.accuracyMetrics?.editDistance?.[model] || 0), 0) / validResults.length).toFixed(1)
            : 'N/A';
          return acc;
        }, {} as Record<string, string>),
        
        avgSemanticSimilarity: selectedModels.reduce((acc, model) => {
          const validResults = testResults.filter(r => r.accuracyMetrics?.semanticSimilarity?.[model] !== undefined);
          acc[model] = validResults.length > 0 
            ? (validResults.reduce((sum, r) => sum + (r.accuracyMetrics?.semanticSimilarity?.[model] || 0), 0) / validResults.length).toFixed(3)
            : 'N/A';
          return acc;
        }, {} as Record<string, string>),
        
        referenceModel: getReferenceModel()
      } : null,
      
      // Model comparison insights for selected models
      modelComparison: {
        fastestOverall: (() => {
          if (selectedModels.length === 2) {
            const times = selectedModels.map(model => parseFloat(calculateStats()?.avgSelectedModelTimes?.[model] || '999'));
            const faster = selectedModels[times[0] <= times[1] ? 0 : 1];
            return getModelDisplayName(faster);
          }
          return 'N/A';
        })(),
        mostReliable: (() => {
          if (selectedModels.length === 2) {
            const rates = selectedModels.map(model => parseFloat(calculateStats()?.selectedModelSuccessRates?.[model] || '0'));
            const moreReliable = selectedModels[rates[0] >= rates[1] ? 0 : 1];
            return getModelDisplayName(moreReliable);
          }
          return 'N/A';
        })(),
        bestBLEU: testResults.filter(r => r.accuracyMetrics).length > 0 && selectedModels.length === 2 ? (() => {
          const stats = calculateStats();
          const scores = selectedModels.map(model => parseFloat(stats?.accuracyStats?.avgBLEUScores?.[model] || '0'));
          const better = selectedModels[scores[0] >= scores[1] ? 0 : 1];
          return getModelDisplayName(better);
        })() : 'N/A',
        bestROUGE: testResults.filter(r => r.accuracyMetrics).length > 0 && selectedModels.length === 2 ? (() => {
          const stats = calculateStats();
          const scores = selectedModels.map(model => parseFloat(stats?.accuracyStats?.avgROUGEScores?.[model] || '0'));
          const better = selectedModels[scores[0] >= scores[1] ? 0 : 1];
          return getModelDisplayName(better);
        })() : 'N/A'
      }
    };
  };

  const stats = calculateStats();

  const currentTestSet = testSets[selectedTestSet as keyof typeof testSets];
  const availableLanguages = new Set(languages.map(lang => lang.code));
  const allTestSets = Object.entries(testSets).map(([key, set]) => ({ key, ...set }));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Translation Testing Suite</h1>
        <p className="text-gray-600">Comprehensive testing for audio and text translation accuracy</p>
        
        {/* Service Status */}
        <div className="flex justify-center items-center mt-4">
          <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            isServiceOnline === null ? 'bg-yellow-100 text-yellow-800' :
            isServiceOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isServiceOnline === null ? 'bg-yellow-400' :
              isServiceOnline ? 'bg-green-400' : 'bg-red-400'
            }`}></div>
            {isServiceOnline === null ? 'Checking...' : isServiceOnline ? 'Service Online' : 'Service Offline'}
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-center space-x-4 mb-6">
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

        {/* Model Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Two Translation Models to Compare</label>
          <div className="flex flex-wrap gap-2">
            {(['marian', 'google', 'm2m100', 'madlad'] as ModelName[]).map(model => (
              <button
                key={model}
                onClick={() => {
                  setSelectedModels(prev => {
                    if (prev.includes(model)) {
                      // Remove model if already selected
                      return prev.filter(m => m !== model);
                    } else if (prev.length < 2) {
                      // Add model if less than 2 selected
                      return [...prev, model];
                    } else {
                      // Replace oldest model if 2 already selected
                      return [prev[1], model];
                    }
                  });
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedModels.includes(model)
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-gray-200'
                }`}
              >
                {model === 'marian' ? 'MarianMT' : 
                 model === 'google' ? 'Google Translate' : 
                 model === 'm2m100' ? 'M2M-100 (Facebook)' :
                 model === 'madlad' ? 'MADLAD-400 (Google)' : 'ChatGPT'}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            <div>Selected models: {selectedModels.length > 0 ? selectedModels.map(m => getModelDisplayName(m)).join(' vs ') : 'None'}</div>
            {selectedModels.length === 2 && (
              <div className="mt-1">
                <span className="text-blue-600">
                  Reference model for BLEU/ROUGE scores: {
                    getReferenceModel() ? getModelDisplayName(getReferenceModel()!) : 'None'
                  }
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Text Testing Interface */}
        {testingMode === 'text' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name} ({lang.native})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Test Set</label>
                <select
                  value={selectedTestSet}
                  onChange={(e) => setSelectedTestSet(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(testSets).map(([key, set]) => (
                    <option key={key} value={key}>{set.name} ({set.tests.length} tests)</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Test Set Preview */}
            {currentTestSet && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-2">{currentTestSet.name}</h3>
                <p className="text-sm text-gray-600 mb-3">Category: {currentTestSet.category}</p>
                <div className="space-y-2">
                  {currentTestSet.tests.slice(0, 2).map((test, index) => (
                    <div key={index} className="text-sm text-gray-700 italic">
                      "{test.substring(0, 100)}{test.length > 100 ? '...' : ''}"
                    </div>
                  ))}
                  {currentTestSet.tests.length > 2 && (
                    <div className="text-sm text-gray-500">
                      +{currentTestSet.tests.length - 2} more tests...
                    </div>
                  )}
                </div>

                <div className="flex justify-center mt-4">
                  <button
                    onClick={runTextTests}
                    disabled={isRunningTests || !isServiceOnline || selectedModels.length !== 2}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-semibold disabled:bg-gray-300"
                  >
                    {isRunningTests ? 'Running Tests...' : selectedModels.length !== 2 ? 'Select 2 Models' : `Run ${currentTestSet.name}`}
                  </button>
                </div>
              </div>
            )}

            {isRunningTests && (
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                  <span className="text-blue-700">
                    Running text translation tests using {selectedModels.join(', ')}... ({testResults.filter(r => r.type === 'text').length}/{currentTestSet.tests.length} completed)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio Testing Interface */}
        {testingMode === 'audio' && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Audio Translation Testing</h2>
              <p className="text-gray-600">Complete pipeline testing: Audio capture → Transcription → Translation</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Script Difficulty</label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="easy">Easy (Basic vocabulary)</option>
                  <option value="medium">Medium (Cultural terms)</option>
                  <option value="hard">Hard (Technical/Academic)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={generateRandomScript}
                  className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium"
                >
                  🎲 Generate Script
                </button>
              </div>
            </div>

            {/* Current Script Display */}
            {currentScript && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-800">Read This Script:</h3>
                  <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded">
                    {currentScript.difficulty.toUpperCase()}
                  </span>
                </div>
                <div className="text-lg text-gray-900 mb-2 leading-relaxed">
                  "{currentScript.text}"
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Context:</strong> {currentScript.context}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  <strong>Keywords:</strong> {currentScript.keywords.join(', ')}
                </div>
              </div>
            )}

            {/* Recording Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!currentScript || selectedModels.length !== 2}
                className={`px-6 py-3 rounded-full font-semibold disabled:bg-gray-300 ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-purple-500 hover:bg-purple-600 text-white'
                }`}
              >
                {selectedModels.length !== 2 ? 'Select 2 Models' : 
                 isRecording ? '🛑 Stop Recording' : '🎙️ Start Recording'}
              </button>

              {transcriptionText && (
                <button
                  onClick={processAudioTest}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-full font-semibold disabled:bg-gray-300"
                >
                  {isProcessing ? '⏳ Processing...' : '🔄 Process & Translate'}
                </button>
              )}
            </div>

            {/* Transcription Display */}
            {transcriptionText && (
              <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold text-gray-700 mb-2">Live Transcription:</h4>
                <div className="text-gray-900 italic">"{transcriptionText}"</div>
              </div>
            )}

            {/* Utility Buttons */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={downloadTestScripts}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
              >
                📥 Download All Scripts
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Comprehensive Testing Statistics */}
      {stats && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Comprehensive Testing Statistics</h2>
          <div className="text-sm text-gray-600 mb-4">
            Analyzing comparison between: {selectedModels.map(m => 
              m === 'marian' ? 'MarianMT' : m === 'google' ? 'Google Translate' : 'ChatGPT'
            ).join(' vs ')}
            {stats.accuracyStats?.referenceModel && (
              <span className="ml-2 text-blue-600">
                | Reference: {stats.accuracyStats.referenceModel === 'marian' ? 'MarianMT' : 
                            stats.accuracyStats.referenceModel === 'google' ? 'Google Translate' : 'ChatGPT'}
              </span>
            )}
          </div>
          
          {/* Overall Performance */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Overall Performance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-indigo-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-600">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Tests</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.textTests}</div>
                <div className="text-sm text-gray-600">Text Tests</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.audioTests}</div>
                <div className="text-sm text-gray-600">Audio Tests</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-600">{stats.fasterSelectedModel}</div>
                <div className="text-sm text-gray-600">Faster Model</div>
              </div>
            </div>
          </div>

          {/* Translation Speed Performance - Selected Models */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Translation Speed Performance</h3>
            <div className={`grid grid-cols-1 md:grid-cols-2 ${selectedModels.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-4`}>
              {selectedModels.map((model, index) => {
                const colorClasses = [
                  'bg-blue-50 text-blue-600',
                  'bg-green-50 text-green-600',
                  'bg-orange-50 text-orange-600'
                ];
                const modelName = model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google Translate' : 'ChatGPT';
                
                return (
                  <div key={model} className={`text-center p-3 rounded-lg ${colorClasses[index] || 'bg-gray-50 text-gray-600'}`}>
                    <div className="text-2xl font-bold">{stats.avgSelectedModelTimes[model]}s</div>
                    <div className="text-sm text-gray-600">Avg {modelName} Time</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Success Rates - Selected Models */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Model Success Rates</h3>
            <div className={`grid grid-cols-1 md:grid-cols-2 ${selectedModels.length === 2 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
              {selectedModels.map((model, index) => {
                const colorClasses = [
                  'bg-blue-50 text-blue-600',
                  'bg-green-50 text-green-600',
                  'bg-orange-50 text-orange-600'
                ];
                const modelName = model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google Translate' : 'ChatGPT';
                
                return (
                  <div key={model} className={`text-center p-3 rounded-lg ${colorClasses[index] || 'bg-gray-50 text-gray-600'}`}>
                    <div className="text-2xl font-bold">{stats.selectedModelSuccessRates[model]}%</div>
                    <div className="text-sm text-gray-600">{modelName} Success</div>
                  </div>
                );
              })}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-600">{stats.modelComparison.mostReliable}</div>
                <div className="text-sm text-gray-600">Most Reliable</div>
              </div>
            </div>
          </div>

          {/* BLEU/ROUGE Accuracy Metrics */}
          {stats.accuracyStats && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Translation Accuracy vs Reference</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* BLEU Scores */}
                <div className="bg-cyan-50 rounded-lg p-4">
                  <h4 className="font-semibold text-cyan-800 mb-2">BLEU Scores</h4>
                  {selectedModels.map(model => {
                    const modelName = model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT';
                    return (
                      <div key={model} className="text-sm">
                        <span className="font-medium">{modelName}:</span> {stats.accuracyStats?.avgBLEUScores[model]}
                      </div>
                    );
                  })}
                  <div className="text-xs text-cyan-600 mt-1 font-semibold">
                    Best: {stats.modelComparison.bestBLEU}
                  </div>
                </div>

                {/* ROUGE Scores */}
                <div className="bg-emerald-50 rounded-lg p-4">
                  <h4 className="font-semibold text-emerald-800 mb-2">ROUGE Scores</h4>
                  {selectedModels.map(model => {
                    const modelName = model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT';
                    return (
                      <div key={model} className="text-sm">
                        <span className="font-medium">{modelName}:</span> {stats.accuracyStats?.avgROUGEScores[model]}
                      </div>
                    );
                  })}
                  <div className="text-xs text-emerald-600 mt-1 font-semibold">
                    Best: {stats.modelComparison.bestROUGE}
                  </div>
                </div>

                {/* Edit Distance */}
                <div className="bg-amber-50 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-800 mb-2">Avg Edit Distance</h4>
                  {selectedModels.map(model => {
                    const modelName = model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT';
                    return (
                      <div key={model} className="text-sm">
                        <span className="font-medium">{modelName}:</span> {stats.accuracyStats?.avgEditDistance[model]}
                      </div>
                    );
                  })}
                  <div className="text-xs text-amber-600 mt-1">
                    (Lower is better)
                  </div>
                </div>

                {/* Semantic Similarity */}
                <div className="bg-rose-50 rounded-lg p-4">
                  <h4 className="font-semibold text-rose-800 mb-2">Semantic Similarity</h4>
                  {selectedModels.map(model => {
                    const modelName = model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT';
                    return (
                      <div key={model} className="text-sm">
                        <span className="font-medium">{modelName}:</span> {stats.accuracyStats?.avgSemanticSimilarity[model]}
                      </div>
                    );
                  })}
                  <div className="text-xs text-rose-600 mt-1">
                    (Higher is better)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audio-Specific Metrics */}
          {stats.audioTests > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Audio Pipeline Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{stats.avgTranscriptionAccuracy}%</div>
                  <div className="text-sm text-gray-600">Avg Transcription Accuracy</div>
                </div>
                <div className="text-center p-3 bg-indigo-50 rounded-lg">
                  <div className="text-2xl font-bold text-indigo-600">{stats.avgTotalLatency}s</div>
                  <div className="text-sm text-gray-600">Avg Total Pipeline Latency</div>
                </div>
                <div className="text-center p-3 bg-cyan-50 rounded-lg">
                  <div className="text-2xl font-bold text-cyan-600">{Object.keys(stats.difficultyDistribution).length}</div>
                  <div className="text-sm text-gray-600">Difficulty Levels Tested</div>
                </div>
              </div>
            </div>
          )}

          {/* Test Analysis */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Test Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Language Distribution */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-3">Languages Tested</h4>
                <div className="space-y-2">
                  {Object.entries(stats.languageDistribution).map(([lang, count]) => (
                    <div key={lang} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 capitalize">{lang}</span>
                      <span className="text-sm font-medium text-gray-800">{count} tests</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model Comparison Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-700 mb-3">Model Comparison Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fastest Model:</span>
                    <span className="font-medium text-gray-800">{stats.modelComparison.fastestOverall}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Most Reliable:</span>
                    <span className="font-medium text-gray-800">{stats.modelComparison.mostReliable}</span>
                  </div>
                  {stats.accuracyStats && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Best BLEU Score:</span>
                        <span className="font-medium text-gray-800">{stats.modelComparison.bestBLEU}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Best ROUGE Score:</span>
                        <span className="font-medium text-gray-800">{stats.modelComparison.bestROUGE}</span>
                      </div>
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <span className="text-gray-600 text-xs">
                          Reference Model: {stats.accuracyStats.referenceModel === 'marian' ? 'MarianMT' : 
                                          stats.accuracyStats.referenceModel === 'google' ? 'Google Translate' : 'ChatGPT'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Difficulty Distribution (Audio Tests) */}
              {Object.keys(stats.difficultyDistribution).length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Audio Test Difficulty</h4>
                  <div className="space-y-2">
                    {Object.entries(stats.difficultyDistribution).map(([difficulty, count]) => (
                      <div key={difficulty} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 capitalize">{difficulty}</span>
                        <span className="text-sm font-medium text-gray-800">{count} tests</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Performance Insights */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Performance Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Speed Analysis</h4>
                <p className="text-sm text-gray-600">
                  <strong>{stats.modelComparison.fastestOverall}</strong> consistently outperforms with an average response time of{' '}
                  {selectedModels.length === 2 ? 
                    Object.entries(stats.avgSelectedModelTimes).find(([model]) => 
                      (model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google Translate' : 'ChatGPT') === stats.modelComparison.fastestOverall
                    )?.[1] : 'N/A'}s
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Reliability Analysis</h4>
                <p className="text-sm text-gray-600">
                  <strong>{stats.modelComparison.mostReliable}</strong> maintains the highest success rate at{' '}
                  {selectedModels.length === 2 ? 
                    Object.entries(stats.selectedModelSuccessRates).find(([model]) => 
                      (model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google Translate' : 'ChatGPT') === stats.modelComparison.mostReliable
                    )?.[1] : 'N/A'}%
                </p>
              </div>
              {stats.accuracyStats && (
                <>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">BLEU Accuracy</h4>
                    <p className="text-sm text-gray-600">
                      <strong>{stats.modelComparison.bestBLEU}</strong> achieves superior precision with the highest BLEU score against{' '}
                      {stats.accuracyStats.referenceModel === 'marian' ? 'MarianMT' : 
                       stats.accuracyStats.referenceModel === 'google' ? 'Google Translate' : 'ChatGPT'} reference
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">ROUGE Recall</h4>
                    <p className="text-sm text-gray-600">
                      <strong>{stats.modelComparison.bestROUGE}</strong> demonstrates better recall performance with the highest ROUGE score
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Test Results ({testResults.length})</h2>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAccuracyMetrics(!showAccuracyMetrics)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showAccuracyMetrics ? 'Hide' : 'Show'} Accuracy Metrics
              </button>
              <button
                onClick={() => setTestResults([])}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {testResults.map((result) => (
              <div key={result.id} className={`border rounded-lg p-4 ${
                result.type === 'text' 
                  ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50'
              }`}>
                {/* Test Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      result.type === 'text' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {result.type === 'text' ? '📝 TEXT' : '🎙️ AUDIO'}
                    </span>
                    <span className="text-sm text-gray-600">{result.language}</span>
                    {result.type === 'audio' && result.audioScript && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {result.audioScript.difficulty.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {result.timestamp.toLocaleString()}
                  </span>
                </div>

                {/* Audio Test: Original Script vs Transcription */}
                {result.type === 'audio' && result.audioScript && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white p-3 rounded border">
                      <h4 className="font-semibold text-gray-800 mb-2">📜 Original Script</h4>
                      <div className="text-sm text-gray-800 italic">"{result.audioScript.text}"</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Context: {result.audioScript.context}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <h4 className="font-semibold text-gray-800 mb-2">
                        🎙️ Transcription ({result.transcriptionAccuracy}% accurate)
                      </h4>
                      <div className="text-sm text-gray-800 italic">"{result.transcribedText}"</div>
                      {result.totalLatency && (
                        <div className="text-xs text-gray-600 mt-1">
                          Total Pipeline: {result.totalLatency}s
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Text Test: Input Display */}
                {result.type === 'text' && (
                  <div className="bg-white p-3 rounded border mb-4">
                    <h4 className="font-semibold text-gray-800 mb-2">📝 Input Text</h4>
                    <div className="text-sm text-gray-800 italic">"{result.text}"</div>
                  </div>
                )}

                {/* Translation Results - Only show selected models */}
                <div className={`grid grid-cols-1 ${selectedModels.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-4`}>
                  {selectedModels.includes('marian') && (
                    <div className="bg-white p-3 rounded border">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-blue-600">MarianMT</h4>
                        <span className="text-xs text-gray-500">{result.marianTime.toFixed(2)}s</span>
                      </div>
                      <div className="text-sm text-gray-800">"{result.marianResult}"</div>
                    </div>
                  )}

                  {selectedModels.includes('google') && (
                    <div className="bg-white p-3 rounded border">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-green-600">Google Translate</h4>
                        <span className="text-xs text-gray-500">{result.googleTime.toFixed(2)}s</span>
                      </div>
                      <div className="text-sm text-gray-800">"{result.googleResult}"</div>
                    </div>
                  )}

                  {selectedModels.includes('chatgpt') && result.chatgptResult && (
                    <div className="bg-white p-3 rounded border">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-orange-600">ChatGPT</h4>
                        <span className="text-xs text-gray-500">
                          {result.chatgptTime ? `${result.chatgptTime.toFixed(2)}s` : 'N/A'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-800">"{result.chatgptResult}"</div>
                    </div>
                  )}
                </div>

                {/* Reference Translation Display */}
                {result.accuracyMetrics && (
                  <div className="mt-4">
                    <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                      <h4 className="font-semibold text-yellow-800 mb-2">📚 Reference Translation (for BLEU/ROUGE scores)</h4>
                      <div className="text-sm text-gray-800 italic">"{result.accuracyMetrics.referenceTranslation}"</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Generated by: {(['marian', 'google', 'chatgpt'] as ModelName[])
                          .find(model => !selectedModels.includes(model)) === 'marian' ? 'MarianMT' :
                        (['marian', 'google', 'chatgpt'] as ModelName[])
                          .find(model => !selectedModels.includes(model)) === 'google' ? 'Google Translate' : 'ChatGPT'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Accuracy Metrics */}
                {showAccuracyMetrics && result.accuracyMetrics && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-semibold text-gray-800 mb-2">📊 Accuracy Metrics (vs Reference Translation)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-gray-600">BLEU Score</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT'}: {
                              result.accuracyMetrics?.bleuScore?.[model]?.toFixed(3) || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-600">ROUGE Score</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT'}: {
                              result.accuracyMetrics?.rougeScore?.[model]?.toFixed(3) || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-600">Edit Distance</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT'}: {
                              result.accuracyMetrics?.editDistance?.[model] || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-600">Semantic Similarity</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {model === 'marian' ? 'MarianMT' : model === 'google' ? 'Google' : 'ChatGPT'}: {
                              result.accuracyMetrics?.semanticSimilarity?.[model]?.toFixed(3) || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Section */}
      {testResults.length === 0 && (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">🎯 Testing Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div>
              <div className="font-medium text-blue-600 mb-1">📝 Text Testing</div>
              <div>Measures pure translation quality without transcription errors.</div>
            </div>
            <div>
              <div className="font-medium text-purple-600 mb-1">🎙️ Audio Testing</div>
              <div>Complete pipeline testing including speech recognition accuracy and end-to-end latency measurements.</div>
            </div>
            <div>
              <div className="font-medium text-green-600 mb-1">BLEU/ROUGE Scores</div>
              <div>Industry-standard metrics measuring translation precision and recall. Higher scores indicate better accuracy.</div>
            </div>
            <div>
              <div className="font-medium text-orange-600 mb-1">Three-Model Analysis</div>
              <div>Comprehensive comparison across MarianMT, Google Translate, and ChatGPT for optimal model selection.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationTestPage;