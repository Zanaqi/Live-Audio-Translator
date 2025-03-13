import { debounce } from "lodash";

interface ContextItem {
  value: string;
  confidence: number;
  lastUpdated: number;
}

interface ContextState {
  domain: ContextItem;
  topics: Map<string, ContextItem>;
  conversationHistory: string[];
  keyReferences: Map<string, ContextItem>;
}

export class ContextManager {
  private state: ContextState;
  private readonly MAX_HISTORY: number = 10;
  private readonly CONFIDENCE_DECAY: number = 0.95;
  private readonly DECAY_INTERVAL: number = 60000;
  private readonly MIN_CONFIDENCE: number = 0.3;
  private readonly domainKeywords: Map<string, string[]>;
  private readonly topicKeywords: Map<string, string[]>;
  private readonly analyzeContext: (text: string) => void;
  private decayInterval: NodeJS.Timeout;

  constructor(initialDomain: string) {
    this.state = {
      domain: {
        value: initialDomain || "general",
        confidence: initialDomain ? 0.8 : 0.5,
        lastUpdated: Date.now(),
      },
      topics: new Map<string, ContextItem>(),
      conversationHistory: [],
      keyReferences: new Map<string, ContextItem>(),
    };

    // Domain-specific keyword maps for context detection
    this.domainKeywords = new Map([
      [
        "museum_tour",
        [
          "museum",
          "exhibit",
          "collection",
          "curator",
          "display",
          "gallery",
          "artifact",
          "exhibition",
          "tour",
          "guide",
          "history",
          "historical",
          "showcase",
          "visitor",
          "object",
          "preservation",
          "heritage",
        ],
      ],
      [
        "art_gallery",
        [
          "painting",
          "artist",
          "artwork",
          "canvas",
          "sculpture",
          "masterpiece",
          "gallery",
          "exhibition",
          "portrait",
          "landscape",
          "composition",
          "brush",
          "palette",
          "frame",
          "studio",
          "technique",
          "contemporary",
        ],
      ],
      [
        "historical_site",
        [
          "history",
          "ancient",
          "ruins",
          "century",
          "heritage",
          "civilization",
          "monument",
          "landmark",
          "archaeological",
          "site",
          "historic",
          "era",
          "period",
          "dynasty",
          "empire",
          "kingdom",
          "cultural",
          "preservation",
        ],
      ],
      [
        "architectural_tour",
        [
          "building",
          "architecture",
          "design",
          "structure",
          "architect",
          "facade",
          "construction",
          "style",
          "column",
          "arch",
          "ceiling",
          "dome",
          "foundation",
          "blueprint",
          "restoration",
          "interior",
        ],
      ],
    ]);

    // Topic detection maps
    this.topicKeywords = new Map([
      [
        "renaissance_art",
        [
          "leonardo",
          "da vinci",
          "michelangelo",
          "raphael",
          "renaissance",
          "quattrocento",
          "florence",
          "italy",
          "perspective",
          "realism",
          "humanism",
          "sfumato",
          "fresco",
          "16th century",
          "15th century",
          "mona lisa",
          "last supper",
          "sistine",
          "chapel",
          "virgin",
        ],
      ],
      [
        "modern_art",
        [
          "picasso",
          "contemporary",
          "modern",
          "abstract",
          "expressionism",
          "impressionism",
          "cubism",
          "surrealism",
          "dada",
          "pop art",
          "20th century",
          "avant-garde",
          "installation",
          "conceptual",
        ],
      ],
      [
        "ancient_history",
        [
          "roman",
          "greek",
          "egypt",
          "ancient",
          "archaeology",
          "pharaoh",
          "empire",
          "civilization",
          "artifact",
          "ruin",
          "temple",
          "pyramid",
          "statue",
          "scroll",
          "inscription",
          "mythology",
          "gods",
        ],
      ],
    ]);

    // Debounced context analysis to avoid processing overhead
    this.analyzeContext = debounce(this._analyzeContext.bind(this), 500);

    // Setup decay interval
    this.decayInterval = setInterval(
      () => this.applyConfidenceDecay(),
      this.DECAY_INTERVAL
    );
  }

  // Update context based on new transcript
  public updateContext(transcript: string): ContextState {
    // Add to conversation history
    this.state.conversationHistory.push(transcript);

    // Maintain history size
    if (this.state.conversationHistory.length > this.MAX_HISTORY) {
      this.state.conversationHistory.shift();
    }

    // Analyze the new context
    this.analyzeContext(transcript);

    return this.getState();
  }

  // Get current context state (with deep copy to prevent external modification)
  public getState(): ContextState {
    return {
      domain: { ...this.state.domain },
      topics: new Map(this.state.topics),
      conversationHistory: [...this.state.conversationHistory],
      keyReferences: new Map(this.state.keyReferences),
    };
  }

  // Cleanup on object destruction
  public destroy(): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval);
    }
  }

  // Main context analysis function
  private _analyzeContext(transcript: string): void {
    const lowercaseTranscript = transcript.toLowerCase();

    this.updateDomainContext(lowercaseTranscript);
    this.updateTopicContext(lowercaseTranscript);
    this.extractKeyReferences(lowercaseTranscript);
  }

  // Update domain confidence based on detected keywords
  private updateDomainContext(text: string): void {
    const domainScores = new Map<string, number>();

    // Calculate scores for each domain
    this.domainKeywords.forEach((keywords, domain) => {
      let score = 0;
      keywords.forEach((keyword) => {
        if (text.includes(keyword.toLowerCase())) {
          score += 0.2; // Each keyword match increases confidence
        }
      });

      if (score > 0) {
        domainScores.set(domain, score);
      }
    });

    // Find domain with highest score
    let highestScore = 0;
    let detectedDomain = "";

    domainScores.forEach((score, domain) => {
      if (score > highestScore) {
        highestScore = score;
        detectedDomain = domain;
      }
    });

    // Update domain if a significant match is found
    if (highestScore > 0.2) {
      // Blend with existing confidence
      const currentConfidence = this.state.domain.confidence;
      const newConfidence = Math.min(
        0.95, // Cap at 95%
        currentConfidence + highestScore * (1 - currentConfidence)
      );

      this.state.domain = {
        value: detectedDomain,
        confidence: newConfidence,
        lastUpdated: Date.now(),
      };
    }
  }

  // Update topic context based on detected keywords
  private updateTopicContext(text: string): void {
    this.topicKeywords.forEach((keywords, topic) => {
      let matchCount = 0;

      keywords.forEach((keyword) => {
        if (text.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      });

      if (matchCount > 0) {
        const matchScore = (matchCount / keywords.length) * 0.8;

        // Get existing topic or create new one
        const existingTopic = this.state.topics.get(topic);

        if (existingTopic) {
          // Blend confidences, giving more weight to new evidence
          const newConfidence = Math.min(
            0.95,
            existingTopic.confidence +
              matchScore * (1 - existingTopic.confidence)
          );

          this.state.topics.set(topic, {
            value: topic,
            confidence: newConfidence,
            lastUpdated: Date.now(),
          });
        } else {
          // New topic
          this.state.topics.set(topic, {
            value: topic,
            confidence: matchScore,
            lastUpdated: Date.now(),
          });
        }
      }
    });
  }

  // Extract key reference entities
  private extractKeyReferences(text: string): void {
    // In a real implementation, this would use NER (Named Entity Recognition)
    // For this prototype, we'll use a simple keyword approach

    // List of key names to look for (would be much more comprehensive in production)
    const keyNames = [
      "Leonardo da Vinci",
      "Michelangelo",
      "Picasso",
      "Louvre",
      "Mona Lisa",
    ];

    keyNames.forEach((name) => {
      const nameLower = name.toLowerCase();
      const simplifiedName = name.split(" ")[0].toLowerCase(); // Just the first name

      // Check for full name or first name
      if (text.includes(nameLower) || text.includes(simplifiedName)) {
        // If found full name, high confidence. If just first name, lower confidence
        const confidence = text.includes(nameLower) ? 0.9 : 0.7;

        this.state.keyReferences.set(name, {
          value: name,
          confidence,
          lastUpdated: Date.now(),
        });
      }
    });
  }

  // Apply confidence decay over time
  private applyConfidenceDecay(): void {
    const now = Date.now();

    // Decay domain confidence
    const domainMinutesPassed = (now - this.state.domain.lastUpdated) / 60000;
    this.state.domain.confidence *= Math.pow(
      this.CONFIDENCE_DECAY,
      domainMinutesPassed
    );

    // Decay topic confidences
    this.state.topics.forEach((topic, key) => {
      const minutesPassed = (now - topic.lastUpdated) / 60000;
      topic.confidence *= Math.pow(this.CONFIDENCE_DECAY, minutesPassed);

      // Remove topics below threshold
      if (topic.confidence < this.MIN_CONFIDENCE) {
        this.state.topics.delete(key);
      }
    });

    // Decay key references
    this.state.keyReferences.forEach((ref, key) => {
      const minutesPassed = (now - ref.lastUpdated) / 60000;
      ref.confidence *= Math.pow(this.CONFIDENCE_DECAY, minutesPassed);

      // Remove references below threshold
      if (ref.confidence < this.MIN_CONFIDENCE) {
        this.state.keyReferences.delete(key);
      }
    });
  }

  // Get the most relevant topics
  public getTopTopics(limit = 3): Array<{ topic: string; confidence: number }> {
    const topicArray = Array.from(this.state.topics.entries())
      .map(([topic, data]) => ({
        topic,
        confidence: data.confidence,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return topicArray;
  }

  // Calculate overall confidence of the context
  public getOverallConfidence(): number {
    let contextScore = this.state.domain.confidence * 0.4; // Domain is 40% of context

    // Top 2 topics contribute 40%
    const topTopics = this.getTopTopics(2);
    const topicAvg =
      topTopics.length > 0
        ? topTopics.reduce((sum, t) => sum + t.confidence, 0) / topTopics.length
        : 0;

    contextScore += topicAvg * 0.4;

    // Key references contribute 20%
    const keyRefValues = Array.from(this.state.keyReferences.values());
    const keyRefAvg =
      keyRefValues.length > 0
        ? keyRefValues.reduce((sum, ref) => sum + ref.confidence, 0) /
          keyRefValues.length
        : 0;

    contextScore += keyRefAvg * 0.2;

    return contextScore;
  }
}
