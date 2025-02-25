'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TranslationBridge } from '@/lib/services/TranslationBridge'
import { debounce } from 'lodash'

export default function TranslationTester() {
  const [inputText, setInputText] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('French')
  const [translation, setTranslation] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bridgeRef = useRef<TranslationBridge | null>(null)

  const cleanupBridge = () => {
    if (bridgeRef.current) {
      bridgeRef.current.disconnect()
      bridgeRef.current = null
    }
  }

  // Create a debounced translation function
  const debouncedTranslate = useCallback(
    debounce(async (text: string, language: string) => {
      if (!text.trim()) {
        setTranslation('')
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const bridge = new TranslationBridge()
        bridgeRef.current = bridge

        const handleTranslation = (data: any) => {
          setTranslation(data.translation || '')
          setIsLoading(false)
          cleanupBridge()
        }

        const handleError = (err: any) => {
          setError('Translation failed. Please try again.')
          setIsLoading(false)
          cleanupBridge()
        }

        bridge.once('translation', handleTranslation)
        bridge.once('error', handleError)

        bridge.once('connected', async () => {
          try {
            const textBlob = new Blob([text], { type: 'text/plain' })
            await bridge.translate(textBlob, language)
          } catch (err) {
            handleError(err)
          }
        })
      } catch (err) {
        setError('Failed to initialize translation service')
        setIsLoading(false)
        cleanupBridge()
      }
    }, 500), // 500ms delay
    []
  )

  // Effect to trigger translation when text or language changes
  useEffect(() => {
    debouncedTranslate(inputText, targetLanguage)
    
    return () => {
      debouncedTranslate.cancel()
      cleanupBridge()
    }
  }, [inputText, targetLanguage, debouncedTranslate])

  const handleClear = () => {
    setInputText('')
    setTranslation('')
    setError(null)
    cleanupBridge()
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-black">Translation Tester</h2>
      
      <div className="mb-4">
        <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700 mb-2">
          Target Language
        </label>
        <select
          id="targetLanguage"
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
                    focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
        >
          <option value="Chinese">Chinese (Mandarin)</option>
          <option value="French">French</option>
          <option value="Spanish">Spanish</option>
          <option value="German">German</option>
          <option value="Italian">Italian</option>
          <option value="Japanese">Japanese</option>
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor="inputText" className="block text-sm font-medium text-gray-700 mb-2">
          Text to Translate
        </label>
        <textarea
          id="inputText"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter text to translate..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
                   focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 
                   text-black min-h-[100px]"
        />
      </div>

      <div className="flex gap-3 mb-4">
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-md">
          Translating...
        </div>
      )}

      {translation && (
        <div className="p-4 bg-gray-50 rounded-md">
          <h3 className="text-lg font-semibold mb-2">Translation:</h3>
          <p className="text-gray-800">{translation}</p>
        </div>
      )}
    </div>
  )
}