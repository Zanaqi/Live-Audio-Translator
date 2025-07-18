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

// Updated to include all supported models
type ModelName = 'marian' | 'google' | 'chatgpt' | 'm2m100' | 'madlad';
type ModelSet = ModelName[];

export class EnhancedTranslationService {
  private static readonly BASE_URL = "http://localhost:5000";

  /**
   * Translate text using a specific model
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
        case 'chatgpt':
          endpoint = "/translate-chatgpt";
          requestModel = 'chatgpt';
          break;
        case 'm2m100':
          endpoint = "/translate-m2m100";
          requestModel = 'm2m100';
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
   * Analyze performance across different model sets
   */
  static async analyzeModelSetPerformance(
    texts: string[],
    targetLanguage: string,
    modelSets: { name: string; models: ModelSet }[]
  ): Promise<ModelSetPerformanceAnalysis> {
    try {
      const response = await fetch(`${this.BASE_URL}/analyze-model-sets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts,
          targetLanguage,
          modelSets,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as ModelSetPerformanceAnalysis;
      return result;
    } catch (error) {
      console.error("Model set analysis error:", error);
      throw error;
    }
  }

  /**
   * Run audio tests with specified models
   */
  static async runAudioTests(
    testCases: string[],
    targetLanguage: string
  ): Promise<AudioTestResponse> {
    try {
      const response = await fetch(`${this.BASE_URL}/test-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_cases: testCases,
          target_language: targetLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as AudioTestResponse;
      return result;
    } catch (error) {
      console.error("Audio testing error:", error);
      throw error;
    }
  }

  /**
   * Get supported languages
   */
  static async getSupportedLanguages(): Promise<string[]> {
    try {
      const response = await fetch(`${this.BASE_URL}/languages`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.languages || [];
    } catch (error) {
      console.error("Error fetching supported languages:", error);
      return [];
    }
  }

  /**
   * Check service health
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.BASE_URL}/health`);
      return response.ok;
    } catch (error) {
      console.error("Health check error:", error);
      return false;
    }
  }

  /**
   * Smart translation that automatically selects the best model
   */
  static async smartTranslate(
    text: string,
    targetLanguage: string
  ): Promise<{
    translation: string;
    model: ModelName;
    confidence: number;
    latency: number;
  }> {
    try {
      // For now, we'll use a simple heuristic
      // In production, this could use ML to predict the best model
      let selectedModel: ModelName = 'marian';

      // Use M2M-100 for Asian languages
      if (['chinese', 'japanese', 'korean', 'tamil'].includes(targetLanguage.toLowerCase())) {
        selectedModel = 'm2m100';
      }
      // Use MADLAD for less common languages
      else if (['malay'].includes(targetLanguage.toLowerCase())) {
        selectedModel = 'madlad';
      }
      // Use Google for European languages
      else if (['french', 'spanish', 'german', 'italian'].includes(targetLanguage.toLowerCase())) {
        selectedModel = 'google';
      }

      const startTime = Date.now();
      const translation = await this.translateText(text, targetLanguage, selectedModel);
      const latency = (Date.now() - startTime) / 1000;

      return {
        translation,
        model: selectedModel,
        confidence: 0.8, // Would be calculated based on actual metrics
        latency: latency,
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
    models: ModelSet = ['marian', 'google', 'm2m100']
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
  return EnhancedTranslationService.translateText(text, targetLanguage);
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