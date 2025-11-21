/**
 * Production Auth Context
 * Manages authentication state and provides auth methods
 */

'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import type { AuthContextValue, User, Session, SignInResponse, RefreshResponse } from './types'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const TOKEN_STORAGE_KEY = 'auth_token'
const TOKEN_REFRESH_INTERVAL = 15 * 60 * 1000 // 15 minutes

interface AuthProviderProps {
  children: ReactNode
}

export function ProductionAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Initialize auth state from storage
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY)

      if (!token) {
        setLoading(false)
        return
      }

      try {
        // Validate token with backend
        const response = await fetch('/api/auth/validate', {
          headers: { 'Authorization': `Bearer ${token}` }
        })

        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          setSession({ token, expiresAt: data.expires_at })
        } else {
          // Token invalid, clear storage
          clearAuth()
        }
      } catch (error) {
        console.error('[Auth] Init error:', error)
        clearAuth()
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!session) return

    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.token}` }
        })

        if (response.ok) {
          const data: RefreshResponse = await response.json()
          updateToken(data.token, data.expires_at)
        } else {
          // Refresh failed, logout
          console.warn('[Auth] Token refresh failed, signing out')
          await signOut()
        }
      } catch (error) {
        console.error('[Auth] Token refresh error:', error)
      }
    }, TOKEN_REFRESH_INTERVAL)

    return () => clearInterval(refreshInterval)
  }, [session])

  const signIn = useCallback(async (email: string, password: string, rememberMe = false): Promise<User> => {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Sign in failed')
    }

    const data: SignInResponse = await response.json()

    // Store token
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem(TOKEN_STORAGE_KEY, data.token)

    setUser(data.user)
    setSession({ token: data.token, expiresAt: data.expires_at })

    return data.user
  }, [])

  const signOut = useCallback(async () => {
    const token = session?.token ||
                  localStorage.getItem(TOKEN_STORAGE_KEY) ||
                  sessionStorage.getItem(TOKEN_STORAGE_KEY)

    if (token) {
      try {
        await fetch('/api/auth/signout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      } catch (error) {
        console.error('[Auth] Signout error:', error)
      }
    }

    clearAuth()
  }, [session])

  const refreshSession = useCallback(async () => {
    if (!session) return

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.token}` }
      })

      if (response.ok) {
        const data: RefreshResponse = await response.json()
        updateToken(data.token, data.expires_at)
      } else {
        console.warn('[Auth] Session refresh failed')
        await signOut()
      }
    } catch (error) {
      console.error('[Auth] Refresh session error:', error)
      throw error
    }
  }, [session, signOut])

  const clearAuth = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    setUser(null)
    setSession(null)
  }

  const updateToken = (newToken: string, expiresAt: string) => {
    const storage = localStorage.getItem(TOKEN_STORAGE_KEY) ? localStorage : sessionStorage
    storage.setItem(TOKEN_STORAGE_KEY, newToken)
    setSession({ token: newToken, expiresAt })
  }

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signIn,
    signOut,
    refreshSession,
    isAuthenticated: !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook to use auth context
export function useProductionAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useProductionAuth must be used within ProductionAuthProvider')
  }
  return context
}
