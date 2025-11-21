/**
 * Auth Adapter
 * Bridges GoTrue client with our custom auth system
 * Allows gradual migration from GoTrue to custom auth
 */

import { gotrueClient } from 'common'
import type { User, Session } from './types'

/**
 * Sign in with custom auth API and sync with GoTrue
 */
export async function signInWithCustomAuth(
  email: string,
  password: string,
  rememberMe = false
): Promise<{ user: User; session: Session; error: null } | { user: null; session: null; error: Error }> {
  try {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Sign in failed')
    }

    const data = await response.json()

    // Store token
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem('auth_token', data.token)

    return {
      user: data.user,
      session: { token: data.token, expiresAt: data.expires_at },
      error: null
    }
  } catch (error) {
    return {
      user: null,
      session: null,
      error: error instanceof Error ? error : new Error('Unknown error')
    }
  }
}

/**
 * Sign out from custom auth API
 */
export async function signOutFromCustomAuth(): Promise<void> {
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')

  if (token) {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (error) {
      console.error('[Auth Adapter] Signout error:', error)
    }
  }

  // Clear storage
  localStorage.removeItem('auth_token')
  sessionStorage.removeItem('auth_token')
}

/**
 * Get current session from custom auth
 */
export async function getCurrentSession(): Promise<{ session: Session | null; error: null } | { session: null; error: Error }> {
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')

  if (!token) {
    return { session: null, error: null }
  }

  try {
    const response = await fetch('/api/auth/validate', {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
      // Clear invalid token
      localStorage.removeItem('auth_token')
      sessionStorage.removeItem('auth_token')
      return { session: null, error: null }
    }

    const data = await response.json()
    return {
      session: { token, expiresAt: data.expires_at },
      error: null
    }
  } catch (error) {
    return {
      session: null,
      error: error instanceof Error ? error : new Error('Unknown error')
    }
  }
}

/**
 * Refresh session token
 */
export async function refreshAuthSession(): Promise<{ session: Session | null; error: null } | { session: null; error: Error }> {
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')

  if (!token) {
    return { session: null, error: null }
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
      throw new Error('Failed to refresh session')
    }

    const data = await response.json()

    // Update storage with new token
    const storage = localStorage.getItem('auth_token') ? localStorage : sessionStorage
    storage.setItem('auth_token', data.token)

    return {
      session: { token: data.token, expiresAt: data.expires_at },
      error: null
    }
  } catch (error) {
    return {
      session: null,
      error: error instanceof Error ? error : new Error('Unknown error')
    }
  }
}
