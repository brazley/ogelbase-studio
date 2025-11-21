/**
 * Authentication Endpoints Test Suite
 * Tests for signup, signin, signout, and refresh endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import signupHandler from '../signup'
import signinHandler from '../signin'
import signoutHandler from '../signout'
import refreshHandler from '../refresh'

// Mock the database query function
vi.mock('lib/api/platform/database', () => ({
  queryPlatformDatabase: vi.fn(),
}))

// Mock the utils
vi.mock('lib/api/auth/utils', async () => {
  const actual = await vi.importActual('lib/api/auth/utils')
  return {
    ...actual,
    checkRateLimit: vi.fn(() => false),
    clearRateLimit: vi.fn(),
    getClientIp: vi.fn(() => '127.0.0.1'),
    getUserAgent: vi.fn(() => 'test-agent'),
  }
})

import { queryPlatformDatabase } from 'lib/api/platform/database'

// Helper to create mock request/response
function createMocks(method: string, body: unknown, headers: Record<string, string> = {}) {
  const req = {
    method,
    body,
    headers,
  } as unknown as NextApiRequest

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse

  return { req, res }
}

describe('Authentication Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth/signup', () => {
    const validSignUpData = {
      email: 'test@example.com',
      password: 'SecurePass123',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
    }

    it('should successfully create a new user', async () => {
      const { req, res } = createMocks('POST', validSignUpData)

      // Mock no existing user
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      // Mock no existing username
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      // Mock successful user creation
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{
          id: '123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          avatar_url: null,
          created_at: new Date().toISOString(),
        }],
        error: undefined,
      })

      await signupHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            username: 'testuser',
          }),
        })
      )
    })

    it('should reject duplicate email', async () => {
      const { req, res } = createMocks('POST', validSignUpData)

      // Mock existing user
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{ id: '123', email: 'test@example.com' }],
        error: undefined,
      })

      await signupHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'An account with this email already exists',
          code: 'EMAIL_EXISTS',
        })
      )
    })

    it('should reject invalid email format', async () => {
      const { req, res } = createMocks('POST', {
        ...validSignUpData,
        email: 'invalid-email',
      })

      await signupHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
        })
      )
    })

    it('should reject weak password', async () => {
      const { req, res } = createMocks('POST', {
        ...validSignUpData,
        password: 'weak',
      })

      await signupHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
        })
      )
    })

    it('should reject non-POST methods', async () => {
      const { req, res } = createMocks('GET', validSignUpData)

      await signupHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Method not allowed',
        })
      )
    })
  })

  describe('POST /api/auth/signin', () => {
    const validSignInData = {
      email: 'test@example.com',
      password: 'SecurePass123',
    }

    it('should successfully sign in a user', async () => {
      const { req, res } = createMocks('POST', validSignInData)

      // Mock user query
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{
          id: '123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          avatar_url: null,
          password_hash: '$2a$10$validhash', // This will be mocked in verifyPassword
          banned_until: null,
          deleted_at: null,
          created_at: new Date().toISOString(),
        }],
        error: undefined,
      })

      // Mock session creation
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{
          id: 'session-123',
          token: 'hashed-token',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }],
        error: undefined,
      })

      // Mock last sign in update
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await signinHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
          user: expect.objectContaining({
            email: 'test@example.com',
          }),
          expires_at: expect.any(String),
        })
      )
    })

    it('should reject invalid credentials', async () => {
      const { req, res } = createMocks('POST', validSignInData)

      // Mock no user found
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await signinHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        })
      )
    })

    it('should reject deleted account', async () => {
      const { req, res } = createMocks('POST', validSignInData)

      // Mock deleted user
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{
          id: '123',
          email: 'test@example.com',
          deleted_at: new Date().toISOString(),
        }],
        error: undefined,
      })

      await signinHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'This account has been deleted',
          code: 'ACCOUNT_DELETED',
        })
      )
    })
  })

  describe('POST /api/auth/signout', () => {
    it('should successfully sign out a user', async () => {
      const { req, res } = createMocks('POST', {}, {
        authorization: 'Bearer valid-token-123',
      })

      // Mock session deletion
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{ id: 'session-123' }],
        error: undefined,
      })

      await signoutHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Successfully signed out',
        })
      )
    })

    it('should reject missing authorization token', async () => {
      const { req, res } = createMocks('POST', {})

      await signoutHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authorization token required',
          code: 'TOKEN_MISSING',
        })
      )
    })

    it('should handle session not found', async () => {
      const { req, res } = createMocks('POST', {}, {
        authorization: 'Bearer invalid-token',
      })

      // Mock no session found
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await signoutHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        })
      )
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('should successfully refresh a valid token', async () => {
      const { req, res } = createMocks('POST', {}, {
        authorization: 'Bearer valid-token-123',
      })

      // Mock session query
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{
          id: 'session-123',
          user_id: 'user-123',
          token: 'hashed-token',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          last_activity_at: new Date().toISOString(),
        }],
        error: undefined,
      })

      // Mock last activity update
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await refreshHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
          expires_at: expect.any(String),
        })
      )
    })

    it('should reject expired session', async () => {
      const { req, res } = createMocks('POST', {}, {
        authorization: 'Bearer expired-token',
      })

      // Mock expired session
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [{
          id: 'session-123',
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        }],
        error: undefined,
      })

      // Mock session deletion
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await refreshHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Session has expired',
          code: 'SESSION_EXPIRED',
        })
      )
    })

    it('should reject invalid token', async () => {
      const { req, res } = createMocks('POST', {}, {
        authorization: 'Bearer invalid-token',
      })

      // Mock no session found
      vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await refreshHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid session token',
          code: 'INVALID_TOKEN',
        })
      )
    })
  })
})
