// File: lib/utils/translationMetrics.ts
import { 
    computeBLEU, 
    computeROUGE, 
    computeSemanticSimilarity, 
    analyzeTranslation 
  } from './metrics'
  
  export async function evaluate(
    sourceText: string,
    machineTranslation: string,
    referenceTranslation: string
  ) {
    // Compute BLEU score
    const bleuScore = computeBLEU(machineTranslation, referenceTranslation)
  
    // Compute ROUGE score
    const rougeScore = computeROUGE(machineTranslation, referenceTranslation)
  
    // Compute semantic similarity
    const semanticScore = await computeSemanticSimilarity(
      machineTranslation,
      referenceTranslation
    )
  
    // Calculate error rate and identify issues
    const { errorRate, issues } = analyzeTranslation(
      sourceText,
      machineTranslation,
      referenceTranslation
    )
  
    return {
      bleuScore,
      rougeScore,
      semanticScore,
      errorRate,
      issues
    }
  }