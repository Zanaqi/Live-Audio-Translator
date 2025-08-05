import React, { useState, useEffect, useRef } from 'react';
import { EnhancedTranslationService } from 'lib/services/EnhancedTranslationService';
import { computeBLEU, computeSemanticSimilarity } from 'lib/utils/metrics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type ModelName = 'marian' | 'google' | 'm2m100' | 'deepl' | 'madlad';

interface TestResult {
  id: string;
  originalText: string;
  targetLanguage: string;
  marianResult: string;
  googleResult: string;
  m2m100Result?: string;
  deeplResult?: string;
  madladResult?: string;
  marianTime: number;
  googleTime: number;
  m2m100Time?: number;
  deeplTime?: number;
  madladTime?: number;
  timestamp: Date;
  accuracyMetrics?: AccuracyMetrics;
  transcribedText?: string;
  transcriptionAccuracy?: number;
  audioScript?: TestScript;
  totalLatency?: number;
  fullComparison?: any;
  referenceModel?: ModelName;
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
    m2m100?: boolean;
    deepl?: boolean;
    madlad?: boolean;
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
  const [referenceModel, setReferenceModel] = useState<ModelName>('deepl');

  // Audio testing state
  const [isRecording, setIsRecording] = useState(false);
  const [currentScript, setCurrentScript] = useState<TestScript | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Combined comprehensive test dataset with various types and difficulties
  const allTestTexts: TestScript[] = [
    // Simple phrases and greetings
    {
      id: 'greeting_1',
      text: 'Hello, how are you today?',
      context: 'Basic greeting',
      difficulty: 'easy',
      keywords: ['hello', 'how', 'today'],
      expectedChallenges: ['casual conversation']
    },
    {
      id: 'greeting_2',
      text: 'Good morning! I hope you have a wonderful day.',
      context: 'Polite morning greeting',
      difficulty: 'easy',
      keywords: ['morning', 'hope', 'wonderful'],
      expectedChallenges: ['positive sentiment', 'well-wishes']
    },
    {
      id: 'travel_1',
      text: 'Excuse me, could you please tell me how to get to the train station?',
      context: 'Travel directions request',
      difficulty: 'easy',
      keywords: ['excuse', 'directions', 'train station'],
      expectedChallenges: ['polite requests', 'travel vocabulary']
    },
    {
      id: 'restaurant_1',
      text: 'Good evening! Do you have a table for two? We would like to sit by the window if possible.',
      context: 'Restaurant reservation',
      difficulty: 'easy',
      keywords: ['evening', 'table', 'window'],
      expectedChallenges: ['hospitality language', 'preferences']
    },
    {
      id: 'shopping_1',
      text: 'How much does this cost? Do you accept credit cards?',
      context: 'Shopping inquiry',
      difficulty: 'easy',
      keywords: ['cost', 'credit cards', 'payment'],
      expectedChallenges: ['commercial transactions', 'payment methods']
    },

    // Medium complexity - conversational and business
    {
      id: 'museum_medium_1',
      text: 'Welcome to our magnificent art museum, where you can explore thousands of beautiful paintings and sculptures from various historical periods and artistic movements.',
      context: 'Museum tour introduction',
      difficulty: 'medium',
      keywords: ['museum', 'paintings', 'sculptures', 'historical', 'artistic movements'],
      expectedChallenges: ['cultural vocabulary', 'descriptive language', 'art terminology']
    },
    {
      id: 'business_medium_1',
      text: 'Our quarterly performance analysis reveals significant improvements in operational efficiency, driven by strategic initiatives and enhanced customer engagement metrics.',
      context: 'Business performance review',
      difficulty: 'medium',
      keywords: ['quarterly', 'operational efficiency', 'strategic initiatives', 'metrics'],
      expectedChallenges: ['business terminology', 'performance indicators', 'causal relationships']
    },
    {
      id: 'healthcare_medium_1',
      text: 'Please take this medication twice daily with food, and contact your doctor immediately if you experience any unusual side effects or allergic reactions.',
      context: 'Medical prescription instructions',
      difficulty: 'medium',
      keywords: ['medication', 'twice daily', 'side effects', 'allergic reactions'],
      expectedChallenges: ['medical instructions', 'health safety', 'dosage terminology']
    },
    {
      id: 'education_medium_1',
      text: 'The research project requires students to analyze primary sources, conduct interviews, and present their findings using multimedia presentations with statistical data visualization.',
      context: 'Academic assignment description',
      difficulty: 'medium',
      keywords: ['research', 'primary sources', 'interviews', 'multimedia', 'data visualization'],
      expectedChallenges: ['academic vocabulary', 'research methodology', 'presentation requirements']
    },
    {
      id: 'technology_medium_1',
      text: 'The software update includes security patches, performance optimizations, and new features that enhance user experience while maintaining compatibility with older systems.',
      context: 'Technology update announcement',
      difficulty: 'medium',
      keywords: ['software update', 'security patches', 'performance', 'compatibility'],
      expectedChallenges: ['technical terminology', 'system improvements', 'backwards compatibility']
    },

    // Complex technical and specialized content
    {
      id: 'legal_hard_1',
      text: 'The aforementioned contractual provisions constitute a material breach of fiduciary obligations, and the plaintiff hereby demands injunctive relief and compensatory damages pursuant to applicable statutory requirements.',
      context: 'Legal document language',
      difficulty: 'hard',
      keywords: ['contractual provisions', 'fiduciary obligations', 'injunctive relief', 'statutory requirements'],
      expectedChallenges: ['legal jargon', 'formal legal language', 'complex sentence structure', 'Latin legal terms']
    },
    {
      id: 'scientific_hard_1',
      text: 'The implementation of machine learning algorithms utilizing deep neural networks and reinforcement learning paradigms has demonstrated significant optimization capabilities in resource allocation scenarios with multi-dimensional constraint parameters.',
      context: 'Scientific research documentation',
      difficulty: 'hard',
      keywords: ['machine learning', 'neural networks', 'reinforcement learning', 'optimization', 'multi-dimensional'],
      expectedChallenges: ['technical jargon', 'specialized terminology', 'complex concepts', 'algorithmic language']
    },
    {
      id: 'financial_hard_1',
      text: 'The derivative instruments exhibit high volatility correlations with underlying asset price movements, requiring sophisticated risk management strategies and real-time portfolio hedging mechanisms to mitigate potential losses.',
      context: 'Financial risk analysis',
      difficulty: 'hard',
      keywords: ['derivative instruments', 'volatility correlations', 'risk management', 'portfolio hedging'],
      expectedChallenges: ['financial terminology', 'risk concepts', 'investment strategies', 'market analysis']
    },
    {
      id: 'medical_hard_1',
      text: 'The pharmacokinetic properties and bioavailability characteristics of the novel therapeutic compound demonstrate enhanced cellular uptake mechanisms and improved metabolic stability compared to existing pharmaceutical formulations.',
      context: 'Pharmaceutical research',
      difficulty: 'hard',
      keywords: ['pharmacokinetic', 'bioavailability', 'therapeutic compound', 'cellular uptake', 'metabolic stability'],
      expectedChallenges: ['medical terminology', 'pharmacology concepts', 'drug development', 'biochemical processes']
    },

    // Longer paragraphs - various topics
    {
      id: 'history_paragraph_1',
      text: 'The Renaissance period, spanning roughly from the 14th to the 17th century, marked a profound cultural transformation in European society. This era witnessed an unprecedented flourishing of art, literature, science, and philosophy, fundamentally changing how people viewed themselves and their place in the world. Artists like Leonardo da Vinci and Michelangelo created masterpieces that continue to inspire and captivate audiences today, while scientists such as Galileo Galilei revolutionized our understanding of the cosmos through careful observation and mathematical analysis.',
      context: 'Historical education content',
      difficulty: 'medium',
      keywords: ['Renaissance', 'cultural transformation', 'art', 'literature', 'science', 'Leonardo da Vinci', 'Michelangelo', 'Galileo'],
      expectedChallenges: ['historical context', 'cultural movements', 'artistic references', 'temporal expressions', 'cause and effect relationships']
    },
    {
      id: 'environment_paragraph_1',
      text: 'Climate change represents one of the most pressing challenges facing humanity in the 21st century, with far-reaching consequences for ecosystems, agriculture, and human settlements worldwide. Rising global temperatures have led to melting polar ice caps, rising sea levels, and increasingly frequent extreme weather events. Scientists emphasize the urgent need for comprehensive international cooperation to reduce greenhouse gas emissions, transition to renewable energy sources, and implement sustainable development practices that balance economic growth with environmental protection.',
      context: 'Environmental science and policy',
      difficulty: 'hard',
      keywords: ['climate change', 'ecosystems', 'global temperatures', 'greenhouse gas emissions', 'renewable energy', 'sustainable development'],
      expectedChallenges: ['environmental terminology', 'scientific concepts', 'global issues', 'policy implications', 'complex causal relationships']
    },
    {
      id: 'technology_paragraph_1',
      text: 'Artificial intelligence has emerged as a transformative force across numerous industries, revolutionizing everything from healthcare diagnosis and financial trading to autonomous vehicles and smart home technologies. Machine learning algorithms can now process vast amounts of data to identify patterns and make predictions with remarkable accuracy, often surpassing human capabilities in specific domains. However, this rapid advancement also raises important ethical questions about privacy, job displacement, algorithmic bias, and the need for responsible AI development that prioritizes human welfare and social equity.',
      context: 'Technology and society analysis',
      difficulty: 'hard',
      keywords: ['artificial intelligence', 'machine learning', 'algorithms', 'data processing', 'autonomous vehicles', 'ethical questions', 'algorithmic bias'],
      expectedChallenges: ['technical concepts', 'industry applications', 'ethical considerations', 'social implications', 'complex abstract ideas']
    },
    {
      id: 'culture_paragraph_1',
      text: 'Globalization has created an interconnected world where cultural exchange occurs at an unprecedented scale, facilitated by advances in communication technology, international travel, and digital media platforms. This cultural fusion has enriched societies by introducing diverse perspectives, cuisines, artistic expressions, and philosophical traditions. Traditional festivals, music genres, and culinary practices now transcend geographical boundaries, creating vibrant multicultural communities that celebrate diversity while sometimes struggling to preserve unique local identities in an increasingly homogenized global landscape.',
      context: 'Cultural studies and globalization',
      difficulty: 'medium',
      keywords: ['globalization', 'cultural exchange', 'communication technology', 'digital media', 'multicultural communities', 'local identities'],
      expectedChallenges: ['sociological concepts', 'cultural terminology', 'global processes', 'identity concepts', 'complex social dynamics']
    },
    {
      id: 'psychology_paragraph_1',
      text: 'Cognitive behavioral therapy represents a highly effective psychological intervention that addresses the intricate relationships between thoughts, emotions, and behaviors in treating various mental health conditions. This evidence-based approach helps individuals identify negative thought patterns, challenge irrational beliefs, and develop healthier coping mechanisms through structured therapeutic exercises and homework assignments. Research consistently demonstrates that CBT produces lasting improvements in conditions such as depression, anxiety disorders, and post-traumatic stress disorder, often with results comparable to or exceeding those achieved through pharmaceutical interventions alone.',
      context: 'Psychology and mental health',
      difficulty: 'hard',
      keywords: ['cognitive behavioral therapy', 'psychological intervention', 'mental health conditions', 'evidence-based', 'therapeutic exercises', 'depression', 'anxiety disorders'],
      expectedChallenges: ['psychological terminology', 'therapeutic concepts', 'medical conditions', 'research methodology', 'treatment outcomes']
    },
    {
      id: 'economics_paragraph_1',
      text: 'The global economy has undergone significant structural changes in recent decades, driven by technological innovation, shifting demographic patterns, and evolving consumer preferences. Digital transformation has created new business models and market opportunities while disrupting traditional industries, leading to concerns about income inequality and the future of work. Central banks worldwide grapple with balancing economic growth, inflation control, and financial stability in an increasingly complex and interconnected global financial system that responds rapidly to geopolitical events and market sentiment.',
      context: 'Economic analysis and policy',
      difficulty: 'hard',
      keywords: ['global economy', 'technological innovation', 'demographic patterns', 'digital transformation', 'income inequality', 'central banks', 'financial stability'],
      expectedChallenges: ['economic terminology', 'market concepts', 'policy implications', 'global interconnections', 'complex economic relationships']
    },

    // Creative and literary content
    {
      id: 'creative_medium_1',
      text: 'The old lighthouse stood majestically on the rocky cliff, its weathered stone walls bearing witness to countless storms and generations of ships seeking safe harbor. Every evening at sunset, the lighthouse keeper would climb the spiraling staircase to illuminate the beacon, sending its warm golden light across the turbulent waves to guide mariners home.',
      context: 'Creative writing and imagery',
      difficulty: 'medium',
      keywords: ['lighthouse', 'rocky cliff', 'weathered stone', 'storms', 'beacon', 'mariners'],
      expectedChallenges: ['descriptive language', 'imagery', 'metaphorical expressions', 'maritime vocabulary', 'atmospheric descriptions']
    },
    {
      id: 'philosophical_hard_1',
      text: 'The fundamental question of human existence has perplexed philosophers for millennia: What constitutes the essence of consciousness, and how do subjective experiences emerge from objective neural processes? This mind-body problem challenges our understanding of reality, free will, and personal identity, suggesting that the boundary between the physical and mental realms may be far more complex and mysterious than previously imagined.',
      context: 'Philosophical inquiry',
      difficulty: 'hard',
      keywords: ['human existence', 'consciousness', 'subjective experiences', 'neural processes', 'mind-body problem', 'free will', 'personal identity'],
      expectedChallenges: ['philosophical concepts', 'abstract thinking', 'consciousness studies', 'metaphysical ideas', 'complex argumentation']
    }
  ];

  // Enhanced language definitions with new model support
  const languages: Language[] = [
    { 
      code: 'chinese', 
      name: 'Chinese', 
      native: '中文', 
      flag: '🇨🇳', 
      supported: { 
        marian: true, 
        google: true, 
        m2m100: true, 
        deepl: true, 
        madlad: true 
      }
    },
    { 
      code: 'tamil', 
      name: 'Tamil', 
      native: 'தமிழ்', 
      flag: '🇮🇳', 
      supported: { 
        marian: true, 
        google: true, 
        m2m100: true, 
        deepl: false, 
        madlad: true 
      }
    },
    { 
      code: 'french', 
      name: 'French', 
      native: 'Français', 
      flag: '🇫🇷', 
      supported: { 
        marian: true, 
        google: true, 
        m2m100: true, 
        deepl: true, 
        madlad: true 
      }
    },
    { 
      code: 'spanish', 
      name: 'Spanish', 
      native: 'Español', 
      flag: '🇪🇸', 
      supported: { 
        marian: true, 
        google: true, 
        m2m100: true, 
        deepl: true, 
        madlad: true 
      }
    },
    { 
      code: 'german', 
      name: 'German', 
      native: 'Deutsch', 
      flag: '🇩🇪', 
      supported: { 
        marian: true, 
        google: true, 
        m2m100: true, 
        deepl: true, 
        madlad: true 
      }
    },
  ];

  // Initialize component - keep original pattern
  useEffect(() => {
    checkServiceHealth();
  }, []);

  const checkServiceHealth = async () => {
    try {
      const health = await EnhancedTranslationService.checkHealth();
      setIsServiceOnline(health.status === 'healthy');
    } catch (error) {
      setIsServiceOnline(false);
      console.error('Service health check failed:', error);
    }
  };

  const getModelDisplayName = (model: ModelName): string => {
    const displayNames: { [key in ModelName]: string } = {
      'marian': 'MarianMT',
      'google': 'Google Translate',
      'm2m100': 'M2M-100',
      'deepl': 'DeepL',
      'madlad': 'Madlad-400'
    };
    return displayNames[model] || model;
  };

  const getModelTranslation = (testResult: TestResult, model: ModelName): string => {
    switch (model) {
      case 'marian': return testResult.marianResult;
      case 'google': return testResult.googleResult;
      case 'm2m100': return testResult.m2m100Result || '';
      case 'deepl': return testResult.deeplResult || '';
      case 'madlad': return testResult.madladResult || '';
      default: return '';
    }
  };

  const getModelLatency = (testResult: TestResult, model: ModelName): number => {
    switch (model) {
      case 'marian': return testResult.marianTime;
      case 'google': return testResult.googleTime;
      case 'm2m100': return testResult.m2m100Time || 0;
      case 'deepl': return testResult.deeplTime || 0;
      case 'madlad': return testResult.madladTime || 0;
      default: return 0;
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
        id: `${Date.now()}-${Math.random()}`,
        originalText: currentTest,
        targetLanguage: selectedLanguage,
        marianResult: result.results.marian?.translation || 'Not tested',
        googleResult: result.results.google?.translation || 'Not tested',
        m2m100Result: result.results.m2m100?.translation,
        deeplResult: result.results.deepl?.translation,
        madladResult: result.results.madlad?.translation,
        marianTime: result.results.marian?.latency || 0,
        googleTime: result.results.google?.latency || 0,
        m2m100Time: result.results.m2m100?.latency,
        deeplTime: result.results.deepl?.latency,
        madladTime: result.results.madlad?.latency,
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
      console.error('Single test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const runComprehensiveTest = async () => {
    if (selectedModels.length < 2) return;
    
    // Check if we have a valid reference model (not in selected models)
    const availableReference = !selectedModels.includes(referenceModel);
    
    setIsRunningTests(true);
    
    try {
      // Include reference model in the API call if we need it for comparison
      const modelsToTest = availableReference ? 
        [...selectedModels, referenceModel] : 
        selectedModels;

      for (const script of allTestTexts) {
        const result = await EnhancedTranslationService.compareCustomModels(
          script.text,
          selectedLanguage,
          modelsToTest
        );

        const testResult: TestResult = {
          id: `${Date.now()}-${Math.random()}`,
          originalText: script.text,
          targetLanguage: selectedLanguage,
          marianResult: result.results.marian?.translation || 'Not tested',
          googleResult: result.results.google?.translation || 'Not tested',
          m2m100Result: result.results.m2m100?.translation,
          deeplResult: result.results.deepl?.translation,
          madladResult: result.results.madlad?.translation,
          marianTime: result.results.marian?.latency || 0,
          googleTime: result.results.google?.latency || 0,
          m2m100Time: result.results.m2m100?.latency,
          deeplTime: result.results.deepl?.latency,
          madladTime: result.results.madlad?.latency,
          timestamp: new Date(),
          fullComparison: result,
          referenceModel,
          audioScript: script
        };

        // Calculate accuracy metrics only if we have a valid reference
        if (availableReference) {
          testResult.accuracyMetrics = await calculateAccuracyMetrics(testResult);
        }

        setTestResults(prev => [testResult, ...prev]);
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('Comprehensive test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const runParagraphTests = async () => {
    const paragraphTests = allTestTexts.filter(script => script.text.length > 200);
    if (paragraphTests.length === 0 || selectedModels.length < 2) return;
    
    // Check if we have a valid reference model (not in selected models)
    const availableReference = !selectedModels.includes(referenceModel);
    
    setIsRunningTests(true);
    
    try {
      // Include reference model in the API call if we need it for comparison
      const modelsToTest = availableReference ? 
        [...selectedModels, referenceModel] : 
        selectedModels;

      for (const script of paragraphTests) {
        const result = await EnhancedTranslationService.compareCustomModels(
          script.text,
          selectedLanguage,
          modelsToTest
        );

        const testResult: TestResult = {
          id: `${Date.now()}-${Math.random()}`,
          originalText: script.text,
          targetLanguage: selectedLanguage,
          marianResult: result.results.marian?.translation || 'Not tested',
          googleResult: result.results.google?.translation || 'Not tested',
          m2m100Result: result.results.m2m100?.translation,
          deeplResult: result.results.deepl?.translation,
          madladResult: result.results.madlad?.translation,
          marianTime: result.results.marian?.latency || 0,
          googleTime: result.results.google?.latency || 0,
          m2m100Time: result.results.m2m100?.latency,
          deeplTime: result.results.deepl?.latency,
          madladTime: result.results.madlad?.latency,
          timestamp: new Date(),
          fullComparison: result,
          referenceModel,
          audioScript: script
        };

        // Calculate accuracy metrics only if we have a valid reference
        if (availableReference) {
          testResult.accuracyMetrics = await calculateAccuracyMetrics(testResult);
        }

        setTestResults(prev => [testResult, ...prev]);
        
        // Longer delay for paragraph tests (more intensive)
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Paragraph test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const getOverallMetricsData = () => {
    const metricsData = selectedModels.map(model => {
      const modelResults = testResults.filter(r => {
        const translation = getModelTranslation(r, model);
        return translation && translation !== 'Failed' && translation !== 'Not tested' && r.accuracyMetrics;
      });

      if (modelResults.length === 0) {
        return {
          model: getModelDisplayName(model),
          avgBLEU: 0,
          avgSemantic: 0,
          tests: 0
        };
      }

      const avgBLEU = modelResults.reduce((sum, r) => {
        return sum + (r.accuracyMetrics?.bleuScore[model] || 0);
      }, 0) / modelResults.length;

      const avgSemantic = modelResults.reduce((sum, r) => {
        return sum + (r.accuracyMetrics?.semanticSimilarity[model] || 0);
      }, 0) / modelResults.length;

      return {
        model: getModelDisplayName(model),
        avgBLEU: avgBLEU,
        avgSemantic: avgSemantic,
        tests: modelResults.length
      };
    });

    return metricsData.filter(data => data.tests > 0);
  };

  const getModelStats = (model: ModelName) => {
    const modelResults = testResults.filter(r => {
      const translation = getModelTranslation(r, model);
      return translation && translation !== 'Failed' && translation !== 'Not tested';
    });
    const totalTests = testResults.length;
    
    if (modelResults.length === 0) {
      return { avgLatency: null, successRate: 0, totalTests: 0, avgBLEU: null };
    }
    
    const avgLatency = modelResults.reduce((sum, r) => sum + getModelLatency(r, model), 0) / modelResults.length;
    const successRate = (modelResults.length / totalTests) * 100;
    
    // Calculate average BLEU score for models with accuracy metrics
    const resultsWithMetrics = modelResults.filter(r => r.accuracyMetrics?.bleuScore[model] !== undefined);
    const avgBLEU = resultsWithMetrics.length > 0 
      ? resultsWithMetrics.reduce((sum, r) => sum + (r.accuracyMetrics?.bleuScore[model] || 0), 0) / resultsWithMetrics.length
      : null;
    
    return { avgLatency, successRate, totalTests: modelResults.length, avgBLEU };
  };

  const runBatchTests = async (difficulty: 'easy' | 'medium' | 'hard') => {
    const scripts = allTestTexts.filter(script => script.difficulty === difficulty);
    if (!scripts || selectedModels.length < 2) return;
    
    setIsRunningTests(true);
    
    try {
      for (const script of scripts) {
        const result = await EnhancedTranslationService.compareCustomModels(
          script.text,
          selectedLanguage,
          selectedModels
        );

        const testResult: TestResult = {
          id: `${Date.now()}-${Math.random()}`,
          originalText: script.text,
          targetLanguage: selectedLanguage,
          marianResult: result.results.marian?.translation || 'Not tested',
          googleResult: result.results.google?.translation || 'Not tested',
          m2m100Result: result.results.m2m100?.translation,
          deeplResult: result.results.deepl?.translation,
          madladResult: result.results.madlad?.translation,
          marianTime: result.results.marian?.latency || 0,
          googleTime: result.results.google?.latency || 0,
          m2m100Time: result.results.m2m100?.latency,
          deeplTime: result.results.deepl?.latency,
          madladTime: result.results.madlad?.latency,
          timestamp: new Date(),
          fullComparison: result,
          referenceModel,
          audioScript: script
        };

        setTestResults(prev => [testResult, ...prev]);
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Batch test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Audio testing functions (placeholder)
  const startRecording = () => {
    setIsRecording(true);
    // Audio recording implementation would go here
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsProcessing(true);
    // Audio processing implementation would go here
    setTimeout(() => {
      setIsProcessing(false);
      setTranscriptionText("Simulated transcription of the recorded audio...");
    }, 2000);
  };

  const calculateAccuracyMetrics = async (testResult: TestResult): Promise<AccuracyMetrics> => {
    const bleuScore: { [key: string]: number } = {};
    const editDistance: { [key: string]: number } = {};
    const semanticSimilarity: { [key: string]: number } = {};

    // Get reference translation
    const referenceTranslation = getReferenceTranslation(testResult);
    
    // Calculate metrics for each selected model against reference
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

  const getMetricsData = (result: TestResult) => {
    if (!result.accuracyMetrics) return [];
    
    return selectedModels.map(model => ({
      model: getModelDisplayName(model),
      BLEU: result.accuracyMetrics!.bleuScore[model] || 0,
      Similarity: result.accuracyMetrics!.semanticSimilarity[model] || 0
    }));
  };

  const formatLatency = (latency: number): string => {
    return `${latency.toFixed(2)}s`;
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Header - keep original style */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Enhanced Translation Testing Suite</h1>
            <div className="flex items-center space-x-4">
              <div className={`px-3 py-1 rounded-full text-sm ${isServiceOnline === null ? 'bg-yellow-100 text-yellow-800' : isServiceOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {isServiceOnline === null ? 'Checking...' : isServiceOnline ? '🟢 Service Online' : '🔴 Service Offline'}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setTestingMode('text')}
                  className={`px-4 py-2 rounded-lg ${testingMode === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  Text Testing
                </button>
              </div>
            </div>
          </div>

          {/* Model Selection - keep original layout but extend */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Models to Compare</label>
            <div className="flex space-x-4 mb-2">
              {(['marian', 'google', 'm2m100', 'deepl', 'madlad'] as ModelName[]).map(model => (
                <label key={model} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedModels(prev => [...prev, model]);
                      } else {
                        setSelectedModels(prev => prev.filter(m => m !== model));
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{getModelDisplayName(model)}</span>
                </label>
              ))}
            </div>
            
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference Model (for accuracy metrics)</label>
              <select
                value={referenceModel}
                onChange={(e) => setReferenceModel(e.target.value as ModelName)}
                className="w-48 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {(['marian', 'google', 'm2m100', 'deepl', 'madlad'] as ModelName[]).map(model => (
                  <option key={model} value={model}>{getModelDisplayName(model)}</option>
                ))}
              </select>
            </div>

            {selectedModels.includes(referenceModel) && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Reference model is also selected for comparison. Accuracy metrics will not be available.
                </p>
              </div>
            )}
          </div>

          {/* Language Selection - keep original style */}
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
            /* Text Testing Interface - keep original structure */
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

              {/* Comprehensive Test Suite */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-4">Comprehensive Test Suite</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg border">
                    <h4 className="font-medium text-blue-700 mb-2">📝 Complete Test Dataset</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Run all {allTestTexts.length} tests including simple phrases, business content, 
                      technical documentation, and full paragraphs
                    </p>
                    <div className="text-xs text-gray-500 mb-3">
                      • {allTestTexts.filter(t => t.difficulty === 'easy').length} Easy tests (greetings, basic phrases)
                      <br />• {allTestTexts.filter(t => t.difficulty === 'medium').length} Medium tests (business, education, culture)
                      <br />• {allTestTexts.filter(t => t.difficulty === 'hard').length} Hard tests (legal, scientific, technical)
                    </div>
                    <button
                      onClick={() => runComprehensiveTest()}
                      disabled={isRunningTests || selectedModels.length < 2}
                      className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Run All Tests ({allTestTexts.length})
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Audio Testing Interface - keep original structure */
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Audio Translation Testing</h3>
              <div className="text-center">
                <p className="text-gray-600 mb-4">Audio testing functionality coming soon...</p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800">🚧 Audio translation testing is under development</p>
                </div>
              </div>
            </div>
          )}

          {/* Results Section - keep original performance summary structure */}
          {testResults.length > 0 && (
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Test Results ({testResults.length})</h2>
              
              {/* Enhanced Performance Summary with Charts - keep original style */}
              {testResults.length > 1 && (
                <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                  <h3 className="text-xl font-semibold text-blue-900 mb-4">📊 Performance Summary</h3>
                  
                  {/* Performance Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                      <h4 className="text-blue-700 font-semibold text-sm">Total Tests</h4>
                      <p className="text-2xl font-bold text-blue-900">{testResults.length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                      <h4 className="text-green-700 font-semibold text-sm">Models Compared</h4>
                      <p className="text-2xl font-bold text-green-900">{selectedModels.length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                      <h4 className="text-purple-700 font-semibold text-sm">Target Language</h4>
                      <p className="text-lg font-bold text-purple-900">
                        {languages.find(l => l.code === selectedLanguage)?.flag} {languages.find(l => l.code === selectedLanguage)?.name}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                      <h4 className="text-yellow-700 font-semibold text-sm">Reference Model</h4>
                      <p className="text-lg font-bold text-yellow-900">{getModelDisplayName(referenceModel)}</p>
                    </div>
                  </div>

                  {/* Performance Metrics Table with BLEU scores */}
                  <div className="bg-white rounded-lg border shadow-sm overflow-hidden mb-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Model</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Avg Latency</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Success Rate</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Avg BLEU Score</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tests Completed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedModels.map(model => {
                            const stats = getModelStats(model);
                            return (
                              <tr key={model}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{getModelDisplayName(model)}</td>
                                <td className={`px-4 py-3 text-sm ${stats.avgLatency && stats.avgLatency < 2 ? 'text-green-600' : stats.avgLatency && stats.avgLatency < 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {stats.avgLatency ? `${stats.avgLatency.toFixed(2)}s` : 'No data'}
                                </td>
                                <td className={`px-4 py-3 text-sm font-medium ${stats.successRate > 90 ? 'text-green-600' : stats.successRate > 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {stats.successRate.toFixed(1)}%
                                </td>
                                <td className={`px-4 py-3 text-sm font-medium ${stats.avgBLEU ? (stats.avgBLEU > 70 ? 'text-green-600' : stats.avgBLEU > 50 ? 'text-yellow-600' : 'text-red-600') : 'text-gray-400'}`}>
                                  {stats.avgBLEU ? `${stats.avgBLEU.toFixed(1)}` : 'No reference'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stats.totalTests}/{testResults.length}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Overall Accuracy Metrics Chart */}
                  {getOverallMetricsData().length > 0 && !selectedModels.includes(referenceModel) && (
                    <div className="bg-white rounded-lg border shadow-sm p-4 mb-6">
                      <h4 className="text-lg font-semibold mb-4 text-gray-900">📊 Overall Accuracy Metrics vs {getModelDisplayName(referenceModel)}</h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* BLEU Scores Chart */}
                        <div>
                          <h5 className="text-sm font-semibold mb-2 text-gray-700">Average BLEU Scores</h5>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={getOverallMetricsData()}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                                <YAxis domain={[0, 100]} />
                                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}`, 'BLEU Score']} />
                                <Bar dataKey="avgBLEU" fill="#3B82F6" name="Avg BLEU Score" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Semantic Similarity Chart */}
                        <div>
                          <h5 className="text-sm font-semibold mb-2 text-gray-700">Average Semantic Similarity</h5>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={getOverallMetricsData()}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                                <YAxis domain={[0, 100]} />
                                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Similarity']} />
                                <Bar dataKey="avgSemantic" fill="#8B5CF6" name="Avg Semantic Similarity" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                      
                      {/* Metrics Summary */}
                      <div className="mt-4 text-xs text-gray-600">
                        <p>📝 BLEU scores measure translation quality against reference model. Higher scores indicate better quality.</p>
                        <p>🔍 Semantic similarity measures meaning preservation. Scores above 80% indicate good semantic alignment.</p>
                      </div>
                    </div>
                  )}

                  {/* Reference Model Notice */}
                  {selectedModels.includes(referenceModel) && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                      <div className="text-sm text-yellow-800">
                        <p className="font-medium">⚠️ Accuracy metrics unavailable</p>
                        <p>Reference model ({getModelDisplayName(referenceModel)}) is included in the comparison. To see BLEU scores and accuracy metrics, please select a different reference model that is not being tested.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Individual Test Results - restore original with BLEU scores */}
              <div className="space-y-4">
                {testResults.map((result) => (
                  <div key={result.id} className="border border-gray-200 rounded-lg p-6 bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 mb-2">
                          Original Text: "{result.originalText}"
                        </h3>
                        <div className="text-sm text-gray-600">
                          Target: {languages.find(l => l.code === result.targetLanguage)?.name} • 
                          {result.timestamp.toLocaleTimeString()}
                          {result.audioScript && (
                            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              {result.audioScript.difficulty.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid gap-4">
                      {selectedModels.map(model => {
                        const translation = getModelTranslation(result, model);
                        const latency = getModelLatency(result, model);
                        const isSuccess = translation && translation !== 'Failed' && translation !== 'Not tested';
                        
                        return (
                          <div key={model} className="border rounded-lg p-3 bg-gray-50">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-medium text-gray-700">{getModelDisplayName(model)}</h4>
                              <span className="text-sm text-gray-500">{formatLatency(latency)}</span>
                            </div>
                            <p className="text-gray-900 text-sm leading-relaxed">{translation || 'Translation failed'}</p>
                            
                            {result.accuracyMetrics && result.accuracyMetrics.bleuScore[model] !== undefined && (
                              <div className="mt-2 text-xs text-gray-600">
                                <div>BLEU: {result.accuracyMetrics.bleuScore[model].toFixed(1)}</div>
                                <div>Semantic: {result.accuracyMetrics.semanticSimilarity[model]?.toFixed(1) || 'N/A'}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {result.accuracyMetrics && !selectedModels.includes(referenceModel) && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-sm text-green-800">
                          <strong>Reference ({getModelDisplayName(referenceModel)}):</strong> {result.accuracyMetrics.referenceTranslation}
                        </div>
                      </div>
                    )}

                    {/* Remove individual accuracy metrics charts */}
                  </div>
                ))}
              </div>

              {/* Clear Results Button */}
              <div className="mt-6 text-center">
                <button
                  onClick={() => setTestResults([])}
                  className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
                >
                  Clear All Results
                </button>
              </div>
            </div>
          )}

          {testResults.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-lg mb-2">No test results yet</div>
              <div className="text-sm">Run a translation test to see results here</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranslationTestPage;