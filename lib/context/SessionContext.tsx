// lib/context/SessionContext.tsx
'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'

// Define session types
export interface GuideSession {
  roomId: string
  roomCode: string
  roomName: string
  guideId: string
  guideName: string
}

export interface TouristSession {
  roomId: string
  roomCode: string
  roomName: string
  touristId: string
  touristName: string
  preferredLanguage: string
}

// Define context structure
interface SessionContextType {
  // Guide methods and state
  guideSession: GuideSession | null
  setGuideSession: (session: GuideSession | null) => void
  saveGuideSession: (session: GuideSession) => void
  clearGuideSession: () => void
  
  // Tourist methods and state
  touristSession: TouristSession | null
  setTouristSession: (session: TouristSession | null) => void
  saveTouristSession: (session: TouristSession) => void
  clearTouristSession: () => void
  
  // User ID management
  userId: string | null
  ensureUserId: () => string
}

// Create context with default values
const SessionContext = createContext<SessionContextType>({
  guideSession: null,
  setGuideSession: () => {},
  saveGuideSession: () => {},
  clearGuideSession: () => {},
  
  touristSession: null,
  setTouristSession: () => {},
  saveTouristSession: () => {},
  clearTouristSession: () => {},
  
  userId: null,
  ensureUserId: () => '',
})

// Create provider component
export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [guideSession, setGuideSession] = useState<GuideSession | null>(null)
  const [touristSession, setTouristSession] = useState<TouristSession | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load sessions from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Load user ID
    const storedUserId = localStorage.getItem('userId')
    if (storedUserId) {
      setUserId(storedUserId)
    } else {
      const newUserId = uuidv4()
      localStorage.setItem('userId', newUserId)
      setUserId(newUserId)
    }
    
    // Load guide session
    try {
      const guideSessionData = localStorage.getItem('guide_session')
      if (guideSessionData) {
        setGuideSession(JSON.parse(guideSessionData))
      }
    } catch (error) {
      console.error('Failed to load guide session:', error)
      localStorage.removeItem('guide_session')
    }
    
    // Load tourist session
    try {
      const touristSessionData = localStorage.getItem('tourist_session')
      if (touristSessionData) {
        setTouristSession(JSON.parse(touristSessionData))
      }
    } catch (error) {
      console.error('Failed to load tourist session:', error)
      localStorage.removeItem('tourist_session')
    }
    
    setIsInitialized(true)
  }, [])

  // Ensure user has ID
  const ensureUserId = (): string => {
    if (userId) return userId
    
    const newUserId = uuidv4()
    localStorage.setItem('userId', newUserId)
    setUserId(newUserId)
    return newUserId
  }

  // Guide session handlers
  const saveGuideSession = (session: GuideSession) => {
    localStorage.setItem('guide_session', JSON.stringify(session))
    setGuideSession(session)
  }
  
  const clearGuideSession = () => {
    localStorage.removeItem('guide_session')
    setGuideSession(null)
  }
  
  // Tourist session handlers
  const saveTouristSession = (session: TouristSession) => {
    localStorage.setItem('tourist_session', JSON.stringify(session))
    setTouristSession(session)
  }
  
  const clearTouristSession = () => {
    localStorage.removeItem('tourist_session')
    setTouristSession(null)
  }

  // Context value
  const contextValue: SessionContextType = {
    guideSession,
    setGuideSession,
    saveGuideSession,
    clearGuideSession,
    
    touristSession,
    setTouristSession,
    saveTouristSession,
    clearTouristSession,
    
    userId,
    ensureUserId
  }
  
  // Don't render children until sessions are loaded
  if (!isInitialized && typeof window !== 'undefined') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  )
}

// Custom hook for using the session context
export const useSession = () => useContext(SessionContext)