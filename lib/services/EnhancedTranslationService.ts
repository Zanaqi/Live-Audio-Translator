import fetch from "node-fetch";

interface TranslationResponse {
  translation?: string;
  error?: string;
  latency?: number;
  model?: string;
}

interface ComparisonResponse {
  source_text: string;
  target_language: string;
  marian: {
    translation: string;
    latency: number;
    model: string;
  };
  google: {
    translation: string;
    latency: number;
    model: string;
  };
  comparison: {
    are_same: boolean;
    length_diff: number;
    speed_diff: number;
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

export class EnhancedTranslationService {
  private static readonly BASE_URL = "http://localhost:5000";

  /**
   * Translate text using a specific model (MarianMT or Google)
   */
  static async translateText(
    text: string,
    targetLanguage: string,
    model: 'marian' | 'google' = 'marian'
  ): Promise<string> {
    try {
      const response = await fetch(`${this.BASE_URL}/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          targetLanguage,
          model,
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
   * Compare translations from both MarianMT and Google Translate
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
  ): Promise<'marian' | 'google'> {
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
        const comparison = await this.compareTranslations(text, targetLanguage);
        
        // Choose the faster model
        const fasterModel = comparison.marian.latency < comparison.google.latency 
          ? 'marian' 
          : 'google';
        
        return {
          translation: fasterModel === 'marian' 
            ? comparison.marian.translation 
            : comparison.google.translation,
          model: fasterModel === 'marian' ? 'MarianMT' : 'Google Translate',
          latency: fasterModel === 'marian' 
            ? comparison.marian.latency 
            : comparison.google.latency,
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
  runAudioTests,
  getSupportedLanguages,
  healthCheck,
  smartTranslate,
} = EnhancedTranslationService;