import {
  computeBLEU,
  computeROUGE,
  computeSemanticSimilarity,
} from "./metrics";

export interface TranslationEvaluationMetrics {
  // Comparison between base and adapted translation
  bleuScore: number; // BLEU score between base and adapted
  rougeScore: number; // ROUGE score between base and adapted
  semanticSimilarity: number; // Semantic similarity between base and adapted

  // Word-level changes
  changedWords: number; // Number of words changed
  addedWords: number; // Words added in adapted translation
  removedWords: number; // Words removed from base translation
  replacedWords: number; // Words replaced (different form/term)
  changePercentage: number; // Overall percentage of text changed

  // Domain-specific improvements
  terminologyImprovements: number; // Count of improved domain-specific terms
  entityCompletions: number; // Count of completed entity names

  // Overall assessment
  isSubstantial: boolean; // Whether the change is substantial
  improvementScore: number; // Overall improvement score (0-1)
  confidenceScore: number; // Confidence in the improvement (0-1)
}

export interface TranslationPair {
  baseTranslation: string;
  adaptedTranslation: string;
}

/**
 * Comprehensive evaluation of improvements between base translation and context-enhanced translation
 */
export async function evaluateTranslationImprovement(
  source: string,
  baseTranslation: string,
  adaptedTranslation: string,
  domainContext?: string,
  referenceEntities?: string[]
): Promise<TranslationEvaluationMetrics> {
  // Calculate traditional metrics
  const bleuScore = computeBLEU(adaptedTranslation, baseTranslation);
  const rougeScore = computeROUGE(adaptedTranslation, baseTranslation);
  const semanticSimilarity = await computeSemanticSimilarity(
    baseTranslation,
    adaptedTranslation
  );

  // Calculate word-level changes
  const {
    changedWords,
    addedWords,
    removedWords,
    replacedWords,
    changePercentage,
  } = calculateWordChanges(baseTranslation, adaptedTranslation);

  // Analyze domain-specific improvements
  const terminologyImprovements = analyzeTerminologyImprovements(
    baseTranslation,
    adaptedTranslation,
    domainContext || "general"
  );

  // Analyze entity completions (like expanding "Leonardo" to "Leonardo da Vinci")
  const entityCompletions = analyzeEntityCompletions(
    baseTranslation,
    adaptedTranslation,
    referenceEntities || []
  );

  // Calculate overall improvement score
  // Weight different factors based on their importance
  const improvementScore = calculateImprovementScore({
    bleuScore,
    rougeScore,
    semanticSimilarity,
    terminologyImprovements,
    entityCompletions,
    changedWords,
  });

  // Determine if changes are substantial
  const isSubstantial =
    changedWords > 2 ||
    changePercentage > 15 ||
    terminologyImprovements > 0 ||
    entityCompletions > 0;

  // Estimated confidence in the improvement
  const confidenceScore = calculateConfidenceScore({
    semanticSimilarity,
    improvementScore,
    terminologyImprovements,
    entityCompletions,
  });

  return {
    bleuScore,
    rougeScore,
    semanticSimilarity,
    changedWords,
    addedWords,
    removedWords,
    replacedWords,
    changePercentage,
    terminologyImprovements,
    entityCompletions,
    isSubstantial,
    improvementScore,
    confidenceScore,
  };
}

/**
 * Detailed analysis of word-level changes between translations
 */
function calculateWordChanges(
  baseTranslation: string,
  adaptedTranslation: string
): {
  changedWords: number;
  addedWords: number;
  removedWords: number;
  replacedWords: number;
  changePercentage: number;
} {
  const baseWords = baseTranslation.split(/\s+/);
  const adaptedWords = adaptedTranslation.split(/\s+/);

  // Create sets for comparison
  const baseWordSet = new Set(baseWords);
  const adaptedWordSet = new Set(adaptedWords);

  // Find unique words in each set
  const uniqueInBase = baseWords.filter((word) => !adaptedWordSet.has(word));
  const uniqueInAdapted = adaptedWords.filter((word) => !baseWordSet.has(word));

  // Count changes
  const addedWords = uniqueInAdapted.length;
  const removedWords = uniqueInBase.length;

  // For replaced words, we need to analyze the differences more carefully
  // Words at the same position but different content are considered replacements
  let replacedWords = 0;
  const minLength = Math.min(baseWords.length, adaptedWords.length);

  for (let i = 0; i < minLength; i++) {
    if (baseWords[i] !== adaptedWords[i]) {
      replacedWords++;
    }
  }

  // Total changed words (replaced + added + removed)
  const changedWords =
    replacedWords + Math.abs(baseWords.length - adaptedWords.length);

  // Calculate change percentage
  const changePercentage =
    (changedWords / Math.max(baseWords.length, adaptedWords.length)) * 100;

  return {
    changedWords,
    addedWords,
    removedWords,
    replacedWords,
    changePercentage,
  };
}

/**
 * Domain glossaries for terminology improvement analysis
 */
const domainGlossaries: Record<string, Record<string, string[]>> = {
  museum_tour: {
    piece: ["exhibit", "artifact", "artwork", "item"],
    show: ["display", "present", "showcase", "exhibit"],
    old: ["ancient", "historical", "antique", "historic"],
  },
  art_gallery: {
    piece: ["artwork", "painting", "masterpiece", "creation"],
    made: ["created", "painted", "composed", "crafted"],
    artist: ["master", "painter", "creator", "maestro"],
  },
  architectural_tour: {
    building: ["structure", "edifice", "construction", "monument"],
    style: ["design", "architecture", "form", "aesthetic"],
    old: ["historic", "period", "classical", "traditional"],
  },
};

/**
 * Analyze improvements in domain terminology
 */
function analyzeTerminologyImprovements(
  baseTranslation: string,
  adaptedTranslation: string,
  domain: string
): number {
  // Default to general domain if specific domain not found
  const domainTerms = domainGlossaries[domain] || {};
  let improvementCount = 0;

  // Check if any general terms in base translation were replaced with domain-specific terms
  Object.entries(domainTerms).forEach(([generalTerm, domainTerms]) => {
    const generalRegex = new RegExp(`\\b${generalTerm}\\b`, "gi");

    // If general term appears in base translation
    if (generalRegex.test(baseTranslation)) {
      // Check if any domain-specific terms appear in adapted translation
      const hasImprovement = domainTerms.some((domainTerm) => {
        const domainRegex = new RegExp(`\\b${domainTerm}\\b`, "gi");
        return domainRegex.test(adaptedTranslation);
      });

      if (hasImprovement) {
        improvementCount++;
      }
    }
  });

  return improvementCount;
}

/**
 * Common entity mappings for name completion analysis
 */
const entityCompletionMap: Record<string, string> = {
  leonardo: "Leonardo da Vinci",
  michelangelo: "Michelangelo Buonarroti",
  raphael: "Raphael Sanzio",
  monet: "Claude Monet",
  picasso: "Pablo Picasso",
  "van gogh": "Vincent van Gogh",
  rembrandt: "Rembrandt van Rijn",
};

/**
 * Analyze entity completions (like expanding "Leonardo" to "Leonardo da Vinci")
 */
function analyzeEntityCompletions(
  baseTranslation: string,
  adaptedTranslation: string,
  referenceEntities: string[]
): number {
  let completionCount = 0;

  // Combine default entity map with any provided reference entities
  const entityMap = { ...entityCompletionMap };

  // Add reference entities to the map if they seem to be name pairs
  referenceEntities.forEach((entity) => {
    const parts = entity.split(" ");
    if (parts.length > 1) {
      const firstName = parts[0].toLowerCase();
      entityMap[firstName] = entity;
    }
  });

  // Check for entity completions
  Object.entries(entityMap).forEach(([partialName, fullName]) => {
    const partialRegex = new RegExp(`\\b${partialName}\\b`, "gi");
    const fullRegex = new RegExp(`\\b${fullName}\\b`, "gi");

    // If partial name in base translation and full name in adapted
    if (
      partialRegex.test(baseTranslation) &&
      !fullRegex.test(baseTranslation) &&
      fullRegex.test(adaptedTranslation)
    ) {
      completionCount++;
    }
  });

  return completionCount;
}

/**
 * Calculate an overall improvement score based on various metrics
 */
function calculateImprovementScore(metrics: {
  bleuScore: number;
  rougeScore: number;
  semanticSimilarity: number;
  terminologyImprovements: number;
  entityCompletions: number;
  changedWords: number;
}): number {
  // Different weights for different factors
  const weights = {
    semanticSimilarity: 0.2, // Semantic similarity is important but not too much
    terminologyImprovements: 0.4, // High weight for domain-specific improvements
    entityCompletions: 0.3, // High weight for entity completions
    changedWords: 0.1, // Small weight for general changes
  };

  // For semantic similarity, we want a balance - not too similar, not too different
  // Optimal is around 0.8-0.9 (similar but with improvements)
  const semanticScore =
    metrics.semanticSimilarity > 0.95
      ? 0.5 // Too similar = not much improvement
      : metrics.semanticSimilarity < 0.7
      ? 0.3 // Too different = possibly wrong
      : 1.0; // Optimal range

  // For terminology and entities, normalize to a 0-1 scale
  const termScore = Math.min(1, metrics.terminologyImprovements * 0.5);
  const entityScore = Math.min(1, metrics.entityCompletions * 0.5);

  // For changed words, we want a moderate number (not too many, not too few)
  const changeScore =
    metrics.changedWords === 0 ? 0 : metrics.changedWords > 10 ? 0.5 : 1.0;

  // Calculate weighted score
  const weightedScore =
    semanticScore * weights.semanticSimilarity +
    termScore * weights.terminologyImprovements +
    entityScore * weights.entityCompletions +
    changeScore * weights.changedWords;

  return weightedScore;
}

/**
 * Calculate confidence in the improvement
 */
function calculateConfidenceScore(metrics: {
  semanticSimilarity: number;
  improvementScore: number;
  terminologyImprovements: number;
  entityCompletions: number;
}): number {
  // Higher confidence for improvements with high semantic similarity
  // This indicates changes are targeted rather than arbitrary
  const semanticFactor = metrics.semanticSimilarity * 0.4;

  // Higher confidence for specific improvements over general changes
  const specificImprovementFactor =
    metrics.terminologyImprovements > 0 || metrics.entityCompletions > 0
      ? 0.4
      : 0.2;

  // General improvement score contribution
  const improvementFactor = metrics.improvementScore * 0.2;

  // Combined confidence score
  const confidence =
    semanticFactor + specificImprovementFactor + improvementFactor;

  // Ensure the result is between 0 and 1
  return Math.min(1, Math.max(0, confidence));
}

/**
 * Generates a summary report for presentation
 */
export function generateEvaluationReport(
  metrics: TranslationEvaluationMetrics,
  source: string,
  baseTranslation: string,
  adaptedTranslation: string
): string {
  const report = [
    `## Translation Evaluation Report`,
    ``,
    `### Source Text:`,
    `"${source}"`,
    ``,
    `### Base Translation:`,
    `"${baseTranslation}"`,
    ``,
    `### Context-Adapted Translation:`,
    `"${adaptedTranslation}"`,
    ``,
    `### Evaluation Metrics:`,
    `- **Improvement Score**: ${(metrics.improvementScore * 100).toFixed(
      1
    )}% (${getImprovementLevel(metrics.improvementScore)})`,
    `- **Confidence Score**: ${(metrics.confidenceScore * 100).toFixed(
      1
    )}% (${getConfidenceLevel(metrics.confidenceScore)})`,
    `- **Semantic Similarity**: ${(metrics.semanticSimilarity * 100).toFixed(
      1
    )}%`,
    `- **BLEU Score**: ${metrics.bleuScore.toFixed(2)}`,
    `- **ROUGE Score**: ${metrics.rougeScore.toFixed(2)}`,
    ``,
    `### Word-Level Changes:`,
    `- **Changed Words**: ${
      metrics.changedWords
    } (${metrics.changePercentage.toFixed(1)}% of text)`,
    `- **Added Words**: ${metrics.addedWords}`,
    `- **Removed Words**: ${metrics.removedWords}`,
    `- **Replaced Words**: ${metrics.replacedWords}`,
    ``,
    `### Domain-Specific Improvements:`,
    `- **Terminology Improvements**: ${metrics.terminologyImprovements}`,
    `- **Entity Completions**: ${metrics.entityCompletions}`,
    ``,
    `### Analysis Summary:`,
    `${generateAnalysisSummary(metrics)}`,
  ].join("\n");

  return report;
}

/**
 * Get text description of improvement level
 */
function getImprovementLevel(score: number): string {
  if (score >= 0.8) return "Excellent";
  if (score >= 0.6) return "Significant";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Minor";
  return "Minimal";
}

/**
 * Get text description of confidence level
 */
function getConfidenceLevel(score: number): string {
  if (score >= 0.8) return "Very High";
  if (score >= 0.6) return "High";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

/**
 * Generate a textual summary of the analysis
 */
function generateAnalysisSummary(
  metrics: TranslationEvaluationMetrics
): string {
  let summary = [];

  if (metrics.isSubstantial) {
    summary.push(
      "The context adaptation has made **substantial improvements** to the translation."
    );
  } else {
    summary.push(
      "The context adaptation has made **minor refinements** to the translation."
    );
  }

  if (metrics.terminologyImprovements > 0) {
    summary.push(
      `The adaptation improved **${metrics.terminologyImprovements} domain-specific terms**, making the translation more accurate in context.`
    );
  }

  if (metrics.entityCompletions > 0) {
    summary.push(
      `The adaptation properly completed **${metrics.entityCompletions} entity names**, enhancing clarity and precision.`
    );
  }

  if (metrics.semanticSimilarity > 0.95) {
    summary.push(
      "The adapted translation preserves the original meaning very closely while making targeted improvements."
    );
  } else if (metrics.semanticSimilarity < 0.7) {
    summary.push(
      "The adaptation makes significant changes to the meaning, which may indicate a substantial reinterpretation based on context."
    );
  }

  return summary.join(" ");
}

/**
 * Batch evaluation for multiple translation pairs
 */
export async function batchEvaluateTranslations(
  evaluationData: Array<{
    source: string;
    baseTranslation: string;
    adaptedTranslation: string;
    domain?: string;
    referenceEntities?: string[];
  }>
): Promise<{
  individualResults: TranslationEvaluationMetrics[];
  aggregateMetrics: {
    averageImprovementScore: number;
    averageConfidenceScore: number;
    percentSubstantial: number;
    averageTerminologyImprovements: number;
    averageEntityCompletions: number;
    sampleCount: number;
  };
}> {
  // Evaluate each translation pair
  const individualResults: TranslationEvaluationMetrics[] = [];

  for (const item of evaluationData) {
    const result = await evaluateTranslationImprovement(
      item.source,
      item.baseTranslation,
      item.adaptedTranslation,
      item.domain,
      item.referenceEntities
    );
    individualResults.push(result);
  }

  // Calculate aggregate metrics
  const sampleCount = individualResults.length;
  const aggregateMetrics = {
    averageImprovementScore:
      individualResults.reduce((sum, item) => sum + item.improvementScore, 0) /
      sampleCount,
    averageConfidenceScore:
      individualResults.reduce((sum, item) => sum + item.confidenceScore, 0) /
      sampleCount,
    percentSubstantial:
      (individualResults.filter((item) => item.isSubstantial).length /
        sampleCount) *
      100,
    averageTerminologyImprovements:
      individualResults.reduce(
        (sum, item) => sum + item.terminologyImprovements,
        0
      ) / sampleCount,
    averageEntityCompletions:
      individualResults.reduce((sum, item) => sum + item.entityCompletions, 0) /
      sampleCount,
    sampleCount,
  };

  return {
    individualResults,
    aggregateMetrics,
  };
}
