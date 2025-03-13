import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

// Interface for evaluation metrics
interface TranslationEvaluationMetrics {
  bleuScore: number;
  rougeScore: number;
  semanticSimilarity: number;
  changedWords: number;
  addedWords: number;
  removedWords: number;
  replacedWords: number;
  changePercentage: number;
  terminologyImprovements: number;
  entityCompletions: number;
  isSubstantial: boolean;
  improvementScore: number;
  confidenceScore: number;
}

interface TranslationVisualizerProps {
  metrics: TranslationEvaluationMetrics;
  sourceText: string;
  baseTranslation: string;
  adaptedTranslation: string;
}

const TranslationMetricsVisualizer: React.FC<TranslationVisualizerProps> = ({
  metrics,
  sourceText,
  baseTranslation,
  adaptedTranslation,
}) => {
  const [activeTab, setActiveTab] = useState("overview");

  // Prepare data for charts
  const scoreData = [
    { name: "Improvement", value: metrics.improvementScore * 100 },
    { name: "Confidence", value: metrics.confidenceScore * 100 },
    { name: "Semantic Similarity", value: metrics.semanticSimilarity * 100 },
  ];

  const wordChangeData = [
    { name: "Added", value: metrics.addedWords },
    { name: "Removed", value: metrics.removedWords },
    { name: "Replaced", value: metrics.replacedWords },
  ];

  const domainImprovementData = [
    { name: "Terminology", value: metrics.terminologyImprovements },
    { name: "Entity Names", value: metrics.entityCompletions },
  ];

  const radarData = [
    {
      subject: "BLEU",
      A: metrics.bleuScore * 10, // Scale to 0-100
      fullMark: 100,
    },
    {
      subject: "ROUGE",
      A: metrics.rougeScore * 10, // Scale to 0-100
      fullMark: 100,
    },
    {
      subject: "Semantic",
      A: metrics.semanticSimilarity * 100,
      fullMark: 100,
    },
    {
      subject: "Domain Terms",
      A: Math.min(100, metrics.terminologyImprovements * 20), // Scale up for visibility
      fullMark: 100,
    },
    {
      subject: "Entity Names",
      A: Math.min(100, metrics.entityCompletions * 20), // Scale up for visibility
      fullMark: 100,
    },
    {
      subject: "Overall",
      A: metrics.improvementScore * 100,
      fullMark: 100,
    },
  ];

  // Helper function to highlight differences between texts
  const highlightDifferences = (base: string, adapted: string) => {
    const baseWords = base.split(/\s+/);
    const adaptedWords = adapted.split(/\s+/);
    const maxLength = Math.max(baseWords.length, adaptedWords.length);

    const result = [];

    for (let i = 0; i < maxLength; i++) {
      if (i < adaptedWords.length) {
        if (i >= baseWords.length || baseWords[i] !== adaptedWords[i]) {
          // This word is new or changed
          result.push(
            <span
              key={i}
              className="px-1 rounded bg-green-100 text-green-800 font-medium"
            >
              {adaptedWords[i]}
            </span>
          );
        } else {
          // Same word
          result.push(<span key={i}>{adaptedWords[i]}</span>);
        }

        // Add space except after the last word
        if (i < adaptedWords.length - 1) {
          result.push(<span key={`space-${i}`}> </span>);
        }
      }
    }

    return <>{result}</>;
  };

  // Function to get improvement level text
  const getImprovementLevel = (score: number): string => {
    if (score >= 0.8) return "Excellent";
    if (score >= 0.6) return "Significant";
    if (score >= 0.4) return "Moderate";
    if (score >= 0.2) return "Minor";
    return "Minimal";
  };

  // Function to get confidence level text
  const getConfidenceLevel = (score: number): string => {
    if (score >= 0.8) return "Very High";
    if (score >= 0.6) return "High";
    if (score >= 0.4) return "Moderate";
    if (score >= 0.2) return "Low";
    return "Very Low";
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        Translation Evaluation Metrics
      </h2>

      {/* Tab Navigation */}
      <div className="flex border-b mb-4">
        <button
          className={`px-4 py-2 ${
            activeTab === "overview"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-600"
          }`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === "details"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-600"
          }`}
          onClick={() => setActiveTab("details")}
        >
          Detailed Metrics
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === "comparison"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-600"
          }`}
          onClick={() => setActiveTab("comparison")}
        >
          Text Comparison
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === "analysis"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-600"
          }`}
          onClick={() => setActiveTab("analysis")}
        >
          Analysis
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-bold text-blue-800 mb-2">
                Improvement Score
              </h3>
              <div className="text-3xl font-bold text-blue-600">
                {(metrics.improvementScore * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-blue-800">
                {getImprovementLevel(metrics.improvementScore)}
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-bold text-green-800 mb-2">
                Confidence Score
              </h3>
              <div className="text-3xl font-bold text-green-600">
                {(metrics.confidenceScore * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-green-800">
                {getConfidenceLevel(metrics.confidenceScore)}
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-bold text-purple-800 mb-2">
                Semantic Similarity
              </h3>
              <div className="text-3xl font-bold text-purple-600">
                {(metrics.semanticSimilarity * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-purple-800">
                {metrics.semanticSimilarity > 0.9
                  ? "Very High"
                  : metrics.semanticSimilarity > 0.8
                  ? "High"
                  : metrics.semanticSimilarity > 0.7
                  ? "Moderate"
                  : "Low"}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-gray-700 mb-2">
              Performance Summary
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  data={radarData}
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis domain={[0, 100]} />
                  <Radar
                    name="Translation Quality"
                    dataKey="A"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.6}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="text-sm text-gray-600 mt-4">
            {metrics.isSubstantial ? (
              <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                This translation shows <strong>substantial improvements</strong>{" "}
                with context adaptation.
              </div>
            ) : (
              <div className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg">
                This translation shows <strong>refinements</strong> with context
                adaptation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Metrics Tab */}
      {activeTab === "details" && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold text-gray-700 mb-2">
                Improvement Scores
              </h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      formatter={(value) => [`${(value as number).toFixed(1)}%`, "Score"]}
                    />
                    <Legend />
                    <Bar dataKey="value" name="Score (%)" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-700 mb-2">Word Changes</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={wordChangeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" name="Count" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="font-bold text-gray-700 mb-2">
              Domain-Specific Improvements
            </h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={domainImprovementData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Count" fill="#ffc658" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="font-semibold text-gray-700">BLEU Score</h3>
              <p className="text-xl font-bold">
                {metrics.bleuScore.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="font-semibold text-gray-700">ROUGE Score</h3>
              <p className="text-xl font-bold">
                {metrics.rougeScore.toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="font-semibold text-gray-700">Changed Words</h3>
              <p className="text-xl font-bold">
                {metrics.changedWords} ({metrics.changePercentage.toFixed(1)}%)
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="font-semibold text-gray-700">
                Substantial Change
              </h3>
              <p className="text-xl font-bold">
                {metrics.isSubstantial ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Text Comparison Tab */}
      {activeTab === "comparison" && (
        <div>
          <div className="mb-6">
            <h3 className="font-bold text-gray-700 mb-2">Source Text</h3>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-800">{sourceText}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="font-bold text-gray-700 mb-2">Base Translation</h3>
              <div className="p-4 bg-gray-50 rounded-lg h-full">
                <p className="text-gray-800">{baseTranslation}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-700 mb-2">
                Context-Adapted Translation
              </h3>
              <div className="p-4 bg-blue-50 rounded-lg h-full">
                <p className="text-gray-800">
                  {highlightDifferences(baseTranslation, adaptedTranslation)}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-gray-700 mb-2">
              Word-by-Word Changes
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 bg-gray-100 border text-left">
                      Change Type
                    </th>
                    <th className="p-2 bg-gray-100 border text-left">Count</th>
                    <th className="p-2 bg-gray-100 border text-left">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border">Added Words</td>
                    <td className="p-2 border">{metrics.addedWords}</td>
                    <td className="p-2 border">
                      Words that appear only in the adapted translation
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border">Removed Words</td>
                    <td className="p-2 border">{metrics.removedWords}</td>
                    <td className="p-2 border">
                      Words that appear only in the base translation
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border">Replaced Words</td>
                    <td className="p-2 border">{metrics.replacedWords}</td>
                    <td className="p-2 border">
                      Words that appear in both but were changed
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border font-bold">Total Changes</td>
                    <td className="p-2 border font-bold">
                      {metrics.changedWords}
                    </td>
                    <td className="p-2 border">
                      {metrics.changePercentage.toFixed(1)}% of the text was
                      changed
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Tab */}
      {activeTab === "analysis" && (
        <div>
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="font-bold text-blue-800 mb-2">Quality Analysis</h3>
            <p className="mb-2">
              {metrics.isSubstantial
                ? "This translation shows substantial improvements with context adaptation."
                : "This translation shows refinements with context adaptation."}
            </p>

            <div className="mt-4">
              <h4 className="font-semibold text-blue-700">Key Findings:</h4>
              <ul className="list-disc pl-5 space-y-1 text-blue-900">
                {metrics.terminologyImprovements > 0 && (
                  <li>
                    Improved {metrics.terminologyImprovements} domain-specific
                    terms, making the translation more contextually accurate.
                  </li>
                )}
                {metrics.entityCompletions > 0 && (
                  <li>
                    Properly completed {metrics.entityCompletions} entity names,
                    enhancing clarity and precision.
                  </li>
                )}
                {metrics.semanticSimilarity > 0.9 && (
                  <li>
                    Maintained excellent semantic similarity (
                    {(metrics.semanticSimilarity * 100).toFixed(1)}%) while
                    making targeted improvements.
                  </li>
                )}
                {metrics.changePercentage > 15 && (
                  <li>
                    Made significant changes (
                    {metrics.changePercentage.toFixed(1)}% of text) to improve
                    contextual relevance.
                  </li>
                )}
                {metrics.changePercentage <= 15 &&
                  metrics.changePercentage > 5 && (
                    <li>
                      Made targeted changes (
                      {metrics.changePercentage.toFixed(1)}% of text) to
                      specific elements requiring adaptation.
                    </li>
                  )}
                {metrics.changePercentage <= 5 && (
                  <li>
                    Made minimal but precise changes (
                    {metrics.changePercentage.toFixed(1)}% of text) where
                    needed.
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-bold text-green-800 mb-2">Strengths</h3>
              <ul className="list-disc pl-5 space-y-1 text-green-900">
                {metrics.terminologyImprovements > 0 && (
                  <li>Better domain-specific terminology</li>
                )}
                {metrics.entityCompletions > 0 && (
                  <li>More complete and accurate named entities</li>
                )}
                {metrics.semanticSimilarity > 0.85 && (
                  <li>Preserved core meaning while improving specificity</li>
                )}
                {metrics.improvementScore > 0.6 && (
                  <li>High overall improvement quality</li>
                )}
              </ul>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg">
              <h3 className="font-bold text-amber-800 mb-2">Limitations</h3>
              <ul className="list-disc pl-5 space-y-1 text-amber-900">
                {metrics.semanticSimilarity < 0.8 && (
                  <li>Significant semantic drift from original translation</li>
                )}
                {metrics.confidenceScore < 0.6 && (
                  <li>Medium confidence in improvements</li>
                )}
                {metrics.changePercentage > 30 && (
                  <li>Large number of changes that may alter tone</li>
                )}
                {metrics.terminologyImprovements === 0 &&
                  metrics.entityCompletions === 0 && (
                    <li>
                      No specific domain terminology or entity improvements
                      detected
                    </li>
                  )}
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-indigo-50 p-4 rounded-lg">
            <h3 className="font-bold text-indigo-800 mb-2">
              Research Significance
            </h3>
            <p className="text-indigo-900">
              This example{" "}
              {metrics.improvementScore > 0.6 ? "strongly" : "moderately"}{" "}
              demonstrates the value of context-enhanced translation. The
              context adaptation
              {metrics.terminologyImprovements > 0 ||
              metrics.entityCompletions > 0
                ? " specifically improved domain-relevant elements"
                : " made general improvements"}
              while{" "}
              {metrics.semanticSimilarity > 0.9
                ? "maintaining excellent semantic fidelity."
                : metrics.semanticSimilarity > 0.8
                ? "preserving the core meaning."
                : "somewhat altering the original meaning."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationMetricsVisualizer;
