import fetch from "node-fetch";

interface TranslationResponse {
  translation?: string;
  error?: string;
}

export async function translateText(
  text: string,
  targetLanguage: string
): Promise<string> {
  try {
    // Connect directly to the Python translation service
    const response = await fetch("http://localhost:5000/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        targetLanguage,
        context: "",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = (await response.json()) as TranslationResponse;
    return result.translation || "";
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
}
