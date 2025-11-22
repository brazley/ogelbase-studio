/**
 * Database Context Middleware Tests
 *
 * Test coverage:
 * - Session variable setting
 * - User context validation
 * - Organization context validation
 * - Error handling
 * - Performance benchmarks
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { NextApiRequest, NextApiResponse } from 'next'
import {
  withDatabaseContext,
  hasValidDatabaseContext,
  DatabaseContextError,
  RequestWithUser,
} from '@/lib/api/middleware/database-context'
import { queryPlatformDatabase } from '@/lib/api/platform/database'

// Mock response object for testing
const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as NextApiResponse
  return res
}

describe('Database Context Middleware', () => {
  // Test database connection
  beforeAll(async () => {
    // Verify DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set for integration tests')
    }
  })

  afterAll(async () => {
    // Cleanup: Clear any lingering session variables
    await queryPlatformDatabase({
      query: `
        SELECT
          set_config('app.current_user_id', '', false),
          set_config('app.current_org_id', '', false)
      `,
      parameters: [],
    })
  })

  describe('withDatabaseContext', () => {
    it('should set session variables correctly', async () => {
      const testUserId = '123e4567-e89b-12d3-a456-426614174000'
      const testOrgId = '987fcdeb-51a2-43f1-b123-456789abcdef'

      const req = {
        user: {
          userId: testUserId,
          activeOrgId: testOrgId,
        },
      } as RequestWithUser

      const res = createMockResponse()

      await withDatabaseContext(req, res, async () => {
        // Verify session variables are set
        const { data, error } = await queryPlatformDatabase<{
          user_id: string
          org_id: string
        }>({
          query: `
            SELECT
              current_setting('app.current_user_id', true) as user_id,
              current_setting('app.current_org_id', true) as org_id
          `,
          parameters: [],
        })

        expect(error).toBeUndefined()
        expect(data).toBeDefined()
        expect(data![0].user_id).toBe(testUserId)
        expect(data![0].org_id).toBe(testOrgId)

        return Promise.resolve('success')
      })
    })

    it('should throw DatabaseContextError if userId is missing', async () => {
      const req = {
        user: {
          // userId missing
          activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
        },
      } as unknown as RequestWithUser

      const res = createMockResponse()

      await expect(
        withDatabaseContext(req, res, async () => {
          return Promise.resolve('should not reach here')
        })
      ).rejects.toThrow(DatabaseContextError)

      await expect(
        withDatabaseContext(req, res, async () => {
          return Promise.resolve('should not reach here')
        })
      ).rejects.toThrow('User context required')
    })

    it('should throw DatabaseContextError if activeOrgId is missing', async () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          // activeOrgId missing
        },
      } as unknown as RequestWithUser

      const res = createMockResponse()

      await expect(
        withDatabaseContext(req, res, async () => {
          return Promise.resolve('should not reach here')
        })
      ).rejects.toThrow(DatabaseContextError)

      await expect(
        withDatabaseContext(req, res, async () => {
          return Promise.resolve('should not reach here')
        })
      ).rejects.toThrow('Active organization required')
    })

    it('should throw DatabaseContextError if activeOrgId is null', async () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          activeOrgId: null,
        },
      } as RequestWithUser

      const res = createMockResponse()

      await expect(
        withDatabaseContext(req, res, async () => {
          return Promise.resolve('should not reach here')
        })
      ).rejects.toThrow(DatabaseContextError)
    })

    it('should execute handler and return its value', async () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
        },
      } as RequestWithUser

      const res = createMockResponse()

      const result = await withDatabaseContext(req, res, async () => {
        return { success: true, data: 'test-data' }
      })

      expect(result).toEqual({ success: true, data: 'test-data' })
    })

    it('should clear session variables after handler completes', async () => {
      const testUserId = '123e4567-e89b-12d3-a456-426614174000'
      const testOrgId = '987fcdeb-51a2-43f1-b123-456789abcdef'

      const req = {
        user: {
          userId: testUserId,
          activeOrgId: testOrgId,
        },
      } as RequestWithUser

      const res = createMockResponse()

      await withDatabaseContext(req, res, async () => {
        return Promise.resolve('success')
      })

      // After handler completes, session variables should be cleared (transaction-scoped)
      // Note: In production, variables are cleared automatically when transaction ends
      // For testing, we verify they're transaction-scoped by checking they don't persist
      const { data, error } = await queryPlatformDatabase<{
        user_id: string | null
        org_id: string | null
      }>({
        query: `
          SELECT
            current_setting('app.current_user_id', true) as user_id,
            current_setting('app.current_org_id', true) as org_id
        `,
        parameters: [],
      })

      expect(error).toBeUndefined()
      // Variables should be empty strings (cleared) or null
      expect(data![0].user_id === '' || data![0].user_id === null).toBe(true)
      expect(data![0].org_id === '' || data![0].org_id === null).toBe(true)
    })
  })

  describe('hasValidDatabaseContext', () => {
    it('should return true when userId and activeOrgId are present', () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
        },
      } as RequestWithUser

      expect(hasValidDatabaseContext(req)).toBe(true)
    })

    it('should return false when userId is missing', () => {
      const req = {
        user: {
          activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
        },
      } as unknown as RequestWithUser

      expect(hasValidDatabaseContext(req)).toBe(false)
    })

    it('should return false when activeOrgId is missing', () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
        },
      } as unknown as RequestWithUser

      expect(hasValidDatabaseContext(req)).toBe(false)
    })

    it('should return false when activeOrgId is null', () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          activeOrgId: null,
        },
      } as RequestWithUser

      expect(hasValidDatabaseContext(req)).toBe(false)
    })

    it('should return false when user object is missing', () => {
      const req = {} as RequestWithUser

      expect(hasValidDatabaseContext(req)).toBe(false)
    })
  })

  describe('Performance', () => {
    it('should set context in less than 10ms', async () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
        },
      } as RequestWithUser

      const res = createMockResponse()

      const startTime = Date.now()

      await withDatabaseContext(req, res, async () => {
        return Promise.resolve('success')
      })

      const duration = Date.now() - startTime

      // Target: <10ms overhead
      expect(duration).toBeLessThan(10)
    })

    it('should handle multiple sequential contexts efficiently', async () => {
      const iterations = 10
      const durations: number[] = []

      for (let i = 0; i < iterations; i++) {
        const req = {
          user: {
            userId: '123e4567-e89b-12d3-a456-426614174000',
            activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
          },
        } as RequestWithUser

        const res = createMockResponse()
        const startTime = Date.now()

        await withDatabaseContext(req, res, async () => {
          return Promise.resolve('success')
        })

        durations.push(Date.now() - startTime)
      }

      const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length

      console.log(`Average duration over ${iterations} iterations: ${averageDuration}ms`)
      console.log(`Min: ${Math.min(...durations)}ms, Max: ${Math.max(...durations)}ms`)

      // Average should be well under 10ms
      expect(averageDuration).toBeLessThan(10)
    })
  })

  describe('DatabaseContextError', () => {
    it('should have correct error codes', () => {
      const missingUserError = new DatabaseContextError('Missing user', 'MISSING_USER')
      expect(missingUserError.code).toBe('MISSING_USER')
      expect(missingUserError.message).toBe('Missing user')
      expect(missingUserError.name).toBe('DatabaseContextError')

      const missingOrgError = new DatabaseContextError('Missing org', 'MISSING_ORG')
      expect(missingOrgError.code).toBe('MISSING_ORG')

      const setFailedError = new DatabaseContextError('Set failed', 'SET_CONTEXT_FAILED')
      expect(setFailedError.code).toBe('SET_CONTEXT_FAILED')
    })
  })
})
