import { MongoFeedbackStore } from "../lib/utils/FeedbackTranslationImprover";
import connectToDatabase from "../lib/db/mongodb";
import Feedback from "../lib/utils/FeedbackTranslationImprover";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Define the supported languages type
type SupportedLanguage =
  | "French"
  | "Spanish"
  | "German"
  | "Italian"
  | "Chinese";

// Test dataset: Original English phrases with gold-standard translations
const testDataset = [
  {
    original:
      "This painting shows the technique Monet developed for capturing light.",
    goldTranslations: {
      French:
        "Cette peinture montre la technique que Monet a développée pour capturer la lumière.",
      Spanish:
        "Esta pintura muestra la técnica que Monet desarrolló para capturar la luz.",
      German:
        "Dieses Gemälde zeigt die Technik, die Monet zur Erfassung des Lichts entwickelt hat.",
      Italian:
        "Questo dipinto mostra la tecnica che Monet ha sviluppato per catturare la luce.",
      Chinese: "这幅画展示了莫奈为捕捉光线而开发的技术。",
    },
    domain: "art_gallery",
  },
  {
    original:
      "Here you can see one of Leonardo's most famous works from the 15th century.",
    goldTranslations: {
      French:
        "Ici, vous pouvez voir l'une des œuvres les plus célèbres de Léonard de Vinci du XVe siècle.",
      Spanish:
        "Aquí puede ver una de las obras más famosas de Leonardo da Vinci del siglo XV.",
      German:
        "Hier können Sie eines der berühmtesten Werke von Leonardo da Vinci aus dem 15. Jahrhundert sehen.",
      Italian:
        "Qui potete vedere una delle opere più famose di Leonardo da Vinci del XV secolo.",
      Chinese: "在这里，您可以看到列奥纳多·达·芬奇15世纪最著名的作品之一。",
    },
    domain: "museum_tour",
  },
  {
    original:
      "The building was designed in a classical style typical of that period.",
    goldTranslations: {
      French:
        "Le bâtiment a été conçu dans un style classique typique de cette période.",
      Spanish:
        "El edificio fue diseñado en un estilo clásico típico de ese período.",
      German:
        "Das Gebäude wurde in einem für diese Zeit typischen klassischen Stil entworfen.",
      Italian:
        "L'edificio è stato progettato in uno stile classico tipico di quel periodo.",
      Chinese: "这座建筑设计采用了当时典型的古典风格。",
    },
    domain: "architectural_tour",
  },
  // Add more examples as needed
];

// Base translation service simulation (generates slightly flawed translations)
function simulateBaseTranslation(
  original: string,
  language: SupportedLanguage,
  goldTranslation: string
): string {
  // Simulate errors in base translation
  // 1. Incomplete entity names
  let baseTranslation = goldTranslation
    .replace("Leonardo da Vinci", "Leonardo")
    .replace("Léonard de Vinci", "Léonard")
    .replace("Claude Monet", "Monet");

  // 2. Generic terms instead of domain-specific ones
  if (language === "French") {
    baseTranslation = baseTranslation
      .replace("œuvre", "pièce")
      .replace("tableau", "peinture")
      .replace("édifice", "bâtiment");
  } else if (language === "Spanish") {
    baseTranslation = baseTranslation
      .replace("obra", "pieza")
      .replace("edificio", "estructura");
  }

  // 3. Slightly alter 20-40% of translations with minor errors
  if (Math.random() > 0.6) {
    const words = baseTranslation.split(" ");
    const randomIndex = Math.floor(Math.random() * words.length);
    // Skip first and last words to avoid overly obvious errors
    if (randomIndex > 0 && randomIndex < words.length - 1) {
      words.splice(randomIndex, 1); // Remove a word
    }
    baseTranslation = words.join(" ");
  }

  return baseTranslation;
}

// Simulate user feedback patterns
function simulateUserFeedback(
  original: string,
  baseTranslation: string,
  goldTranslation: string,
  language: SupportedLanguage
): {
  selectedTranslation: string;
  rating: number;
  corrections?: string;
} {
  // Calculate similarity between base and gold translations (simple word overlap)
  const baseWords = new Set(baseTranslation.toLowerCase().split(/\s+/));
  const goldWords = new Set(goldTranslation.toLowerCase().split(/\s+/));
  const intersection = new Set([...baseWords].filter((x) => goldWords.has(x)));
  const similarity = intersection.size / goldWords.size;

  // Rating based on translation quality (1-5 scale)
  let rating = Math.round(similarity * 5);
  if (rating < 1) rating = 1;
  if (rating > 5) rating = 5;

  // Simulate different user behaviors
  const userType = Math.random();

  if (userType < 0.3) {
    // Type 1: User always selects base translation (30% of users)
    return {
      selectedTranslation: baseTranslation,
      rating,
    };
  } else if (userType < 0.7) {
    // Type 2: User selects gold standard (40% of users)
    return {
      selectedTranslation: goldTranslation,
      rating: 5,
    };
  } else {
    // Type 3: User makes custom corrections (30% of users)
    // Simulate partial correction (halfway between base and gold)
    const baseWords = baseTranslation.split(" ");
    const goldWords = goldTranslation.split(" ");
    const correctedWords = [];

    // Create a partially corrected translation
    const maxWords = Math.max(baseWords.length, goldWords.length);
    for (let i = 0; i < maxWords; i++) {
      if (i < baseWords.length && i < goldWords.length) {
        // 70% chance to use gold word, 30% to keep base word
        correctedWords.push(Math.random() < 0.7 ? goldWords[i] : baseWords[i]);
      } else if (i < goldWords.length) {
        correctedWords.push(goldWords[i]);
      }
    }

    const correctedTranslation = correctedWords.join(" ");

    return {
      selectedTranslation: correctedTranslation,
      rating: Math.min(rating + 1, 5), // Slightly better rating for custom
      corrections: correctedTranslation,
    };
  }
}

// Main simulation function
async function runFeedbackSimulation() {
  try {
    await connectToDatabase();
    console.log("Connected to database");

    const feedbackStore = new MongoFeedbackStore();

    // Clear previous simulation data
    await Feedback.deleteMany({});
    console.log("Cleared previous simulation data");

    // Create multiple simulated users
    const users = [];
    for (let i = 1; i <= 10; i++) {
      users.push(`sim-user-${i}`);
    }

    // Create multiple simulated room IDs
    const rooms = [
      { id: "sim-room-1", name: "Art Museum Tour" },
      { id: "sim-room-2", name: "Architecture Walk" },
      { id: "sim-room-3", name: "Historical Sites Tour" },
    ];

    // Simulate improvement over time
    const days = 14; // Two weeks of data
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`Generating ${days} days of simulated feedback data...`);

    // Generate a progressively improving system
    let feedbackCount = 0;
    for (let day = 0; day < days; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);

      // More feedback added each day to simulate growing usage
      const dailyFeedbackCount = Math.floor(10 + day * 2);

      for (let i = 0; i < dailyFeedbackCount; i++) {
        // Randomly select data
        const dataItem =
          testDataset[Math.floor(Math.random() * testDataset.length)];
        const room = rooms[Math.floor(Math.random() * rooms.length)];
        const user = users[Math.floor(Math.random() * users.length)];

        // Get a random language from our supported languages
        const languages: SupportedLanguage[] = [
          "French",
          "Spanish",
          "German",
          "Italian",
          "Chinese",
        ];
        const language =
          languages[Math.floor(Math.random() * languages.length)];

        // Get gold translation
        const goldTranslation = dataItem.goldTranslations[language];

        // Generate base translation with some errors
        const baseTranslation = simulateBaseTranslation(
          dataItem.original,
          language,
          goldTranslation
        );

        // Simulate user feedback
        const userFeedback = simulateUserFeedback(
          dataItem.original,
          baseTranslation,
          goldTranslation,
          language
        );

        // Calculate timestamp with random time during the day
        const timestamp = new Date(currentDate);
        timestamp.setHours(Math.floor(Math.random() * 12) + 8); // Between 8am and 8pm
        timestamp.setMinutes(Math.floor(Math.random() * 60));

        // Create feedback entry
        const feedbackEntry = {
          originalText: dataItem.original,
          baseTranslation,
          enhancedTranslation: goldTranslation, // Use gold as the "enhanced" version
          selectedTranslation: userFeedback.selectedTranslation,
          rating: userFeedback.rating,
          corrections: userFeedback.corrections,
          roomId: room.id,
          userId: user,
          targetLanguage: language,
          timestamp: timestamp.getTime(),
        };

        // Store feedback
        await new Feedback(feedbackEntry).save();
        feedbackCount++;

        // Log progress occasionally
        if (feedbackCount % 50 === 0) {
          console.log(`Generated ${feedbackCount} feedback entries...`);
        }
      }
    }

    console.log(
      `Simulation complete! Generated ${feedbackCount} feedback entries over ${days} days.`
    );
  } catch (error) {
    console.error("Simulation error:", error);
  } finally {
    process.exit(0);
  }
}

// Run the simulation
runFeedbackSimulation().catch(console.error);
