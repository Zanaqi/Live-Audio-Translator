interface TranslationResponse {
  translation: string;
  latency: number;
  model: string;
  status?: string;
  error?: string;
}

interface ComparisonResponse {
  original: string;
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

interface CustomComparisonResponse {
  original: string;
  target_language: string;
  results: { [key: string]: TranslationResponse };
}

interface AllModelsComparisonResponse {
  original: string;
  target_language: string;
  results: { [key: string]: TranslationResponse };
  models_tested: number;
}

interface ThreeWayComparisonResponse {
  original: string;
  target_language: string;
  results: {
    marian: TranslationResponse;
    google: TranslationResponse;
    m2m100: TranslationResponse;
  };
}

interface AudioTestResponse {
  test_case: string;
  target_language: string;
  results: Array<{
    original: string;
    marian: {
      translation: string;
      latency: number;
    };
    google: {
      translation: string;
      latency: number;
    };
  }>;
  summary: {
    total_tests: number;
    avg_marian_latency: number;
    avg_google_latency: number;
    faster_model: string;
  };
}

interface ModelSetPerformanceAnalysis {
  sets: Array<{
    name: string;
    models: ModelName[];
    results: CustomComparisonResponse[];
    performance: {
      avgLatency: { [key: string]: number };
      successRate: { [key: string]: number };
      totalSuccessRate: number;
    };
  }>;
  comparison: {
    bestPerformingSet: string;
    modelSimilarity: { [key: string]: number };
  };
}

interface ModelsResponse {
  models: {
    [key: string]: {
      name: string;
      status: boolean | { [key: string]: boolean };
      languages: string[];
      description: string;
    };
  };
  total_models: number;
  loaded_models: number;
}

interface HealthResponse {
  status: string;
  uptime_seconds: number;
  translation_count: number;
  device: string;
  models_loaded: {
    google: boolean;
    m2m100: boolean;
    marian: { [key: string]: boolean };
    deepl: boolean;
    madlad: boolean;
  };
  model_health: { [key: string]: boolean };
  enhanced_features: string[];
}

// Updated to include new models
type ModelName = 'marian' | 'google' | 'm2m100' | 'deepl' | 'madlad';
type ModelSet = ModelName[];

export class EnhancedTranslationService {
  private static readonly BASE_URL = "http://localhost:5000";

  /**
   * Get available models and their status
   */
  static async getAvailableModels(): Promise<ModelsResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching available models:", error);
      throw error;
    }
  }

  /**
   * Enhanced health check including new models
   */
  static async checkHealth(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error checking health:", error);
      throw error;
    }
  }

  /**
   * Translate text using a specific model (including new models)
   */
  static async translateText(
    text: string,
    targetLanguage: string,
    model: ModelName = 'marian'
  ): Promise<string> {
    try {
      // Map models to their specific endpoints
      let endpoint = "/translate";
      let requestModel = model;

      switch (model) {
        case 'marian':
          endpoint = "/translate";
          requestModel = 'marian';
          break;
        case 'google':
          endpoint = "/translate";
          requestModel = 'google';
          break;
        case 'm2m100':
          endpoint = "/translate-m2m100";
          requestModel = 'm2m100';
          break;
        case 'deepl':
          endpoint = "/translate-deepl";
          requestModel = 'deepl';
          break;
        case 'madlad':
          endpoint = "/translate-madlad";
          requestModel = 'madlad';
          break;
        default:
          endpoint = "/translate";
          requestModel = 'marian';
      }

      const response = await fetch(`${this.BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
          model: requestModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: TranslationResponse = await response.json();
      return data.translation;
    } catch (error) {
      console.error(`Error translating with ${model}:`, error);
      throw error;
    }
  }

  /**
   * Compare custom selection of models (including new models)
   */
  static async compareCustomModels(
    text: string,
    targetLanguage: string,
    models: ModelName[]
  ): Promise<CustomComparisonResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/compare-custom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
          models,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in custom comparison:", error);
      throw error;
    }
  }

  /**
   * Compare ALL available models (including new ones)
   */
  static async compareAllModels(
    text: string,
    targetLanguage: string
  ): Promise<AllModelsComparisonResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/compare-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in all models comparison:", error);
      throw error;
    }
  }

  /**
   * Compare three specific models (legacy compatibility)
   */
  static async compareThreeWay(
    text: string,
    targetLanguage: string
  ): Promise<ThreeWayComparisonResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/compare-three`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in three-way comparison:", error);
      throw error;
    }
  }

  /**
   * Compare two models (legacy compatibility)
   */
  static async compareTwoModels(
    text: string,
    targetLanguage: string,
    model1: string = "marian",
    model2: string = "google"
  ): Promise<ComparisonResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
          model1,
          model2,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in two-model comparison:", error);
      throw error;
    }
  }

  /**
   * Test audio translation scenarios
   */
  static async testAudioTranslation(
    targetLanguage: string,
    testCase: string = "museum_tour"
  ): Promise<AudioTestResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/test-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetLanguage,
          testCase,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in audio testing:", error);
      throw error;
    }
  }

  /**
   * Enhanced batch translation with multiple models
   */
  static async batchTranslate(
    texts: string[],
    targetLanguage: string,
    models: ModelName[] = ['marian', 'google']
  ): Promise<Array<CustomComparisonResponse>> {
    const results: Array<CustomComparisonResponse> = [];
    
    for (const text of texts) {
      try {
        const result = await this.compareCustomModels(text, targetLanguage, models);
        results.push(result);
        
        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error translating batch text: "${text}"`, error);
        // Continue with other texts even if one fails
      }
    }
    
    return results;
  }

  /**
   * Analyze performance across different model sets
   */
  static async analyzeModelSetPerformance(
    testTexts: string[],
    targetLanguage: string,
    modelSets: Array<{ name: string; models: ModelName[] }>
  ): Promise<ModelSetPerformanceAnalysis> {
    const results: ModelSetPerformanceAnalysis = {
      sets: [],
      comparison: {
        bestPerformingSet: '',
        modelSimilarity: {}
      }
    };

    for (const set of modelSets) {
      const setResults: CustomComparisonResponse[] = [];
      
      for (const text of testTexts) {
        try {
          const result = await this.compareCustomModels(text, targetLanguage, set.models);
          setResults.push(result);
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch (error) {
          console.error(`Error in model set analysis for "${set.name}":`, error);
        }
      }

      // Calculate performance metrics
      const avgLatency: { [key: string]: number } = {};
      const successRate: { [key: string]: number } = {};

      for (const model of set.models) {
        const latencies: number[] = [];
        let successCount = 0;

        for (const result of setResults) {
          const modelResult = result.results[model];
          if (modelResult) {
            latencies.push(modelResult.latency);
            if (modelResult.status === 'success') {
              successCount++;
            }
          }
        }

        avgLatency[model] = latencies.length > 0 ? 
          latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0;
        successRate[model] = setResults.length > 0 ? 
          (successCount / setResults.length) * 100 : 0;
      }

      const totalSuccessRate = Object.values(successRate).reduce((sum, rate) => sum + rate, 0) / set.models.length;

      results.sets.push({
        name: set.name,
        models: set.models,
        results: setResults,
        performance: {
          avgLatency,
          successRate,
          totalSuccessRate
        }
      });
    }

    // Determine best performing set
    let bestSet = results.sets[0];
    for (const set of results.sets) {
      if (set.performance.totalSuccessRate > bestSet.performance.totalSuccessRate) {
        bestSet = set;
      }
    }
    results.comparison.bestPerformingSet = bestSet.name;

    return results;
  }

  /**
   * Get model display name for UI
   */
  static getModelDisplayName(model: ModelName): string {
    const displayNames: { [key in ModelName]: string } = {
      'marian': 'MarianMT',
      'google': 'Google Translate',
      'm2m100': 'M2M-100',
      'deepl': 'DeepL',
      'madlad': 'Madlad-400'
    };
    
    return displayNames[model] || model;
  }

  /**
   * Get supported languages for a specific model
   */
  static getSupportedLanguages(model: ModelName): string[] {
    const languageSupport: { [key in ModelName]: string[] } = {
      'marian': ['chinese', 'tamil', 'french', 'spanish', 'german', 'japanese', 'korean'],
      'google': ['chinese', 'tamil', 'french', 'spanish', 'german', 'japanese', 'korean'],
      'm2m100': ['chinese', 'tamil', 'french', 'spanish', 'german', 'japanese', 'korean'],
      'deepl': ['chinese', 'french', 'spanish', 'german', 'japanese', 'korean'],
      'madlad': ['chinese', 'tamil', 'french', 'spanish', 'german', 'japanese', 'korean']
    };
    
    return languageSupport[model] || [];
  }

  /**
   * Check if a model supports a specific language
   */
  static isLanguageSupported(model: ModelName, language: string): boolean {
    return this.getSupportedLanguages(model).includes(language.toLowerCase());
  }

  /**
   * Get all available models
   */
  static getAllAvailableModels(): ModelName[] {
    return ['marian', 'google', 'm2m100', 'deepl', 'madlad'];
  }

  /**
   * Get models that support a specific language
   */
  static getModelsForLanguage(language: string): ModelName[] {
    return this.getAllAvailableModels().filter(model => 
      this.isLanguageSupported(model, language)
    );
  }

  /**
   * Enhanced error handling with model-specific suggestions
   */
  static async translateWithFallback(
    text: string,
    targetLanguage: string,
    preferredModels: ModelName[] = ['google', 'marian', 'deepl']
  ): Promise<{ translation: string; model: ModelName; attempts: number }> {
    let lastError: Error | null = null;
    let attempts = 0;

    for (const model of preferredModels) {
      if (!this.isLanguageSupported(model, targetLanguage)) {
        continue;
      }

      try {
        attempts++;
        const translation = await this.translateText(text, targetLanguage, model);
        return { translation, model, attempts };
      } catch (error) {
        lastError = error as Error;
        console.warn(`Translation failed with ${model}, trying next model:`, error);
      }
    }

    throw new Error(`All translation attempts failed. Last error: ${lastError?.message}`);
  }

  /**
   * Performance benchmarking for new models
   */
  static async benchmarkModels(
    testTexts: string[],
    targetLanguage: string,
    models: ModelName[] = ['marian', 'google', 'deepl']
  ): Promise<{
    [key in ModelName]?: {
      avgLatency: number;
      successRate: number;
      translations: string[];
      errors: string[];
    }
  }> {
    const benchmark: any = {};

    for (const model of models) {
      if (!this.isLanguageSupported(model, targetLanguage)) {
        continue;
      }

      const latencies: number[] = [];
      const translations: string[] = [];
      const errors: string[] = [];
      let successCount = 0;

      for (const text of testTexts) {
        try {
          const startTime = performance.now();
          const translation = await this.translateText(text, targetLanguage, model);
          const endTime = performance.now();
          
          latencies.push(endTime - startTime);
          translations.push(translation);
          successCount++;
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          errors.push((error as Error).message);
        }
      }

      benchmark[model] = {
        avgLatency: latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0,
        successRate: testTexts.length > 0 ? (successCount / testTexts.length) * 100 : 0,
        translations,
        errors
      };
    }

    return benchmark;
  }

  /**
   * Quality assessment using multiple models
   */
  static async assessTranslationQuality(
    text: string,
    targetLanguage: string,
    referenceModel: ModelName = 'deepl'
  ): Promise<{
    reference: { model: ModelName; translation: string };
    comparisons: Array<{
      model: ModelName;
      translation: string;
      similarity: number;
      latency: number;
    }>;
  }> {
    // Get reference translation
    const referenceTranslation = await this.translateText(text, targetLanguage, referenceModel);
    
    // Get translations from other models
    const otherModels = this.getModelsForLanguage(targetLanguage).filter(m => m !== referenceModel);
    const comparisons: Array<{
      model: ModelName;
      translation: string;
      similarity: number;
      latency: number;
    }> = [];

    for (const model of otherModels) {
      try {
        const startTime = performance.now();
        const translation = await this.translateText(text, targetLanguage, model);
        const endTime = performance.now();
        
        // Simple similarity calculation (could be enhanced with BLEU score or semantic similarity)
        const similarity = this.calculateSimilarity(referenceTranslation, translation);
        
        comparisons.push({
          model,
          translation,
          similarity,
          latency: endTime - startTime
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Quality assessment failed for ${model}:`, error);
      }
    }

    return {
      reference: { model: referenceModel, translation: referenceTranslation },
      comparisons: comparisons.sort((a, b) => b.similarity - a.similarity)
    };
  }

  /**
   * Simple similarity calculation (Jaccard similarity)
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Get model recommendations based on language and use case
   */
  static getModelRecommendations(
    language: string,
    useCase: 'speed' | 'quality' | 'multilingual' | 'professional' = 'quality'
  ): {
    primary: ModelName[];
    secondary: ModelName[];
    notes: string;
  } {
    const supportedModels = this.getModelsForLanguage(language);
    
    const recommendations = {
      speed: {
        primary: ['google', 'marian'] as ModelName[],
        secondary: ['deepl', 'm2m100'] as ModelName[],
        notes: 'Prioritizes fast response times over translation quality'
      },
      quality: {
        primary: ['deepl', 'm2m100'] as ModelName[],
        secondary: ['google', 'madlad'] as ModelName[],
        notes: 'Prioritizes translation accuracy and naturalness'
      },
      multilingual: {
        primary: ['madlad', 'm2m100'] as ModelName[],
        secondary: ['google', 'marian'] as ModelName[],
        notes: 'Best for handling diverse language pairs and rare languages'
      },
      professional: {
        primary: ['deepl'] as ModelName[],
        secondary: ['google', 'm2m100'] as ModelName[],
        notes: 'Suitable for business and professional contexts'
      }
    };

    const rec = recommendations[useCase];
    
    return {
      primary: rec.primary.filter(model => supportedModels.includes(model)),
      secondary: rec.secondary.filter(model => supportedModels.includes(model)),
      notes: rec.notes
    };
  }
}