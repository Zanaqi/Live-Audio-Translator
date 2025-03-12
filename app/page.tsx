"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, Headphones, Languages, Globe } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const router = useRouter();
  const { user, loading } = useAuth();

  const handleGuideClick = () => {
    // Go directly to register page or login page
    router.push("/register?role=guide");
  };

  const handleTouristClick = () => {
    // Go directly to register page with tourist role
    const registerPath = `/register?role=tourist${
      roomCode ? `&roomCode=${roomCode}` : ""
    }`;
    router.push(registerPath);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // If user is already logged in, redirect to dashboard
  if (user) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-100 to-white p-4">
      <div className="max-w-6xl mx-auto pt-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-indigo-800 mb-4">
            AI-Powered Real-Time Audio Translation
          </h1>
          <p className="text-xl text-indigo-600 max-w-3xl mx-auto">
            Break language barriers with our multilingual communication system.
            Perfect for tour guides, conferences, and international events.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Tour Guide Option */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all hover:scale-105">
            <div className="bg-purple-600 p-6 text-white">
              <h2 className="text-2xl font-bold flex items-center">
                <Mic className="mr-2" /> Tour Guide
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                Create a room for your tour group where you can speak in your
                language and tourists will receive real-time translations in
                their preferred languages.
              </p>

              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start">
                  <span className="text-purple-500 mr-2">•</span>
                  <span>Speak naturally in your own language</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-500 mr-2">•</span>
                  <span>Generate a unique room code for tourists</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-500 mr-2">•</span>
                  <span>Unlimited translations to multiple languages</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-500 mr-2">•</span>
                  <span>Monitor connected tourists</span>
                </li>
              </ul>

              <div className="flex gap-2">
                <button
                  onClick={handleGuideClick}
                  className="flex-1 text-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                >
                  Register as Guide
                </button>
                <Link
                  href="/login"
                  className="flex-1 text-center px-4 py-2 bg-gray-200 text-purple-600 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                >
                  Login
                </Link>
              </div>
            </div>
          </div>

          {/* Tourist Option */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all hover:scale-105">
            <div className="bg-teal-600 p-6 text-white">
              <h2 className="text-2xl font-bold flex items-center">
                <Headphones className="mr-2" /> Tourist
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                Join a tour and receive real-time translations in your preferred
                language. Simply enter the room code provided by your guide.
              </p>

              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start">
                  <span className="text-teal-500 mr-2">•</span>
                  <span>Choose your preferred language</span>
                </li>
                <li className="flex items-start">
                  <span className="text-teal-500 mr-2">•</span>
                  <span>Receive real-time translations</span>
                </li>
                <li className="flex items-start">
                  <span className="text-teal-500 mr-2">•</span>
                  <span>Listen to audio in your language</span>
                </li>
                <li className="flex items-start">
                  <span className="text-teal-500 mr-2">•</span>
                  <span>View both original text and translation</span>
                </li>
              </ul>

              <div className="space-y-3">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="Enter room code (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-600"
                />

                <div className="flex gap-2">
                  <button
                    onClick={handleTouristClick}
                    className="flex-1 text-center px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  >
                    Register as Tourist
                  </button>
                  <Link
                    href="/login"
                    className="flex-1 text-center px-4 py-2 bg-gray-200 text-teal-600 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                  >
                    Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-center text-indigo-800 mb-8">
            Key Features
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-md">
              <div className="flex items-center mb-4">
                <div className="bg-indigo-100 p-3 rounded-full mr-3">
                  <Languages className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">
                  Multiple Languages
                </h3>
              </div>
              <p className="text-gray-600">
                Support for Chinese, French, Spanish, German, Italian, Japanese
                and more languages coming soon.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
              <div className="flex items-center mb-4">
                <div className="bg-indigo-100 p-3 rounded-full mr-3">
                  <Globe className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">
                  Real-time Translations
                </h3>
              </div>
              <p className="text-gray-600">
                Advanced AI technology ensures fast and accurate translations
                with context awareness for natural-sounding results.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
              <div className="flex items-center mb-4">
                <div className="bg-indigo-100 p-3 rounded-full mr-3">
                  <Headphones className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">
                  Text-to-Speech
                </h3>
              </div>
              <p className="text-gray-600">
                Listen to translations in your preferred language with
                natural-sounding voice synthesis for a seamless experience.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 pb-8">
          <p>
            © {new Date().getFullYear()} AI-Powered Real-Time Audio Translation
            System
          </p>
          <p className="text-sm mt-1">
            Capstone Project by Mirza Anaqi Bin Muhammad Haizan
          </p>
        </div>
      </div>
    </div>
  );
}
