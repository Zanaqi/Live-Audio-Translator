"use client";

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Dynamically import the translation test page to avoid SSR issues with audio/speech APIs
const TranslationTestPage = dynamic(
  () => import('@/app/components/TranslationTestPage'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Translation Testing Platform...</p>
          <p className="text-gray-500 text-sm mt-2">Initializing audio and speech recognition APIs...</p>
        </div>
      </div>
    )
  }
);

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense 
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading Translation Testing Platform...</p>
            </div>
          </div>
        }
      >
        <TranslationTestPage />
      </Suspense>
    </div>
  );
}