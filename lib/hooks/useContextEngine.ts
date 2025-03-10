import { useState, useEffect, useCallback } from 'react';
import { ContextEngine, ContextData, TourType } from '../utils/contextEngine';

interface UseContextEngineProps {
  initialContext?: Partial<ContextData>;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export function useContextEngine({
  initialContext,
  sourceLanguage = 'en',
  targetLanguage = 'fr'
}: UseContextEngineProps = {}) {
  const [contextEngine] = useState(() => new ContextEngine());
  const [currentContext, setCurrentContext] = useState<ContextData | null>(null);

  useEffect(() => {
    if (initialContext) {
      contextEngine.setContext(initialContext);
      contextEngine.setLanguages(sourceLanguage, targetLanguage);
      setCurrentContext(contextEngine.getCurrentContext());
    }
  }, []);

  const updateContext = useCallback((newContext: Partial<ContextData>) => {
    contextEngine.setContext(newContext);
    setCurrentContext(contextEngine.getCurrentContext());
  }, [contextEngine]);

  const enhanceTranslation = useCallback((
    originalText: string,
    translation: string
  ): string => {
    return contextEngine.enhanceTranslation(originalText, translation);
  }, [contextEngine]);

  const setLanguages = useCallback((source: string, target: string) => {
    contextEngine.setLanguages(source, target);
  }, [contextEngine]);

  return {
    currentContext,
    updateContext,
    enhanceTranslation,
    setLanguages
  };
}