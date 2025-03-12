import { computeSemanticSimilarity } from "./metrics";

export interface TranslationEvaluation {
  semanticSimilarity: number;
  changedWords: number;
  changePercentage: number;
  isSubstantial: boolean;
}

/**
 * Evaluates improvement between base translation and context-enhanced translation
 */
export async function evaluateTranslationImprovement(
  source: string,
  baseTranslation: string,
  contextTranslation: string
): Promise<TranslationEvaluation> {
  // Calculate semantic similarity between the two translations
  const semanticSimilarity = await computeSemanticSimilarity(
    baseTranslation,
    contextTranslation
  );

  // Calculate simple lexical differences
  const baseWords = baseTranslation.split(/\s+/);
  const contextWords = contextTranslation.split(/\s+/);

  // Count word changes
  let changedWords = 0;
  const minLength = Math.min(baseWords.length, contextWords.length);

  for (let i = 0; i < minLength; i++) {
    if (baseWords[i] !== contextWords[i]) {
      changedWords++;
    }
  }

  // Add difference in length
  changedWords += Math.abs(baseWords.length - contextWords.length);

  // Calculate percentage of changes
  const changePercentage =
    (changedWords / Math.max(baseWords.length, contextWords.length)) * 100;

  return {
    semanticSimilarity,
    changedWords,
    changePercentage,
    isSubstantial: changedWords > 2 || changePercentage > 15,
  };
}
