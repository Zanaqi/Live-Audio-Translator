'use client'

import { useState, useEffect, useCallback } from 'react'
import { debounce } from 'lodash'
import { TranslationBridge } from '@/lib/services/TranslationBridge'

interface TranslatorProps {
  transcript: string | null;
}

export default function Translator({ transcript }: TranslatorProps) {
  // State management
  const [translation, setTranslation] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('French')
  const [inputText, setInputText] = useState(transcript || '')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPinyin, setShowPinyin] = useState(false)
  const [translationBridge, setTranslationBridge] = useState<TranslationBridge | null>(null)

  // Update input text when transcript changes
  useEffect(() => {
    setInputText(transcript || '')
  }, [transcript])

  // Initialize TranslationBridge
  useEffect(() => {
    const bridge = new TranslationBridge();
    
    bridge.on('connected', () => {
      console.log('Connected to translation service');
      setError(null);
    });

    bridge.on('error', (err) => {
      console.error('Translation error:', err);
      setError('Translation service error. Please try again.');
      setIsTranslating(false);
    });

    setTranslationBridge(bridge);

    return () => {
      bridge.disconnect();
    };
  }, []);

  // Debounced translation function
  const debouncedTranslate = useCallback(
    debounce(async (text: string, targetLang: string) => {
      if (!text) return;

      setIsTranslating(true);
      setError(null);

      try {
        if (!translationBridge) {
          throw new Error('Translation service not initialized');
        }

        const textBlob = new Blob([text], { type: 'text/plain' });
        await translationBridge.translate(textBlob, targetLang);
      } catch (error) {
        console.error('Translation error:', error);
        setError('Translation failed. Please try again.');
      } finally {
        setIsTranslating(false);
      }
    }, 300),
    [translationBridge]
  );

  // Handle language change
  const handleTargetLanguageChange = (newLanguage: string) => {
    setTargetLanguage(newLanguage);
    setTranslation('');
    if (inputText) {
      debouncedTranslate(inputText, newLanguage);
    }
  };

  // Text-to-speech functionality
  const speakTranslation = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(translation);
      utterance.lang = getLanguageCode(targetLanguage);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      speechSynthesis.speak(utterance);
    } else {
      setError('Text-to-speech is not supported in your browser.');
    }
  };

  // Get language code for speech synthesis
  const getLanguageCode = (language: string): string => {
    const languageCodes: { [key: string]: string } = {
      'French': 'fr-FR',
      'Spanish': 'es-ES',
      'German': 'de-DE',
      'Italian': 'it-IT',
      'Japanese': 'ja-JP',
      'Chinese': 'zh-CN'
    };
    return languageCodes[language] || 'en-US';
  };

  // Render Chinese translation with optional Pinyin
  const renderChineseTranslation = (text: string) => {
    if (targetLanguage === 'Chinese') {
      return (
        <div>
          <p className="text-gray-800">{text}</p>
          {showPinyin && (
            <p className="text-sm text-gray-600 mt-2">
              {/* Pinyin would be generated here */}
              Pinyin display (to be implemented)
            </p>
          )}
          <button
            onClick={() => setShowPinyin(!showPinyin)}
            className="mt-2 px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
          >
            {showPinyin ? 'Hide' : 'Show'} Pinyin
          </button>
        </div>
      );
    }
    return <p className="text-gray-800">{text}</p>;
  };

  return (
    <div className="mt-8 w-full max-w-md">
      <h2 className="text-2xl font-bold mb-4">Translator</h2>
      
      {/* Input Section */}
      <div className="mb-4">
        <label htmlFor="inputText" className="block text-sm font-medium text-gray-700 mb-2">
          Text to Translate
        </label>
        <textarea
          id="inputText"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            debouncedTranslate(e.target.value, targetLanguage);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
                   focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
          rows={4}
          placeholder="Enter text to translate or use the recorded transcript"
        />
      </div>

      {/* Language Selection */}
      <div className="mb-4">
        <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-700 mb-2">
          Target Language
        </label>
        <select
          id="targetLanguage"
          value={targetLanguage}
          onChange={(e) => handleTargetLanguageChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
                   focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-black"
        >
          <option value="French">French</option>
          <option value="Spanish">Spanish</option>
          <option value="German">German</option>
          <option value="Italian">Italian</option>
          <option value="Japanese">Japanese</option>
          <option value="Chinese">Chinese (Mandarin)</option>
        </select>
      </div>

      {/* Status and Error Messages */}
      {isTranslating && (
        <div className="mb-4 text-gray-500">
          Translating...
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {/* Translation Output */}
      {translation && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="text-lg font-semibold mb-2">Translation:</h3>
          {renderChineseTranslation(translation)}
          
          <button
            onClick={speakTranslation}
            disabled={isSpeaking}
            className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 
                     disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSpeaking ? 'Speaking...' : 'Speak Translation'}
          </button>
        </div>
      )}
    </div>
  );
}