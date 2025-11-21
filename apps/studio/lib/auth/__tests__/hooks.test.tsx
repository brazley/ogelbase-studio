/**
 * Auth Hooks Tests
 * Tests for custom authentication hooks
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useRouter } from 'next/router'
import { ReactNode } from 'react'
import { ProductionAuthProvider } from '../context'
import {
  useRequireAuth,
  useRedirectIfAuthenticated,
  useCurrentUser,
  useIsAuthenticated,
  useAuthLoading
} from '../hooks'

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: jest.fn()
}))

// Mock fetch
global.fetch = jest.fn()

const mockRouter = {
  push: jest.fn(),
  asPath: '/dashboard',
  query: {}
}

;(useRouter as jest.Mock).mockReturnValue(mockRouter)

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProductionAuthProvider>{children}</ProductionAuthProvider>
)

describe('Auth Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('useRequireAuth', () => {
    it('should redirect to sign-in if not authenticated', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false
      })

      renderHook(() => useRequireAuth(), { wrapper })

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith(
          expect.stringContaining('/sign-in')
        )
      })
    })

    it('should not redirect if authenticated', async () => {
      localStorage.setItem('auth_token', 'valid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'test@example.com' },
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      const { result } = renderHook(() => useRequireAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockRouter.push).not.toHaveBeenCalled()
      expect(result.current.user).toBeTruthy()
    })
  })

  describe('useRedirectIfAuthenticated', () => {
    it('should redirect authenticated users away from auth pages', async () => {
      localStorage.setItem('auth_token', 'valid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'test@example.com' },
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      renderHook(() => useRedirectIfAuthenticated('/dashboard'), { wrapper })

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
      })
    })

    it('should use returnTo parameter if present', async () => {
      mockRouter.query = { returnTo: '/projects' }
      localStorage.setItem('auth_token', 'valid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'test@example.com' },
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      renderHook(() => useRedirectIfAuthenticated('/dashboard'), { wrapper })

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/projects')
      })
    })

    it('should not redirect if not authenticated', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false
      })

      renderHook(() => useRedirectIfAuthenticated('/dashboard'), { wrapper })

      await waitFor(() => {
        expect(mockRouter.push).not.toHaveBeenCalled()
      })
    })
  })

  describe('useCurrentUser', () => {
    it('should return null when not authenticated', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false
      })

      const { result } = renderHook(() => useCurrentUser(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeNull()
      })
    })

    it('should return user when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date().toISOString()
      }

      localStorage.setItem('auth_token', 'valid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: mockUser,
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      const { result } = renderHook(() => useCurrentUser(), { wrapper })

      await waitFor(() => {
        expect(result.current).toEqual(mockUser)
      })
    })
  })

  describe('useIsAuthenticated', () => {
    it('should return false when not authenticated', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false
      })

      const { result } = renderHook(() => useIsAuthenticated(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBe(false)
      })
    })

    it('should return true when authenticated', async () => {
      localStorage.setItem('auth_token', 'valid-token')

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', email: 'test@example.com' },
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      })

      const { result } = renderHook(() => useIsAuthenticated(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })
  })

  describe('useAuthLoading', () => {
    it('should return true during initialization', () => {
      const { result } = renderHook(() => useAuthLoading(), { wrapper })

      expect(result.current).toBe(true)
    })

    it('should return false after initialization', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false
      })

      const { result } = renderHook(() => useAuthLoading(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBe(false)
      })
    })
  })
})
