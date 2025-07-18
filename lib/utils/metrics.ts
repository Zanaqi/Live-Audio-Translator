interface LanguageConfig {
  segmenter?: any; // Make segmenter optional
  isLatinScript: boolean;
}

interface TranslationMetrics {
  bleuScore: number;
  rougeScore: number;
  semanticScore: number;
  errorRate: number;
  issues: string[];
}

// Check if Intl.Segmenter is available
const hasSegmenterSupport = typeof Intl !== 'undefined' && 'Segmenter' in Intl;

// Fallback tokenizer for when Intl.Segmenter is not available
function fallbackTokenizer(text: string, language: string): string[] {
  if (!text) return [];
  
  // For CJK languages, try to split on common characters
  if (language === 'zh' || language === 'ja' || language === 'ko') {
    // Basic CJK tokenization - split each character for now
    return text.split('').filter(char => char.trim() !== '');
  }
  
  // For Latin scripts, split on whitespace and punctuation
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(token => token.length > 0);
}

// Helper function to tokenize text
function tokenizeText(text: string, language: string): string[] {
  if (!text) return [];
  
  if (hasSegmenterSupport) {
    try {
      const segmenter = new (Intl as any).Segmenter(language, { granularity: "word" });
      return Array.from(segmenter.segment(text)).map((segment: any) => segment.segment);
    } catch (error) {
      console.warn('Intl.Segmenter failed, falling back to basic tokenization:', error);
      return fallbackTokenizer(text, language);
    }
  } else {
    return fallbackTokenizer(text, language);
  }
}

const getLanguageConfig = (language: string): LanguageConfig => {
  switch (language) {
    case "Chinese":
      return {
        segmenter: hasSegmenterSupport ? 'zh' : null,
        isLatinScript: false,
      };
    case "Japanese":
      return {
        segmenter: hasSegmenterSupport ? 'ja' : null,
        isLatinScript: false,
      };
    default:
      return {
        segmenter: hasSegmenterSupport ? 'en' : null,
        isLatinScript: true,
      };
  }
};

export function computeBLEU(
  candidate: string,
  reference: string,
  targetLanguage = "French"
): number {
  try {
    const config = getLanguageConfig(targetLanguage);
    const langCode = config.segmenter || 'en';

    // Tokenize the text using our helper function
    const candidateTokens = tokenizeText(candidate, langCode);
    const referenceTokens = tokenizeText(reference, langCode);

    // Compute n-gram precision for n=1 to 4
    const maxN = 4;
    let totalPrecision = 0;

    for (let n = 1; n <= maxN; n++) {
      const candidateNGrams = getNGrams(candidateTokens, n);
      const referenceNGrams = getNGrams(referenceTokens, n);

      const matches = candidateNGrams.filter((ngram) =>
        referenceNGrams.includes(ngram)
      ).length;

      if (candidateNGrams.length > 0) {
        totalPrecision += matches / candidateNGrams.length;
      }
    }

    // Calculate brevity penalty
    const brevityPenalty = Math.exp(
      1 - Math.max(referenceTokens.length / candidateTokens.length, 1)
    );

    return brevityPenalty * (totalPrecision / maxN) * 100;
  } catch (error) {
    console.error("Error computing BLEU score:", error);
    return 0;
  }
}

export function computeROUGE(
  candidate: string,
  reference: string,
  targetLanguage = "French"
): number {
  try {
    const config = getLanguageConfig(targetLanguage);
    const langCode = config.segmenter || 'en';

    const candidateTokens = tokenizeText(candidate, langCode);
    const referenceTokens = tokenizeText(reference, langCode);

    // Compute ROUGE-L using longest common subsequence
    const lcs = longestCommonSubsequence(candidateTokens, referenceTokens);

    if (referenceTokens.length === 0 || candidateTokens.length === 0) {
      return 0;
    }

    const recall = lcs / referenceTokens.length;
    const precision = lcs / candidateTokens.length;

    if (recall === 0 && precision === 0) {
      return 0;
    }

    // F1 score
    const beta = 1.2;
    const f1 =
      ((1 + beta ** 2) * precision * recall) / (beta ** 2 * precision + recall);

    return f1 * 100;
  } catch (error) {
    console.error("Error computing ROUGE score:", error);
    return 0;
  }
}

export async function computeSemanticSimilarity(
  text1: string,
  text2: string,
  targetLanguage = "French"
): Promise<number> {
  try {
    const config = getLanguageConfig(targetLanguage);
    const langCode = config.segmenter || 'en';

    const words1 = tokenizeText(text1, langCode);
    const words2 = tokenizeText(text2, langCode);

    // Create arrays of unique words
    const uniqueWords1 = Array.from(new Set(words1));
    const uniqueWords2 = Array.from(new Set(words2));

    // Count words that appear in both texts
    const commonWords = uniqueWords1.filter((word) =>
      uniqueWords2.includes(word)
    );

    // Calculate Jaccard similarity
    const unionSize =
      uniqueWords1.length + uniqueWords2.length - commonWords.length;
    
    if (unionSize === 0) return 0;
    
    const similarity = (commonWords.length / unionSize) * 100;

    return similarity;
  } catch (error) {
    console.error("Error computing semantic similarity:", error);
    return 0;
  }
}

export function analyzeTranslation(
  source: string,
  machine: string,
  reference: string,
  targetLanguage = "French"
): { errorRate: number; issues: string[] } {
  try {
    const issues: string[] = [];
    let errorCount = 0;

    const config = getLanguageConfig(targetLanguage);
    const langCode = config.segmenter || 'en';

    // Compare lengths
    const machineSegments = tokenizeText(machine, langCode);
    const referenceSegments = tokenizeText(reference, langCode);

    if (referenceSegments.length === 0) {
      return { errorRate: 100, issues: ["Empty reference translation"] };
    }

    const lengthDiff =
      Math.abs(machineSegments.length - referenceSegments.length) /
      referenceSegments.length;
    
    if (lengthDiff > 0.3) {
      issues.push("Significant length difference from reference translation");
      errorCount++;
    }

    // Check for content preservation
    const missingSegments = referenceSegments.filter(
      (segment) => !machineSegments.includes(segment) && segment.length > 1
    );

    if (missingSegments.length > 0) {
      issues.push("Missing key elements: " + missingSegments.slice(0, 3).join(", "));
      errorCount += Math.min(missingSegments.length, 3); // Cap the error count
    }

    // Check for language-specific issues
    if (!config.isLatinScript) {
      // Add specific checks for non-Latin scripts
      if (machine.match(/[a-zA-Z]/)) {
        issues.push("Contains untranslated Latin characters");
        errorCount++;
      }
    }

    const errorRate = Math.min(100, (errorCount / referenceSegments.length) * 100);
    return { errorRate, issues };
  } catch (error) {
    console.error("Error analyzing translation:", error);
    return { errorRate: 100, issues: ["Error analyzing translation"] };
  }
}

// Helper functions
function getNGrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(" "));
  }
  return ngrams;
}

function longestCommonSubsequence(str1: string[], str2: string[]): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}

export function evaluateTranslation(
  source: string,
  machine: string,
  reference: string,
  targetLanguage = "French"
): TranslationMetrics {
  try {
    const bleuScore = computeBLEU(machine, reference, targetLanguage);
    const rougeScore = computeROUGE(machine, reference, targetLanguage);
    
    // Handle the async semantic similarity
    let semanticScore = 0;
    computeSemanticSimilarity(machine, reference, targetLanguage)
      .then(score => semanticScore = score)
      .catch(error => {
        console.error("Error computing semantic similarity:", error);
        semanticScore = 0;
      });

    const { errorRate, issues } = analyzeTranslation(
      source,
      machine,
      reference,
      targetLanguage
    );

    return {
      bleuScore,
      rougeScore,
      semanticScore,
      errorRate,
      issues,
    };
  } catch (error) {
    console.error("Error evaluating translation:", error);
    return {
      bleuScore: 0,
      rougeScore: 0,
      semanticScore: 0,
      errorRate: 100,
      issues: ["Error evaluating translation"],
    };
  }
}

// This creates compatible exports for CommonJS
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeBLEU,
    computeROUGE,
    computeSemanticSimilarity,
    analyzeTranslation,
    evaluateTranslation,
  };
}