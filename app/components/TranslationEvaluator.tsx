'use client'

import { useState } from 'react'
import { evaluate } from '@/lib/utils/translationMetrics'

export default function TranslationEvaluator() {
  const [sourceText, setSourceText] = useState('')
  const [machineTranslation, setMachineTranslation] = useState('')
  const [referenceTranslation, setReferenceTranslation] = useState('')
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleEvaluate = async () => {
    setLoading(true)
    try {
      const evaluationResults = await evaluate(
        sourceText,
        machineTranslation,
        referenceTranslation
      )
      setResults(evaluationResults)
    } catch (error) {
      console.error('Evaluation error:', error)
    }
    setLoading(false)
  }

  return (
    <div className="mt-8 w-full max-w-2xl p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Translation Quality Evaluation</h2>

      {/* Source Text */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Original Text
        </label>
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black"
          rows={4}
          placeholder="Enter the original text..."
        />
      </div>

      {/* Machine Translation */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Machine Translation
        </label>
        <textarea
          value={machineTranslation}
          onChange={(e) => setMachineTranslation(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black"
          rows={4}
          placeholder="Enter the machine translation..."
        />
      </div>

      {/* Reference Translation */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reference Translation (by professional translator)
        </label>
        <textarea
          value={referenceTranslation}
          onChange={(e) => setReferenceTranslation(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black"
          rows={4}
          placeholder="Enter the reference translation..."
        />
      </div>

      {/* Evaluate Button */}
      <button
        onClick={handleEvaluate}
        disabled={loading}
        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 
                 disabled:bg-green-300 disabled:cursor-not-allowed mb-4"
      >
        {loading ? 'Evaluating...' : 'Evaluate Translation'}
      </button>

      {/* Results Display */}
      {results && (
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <h3 className="text-lg font-semibold mb-3">Evaluation Results</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-medium">BLEU Score:</p>
              <p className="text-lg">{results.bleuScore.toFixed(2)}</p>
            </div>
            <div>
              <p className="font-medium">ROUGE Score:</p>
              <p className="text-lg">{results.rougeScore.toFixed(2)}</p>
            </div>
            <div>
              <p className="font-medium">Semantic Similarity:</p>
              <p className="text-lg">{results.semanticScore.toFixed(2)}</p>
            </div>
            <div>
              <p className="font-medium">Error Rate:</p>
              <p className="text-lg">{results.errorRate.toFixed(2)}%</p>
            </div>
          </div>
          
          {/* Detailed Analysis */}
          <div className="mt-4">
            <h4 className="font-medium mb-2">Analysis:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {results.issues.map((issue: string, index: number) => (
                <li key={index} className="text-sm text-gray-700">{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}