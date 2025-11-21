/**
 * Auth Context Tests
 * Tests for production authentication context and provider
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { ReactNode } from 'react'
import { ProductionAuthProvider, useProductionAuth } from '../context'

// Mock fetch
global.fetch = jest.fn()

// Mock localStorage and sessionStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

const sessionStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProductionAuthProvider>{children}</ProductionAuthProvider>
)

describe('ProductionAuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.clear()
    sessionStorageMock.clear()
  })

  describe('Initialization', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      expect(result.current.loading).toBe(true)
      expect(result.current.user).toBeNull()
      expect(result.current.session).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should validate existing token on mount', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date().toISOString()
      }

      localStorageMock.setItem('auth_token', 'valid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: mockUser,
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should clear invalid token on mount', async () => {
      localStorageMock.setItem('auth_token', 'invalid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid token' })
      })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(localStorageMock.getItem('auth_token')).toBeNull()
    })
  })

  describe('signIn', () => {
    it('should sign in successfully with localStorage', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date().toISOString()
      }

      const mockToken = 'auth-token-123'
      const mockExpiresAt = new Date(Date.now() + 3600000).toISOString()

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: mockToken,
          user: mockUser,
          expires_at: mockExpiresAt
        })
      })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let signedInUser: any

      await act(async () => {
        signedInUser = await result.current.signIn('test@example.com', 'password123', true)
      })

      expect(signedInUser).toEqual(mockUser)
      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
      expect(localStorageMock.getItem('auth_token')).toBe(mockToken)
    })

    it('should sign in successfully with sessionStorage', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date().toISOString()
      }

      const mockToken = 'auth-token-123'

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: mockToken,
          user: mockUser,
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123', false)
      })

      expect(sessionStorageMock.getItem('auth_token')).toBe(mockToken)
      expect(localStorageMock.getItem('auth_token')).toBeNull()
    })

    it('should handle sign in error', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' })
      })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.signIn('test@example.com', 'wrong-password')
        })
      ).rejects.toThrow('Invalid credentials')
    })
  })

  describe('signOut', () => {
    it('should sign out successfully', async () => {
      const mockToken = 'auth-token-123'
      localStorageMock.setItem('auth_token', mockToken)

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            user: { id: 'user-123', email: 'test@example.com' },
            expires_at: new Date(Date.now() + 3600000).toISOString()
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.signOut()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.session).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorageMock.getItem('auth_token')).toBeNull()
    })

    it('should clear storage even if API call fails', async () => {
      localStorageMock.setItem('auth_token', 'token')

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            user: { id: 'user-123' },
            expires_at: new Date(Date.now() + 3600000).toISOString()
          })
        })
        .mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.signOut()
      })

      expect(localStorageMock.getItem('auth_token')).toBeNull()
    })
  })

  describe('refreshSession', () => {
    it('should refresh session successfully', async () => {
      const oldToken = 'old-token'
      const newToken = 'new-token'

      localStorageMock.setItem('auth_token', oldToken)

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            user: { id: 'user-123', email: 'test@example.com' },
            expires_at: new Date(Date.now() + 3600000).toISOString()
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: newToken,
            expires_at: new Date(Date.now() + 7200000).toISOString()
          })
        })

      const { result } = renderHook(() => useProductionAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.refreshSession()
      })

      expect(localStorageMock.getItem('auth_token')).toBe(newToken)
    })
  })
})
