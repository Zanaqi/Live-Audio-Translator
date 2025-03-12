"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Volume2, VolumeX, Languages, Users, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/context/AuthContext";
import { wsManager } from "@/lib/utils/WebSocketManager";

export default function JoinPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [roomCode, setRoomCode] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [originalMessages, setOriginalMessages] = useState<string[]>([]);
  const [translations, setTranslations] = useState<string[]>([]);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Check authentication
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user?.role !== "tourist") {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  // Initialize from URL params
  useEffect(() => {
    if (user) {
      const code = searchParams.get("code");
      if (code) {
        setRoomCode(code);
        checkRoom(code);
      }
    }
  }, [searchParams, user]);

  // Set up WebSocket listeners
  useEffect(() => {
    const handleMessage = (data: any) => {
      console.log("Received message:", data);

      switch (data.type) {
        case "joined":
          setParticipants(data.participantCount);
          setError(null);
          break;

        case "participant_joined":
        case "participant_left":
          setParticipants(data.participantCount);
          break;

        case "transcript":
          setOriginalMessages((prev) => [...prev, data.text]);
          setTranscript(data.text);
          break;

        case "translation":
          setTranslations((prev) => [...prev, data.text]);
          setTranslation(data.text);

          // Auto-play speech if not already playing
          if (!isPlaying && data.text) {
            speakTranslation(data.text);
          }
          break;

        case "error":
          console.error("WebSocket error:", data.message);
          setError(data.message);
          break;
      }
    };

    wsManager.on("message", handleMessage);

    return () => {
      wsManager.removeListener("message", handleMessage);
    };
  }, [isPlaying]);

  // Monitor WebSocket connection
  useEffect(() => {
    const interval = setInterval(() => {
      setWsConnected(wsManager.isConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Check if room exists
  const checkRoom = async (code: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/rooms?code=${code}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "Room not found. Please check the code and try again."
          );
        }
        throw new Error("Failed to check room");
      }

      const data = await response.json();
      setRoomName(data.name);
      setParticipants(data.participantCount);
      setRoomInfo(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to check room");
      setRoomInfo(null);
    }
  };

  // Join room
  const joinRoom = async () => {
    if (!roomCode.trim() || !user) {
      setError("Room code is required");
      return;
    }

    setJoiningRoom(true);
    setError(null);

    try {
      // Get token from localStorage
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
      }

      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: roomCode,
          touristName: user.name,
          preferredLanguage: user.preferredLanguage,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Join room error response:", errorText);

        if (response.status === 404) {
          throw new Error(
            "Room not found. Please check the code and try again."
          );
        } else if (response.status === 401) {
          throw new Error("Authentication failed. Please log in again.");
        }
        throw new Error("Failed to join room");
      }

      const data = await response.json();
      console.log("Join room response:", data);

      // Connect to WebSocket with room details
      await wsManager.connect({
        roomId: data.roomId,
        roomCode: data.roomCode,
        participantId: user.id,
        role: "tourist",
        preferredLanguage: user.preferredLanguage,
        touristName: user.name,
      });
    } catch (error) {
      console.error("Join room error:", error);
      setError(error instanceof Error ? error.message : "Failed to join room");
    } finally {
      setJoiningRoom(false);
    }
  };

  // Leave room
  const leaveRoom = () => {
    wsManager.disconnect();
    router.push("/dashboard");
  };

  // Text-to-speech for translation
  const speakTranslation = (textToSpeak: string = translation) => {
    if (!textToSpeak) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = getLangCode(user?.preferredLanguage || "");

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    } else {
      setError("Text-to-speech is not supported in your browser.");
    }
  };

  // Get language code for speech synthesis
  const getLangCode = (language: string): string => {
    const langCodes: { [key: string]: string } = {
      French: "fr-FR",
      Spanish: "es-ES",
      German: "de-DE",
      Italian: "it-IT",
      Japanese: "ja-JP",
      Chinese: "zh-CN",
    };
    return langCodes[language] || "en-US";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-teal-600 p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Tour Translation</h1>
              <p className="text-teal-100">Welcome, {user?.name}</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-white hover:text-teal-200"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {!wsConnected ? (
          /* Join Form */
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-black">Join a Tour</h2>

            <div>
              <label
                htmlFor="roomCode"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  if (e.target.value.length === 6) {
                    checkRoom(e.target.value);
                  }
                }}
                placeholder="Enter 6-digit code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 text-gray-600"
              />
            </div>

            {roomInfo && (
              <div className="p-3 bg-teal-50 text-teal-700 rounded-md">
                Found tour:{" "}
                <span className="font-semibold">{roomInfo.name}</span>
                <br />
                {roomInfo.participantCount} participants connected
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <button
              onClick={joinRoom}
              disabled={joiningRoom || !roomCode || !roomInfo}
              className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:bg-teal-300 disabled:cursor-not-allowed"
            >
              {joiningRoom ? "Joining..." : "Join Tour"}
            </button>
          </div>
        ) : (
          /* Active Translation View */
          <div className="p-6 space-y-6">
            {/* Room Info */}
            <div className="flex justify-between items-center p-4 bg-teal-50 rounded-lg">
              <div>
                <h2 className="text-xl font-semibold text-black">{roomName}</h2>
                <div className="flex items-center space-x-2 text-gray-600">
                  <Users size={16} />
                  <span>{participants} participants</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full">
                <Languages size={16} />
                <span>{user?.preferredLanguage}</span>
              </div>
            </div>

            {/* Original Text */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">
                Original (English)
              </h3>
              <div className="p-4 bg-gray-50 rounded-lg min-h-[100px]">
                <p className="text-gray-700">
                  {transcript || "Waiting for guide to speak..."}
                </p>
              </div>
            </div>

            {/* Translation */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">
                Translation ({user?.preferredLanguage})
              </h3>
              <div className="p-4 bg-teal-50 rounded-lg min-h-[100px]">
                <p className="text-gray-700">
                  {translation || "Translation will appear here..."}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => {
                  if (isPlaying) {
                    window.speechSynthesis.cancel();
                    setIsPlaying(false);
                  } else {
                    speakTranslation();
                  }
                }}
                disabled={!translation}
                className="p-4 rounded-full bg-teal-500 text-white hover:bg-teal-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isPlaying ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>

              <button
                onClick={leaveRoom}
                className="p-4 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Leave Tour
              </button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
