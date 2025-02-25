'use client'

import { useState } from 'react'

export default function ModelFineTuner() {
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('fr')
  const [sourceTexts, setSourceTexts] = useState('')
  const [targetTexts, setTargetTexts] = useState('')
  const [isFineTuning, setIsFineTuning] = useState(false)

  const handleFineTune = async () => {
    setIsFineTuning(true)
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'fine_tune',
          sourceTexts: sourceTexts.split('\n'),
          targetTexts: targetTexts.split('\n'),
          sourceLang,
          targetLang,
        }),
      })

      if (!response.ok) {
        throw new Error('Fine-tuning failed')
      }

      const result = await response.json()
      alert(result.message)
    } catch (error) {
      console.error('Fine-tuning error:', error)
      alert('Fine-tuning failed. Please try again.')
    } finally {
      setIsFineTuning(false)
    }
  }

  return (
    <div className="mt-8 w-full max-w-md">
      <h2 className="text-2xl font-bold mb-4">Model Fine-Tuner</h2>
      <div className="mb-4">
        <label htmlFor="sourceLang" className="block text-sm font-medium text-gray-700 mb-2">
          Source Language
        </label>
        <input
          id="sourceLang"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="targetLang" className="block text-sm font-medium text-gray-700 mb-2">
          Target Language
        </label>
        <input
          id="targetLang"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="sourceTexts" className="block text-sm font-medium text-gray-700 mb-2">
          Source Texts (one per line)
        </label>
        <textarea
          id="sourceTexts"
          value={sourceTexts}
          onChange={(e) => setSourceTexts(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
          rows={4}
        />
      </div>
      <div className="mb-4">
        <label htmlFor="targetTexts" className="block text-sm font-medium text-gray-700 mb-2">
          Target Texts (one per line)
        </label>
        <textarea
          id="targetTexts"
          value={targetTexts}
          onChange={(e) => setTargetTexts(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
          rows={4}
        />
      </div>
      <button
        onClick={handleFineTune}
        disabled={isFineTuning}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 mb-4 disabled:bg-indigo-300"
      >
        {isFineTuning ? 'Fine-tuning...' : 'Fine-tune Model'}
      </button>
    </div>
  )
}
