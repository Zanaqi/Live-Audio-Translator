import React, { useState, useEffect, useRef } from 'react';
import { EnhancedTranslationService } from '../../lib/services/EnhancedTranslationService';
import { computeBLEU, computeSemanticSimilarity } from '../../lib/utils/metrics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type ModelName = 'marian' | 'google' | 'm2m100';

interface TestResult {
  id: string;
  originalText: string;
  targetLanguage: string;
  marianResult: string;
  googleResult: string;
  m2m100Result?: string;
  marianTime: number;
  googleTime: number;
  m2m100Time?: number;
  timestamp: Date;
  accuracyMetrics?: AccuracyMetrics;
  transcribedText?: string;
  transcriptionAccuracy?: number;
  audioScript?: TestScript;
  totalLatency?: number;
  fullComparison?: any;
  referenceModel?: string;
}

interface AccuracyMetrics {
  bleuScore: {
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
  const [selectedModels, setSelectedModels] = useState<ModelName[]>(['marian', 'google']);
  const [referenceModel, setReferenceModel] = useState<ModelName>('m2m100');

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

  // Test script collections organized by difficulty
  const testScripts: { [key in 'easy' | 'medium' | 'hard']: TestScript[] } = {
    easy: [
      {
        id: 'museum_easy_1',
        text: 'Welcome to the museum.',
        context: 'Museum greeting',
        difficulty: 'easy',
        keywords: ['welcome', 'museum'],
        expectedChallenges: ['formal tone']
      },
      {
        id: 'museum_easy_2',
        text: 'Please follow the guided tour.',
        context: 'Museum instruction',
        difficulty: 'easy',
        keywords: ['follow', 'tour'],
        expectedChallenges: ['imperative form']
      },
      {
        id: 'museum_easy_3',
        text: 'This painting is from the Renaissance period.',
        context: 'Art description',
        difficulty: 'easy',
        keywords: ['painting', 'Renaissance'],
        expectedChallenges: ['historical terms']
      }
    ],
    medium: [
      {
        id: 'museum_medium_1',
        text: 'The exhibition showcases contemporary interpretations of classical themes.',
        context: 'Art analysis',
        difficulty: 'medium',
        keywords: ['exhibition', 'contemporary', 'classical'],
        expectedChallenges: ['art terminology', 'complex sentence structure']
      },
      {
        id: 'airport_medium_1',
        text: 'Due to weather conditions, your departure has been delayed approximately two hours.',
        context: 'Airport announcement',
        difficulty: 'medium',
        keywords: ['weather', 'departure', 'delayed'],
        expectedChallenges: ['time expressions', 'formal announcements']
      }
    ],
    hard: [
      {
        id: 'technical_hard_1',
        text: 'The implementation leverages machine learning algorithms to optimize resource allocation dynamically.',
        context: 'Technical documentation',
        difficulty: 'hard',
        keywords: ['implementation', 'algorithms', 'optimization'],
        expectedChallenges: ['technical jargon', 'complex concepts']
      },
      {
        id: 'legal_hard_1',
        text: 'The aforementioned clause constitutes a material breach of the contractual obligations stipulated herein.',
        context: 'Legal document',
        difficulty: 'hard',
        keywords: ['clause', 'breach', 'contractual'],
        expectedChallenges: ['legal terminology', 'formal language']
      }
    ]
  };

  // Predefined test sets
  const testSets = {
    museum_tour: [
      "Welcome to the museum.",
      "Please follow the guided tour.",
      "This painting is from the Renaissance period.",
      "The exhibition closes at 6 PM.",
      "Photography is not allowed in this gallery."
    ],
    airport_announcement: [
      "Flight 402 is now boarding at gate 12.",
      "Please have your boarding pass ready.",
      "All passengers should be seated.",
      "We apologize for the delay.",
      "Thank you for flying with us."
    ],
    restaurant: [
      "Good evening, table for two?",
      "May I suggest the chef's special?",
      "Would you like to see the wine list?",
      "How would you like your steak cooked?",
      "Thank you for dining with us."
    ],
    business: [
      "The meeting is scheduled for 3 PM.",
      "Please review the quarterly report.",
      "Our sales have increased by 15%.",
      "The project deadline is next Friday.",
      "We need to discuss the budget allocation."
    ]
  };

  // Language definitions
  const languages: Language[] = [
    { code: 'chinese', name: 'Chinese', native: '中文', flag: '🇨🇳', supported: { marian: true, google: true }},
    { code: 'tamil', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳', supported: { marian: true, google: true }},
    { code: 'french', name: 'French', native: 'Français', flag: '🇫🇷', supported: { marian: true, google: true }},
    { code: 'spanish', name: 'Spanish', native: 'Español', flag: '🇪🇸', supported: { marian: true, google: true }},
    { code: 'german', name: 'German', native: 'Deutsch', flag: '🇩🇪', supported: { marian: true, google: true }},
  ];

  // Helper functions
  const getModelDisplayName = (model: ModelName) => {
    const names = { marian: 'MarianMT', google: 'Google Translate', m2m100: 'M2M-100' };
    return names[model];
  };

  const formatLatency = (time: number) => `${time.toFixed(2)}s`;

  const checkServiceHealth = async () => {
    try {
      const response = await fetch('http://localhost:5000/health');
      setIsServiceOnline(response.ok);
    } catch {
      setIsServiceOnline(false);
    }
  };

  useEffect(() => {
    checkServiceHealth();
  }, []);

  const clearResults = () => {
    setTestResults([]);
  };

  const generateRandomScript = (): TestScript => {
    const scripts = testScripts[selectedDifficulty];
    return scripts[Math.floor(Math.random() * scripts.length)];
  };

  // Calculate accuracy metrics for test results
  const calculateAccuracyMetrics = async (testResult: TestResult): Promise<AccuracyMetrics> => {
    const referenceTranslation = getReferenceTranslation(testResult);
    const bleuScore: { [key: string]: number } = {};
    const semanticSimilarity: { [key: string]: number } = {};

    // Only calculate metrics for models that are being compared (not the reference)
    for (const model of selectedModels) {
      const candidateTranslation = getModelTranslation(testResult, model);
      if (candidateTranslation && referenceTranslation) {
        bleuScore[model] = computeBLEU(candidateTranslation, referenceTranslation, selectedLanguage);
        semanticSimilarity[model] = await computeSemanticSimilarity(candidateTranslation, referenceTranslation, selectedLanguage);
      }
    }

    return {
      bleuScore,
      editDistance: {},
      semanticSimilarity,
      referenceTranslation
    };
  };

  const getReferenceTranslation = (testResult: TestResult): string => {
    return getModelTranslation(testResult, referenceModel) || '';
  };

  const getModelTranslation = (testResult: TestResult, model: ModelName): string => {
    switch (model) {
      case 'marian': return testResult.marianResult;
      case 'google': return testResult.googleResult;
      case 'm2m100': return testResult.m2m100Result || '';
      default: return '';
    }
  };

  const runSingleTest = async () => {
    if (!currentTest.trim() || selectedModels.length < 2) return;
    
    // Check if we have a valid reference model (not in selected models)
    const availableReference = !selectedModels.includes(referenceModel);
    
    setIsRunningTests(true);
    
    try {
      // Include reference model in the API call if we need it for comparison
      const modelsToTest = availableReference ? 
        [...selectedModels, referenceModel] : 
        selectedModels;

      const result = await EnhancedTranslationService.compareCustomModels(
        currentTest,
        selectedLanguage,
        modelsToTest
      );

      const testResult: TestResult = {
        id: Date.now().toString(),
        originalText: currentTest,
        targetLanguage: selectedLanguage,
        marianResult: result.results.marian?.translation || 'Failed',
        googleResult: result.results.google?.translation || 'Failed',
        m2m100Result: result.results.m2m100?.translation,
        marianTime: result.results.marian?.latency || 0,
        googleTime: result.results.google?.latency || 0,
        m2m100Time: result.results.m2m100?.latency,
        timestamp: new Date(),
        fullComparison: result,
        referenceModel
      };

      // Calculate accuracy metrics only if we have a valid reference
      if (availableReference) {
        testResult.accuracyMetrics = await calculateAccuracyMetrics(testResult);
      }

      setTestResults(prev => [testResult, ...prev]);
      setCurrentTest('');
      
    } catch (error) {
      console.error('Translation test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const runBatchTest = async () => {
    const currentTestSet = testSets[selectedTestSet as keyof typeof testSets];
    if (!currentTestSet || currentTestSet.length === 0) return;

    setIsRunningTests(true);

    try {
      for (const text of currentTestSet) {
        // Check if we have a valid reference model (not in selected models)
        const availableReference = !selectedModels.includes(referenceModel);
        
        // Include reference model in the API call if we need it for comparison
        const modelsToTest = availableReference ? 
          [...selectedModels, referenceModel] : 
          selectedModels;

        const result = await EnhancedTranslationService.compareCustomModels(
          text,
          selectedLanguage,
          modelsToTest
        );

        const testResult: TestResult = {
          id: Date.now().toString() + Math.random(),
          originalText: text,
          targetLanguage: selectedLanguage,
          marianResult: result.results.marian?.translation || 'Failed',
          googleResult: result.results.google?.translation || 'Failed',
          m2m100Result: result.results.m2m100?.translation,
          marianTime: result.results.marian?.latency || 0,
          googleTime: result.results.google?.latency || 0,
          m2m100Time: result.results.m2m100?.latency,
          timestamp: new Date(),
          fullComparison: result,
          referenceModel
        };

        // Calculate accuracy metrics only if we have a valid reference
        if (availableReference) {
          testResult.accuracyMetrics = await calculateAccuracyMetrics(testResult);
        }

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

  const getOverallSummary = () => {
    if (testResults.length === 0) return null;

    const modelsInUse = [...new Set(testResults.flatMap(result => selectedModels))];
    const summary: { [key: string]: any } = {};

    modelsInUse.forEach(model => {
      const modelResults = testResults.map(result => ({
        latency: model === 'marian' ? result.marianTime : 
                model === 'google' ? result.googleTime : 
                result.m2m100Time || 0,
        bleu: result.accuracyMetrics?.bleuScore[model] || 0,
        similarity: result.accuracyMetrics?.semanticSimilarity[model] || 0
      })).filter(r => r.latency > 0); // Filter out failed translations

      if (modelResults.length > 0) {
        summary[model] = {
          avgLatency: modelResults.reduce((acc, r) => acc + r.latency, 0) / modelResults.length,
          avgBleu: modelResults.reduce((acc, r) => acc + r.bleu, 0) / modelResults.length,
          avgSimilarity: modelResults.reduce((acc, r) => acc + r.similarity, 0) / modelResults.length,
          successRate: (modelResults.length / testResults.length) * 100,
          totalTests: modelResults.length
        };
      }
    });

    return summary;
  };

  const getSummaryChartData = () => {
    const summary = getOverallSummary();
    if (!summary) return [];

    return Object.entries(summary).map(([model, stats]) => ({
      model: getModelDisplayName(model as ModelName),
      'Avg BLEU': parseFloat(stats.avgBleu.toFixed(1)),
      'Avg Similarity': parseFloat(stats.avgSimilarity.toFixed(1)),
      'Avg Latency (s)': parseFloat(stats.avgLatency.toFixed(2)),
      'Success Rate (%)': parseFloat(stats.successRate.toFixed(1))
    }));
  };

  const getLatencyChartData = () => {
    const summary = getOverallSummary();
    if (!summary) return [];

    return Object.entries(summary).map(([model, stats]) => ({
      model: getModelDisplayName(model as ModelName),
      latency: parseFloat(stats.avgLatency.toFixed(2))
    }));
  };

  const getBestPerformingModel = (): { model: string; score: number; stats: any } | null => {
    const summary = getOverallSummary();
    if (!summary) return null;

    let bestModel: { model: string; score: number; stats: any } | null = null;
    let bestScore = -1;

    Object.entries(summary).forEach(([model, stats]) => {
      // Combined score: 50% accuracy (BLEU), 30% speed (inverted latency), 20% reliability
      const accuracyScore = stats.avgBleu;
      const speedScore = Math.max(0, 100 - (stats.avgLatency * 20)); // Lower latency = higher score
      const reliabilityScore = stats.successRate;
      
      const combinedScore = (accuracyScore * 0.5) + (speedScore * 0.3) + (reliabilityScore * 0.2);
      
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestModel = { model: getModelDisplayName(model as ModelName), score: combinedScore, stats };
      }
    });

    return bestModel;
  };

  const getMetricsData = (testResult: TestResult) => {
    if (!testResult.accuracyMetrics) return [];
    
    return selectedModels
      .map(model => ({
        model: getModelDisplayName(model),
        BLEU: testResult.accuracyMetrics!.bleuScore[model]?.toFixed(1) || '0',
        Similarity: testResult.accuracyMetrics!.semanticSimilarity[model]?.toFixed(1) || '0'
      }));
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Service Status */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Translation Testing Platform</h1>
          <div className="flex items-center space-x-2">
            <span className={`inline-block w-3 h-3 rounded-full ${
              isServiceOnline === null ? 'bg-yellow-400' : isServiceOnline ? 'bg-green-400' : 'bg-red-400'
            }`}></span>
            <span className="text-sm text-gray-600">
              {isServiceOnline === null ? 'Checking...' : isServiceOnline ? 'Online' : 'Offline'}
            </span>
            <button 
              onClick={checkServiceHealth}
              className="text-blue-500 hover:text-blue-700 text-sm underline"
            >
              Refresh
            </button>
          </div>
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
            Text Testing
          </button>
          <button
            onClick={() => setTestingMode('audio')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              testingMode === 'audio'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Audio Testing
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Model Selection */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Select Models to Compare</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {(['marian', 'google', 'm2m100'] as const).map(model => (
              <button
                key={model}
                onClick={() => {
                  setSelectedModels(prev => {
                    if (prev.includes(model as ModelName)) {
                      return prev.filter(m => m !== model);
                    } else if (prev.length < 3) {
                      return [...prev, model as ModelName];
                    } else {
                      return prev;
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

        {/* Reference Model Selection */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h2 className="text-xl font-semibold mb-3 text-yellow-800">
            Choose Base Model for Accuracy Metrics
          </h2>
          <p className="text-sm text-yellow-700 mb-3">
            Select which model's translation will be used as the reference for calculating BLEU scores. This model will NOT be included in the comparison.
          </p>
          
          {(['marian', 'google', 'm2m100'] as const)
            .filter(model => !selectedModels.includes(model as ModelName))
            .length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {(['marian', 'google', 'm2m100'] as const)
                  .filter(model => !selectedModels.includes(model as ModelName))
                  .map((modelId) => (
                    <button
                      key={modelId}
                      onClick={() => setReferenceModel(modelId as ModelName)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        referenceModel === modelId
                          ? 'bg-yellow-500 text-white'
                          : 'bg-white text-yellow-700 border border-yellow-300 hover:bg-yellow-100'
                      }`}
                    >
                      {getModelDisplayName(modelId as ModelName)}
                    </button>
                  ))}
              </div>
              <p className="text-xs text-yellow-600 mt-2">
                Reference model: <strong>{getModelDisplayName(referenceModel)}</strong> 
                (will be used as ground truth for accuracy calculation)
              </p>
            </>
          ) : (
            <div className="text-yellow-700 bg-yellow-100 p-3 rounded-md">
              <p className="text-sm">
                No available models for reference. You have selected all available models for comparison.
              </p>
              <p className="text-xs mt-1">
                To enable accuracy metrics, deselect at least one model to use as reference.
              </p>
            </div>
          )}
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
                  {isRunningTests ? 'Running Test...' : 'Run Translation Test'}
                </button>
              </div>
            </div>

            {/* Batch Testing */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Batch Translation Test</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Test Set</label>
                  <select
                    value={selectedTestSet}
                    onChange={(e) => setSelectedTestSet(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="museum_tour">Museum Tour</option>
                    <option value="airport_announcement">Airport Announcements</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="business">Business Meeting</option>
                  </select>
                </div>
                
                {/* Preview of test set */}
                <div className="p-3 bg-white border rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Test Set Preview:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {testSets[selectedTestSet as keyof typeof testSets]?.slice(0, 3).map((text, index) => (
                      <li key={index} className="truncate">• {text}</li>
                    ))}
                    {testSets[selectedTestSet as keyof typeof testSets]?.length > 3 && (
                      <li className="text-gray-500">+ {testSets[selectedTestSet as keyof typeof testSets].length - 3} more...</li>
                    )}
                  </ul>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={runBatchTest}
                    disabled={isRunningTests || selectedModels.length < 2}
                    className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isRunningTests ? 'Running Batch Test...' : `Run Batch Test (${testSets[selectedTestSet as keyof typeof testSets]?.length || 0} items)`}
                  </button>
                  
                  {testResults.length > 0 && (
                    <button
                      onClick={clearResults}
                      className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
                    >
                      Clear Results
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Audio Testing Interface */
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Audio Translation Test</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty Level</label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="easy">🟢 Easy - Simple phrases</option>
                  <option value="medium">🟡 Medium - Complex sentences</option>
                  <option value="hard">🔴 Hard - Technical/specialized content</option>
                </select>
              </div>
              
              <button
                onClick={() => {
                  const script = generateRandomScript();
                  setCurrentScript(script);
                  setTranscriptionText('');
                }}
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600"
              >
                Generate Random Script
              </button>
              
              {currentScript && (
                <div className="p-4 bg-white border rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-2">Script to Read:</h4>
                  <p className="text-gray-900 mb-2">{currentScript.text}</p>
                  <div className="text-sm text-gray-600">
                    <p><strong>Context:</strong> {currentScript.context}</p>
                    <p><strong>Expected Challenges:</strong> {currentScript.expectedChallenges.join(', ')}</p>
                  </div>
                </div>
              )}
              
              <p className="text-sm text-gray-600">
                Audio testing features would include speech recognition and real-time translation here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Overall Summary Section */}
      {testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Overall Performance Summary</h2>
          
          {/* Performance Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-blue-700 font-semibold text-sm">Total Tests</h3>
              <p className="text-2xl font-bold text-blue-900">{testResults.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h3 className="text-green-700 font-semibold text-sm">Models Compared</h3>
              <p className="text-2xl font-bold text-green-900">{selectedModels.length}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <h3 className="text-purple-700 font-semibold text-sm">Target Language</h3>
              <p className="text-lg font-bold text-purple-900">
                {languages.find(l => l.code === selectedLanguage)?.flag} {languages.find(l => l.code === selectedLanguage)?.name}
              </p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <h3 className="text-yellow-700 font-semibold text-sm">Reference Model</h3>
              <p className="text-lg font-bold text-yellow-900">{getModelDisplayName(referenceModel)}</p>
            </div>
          </div>

          {/* Best Performing Model */}
          {(() => {
            const bestModel = getBestPerformingModel();
            return bestModel && (
              <div className="mb-8 p-6 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Best Performing Model</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{bestModel.model}</p>
                    <p className="text-sm text-gray-600">Combined performance score: {bestModel.score.toFixed(1)}/100</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-gray-600">Avg Accuracy</p>
                      <p className="font-bold text-green-600">
                        {bestModel.stats.avgBleu.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-600">Avg Speed</p>
                      <p className="font-bold text-blue-600">{bestModel.stats.avgLatency.toFixed(2)}s</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Model Comparison Table */}
          {getOverallSummary() && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">Model Performance Comparison</h3>
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Model</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Avg BLEU</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Avg Similarity</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Avg Latency</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Success Rate</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Tests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(getOverallSummary()!).map(([model, stats]) => (
                      <tr key={model} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{getModelDisplayName(model as ModelName)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            stats.avgBleu >= 80 ? 'bg-green-100 text-green-800' :
                            stats.avgBleu >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {stats.avgBleu.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            stats.avgSimilarity >= 80 ? 'bg-green-100 text-green-800' :
                            stats.avgSimilarity >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {stats.avgSimilarity.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            stats.avgLatency <= 1.0 ? 'bg-green-100 text-green-800' :
                            stats.avgLatency <= 2.0 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {stats.avgLatency.toFixed(2)}s
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-900 font-medium">{stats.successRate.toFixed(1)}%</span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{stats.totalTests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Accuracy Comparison Chart */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Accuracy Comparison</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getSummaryChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value, name) => [`${value}${String(name).includes('Latency') ? 's' : '%'}`, name]} />
                    <Bar dataKey="Avg BLEU" fill="#3B82F6" name="Avg BLEU" />
                    <Bar dataKey="Avg Similarity" fill="#10B981" name="Avg Similarity" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Latency Comparison Chart */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Speed Comparison</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getLatencyChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value}s`, 'Average Latency']} />
                    <Bar dataKey="latency" fill="#8B5CF6" name="Average Latency" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Insights and Recommendations */}
          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Key Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Speed Leader:</h4>
                <p className="text-gray-600">
                  {(() => {
                    const summary = getOverallSummary();
                    if (!summary) return 'N/A';
                    const sortedBySpeed = Object.entries(summary)
                      .sort(([,a], [,b]) => a.avgLatency - b.avgLatency);
                    const leader = sortedBySpeed[0];
                    if (!leader) return 'N/A';
                    return `${getModelDisplayName(leader[0] as ModelName)} (${leader[1].avgLatency.toFixed(2)}s avg)`;
                  })()}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Accuracy Leader:</h4>
                <p className="text-gray-600">
                  {(() => {
                    const summary = getOverallSummary();
                    if (!summary) return 'N/A';
                    const sortedByAccuracy = Object.entries(summary)
                      .sort(([,a], [,b]) => b.avgBleu - a.avgBleu);
                    const leader = sortedByAccuracy[0];
                    if (!leader) return 'N/A';
                    const avgAccuracy = leader[1].avgBleu.toFixed(1);
                    return `${getModelDisplayName(leader[0] as ModelName)} (${avgAccuracy}% avg)`;
                  })()}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Total Translation Time:</h4>
                <p className="text-gray-600">
                  {(() => {
                    const summary = getOverallSummary();
                    if (!summary) return 'N/A';
                    const totalTime = Object.values(summary)
                      .reduce((acc, stats) => acc + (stats.avgLatency * stats.totalTests), 0);
                    return `${totalTime.toFixed(1)}s`;
                  })()}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Overall Success Rate:</h4>
                <p className="text-gray-600">
                  {(() => {
                    const summary = getOverallSummary();
                    if (!summary) return 'N/A';
                    const avgSuccessRate = Object.values(summary)
                      .reduce((acc, stats, _, arr) => acc + (stats.successRate / arr.length), 0);
                    return `${avgSuccessRate.toFixed(1)}%`;
                  })()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Individual Test Results */}
      {testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Individual Test Results ({testResults.length})</h2>
          
          <div className="space-y-6">
            {testResults.map((result) => (
              <div key={result.id} className="border border-gray-200 rounded-lg p-6">
                <div className="mb-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">Test Result</h3>
                    <span className="text-sm text-gray-500">
                      {result.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {/* Original Text */}
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-700">Original Text:</h4>
                    <p className="text-gray-900">{result.originalText}</p>
                  </div>
                  
                  {/* Translation Results */}
                  <div className="space-y-4">
                    {/* Display comparison models */}
                    {selectedModels.map((modelKey) => {
                      const translation = getModelTranslation(result, modelKey);
                      const latency = modelKey === 'marian' ? result.marianTime : 
                                    modelKey === 'google' ? result.googleTime : 
                                    result.m2m100Time || 0;
                      
                      return (
                        <div key={modelKey} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium text-gray-700">
                              {getModelDisplayName(modelKey)} <span className="text-blue-600">(Comparing)</span>
                            </h4>
                            <span className="text-sm text-gray-500">{formatLatency(latency)}</span>
                          </div>
                          <p className="text-gray-900 mb-3">{translation}</p>
                          
                          {/* Individual Accuracy Metrics */}
                          {result.accuracyMetrics && (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="bg-blue-50 p-2 rounded">
                                <span className="text-blue-700 font-medium">BLEU:</span>
                                <span className="ml-1 font-bold">
                                  {result.accuracyMetrics.bleuScore[modelKey]?.toFixed(1) || '0'}%
                                </span>
                              </div>
                              <div className="bg-purple-50 p-2 rounded">
                                <span className="text-purple-700 font-medium">Similarity:</span>
                                <span className="ml-1 font-bold">
                                  {result.accuracyMetrics.semanticSimilarity[modelKey]?.toFixed(1) || '0'}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Display reference model separately */}
                    {!selectedModels.includes(result.referenceModel as ModelName) && (
                      <div className="p-4 border-2 border-yellow-200 bg-yellow-50 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-700 flex items-center">
                            {getModelDisplayName(result.referenceModel as ModelName)}
                            <span className="ml-2 px-2 py-1 bg-yellow-500 text-white text-xs rounded-full">
                              Reference (Ground Truth)
                            </span>
                          </h4>
                          <span className="text-sm text-gray-500">
                            {formatLatency(
                              result.referenceModel === 'marian' ? result.marianTime : 
                              result.referenceModel === 'google' ? result.googleTime : 
                              result.m2m100Time || 0
                            )}
                          </span>
                        </div>
                        <p className="text-gray-900">{getModelTranslation(result, result.referenceModel as ModelName)}</p>
                        <p className="text-xs text-yellow-700 mt-2">
                          📌 This translation is used as the baseline for calculating accuracy metrics
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Accuracy Metrics Chart */}
                {result.accuracyMetrics && getMetricsData(result).length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-4">
                      📊 Accuracy Metrics Comparison
                      <span className="text-sm font-normal text-gray-600 ml-2">
                        (relative to {getModelDisplayName(referenceModel)})
                      </span>
                    </h3>
                    
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getMetricsData(result)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="model" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip formatter={(value) => [`${value}%`, '']} />
                          <Bar dataKey="BLEU" fill="#3B82F6" name="BLEU Score" />
                          <Bar dataKey="Similarity" fill="#8B5CF6" name="Semantic Similarity" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationTestPage;