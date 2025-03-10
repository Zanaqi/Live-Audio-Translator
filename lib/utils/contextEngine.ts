import { cloneDeep } from 'lodash';

// Types for context data
export interface ContextData {
  tourType: TourType;
  location: string;
  subject: string;
  currentTheme: string;
  timeOfDay?: string;
  audienceType?: 'general' | 'expert' | 'children';
}

export type TourType = 'museum' | 'city' | 'nature' | 'historical' | 'art';

interface DomainTerms {
  [key: string]: {
    translations: { [lang: string]: string };
    context: string;
    usage: string;
  }
}

export class ContextEngine {
  private context: ContextData | null = null;
  private domainVocabulary: Map<TourType, DomainTerms> = new Map();
  private currentLanguage: string = 'en';
  private targetLanguage: string = '';

  constructor() {
    this.initializeDomainVocabularies();
  }

  private initializeDomainVocabularies() {
    // Museum-specific vocabulary
    this.domainVocabulary.set('museum', {
      'exhibit': {
        translations: {
          'fr': 'exposition',
          'es': 'exposición',
          'de': 'Ausstellung',
          'zh': '展览',
          'ja': '展示'
        },
        context: 'display of artifacts or artworks',
        usage: 'formal, cultural'
      },
      'artifact': {
        translations: {
          'fr': 'artéfact',
          'es': 'artefacto',
          'de': 'Artefakt',
          'zh': '文物',
          'ja': '遺物'
        },
        context: 'historical or archaeological object',
        usage: 'formal, academic'
      }
    });

    // Art-specific vocabulary
    this.domainVocabulary.set('art', {
      'composition': {
        translations: {
          'fr': 'composition',
          'es': 'composición',
          'de': 'Komposition',
          'zh': '构图',
          'ja': '構図'
        },
        context: 'arrangement of visual elements',
        usage: 'artistic, technical'
      }
    });

    // Historical tour vocabulary
    this.domainVocabulary.set('historical', {
      'heritage': {
        translations: {
          'fr': 'patrimoine',
          'es': 'patrimonio',
          'de': 'Erbe',
          'zh': '遗产',
          'ja': '遺産'
        },
        context: 'cultural or historical inheritance',
        usage: 'formal, cultural'
      }
    });

    // Add more domain vocabularies as needed
  }

  public setContext(newContext: Partial<ContextData>) {
    this.context = {
      ...this.context,
      ...newContext
    } as ContextData;
  }

  public setLanguages(source: string, target: string) {
    this.currentLanguage = source;
    this.targetLanguage = target;
  }

  public enhanceTranslation(text: string, translation: string): string {
    if (!this.context || !this.targetLanguage) {
      return translation;
    }

    let enhancedTranslation = translation;

    // Get domain-specific vocabulary for current tour type
    const domainTerms = this.domainVocabulary.get(this.context.tourType);
    if (!domainTerms) {
      return translation;
    }

    // Replace generic translations with domain-specific ones
    Object.entries(domainTerms).forEach(([term, data]) => {
      const termRegex = new RegExp(`\\b${term}\\b`, 'gi');
      if (text.match(termRegex)) {
        const domainTranslation = data.translations[this.targetLanguage];
        if (domainTranslation) {
          // Create a regex that matches the general translation of the term
          const generalTranslationRegex = new RegExp(`\\b${term}\\b`, 'gi');
          enhancedTranslation = enhancedTranslation.replace(
            generalTranslationRegex,
            domainTranslation
          );
        }
      }
    });

    // Apply context-specific formatting
    enhancedTranslation = this.applyContextualFormatting(enhancedTranslation);

    return enhancedTranslation;
  }

  private applyContextualFormatting(text: string): string {
    if (!this.context) return text;

    let formattedText = text;

    // Adjust formality based on audience type
    if (this.context.audienceType === 'children') {
      formattedText = this.simplifyLanguage(formattedText);
    } else if (this.context.audienceType === 'expert') {
      formattedText = this.enhanceTechnicalTerms(formattedText);
    }

    // Add context-specific markers
    if (this.context.subject) {
      formattedText = this.addSubjectContext(formattedText);
    }

    return formattedText;
  }

  private simplifyLanguage(text: string): string {
    // Implementation for simplifying language for children
    // This would include replacing complex terms with simpler ones
    return text;
  }

  private enhanceTechnicalTerms(text: string): string {
    // Implementation for enhancing technical terminology for experts
    return text;
  }

  private addSubjectContext(text: string): string {
    // Add contextual information about the current subject
    return text;
  }

  public getCurrentContext(): ContextData | null {
    return this.context ? cloneDeep(this.context) : null;
  }
}