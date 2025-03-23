"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Calendar, ArrowRight, Plus } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";

interface Room {
  roomId: string;
  roomName: string;
  roomCode: string;
  role: "guide" | "tourist";
  joinedAt: Date;
}

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!loading && (!user || !token)) {
      console.log("No user or token, redirecting to login");
      router.push("/login");
      return;
    }
  }, [loading, user, router]);

  // Fetch rooms only when user is authenticated
  useEffect(() => {
    const fetchRooms = async () => {
      if (!user) return;

      setIsLoadingRooms(true);

      await cleanupRooms();

      try {
        const token = localStorage.getItem("token");
        if (!token) {
          throw new Error("No authentication token");
        }

        setIsLoadingRooms(true);
        const response = await fetch("/api/auth/user/rooms", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Token expired or invalid
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            router.push("/login");
            return;
          }
          throw new Error("Failed to fetch rooms");
        }

        const data = await response.json();
        setRooms(data.rooms || []);
      } catch (error) {
        console.error("Error fetching rooms:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load rooms"
        );
      } finally {
        setIsLoadingRooms(false);
      }
    };

    if (user) {
      fetchRooms();
    }
  }, [user, router]);

  const handleLogout = async () => {
    try {
      await logout();
      // The logout function will handle the redirect
    } catch (error) {
      console.error("Logout failed:", error);
      // Force reload as fallback
      window.location.href = "/login";
    }
  };

  const cleanupRooms = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      await fetch("/api/auth/user/cleanup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Error cleaning up rooms:", error);
    }
  };

  const EmptyState = () => (
    <div className="text-center py-12 bg-white rounded-lg shadow">
      <div className="mb-6">
        {user?.role === "guide" ? (
          <>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Tour Rooms Yet
            </h3>
            <p className="text-gray-500 mb-6">
              Create your first tour room to get started with translations.
            </p>
            <Link
              href="/guide"
              className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 shadow-sm"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create New Tour Room
            </Link>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Tours Joined Yet
            </h3>
            <p className="text-gray-500 mb-6">
              Join a tour using a room code to start receiving translations.
            </p>
            <Link
              href="/join"
              className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md text-white bg-teal-600 hover:bg-teal-700 shadow-sm"
            >
              <Plus className="h-5 w-5 mr-2" />
              Join a Tour
            </Link>
          </>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-indigo-600">
                Translation Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user.name}</span>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* User Info */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome, {user.name}!
          </h2>
          <div className="text-gray-600">
            <p>Role: {user.role === "guide" ? "Tour Guide" : "Tourist"}</p>
            {user.preferredLanguage && (
              <p>Preferred Language: {user.preferredLanguage}</p>
            )}
          </div>
        </div>

        {/* Create/Join Room Button */}
        <div className="mb-6">
          <Link
            href={user.role === "guide" ? "/guide" : "/join"}
            className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            {user.role === "guide" ? (
              <>
                <Plus className="h-5 w-5 mr-2" />
                Create New Tour Room
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 mr-2" />
                Join a Tour
              </>
            )}
          </Link>
        </div>

        {/* Rooms List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Your Rooms</h3>
          </div>

          {error && <div className="p-4 bg-red-50 text-red-700">{error}</div>}

          {isLoadingRooms ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
            </div>
          ) : rooms.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-gray-200">
              {rooms.map((room) => (
                <li key={room.roomId} className="hover:bg-gray-50">
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-medium text-gray-900">
                          {room.roomName}
                        </h4>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Role: {room.role}</span>
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            <span>
                              Joined:{" "}
                              {new Date(room.joinedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Link
                        href={
                          room.role === "guide"
                            ? `/guide/room/${room.roomId}`
                            : `/join/room/${room.roomCode}`
                        }
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                      >
                        Rejoin Room
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Evaluation Dashboard Link - Only visible to guides */}
        {user?.role === "guide" && (
          <div className="bg-white shadow rounded-lg p-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Translation Analytics
            </h3>
            <p className="text-gray-600 mb-4">
              View detailed statistics and feedback about your translations.
              Analyze performance and see how the system improves over time.
            </p>
            <Link
              href="/guide/evaluation"
              className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700"
            >
              <span className="mr-2">View Translation Evaluation</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
