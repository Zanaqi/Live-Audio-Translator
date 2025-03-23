import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Edit, Star, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TranslationFeedbackProps {
  originalText: string;
  baseTranslation: string;
  enhancedTranslation: string;
  currentTranslation: string;
  targetLanguage: string;
  roomId: string;
  onFeedbackSubmitted: (feedback: any) => void;
  onTranslationCorrected: (correction: string) => void;
}

export default function TranslationFeedback({
  originalText,
  baseTranslation,
  enhancedTranslation,
  currentTranslation,
  targetLanguage,
  roomId,
  onFeedbackSubmitted,
  onTranslationCorrected,
}: TranslationFeedbackProps) {
  const [rating, setRating] = useState<number>(0);
  const [isEditing, setIsEditing] = useState(false);
  const [correction, setCorrection] = useState(currentTranslation);
  const [selectedTranslation, setSelectedTranslation] = useState<
    "base" | "enhanced" | "custom"
  >(currentTranslation === baseTranslation ? "base" : "enhanced");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRating = (newRating: number) => {
    setRating(newRating);
  };

  const handlePreferenceSelection = (preference: "base" | "enhanced") => {
    setSelectedTranslation(preference);
    setIsEditing(false);
  };

  const startEditing = () => {
    setIsEditing(true);
    setSelectedTranslation("custom");
  };

  const submitFeedback = async () => {
    try {
      // Determine which translation text to use based on selection
      let translationText =
        selectedTranslation === "base"
          ? baseTranslation
          : selectedTranslation === "enhanced"
          ? enhancedTranslation
          : correction;

      // Prepare feedback data
      const feedbackData = {
        originalText,
        baseTranslation,
        enhancedTranslation,
        selectedTranslation: translationText,
        rating,
        corrections: selectedTranslation === "custom" ? correction : undefined,
        roomId,
        targetLanguage,
        timestamp: Date.now(),
        userId: localStorage.getItem("userId") || "anonymous",
      };

      // Send feedback to the server
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(feedbackData),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      // If custom correction, notify parent component
      if (selectedTranslation === "custom") {
        onTranslationCorrected(correction);
      }

      // Notify parent component
      onFeedbackSubmitted(feedbackData);

      // Reset form and show success
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 3000);
    } catch (err) {
      console.error("Error submitting feedback:", err);
      setError(
        err instanceof Error ? err.message : "Failed to submit feedback"
      );
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Help improve translations:
      </h3>

      {/* Translation Preference Selection */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">
          Which translation do you prefer?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handlePreferenceSelection("base")}
            className={`p-2 text-left rounded-md border ${
              selectedTranslation === "base"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:bg-gray-100"
            }`}
          >
            <div className="text-xs text-gray-500">Base Translation:</div>
            <div className="text-sm">{baseTranslation}</div>
          </button>

          <button
            onClick={() => handlePreferenceSelection("enhanced")}
            className={`p-2 text-left rounded-md border ${
              selectedTranslation === "enhanced"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:bg-gray-100"
            }`}
          >
            <div className="text-xs text-gray-500">Enhanced Translation:</div>
            <div className="text-sm">{enhancedTranslation}</div>
          </button>

          {/* Custom Correction Option */}
          <div
            className={`p-2 rounded-md border ${
              selectedTranslation === "custom"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="text-xs text-gray-500">
                Suggest a better translation:
              </div>
              <button
                onClick={startEditing}
                className="text-blue-600 hover:text-blue-800"
              >
                <Edit className="h-4 w-4" />
              </button>
            </div>

            {isEditing ? (
              <div className="mt-2">
                <textarea
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  rows={3}
                />
              </div>
            ) : (
              selectedTranslation === "custom" && (
                <div className="text-sm mt-1">{correction}</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Rating Selection */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Rate this translation:</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleRating(star)}
              className={`p-1 ${
                rating >= star ? "text-yellow-500" : "text-gray-300"
              }`}
            >
              <Star className="h-5 w-5 fill-current" />
            </button>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          onClick={submitFeedback}
          disabled={rating === 0 || feedbackSent}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
        >
          <Send className="h-3.5 w-3.5" />
          {feedbackSent ? "Feedback Sent!" : "Send Feedback"}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
