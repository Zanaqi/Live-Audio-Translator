"use client";

import React, { useState, useEffect, useRef } from 'react';
import { EnhancedTranslationService } from '@/lib/services/EnhancedTranslationService';

interface TestResult {
  text: string;
  language: string;
  marianResult: string;
  googleResult: string;
  marianTime: number;
  googleTime: number;
  timestamp: Date;
  accuracyMetrics?: AccuracyMetrics;
}

interface AccuracyMetrics {
  bleuScore: {
    marian: number;
    google: number;
  };
  rougeScore: {
    marian: number;
    google: number;
  };
  editDistance: {
    marian: number;
    google: number;
  };
  semanticSimilarity: {
    marian: number;
    google: number;
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

const TranslationTestPage: React.FC = () => {
  const [isServiceOnline, setIsServiceOnline] = useState<boolean | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [currentTest, setCurrentTest] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('malay');
  const [selectedTestSet, setSelectedTestSet] = useState<string>('museum_tour');
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [showAccuracyMetrics, setShowAccuracyMetrics] = useState<boolean>(true);

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

  // Test sets with reference translations
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

  const currentLanguage = languages.find(lang => lang.code === selectedLanguage) || languages[0];
  const currentTestSet = testSets[selectedTestSet as keyof typeof testSets];

  // Accuracy calculation functions
  const calculateBLEUScore = (candidate: string, reference: string): number => {
    // Simplified BLEU score calculation (1-gram precision)
    const candidateWords = candidate.toLowerCase().split(/\s+/);
    const referenceWords = reference.toLowerCase().split(/\s+/);
    
    let matches = 0;
    const refWordCount: { [key: string]: number } = {};
    
    // Count reference words
    referenceWords.forEach(word => {
      refWordCount[word] = (refWordCount[word] || 0) + 1;
    });
    
    // Count matches
    candidateWords.forEach(word => {
      if (refWordCount[word] && refWordCount[word] > 0) {
        matches++;
        refWordCount[word]--;
      }
    });
    
    // Precision score
    const precision = candidateWords.length > 0 ? matches / candidateWords.length : 0;
    
    // Brevity penalty (simplified)
    const bp = candidateWords.length >= referenceWords.length ? 1 : 
                Math.exp(1 - referenceWords.length / candidateWords.length);
    
    return Math.round(precision * bp * 100);
  };

  const calculateROUGEScore = (candidate: string, reference: string): number => {
    // ROUGE-1 F1 score (simplified)
    const candidateWords = new Set(candidate.toLowerCase().split(/\s+/));
    const referenceWords = new Set(reference.toLowerCase().split(/\s+/));
    
    const intersection = new Set(Array.from(candidateWords).filter(x => referenceWords.has(x)));
    
    const precision = candidateWords.size > 0 ? intersection.size / candidateWords.size : 0;
    const recall = referenceWords.size > 0 ? intersection.size / referenceWords.size : 0;
    
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    
    return Math.round(f1 * 100);
  };

  const calculateEditDistance = (str1: string, str2: string): number => {
    // Levenshtein distance
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
    // Simple cosine similarity based on word overlap
    const candidateWords = candidate.toLowerCase().split(/\s+/);
    const referenceWords = reference.toLowerCase().split(/\s+/);
    
    const allWords = Array.from(new Set([...candidateWords, ...referenceWords]));
    
    const candidateVector = allWords.map(word => candidateWords.filter(w => w === word).length);
    const referenceVector = allWords.map(word => referenceWords.filter(w => w === word).length);
    
    const dotProduct = candidateVector.reduce((sum, val, i) => sum + val * referenceVector[i], 0);
    const candidateMagnitude = Math.sqrt(candidateVector.reduce((sum, val) => sum + val * val, 0));
    const referenceMagnitude = Math.sqrt(referenceVector.reduce((sum, val) => sum + val * val, 0));
    
    const similarity = (candidateMagnitude * referenceMagnitude) > 0 ? 
                      dotProduct / (candidateMagnitude * referenceMagnitude) : 0;
    
    return Math.round(similarity * 100);
  };

  const calculateAccuracyMetrics = (marianResult: string, googleResult: string, reference: string): AccuracyMetrics => {
    return {
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
      const comparison = await EnhancedTranslationService.compareTranslations(text, language);
      
      const result: TestResult = {
        text,
        language,
        marianResult: comparison.marian?.translation || 'Failed',
        googleResult: comparison.google?.translation || 'Failed',
        marianTime: comparison.marian?.latency || 0,
        googleTime: comparison.google?.latency || 0,
        timestamp: new Date()
      };

      // Calculate accuracy metrics if reference translation is available
      if (reference && comparison.marian?.translation && comparison.google?.translation) {
        result.accuracyMetrics = calculateAccuracyMetrics(
          comparison.marian.translation,
          comparison.google.translation,
          reference
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
      // Small delay between tests
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

  const calculateOverallStats = () => {
    if (testResults.length === 0) return null;
    
    const avgMarianTime = testResults.reduce((sum, r) => sum + r.marianTime, 0) / testResults.length;
    const avgGoogleTime = testResults.reduce((sum, r) => sum + r.googleTime, 0) / testResults.length;
    const marianWins = testResults.filter(r => r.marianTime < r.googleTime && r.marianTime > 0).length;
    const googleWins = testResults.filter(r => r.googleTime < r.marianTime && r.googleTime > 0).length;
    
    // Accuracy averages (only for tests with metrics)
    const testsWithMetrics = testResults.filter(r => r.accuracyMetrics);
    const avgAccuracy = testsWithMetrics.length > 0 ? {
      marianBleu: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore.marian || 0), 0) / testsWithMetrics.length,
      googleBleu: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore.google || 0), 0) / testsWithMetrics.length,
      marianRouge: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.rougeScore.marian || 0), 0) / testsWithMetrics.length,
      googleRouge: testsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.rougeScore.google || 0), 0) / testsWithMetrics.length,
    } : null;
    
    return {
      avgMarianTime: avgMarianTime.toFixed(3),
      avgGoogleTime: avgGoogleTime.toFixed(3),
      marianWins,
      googleWins,
      fasterModel: avgMarianTime < avgGoogleTime ? 'MarianMT' : 'Google Translate',
      avgAccuracy
    };
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
          Translation Model Testing & Accuracy Comparison
        </h1>
        <p className="text-gray-600">
          Compare MarianMT vs Google Translate with BLEU, ROUGE, and other accuracy metrics
        </p>
        <div className="mt-2 inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
          Translation Service Online
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
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
                  {!lang.supported.marian && " - Google Only"}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-gray-500">
              MarianMT: {currentLanguage.supported.marian ? '✅' : '❌'} | 
              Google: {currentLanguage.supported.google ? '✅' : '❌'}
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
                Running translation tests... ({testResults.length}/{currentTestSet.tests.length} completed)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Performance Statistics */}
      {stats && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Performance & Accuracy Statistics</h2>
          
          {/* Speed Performance */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Speed Performance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.avgMarianTime}s</div>
                <div className="text-sm text-gray-600">Avg MarianMT Time</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.avgGoogleTime}s</div>
                <div className="text-sm text-gray-600">Avg Google Time</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.marianWins}</div>
                <div className="text-sm text-gray-600">MarianMT Wins</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{stats.googleWins}</div>
                <div className="text-sm text-gray-600">Google Wins</div>
              </div>
            </div>
          </div>

          {/* Accuracy Performance */}
          {stats.avgAccuracy && showAccuracyMetrics && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Translation Accuracy</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Test Results ({testResults.length} tests)
        </h2>
        
        {testResults.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No test results yet. Run some tests to see the comparison!
          </div>
        ) : (
          <div className="space-y-6 max-h-96 overflow-y-auto">
            {testResults.map((result, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="font-medium text-gray-900 mb-3">
                  <span className="text-blue-600">"{result.text}"</span>
                  {result.accuracyMetrics && (
                    <span className="ml-2 text-sm text-gray-500">
                      → {result.accuracyMetrics.referenceTranslation}
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-blue-800">MarianMT</span>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${
                          result.marianTime < result.googleTime && result.marianTime > 0 ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {result.marianTime > 0 ? `${result.marianTime.toFixed(3)}s` : 'Failed'}
                        </span>
                      </div>
                    </div>
                    <div className="text-gray-800 italic mb-2">"{result.marianResult}"</div>
                    
                    {/* MarianMT Accuracy Metrics */}
                    {result.accuracyMetrics && showAccuracyMetrics && result.marianResult !== 'Failed' && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">BLEU: {result.accuracyMetrics.bleuScore.marian}%</div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">ROUGE: {result.accuracyMetrics.rougeScore.marian}%</div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">Edit Dist: {result.accuracyMetrics.editDistance.marian}</div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">Similarity: {result.accuracyMetrics.semanticSimilarity.marian}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-green-50 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-green-800">Google Translate</span>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${
                          result.googleTime < result.marianTime && result.googleTime > 0 ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {result.googleTime > 0 ? `${result.googleTime.toFixed(3)}s` : 'Failed'}
                        </span>
                      </div>
                    </div>
                    <div className="text-gray-800 italic mb-2">"{result.googleResult}"</div>
                    
                    {/* Google Accuracy Metrics */}
                    {result.accuracyMetrics && showAccuracyMetrics && result.googleResult !== 'Failed' && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">BLEU: {result.accuracyMetrics.bleuScore.google}%</div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">ROUGE: {result.accuracyMetrics.rougeScore.google}%</div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">Edit Dist: {result.accuracyMetrics.editDistance.google}</div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="font-medium">Similarity: {result.accuracyMetrics.semanticSimilarity.google}%</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Accuracy Comparison Summary */}
                {result.accuracyMetrics && showAccuracyMetrics && (
                  <div className="border-t pt-3">
                    <div className="text-sm text-gray-600 mb-2">Accuracy Comparison:</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.bleuScore.marian > result.accuracyMetrics.bleuScore.google 
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.bleuScore.google > result.accuracyMetrics.bleuScore.marian
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">BLEU Winner</div>
                        <div>
                          {result.accuracyMetrics.bleuScore.marian > result.accuracyMetrics.bleuScore.google 
                            ? 'MarianMT' 
                            : result.accuracyMetrics.bleuScore.google > result.accuracyMetrics.bleuScore.marian
                            ? 'Google'
                            : 'Tie'
                          }
                        </div>
                      </div>
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.rougeScore.marian > result.accuracyMetrics.rougeScore.google 
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.rougeScore.google > result.accuracyMetrics.rougeScore.marian
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">ROUGE Winner</div>
                        <div>
                          {result.accuracyMetrics.rougeScore.marian > result.accuracyMetrics.rougeScore.google 
                            ? 'MarianMT' 
                            : result.accuracyMetrics.rougeScore.google > result.accuracyMetrics.rougeScore.marian
                            ? 'Google'
                            : 'Tie'
                          }
                        </div>
                      </div>
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.editDistance.marian < result.accuracyMetrics.editDistance.google 
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.editDistance.google < result.accuracyMetrics.editDistance.marian
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">Lower Edit Distance</div>
                        <div>
                          {result.accuracyMetrics.editDistance.marian < result.accuracyMetrics.editDistance.google 
                            ? 'MarianMT' 
                            : result.accuracyMetrics.editDistance.google < result.accuracyMetrics.editDistance.marian
                            ? 'Google'
                            : 'Tie'
                          }
                        </div>
                      </div>
                      <div className={`p-2 rounded text-center ${
                        result.accuracyMetrics.semanticSimilarity.marian > result.accuracyMetrics.semanticSimilarity.google 
                          ? 'bg-blue-100 text-blue-800' 
                          : result.accuracyMetrics.semanticSimilarity.google > result.accuracyMetrics.semanticSimilarity.marian
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100'
                      }`}>
                        <div className="font-medium">Similarity Winner</div>
                        <div>
                          {result.accuracyMetrics.semanticSimilarity.marian > result.accuracyMetrics.semanticSimilarity.google 
                            ? 'MarianMT' 
                            : result.accuracyMetrics.semanticSimilarity.google > result.accuracyMetrics.semanticSimilarity.marian
                            ? 'Google'
                            : 'Tie'
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                  Tested at {result.timestamp.toLocaleTimeString()} | Language: {result.language}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metrics Information */}
      {showAccuracyMetrics && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2">📊 Accuracy Metrics Explained</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-gray-700">
            <div>
              <div className="font-medium text-blue-600 mb-1">BLEU Score</div>
              <div>Measures n-gram precision between translation and reference. Higher is better (0-100%).</div>
            </div>
            <div>
              <div className="font-medium text-green-600 mb-1">ROUGE Score</div>
              <div>Measures recall and overlap with reference translation. Higher is better (0-100%).</div>
            </div>
            <div>
              <div className="font-medium text-purple-600 mb-1">Edit Distance</div>
              <div>Character-level differences (Levenshtein distance). Lower is better.</div>
            </div>
            <div>
              <div className="font-medium text-orange-600 mb-1">Semantic Similarity</div>
              <div>Word-based cosine similarity with reference. Higher is better (0-100%).</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationTestPage;