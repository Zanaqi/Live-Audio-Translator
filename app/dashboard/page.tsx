// app/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Calendar, ArrowRight } from 'lucide-react';

interface Room {
  roomId: string;
  roomName: string;
  role: 'guide' | 'tourist';
  joinedAt: Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'guide' | 'tourist';
  preferredLanguage?: string;
}

export default function Dashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      router.push('/login');
      return;
    }

    setUser(JSON.parse(userData));
    fetchRooms(token);
  }, [router]);

  const fetchRooms = async (token: string) => {
    try {
      const response = await fetch('/api/auth/user/rooms', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch rooms');
      }

      const data = await response.json();
      setRooms(data.rooms);
    } catch (error) {
      setError('Failed to load rooms');
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-indigo-600">Translation Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.name}</span>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome, {user?.name}!</h2>
          <div className="text-gray-600">
            <p>Role: {user?.role === 'guide' ? 'Tour Guide' : 'Tourist'}</p>
            {user?.preferredLanguage && (
              <p>Preferred Language: {user.preferredLanguage}</p>
            )}
          </div>
        </div>

        {/* Create/Join Room Button */}
        <div className="mb-6">
          <Link
            href={user?.role === 'guide' ? '/guide' : '/join'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            {user?.role === 'guide' ? 'Create New Tour Room' : 'Join a Tour'}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>

        {/* Rooms List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Your Rooms</h3>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-700">
              {error}
            </div>
          )}

          {rooms.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>You haven't {user?.role === 'guide' ? 'created any rooms' : 'joined any tours'} yet.</p>
              <p className="mt-1">
                {user?.role === 'guide' 
                  ? 'Create your first tour room to get started!'
                  : 'Join a tour to get started!'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {rooms.map((room) => (
                <li key={room.roomId} className="hover:bg-gray-50">
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-medium text-gray-900">{room.roomName}</h4>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Role: {room.role}</span>
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            <span>Joined: {new Date(room.joinedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <Link
                        href={`/${room.role}?code=${room.roomId}`}
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
      </main>
    </div>
  );
}