"use client";

import React, { useState, useEffect, useRef } from 'react';
import { EnhancedTranslationService } from '@/lib/services/EnhancedTranslationService';

interface TestResult {
  id: string;
  type: 'text' | 'audio';
  text: string;
  language: string;
  marianResult: string;
  googleResult: string;
  chatgptResult?: string;
  marianTime: number;
  googleTime: number;
  chatgptTime?: number;
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
    marian: number;
    google: number;
    chatgpt?: number;
  };
  rougeScore: {
    marian: number;
    google: number;
    chatgpt?: number;
  };
  editDistance: {
    marian: number;
    google: number;
    chatgpt?: number;
  };
  semanticSimilarity: {
    marian: number;
    google: number;
    chatgpt?: number;
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
  const [comparisonMode, setComparisonMode] = useState<'two' | 'three' | 'custom'>('three');
  const [selectedModels, setSelectedModels] = useState<string[]>(['marian', 'google', 'chatgpt']);
  const [modelSetAnalysis, setModelSetAnalysis] = useState<any>(null);
  const [isRunningModelAnalysis, setIsRunningModelAnalysis] = useState(false);

  // Audio testing state
  const [isRecording, setIsRecording] = useState(false);
  const [currentScript, setCurrentScript] = useState<TestScript | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Available models
  const availableModels = [
    { id: 'marian', name: 'MarianMT', color: 'blue' },
    { id: 'google', name: 'Google Translate', color: 'green' },
    { id: 'chatgpt', name: 'ChatGPT', color: 'purple' }
  ];

  // Predefined model sets for analysis
  const modelSets = [
    { name: 'Traditional Models', models: ['marian', 'google'] },
    { name: 'AI-Enhanced', models: ['google', 'chatgpt'] },
    { name: 'All Models', models: ['marian', 'google', 'chatgpt'] },
    { name: 'Open Source vs AI', models: ['marian', 'chatgpt'] }
  ];

  // Comprehensive language support with model availability
  const languages: Language[] = [
    { code: 'malay', name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾', supported: { marian: false, google: true } },
    { code: 'indonesian', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩', supported: { marian: true, google: true } },
    { code: 'french', name: 'French', native: 'Français', flag: '🇫🇷', supported: { marian: true, google: true } },
    { code: 'spanish', name: 'Spanish', native: 'Español', flag: '🇪🇸', supported: { marian: true, google: true } },
    { code: 'german', name: 'German', native: 'Deutsch', flag: '🇩🇪', supported: { marian: true, google: true } },
    { code: 'italian', name: 'Italian', native: 'Italiano', flag: '🇮🇹', supported: { marian: true, google: true } },
    { code: 'japanese', name: 'Japanese', native: '日本語', flag: '🇯🇵', supported: { marian: true, google: true } },
    { code: 'chinese', name: 'Chinese', native: '中文', flag: '🇨🇳', supported: { marian: true, google: true } },
    { code: 'portuguese', name: 'Portuguese', native: 'Português', flag: '🇵🇹', supported: { marian: true, google: true } },
    { code: 'dutch', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱', supported: { marian: true, google: true } },
    { code: 'korean', name: 'Korean', native: '한국어', flag: '🇰🇷', supported: { marian: true, google: true } },
    { code: 'thai', name: 'Thai', native: 'ไทย', flag: '🇹🇭', supported: { marian: true, google: true } },
    { code: 'vietnamese', name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳', supported: { marian: true, google: true } },
  ];

  // Test sets with reference translations for text testing
  const testSets = {
    museum_tour: {
      name: "Museum Tour Context",
      tests: [
        {
          text: "Welcome to the National Museum",
          references: {
            malay: "Selamat datang ke Muzium Negara",
            french: "Bienvenue au Musée National",
            spanish: "Bienvenido al Museo Nacional",
            german: "Willkommen im Nationalmuseum",
            italian: "Benvenuto al Museo Nazionale",
            japanese: "国立博物館へようこそ",
            chinese: "欢迎来到国家博物馆",
            indonesian: "Selamat datang di Museum Nasional"
          }
        },
        {
          text: "This ancient artifact was created in the 15th century",
          references: {
            malay: "Artifak purba ini dicipta pada abad ke-15",
            french: "Cet artefact ancien a été créé au 15ème siècle",
            spanish: "Este artefacto antiguo fue creado en el siglo XV",
            german: "Dieses antike Artefakt wurde im 15. Jahrhundert geschaffen",
            italian: "Questo antico manufatto è stato creato nel XV secolo",
            japanese: "この古代の工芸品は15世紀に作られました",
            chinese: "这件古代文物创作于15世纪",
            indonesian: "Artefak kuno ini dibuat pada abad ke-15"
          }
        },
        {
          text: "The painting represents traditional Malaysian culture",
          references: {
            malay: "Lukisan ini mewakili budaya tradisional Malaysia",
            french: "La peinture représente la culture traditionnelle malaisienne",
            spanish: "La pintura representa la cultura tradicional malaya",
            german: "Das Gemälde stellt die traditionelle malaysische Kultur dar",
            italian: "Il dipinto rappresenta la cultura tradizionale malese",
            japanese: "この絵画は伝統的なマレーシア文化を表しています",
            chinese: "这幅画代表了传统的马来西亚文化",
            indonesian: "Lukisan ini mewakili budaya tradisional Malaysia"
          }
        },
        {
          text: "Please follow me to the next exhibition",
          references: {
            malay: "Sila ikut saya ke pameran seterusnya",
            french: "Veuillez me suivre à la prochaine exposition",
            spanish: "Por favor síganme a la próxima exposición",
            german: "Bitte folgen Sie mir zur nächsten Ausstellung",
            italian: "Vi prego di seguirmi alla prossima mostra",
            japanese: "次の展示会まで私についてきてください",
            chinese: "请跟我到下一个展览",
            indonesian: "Silakan ikuti saya ke pameran berikutnya"
          }
        },
        {
          text: "The museum houses over 5000 historical artifacts",
          references: {
            malay: "Muzium ini menempatkan lebih 5000 artifak sejarah",
            french: "Le musée abrite plus de 5000 artefacts historiques",
            spanish: "El museo alberga más de 5000 artefactos históricos",
            german: "Das Museum beherbergt über 5000 historische Artefakte",
            italian: "Il museo ospita oltre 5000 manufatti storici",
            japanese: "博物館には5000点以上の歴史的工芸品が収蔵されています",
            chinese: "博物馆收藏了5000多件历史文物",
            indonesian: "Museum ini menampung lebih dari 5000 artefak sejarah"
          }
        }
      ]
    },
    guided_tour: {
      name: "Guided Tour Context",
      tests: [
        {
          text: "Follow me as we explore this historic building",
          references: {
            malay: "Ikut saya semasa kita meneroka bangunan bersejarah ini",
            french: "Suivez-moi pendant que nous explorons ce bâtiment historique",
            spanish: "Síganme mientras exploramos este edificio histórico",
            german: "Folgen Sie mir, während wir dieses historische Gebäude erkunden"
          }
        },
        {
          text: "This room was used by the royal family",
          references: {
            malay: "Bilik ini digunakan oleh keluarga diraja",
            french: "Cette pièce était utilisée par la famille royale",
            spanish: "Esta habitación fue utilizada por la familia real",
            german: "Dieser Raum wurde von der königlichen Familie genutzt"
          }
        }
      ]
    },
    general: {
      name: "General Communication",
      tests: [
        {
          text: "Hello, how are you today?",
          references: {
            malay: "Helo, apa khabar hari ini?",
            french: "Bonjour, comment allez-vous aujourd'hui?",
            spanish: "Hola, ¿cómo estás hoy?",
            german: "Hallo, wie geht es Ihnen heute?"
          }
        },
        {
          text: "Thank you for your assistance",
          references: {
            malay: "Terima kasih atas bantuan anda",
            french: "Merci pour votre aide",
            spanish: "Gracias por su ayuda",
            german: "Vielen Dank für Ihre Hilfe"
          }
        }
      ]
    }
  };

  // Audio test scripts organized by difficulty
  const audioTestScripts: { [key: string]: TestScript[] } = {
    easy: [
      {
        id: 'easy_welcome',
        text: 'Welcome to the National Museum of Malaysia.',
        context: 'Museum greeting',
        difficulty: 'easy',
        keywords: ['welcome', 'museum', 'Malaysia'],
        expectedChallenges: ['Clear pronunciation', 'Simple vocabulary']
      },
      {
        id: 'easy_direction',
        text: 'Please follow me to the next room.',
        context: 'Basic direction',
        difficulty: 'easy',
        keywords: ['follow', 'next', 'room'],
        expectedChallenges: ['Common words', 'Short sentence']
      },
      {
        id: 'easy_greeting',
        text: 'Hello, how are you today?',
        context: 'General greeting',
        difficulty: 'easy',
        keywords: ['hello', 'how', 'today'],
        expectedChallenges: ['Basic conversation', 'Question format']
      },
      {
        id: 'easy_thanks',
        text: 'Thank you for visiting our museum.',
        context: 'Polite closing',
        difficulty: 'easy',
        keywords: ['thank', 'visiting', 'museum'],
        expectedChallenges: ['Gratitude expression', 'Formal tone']
      }
    ],
    medium: [
      {
        id: 'medium_artifact',
        text: 'This ancient artifact was discovered in the archaeological excavation of Lembah Bujang and dates back to the 5th century.',
        context: 'Historical description',
        difficulty: 'medium',
        keywords: ['artifact', 'archaeological', 'excavation', 'Lembah Bujang', 'century'],
        expectedChallenges: ['Technical terms', 'Place names', 'Historical dates']
      },
      {
        id: 'medium_culture',
        text: 'The traditional Malay architecture reflects the influence of Islamic, Chinese, and Indian cultural elements.',
        context: 'Cultural explanation',
        difficulty: 'medium',
        keywords: ['traditional', 'architecture', 'Islamic', 'Chinese', 'Indian', 'cultural'],
        expectedChallenges: ['Cultural terms', 'Multiple ethnicities', 'Architectural vocabulary']
      },
      {
        id: 'medium_ceremony',
        text: 'The royal coronation ceremony incorporates ancient rituals that have been preserved for over six hundred years.',
        context: 'Ceremonial description',
        difficulty: 'medium',
        keywords: ['coronation', 'ceremony', 'rituals', 'preserved', 'hundred'],
        expectedChallenges: ['Formal language', 'Historical context', 'Time expressions']
      },
      {
        id: 'medium_textile',
        text: 'The intricate batik patterns represent symbolic meanings deeply rooted in Malaysian folklore and spiritual beliefs.',
        context: 'Art description',
        difficulty: 'medium',
        keywords: ['intricate', 'batik', 'symbolic', 'folklore', 'spiritual'],
        expectedChallenges: ['Art terminology', 'Cultural symbolism', 'Abstract concepts']
      }
    ],
    hard: [
      {
        id: 'hard_archaeological',
        text: 'The stratigraphic analysis reveals that this particular stratum contains ceramic fragments characteristic of the transitional period between the Hindu-Buddhist and Islamic epochs in Southeast Asian civilization.',
        context: 'Academic archaeological description',
        difficulty: 'hard',
        keywords: ['stratigraphic', 'stratum', 'ceramic', 'transitional', 'Hindu-Buddhist', 'Islamic', 'epochs', 'civilization'],
        expectedChallenges: ['Academic vocabulary', 'Technical terminology', 'Complex sentence structure', 'Historical periods']
      },
      {
        id: 'hard_metallurgy',
        text: 'The sophisticated metallurgical techniques employed in crafting this bronze ceremonial vessel demonstrate the advanced technological capabilities of the Srivijaya maritime empire.',
        context: 'Technical historical analysis',
        difficulty: 'hard',
        keywords: ['metallurgical', 'bronze', 'ceremonial', 'vessel', 'technological', 'Srivijaya', 'maritime', 'empire'],
        expectedChallenges: ['Scientific terminology', 'Historical empire names', 'Technical processes']
      },
      {
        id: 'hard_ethnographic',
        text: 'The ethnographic documentation indicates that these ritualistic implements were integral to the shamanic practices of the indigenous Orang Asli communities throughout the pre-colonial peninsula.',
        context: 'Anthropological description',
        difficulty: 'hard',
        keywords: ['ethnographic', 'ritualistic', 'implements', 'shamanic', 'indigenous', 'Orang Asli', 'pre-colonial', 'peninsula'],
        expectedChallenges: ['Anthropological terms', 'Indigenous group names', 'Academic language', 'Historical periods']
      },
      {
        id: 'hard_conservation',
        text: 'The conservation methodology employs non-invasive spectroscopic analysis and controlled atmospheric stabilization to mitigate deterioration of the organic materials.',
        context: 'Museum conservation science',
        difficulty: 'hard',
        keywords: ['conservation', 'methodology', 'non-invasive', 'spectroscopic', 'atmospheric', 'stabilization', 'deterioration', 'organic'],
        expectedChallenges: ['Scientific methodology', 'Technical procedures', 'Conservation terminology']
      }
    ]
  };

  const currentLanguage = languages.find(lang => lang.code === selectedLanguage) || languages[0];
  const currentTestSet = testSets[selectedTestSet as keyof typeof testSets];

  // Audio testing functions
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscriptionText(finalTranscript);
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognitionInstance;
    }
  }, []);

  const selectRandomScript = (difficulty: 'easy' | 'medium' | 'hard') => {
    const scripts = audioTestScripts[difficulty];
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

  const processAudioTest = async () => {
    if (!currentScript || !transcriptionText) return;

    setIsProcessing(true);
    const startTime = Date.now();

    try {
      const transcriptionTime = 0.5;
      
      let comparison;
      if (comparisonMode === 'three') {
        comparison = await EnhancedTranslationService.compareThreeModels(transcriptionText, selectedLanguage);
      } else if (comparisonMode === 'custom') {
        comparison = await EnhancedTranslationService.compareCustomModels(transcriptionText, selectedLanguage, selectedModels as any);
      } else {
        comparison = await EnhancedTranslationService.compareTranslations(transcriptionText, selectedLanguage);
      }

      const transcriptionAccuracy = calculateTranscriptionAccuracy(
        currentScript.text, 
        transcriptionText
      );

      const result: TestResult = {
        id: `audio_${Date.now()}`,
        type: 'audio',
        text: transcriptionText,
        language: selectedLanguage,
        marianResult: comparison.results?.marian?.translation || comparison.marian?.translation || 'Failed',
        googleResult: comparison.results?.google?.translation || comparison.google?.translation || 'Failed',
        chatgptResult: comparison.results?.chatgpt?.translation || 'N/A',
        marianTime: comparison.results?.marian?.latency || comparison.marian?.latency || 0,
        googleTime: comparison.results?.google?.latency || comparison.google?.latency || 0,
        chatgptTime: comparison.results?.chatgpt?.latency || 0,
        timestamp: new Date(),
        transcribedText: transcriptionText,
        transcriptionAccuracy,
        audioScript: currentScript,
        totalLatency: (Date.now() - startTime) / 1000,
        fullComparison: comparison
      };

      setTestResults(prev => [result, ...prev]);
      setCurrentScript(null);
      setTranscriptionText('');
      
    } catch (error) {
      console.error('Error processing audio test:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Accuracy calculation functions
  const calculateTranscriptionAccuracy = (original: string, transcribed: string): number => {
    const originalWords = original.toLowerCase().split(/\s+/);
    const transcribedWords = transcribed.toLowerCase().split(/\s+/);
    
    let matches = 0;
    const maxLength = Math.max(originalWords.length, transcribedWords.length);
    
    for (let i = 0; i < Math.min(originalWords.length, transcribedWords.length); i++) {
      if (originalWords[i] === transcribedWords[i]) {
        matches++;
      }
    }
    
    return maxLength > 0 ? Math.round((matches / maxLength) * 100) : 0;
  };

  const calculateBLEUScore = (candidate: string, reference: string): number => {
    const candidateWords = candidate.toLowerCase().split(/\s+/);
    const referenceWords = reference.toLowerCase().split(/\s+/);
    
    let matches = 0;
    const refWordCount: { [key: string]: number } = {};
    
    referenceWords.forEach(word => {
      refWordCount[word] = (refWordCount[word] || 0) + 1;
    });
    
    candidateWords.forEach(word => {
      if (refWordCount[word] && refWordCount[word] > 0) {
        matches++;
        refWordCount[word]--;
      }
    });
    
    const precision = candidateWords.length > 0 ? matches / candidateWords.length : 0;
    const bp = candidateWords.length >= referenceWords.length ? 1 : 
                Math.exp(1 - referenceWords.length / candidateWords.length);
    
    return Math.round(precision * bp * 100);
  };

  const calculateROUGEScore = (candidate: string, reference: string): number => {
    const candidateWords = new Set(candidate.toLowerCase().split(/\s+/));
    const referenceWords = new Set(reference.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...candidateWords].filter(x => referenceWords.has(x)));
    
    const precision = candidateWords.size > 0 ? intersection.size / candidateWords.size : 0;
    const recall = referenceWords.size > 0 ? intersection.size / referenceWords.size : 0;
    
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    
    return Math.round(f1 * 100);
  };

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

  const calculateSemanticSimilarity = (candidate: string, reference: string): number => {
    const candidateWords = candidate.toLowerCase().split(/\s+/);
    const referenceWords = reference.toLowerCase().split(/\s+/);
    
    const allWords = [...new Set([...candidateWords, ...referenceWords])];
    
    const candidateVector = allWords.map(word => candidateWords.filter(w => w === word).length);
    const referenceVector = allWords.map(word => referenceWords.filter(w => w === word).length);
    
    const dotProduct = candidateVector.reduce((sum, val, i) => sum + val * referenceVector[i], 0);
    const candidateMagnitude = Math.sqrt(candidateVector.reduce((sum, val) => sum + val * val, 0));
    const referenceMagnitude = Math.sqrt(referenceVector.reduce((sum, val) => sum + val * val, 0));
    
    const similarity = (candidateMagnitude * referenceMagnitude) > 0 ? 
                      dotProduct / (candidateMagnitude * referenceMagnitude) : 0;
    
    return Math.round(similarity * 100);
  };

  const calculateAccuracyMetrics = (marianResult: string, googleResult: string, reference: string, chatgptResult?: string): AccuracyMetrics => {
    const metrics: AccuracyMetrics = {
      bleuScore: {
        marian: calculateBLEUScore(marianResult, reference),
        google: calculateBLEUScore(googleResult, reference)
      },
      rougeScore: {
        marian: calculateROUGEScore(marianResult, reference),
        google: calculateROUGEScore(googleResult, reference)
      },
      editDistance: {
        marian: calculateEditDistance(marianResult, reference),
        google: calculateEditDistance(googleResult, reference)
      },
      semanticSimilarity: {
        marian: calculateSemanticSimilarity(marianResult, reference),
        google: calculateSemanticSimilarity(googleResult, reference)
      },
      referenceTranslation: reference
    };

    if (chatgptResult && chatgptResult !== 'N/A' && chatgptResult !== 'Failed') {
      metrics.bleuScore.chatgpt = calculateBLEUScore(chatgptResult, reference);
      metrics.rougeScore.chatgpt = calculateROUGEScore(chatgptResult, reference);
      metrics.editDistance.chatgpt = calculateEditDistance(chatgptResult, reference);
      metrics.semanticSimilarity.chatgpt = calculateSemanticSimilarity(chatgptResult, reference);
    }

    return metrics;
  };

  // Check if translation service is online
  useEffect(() => {
    checkServiceHealth();
  }, []);

  const checkServiceHealth = async () => {
    try {
      await EnhancedTranslationService.healthCheck();
      setIsServiceOnline(true);
    } catch (error) {
      setIsServiceOnline(false);
      console.error('Translation service is offline:', error);
    }
  };

  const runSingleTest = async (text: string, language: string, reference?: string): Promise<TestResult | null> => {
    try {
      let comparison;
      
      if (comparisonMode === 'three') {
        comparison = await EnhancedTranslationService.compareThreeModels(text, language);
      } else if (comparisonMode === 'custom') {
        comparison = await EnhancedTranslationService.compareCustomModels(text, language, selectedModels as any);
      } else {
        comparison = await EnhancedTranslationService.compareTranslations(text, language);
      }
      
      const result: TestResult = {
        id: `text_${Date.now()}_${Math.random()}`,
        type: 'text',
        text,
        language,
        marianResult: comparison.results?.marian?.translation || comparison.marian?.translation || 'Failed',
        googleResult: comparison.results?.google?.translation || comparison.google?.translation || 'Failed',
        chatgptResult: comparison.results?.chatgpt?.translation || 'N/A',
        marianTime: comparison.results?.marian?.latency || comparison.marian?.latency || 0,
        googleTime: comparison.results?.google?.latency || comparison.google?.latency || 0,
        chatgptTime: comparison.results?.chatgpt?.latency || 0,
        timestamp: new Date(),
        fullComparison: comparison
      };

      // Calculate accuracy metrics if reference translation is available
      if (reference && result.marianResult !== 'Failed' && result.googleResult !== 'Failed') {
        result.accuracyMetrics = calculateAccuracyMetrics(
          result.marianResult,
          result.googleResult,
          reference,
          result.chatgptResult
        );
      }

      return result;
    } catch (error) {
      console.error('Test failed:', error);
      return null;
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);
    
    for (const testCase of currentTestSet.tests) {
      const reference = testCase.references?.[selectedLanguage as keyof typeof testCase.references];
      const result = await runSingleTest(testCase.text, selectedLanguage, reference);
      if (result) {
        setTestResults(prev => [...prev, result]);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunningTests(false);
  };

  const runCustomTest = async () => {
    if (!currentTest.trim()) return;
    
    const result = await runSingleTest(currentTest, selectedLanguage);
    if (result) {
      setTestResults(prev => [result, ...prev]);
    }
  };

  const runModelSetAnalysis = async () => {
    setIsRunningModelAnalysis(true);
    setModelSetAnalysis(null);

    try {
      const testTexts = currentTestSet.tests.map(t => t.text);
      
      const analysis = await EnhancedTranslationService.analyzeModelSetPerformance(
        testTexts,
        selectedLanguage,
        modelSets
      );

      setModelSetAnalysis(analysis);
    } catch (error) {
      console.error('Model set analysis failed:', error);
    } finally {
      setIsRunningModelAnalysis(false);
    }
  };

  const calculateOverallStats = () => {
    if (testResults.length === 0) return null;

    const textResults = testResults.filter(r => r.type === 'text');
    const audioResults = testResults.filter(r => r.type === 'audio');

    const avgMarianTime = testResults.reduce((sum, r) => sum + r.marianTime, 0) / testResults.length;
    const avgGoogleTime = testResults.reduce((sum, r) => sum + r.googleTime, 0) / testResults.length;
    const avgChatGPTTime = testResults.reduce((sum, r) => sum + (r.chatgptTime || 0), 0) / testResults.filter(r => r.chatgptTime).length;
    
    const marianWins = testResults.filter(r => r.marianTime < r.googleTime && r.marianTime > 0 && r.marianTime < (r.chatgptTime || Infinity)).length;
    const googleWins = testResults.filter(r => r.googleTime < r.marianTime && r.googleTime > 0 && r.googleTime < (r.chatgptTime || Infinity)).length;
    const chatgptWins = testResults.filter(r => r.chatgptTime && r.chatgptTime < r.marianTime && r.chatgptTime < r.googleTime).length;
    
    // Audio-specific stats
    const avgTranscriptionAccuracy = audioResults.length > 0 
      ? audioResults.reduce((sum, r) => sum + (r.transcriptionAccuracy || 0), 0) / audioResults.length 
      : 0;
    
    const avgTotalLatency = audioResults.length > 0
      ? audioResults.reduce((sum, r) => sum + (r.totalLatency || 0), 0) / audioResults.length
      : 0;

    // Accuracy averages (only for tests with metrics)
    const testsWithMetrics = testResults.filter(r => r.accuracyMetrics);
    const avgAccuracy = testsWithMetrics.length > 0 ? {
      marianBleu: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore.marian || 0), 0) / testsWithMetrics.length,
      googleBleu: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore.google || 0), 0) / testsWithMetrics.length,
      chatgptBleu: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore.chatgpt || 0), 0) / testsWithMetrics.filter(r => r.accuracyMetrics?.bleuScore.chatgpt).length,
      marianRouge: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.rougeScore.marian || 0), 0) / testsWithMetrics.length,
      googleRouge: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.rougeScore.google || 0), 0) / testsWithMetrics.length,
      chatgptRouge: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.rougeScore.chatgpt || 0), 0) / testsWithMetrics.filter(r => r.accuracyMetrics?.rougeScore.chatgpt).length,
    } : null;
    
    return {
      total: testResults.length,
      textTests: textResults.length,
      audioTests: audioResults.length,
      avgMarianTime: avgMarianTime.toFixed(3),
      avgGoogleTime: avgGoogleTime.toFixed(3),
      avgChatGPTTime: avgChatGPTTime ? avgChatGPTTime.toFixed(3) : 'N/A',
      marianWins,
      googleWins,
      chatgptWins,
      fasterModel: avgMarianTime < avgGoogleTime && avgMarianTime < avgChatGPTTime ? 'MarianMT' : 
                   avgGoogleTime < avgChatGPTTime ? 'Google Translate' : 'ChatGPT',
      avgTranscriptionAccuracy: avgTranscriptionAccuracy.toFixed(1),
      avgTotalLatency: avgTotalLatency.toFixed(2),
      avgAccuracy
    };
  };

  const downloadTestScripts = () => {
    const allScripts = Object.values(audioTestScripts).flat();
    const scriptsText = allScripts.map(script => 
      `=== ${script.id.toUpperCase()} (${script.difficulty.toUpperCase()}) ===\n` +
      `Context: ${script.context}\n` +
      `Text: "${script.text}"\n` +
      `Keywords: ${script.keywords.join(', ')}\n` +
      `Expected Challenges: ${script.expectedChallenges.join(', ')}\n\n`
    ).join('');
    
    const blob = new Blob([scriptsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audio_test_scripts.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const stats = calculateOverallStats();

  if (isServiceOnline === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Checking translation service...</p>
        </div>
      </div>
    );
  }

  if (isServiceOnline === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <div className="text-red-600 text-xl mb-4">⚠️ Translation Service Offline</div>
          <p className="text-gray-700 mb-4">
            Please make sure the Python translation server is running on port 5000.
          </p>
          <p className="text-sm text-gray-600">
            Run: <code className="bg-gray-100 px-2 py-1 rounded">python lib/translation_server.py</code>
          </p>
          <button 
            onClick={checkServiceHealth}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🔬 Comprehensive Translation Testing Platform
        </h1>
        <p className="text-gray-600">
          Test both text and audio translation pipelines with accuracy metrics and performance analysis
        </p>
        <div className="mt-2 inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
          Translation Service Online
        </div>
      </div>

      {/* Testing Mode Selector */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-center space-x-4 mb-6">
          <button
            onClick={() => setTestingMode('text')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              testingMode === 'text'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            📝 Text Translation Testing
          </button>
          <button
            onClick={() => setTestingMode('audio')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              testingMode === 'audio'
                ? 'bg-purple-500 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            🎙️ Audio Translation Testing
          </button>
        </div>

        {/* Text Testing Interface */}
        {testingMode === 'text' && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Text Translation Testing</h2>
              <p className="text-gray-600">Test translation models with predefined text sets and custom inputs</p>
            </div>

            {/* Comparison Mode Selector */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-800 mb-3">Model Comparison Configuration</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comparison Mode
                  </label>
                  <select
                    value={comparisonMode}
                    onChange={(e) => setComparisonMode(e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="three">All Three Models</option>
                    <option value="custom">Custom Selection</option>
                    <option value="two">Legacy (MarianMT vs Google)</option>
                  </select>
                </div>

                {comparisonMode === 'custom' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Models to Compare
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableModels.map((model) => (
                        <label key={model.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedModels.includes(model.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedModels([...selectedModels, model.id]);
                              } else {
                                setSelectedModels(selectedModels.filter(m => m !== model.id));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className={`text-sm px-2 py-1 rounded bg-${model.color}-100 text-${model.color}-800`}>
                            {model.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Model Set Analysis */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-700">Model Set Performance Analysis</h4>
                  <button
                    onClick={runModelSetAnalysis}
                    disabled={isRunningModelAnalysis}
                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md disabled:bg-gray-300"
                  >
                    {isRunningModelAnalysis ? 'Analyzing...' : 'Analyze Model Sets'}
                  </button>
                </div>
                <p className="text-sm text-gray-600">
                  Compare different combinations of models to identify the best performing set
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name} ({lang.native})
                      {!lang.supported.marian && " - Limited MarianMT"}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-gray-500">
                  MarianMT: {currentLanguage.supported.marian ? '✅' : '❌'} | 
                  Google: {currentLanguage.supported.google ? '✅' : '❌'} |
                  ChatGPT: ✅
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Set
                </label>
                <select
                  value={selectedTestSet}
                  onChange={(e) => setSelectedTestSet(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(testSets).map(([key, testSet]) => (
                    <option key={key} value={key}>
                      {testSet.name} ({testSet.tests.length} tests)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Options
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showAccuracyMetrics}
                      onChange={(e) => setShowAccuracyMetrics(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm">Show Accuracy Metrics</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Test Text
                </label>
                <input
                  type="text"
                  value={currentTest}
                  onChange={(e) => setCurrentTest(e.target.value)}
                  placeholder="Enter text to translate and test..."
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex flex-col justify-end space-y-2">
                <button
                  onClick={runCustomTest}
                  disabled={!currentTest.trim()}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Test Custom Text
                </button>
                <button
                  onClick={runAllTests}
                  disabled={isRunningTests}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isRunningTests ? 'Running Tests...' : `Run ${currentTestSet.name}`}
                </button>
              </div>
            </div>

            {isRunningTests && (
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                  <span className="text-blue-700">
                    Running text translation tests using {comparisonMode} mode... ({testResults.filter(r => r.type === 'text').length}/{currentTestSet.tests.length} completed)
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Difficulty
                </label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                >
                  <option value="easy">Easy (4 scripts)</option>
                  <option value="medium">Medium (4 scripts)</option>
                  <option value="hard">Hard (4 scripts)</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <button
                  onClick={() => selectRandomScript(selectedDifficulty)}
                  className="w-full px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
                >
                  📋 Get Random Script
                </button>
              </div>
            </div>

            {/* Script Display */}
            {currentScript && (
              <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-purple-900">
                      {currentScript.difficulty.toUpperCase()} - {currentScript.context}
                    </h3>
                    <div className="text-sm text-purple-700 mt-1">
                      Keywords: {currentScript.keywords.join(', ')}
                    </div>
                  </div>
                  <div className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                    ID: {currentScript.id}
                  </div>
                </div>
                
                <div className="bg-white p-4 rounded border-2 border-dashed border-purple-300 mb-3">
                  <div className="text-lg font-medium text-gray-900">
                    📢 READ THIS ALOUD:
                  </div>
                  <div className="text-xl text-gray-800 mt-2 leading-relaxed">
                    "{currentScript.text}"
                  </div>
                </div>

                <div className="text-sm text-purple-700">
                  <strong>Expected Challenges:</strong> {currentScript.expectedChallenges.join(', ')}
                </div>
              </div>
            )}

            {/* Recording Controls */}
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!currentScript || isProcessing}
                className={`px-6 py-3 rounded-full font-semibold ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                } disabled:bg-gray-300 disabled:cursor-not-allowed`}
              >
                {isRecording ? '🛑 Stop Recording' : '🎙️ Start Recording'}
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

      {/* Performance Statistics */}
      {stats && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Comprehensive Testing Statistics</h2>
          
          {/* Overall Statistics */}
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
                <div className="text-lg font-bold text-gray-600">{stats.fasterModel}</div>
                <div className="text-sm text-gray-600">Overall Faster</div>
              </div>
            </div>
          </div>

          {/* Translation Speed Performance */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Translation Speed Performance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.avgMarianTime}s</div>
                <div className="text-sm text-gray-600">Avg MarianMT Time</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.avgGoogleTime}s</div>
                <div className="text-sm text-gray-600">Avg Google Time</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.avgChatGPTTime}</div>
                <div className="text-sm text-gray-600">Avg ChatGPT Time</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-sm text-gray-600">
                  M: {stats.marianWins} | G: {stats.googleWins} | C: {stats.chatgptWins}
                </div>
                <div className="text-sm text-gray-600">Speed Wins</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-600">{stats.fasterModel}</div>
                <div className="text-sm text-gray-600">Fastest Model</div>
              </div>
            </div>
          </div>

          {/* Audio-Specific Performance */}
          {stats.audioTests > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Audio Pipeline Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{stats.avgTranscriptionAccuracy}%</div>
                  <div className="text-sm text-gray-600">Avg Transcription Accuracy</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{stats.avgTotalLatency}s</div>
                  <div className="text-sm text-gray-600">Avg Total Pipeline Time</div>
                </div>
              </div>
            </div>
          )}

          {/* Accuracy Performance */}
          {stats.avgAccuracy && showAccuracyMetrics && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Translation Accuracy</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="text-center p-3 bg-indigo-50 rounded-lg">
                  <div className="text-xl font-bold text-indigo-600">
                    {stats.avgAccuracy.marianBleu.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">MarianMT BLEU</div>
                </div>
                <div className="text-center p-3 bg-cyan-50 rounded-lg">
                  <div className="text-xl font-bold text-cyan-600">
                    {stats.avgAccuracy.googleBleu.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Google BLEU</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-xl font-bold text-purple-600">
                    {stats.avgAccuracy.chatgptBleu ? stats.avgAccuracy.chatgptBleu.toFixed(1) : 'N/A'}%
                  </div>
                  <div className="text-sm text-gray-600">ChatGPT BLEU</div>
                </div>
                <div className="text-center p-3 bg-pink-50 rounded-lg">
                  <div className="text-xl font-bold text-pink-600">
                    {stats.avgAccuracy.marianRouge.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">MarianMT ROUGE</div>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <div className="text-xl font-bold text-emerald-600">
                    {stats.avgAccuracy.googleRouge.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Google ROUGE</div>
                </div>
                <div className="text-center p-3 bg-violet-50 rounded-lg">
                  <div className="text-xl font-bold text-violet-600">
                    {stats.avgAccuracy.chatgptRouge ? stats.avgAccuracy.chatgptRouge.toFixed(1) : 'N/A'}%
                  </div>
                  <div className="text-sm text-gray-600">ChatGPT ROUGE</div>
                </div>
              </div>
            </div>
          )}

          {/* Model Set Analysis Results */}
          {modelSetAnalysis && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Model Set Analysis Results</h3>
              <div className="bg-yellow-50 p-4 rounded-lg mb-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-800">
                    🏆 Best Performing Set: {modelSetAnalysis.comparison.bestPerformingSet}
                  </div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Based on success rate and average latency
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {modelSetAnalysis.sets.map((set: any, index: number) => (
                  <div key={index} className="border rounded-lg p-3 bg-gray-50">
                    <h4 className="font-semibold text-gray-800 mb-2">{set.name}</h4>
                    <div className="text-sm space-y-1">
                      <div>Success Rate: {(set.performance.totalSuccessRate * 100).toFixed(1)}%</div>
                      <div>Models: {set.models.join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test Results */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Test Results ({testResults.length} tests) - 
          <span className="text-blue-600">{testResults.filter(r => r.type === 'text').length} Text</span> | 
          <span className="text-purple-600">{testResults.filter(r => r.type === 'audio').length} Audio</span>
        </h2>
        
        {testResults.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No test results yet. Choose a testing mode and run some tests to see the comparison!
          </div>
        ) : (
          <div className="space-y-6 max-h-96 overflow-y-auto">
            {testResults.map((result, index) => (
              <div key={result.id} className={`border rounded-lg p-4 ${
                result.type === 'text' ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50'
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
                    {result.accuracyMetrics && (
                      <div className="text-xs text-gray-600 mt-1">
                        Reference: {result.accuracyMetrics.referenceTranslation}
                      </div>
                    )}
                  </div>
                )}

                {/* Translation Results */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {/* MarianMT Results */}
                  <div className="bg-white p-3 rounded border">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold text-blue-800">MarianMT</h4>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${
                          result.marianTime < result.googleTime && result.marianTime > 0 && result.marianTime < (result.chatgptTime || Infinity)
                            ? 'text-green-600' 
                            : 'text-gray-600'
                        }`}>
                          {result.marianTime > 0 ? `${result.marianTime.toFixed(3)}s` : 'Failed'}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-800 italic mb-2">"{result.marianResult}"</div>
                    
                    {result.accuracyMetrics && showAccuracyMetrics && result.marianResult !== 'Failed' && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-50 p-1 rounded text-center">
                          <div className="font-medium">BLEU: {result.accuracyMetrics.bleuScore.marian}%</div>
                        </div>
                        <div className="bg-gray-50 p-1 rounded text-center">
                          <div className="font-medium">ROUGE: {result.accuracyMetrics.rougeScore.marian}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Google Translate Results */}
                  <div className="bg-white p-3 rounded border">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold text-green-800">Google Translate</h4>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${
                          result.googleTime < result.marianTime && result.googleTime > 0 && result.googleTime < (result.chatgptTime || Infinity)
                            ? 'text-green-600' 
                            : 'text-gray-600'
                        }`}>
                          {result.googleTime > 0 ? `${result.googleTime.toFixed(3)}s` : 'Failed'}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-800 italic mb-2">"{result.googleResult}"</div>
                    
                    {result.accuracyMetrics && showAccuracyMetrics && result.googleResult !== 'Failed' && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-50 p-1 rounded text-center">
                          <div className="font-medium">BLEU: {result.accuracyMetrics.bleuScore.google}%</div>
                        </div>
                        <div className="bg-gray-50 p-1 rounded text-center">
                          <div className="font-medium">ROUGE: {result.accuracyMetrics.rougeScore.google}%</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ChatGPT Results */}
                  {result.chatgptResult && result.chatgptResult !== 'N/A' && (
                    <div className="bg-white p-3 rounded border">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-purple-800">ChatGPT</h4>
                        <div className="text-right">
                          <span className={`text-sm font-medium ${
                            result.chatgptTime && result.chatgptTime < result.marianTime && result.chatgptTime < result.googleTime
                              ? 'text-green-600' 
                              : 'text-gray-600'
                          }`}>
                            {result.chatgptTime && result.chatgptTime > 0 ? `${result.chatgptTime.toFixed(3)}s` : 'Failed'}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-800 italic mb-2">"{result.chatgptResult}"</div>
                      
                      {result.accuracyMetrics && showAccuracyMetrics && result.chatgptResult !== 'Failed' && result.accuracyMetrics.bleuScore.chatgpt && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-gray-50 p-1 rounded text-center">
                            <div className="font-medium">BLEU: {result.accuracyMetrics.bleuScore.chatgpt}%</div>
                          </div>
                          <div className="bg-gray-50 p-1 rounded text-center">
                            <div className="font-medium">ROUGE: {result.accuracyMetrics.rougeScore.chatgpt}%</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Accuracy Comparison Summary for Text Tests */}
                {result.type === 'text' && result.accuracyMetrics && showAccuracyMetrics && (
                  <div className="border-t pt-3">
                    <div className="text-sm text-gray-600 mb-2">Accuracy Comparison Winners:</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {/* BLEU Winner */}
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.bleuScore.marian > result.accuracyMetrics.bleuScore.google &&
                        (!result.accuracyMetrics.bleuScore.chatgpt || result.accuracyMetrics.bleuScore.marian > result.accuracyMetrics.bleuScore.chatgpt)
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.bleuScore.google > result.accuracyMetrics.bleuScore.marian &&
                            (!result.accuracyMetrics.bleuScore.chatgpt || result.accuracyMetrics.bleuScore.google > result.accuracyMetrics.bleuScore.chatgpt)
                          ? 'bg-green-100 text-green-800'
                          : result.accuracyMetrics.bleuScore.chatgpt && 
                            result.accuracyMetrics.bleuScore.chatgpt > result.accuracyMetrics.bleuScore.marian &&
                            result.accuracyMetrics.bleuScore.chatgpt > result.accuracyMetrics.bleuScore.google
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">BLEU</div>
                        <div>
                          {result.accuracyMetrics.bleuScore.marian > result.accuracyMetrics.bleuScore.google &&
                           (!result.accuracyMetrics.bleuScore.chatgpt || result.accuracyMetrics.bleuScore.marian > result.accuracyMetrics.bleuScore.chatgpt)
                            ? 'MarianMT' 
                            : result.accuracyMetrics.bleuScore.google > result.accuracyMetrics.bleuScore.marian &&
                              (!result.accuracyMetrics.bleuScore.chatgpt || result.accuracyMetrics.bleuScore.google > result.accuracyMetrics.bleuScore.chatgpt)
                            ? 'Google'
                            : result.accuracyMetrics.bleuScore.chatgpt &&
                              result.accuracyMetrics.bleuScore.chatgpt > result.accuracyMetrics.bleuScore.marian &&
                              result.accuracyMetrics.bleuScore.chatgpt > result.accuracyMetrics.bleuScore.google
                            ? 'ChatGPT'
                            : 'Tie'
                          }
                        </div>
                      </div>

                      {/* ROUGE Winner */}
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.rougeScore.marian > result.accuracyMetrics.rougeScore.google &&
                        (!result.accuracyMetrics.rougeScore.chatgpt || result.accuracyMetrics.rougeScore.marian > result.accuracyMetrics.rougeScore.chatgpt)
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.rougeScore.google > result.accuracyMetrics.rougeScore.marian &&
                            (!result.accuracyMetrics.rougeScore.chatgpt || result.accuracyMetrics.rougeScore.google > result.accuracyMetrics.rougeScore.chatgpt)
                          ? 'bg-green-100 text-green-800'
                          : result.accuracyMetrics.rougeScore.chatgpt &&
                            result.accuracyMetrics.rougeScore.chatgpt > result.accuracyMetrics.rougeScore.marian &&
                            result.accuracyMetrics.rougeScore.chatgpt > result.accuracyMetrics.rougeScore.google
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">ROUGE</div>
                        <div>
                          {result.accuracyMetrics.rougeScore.marian > result.accuracyMetrics.rougeScore.google &&
                           (!result.accuracyMetrics.rougeScore.chatgpt || result.accuracyMetrics.rougeScore.marian > result.accuracyMetrics.rougeScore.chatgpt)
                            ? 'MarianMT' 
                            : result.accuracyMetrics.rougeScore.google > result.accuracyMetrics.rougeScore.marian &&
                              (!result.accuracyMetrics.rougeScore.chatgpt || result.accuracyMetrics.rougeScore.google > result.accuracyMetrics.rougeScore.chatgpt)
                            ? 'Google'
                            : result.accuracyMetrics.rougeScore.chatgpt &&
                              result.accuracyMetrics.rougeScore.chatgpt > result.accuracyMetrics.rougeScore.marian &&
                              result.accuracyMetrics.rougeScore.chatgpt > result.accuracyMetrics.rougeScore.google
                            ? 'ChatGPT'
                            : 'Tie'
                          }
                        </div>
                      </div>

                      {/* Edit Distance Winner (lower is better) */}
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.editDistance.marian < result.accuracyMetrics.editDistance.google &&
                        (!result.accuracyMetrics.editDistance.chatgpt || result.accuracyMetrics.editDistance.marian < result.accuracyMetrics.editDistance.chatgpt)
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.editDistance.google < result.accuracyMetrics.editDistance.marian &&
                            (!result.accuracyMetrics.editDistance.chatgpt || result.accuracyMetrics.editDistance.google < result.accuracyMetrics.editDistance.chatgpt)
                          ? 'bg-green-100 text-green-800'
                          : result.accuracyMetrics.editDistance.chatgpt &&
                            result.accuracyMetrics.editDistance.chatgpt < result.accuracyMetrics.editDistance.marian &&
                            result.accuracyMetrics.editDistance.chatgpt < result.accuracyMetrics.editDistance.google
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">Edit Distance</div>
                        <div>
                          {result.accuracyMetrics.editDistance.marian < result.accuracyMetrics.editDistance.google &&
                           (!result.accuracyMetrics.editDistance.chatgpt || result.accuracyMetrics.editDistance.marian < result.accuracyMetrics.editDistance.chatgpt)
                            ? 'MarianMT' 
                            : result.accuracyMetrics.editDistance.google < result.accuracyMetrics.editDistance.marian &&
                              (!result.accuracyMetrics.editDistance.chatgpt || result.accuracyMetrics.editDistance.google < result.accuracyMetrics.editDistance.chatgpt)
                            ? 'Google'
                            : result.accuracyMetrics.editDistance.chatgpt &&
                              result.accuracyMetrics.editDistance.chatgpt < result.accuracyMetrics.editDistance.marian &&
                              result.accuracyMetrics.editDistance.chatgpt < result.accuracyMetrics.editDistance.google
                            ? 'ChatGPT'
                            : 'Tie'
                          }
                        </div>
                      </div>

                      {/* Semantic Similarity Winner */}
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.semanticSimilarity.marian > result.accuracyMetrics.semanticSimilarity.google &&
                        (!result.accuracyMetrics.semanticSimilarity.chatgpt || result.accuracyMetrics.semanticSimilarity.marian > result.accuracyMetrics.semanticSimilarity.chatgpt)
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.semanticSimilarity.google > result.accuracyMetrics.semanticSimilarity.marian &&
                            (!result.accuracyMetrics.semanticSimilarity.chatgpt || result.accuracyMetrics.semanticSimilarity.google > result.accuracyMetrics.semanticSimilarity.chatgpt)
                          ? 'bg-green-100 text-green-800'
                          : result.accuracyMetrics.semanticSimilarity.chatgpt &&
                            result.accuracyMetrics.semanticSimilarity.chatgpt > result.accuracyMetrics.semanticSimilarity.marian &&
                            result.accuracyMetrics.semanticSimilarity.chatgpt > result.accuracyMetrics.semanticSimilarity.google
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">Similarity</div>
                        <div>
                          {result.accuracyMetrics.semanticSimilarity.marian > result.accuracyMetrics.semanticSimilarity.google &&
                           (!result.accuracyMetrics.semanticSimilarity.chatgpt || result.accuracyMetrics.semanticSimilarity.marian > result.accuracyMetrics.semanticSimilarity.chatgpt)
                            ? 'MarianMT' 
                            : result.accuracyMetrics.semanticSimilarity.google > result.accuracyMetrics.semanticSimilarity.marian &&
                              (!result.accuracyMetrics.semanticSimilarity.chatgpt || result.accuracyMetrics.semanticSimilarity.google > result.accuracyMetrics.semanticSimilarity.chatgpt)
                            ? 'Google'
                            : result.accuracyMetrics.semanticSimilarity.chatgpt &&
                              result.accuracyMetrics.semanticSimilarity.chatgpt > result.accuracyMetrics.semanticSimilarity.marian &&
                              result.accuracyMetrics.semanticSimilarity.chatgpt > result.accuracyMetrics.semanticSimilarity.google
                            ? 'ChatGPT'
                            : 'Tie'
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metrics Information */}
      {showAccuracyMetrics && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2">📊 Testing Methodology & Metrics Explained</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-700">
            <div>
              <div className="font-medium text-blue-600 mb-1">📝 Text Testing</div>
              <div>Direct translation comparison with reference translations. Measures pure translation quality without transcription errors.</div>
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