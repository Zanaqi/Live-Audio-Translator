// lib/utils/TranslationAdapter.ts
import { ContextState } from './ContextManager';

interface AdaptedTranslation {
  text: string;
  confidence: number;
  contexts: string[];
}

export class TranslationAdapter {
  // Domain-specific term adaptations
  private domainAdaptations: Map<string, Map<string, string[]>> = new Map([
    ['museum_tour', new Map([
      ['piece', ['exhibit', 'artifact', 'item']],
      ['show', ['display', 'present', 'showcase']]
    ])],
    ['art_gallery', new Map([
      ['piece', ['artwork', 'painting', 'masterpiece']],
      ['made', ['created', 'painted', 'composed']]
    ])]
  ]);
  
  // Full name references
  private nameCompletions: Map<string, string> = new Map([
    ['leonardo', 'Leonardo da Vinci'],
    ['michelangelo', 'Michelangelo Buonarroti'],
    ['raphael', 'Raphael Sanzio'],
    ['monet', 'Claude Monet']
  ]);
  
  // Language-specific adaptations (add more languages as needed)
  private languageAdaptations: Map<string, Map<string, Map<string, string>>> = new Map([
    ['French', new Map([
      ['museum_tour', new Map([
        ['pièce', 'œuvre'],
        ['montrer', 'présenter'],
        ['ancien', 'historique']
      ])],
      ['art_gallery', new Map([
        ['pièce', 'tableau'],
        ['travail', 'œuvre'],
        ['faire', 'créer']
      ])]
    ])],
    ['Spanish', new Map([
      ['museum_tour', new Map([
        ['pieza', 'artefacto'],
        ['mostrar', 'exhibir']
      ])]
    ])]
  ]);
  
  constructor() {}
  
  public adaptTranslation(
    baseTranslation: string,
    contextState: ContextState,
    targetLanguage: string,
    sourceText: string
  ): AdaptedTranslation {
    let adaptedText = baseTranslation;
    const usedContexts: string[] = [];
    let adaptationConfidence = 0.5; // Base confidence
    
    // Apply domain-specific adaptations for target language
    if (contextState.domain.confidence > 0.6) {
      const domain = contextState.domain.value;
      usedContexts.push(domain);
      
      const languageMap = this.languageAdaptations.get(targetLanguage);
      if (languageMap) {
        const domainMap = languageMap.get(domain);
        if (domainMap) {
          domainMap.forEach((replacement, original) => {
            // Simple replacement (in a real system, would use more sophisticated parsing)
            const regex = new RegExp(`\\b${original}\\b`, 'gi');
            if (regex.test(adaptedText)) {
              adaptedText = adaptedText.replace(regex, replacement);
              adaptationConfidence += 0.05; // Increase confidence with each successful adaptation
            }
          });
        }
      }
    }
    
    // Add full names for key references
    contextState.keyReferences.forEach((ref, name) => {
      if (ref.confidence > 0.7) {
        const firstName = name.split(' ')[0].toLowerCase();
        const fullName = this.nameCompletions.get(firstName);
        
        if (fullName && baseTranslation.toLowerCase().includes(firstName)) {
          // Replace first name with full name
          const regex = new RegExp(`\\b${firstName}\\b`, 'gi');
          adaptedText = adaptedText.replace(regex, fullName);
          adaptationConfidence += 0.1;
          usedContexts.push(`name_ref:${firstName}`);
        }
      }
    });
    
    // Apply topic-specific adaptations
    const topTopics = Array.from(contextState.topics.entries())
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .slice(0, 2);
      
    topTopics.forEach(([topic, data]) => {
      if (data.confidence > 0.6) {
        usedContexts.push(topic);
        adaptationConfidence += 0.05;
        
        // Add topic-specific adaptations here (simplified example)
        if (topic === 'renaissance_art' && targetLanguage === 'French') {
          adaptedText = adaptedText.replace(/art/gi, 'art de la Renaissance');
        }
      }
    });
    
    // Cap confidence at 0.95
    adaptationConfidence = Math.min(0.95, adaptationConfidence);
    
    return {
      text: adaptedText,
      confidence: adaptationConfidence,
      contexts: usedContexts
    };
  }
}