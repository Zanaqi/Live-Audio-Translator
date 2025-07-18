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
        text: 'Welcome to the museum. This tour will last about one hour.',
        context: 'Museum entrance greeting',
        difficulty: 'easy',
        keywords: ['museum', 'tour', 'hour'],
        expectedChallenges: ['Time duration translation']
      },
      {
        id: 'museum_easy_2', 
        text: 'This piece is from ancient Egypt. It was discovered in 1920.',
        context: 'Artifact description',
        difficulty: 'easy',
        keywords: ['ancient', 'Egypt', 'discovered'],
        expectedChallenges: ['Historical dates', 'Proper nouns']
      }
    ],
    medium: [
      {
        id: 'museum_medium_1',
        text: 'The intricate carvings on this sarcophagus represent the journey to the afterlife according to Egyptian mythology.',
        context: 'Detailed artifact explanation',
        difficulty: 'medium',
        keywords: ['intricate', 'sarcophagus', 'afterlife', 'mythology'],
        expectedChallenges: ['Technical vocabulary', 'Cultural concepts']
      },
      {
        id: 'museum_medium_2',
        text: 'This Renaissance painting employs the technique of chiaroscuro, creating dramatic contrast between light and shadow.',
        context: 'Art technique description',
        difficulty: 'medium',
        keywords: ['Renaissance', 'chiaroscuro', 'contrast'],
        expectedChallenges: ['Art terminology', 'Italian loanwords']
      }
    ],
    hard: [
      {
        id: 'museum_hard_1',
        text: 'The provenance of this particular artifact has been meticulously documented through dendrochronological analysis and thermoluminescence dating.',
        context: 'Scientific authentication explanation',
        difficulty: 'hard',
        keywords: ['provenance', 'dendrochronological', 'thermoluminescence'],
        expectedChallenges: ['Scientific terminology', 'Complex compound words']
      },
      {
        id: 'museum_hard_2',
        text: 'The iconographic program of this Byzantine mosaic reflects the theological disputes of the Iconoclastic period.',
        context: 'Art historical analysis',
        difficulty: 'hard',
        keywords: ['iconographic', 'Byzantine', 'theological', 'Iconoclastic'],
        expectedChallenges: ['Academic terminology', 'Historical periods']
      }
    ]
  };

  // Pre-defined test sets for comprehensive evaluation
  const testSets = {
    museum_tour: {
      name: 'Museum Tour Scripts',
      description: 'Realistic museum tour dialogues with cultural and historical content',
      tests: [
        'Welcome to the National Gallery. Today we will explore masterpieces from the Renaissance period.',
        'This painting was created by Leonardo da Vinci in 1503. Notice the subtle smile and mysterious expression.',
        'The technique used here is called sfumato, which creates soft transitions between colors and tones.',
        'Moving to our next exhibit, we have artifacts from ancient civilizations dating back 3000 years.',
        'This piece represents the cultural exchange between East and West during the Silk Road era.'
      ]
    },
    tourist_conversation: {
      name: 'Tourist Conversations',
      description: 'Common tourist interactions and inquiries',
      tests: [
        'Excuse me, where is the nearest restroom?',
        'How much does it cost to enter the exhibition?',
        'What time does the museum close today?',
        'Can you recommend a good restaurant nearby?',
        'Is photography allowed in this section?'
      ]
    },
    technical_descriptions: {
      name: 'Technical Descriptions',
      description: 'Complex technical and academic language',
      tests: [
        'The archaeological stratigraphy reveals multiple occupation layers spanning several millennia.',
        'This artifact underwent comprehensive conservation treatment including surface cleaning and structural stabilization.',
        'The iconographic analysis suggests strong Byzantine influences in the decorative program.',
        'Radiocarbon dating places this specimen in the late Paleolithic period.',
        'The curatorial interpretation emphasizes the socio-political context of the work.'
      ]
    }
  };

  // Enhanced accuracy metrics calculation
  const calculateAccuracyMetrics = (translation1: string, translation2: string, reference: string) => {
    // Simple BLEU score approximation
    const calculateBLEU = (candidate: string, reference: string): number => {
      const candidateWords = candidate.toLowerCase().split(/\s+/);
      const referenceWords = reference.toLowerCase().split(/\s+/);
      const matches = candidateWords.filter(word => referenceWords.includes(word));
      return matches.length / Math.max(candidateWords.length, 1);
    };

    // Simple ROUGE score approximation
    const calculateROUGE = (candidate: string, reference: string): number => {
      const candidateWords = new Set(candidate.toLowerCase().split(/\s+/));
      const referenceWords = new Set(reference.toLowerCase().split(/\s+/));
      const intersection = new Set([...candidateWords].filter(word => referenceWords.has(word)));
      return intersection.size / Math.max(referenceWords.size, 1);
    };

    // Edit distance (Levenshtein distance)
    const calculateEditDistance = (str1: string, str2: string): number => {
      const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
      
      for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
      for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
      
      for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
          const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[j][i] = Math.min(
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1,
            matrix[j - 1][i - 1] + substitutionCost
          );
        }
      }
      
      return matrix[str2.length][str1.length];
    };

    // Semantic similarity approximation (based on common words)
    const calculateSemanticSimilarity = (candidate: string, reference: string): number => {
      const candidateWords = new Set(candidate.toLowerCase().split(/\s+/));
      const referenceWords = new Set(reference.toLowerCase().split(/\s+/));
      const union = new Set([...candidateWords, ...referenceWords]);
      const intersection = new Set([...candidateWords].filter(word => referenceWords.has(word)));
      return intersection.size / union.size;
    };

    return {
      model1: {
        bleuScore: calculateBLEU(translation1, reference),
        rougeScore: calculateROUGE(translation1, reference),
        editDistance: calculateEditDistance(translation1, reference),
        semanticSimilarity: calculateSemanticSimilarity(translation1, reference)
      },
      model2: {
        bleuScore: calculateBLEU(translation2, reference),
        rougeScore: calculateROUGE(translation2, reference),
        editDistance: calculateEditDistance(translation2, reference),
        semanticSimilarity: calculateSemanticSimilarity(translation2, reference)
      }
    };
  };

  // Service health check
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Audio recording functions
  const startRecording = () => {
    if (!currentScript) return;

    // Web Speech API for transcription
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setTranscriptionText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const selectRandomScript = () => {
    const scriptsForDifficulty = testScripts[selectedDifficulty];
    const randomIndex = Math.floor(Math.random() * scriptsForDifficulty.length);
    setCurrentScript(scriptsForDifficulty[randomIndex]);
    setTranscriptionText('');
  };

  // Helper function to safely extract translation data
  const extractTranslationData = (comparison: AnyComparisonResponse, referenceTranslation: string) => {
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
  const getAllModels = (): ModelName[] => ['marian', 'google', 'm2m100', 'madlad'];

  // Helper function to get available reference models (excluding selected models)
  const getAvailableReferenceModels = (): ModelName[] => {
    return getAllModels().filter(model => !selectedModels.includes(model));
  };

  // Update reference model when selected models change
  useEffect(() => {
    const availableReferenceModels = getAvailableReferenceModels();
    if (availableReferenceModels.length > 0 && !availableReferenceModels.includes(referenceModel)) {
      setReferenceModel(availableReferenceModels[0]);
    }
  }, [selectedModels, referenceModel]);

  // Helper function to get reference model
  const getReferenceModel = (): ModelName | undefined => {
    return referenceModel;
  };

  const processAudioTest = async () => {
    if (!currentScript || !transcriptionText) return;

    setIsProcessing(true);
    const startTime = Date.now();

    try {
      // Get reference translation using the selected reference model
      let referenceTranslation = '';
      try {
        const referenceResponse = await EnhancedTranslationService.translateText(transcriptionText, selectedLanguage, referenceModel);
        referenceTranslation = referenceResponse;
      } catch (error) {
        console.warn('Failed to get reference translation:', error);
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
        // Get reference translation using the selected reference model
        let referenceTranslation = '';
        try {
          const referenceResponse = await EnhancedTranslationService.translateText(test, selectedLanguage, referenceModel);
          referenceTranslation = referenceResponse;
        } catch (error) {
          console.warn('Failed to get reference translation:', error);
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

  // Calculate comprehensive statistics - Fixed with proper return type
  const calculateStats = (): {
    total: number;
    textTests: number;
    audioTests: number;
    avgSelectedModelTimes: { [key: string]: number };
    selectedModelSuccessRates: { [key: string]: string };
    accuracyStats?: {
      avgBLEUScores: { [key: string]: string };
      avgROUGEScores: { [key: string]: string };
    };
  } | null => {
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

    const stats = {
      // Overall metrics
      total: testResults.length,
      textTests: testResults.filter(r => r.type === 'text').length,
      audioTests: testResults.filter(r => r.type === 'audio').length,
      
      // Performance metrics for selected models only
      avgSelectedModelTimes: selectedModels.reduce((acc: { [key: string]: number }, model) => {
        const validResults = testResults.filter(r => getTimeByModel(r, model) > 0);
        acc[model] = validResults.length > 0 
          ? validResults.reduce((sum, r) => sum + getTimeByModel(r, model), 0) / validResults.length
          : 0;
        return acc;
      }, {}),

      selectedModelSuccessRates: selectedModels.reduce((acc: { [key: string]: string }, model) => {
        const successfulResults = testResults.filter(r => getResultByModel(r, model) !== '');
        const rate = testResults.length > 0 ? (successfulResults.length / testResults.length) * 100 : 0;
        acc[model] = rate.toFixed(1);
        return acc;
      }, {})
    };

    // Add accuracy stats if we have accuracy metrics
    const resultsWithAccuracy = testResults.filter(r => r.accuracyMetrics);
    if (resultsWithAccuracy.length > 0) {
      const accuracyStats = {
        avgBLEUScores: selectedModels.reduce((acc: { [key: string]: string }, model) => {
          const scores = resultsWithAccuracy
            .map(r => r.accuracyMetrics?.bleuScore?.[model])
            .filter(score => score !== undefined) as number[];
          const avgScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
          acc[model] = avgScore.toFixed(3);
          return acc;
        }, {}),

        avgROUGEScores: selectedModels.reduce((acc: { [key: string]: string }, model) => {
          const scores = resultsWithAccuracy
            .map(r => r.accuracyMetrics?.rougeScore?.[model])
            .filter(score => score !== undefined) as number[];
          const avgScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
          acc[model] = avgScore.toFixed(3);
          return acc;
        }, {})
      };

      return { ...stats, accuracyStats };
    }

    return stats;
  };

  // Calculate performance summary for display
  const getPerformanceSummary = () => {
    if (selectedModels.length !== 2 || testResults.length === 0) {
      return {
        faster: 'N/A',
        mostReliable: 'N/A',
        bestBLEU: 'N/A',
        bestROUGE: 'N/A'
      };
    }

    const stats = calculateStats();
    if (!stats) {
      return {
        faster: 'N/A',
        mostReliable: 'N/A',
        bestBLEU: 'N/A',
        bestROUGE: 'N/A'
      };
    }

    return {
      faster: (() => {
        const times = selectedModels.map(model => stats.avgSelectedModelTimes[model] || 0);
        const faster = selectedModels[times[0] <= times[1] ? 0 : 1];
        return getModelDisplayName(faster);
      })(),
      mostReliable: (() => {
        const rates = selectedModels.map(model => parseFloat(stats.selectedModelSuccessRates[model] || '0'));
        const moreReliable = selectedModels[rates[0] >= rates[1] ? 0 : 1];
        return getModelDisplayName(moreReliable);
      })(),
      bestBLEU: stats.accuracyStats ? (() => {
        const scores = selectedModels.map(model => parseFloat(stats.accuracyStats?.avgBLEUScores?.[model] || '0'));
        const better = selectedModels[scores[0] >= scores[1] ? 0 : 1];
        return getModelDisplayName(better);
      })() : 'N/A',
      bestROUGE: stats.accuracyStats ? (() => {
        const scores = selectedModels.map(model => parseFloat(stats.accuracyStats?.avgROUGEScores?.[model] || '0'));
        const better = selectedModels[scores[0] >= scores[1] ? 0 : 1];
        return getModelDisplayName(better);
      })() : 'N/A'
    };
  };

  const stats = calculateStats();
  const performanceSummary = getPerformanceSummary();
  const currentTestSet = testSets[selectedTestSet as keyof typeof testSets];

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
          <div className="flex flex-wrap gap-2 mb-4">
            {(['marian', 'google', 'm2m100', 'madlad'] as const).map(model => (
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
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-gray-200'
                }`}
              >
                {getModelDisplayName(model as ModelName)}
              </button>
            ))}
          </div>
          
          {/* Reference Model Selection */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <label className="block text-sm font-medium text-yellow-800 mb-2">
              Reference Model for BLEU/ROUGE Scores
            </label>
            <select
              value={referenceModel}
              onChange={(e) => setReferenceModel(e.target.value as ModelName)}
              className="w-full p-2 border border-yellow-300 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
            >
              {getAvailableReferenceModels().map(model => (
                <option key={model} value={model}>
                  {getModelDisplayName(model)} - Use as reference for accuracy metrics
                </option>
              ))}
            </select>
            <p className="text-sm text-yellow-700 mt-2">
              The reference model's translation will be used as the "ground truth" to calculate BLEU and ROUGE scores for the two selected comparison models.
            </p>
          </div>
          
          <p className="text-sm text-gray-500 mt-2">
            Select exactly 2 models to compare. A third model will serve as the reference for accuracy metrics.
          </p>
        </div>

        {/* Language Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name} ({lang.native})
              </option>
            ))}
          </select>
        </div>

        {/* Text Testing Interface */}
        {testingMode === 'text' && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Text Translation Testing</h2>
              <p className="text-gray-600">Automated testing with pre-defined test sets</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Test Set</label>
              <select
                value={selectedTestSet}
                onChange={(e) => setSelectedTestSet(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Object.entries(testSets).map(([key, set]) => (
                  <option key={key} value={key}>{set.name}</option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-1">{currentTestSet.description}</p>
            </div>

            {currentTestSet && (
              <div className="bg-gray-50 rounded-md p-4">
                <h3 className="font-medium text-gray-800 mb-2">Test Samples ({currentTestSet.tests.length} tests):</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {currentTestSet.tests.slice(0, 2).map((test, index) => (
                    <div key={index} className="text-sm text-gray-600 bg-white p-2 rounded border">
                      "{test.length > 100 ? test.substring(0, 100) + '...' : test}"
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
                    disabled={isRunningTests || !isServiceOnline || selectedModels.length !== 2 || getAvailableReferenceModels().length === 0}
                    className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-semibold disabled:bg-gray-300"
                  >
                    {isRunningTests ? 'Running Tests...' : 
                     selectedModels.length !== 2 ? 'Select 2 Models' : 
                     getAvailableReferenceModels().length === 0 ? 'Need Reference Model' :
                     `Run ${currentTestSet.name}`}
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
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="easy">Easy - Basic vocabulary</option>
                  <option value="medium">Medium - Technical terms</option>
                  <option value="hard">Hard - Academic language</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={selectRandomScript}
                  className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md font-medium"
                >
                  Get Random Script
                </button>
              </div>
            </div>

            {currentScript && (
              <div className="bg-purple-50 rounded-md p-4">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-purple-800">Test Script ({currentScript.difficulty})</h3>
                  <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">
                    {currentScript.id}
                  </span>
                </div>
                <div className="bg-white p-3 rounded border">
                  <p className="text-gray-800 italic">"{currentScript.text}"</p>
                  <p className="text-sm text-gray-600 mt-2">Context: {currentScript.context}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Keywords: {currentScript.keywords.join(', ')}
                  </p>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!isServiceOnline || selectedModels.length !== 2 || getAvailableReferenceModels().length === 0}
                    className={`flex-1 px-4 py-3 rounded-md font-semibold flex items-center justify-center ${
                      isRecording
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300'
                    }`}
                  >
                    {isRecording ? '🔴 Stop Recording' : '🎙️ Start Recording'}
                  </button>

                  {transcriptionText && (
                    <button
                      onClick={processAudioTest}
                      disabled={isProcessing || !transcriptionText}
                      className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-300"
                    >
                      {isProcessing ? 'Processing...' : 'Test Translation'}
                    </button>
                  )}
                </div>

                {transcriptionText && (
                  <div className="mt-3 p-3 bg-white rounded border">
                    <h4 className="font-medium text-gray-700 mb-1">Live Transcription:</h4>
                    <p className="text-gray-800 italic">"{transcriptionText}"</p>
                  </div>
                )}
              </div>
            )}

            <div className="text-center">
              <button
                onClick={downloadTestScripts}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm"
              >
                📥 Download All Test Scripts
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Statistics Dashboard */}
      {stats && testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Performance Dashboard</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-blue-700">Total Tests</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.textTests}</div>
              <div className="text-sm text-green-700">Text Tests</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{stats.audioTests}</div>
              <div className="text-sm text-purple-700">Audio Tests</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {selectedModels.length === 2 ? '2' : selectedModels.length}
              </div>
              <div className="text-sm text-orange-700">Models Compared</div>
            </div>
          </div>

          {selectedModels.length === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Performance Metrics */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3">Speed & Reliability</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Faster Model:</span>
                    <span className="font-medium">{performanceSummary.faster}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">More Reliable:</span>
                    <span className="font-medium">{performanceSummary.mostReliable}</span>
                  </div>
                  {selectedModels.map(model => (
                    <div key={model} className="flex justify-between text-sm">
                      <span className="text-gray-500">{getModelDisplayName(model)} avg time:</span>
                      <span>{stats.avgSelectedModelTimes[model]?.toFixed(2) || 'N/A'}s</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Accuracy Metrics */}
              {stats.accuracyStats && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Translation Quality</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Best BLEU Score:</span>
                      <span className="font-medium">{performanceSummary.bestBLEU}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Best ROUGE Score:</span>
                      <span className="font-medium">{performanceSummary.bestROUGE}</span>
                    </div>
                    {selectedModels.map(model => (
                      <div key={model} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{getModelDisplayName(model)} BLEU:</span>
                          <span>{stats.accuracyStats?.avgBLEUScores[model] || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">{getModelDisplayName(model)} ROUGE:</span>
                          <span>{stats.accuracyStats?.avgROUGEScores[model] || 'N/A'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Test Results ({testResults.length})</h3>
            <button
              onClick={() => setShowAccuracyMetrics(!showAccuracyMetrics)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              {showAccuracyMetrics ? 'Hide' : 'Show'} Accuracy Metrics
            </button>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {testResults.map((result) => (
              <div key={result.id} className="border border-gray-200 rounded-lg p-4">
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
                <div className={`grid grid-cols-1 ${selectedModels.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-4`}>
                  {selectedModels.map(model => {
                    const translation = (() => {
                      switch (model) {
                        case 'marian': return result.marianResult;
                        case 'google': return result.googleResult;
                        case 'chatgpt': return result.chatgptResult;
                        case 'm2m100': return result.m2m100Result;
                        case 'madlad': return result.madladResult;
                        default: return '';
                      }
                    })();

                    const time = (() => {
                      switch (model) {
                        case 'marian': return result.marianTime;
                        case 'google': return result.googleTime;
                        case 'chatgpt': return result.chatgptTime;
                        case 'm2m100': return result.m2m100Time;
                        case 'madlad': return result.madladTime;
                        default: return 0;
                      }
                    })();

                    return (
                      <div key={model} className="bg-gray-50 p-3 rounded border">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold text-gray-800">{getModelDisplayName(model)}</h4>
                          <span className="text-xs text-gray-500">{time}ms</span>
                        </div>
                        <div className="text-sm text-gray-700">
                          {translation || 'No translation available'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Accuracy Metrics */}
                {showAccuracyMetrics && result.accuracyMetrics && (
                  <div className="mt-4 bg-yellow-50 p-3 rounded border">
                    <h4 className="font-semibold text-yellow-800 mb-2">📊 Accuracy Metrics</h4>
                    <div className="text-xs text-gray-600 mb-2">
                      Reference ({getModelDisplayName(referenceModel)}): "{result.accuracyMetrics.referenceTranslation}"
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="font-medium text-gray-600">BLEU Score</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {getModelDisplayName(model)}: {
                              result.accuracyMetrics?.bleuScore?.[model]?.toFixed(3) || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-600">ROUGE Score</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {getModelDisplayName(model)}: {
                              result.accuracyMetrics?.rougeScore?.[model]?.toFixed(3) || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-600">Edit Distance</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {getModelDisplayName(model)}: {
                              result.accuracyMetrics?.editDistance?.[model] || 'N/A'
                            }
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="font-medium text-gray-600">Semantic Similarity</div>
                        {selectedModels.map(model => (
                          <div key={model}>
                            {getModelDisplayName(model)}: {
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
              <div className="font-medium text-orange-600 mb-1">Reference Model Selection</div>
              <div>Choose which model's translation to use as the reference for calculating BLEU/ROUGE accuracy scores for the two comparison models.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationTestPage;