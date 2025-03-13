import React, { useState, useEffect } from 'react';
import TranslationMetricsVisualizer from './TranslationMetricsVisualizer';
import { 
  evaluateTranslationImprovement, 
  batchEvaluateTranslations,
  generateEvaluationReport,
  TranslationEvaluationMetrics
} from '@/lib/utils/enhancedTranslationEvaluator';

const exampleTranslations = [
  {
    id: 1,
    domain: "museum_tour",
    source: "Here you can see one of Leonardo's most famous pieces from the 15th century.",
    baseTranslation: "Aquí se puede ver una de las piezas más famosas de Leonardo del siglo XV.",
    adaptedTranslation: "Aquí se puede ver una de las obras más famosas de Leonardo da Vinci del siglo XV.",
    referenceEntities: ["Leonardo da Vinci"]
  },
  {
    id: 2,
    domain: "art_gallery",
    source: "This painting shows the technique Monet developed for capturing light.",
    baseTranslation: "Cette peinture montre la technique que Monet a mise au point pour capturer la lumière.",
    adaptedTranslation: "Cette œuvre montre la technique que Claude Monet a développée pour capturer la lumière.",
    referenceEntities: ["Claude Monet"]
  },
  {
    id: 3,
    domain: "architectural_tour",
    source: "The building was designed in a classical style typical of that period.",
    baseTranslation: "Le bâtiment a été conçu dans un style classique typique de cette période.",
    adaptedTranslation: "L'édifice a été conçu dans un style architectural classique caractéristique de cette période historique.",
    referenceEntities: []
  },
  {
    id: 4,
    domain: "museum_tour",
    source: "This piece is from our collection of ancient Egyptian artifacts.",
    baseTranslation: "この作品は古代エジプトの収集品からのものです。",
    adaptedTranslation: "この展示品は当館の古代エジプト文明のコレクションに含まれる貴重な遺物です。",
    referenceEntities: []
  },
  {
    id: 5,
    domain: "art_gallery",
    source: "The artist made this painting after his journey to the south of France.",
    baseTranslation: "Der Künstler hat dieses Bild nach seiner Reise in den Süden Frankreichs gemacht.",
    adaptedTranslation: "Der Künstler hat dieses Gemälde nach seiner Reise in den Süden Frankreichs erschaffen.",
    referenceEntities: []
  }
];

const TranslationEvaluationDemo = () => {
  const [selectedExample, setSelectedExample] = useState(0);
  const [metrics, setMetrics] = useState<TranslationEvaluationMetrics | null>(null);
  const [aggregateMetrics, setAggregateMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');

  // Evaluate the selected example when it changes
  useEffect(() => {
    const evaluateSelected = async () => {
      if (selectedExample === 0) {
        // Evaluate all examples for aggregate metrics
        setLoading(true);
        try {
          const results = await batchEvaluateTranslations(
            exampleTranslations.map(ex => ({
              source: ex.source,
              baseTranslation: ex.baseTranslation,
              adaptedTranslation: ex.adaptedTranslation,
              domain: ex.domain,
              referenceEntities: ex.referenceEntities
            }))
          );
          setAggregateMetrics(results.aggregateMetrics);
          setMetrics(results.individualResults[0]); // Show first example
        } catch (error) {
          console.error("Evaluation error:", error);
        } finally {
          setLoading(false);
        }
      } else {
        // Evaluate just the selected example
        setLoading(true);
        try {
          const example = exampleTranslations[selectedExample - 1];
          const result = await evaluateTranslationImprovement(
            example.source,
            example.baseTranslation,
            example.adaptedTranslation,
            example.domain,
            example.referenceEntities
          );
          setMetrics(result);
          
          // Generate detailed report
          const report = generateEvaluationReport(
            result,
            example.source,
            example.baseTranslation,
            example.adaptedTranslation
          );
          setReportText(report);
        } catch (error) {
          console.error("Evaluation error:", error);
        } finally {
          setLoading(false);
        }
      }
    };

    evaluateSelected();
  }, [selectedExample]);

  const handleExampleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedExample(parseInt(e.target.value, 10));
    setShowReport(false);
  };

  const toggleReport = () => {
    setShowReport(!showReport);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Translation Evaluation System</h1>
      
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Example Selection</h2>
        
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-1/3">
            <label htmlFor="example-select" className="block mb-2 text-sm font-medium">
              Select Example:
            </label>
            <select
              id="example-select"
              value={selectedExample}
              onChange={handleExampleChange}
              className="w-full p-2 border rounded-md"
            >
              <option value={0}>All Examples (Aggregate Metrics)</option>
              {exampleTranslations.map((ex, index) => (
                <option key={ex.id} value={index + 1}>
                  Example {index + 1}: {ex.domain} ({ex.source.substring(0, 30)}...)
                </option>
              ))}
            </select>
          </div>
          
          {selectedExample > 0 && (
            <div className="w-full md:w-2/3 p-4 bg-gray-50 rounded-md">
              <h3 className="font-medium text-gray-700">Selected Example</h3>
              <p className="mt-2"><strong>Domain:</strong> {exampleTranslations[selectedExample - 1].domain}</p>
              <p className="mt-1"><strong>Source:</strong> {exampleTranslations[selectedExample - 1].source}</p>
              <div className="mt-2">
                <button
                  onClick={toggleReport}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  {showReport ? 'Hide Detailed Report' : 'Show Detailed Report'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {selectedExample === 0 && aggregateMetrics && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Aggregate Metrics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-bold text-blue-800 mb-2">Average Improvement</h3>
              <div className="text-3xl font-bold text-blue-600">
                {(aggregateMetrics.averageImprovementScore * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-bold text-green-800 mb-2">Average Confidence</h3>
              <div className="text-3xl font-bold text-green-600">
                {(aggregateMetrics.averageConfidenceScore * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-bold text-purple-800 mb-2">Substantial Improvements</h3>
              <div className="text-3xl font-bold text-purple-600">
                {aggregateMetrics.percentSubstantial.toFixed(1)}%
              </div>
              <div className="text-sm text-purple-800">of translations</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-700 mb-2">Domain Improvements</h3>
              <p className="text-lg">
                Average terminology improvements: 
                <span className="font-bold ml-2">
                  {aggregateMetrics.averageTerminologyImprovements.toFixed(2)} per translation
                </span>
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-700 mb-2">Entity Completions</h3>
              <p className="text-lg">
                Average entity name completions: 
                <span className="font-bold ml-2">
                  {aggregateMetrics.averageEntityCompletions.toFixed(2)} per translation
                </span>
              </p>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <h3 className="font-bold text-yellow-800 mb-2">Research Conclusions</h3>
            <p className="text-yellow-900">
              Based on analysis of {aggregateMetrics.sampleCount} translations across multiple domains and languages:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-yellow-900">
              <li>
                Context-adapted translations show a {(aggregateMetrics.averageImprovementScore * 100).toFixed(1)}% 
                average improvement over base translations.
              </li>
              <li>
                {aggregateMetrics.percentSubstantial.toFixed(1)}% of translations benefit from substantial improvements
                when context is applied.
              </li>
              <li>
                Domain-specific terminology improves by an average of {aggregateMetrics.averageTerminologyImprovements.toFixed(2)} 
                terms per translation.
              </li>
              <li>
                Entity name handling improves by an average of {aggregateMetrics.averageEntityCompletions.toFixed(2)} 
                completions per translation.
              </li>
            </ul>
          </div>
        </div>
      )}
      
      {showReport && reportText && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Detailed Evaluation Report</h2>
          <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap font-mono text-sm">
            {reportText}
          </div>
        </div>
      )}
      
      {metrics && selectedExample > 0 && (
        <TranslationMetricsVisualizer 
          metrics={metrics}
          sourceText={exampleTranslations[selectedExample - 1].source}
          baseTranslation={exampleTranslations[selectedExample - 1].baseTranslation}
          adaptedTranslation={exampleTranslations[selectedExample - 1].adaptedTranslation}
        />
      )}
    </div>
  );
};

export default TranslationEvaluationDemo;