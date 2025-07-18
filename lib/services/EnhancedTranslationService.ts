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

type ModelName = 'marian' | 'google' | 'm2m100';
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
        case 'm2m100':
          endpoint = "/translate-m2m100";
          requestModel = 'm2m100';
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

      const result: TranslationResponse = await response.json();
      
      if (result.status === "success") {
        return result.translation;
      } else {
        throw new Error(result.error || "Translation failed");
      }
    } catch (error) {
      console.error(`Translation error with ${model}:`, error);
      throw error;
    }
  }

  /**
   * Compare translations between MarianMT and Google Translate
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

      return await response.json();
    } catch (error) {
      console.error("Comparison error:", error);
      throw error;
    }
  }

  /**
   * Compare translations across three models: MarianMT, Google, and M2M-100
   */
  static async compareThreeModels(
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
      console.error("Three-way comparison error:", error);
      throw error;
    }
  }

  /**
   * Compare translations across custom selection of models
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
      console.error("Custom comparison error:", error);
      throw error;
    }
  }

  /**
   * Run audio translation tests
   */
  static async runAudioTests(
    targetLanguage: string,
    testCase: 'museum_tour' | 'airport_announcement' | 'restaurant' = 'museum_tour'
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
      console.error("Audio test error:", error);
      throw error;
    }
  }

  /**
   * Get server health status
   */
  static async getHealthStatus(): Promise<any> {
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
   * Get list of supported languages
   */
  static async getSupportedLanguages(): Promise<any> {
    try {
      const response = await fetch(`${this.BASE_URL}/languages`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Languages fetch error:", error);
      throw error;
    }
  }

  /**
   * Get list of available models
   */
  static async getAvailableModels(): Promise<any> {
    try {
      const response = await fetch(`${this.BASE_URL}/models`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Models fetch error:", error);
      throw error;
    }
  }

  /**
   * Batch translation testing with multiple model sets
   */
  static async performModelSetAnalysis(
    texts: string[],
    targetLanguage: string,
    modelSets: { name: string; models: ModelName[] }[]
  ): Promise<ModelSetPerformanceAnalysis> {
    try {
      const results: ModelSetPerformanceAnalysis = {
        sets: [],
        comparison: {
          bestPerformingSet: '',
          modelSimilarity: {}
        }
      };

      // Process each model set
      for (const set of modelSets) {
        const setResults: CustomComparisonResponse[] = [];
        
        // Test each text with the current model set
        for (const text of texts) {
          try {
            const result = await this.compareCustomModels(text, targetLanguage, set.models);
            setResults.push(result);
          } catch (error) {
            console.error(`Error testing "${text}" with set ${set.name}:`, error);
          }
        }

        // Calculate performance metrics for this set
        const performance = this.calculateSetPerformance(setResults, set.models);
        
        results.sets.push({
          name: set.name,
          models: set.models,
          results: setResults,
          performance
        });
      }

      // Find best performing set
      results.comparison.bestPerformingSet = this.findBestPerformingSet(results.sets);
      
      // Calculate model similarity scores
      results.comparison.modelSimilarity = this.calculateModelSimilarity(results.sets);

      return results;
    } catch (error) {
      console.error("Model set analysis error:", error);
      throw error;
    }
  }

  /**
   * Calculate performance metrics for a model set
   */
  private static calculateSetPerformance(
    results: CustomComparisonResponse[],
    models: ModelName[]
  ): {
    avgLatency: { [key: string]: number };
    successRate: { [key: string]: number };
    totalSuccessRate: number;
  } {
    const performance = {
      avgLatency: {} as { [key: string]: number },
      successRate: {} as { [key: string]: number },
      totalSuccessRate: 0
    };

    // Initialize metrics for each model
    models.forEach(model => {
      performance.avgLatency[model] = 0;
      performance.successRate[model] = 0;
    });

    if (results.length === 0) return performance;

    // Calculate averages
    let totalSuccesses = 0;
    let totalTests = 0;

    results.forEach(result => {
      models.forEach(model => {
        const modelResult = result.results[model];
        if (modelResult) {
          totalTests++;
          performance.avgLatency[model] += modelResult.latency;
          
          if (modelResult.status === 'success') {
            performance.successRate[model]++;
            totalSuccesses++;
          }
        }
      });
    });

    // Finalize averages
    models.forEach(model => {
      if (results.length > 0) {
        performance.avgLatency[model] /= results.length;
        performance.successRate[model] = (performance.successRate[model] / results.length) * 100;
      }
    });

    performance.totalSuccessRate = totalTests > 0 ? (totalSuccesses / totalTests) * 100 : 0;

    return performance;
  }

  /**
   * Find the best performing model set based on success rate and speed
   */
  private static findBestPerformingSet(
    sets: Array<{
      name: string;
      performance: {
        totalSuccessRate: number;
        avgLatency: { [key: string]: number };
      };
    }>
  ): string {
    let bestSet = '';
    let bestScore = -1;

    sets.forEach(set => {
      // Calculate composite score (success rate weighted more heavily)
      const avgLatency = Object.values(set.performance.avgLatency).reduce((a, b) => a + b, 0) / 
                        Object.values(set.performance.avgLatency).length;
      
      // Score = 70% success rate + 30% speed (inverted latency)
      const score = (set.performance.totalSuccessRate * 0.7) + 
                   ((1 / (avgLatency + 0.1)) * 30); // +0.1 to avoid division by zero

      if (score > bestScore) {
        bestScore = score;
        bestSet = set.name;
      }
    });

    return bestSet;
  }

  /**
   * Calculate similarity scores between models based on translation outputs
   */
  private static calculateModelSimilarity(
    sets: Array<{
      results: CustomComparisonResponse[];
    }>
  ): { [key: string]: number } {
    const similarity: { [key: string]: number } = {};
    
    // Simple similarity calculation based on translation length similarity
    // In a real implementation, you might use more sophisticated NLP similarity metrics
    
    const allResults = sets.flatMap(set => set.results);
    const modelPairs: string[] = [];

    // Generate all possible model pairs
    const allModels = ['marian', 'google', 'm2m100'];
    for (let i = 0; i < allModels.length; i++) {
      for (let j = i + 1; j < allModels.length; j++) {
        modelPairs.push(`${allModels[i]}-${allModels[j]}`);
      }
    }

    modelPairs.forEach(pair => {
      const [model1, model2] = pair.split('-');
      let totalSimilarity = 0;
      let comparisons = 0;

      allResults.forEach(result => {
        const trans1 = result.results[model1];
        const trans2 = result.results[model2];

        if (trans1?.status === 'success' && trans2?.status === 'success') {
          // Simple length-based similarity (can be enhanced with semantic similarity)
          const len1 = trans1.translation.length;
          const len2 = trans2.translation.length;
          const maxLen = Math.max(len1, len2);
          const similarity = maxLen > 0 ? 1 - Math.abs(len1 - len2) / maxLen : 1;
          
          totalSimilarity += similarity;
          comparisons++;
        }
      });

      similarity[pair] = comparisons > 0 ? (totalSimilarity / comparisons) * 100 : 0;
    });

    return similarity;
  }

  /**
   * Clean up server memory
   */
  static async cleanupMemory(): Promise<any> {
    try {
      const response = await fetch(`${this.BASE_URL}/cleanup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Memory cleanup error:", error);
      throw error;
    }
  }
}