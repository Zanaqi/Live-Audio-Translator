'use client'

import React from 'react';
import { Info } from 'lucide-react';

interface TranslationEvaluation {
  semanticSimilarity: number;
  changedWords: number;
  changePercentage: number;
  isSubstantial: boolean;
}

interface TranslationComparisonProps {
  baseTranslation: string;
  enhancedTranslation: string;
  evaluation: TranslationEvaluation | null;
  showComparison: boolean;
  toggleComparison: () => void;
}

export default function TranslationComparison({
  baseTranslation,
  enhancedTranslation,
  evaluation,
  showComparison,
  toggleComparison
}: TranslationComparisonProps) {
  
  // Function to highlight differences between translations
  const highlightDifferences = (base: string, enhanced: string): React.ReactNode => {
    const baseWords = base.split(/\s+/);
    const enhancedWords = enhanced.split(/\s+/);
    const result: React.ReactNode[] = [];
    
    const maxLength = Math.max(baseWords.length, enhancedWords.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (i < baseWords.length && i < enhancedWords.length) {
        if (baseWords[i] !== enhancedWords[i]) {
          // Highlight different words
          result.push(
            <span key={`diff-${i}`} className="bg-yellow-100 px-1 rounded">
              {enhancedWords[i]}
            </span>
          );
        } else {
          // Keep same words as is
          result.push(<span key={`same-${i}`}>{enhancedWords[i]}</span>);
        }
      } else if (i >= baseWords.length) {
        // New words added in enhanced translation
        result.push(
          <span key={`added-${i}`} className="bg-green-100 px-1 rounded">
            {enhancedWords[i]}
          </span>
        );
      }
      
      // Add spaces between words
      if (i < maxLength - 1) {
        result.push(<span key={`space-${i}`}> </span>);
      }
    }
    
    return <>{result}</>;
  };

  return (
    <div className="mt-3 pt-3 border-t border-teal-100">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-medium text-gray-600 mb-2">Translation Comparison:</h4>
        <button
          onClick={toggleComparison}
          className="flex items-center text-xs text-teal-600 hover:text-teal-800"
        >
          <Info className="h-3 w-3 mr-1" />
          {showComparison ? 'Hide Comparison' : 'Show Comparison'}
        </button>
      </div>
      
      {showComparison && baseTranslation && (
        <div className="space-y-2">
          <div className="bg-white p-2 rounded border border-gray-200">
            <span className="text-xs text-gray-500">Base translation:</span>
            <p className="text-gray-600">{baseTranslation}</p>
          </div>
          
          <div className="bg-white p-2 rounded border border-teal-200">
            <span className="text-xs text-gray-500">Context-enhanced translation:</span>
            <p className="text-gray-700">
              {highlightDifferences(baseTranslation, enhancedTranslation)}
            </p>
          </div>
          
          {evaluation && (
            <div className="bg-gray-50 p-2 rounded border border-gray-200">
              <h5 className="text-xs font-medium text-gray-600 mb-1">Improvement Metrics:</h5>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-gray-500">Words Changed:</span>
                  <span className="text-xs ml-1 font-medium">
                    {evaluation.changedWords} 
                    ({Math.round(evaluation.changePercentage)}%)
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Semantic Similarity:</span>
                  <span className="text-xs ml-1 font-medium">
                    {Math.round(evaluation.semanticSimilarity * 100)}%
                  </span>
                </div>
                <div className="col-span-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    evaluation.isSubstantial 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {evaluation.isSubstantial 
                      ? 'Substantial improvement' 
                      : 'Minor refinement'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}