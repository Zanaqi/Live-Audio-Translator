import fetch from "node-fetch";

interface TranslationResponse {
  translation?: string;
  error?: string;
  latency?: number;
  model?: string;
  status?: string;
}

interface ModelResult {
  translation: string | null;
  latency: number;
  model: string;
  status: 'success' | 'failed';
  error?: string;
}

interface ThreeModelComparisonResponse {
  source_text: string;
  target_language: string;
  results: {
    marian: ModelResult;
    google: ModelResult;
    chatgpt: ModelResult;
  };
  comparison: {
    successful_models: string[];
    total_models: number;
    success_rate: number;
    pairwise?: { [key: string]: any };
  };
}

interface CustomComparisonResponse {
  source_text: string;
  target_language: string;
  selected_models: string[];
  results: { [key: string]: ModelResult };
  successful_models: string[];
  success_rate: number;
}

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

type ModelName = 'marian' | 'google' | 'chatgpt';
type ModelSet = ModelName[];

export class EnhancedTranslationService {
  private static readonly BASE_URL = "http://localhost:5000";

  /**
   * Translate text using a specific model (MarianMT, Google, or ChatGPT)
   */
  static async translateText(
    text: string,
    targetLanguage: string,
    model: ModelName = 'marian'
  ): Promise<string> {
    try {
      let endpoint = "/translate";
      if (model === 'chatgpt') {
        endpoint = "/translate-chatgpt";
      }

      const response = await fetch(`${this.BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
          model: model === 'chatgpt' ? undefined : model,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as TranslationResponse;
      if (result.error) {
        throw new Error(result.error);
      }

      return result.translation || "";
    } catch (error) {
      console.error(`Translation error (${model}):`, error);
      throw error;
    }
  }

  /**
   * Compare translations from MarianMT and Google Translate (legacy method)
   */
  static async compareTranslations(
    text: string,
    targetLanguage: string
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
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as ComparisonResponse;
      return result;
    } catch (error) {
      console.error("Translation comparison error:", error);
      throw error;
    }
  }

  /**
   * Compare translations from all three models (MarianMT, Google, ChatGPT)
   */
  static async compareThreeModels(
    text: string,
    targetLanguage: string
  ): Promise<ThreeModelComparisonResponse> {
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

      const result = (await response.json()) as ThreeModelComparisonResponse;
      return result;
    } catch (error) {
      console.error("Three-model comparison error:", error);
      throw error;
    }
  }

  /**
   * Compare translations from selected models
   */
  static async compareCustomModels(
    text: string,
    targetLanguage: string,
    models: ModelSet
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

      const result = (await response.json()) as CustomComparisonResponse;
      return result;
    } catch (error) {
      console.error("Custom model comparison error:", error);
      throw error;
    }
  }

  /**
   * Get performance analysis between different model sets
   */
  static async analyzeModelSetPerformance(
    texts: string[],
    targetLanguage: string,
    modelSets: { name: string; models: ModelSet }[]
  ): Promise<ModelSetPerformanceAnalysis> {
    const setResults = [];

    for (const modelSet of modelSets) {
      const results = [];
      
      for (const text of texts) {
        try {
          const result = await this.compareCustomModels(text, targetLanguage, modelSet.models);
          results.push(result);
          // Small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error testing model set ${modelSet.name}:`, error);
        }
      }

      // Calculate performance metrics
      const performance = this.calculateSetPerformance(results, modelSet.models);
      
      setResults.push({
        name: modelSet.name,
        models: modelSet.models,
        results,
        performance
      });
    }

    // Compare model sets
    const comparison = this.compareModelSets(setResults);

    return {
      sets: setResults,
      comparison
    };
  }

  /**
   * Calculate performance metrics for a model set
   */
  private static calculateSetPerformance(
    results: CustomComparisonResponse[],
    models: ModelSet
  ) {
    const avgLatency: { [key: string]: number } = {};
    const successRate: { [key: string]: number } = {};
    
    models.forEach(model => {
      const modelResults = results.map(r => r.results[model]).filter(Boolean);
      const successfulResults = modelResults.filter(r => r.status === 'success');
      
      avgLatency[model] = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.latency, 0) / successfulResults.length
        : 0;
      
      successRate[model] = modelResults.length > 0
        ? successfulResults.length / modelResults.length
        : 0;
    });

    const totalSuccessRate = results.reduce((sum, r) => sum + r.success_rate, 0) / results.length;

    return {
      avgLatency,
      successRate,
      totalSuccessRate
    };
  }

  /**
   * Compare different model sets to identify the best performing one
   */
  private static compareModelSets(setResults: any[]) {
    // Find best performing set based on success rate and speed
    let bestSet = setResults[0];
    let bestScore = 0;

    setResults.forEach(set => {
      const avgLatencies = Object.values(set.performance.avgLatency) as number[];
      const avgLatency = avgLatencies.reduce((a, b) => a + b, 0) / avgLatencies.length;
      
      // Score based on success rate (70%) and speed (30%)
      const score = set.performance.totalSuccessRate * 0.7 + 
                   (avgLatency > 0 ? (1 / avgLatency) * 0.3 : 0);
      
      if (score > bestScore) {
        bestScore = score;
        bestSet = set;
      }
    });

    // Calculate model similarity (simplified - based on success patterns)
    const modelSimilarity: { [key: string]: number } = {};
    
    // Compare pairwise agreement between models
    const allModels = ['marian', 'google', 'chatgpt'];
    for (let i = 0; i < allModels.length; i++) {
      for (let j = i + 1; j < allModels.length; j++) {
        const model1 = allModels[i];
        const model2 = allModels[j];
        
        let agreements = 0;
        let comparisons = 0;
        
        setResults.forEach(set => {
          set.results.forEach((result: CustomComparisonResponse) => {
            if (result.results[model1] && result.results[model2] && 
                result.results[model1].status === 'success' && 
                result.results[model2].status === 'success') {
              comparisons++;
              
              // Simple similarity check (could be more sophisticated)
              const trans1 = result.results[model1].translation?.toLowerCase().trim();
              const trans2 = result.results[model2].translation?.toLowerCase().trim();
              
              if (trans1 === trans2) {
                agreements++;
              }
            }
          });
        });
        
        const similarity = comparisons > 0 ? (agreements / comparisons) * 100 : 0;
        modelSimilarity[`${model1}_vs_${model2}`] = Math.round(similarity);
      }
    }

    return {
      bestPerformingSet: bestSet.name,
      modelSimilarity
    };
  }

  /**
   * Run predefined audio tests for performance evaluation
   */
  static async runAudioTests(
    targetLanguage: string,
    testCase: 'museum_tour' | 'guided_tour' | 'general' = 'museum_tour'
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

      const result = (await response.json()) as AudioTestResponse;
      return result;
    } catch (error) {
      console.error("Audio test error:", error);
      throw error;
    }
  }

  /**
   * Get list of supported languages
   */
  static async getSupportedLanguages(): Promise<Array<{
    code: string;
    name: string;
    native: string;
  }>> {
    try {
      const response = await fetch(`${this.BASE_URL}/languages`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.languages;
    } catch (error) {
      console.error("Error fetching languages:", error);
      // Return default languages if API fails
      return [
        { code: "malay", name: "Malay", native: "Bahasa Melayu" },
        { code: "french", name: "French", native: "Français" },
        { code: "spanish", name: "Spanish", native: "Español" },
        { code: "german", name: "German", native: "Deutsch" },
        { code: "italian", name: "Italian", native: "Italiano" },
        { code: "japanese", name: "Japanese", native: "日本語" },
        { code: "chinese", name: "Chinese", native: "中文" },
        { code: "indonesian", name: "Indonesian", native: "Bahasa Indonesia" },
        { code: "portuguese", name: "Portuguese", native: "Português" },
        { code: "dutch", name: "Dutch", native: "Nederlands" },
        { code: "korean", name: "Korean", native: "한국어" },
        { code: "thai", name: "Thai", native: "ไทย" },
        { code: "vietnamese", name: "Vietnamese", native: "Tiếng Việt" },
      ];
    }
  }

  /**
   * Health check for translation services
   */
  static async healthCheck(): Promise<{
    status: string;
    models: string[];
    cuda_available: boolean;
  }> {
    try {
      const response = await fetch(`${this.BASE_URL}/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Health check error:", error);
      throw error;
    }
  }

  /**
   * Legacy method - maintains compatibility with existing code
   */
  static async translate(
    text: string,
    targetLanguage: string
  ): Promise<string> {
    return this.translateText(text, targetLanguage, 'marian');
  }

  /**
   * Get the better performing model for a specific language based on test results
   */
  static async getBestModelForLanguage(
    targetLanguage: string
  ): Promise<ModelName> {
    try {
      // Run a quick test to determine the better model
      const testResult = await this.runAudioTests(targetLanguage, 'general');
      return testResult.summary.faster_model.toLowerCase().includes('marian') 
        ? 'marian' 
        : 'google';
    } catch (error) {
      console.error("Error determining best model:", error);
      // Default to MarianMT
      return 'marian';
    }
  }

  /**
   * Intelligent translation that automatically selects the best model
   */
  static async smartTranslate(
    text: string,
    targetLanguage: string
  ): Promise<{
    translation: string;
    model: string;
    latency: number;
  }> {
    try {
      // For Malay, we can directly compare both models
      if (targetLanguage.toLowerCase() === 'malay' || 
          targetLanguage.toLowerCase() === 'bahasa') {
        const comparison = await this.compareThreeModels(text, targetLanguage);
        
        // Choose the fastest successful model
        const successfulModels = comparison.comparison.successful_models;
        if (successfulModels.length === 0) {
          throw new Error("All translation models failed");
        }
        
        // Find the fastest successful model
        let fastestModel = successfulModels[0];
        let fastestTime = comparison.results[fastestModel as keyof typeof comparison.results].latency;
        
        successfulModels.forEach(model => {
          const modelResult = comparison.results[model as keyof typeof comparison.results];
          if (modelResult.latency < fastestTime) {
            fastestTime = modelResult.latency;
            fastestModel = model;
          }
        });
        
        const result = comparison.results[fastestModel as keyof typeof comparison.results];
        
        return {
          translation: result.translation || '',
          model: result.model,
          latency: result.latency,
        };
      }
      
      // For other languages, use the determined best model
      const bestModel = await this.getBestModelForLanguage(targetLanguage);
      const translation = await this.translateText(text, targetLanguage, bestModel);
      
      return {
        translation,
        model: bestModel === 'marian' ? 'MarianMT' : 'Google Translate',
        latency: 0, // Would need to track this in individual calls
      };
    } catch (error) {
      console.error("Smart translation error:", error);
      throw error;
    }
  }

  /**
   * Batch translation with multiple models for performance comparison
   */
  static async batchTranslate(
    texts: string[],
    targetLanguage: string,
    models: ModelSet = ['marian', 'google', 'chatgpt']
  ): Promise<Array<{
    text: string;
    results: { [key: string]: ModelResult };
    fastest: string;
    mostAccurate?: string;
  }>> {
    const batchResults = [];
    
    for (const text of texts) {
      try {
        const comparison = await this.compareCustomModels(text, targetLanguage, models);
        
        // Find fastest successful model
        const successfulModels = comparison.successful_models;
        let fastest = '';
        let fastestTime = Infinity;
        
        successfulModels.forEach(model => {
          const result = comparison.results[model];
          if (result.status === 'success' && result.latency < fastestTime) {
            fastestTime = result.latency;
            fastest = model;
          }
        });
        
        batchResults.push({
          text,
          results: comparison.results,
          fastest,
          // mostAccurate would require reference translations to determine
        });
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Batch translation failed for text: ${text}`, error);
      }
    }
    
    return batchResults;
  }
}

// Maintain backward compatibility
export async function translateText(
  text: string,
  targetLanguage: string
): Promise<string> {
  return EnhancedTranslationService.translate(text, targetLanguage);
}

// New exports for enhanced functionality
export const {
  compareTranslations,
  compareThreeModels,
  compareCustomModels,
  analyzeModelSetPerformance,
  runAudioTests,
  getSupportedLanguages,
  healthCheck,
  smartTranslate,
  batchTranslate,
} = EnhancedTranslationService;

// Type exports for external use
export type { 
  ModelName, 
  ModelSet, 
  ThreeModelComparisonResponse, 
  CustomComparisonResponse,
  ModelSetPerformanceAnalysis,
  ModelResult 
};