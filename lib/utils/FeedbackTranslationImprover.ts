interface TranslationFeedback {
  originalText: string;
  baseTranslation: string;
  enhancedTranslation: string;
  selectedTranslation: string; // Which translation the user preferred
  rating: number; // 1-5 rating
  corrections?: string; // Optional user corrections
  roomId: string;
  userId: string;
  timestamp: number;
}

interface FeedbackStore {
  addFeedback(feedback: TranslationFeedback): Promise<void>;
  getFeedbackForPhrase(
    phrase: string,
    targetLanguage: string
  ): Promise<TranslationFeedback[]>;
  getTopRatedTranslations(
    limit: number
  ): Promise<{ original: string; translation: string; rating: number }[]>;
  getUserPreferences(userId: string): Promise<any>;
}

// MongoDB implementation of FeedbackStore
export class MongoFeedbackStore implements FeedbackStore {
  async addFeedback(feedback: TranslationFeedback): Promise<void> {
    // Store feedback in MongoDB
    try {
      await connectToDatabase();
      // Assuming we create a Feedback model
      const feedbackModel = mongoose.model("Feedback");
      await new feedbackModel(feedback).save();
      console.log(`Stored feedback for "${feedback.originalText}"`);
    } catch (error) {
      console.error("Error storing feedback:", error);
    }
  }

  async getFeedbackForPhrase(
    phrase: string,
    targetLanguage: string
  ): Promise<TranslationFeedback[]> {
    try {
      await connectToDatabase();
      const feedbackModel = mongoose.model("Feedback");

      // Use similarity search to find feedback for similar phrases
      // This is simplified - in practice would use vector embeddings for semantic search
      return await feedbackModel
        .find({
          originalText: { $regex: new RegExp(phrase.substring(0, 10), "i") },
          targetLanguage,
        })
        .sort({ rating: -1, timestamp: -1 })
        .limit(5);
    } catch (error) {
      console.error("Error retrieving feedback:", error);
      return [];
    }
  }

  async getTopRatedTranslations(
    limit: number
  ): Promise<{ original: string; translation: string; rating: number }[]> {
    try {
      await connectToDatabase();
      const feedbackModel = mongoose.model("Feedback");

      // Get highest rated translations
      const results = await feedbackModel
        .find({ rating: { $gt: 3 } })
        .sort({ rating: -1 })
        .limit(limit);

      return results.map((r) => ({
        original: r.originalText,
        translation: r.selectedTranslation,
        rating: r.rating,
      }));
    } catch (error) {
      console.error("Error retrieving top translations:", error);
      return [];
    }
  }

  async getUserPreferences(userId: string): Promise<any> {
    try {
      await connectToDatabase();
      const feedbackModel = mongoose.model("Feedback");

      // Analyze user's preferences based on their feedback history
      const userFeedback = await feedbackModel.find({ userId });

      // Calculate preference statistics (simplified)
      const preferenceStats = {
        preferredStyle: "formal", // Default
        commonCorrections: {},
        averageRating: 0,
      };

      if (userFeedback.length > 0) {
        // Analyze patterns in selected translations and corrections
        // This is a simplified example - would be more sophisticated in practice
        let formalCount = 0;
        let informalCount = 0;
        let totalRating = 0;

        userFeedback.forEach((fb) => {
          totalRating += fb.rating;

          // Simple heuristic for formal vs informal preference
          if (fb.selectedTranslation === fb.baseTranslation) {
            formalCount++;
          } else {
            informalCount++;
          }

          // Track common corrections
          if (fb.corrections) {
            // Analyze and track patterns in corrections
          }
        });

        preferenceStats.preferredStyle =
          formalCount > informalCount ? "formal" : "informal";
        preferenceStats.averageRating = totalRating / userFeedback.length;
      }

      return preferenceStats;
    } catch (error) {
      console.error("Error analyzing user preferences:", error);
      return { preferredStyle: "formal" };
    }
  }
}

export class FeedbackTranslationImprover {
  private feedbackStore: FeedbackStore;
  private userPreferences: Map<string, any> = new Map();
  private translationMemory: Map<string, string> = new Map();
  private readonly MIN_SIMILARITY_SCORE = 0.7;

  constructor(feedbackStore: FeedbackStore) {
    this.feedbackStore = feedbackStore;
  }

  async improveTranslation(
    baseTranslation: string,
    originalText: string,
    targetLanguage: string,
    userId?: string
  ): Promise<{
    improvedTranslation: string;
    source: "base" | "memory" | "feedback" | "user-preference";
    confidence: number;
  }> {
    // 1. Check translation memory for exact matches
    const memoryKey = `${originalText}|${targetLanguage}`;
    if (this.translationMemory.has(memoryKey)) {
      return {
        improvedTranslation: this.translationMemory.get(memoryKey)!,
        source: "memory",
        confidence: 0.95,
      };
    }

    // 2. Look for similar phrases with feedback
    const similarFeedback = await this.feedbackStore.getFeedbackForPhrase(
      originalText,
      targetLanguage
    );

    if (similarFeedback.length > 0) {
      // Find the highest-rated similar feedback
      const bestFeedback = similarFeedback[0];

      // Use the user-preferred translation from feedback
      return {
        improvedTranslation: bestFeedback.selectedTranslation,
        source: "feedback",
        confidence: 0.85,
      };
    }

    // 3. Apply user preferences if available
    if (userId) {
      // Lazy-load user preferences
      if (!this.userPreferences.has(userId)) {
        const preferences = await this.feedbackStore.getUserPreferences(userId);
        this.userPreferences.set(userId, preferences);
      }

      const preferences = this.userPreferences.get(userId);

      // Apply user preferences to customize the translation
      // This is simplified - would be more sophisticated in practice
      if (preferences.preferredStyle === "formal") {
        // Make translation more formal based on preferences
        let formalizedTranslation = this.formalize(
          baseTranslation,
          targetLanguage
        );

        return {
          improvedTranslation: formalizedTranslation,
          source: "user-preference",
          confidence: 0.75,
        };
      }
    }

    // 4. Fall back to base translation if no improvements found
    return {
      improvedTranslation: baseTranslation,
      source: "base",
      confidence: 0.6,
    };
  }

  // Store user feedback for future translation improvements
  async storeFeedback(feedback: TranslationFeedback): Promise<void> {
    await this.feedbackStore.addFeedback(feedback);

    // Add to translation memory if highly rated
    if (feedback.rating >= 4) {
      const memoryKey = `${feedback.originalText}|${feedback.selectedTranslation}`;
      this.translationMemory.set(memoryKey, feedback.selectedTranslation);
    }
  }

  // Helper method to formalize translations based on language
  private formalize(translation: string, language: string): string {
    // Language-specific formalization rules would go here
    // This is just a simple example
    switch (language) {
      case "French":
        // Replace "tu" forms with "vous" forms, etc.
        return translation.replace(/\btu\b/g, "vous");

      case "Spanish":
        // Replace "tú" forms with "usted" forms, etc.
        return translation.replace(/\btú\b/g, "usted");

      default:
        return translation;
    }
  }

  // Calculate similarity between two phrases
  // Would use vector embeddings in practice
  private calculateSimilarity(phrase1: string, phrase2: string): number {
    // Simplified similarity calculation
    const words1 = new Set(phrase1.toLowerCase().split(/\s+/));
    const words2 = new Set(phrase2.toLowerCase().split(/\s+/));

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word))
    );
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// Feedback model schema for MongoDB
import mongoose, { Schema, model, Model } from "mongoose";
import connectToDatabase from "../db/mongodb";

export interface IFeedback {
  originalText: string;
  baseTranslation: string;
  enhancedTranslation: string;
  selectedTranslation: string;
  rating: number;
  corrections?: string;
  roomId: string;
  userId: string;
  targetLanguage: string;
  timestamp: number;
}

const feedbackSchema = new Schema<IFeedback>({
  originalText: { type: String, required: true },
  baseTranslation: { type: String, required: true },
  enhancedTranslation: { type: String, required: true },
  selectedTranslation: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  corrections: { type: String },
  roomId: { type: String, required: true },
  userId: { type: String, required: true },
  targetLanguage: { type: String, required: true },
  timestamp: { type: Number, default: Date.now },
});

// Create index for faster similarity searches
feedbackSchema.index({ originalText: "text", targetLanguage: 1 });

let Feedback: Model<IFeedback>;

// Check if we're in a Node.js environment and if mongoose models is available
if (typeof mongoose !== "undefined" && mongoose.models) {
  // First check if the model already exists to prevent model overwrite error
  if (mongoose.models.Feedback) {
    Feedback = mongoose.models.Feedback as Model<IFeedback>;
  } else {
    // If model doesn't exist yet, create it
    try {
      Feedback = model<IFeedback>("Feedback", feedbackSchema);
    } catch (error) {
      console.error("Error creating Feedback model:", error);
      // Create a mock model
      Feedback = {
        findOne: () => Promise.resolve(null),
        find: () => Promise.resolve([]),
      } as unknown as Model<IFeedback>;
    }
  }
} else {
  // In environments where mongoose is not fully available (like Edge Runtime)
  Feedback = {
    findOne: () => Promise.resolve(null),
    find: () => Promise.resolve([]),
  } as unknown as Model<IFeedback>;
}

export default Feedback;
