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

  // Enhanced test script collections organized by difficulty
  const testScripts: { [key in 'easy' | 'medium' | 'hard']: TestScript[] } = {
    easy: [
      {
        id: 'museum_easy_1',
        text: 'Welcome to our magnificent art museum, where you can explore thousands of beautiful paintings and sculptures.',
        context: 'Museum greeting with descriptive details',
        difficulty: 'easy',
        keywords: ['welcome', 'museum', 'art', 'paintings', 'sculptures'],
        expectedChallenges: ['formal tone', 'descriptive language']
      },
      {
        id: 'museum_easy_2',
        text: 'Please follow our knowledgeable tour guide as we walk through the different galleries and learn about various artistic periods.',
        context: 'Museum instruction with additional context',
        difficulty: 'easy',
        keywords: ['follow', 'guide', 'galleries', 'artistic periods'],
        expectedChallenges: ['imperative form', 'compound sentences']
      },
      {
        id: 'restaurant_easy_1',
        text: 'Good evening, welcome to our family restaurant where we serve traditional homemade dishes prepared with fresh local ingredients.',
        context: 'Restaurant greeting with establishment details',
        difficulty: 'easy',
        keywords: ['welcome', 'restaurant', 'traditional', 'homemade', 'fresh'],
        expectedChallenges: ['hospitality language', 'food terminology']
      },
      {
        id: 'airport_easy_1',
        text: 'Attention passengers, please have your boarding passes and identification documents ready for inspection at the security checkpoint.',
        context: 'Airport security announcement',
        difficulty: 'easy',
        keywords: ['passengers', 'boarding passes', 'identification', 'security'],
        expectedChallenges: ['official announcements', 'procedural language']
      }
    ],
    medium: [
      {
        id: 'museum_medium_1',
        text: 'This extraordinary exhibition showcases contemporary artistic interpretations of classical themes, demonstrating how modern artists recontextualize traditional subject matter through innovative techniques and materials.',
        context: 'Detailed art exhibition analysis',
        difficulty: 'medium',
        keywords: ['exhibition', 'contemporary', 'interpretations', 'classical', 'recontextualize'],
        expectedChallenges: ['art terminology', 'complex sentence structure', 'abstract concepts']
      },
      {
        id: 'business_medium_1',
        text: 'The quarterly financial analysis reveals significant improvements in operational efficiency and customer satisfaction metrics, indicating that our strategic initiatives are successfully generating measurable business value.',
        context: 'Business performance review',
        difficulty: 'medium',
        keywords: ['quarterly', 'analysis', 'operational efficiency', 'metrics', 'strategic initiatives'],
        expectedChallenges: ['business terminology', 'performance indicators', 'causal relationships']
      },
      {
        id: 'medical_medium_1',
        text: 'The diagnostic imaging results indicate early-stage pathological changes that require immediate medical intervention and continuous monitoring to prevent progression to more severe conditions.',
        context: 'Medical diagnosis explanation',
        difficulty: 'medium',
        keywords: ['diagnostic', 'pathological', 'intervention', 'monitoring', 'progression'],
        expectedChallenges: ['medical terminology', 'technical precision', 'urgency expression']
      },
      {
        id: 'academic_medium_1',
        text: 'The research methodology combines quantitative statistical analysis with qualitative ethnographic observations to provide comprehensive insights into complex socioeconomic phenomena affecting urban communities.',
        context: 'Academic research description',
        difficulty: 'medium',
        keywords: ['methodology', 'quantitative', 'qualitative', 'ethnographic', 'socioeconomic'],
        expectedChallenges: ['academic language', 'research terminology', 'methodological concepts']
      }
    ],
    hard: [
      {
        id: 'legal_hard_1',
        text: 'The aforementioned contractual provisions constitute a material breach of fiduciary obligations, and the plaintiff hereby demands injunctive relief and compensatory damages pursuant to applicable statutory requirements and established jurisprudential precedents.',
        context: 'Complex legal document language',
        difficulty: 'hard',
        keywords: ['contractual provisions', 'fiduciary obligations', 'injunctive relief', 'jurisprudential precedents'],
        expectedChallenges: ['legal jargon', 'formal legal language', 'complex sentence structure', 'Latin terms']
      },
      {
        id: 'scientific_hard_1',
        text: 'The implementation of machine learning algorithms utilizing deep neural networks and reinforcement learning paradigms has demonstrated significant optimization capabilities in resource allocation scenarios with multi-dimensional constraint parameters.',
        context: 'Advanced technical research documentation',
        difficulty: 'hard',
        keywords: ['machine learning', 'neural networks', 'reinforcement learning', 'optimization', 'multi-dimensional'],
        expectedChallenges: ['technical jargon', 'specialized terminology', 'complex concepts', 'compound technical terms']
      },
      {
        id: 'pharmaceutical_hard_1',
        text: 'The pharmacokinetic properties and bioavailability characteristics of the novel therapeutic compound demonstrate enhanced cellular uptake mechanisms and improved metabolic stability compared to existing pharmaceutical formulations.',
        context: 'Advanced pharmaceutical research',
        difficulty: 'hard',
        keywords: ['pharmacokinetic', 'bioavailability', 'therapeutic compound', 'cellular uptake', 'metabolic stability'],
        expectedChallenges: ['pharmaceutical terminology', 'biochemical concepts', 'comparative analysis', 'scientific precision']
      },
      {
        id: 'financial_hard_1',
        text: 'The derivative instruments portfolio demonstrates significant volatility exposure and counterparty risk concentration, necessitating immediate implementation of comprehensive hedging strategies and enhanced regulatory compliance protocols.',
        context: 'Advanced financial risk analysis',
        difficulty: 'hard',
        keywords: ['derivative instruments', 'volatility exposure', 'counterparty risk', 'hedging strategies', 'regulatory compliance'],
        expectedChallenges: ['financial terminology', 'risk concepts', 'regulatory language', 'strategic recommendations']
      }
    ]
  };

  // Enhanced Predefined test sets with longer, more complex sentences
  const testSets = {
    museum_tour: [
      // Original short sentences (kept for backward compatibility)
      "Welcome to the museum.",
      "Please follow the guided tour.",
      "This painting is from the Renaissance period.",
      "The exhibition closes at 6 PM.",
      "Photography is not allowed in this gallery.",
      
      // New longer, more complex sentences
      "Welcome to the Metropolitan Museum of Fine Arts, where you'll discover an extraordinary collection spanning over 5,000 years of human creativity and cultural heritage from every corner of the globe.",
      "Please gather around and follow our experienced guide as we embark on a fascinating journey through different historical periods, artistic movements, and cultural traditions that have shaped our understanding of art and civilization.",
      "This magnificent oil painting, created by Leonardo da Vinci during the height of the Italian Renaissance in the early 16th century, exemplifies the revolutionary techniques of sfumato and chiaroscuro that transformed European artistic expression forever.",
      "The contemporary art exhibition featuring works by internationally acclaimed artists will remain open to the public until 6 PM, after which our curators will begin the careful process of preparing the artworks for their evening conservation treatments.",
      "Photography and video recording are strictly prohibited in this particular gallery due to the extreme sensitivity of these ancient manuscripts and artifacts to light exposure, which could cause irreversible damage to their delicate pigments and materials.",
      "This remarkable bronze sculpture, discovered during archaeological excavations in ancient Rome and dating back approximately 2,000 years, represents the sophisticated metallurgical techniques and artistic sensibilities of classical antiquity.",
      "The museum's extensive collection includes over 50,000 carefully preserved artifacts, ranging from prehistoric tools and ancient Egyptian sarcophagi to contemporary digital art installations and cutting-edge multimedia presentations.",
      "Our audio guide system, available in twelve different languages including Mandarin, Spanish, Arabic, and Hindi, provides detailed historical context and artistic analysis for each major exhibit throughout your self-guided exploration.",
      "The special exhibition on medieval illuminated manuscripts showcases the painstaking craftsmanship of monastic scribes who dedicated their entire lives to creating these breathtakingly beautiful religious texts by hand.",
      "Please note that the museum's climate control system maintains precise temperature and humidity levels to ensure the optimal preservation conditions for our priceless collection of paintings, sculptures, and historical documents."
    ],
    
    airport_announcement: [
      // Original short sentences
      "Flight 402 is now boarding at gate 12.",
      "Please have your boarding pass ready.",
      "All passengers should be seated.",
      "We apologize for the delay.",
      "Thank you for flying with us.",
      
      // New longer, more complex sentences
      "Attention passengers: International flight 402 bound for Charles de Gaulle Airport in Paris is now beginning the boarding process at gate 12, and we kindly request that all passengers with priority boarding status, including first-class, business-class, and frequent flyer elite members, please proceed to the designated boarding area.",
      "For a smooth and efficient boarding experience, please ensure that you have your boarding pass, valid passport or government-issued identification, and any required travel documents readily available for inspection by our gate agents and security personnel.",
      "We kindly ask that all passengers remain seated in the designated waiting area until your boarding group is called, as this helps us maintain an orderly boarding process and ensures that everyone can board the aircraft safely and efficiently.",
      "We sincerely apologize for the unexpected 45-minute delay caused by air traffic control restrictions and adverse weather conditions at our destination airport, and we appreciate your patience and understanding during this inconvenience.",
      "Thank you for choosing Global Airways for your international travel needs, and we hope you have enjoyed the premium amenities and exceptional service provided by our dedicated ground staff and flight crew throughout your journey with us.",
      "Due to enhanced security protocols and international travel requirements, we strongly recommend that passengers arrive at the airport at least three hours before their scheduled departure time to allow sufficient time for check-in, baggage screening, and immigration procedures.",
      "Passengers traveling with infants, unaccompanied minors, or requiring special assistance are invited to begin the boarding process first, followed by passengers seated in premium cabins and those holding elite status with our airline partners.",
      "The aircraft scheduled for today's flight is a state-of-the-art Boeing 787 Dreamliner equipped with advanced entertainment systems, enhanced cabin pressurization, and improved fuel efficiency that reduces our environmental impact while providing superior passenger comfort.",
      "Please be advised that carry-on baggage must comply with international size restrictions, and any liquids must be stored in containers of 100 milliliters or less within a single, transparent, resealable plastic bag for security screening purposes.",
      "Our flight crew will be conducting a comprehensive safety demonstration shortly after takeoff, and we ask that all passengers give their full attention to these important safety instructions for the duration of today's eight-hour transatlantic flight."
    ],
    
    restaurant: [
      // Original short sentences
      "Good evening, table for two?",
      "May I suggest the chef's special?",
      "Would you like to see the wine list?",
      "How would you like your steak cooked?",
      "Thank you for dining with us.",
      
      // New longer, more complex sentences
      "Good evening and welcome to Le Jardin Français, one of the city's most prestigious fine dining establishments; do you have a reservation this evening, or would you prefer a table for two in our romantic garden terrace overlooking the illuminated fountain?",
      "Tonight, our executive chef has prepared an extraordinary seven-course tasting menu featuring locally sourced organic ingredients, including pan-seared duck breast with wild mushroom risotto, herb-crusted lamb with rosemary reduction, and our signature chocolate soufflé with vanilla bean ice cream.",
      "I would be delighted to present our carefully curated wine selection, which includes vintage bottles from renowned French vineyards, award-winning California vintages, and an exclusive collection of rare champagnes that pair perfectly with our seasonal menu offerings.",
      "For your prime ribeye steak, which is dry-aged for 28 days and sourced from grass-fed cattle, how would you prefer it prepared: rare with a cool red center, medium-rare with a warm red center, medium with a pink center, or well-done with no trace of pink throughout?",
      "Thank you so much for choosing our restaurant for your special celebration this evening; we hope that our exceptional cuisine, attentive service, and elegant atmosphere have created a truly memorable dining experience that will bring you back to visit us again soon.",
      "Our sommelier recommends pairing tonight's seafood special, which is fresh Atlantic salmon with lemon-herb butter and roasted Mediterranean vegetables, with a crisp Sauvignon Blanc or perhaps a light Pinot Grigio from our premium wine collection.",
      "Please allow me to explain our tasting menu philosophy: each course is designed to showcase seasonal ingredients at their peak freshness, prepared using traditional French cooking techniques combined with innovative modern presentations that celebrate both flavor and visual artistry.",
      "If you have any dietary restrictions or food allergies, including gluten sensitivity, dairy intolerance, or vegetarian preferences, our culinary team would be happy to modify any dish or create a completely customized meal to accommodate your specific nutritional needs.",
      "The ambiance you're experiencing tonight is enhanced by live jazz music performed by local musicians every Friday evening, creating the perfect atmosphere for romantic dinners, business celebrations, or intimate gatherings with family and friends.",
      "Our dessert menu features handcrafted artisanal sweets prepared daily by our pastry chef, including Belgian chocolate truffles, traditional French macarons, seasonal fruit tarts, and our famous crème brûlée with Madagascar vanilla beans."
    ],
    
    business: [
      // Original short sentences
      "The meeting is scheduled for 3 PM.",
      "Please review the quarterly report.",
      "Our sales have increased by 15%.",
      "The project deadline is next Friday.",
      "We need to discuss the budget allocation.",
      
      // New longer, more complex sentences
      "The quarterly business review meeting with our international stakeholders, including representatives from our European, Asian, and North American divisions, has been scheduled for 3 PM in the executive conference room on the 25th floor.",
      "I would like to request that all department heads thoroughly review the comprehensive quarterly financial report, which includes detailed analysis of revenue streams, operational expenses, market penetration metrics, and competitive positioning before tomorrow's board meeting.",
      "Our sales performance has exceeded expectations with a remarkable 15% increase in revenue compared to the same period last year, driven primarily by successful product launches in emerging markets and improved customer retention strategies.",
      "Please be advised that the deadline for the multinational expansion project, which involves establishing new distribution centers in three different countries and implementing standardized operational procedures across all international locations, is next Friday at 5 PM.",
      "During tomorrow's executive session, we need to conduct a comprehensive discussion regarding the strategic allocation of our annual budget across various departments, including research and development, marketing initiatives, human resources expansion, and technology infrastructure upgrades.",
      "The implementation of our new customer relationship management system, which will integrate seamlessly with our existing enterprise resource planning software, is expected to improve operational efficiency by approximately 30% while reducing administrative overhead costs.",
      "Our human resources department has developed a comprehensive employee development program that includes professional training workshops, leadership mentorship opportunities, and tuition reimbursement for advanced degrees to support career growth and improve retention rates.",
      "The market research data indicates a significant shift in consumer preferences toward sustainable and environmentally friendly products, which presents both challenges and opportunities for our product development and marketing strategies moving forward.",
      "We have successfully negotiated a strategic partnership agreement with three major suppliers that will reduce our procurement costs by 12% while ensuring consistent quality standards and reliable delivery schedules for our manufacturing operations.",
      "The digital transformation initiative, which encompasses cloud migration, artificial intelligence integration, and automated workflow systems, is projected to generate substantial cost savings and operational improvements over the next three fiscal years."
    ],
    
    // NEW TEST SETS with complex, domain-specific content
    medical_consultation: [
      "The patient's comprehensive medical history reveals a complex combination of cardiovascular risk factors, including hypertension, diabetes mellitus type 2, and a family history of coronary artery disease.",
      "Following the detailed examination and laboratory analysis, we recommend initiating a multidisciplinary treatment approach that combines pharmaceutical intervention, dietary modifications, and regular physical therapy sessions.",
      "The radiological imaging studies, including magnetic resonance imaging and computed tomography scans, indicate early-stage pathological changes that require immediate medical attention and continuous monitoring.",
      "Based on the patient's symptoms, clinical presentation, and diagnostic test results, we are recommending a specialized referral to our cardiovascular surgery department for further evaluation and potential intervention.",
      "The pharmaceutical treatment plan includes a carefully calibrated combination of medications designed to control blood pressure, regulate glucose levels, and reduce inflammatory markers while minimizing adverse side effects.",
      "Patient education regarding lifestyle modifications, including smoking cessation, alcohol limitation, stress management techniques, and adherence to prescribed medication regimens, is crucial for successful treatment outcomes.",
      "The follow-up appointment schedule includes monthly monitoring visits, quarterly laboratory assessments, and annual comprehensive health evaluations to track treatment progress and adjust therapeutic interventions as necessary.",
      "Emergency contact protocols have been established, and patients should immediately seek medical attention if they experience chest pain, shortness of breath, severe headaches, or any other concerning symptoms."
    ],
    
    academic_lecture: [
      "Today's lecture will examine the complex interrelationships between socioeconomic factors, educational accessibility, and long-term career outcomes in post-industrial societies across different cultural and geographical contexts.",
      "The theoretical framework we'll be exploring combines elements of sociological analysis, economic modeling, and psychological research to provide a comprehensive understanding of human behavior in organizational environments.",
      "Recent empirical studies conducted by international research institutions have demonstrated significant correlations between early childhood educational interventions and subsequent academic achievement levels throughout primary and secondary education.",
      "The methodological approach employed in this longitudinal study involved collecting quantitative and qualitative data from over 10,000 participants across multiple demographic categories over a fifteen-year period.",
      "Critical analysis of the literature reveals substantial gaps in our current understanding of how technological innovations influence traditional pedagogical practices and student learning outcomes in higher education institutions.",
      "The implications of these research findings extend beyond academic discourse and have practical applications for educational policy development, curriculum design, and institutional resource allocation strategies.",
      "Interdisciplinary collaboration between departments of psychology, sociology, economics, and education has yielded innovative approaches to addressing persistent challenges in educational equity and accessibility.",
      "The peer review process for this research involved evaluation by leading experts in the field, ensuring the methodological rigor and theoretical validity of the conclusions presented in this comprehensive academic study."
    ],
    
    legal_proceedings: [
      "The honorable court is hereby respectfully requested to consider the substantial evidence presented by the plaintiff's legal counsel, which clearly demonstrates the defendant's material breach of contractual obligations and resulting financial damages.",
      "Based on the comprehensive legal precedents established in similar cases within this jurisdiction, the plaintiff maintains that the defendant's actions constitute a clear violation of both statutory requirements and common law principles.",
      "The evidentiary documentation submitted to the court includes witness testimonies, expert analyses, financial records, and communication logs that collectively support the plaintiff's claims regarding negligence and breach of fiduciary duty.",
      "The defendant's legal representation has filed a motion for summary judgment, arguing that the plaintiff has failed to establish the necessary elements of their cause of action and that no genuine issue of material fact exists.",
      "The proposed settlement agreement includes provisions for monetary compensation, injunctive relief, and ongoing compliance monitoring to ensure that similar violations do not occur in the future.",
      "Court-appointed mediators have facilitated negotiations between the parties in an attempt to reach a mutually acceptable resolution that avoids the time, expense, and uncertainty associated with extended litigation proceedings.",
      "The judge has scheduled a pretrial conference to address procedural matters, establish discovery deadlines, and determine the admissibility of certain evidence that may be presented during the anticipated trial proceedings.",
      "Legal experts anticipate that the final judicial decision in this case will establish important precedents that will influence future litigation involving similar contractual disputes and corporate governance issues."
    ],
    
    scientific_research: [
      "The preliminary experimental results indicate that the novel biomolecular compound demonstrates significant therapeutic potential for treating neurodegenerative diseases through its ability to cross the blood-brain barrier and target specific protein aggregations.",
      "Advanced spectroscopic analysis using state-of-the-art instrumentation has revealed previously unknown structural characteristics of the synthesized nanoparticles that may explain their enhanced catalytic efficiency in industrial applications.",
      "The peer-reviewed publication process requires comprehensive documentation of experimental methodologies, statistical analyses, and reproducibility protocols to ensure that the research findings can be validated by independent scientific laboratories.",
      "Collaborative research initiatives involving international teams of scientists from leading universities and research institutions have accelerated the development of innovative solutions to global challenges in renewable energy and environmental sustainability.",
      "The grant proposal submitted to the National Science Foundation outlines a five-year research program that will investigate the fundamental mechanisms underlying climate change impacts on marine ecosystems and biodiversity conservation.",
      "Laboratory safety protocols require strict adherence to established procedures for handling hazardous materials, operating complex equipment, and disposing of chemical waste in accordance with environmental regulations and institutional guidelines.",
      "The statistical significance of the experimental data was validated using multiple analytical approaches, including regression analysis, correlation studies, and Monte Carlo simulations to ensure the reliability of the research conclusions.",
      "Technology transfer opportunities arising from this research include potential patent applications, licensing agreements with pharmaceutical companies, and the development of commercial products that benefit society while generating economic value."
    ],
    
    technical_support: [
      "We have identified that the network connectivity issues you are experiencing are related to a configuration conflict between your firewall settings and the recently updated software security protocols implemented across our enterprise infrastructure.",
      "The troubleshooting process will involve systematically examining various system components, including hardware drivers, software configurations, network settings, and security parameters to isolate and resolve the underlying technical problem.",
      "Our technical support team recommends implementing a comprehensive backup strategy that includes automated daily incremental backups, weekly full system backups, and monthly offsite storage procedures to protect against data loss scenarios.",
      "The software update package includes critical security patches, performance optimizations, compatibility improvements, and new features that enhance user experience while maintaining system stability and data integrity.",
      "Remote diagnostic tools allow our technical specialists to access your system securely and perform real-time analysis of performance metrics, error logs, and system configurations to identify and resolve technical issues efficiently.",
      "The migration process from the legacy system to the new cloud-based platform requires careful planning, data validation, user training, and phased implementation to minimize operational disruptions and ensure business continuity.",
      "System requirements for the upgraded software include a minimum of 16 GB of RAM, 500 GB of available storage space, and a high-speed internet connection to support the enhanced functionality and improved performance characteristics.",
      "Our customer support portal provides comprehensive documentation, video tutorials, frequently asked questions, and community forums where users can find solutions to common problems and share best practices with other users."
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

  // Helper functions for charts and performance analysis
  const getModelStats = (model: ModelName) => {
    const modelResults = testResults.filter(r => getModelTranslation(r, model) !== 'Failed');
    const totalTests = testResults.length;
    
    const avgLatency = modelResults.reduce((sum, r) => {
      const time = model === 'marian' ? r.marianTime : model === 'google' ? r.googleTime : r.m2m100Time || 0;
      return sum + time;
    }, 0) / (modelResults.length || 1);
    
    const avgBleu = modelResults.reduce((sum, r) => {
      return sum + (r.accuracyMetrics?.bleuScore[model] || 0);
    }, 0) / (modelResults.length || 1);
    
    const avgSimilarity = modelResults.reduce((sum, r) => {
      return sum + (r.accuracyMetrics?.semanticSimilarity[model] || 0);
    }, 0) / (modelResults.length || 1);
    
    const successRate = (modelResults.length / totalTests) * 100;
    
    return {
      avgLatency,
      avgBleu,
      avgSimilarity,
      successRate,
      totalTests: modelResults.length
    };
  };

  const getSummaryChartData = () => {
    return selectedModels.map(model => {
      const stats = getModelStats(model);
      return {
        model: getModelDisplayName(model),
        'Avg BLEU': stats.avgBleu,
        'Avg Similarity': stats.avgSimilarity
      };
    });
  };

  const getLatencyChartData = () => {
    return selectedModels.map(model => {
      const stats = getModelStats(model);
      return {
        model: getModelDisplayName(model),
        latency: stats.avgLatency
      };
    });
  };

  const getOverallSummary = () => {
    const summary: { [key: string]: any } = {};
    selectedModels.forEach(model => {
      summary[model] = getModelStats(model);
    });
    return summary;
  };

  const getMetricsData = (result: TestResult) => {
    if (!result.accuracyMetrics) return [];
    
    return selectedModels.map(model => ({
      model: getModelDisplayName(model),
      BLEU: result.accuracyMetrics?.bleuScore[model] || 0,
      Similarity: result.accuracyMetrics?.semanticSimilarity[model] || 0
    }));
  };

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
          id: `${Date.now()}-${Math.random()}`,
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
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Batch test failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Audio testing functions (placeholder implementation)
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

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
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
                <button
                  onClick={() => setTestingMode('audio')}
                  className={`px-4 py-2 rounded-lg ${testingMode === 'audio' ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  Audio Testing
                </button>
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Models to Compare</label>
            <div className="flex space-x-4 mb-2">
              {(['marian', 'google', 'm2m100'] as ModelName[]).map(model => (
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
                {(['marian', 'google', 'm2m100'] as ModelName[]).map(model => (
                  <option key={model} value={model}>{getModelDisplayName(model)}</option>
                ))}
              </select>
            </div>

            {selectedModels.includes(referenceModel) && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Reference model is also selected for comparison. Accuracy metrics will not be available.
                </p>
                <p className="text-xs mt-1">
                  You have selected all available models for comparison.
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
                      <option value="museum_tour">Museum Tour (Enhanced - 15 items)</option>
                      <option value="airport_announcement">Airport Announcements (Enhanced - 15 items)</option>
                      <option value="restaurant">Restaurant (Enhanced - 15 items)</option>
                      <option value="business">Business Meeting (Enhanced - 15 items)</option>
                      <option value="medical_consultation">Medical Consultation (8 items)</option>
                      <option value="academic_lecture">Academic Lecture (8 items)</option>
                      <option value="legal_proceedings">Legal Proceedings (8 items)</option>
                      <option value="scientific_research">Scientific Research (8 items)</option>
                      <option value="technical_support">Technical Support (8 items)</option>
                    </select>
                  </div>
                  
                  {/* Enhanced Preview of test set */}
                  <div className="p-3 bg-white border rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Test Set Preview ({testSets[selectedTestSet as keyof typeof testSets]?.length || 0} total sentences):
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {testSets[selectedTestSet as keyof typeof testSets]?.slice(0, 2).map((text, index) => (
                        <li key={index} className="truncate" title={text}>
                          • {text.length > 80 ? `${text.substring(0, 80)}...` : text}
                          <span className="text-xs text-gray-400 ml-2">({text.split(' ').length} words)</span>
                        </li>
                      ))}
                      {testSets[selectedTestSet as keyof typeof testSets]?.length > 2 && (
                        <li className="text-gray-500">
                          + {testSets[selectedTestSet as keyof typeof testSets].length - 2} more sentences...
                        </li>
                      )}
                    </ul>
                    <div className="mt-2 text-xs text-blue-600">
                      💡 This enhanced dataset includes both short and long, complex sentences for comprehensive testing
                    </div>
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
              <h3 className="text-lg font-semibold mb-4">Enhanced Audio Translation Test</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty Level</label>
                  <select
                    value={selectedDifficulty}
                    onChange={(e) => setSelectedDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="easy">🟢 Easy - Extended descriptive phrases</option>
                    <option value="medium">🟡 Medium - Professional complex sentences</option>
                    <option value="hard">🔴 Hard - Technical/legal/scientific content</option>
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
                    <p className="text-gray-900 mb-2 leading-relaxed">{currentScript.text}</p>
                    <div className="text-sm text-gray-600 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p><strong>Context:</strong> {currentScript.context}</p>
                        <p><strong>Difficulty:</strong> {currentScript.difficulty}</p>
                      </div>
                      <div>
                        <p><strong>Keywords:</strong> {currentScript.keywords.join(', ')}</p>
                        <p><strong>Expected Challenges:</strong> {currentScript.expectedChallenges.join(', ')}</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-blue-600">
                      📏 Sentence length: {currentScript.text.split(' ').length} words
                    </div>
                  </div>
                )}
                
                <p className="text-sm text-gray-600">
                  🎙️ Enhanced audio testing features include longer, more complex sentences for comprehensive speech recognition and real-time translation evaluation.
                </p>
              </div>
            </div>
          )}

        {/* Results Section */}
        {testResults.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Test Results ({testResults.length})</h2>
            
            {/* Enhanced Performance Summary with Charts */}
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

                {/* Performance Metrics Table */}
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden mb-6">
                  <div className="overflow-x-auto">
                    <table className="w-full">
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
                      <tbody className="divide-y divide-gray-200">
                        {selectedModels.map(model => {
                          const stats = getModelStats(model);
                          return (
                            <tr key={model} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">{getModelDisplayName(model)}</td>
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Performance Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Accuracy Comparison Chart */}
                  <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <h4 className="text-lg font-semibold mb-3">Accuracy Comparison</h4>
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
                  <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <h4 className="text-lg font-semibold mb-3">Speed Comparison</h4>
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

                {/* Key Insights */}
                <div className="mt-6 p-4 bg-white rounded-lg border shadow-sm">
                  <h4 className="text-lg font-semibold mb-3">🔍 Key Insights</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-gray-700 mb-2">Speed Leader:</h5>
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
                      <h5 className="font-medium text-gray-700 mb-2">Accuracy Leader:</h5>
                      <p className="text-gray-600">
                        {(() => {
                          const summary = getOverallSummary();
                          if (!summary) return 'N/A';
                          const sortedByAccuracy = Object.entries(summary)
                            .sort(([,a], [,b]) => b.avgBleu - a.avgBleu);
                          const leader = sortedByAccuracy[0];
                          if (!leader) return 'N/A';
                          return `${getModelDisplayName(leader[0] as ModelName)} (${leader[1].avgBleu.toFixed(1)}% BLEU)`;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {testResults.map((result, index) => (
                <div key={result.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-medium text-gray-900">Test #{testResults.length - index}</h3>
                    <span className="text-sm text-gray-500">{result.timestamp.toLocaleTimeString()}</span>
                  </div>
                  
                  <div className="mb-3">
                    <p className="text-sm text-gray-600 mb-1">Original Text:</p>
                    <p className="text-gray-900 bg-gray-50 p-2 rounded border-l-4 border-blue-500 leading-relaxed">
                      {result.originalText}
                    </p>
                    <div className="text-xs text-gray-500 mt-1">
                      Length: {result.originalText.split(' ').length} words | 
                      Target: {languages.find(l => l.code === result.targetLanguage)?.name}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedModels.map(model => {
                      const translation = getModelTranslation(result, model);
                      const latency = model === 'marian' ? result.marianTime : 
                                    model === 'google' ? result.googleTime : 
                                    result.m2m100Time || 0;
                      
                      return (
                        <div key={model} className="border rounded-lg p-3 bg-gray-50">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-gray-700">{getModelDisplayName(model)}</h4>
                            <span className="text-sm text-gray-500">{formatLatency(latency)}</span>
                          </div>
                          <p className="text-gray-900 text-sm leading-relaxed">{translation}</p>
                          
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

                  {/* Accuracy Metrics Chart for individual results */}
                  {result.accuracyMetrics && getMetricsData(result).length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-2">📊 Accuracy Metrics</h4>
                      <div className="h-48">
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
      </div>
    </div>
  );
};

export default TranslationTestPage;