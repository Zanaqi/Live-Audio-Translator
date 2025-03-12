"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Languages,
  Settings,
} from "lucide-react";

export default function TranslationInterface() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("zh");
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const audioRef = useRef(null);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/python-bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "translate",
          text: inputText,
          targetLanguage: targetLanguage,
        }),
      });

      const data = await response.json();
      if (data.error) {
        console.error("Translation error:", data.error);
        return;
      }

      setTranscript(inputText);
      setTranslation(data.translation);
    } catch (error) {
      console.error("Translation failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Main container */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white">
          <h1 className="text-2xl font-bold">Museum Guide Translator</h1>
          <p className="text-indigo-100">
            Real-time translation for museum tours
          </p>
        </div>

        {/* Language Selection */}
        <div className="flex justify-between p-4 border-b">
          <div className="flex items-center space-x-4">
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="border rounded-lg px-3 py-2 text-gray-700"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>

            <Languages className="w-6 h-6 text-gray-400" />

            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="border rounded-lg px-3 py-2 text-gray-700"
            >
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
            </select>
          </div>

          <button
            className="p-2 hover:bg-gray-100 rounded-full"
            onClick={() => {
              /* Add settings handler */
            }}
          >
            <Settings className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-2 gap-6 p-6">
          {/* Source Language Panel */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">
              Original Audio
            </h2>
            <div className="border rounded-lg p-4 min-h-[200px] bg-gray-50">
              <p className="text-gray-600">
                {transcript || "Transcript will appear here..."}
              </p>
            </div>

            {/* Recording Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={toggleRecording}
                className={`p-4 rounded-full ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-indigo-500 hover:bg-indigo-600"
                } text-white transition-colors`}
              >
                {isRecording ? (
                  <MicOff className="w-6 h-6" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>
            </div>

            {/* Text Input for Testing */}
            <div className="space-y-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type text to translate..."
                className="w-full p-2 border rounded-lg h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleTranslate}
                disabled={!inputText.trim() || isLoading}
                className="w-full py-2 px-4 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Translating..." : "Translate"}
              </button>
            </div>
          </div>

          {/* Target Language Panel */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Translation</h2>
            <div className="border rounded-lg p-4 min-h-[200px] bg-gray-50">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                </div>
              ) : (
                <p className="text-gray-600">
                  {translation || "Translation will appear here..."}
                </p>
              )}
            </div>

            {/* Playback Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={togglePlayback}
                className={`p-4 rounded-full ${
                  isPlaying
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-indigo-500 hover:bg-indigo-600"
                } text-white transition-colors`}
                disabled={!translation}
              >
                {isPlaying ? (
                  <VolumeX className="w-6 h-6" />
                ) : (
                  <Volume2 className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Audio Element */}
        <audio ref={audioRef} className="hidden" />

        {/* Status Bar */}
        <div className="bg-gray-50 p-4 border-t">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isRecording ? "bg-red-500" : "bg-gray-300"
              }`}
            />
            <span className="text-sm text-gray-600">
              {isRecording ? "Recording..." : "Ready"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
