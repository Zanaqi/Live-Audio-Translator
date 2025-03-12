import {
  computeBLEU,
  computeROUGE,
  computeSemanticSimilarity,
  analyzeTranslation,
} from "./metrics";

export async function evaluate(
  sourceText: string,
  machineTranslation: string,
  referenceTranslation: string
) {
  const bleuScore = computeBLEU(machineTranslation, referenceTranslation);
  const rougeScore = computeROUGE(machineTranslation, referenceTranslation);
  const semanticScore = await computeSemanticSimilarity(
    machineTranslation,
    referenceTranslation
  );

  // Calculate error rate and identify issues
  const { errorRate, issues } = analyzeTranslation(
    sourceText,
    machineTranslation,
    referenceTranslation
  );

  return {
    bleuScore,
    rougeScore,
    semanticScore,
    errorRate,
    issues,
  };
}
