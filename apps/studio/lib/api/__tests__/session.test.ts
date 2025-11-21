/**
 * Session Management Tests
 * Tests for session validation, cleanup, and lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  validateSession,
  cleanupExpiredSessions,
  cleanupInactiveSessions,
  getUserSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllUserSessions,
  getUserSessionStats
} from '../auth/session'
import * as database from '../platform/database'
import { hashToken, generateToken } from '../auth/utils'

// Mock the database module
vi.mock('../platform/database', () => ({
  queryPlatformDatabase: vi.fn()
}))

const mockQueryPlatformDatabase = vi.mocked(database.queryPlatformDatabase)

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateSession', () => {
    it('should return session with user details for valid token', async () => {
      const token = generateToken()
      const tokenHash = hashToken(token)

      const mockSession = {
        id: 'session-123',
        user_id: 'user-456',
        token: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_activity_at: new Date().toISOString(),
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        created_at: new Date().toISOString(),
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser'
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [mockSession],
        error: undefined
      })

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await validateSession(token)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe('user-456')
      expect(result?.email).toBe('test@example.com')
      expect(result?.firstName).toBe('Test')
      expect(result?.lastName).toBe('User')
    })

    it('should return null for expired token', async () => {
      const token = generateToken()

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await validateSession(token)

      expect(result).toBeNull()
    })

    it('should return null for invalid token', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await validateSession('invalid-token')

      expect(result).toBeNull()
    })

    it('should handle database errors gracefully', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: undefined,
        error: new Error('Database connection failed')
      })

      const result = await validateSession('some-token')

      expect(result).toBeNull()
    })

    it('should update last_activity_at for valid session', async () => {
      const token = generateToken()
      const tokenHash = hashToken(token)

      const mockSession = {
        id: 'session-123',
        user_id: 'user-456',
        token: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_activity_at: new Date().toISOString(),
        ip_address: null,
        user_agent: null,
        created_at: new Date().toISOString(),
        email: 'test@example.com',
        first_name: null,
        last_name: null,
        username: null
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [mockSession],
        error: undefined
      })

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      await validateSession(token)

      // Verify update query was called
      expect(mockQueryPlatformDatabase).toHaveBeenCalledTimes(2)
    })
  })

  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions and return count', async () => {
      const mockDeletedSessions = [
        { id: 'session-1' },
        { id: 'session-2' },
        { id: 'session-3' }
      ]

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: mockDeletedSessions,
        error: undefined
      })

      const result = await cleanupExpiredSessions()

      expect(result).toBe(3)
      expect(mockQueryPlatformDatabase).toHaveBeenCalledWith({
        query: expect.stringContaining('DELETE FROM platform.user_sessions'),
        parameters: []
      })
    })

    it('should return 0 when no expired sessions', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await cleanupExpiredSessions()

      expect(result).toBe(0)
    })

    it('should handle database errors gracefully', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: undefined,
        error: new Error('Database error')
      })

      const result = await cleanupExpiredSessions()

      expect(result).toBe(0)
    })
  })

  describe('cleanupInactiveSessions', () => {
    it('should delete inactive sessions and return count', async () => {
      const mockDeletedSessions = [{ id: 'session-1' }, { id: 'session-2' }]

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: mockDeletedSessions,
        error: undefined
      })

      const result = await cleanupInactiveSessions()

      expect(result).toBe(2)
      expect(mockQueryPlatformDatabase).toHaveBeenCalledWith({
        query: expect.stringContaining("INTERVAL '30 days'"),
        parameters: []
      })
    })
  })

  describe('getUserSessions', () => {
    it('should return all active sessions for a user', async () => {
      const userId = 'user-123'
      const mockSessions = [
        {
          id: 'session-1',
          user_id: userId,
          token: 'hash-1',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          last_activity_at: new Date().toISOString(),
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          created_at: new Date().toISOString()
        },
        {
          id: 'session-2',
          user_id: userId,
          token: 'hash-2',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          last_activity_at: new Date().toISOString(),
          ip_address: '192.168.1.2',
          user_agent: 'Chrome',
          created_at: new Date().toISOString()
        }
      ]

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: mockSessions,
        error: undefined
      })

      const result = await getUserSessions(userId)

      expect(result).toHaveLength(2)
      expect(result[0].userId).toBe(userId)
      expect(result[0].ipAddress).toBe('192.168.1.1')
    })

    it('should return empty array when no sessions found', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await getUserSessions('user-123')

      expect(result).toEqual([])
    })
  })

  describe('revokeSession', () => {
    it('should successfully revoke a session', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [{ id: 'session-123' }],
        error: undefined
      })

      const result = await revokeSession('session-123')

      expect(result).toBe(true)
      expect(mockQueryPlatformDatabase).toHaveBeenCalledWith({
        query: expect.stringContaining('DELETE FROM platform.user_sessions'),
        parameters: ['session-123']
      })
    })

    it('should return false when session not found', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await revokeSession('non-existent')

      expect(result).toBe(false)
    })

    it('should handle database errors gracefully', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: undefined,
        error: new Error('Database error')
      })

      const result = await revokeSession('session-123')

      expect(result).toBe(false)
    })
  })

  describe('revokeOtherSessions', () => {
    it('should revoke all sessions except specified one', async () => {
      const mockDeletedSessions = [
        { id: 'session-2' },
        { id: 'session-3' }
      ]

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: mockDeletedSessions,
        error: undefined
      })

      const result = await revokeOtherSessions('user-123', 'session-1')

      expect(result).toBe(2)
      expect(mockQueryPlatformDatabase).toHaveBeenCalledWith({
        query: expect.stringContaining('id != $2'),
        parameters: ['user-123', 'session-1']
      })
    })
  })

  describe('revokeAllUserSessions', () => {
    it('should revoke all sessions for a user', async () => {
      const mockDeletedSessions = [
        { id: 'session-1' },
        { id: 'session-2' },
        { id: 'session-3' }
      ]

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: mockDeletedSessions,
        error: undefined
      })

      const result = await revokeAllUserSessions('user-123')

      expect(result).toBe(3)
    })
  })

  describe('getUserSessionStats', () => {
    it('should return session statistics for a user', async () => {
      const mockStats = {
        total_active: '5',
        oldest_session: '2024-01-01T00:00:00Z',
        newest_session: '2024-01-05T00:00:00Z',
        devices_count: '3'
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [mockStats],
        error: undefined
      })

      const result = await getUserSessionStats('user-123')

      expect(result.totalActive).toBe(5)
      expect(result.devicesCount).toBe(3)
      expect(result.oldestSession).toBe('2024-01-01T00:00:00Z')
      expect(result.newestSession).toBe('2024-01-05T00:00:00Z')
    })

    it('should return zero stats when no sessions found', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined
      })

      const result = await getUserSessionStats('user-123')

      expect(result.totalActive).toBe(0)
      expect(result.devicesCount).toBe(0)
      expect(result.oldestSession).toBeNull()
      expect(result.newestSession).toBeNull()
    })

    it('should handle database errors gracefully', async () => {
      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: undefined,
        error: new Error('Database error')
      })

      const result = await getUserSessionStats('user-123')

      expect(result.totalActive).toBe(0)
    })
  })
})
