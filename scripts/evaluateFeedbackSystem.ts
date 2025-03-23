import {
  FeedbackTranslationImprover,
  MongoFeedbackStore,
} from "../lib/utils/FeedbackTranslationImprover";
import connectToDatabase from "../lib/db/mongodb";
import { evaluateTranslationImprovement } from "../lib/utils/translationEvaluator";
import { TranslationAdapter } from "../lib/server/utils/TranslationAdapter";
import { ContextManager } from "../lib/server/utils/ContextManager";
import * as fs from "fs";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Define the supported languages type
type SupportedLanguage =
  | "French"
  | "Spanish"
  | "German"
  | "Italian"
  | "Chinese";

// Define type for translations dictionary
type TranslationMap = {
  [key: string]: string;
};

type TranslationsDict = {
  [L in SupportedLanguage]: TranslationMap;
};

// Define result types
interface ScoreResult {
  semanticSimilarity: number;
  sourceText: string;
  translation: string;
  language: string;
  confidenceScore?: number;
  contexts?: string[];
  improvementSource?: string;
  [key: string]: any; // Allow additional properties
}

interface EvaluationResults {
  baselineScores: ScoreResult[];
  contextScores: ScoreResult[];
  feedbackScores: ScoreResult[];
  hybridScores: ScoreResult[];
  latencies: {
    baseline: number[];
    context: number[];
    feedback: number[];
    hybrid: number[];
  };
}

// Test dataset with expected translations
const testSet = [
  {
    original:
      "This statue is from the Roman period, approximately 2000 years old.",
    targetLanguage: "French" as SupportedLanguage,
    domain: "museum_tour",
  },
  {
    original:
      "The brushstrokes show the artist's unique style developed in Paris.",
    targetLanguage: "Spanish" as SupportedLanguage,
    domain: "art_gallery",
  },
  {
    original:
      "Notice the arches supporting the dome, an architectural innovation.",
    targetLanguage: "German" as SupportedLanguage,
    domain: "architectural_tour",
  },
  {
    original:
      "This masterpiece by Michelangelo demonstrates his understanding of anatomy.",
    targetLanguage: "Italian" as SupportedLanguage,
    domain: "museum_tour",
  },
  {
    original:
      "The colors were created using natural pigments available at that time.",
    targetLanguage: "Chinese" as SupportedLanguage,
    domain: "art_gallery",
  },
];

// Mock translation service (similar to the one in the simulation script)
async function mockTranslationService(
  text: string,
  targetLanguage: SupportedLanguage
): Promise<string> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Simple translation mapping (in a real system, this would call your Python translation service)
  const translations: TranslationsDict = {
    French: {
      "This statue is from the Roman period, approximately 2000 years old.":
        "Cette statue est de la période romaine, environ 2000 ans.",
      "The brushstrokes show the artist's unique style developed in Paris.":
        "Les coups de pinceau montrent le style unique de l'artiste développé à Paris.",
      "Notice the arches supporting the dome, an architectural innovation.":
        "Notez les arcs qui soutiennent le dôme, une innovation architecturale.",
      "This masterpiece by Michelangelo demonstrates his understanding of anatomy.":
        "Ce chef-d'œuvre de Michel-Ange démontre sa compréhension de l'anatomie.",
      "The colors were created using natural pigments available at that time.":
        "Les couleurs ont été créées avec des pigments naturels disponibles à cette époque.",
    },
    Spanish: {
      "This statue is from the Roman period, approximately 2000 years old.":
        "Esta estatua es del período romano, aproximadamente 2000 años.",
      "The brushstrokes show the artist's unique style developed in Paris.":
        "Las pinceladas muestran el estilo único del artista desarrollado en París.",
      "Notice the arches supporting the dome, an architectural innovation.":
        "Observe los arcos que sostienen la cúpula, una innovación arquitectónica.",
      "This masterpiece by Michelangelo demonstrates his understanding of anatomy.":
        "Esta obra de Michelangelo demuestra su comprensión de la anatomía.",
      "The colors were created using natural pigments available at that time.":
        "Los colores fueron creados usando pigmentos naturales disponibles en esa época.",
    },
    German: {
      "This statue is from the Roman period, approximately 2000 years old.":
        "Diese Statue stammt aus der römischen Zeit, ungefähr 2000 Jahre alt.",
      "The brushstrokes show the artist's unique style developed in Paris.":
        "Die Pinselstriche zeigen den einzigartigen Stil des Künstlers, der in Paris entwickelt wurde.",
      "Notice the arches supporting the dome, an architectural innovation.":
        "Beachten Sie die Bögen, die die Kuppel stützen, eine architektonische Innovation.",
      "This masterpiece by Michelangelo demonstrates his understanding of anatomy.":
        "Dieses Meisterwerk von Michelangelo zeigt sein Verständnis der Anatomie.",
      "The colors were created using natural pigments available at that time.":
        "Die Farben wurden mit natürlichen Pigmenten hergestellt, die zu dieser Zeit verfügbar waren.",
    },
    Italian: {
      "This statue is from the Roman period, approximately 2000 years old.":
        "Questa statua è del periodo romano, circa 2000 anni fa.",
      "The brushstrokes show the artist's unique style developed in Paris.":
        "Le pennellate mostrano lo stile unico dell'artista sviluppato a Parigi.",
      "Notice the arches supporting the dome, an architectural innovation.":
        "Notate gli archi che sostengono la cupola, un'innovazione architettonica.",
      "This masterpiece by Michelangelo demonstrates his understanding of anatomy.":
        "Questo capolavoro di Michelangelo dimostra la sua comprensione dell'anatomia.",
      "The colors were created using natural pigments available at that time.":
        "I colori sono stati creati usando pigmenti naturali disponibili a quel tempo.",
    },
    Chinese: {
      "This statue is from the Roman period, approximately 2000 years old.":
        "这座雕像来自罗马时期，约有2000年历史。",
      "The brushstrokes show the artist's unique style developed in Paris.":
        "这些笔触展示了艺术家在巴黎发展的独特风格。",
      "Notice the arches supporting the dome, an architectural innovation.":
        "注意支撑圆顶的拱门，这是一项建筑创新。",
      "This masterpiece by Michelangelo demonstrates his understanding of anatomy.":
        "这件米开朗基罗的杰作展示了他对解剖学的理解。",
      "The colors were created using natural pigments available at that time.":
        "这些颜色是用当时可获得的天然颜料创造的。",
    },
  };

  // Type-safe way to access translations
  const langTranslations = translations[targetLanguage];
  if (!langTranslations) {
    return "Translation not available - language not supported";
  }

  const translation = langTranslations[text];
  return translation || "Translation not available for this text";
}

async function evaluateSystem() {
  try {
    console.log("Connecting to database...");
    await connectToDatabase();

    // Initialize systems
    const feedbackStore = new MongoFeedbackStore();
    const feedbackImprover = new FeedbackTranslationImprover(feedbackStore);

    // Results storage - properly typed
    const results: EvaluationResults = {
      baselineScores: [],
      contextScores: [],
      feedbackScores: [],
      hybridScores: [],
      latencies: {
        baseline: [],
        context: [],
        feedback: [],
        hybrid: [],
      },
    };

    // Test each approach with the test set
    console.log("\n=== Starting Evaluation ===\n");

    for (const test of testSet) {
      console.log(`Testing: "${test.original}" (${test.targetLanguage})`);

      // Initialize context manager for this test
      const contextManager = new ContextManager(test.domain);
      const updatedContext = contextManager.updateContext(test.original);

      // Initialize translation adapter
      const translationAdapter = new TranslationAdapter();

      // 1. Get baseline translation
      const baselineStart = performance.now();
      const baseTranslation = await mockTranslationService(
        test.original,
        test.targetLanguage
      );
      const baselineEnd = performance.now();
      console.log(`Base Translation: "${baseTranslation}"`);
      results.latencies.baseline.push(baselineEnd - baselineStart);

      // 2. Get context-enhanced translation
      const contextStart = performance.now();
      const adaptedTranslation = translationAdapter.adaptTranslation(
        baseTranslation,
        updatedContext,
        test.targetLanguage,
        test.original
      );
      const contextEnd = performance.now();
      console.log(`Context-Enhanced: "${adaptedTranslation.text}"`);
      results.latencies.context.push(contextEnd - contextStart);

      // 3. Get feedback-enhanced translation
      const feedbackStart = performance.now();
      const improvedResult = await feedbackImprover.improveTranslation(
        baseTranslation,
        test.original,
        test.targetLanguage,
        "sim-user-1" // Use a simulated user
      );
      const feedbackEnd = performance.now();
      console.log(`Feedback-Enhanced: "${improvedResult.improvedTranslation}"`);
      results.latencies.feedback.push(feedbackEnd - feedbackStart);

      // 4. Hybrid approach (use the better of context or feedback)
      const hybridStart = performance.now();
      let finalTranslation = baseTranslation;
      let improvementSource = "none";

      // Use adapted translation if context confidence is high
      if (adaptedTranslation.confidence > 0.7) {
        finalTranslation = adaptedTranslation.text;
        improvementSource = "context";
      }

      // Override with feedback-based translation if its confidence is higher
      if (improvedResult.confidence > adaptedTranslation.confidence) {
        finalTranslation = improvedResult.improvedTranslation;
        improvementSource = improvedResult.source;
      }
      const hybridEnd = performance.now();
      console.log(
        `Hybrid Approach (${improvementSource}): "${finalTranslation}"`
      );
      results.latencies.hybrid.push(hybridEnd - hybridStart);

      // Calculate evaluation metrics for each approach
      try {
        // For simplicity, we'll create a "perfect" translation to compare against
        // In a real system, you would have reference translations
        const perfectTranslation = await mockTranslationService(
          test.original,
          test.targetLanguage
        );

        // Evaluate each approach (base, context, feedback, hybrid)
        const baseEval = await evaluateTranslationImprovement(
          test.original,
          perfectTranslation,
          baseTranslation
        );

        const contextEval = await evaluateTranslationImprovement(
          test.original,
          perfectTranslation,
          adaptedTranslation.text
        );

        const feedbackEval = await evaluateTranslationImprovement(
          test.original,
          perfectTranslation,
          improvedResult.improvedTranslation
        );

        const hybridEval = await evaluateTranslationImprovement(
          test.original,
          perfectTranslation,
          finalTranslation
        );

        // Store scores - Fixed all duplicate property names
        results.baselineScores.push({
          semanticSimilarity: baseEval.semanticSimilarity,
          sourceText: test.original,
          translation: baseTranslation,
          language: test.targetLanguage,
        });

        results.contextScores.push({
          semanticSimilarity: contextEval.semanticSimilarity,
          sourceText: test.original,
          translation: adaptedTranslation.text,
          language: test.targetLanguage,
          contexts: adaptedTranslation.contexts,
        });

        results.feedbackScores.push({
          semanticSimilarity: feedbackEval.semanticSimilarity,
          sourceText: test.original,
          translation: improvedResult.improvedTranslation,
          language: test.targetLanguage,
          confidenceScore: improvedResult.confidence,
          improvementSource: improvedResult.source,
        });

        results.hybridScores.push({
          semanticSimilarity: hybridEval.semanticSimilarity,
          sourceText: test.original,
          translation: finalTranslation,
          language: test.targetLanguage,
          improvementSource: improvementSource,
        });

        console.log(
          `Evaluation: Base=${baseEval.semanticSimilarity.toFixed(
            2
          )}, Context=${contextEval.semanticSimilarity.toFixed(
            2
          )}, Feedback=${feedbackEval.semanticSimilarity.toFixed(
            2
          )}, Hybrid=${hybridEval.semanticSimilarity.toFixed(2)}`
        );
      } catch (evalError) {
        console.error("Error during evaluation:", evalError);
      }

      console.log("----------------------------");
    }

    // Calculate averages - properly typed with a more precise function
    const calcAverage = (arr: number[]): number =>
      arr.reduce((a, b) => a + b, 0) / arr.length;

    const avgBaselineScore = calcAverage(
      results.baselineScores.map((r) => r.semanticSimilarity)
    );
    const avgContextScore = calcAverage(
      results.contextScores.map((r) => r.semanticSimilarity)
    );
    const avgFeedbackScore = calcAverage(
      results.feedbackScores.map((r) => r.semanticSimilarity)
    );
    const avgHybridScore = calcAverage(
      results.hybridScores.map((r) => r.semanticSimilarity)
    );

    const avgBaselineLatency = calcAverage(results.latencies.baseline);
    const avgContextLatency = calcAverage(results.latencies.context);
    const avgFeedbackLatency = calcAverage(results.latencies.feedback);
    const avgHybridLatency = calcAverage(results.latencies.hybrid);

    // Print summary
    console.log("\n=== Evaluation Summary ===\n");
    console.log("Semantic Similarity Scores (higher is better):");
    console.log(
      `- Baseline:       ${avgBaselineScore.toFixed(4)} (${(
        avgBaselineScore * 100
      ).toFixed(1)}%)`
    );
    console.log(
      `- Context-Based:  ${avgContextScore.toFixed(4)} (${(
        avgContextScore * 100
      ).toFixed(1)}%)`
    );
    console.log(
      `- Feedback-Based: ${avgFeedbackScore.toFixed(4)} (${(
        avgFeedbackScore * 100
      ).toFixed(1)}%)`
    );
    console.log(
      `- Hybrid:         ${avgHybridScore.toFixed(4)} (${(
        avgHybridScore * 100
      ).toFixed(1)}%)`
    );

    console.log("\nImprovement over Baseline:");
    console.log(
      `- Context-Based:  ${((avgContextScore - avgBaselineScore) * 100).toFixed(
        1
      )}%`
    );
    console.log(
      `- Feedback-Based: ${(
        (avgFeedbackScore - avgBaselineScore) *
        100
      ).toFixed(1)}%`
    );
    console.log(
      `- Hybrid:         ${((avgHybridScore - avgBaselineScore) * 100).toFixed(
        1
      )}%`
    );

    console.log("\nAverage Processing Time:");
    console.log(`- Baseline:       ${avgBaselineLatency.toFixed(2)}ms`);
    console.log(`- Context-Based:  ${avgContextLatency.toFixed(2)}ms`);
    console.log(`- Feedback-Based: ${avgFeedbackLatency.toFixed(2)}ms`);
    console.log(`- Hybrid:         ${avgHybridLatency.toFixed(2)}ms`);

    // Save results to file
    const resultsJson = JSON.stringify(
      {
        summary: {
          semanticSimilarity: {
            baseline: avgBaselineScore,
            context: avgContextScore,
            feedback: avgFeedbackScore,
            hybrid: avgHybridScore,
          },
          improvements: {
            context: avgContextScore - avgBaselineScore,
            feedback: avgFeedbackScore - avgBaselineScore,
            hybrid: avgHybridScore - avgBaselineScore,
          },
          latency: {
            baseline: avgBaselineLatency,
            context: avgContextLatency,
            feedback: avgFeedbackLatency,
            hybrid: avgHybridLatency,
          },
        },
        detailedResults: {
          baseline: results.baselineScores,
          context: results.contextScores,
          feedback: results.feedbackScores,
          hybrid: results.hybridScores,
        },
      },
      null,
      2
    );

    fs.writeFileSync("evaluation-results.json", resultsJson);
    console.log("\nDetailed results saved to evaluation-results.json");
  } catch (error) {
    console.error("Evaluation error:", error);
  } finally {
    process.exit(0);
  }
}

evaluateSystem().catch(console.error);
