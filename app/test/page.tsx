import TranslationTestPage from '@/app/components/TranslationTestPage';

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <TranslationTestPage />
    </div>
  );
}

export const metadata = {
  title: 'Translation Model Testing - Audio Translation System',
  description: 'Compare MarianMT vs Google Translate performance with Malay support',
};