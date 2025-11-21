/**
 * Comprehensive tests for Profile API endpoint
 * Tests authentication, membership-based filtering, and data isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import handler from '../index'

// Mock dependencies
vi.mock('lib/api/apiWrapper', () => ({
  default: (req: NextApiRequest, res: NextApiResponse, fn: Function) => fn(req, res),
}))

vi.mock('lib/api/platform/database', () => ({
  queryPlatformDatabase: vi.fn(),
  PlatformOrganization: {},
  PlatformProject: {},
}))

// Import mocked functions
import { queryPlatformDatabase } from 'lib/api/platform/database'

describe('Profile API Endpoint', () => {
  let mockReq: Partial<NextApiRequest>
  let mockRes: Partial<NextApiResponse>
  let responseData: any
  let statusCode: number

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    responseData = null
    statusCode = 200

    // Setup mock response
    mockRes = {
      status: vi.fn((code: number) => {
        statusCode = code
        return mockRes as NextApiResponse
      }),
      json: vi.fn((data: any) => {
        responseData = data
        return mockRes as NextApiResponse
      }),
      setHeader: vi.fn(),
    }

    // Setup DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  describe('GET /api/platform/profile', () => {
    describe('Authentication', () => {
      it('should return 503 when DATABASE_URL is not configured', async () => {
        delete process.env.DATABASE_URL

        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(503)
        expect(responseData).toMatchObject({
          error: 'Platform database not configured',
          code: 'DB_NOT_CONFIGURED',
        })
      })

      it('should return 401 when no authorization header is provided', async () => {
        mockReq = {
          method: 'GET',
          headers: {},
        }

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(401)
        expect(responseData).toMatchObject({
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
        })
      })

      it('should return 401 when authorization header is malformed', async () => {
        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'InvalidFormat token',
          },
        }

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(401)
        expect(responseData).toMatchObject({
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
        })
      })

      it('should return 401 when session token is invalid', async () => {
        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer invalid-token',
          },
        }

        // Mock user query to return empty result
        vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
          data: [],
          error: undefined,
        })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(401)
        expect(responseData).toMatchObject({
          error: 'Invalid session',
          code: 'INVALID_SESSION',
        })
      })

      it('should return 401 when session token is expired', async () => {
        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer expired-token',
          },
        }

        // Mock user query to return empty result (session expired)
        vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
          data: [],
          error: undefined,
        })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(401)
        expect(responseData).toMatchObject({
          error: 'Invalid session',
          code: 'INVALID_SESSION',
        })
      })
    })

    describe('Successful Profile Retrieval', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
      }

      const mockOrg1 = {
        id: 'org-1',
        name: 'Test Org 1',
        slug: 'test-org-1',
        billing_email: 'billing@org1.com',
        created_at: '2024-01-01T00:00:00Z',
      }

      const mockOrg2 = {
        id: 'org-2',
        name: 'Test Org 2',
        slug: 'test-org-2',
        billing_email: null,
        created_at: '2024-01-02T00:00:00Z',
      }

      const mockProject1 = {
        id: 'proj-1',
        organization_id: 'org-1',
        name: 'Project 1',
        ref: 'proj1ref',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      }

      const mockProject2 = {
        id: 'proj-2',
        organization_id: 'org-1',
        name: 'Project 2',
        ref: 'proj2ref',
        status: 'active',
        created_at: '2024-01-02T00:00:00Z',
      }

      const mockProject3 = {
        id: 'proj-3',
        organization_id: 'org-2',
        name: 'Project 3',
        ref: 'proj3ref',
        status: 'active',
        created_at: '2024-01-03T00:00:00Z',
      }

      beforeEach(() => {
        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }
      })

      it('should return authenticated user profile with their organizations and projects', async () => {
        // Mock successful queries
        vi.mocked(queryPlatformDatabase)
          // User query
          .mockResolvedValueOnce({
            data: [mockUser],
            error: undefined,
          })
          // Organizations query
          .mockResolvedValueOnce({
            data: [mockOrg1, mockOrg2],
            error: undefined,
          })
          // Projects query
          .mockResolvedValueOnce({
            data: [mockProject1, mockProject2, mockProject3],
            error: undefined,
          })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData).toMatchObject({
          id: mockUser.id,
          primary_email: mockUser.email,
          username: mockUser.username,
          first_name: mockUser.first_name,
          last_name: mockUser.last_name,
        })

        // Verify organizations structure
        expect(responseData.organizations).toHaveLength(2)
        expect(responseData.organizations[0]).toMatchObject({
          id: mockOrg1.id,
          name: mockOrg1.name,
          slug: mockOrg1.slug,
          billing_email: mockOrg1.billing_email,
        })

        // Verify projects are grouped by organization
        expect(responseData.organizations[0].projects).toHaveLength(2)
        expect(responseData.organizations[1].projects).toHaveLength(1)
      })

      it('should generate username from email when username is null', async () => {
        const userWithoutUsername = { ...mockUser, username: null }

        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [userWithoutUsername], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.username).toBe('test')
      })

      it('should use default billing email when org billing_email is null', async () => {
        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [mockOrg2], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.organizations[0].billing_email).toBe('billing@ogelbase.com')
      })

      it('should handle users with no organizations', async () => {
        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.organizations).toHaveLength(0)
      })

      it('should handle users with organizations but no projects', async () => {
        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [mockOrg1], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.organizations).toHaveLength(1)
        expect(responseData.organizations[0].projects).toHaveLength(0)
      })
    })

    describe('Membership-Based Filtering', () => {
      it('should only return organizations where user is a member', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
        }

        const mockOrg = {
          id: 'org-member',
          name: 'Member Org',
          slug: 'member-org',
          billing_email: 'billing@member.com',
          created_at: '2024-01-01T00:00:00Z',
        }

        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [mockOrg], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.organizations).toHaveLength(1)
        expect(responseData.organizations[0].id).toBe('org-member')

        // Verify that the organizations query used JOIN with organization_members
        const orgQuery = vi.mocked(queryPlatformDatabase).mock.calls[1][0]
        expect(orgQuery.query).toContain('organization_members')
        expect(orgQuery.query).toContain('INNER JOIN')
      })

      it('should only return projects where user has access via org or direct membership', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
        }

        const mockOrg = {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          billing_email: 'billing@test.com',
          created_at: '2024-01-01T00:00:00Z',
        }

        const mockProject = {
          id: 'proj-1',
          organization_id: 'org-1',
          name: 'Accessible Project',
          ref: 'proj1ref',
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
        }

        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [mockOrg], error: undefined })
          .mockResolvedValueOnce({ data: [mockProject], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.organizations[0].projects).toHaveLength(1)

        // Verify that the projects query used LEFT JOIN with both tables
        const projQuery = vi.mocked(queryPlatformDatabase).mock.calls[2][0]
        expect(projQuery.query).toContain('project_members')
        expect(projQuery.query).toContain('organization_members')
        expect(projQuery.query).toContain('LEFT JOIN')
      })
    })

    describe('Data Isolation', () => {
      it('should not expose data from organizations user is not a member of', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
        }

        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        // Mock: user has no org memberships
        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(200)
        expect(responseData.organizations).toHaveLength(0)
      })

      it('should verify token hash is used for session lookup', async () => {
        const testToken = 'test-token-123'
        const expectedHash = crypto.createHash('sha256').update(testToken).digest('hex')

        mockReq = {
          method: 'GET',
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        }

        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [], error: undefined })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        // Verify that the user query used the hashed token
        const userQuery = vi.mocked(queryPlatformDatabase).mock.calls[0][0]
        expect(userQuery.parameters?.[0]).toBe(expectedHash)
      })
    })

    describe('Error Handling', () => {
      beforeEach(() => {
        mockReq = {
          method: 'GET',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }
      })

      it('should return 500 when user query fails', async () => {
        vi.mocked(queryPlatformDatabase).mockResolvedValueOnce({
          data: undefined,
          error: new Error('Database connection failed'),
        })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(500)
        expect(responseData).toMatchObject({
          error: 'Failed to validate session',
          code: 'DB_QUERY_FAILED',
        })
      })

      it('should return 500 when organizations query fails', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
        }

        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({
            data: undefined,
            error: new Error('Failed to fetch organizations'),
          })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(500)
        expect(responseData).toMatchObject({
          error: 'Failed to fetch organizations',
          code: 'DB_QUERY_FAILED',
        })
      })

      it('should return 500 when projects query fails', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
        }

        const mockOrg = {
          id: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          billing_email: 'billing@test.com',
          created_at: '2024-01-01T00:00:00Z',
        }

        vi.mocked(queryPlatformDatabase)
          .mockResolvedValueOnce({ data: [mockUser], error: undefined })
          .mockResolvedValueOnce({ data: [mockOrg], error: undefined })
          .mockResolvedValueOnce({
            data: undefined,
            error: new Error('Failed to fetch projects'),
          })

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(500)
        expect(responseData).toMatchObject({
          error: 'Failed to fetch projects',
          code: 'DB_QUERY_FAILED',
        })
      })
    })

    describe('HTTP Methods', () => {
      it('should return 405 for POST requests', async () => {
        mockReq = {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(405)
        expect(responseData.error.message).toContain('Method POST Not Allowed')
      })

      it('should return 405 for PUT requests', async () => {
        mockReq = {
          method: 'PUT',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(405)
        expect(responseData.error.message).toContain('Method PUT Not Allowed')
      })

      it('should return 405 for DELETE requests', async () => {
        mockReq = {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer valid-token',
          },
        }

        await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)

        expect(statusCode).toBe(405)
        expect(responseData.error.message).toContain('Method DELETE Not Allowed')
      })
    })
  })
})
