import React from 'react';
import { ContextData } from '@/lib/utils/contextEngine';

interface TranslationPreviewProps {
  originalText: string;
  translation: string;
  context: ContextData | null;
  language: string;
}

export default function TranslationPreview({
  originalText,
  translation,
  context,
  language
}: TranslationPreviewProps) {
  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900">
          Translation Preview ({language})
        </h3>
        {context && (
          <span className="px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded">
            {context.tourType} Tour
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="p-3 bg-gray-50 rounded">
          <p className="text-sm font-medium text-gray-500">Original Text:</p>
          <p className="text-gray-900">{originalText}</p>
        </div>

        <div className="p-3 bg-indigo-50 rounded">
          <p className="text-sm font-medium text-indigo-700">Enhanced Translation:</p>
          <p className="text-gray-900">{translation}</p>
        </div>

        {context && (
          <div className="mt-4 p-2 bg-gray-50 rounded text-sm">
            <p className="font-medium text-gray-700">Active Context:</p>
            <ul className="mt-1 space-y-1 text-gray-600">
              {context.subject && (
                <li>Subject: {context.subject}</li>
              )}
              {context.location && (
                <li>Location: {context.location}</li>
              )}
              {context.audienceType && (
                <li>Audience: {context.audienceType}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}