/**
 * Unit tests for Team Members API
 * Tests CRUD operations, role-based access control, and edge cases
 */

import { NextApiRequest, NextApiResponse } from 'next'
import handler from '../[slug]/members'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { verifyOrgAccess, requireRole } from 'lib/api/platform/org-access-control'

// Mock dependencies
jest.mock('lib/api/platform/database')
jest.mock('lib/api/platform/org-access-control')
jest.mock('lib/api/apiWrapper', () => ({
  __esModule: true,
  default: (req: NextApiRequest, res: NextApiResponse, handler: any) => handler(req, res),
  AuthenticatedRequest: {},
}))

const mockQueryPlatformDatabase = queryPlatformDatabase as jest.MockedFunction<
  typeof queryPlatformDatabase
>
const mockVerifyOrgAccess = verifyOrgAccess as jest.MockedFunction<typeof verifyOrgAccess>
const mockRequireRole = requireRole as jest.MockedFunction<typeof requireRole>

describe('/api/platform/organizations/[slug]/members', () => {
  let req: Partial<NextApiRequest>
  let res: Partial<NextApiResponse>
  let jsonMock: jest.Mock
  let statusMock: jest.Mock

  beforeEach(() => {
    jsonMock = jest.fn()
    statusMock = jest.fn(() => ({ json: jsonMock }))

    req = {
      query: { slug: 'test-org' },
      body: {},
    }

    res = {
      status: statusMock,
      setHeader: jest.fn(),
      json: jsonMock,
    }

    // Default mocks
    mockVerifyOrgAccess.mockResolvedValue({
      role: 'admin',
      user_id: 'user-123',
      org_id: 'org-123',
      org_name: 'Test Org',
      org_slug: 'test-org',
    })
    mockRequireRole.mockReturnValue(true)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('GET - List Members', () => {
    it('should return list of organization members', async () => {
      const mockMembers = [
        {
          id: 'member-1',
          user_id: 'user-1',
          organization_id: 'org-123',
          role: 'owner',
          invited_at: '2024-01-01',
          accepted_at: '2024-01-01',
          email: 'owner@example.com',
          first_name: 'John',
          last_name: 'Owner',
          username: 'johnowner',
        },
        {
          id: 'member-2',
          user_id: 'user-2',
          organization_id: 'org-123',
          role: 'developer',
          invited_at: '2024-01-02',
          accepted_at: '2024-01-02',
          email: 'dev@example.com',
          first_name: 'Jane',
          last_name: 'Developer',
          username: 'janedev',
        },
      ]

      mockQueryPlatformDatabase.mockResolvedValue({
        data: mockMembers,
        error: undefined,
      })

      req.method = 'GET'
      req.user = { userId: 'user-123', email: 'test@example.com' }

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith(mockMembers)
    })

    it('should return members sorted by role hierarchy then invite date', async () => {
      mockQueryPlatformDatabase.mockResolvedValue({
        data: [],
        error: undefined,
      })

      req.method = 'GET'
      req.user = { userId: 'user-123', email: 'test@example.com' }

      await handler(req as any, res as any)

      // Verify query includes ORDER BY clause
      expect(mockQueryPlatformDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('ORDER BY'),
        })
      )
    })

    it('should return 400 if slug is missing', async () => {
      req.method = 'GET'
      req.query = {}

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Organization slug is required',
          }),
        })
      )
    })

    it('should return 500 on database error', async () => {
      mockQueryPlatformDatabase.mockResolvedValue({
        data: undefined,
        error: new Error('Database connection failed'),
      })

      req.method = 'GET'
      req.user = { userId: 'user-123', email: 'test@example.com' }

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(500)
    })
  })

  describe('POST - Invite Member', () => {
    beforeEach(() => {
      req.method = 'POST'
      req.user = { userId: 'user-123', email: 'admin@example.com' }
    })

    it('should successfully invite a new developer', async () => {
      req.body = {
        email: 'newdev@example.com',
        role: 'developer',
      }

      // Mock user lookup
      mockQueryPlatformDatabase
        .mockResolvedValueOnce({
          data: [{ id: 'user-456' }],
          error: undefined,
        })
        // Mock existing member check
        .mockResolvedValueOnce({
          data: [],
          error: undefined,
        })
        // Mock insert
        .mockResolvedValueOnce({
          data: [
            {
              id: 'member-new',
              user_id: 'user-456',
              role: 'developer',
              invited_at: '2024-01-03',
            },
          ],
          error: undefined,
        })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(201)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'developer',
        })
      )
    })

    it('should require admin role to invite', async () => {
      mockRequireRole.mockReturnValue(false)

      req.body = {
        email: 'newdev@example.com',
        role: 'developer',
      }

      await handler(req as any, res as any)

      expect(mockRequireRole).toHaveBeenCalledWith(
        expect.anything(),
        'admin',
        expect.anything()
      )
    })

    it('should only allow owners to invite owners', async () => {
      mockVerifyOrgAccess.mockResolvedValue({
        role: 'admin',
        user_id: 'user-123',
        org_id: 'org-123',
        org_name: 'Test Org',
        org_slug: 'test-org',
      })

      req.body = {
        email: 'newowner@example.com',
        role: 'owner',
      }

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(403)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Only owners can invite other owners',
          }),
        })
      )
    })

    it('should return 404 if user email not found', async () => {
      req.body = {
        email: 'nonexistent@example.com',
        role: 'developer',
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('User not found'),
          }),
        })
      )
    })

    it('should return 400 if user is already a member', async () => {
      req.body = {
        email: 'existing@example.com',
        role: 'developer',
      }

      mockQueryPlatformDatabase
        .mockResolvedValueOnce({
          data: [{ id: 'user-456' }],
          error: undefined,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'existing-member' }],
          error: undefined,
        })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('already a member'),
          }),
        })
      )
    })

    it('should validate role is valid', async () => {
      req.body = {
        email: 'newdev@example.com',
        role: 'super_admin', // Invalid role
      }

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Invalid role'),
          }),
        })
      )
    })
  })

  describe('PUT - Update Member Role', () => {
    beforeEach(() => {
      req.method = 'PUT'
      req.user = { userId: 'user-123', email: 'admin@example.com' }
    })

    it('should successfully update member role', async () => {
      req.body = {
        member_id: 'member-456',
        role: 'admin',
      }

      mockQueryPlatformDatabase
        .mockResolvedValueOnce({
          data: [{ role: 'developer', user_id: 'user-456' }],
          error: undefined,
        })
        .mockResolvedValueOnce({
          data: [],
          error: undefined,
        })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        role: 'admin',
      })
    })

    it('should prevent changing own role', async () => {
      req.body = {
        member_id: 'member-123',
        role: 'owner',
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [{ role: 'admin', user_id: 'user-123' }],
        error: undefined,
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('cannot change your own role'),
          }),
        })
      )
    })

    it('should only allow owners to change owner roles', async () => {
      mockVerifyOrgAccess.mockResolvedValue({
        role: 'admin',
        user_id: 'user-123',
        org_id: 'org-123',
        org_name: 'Test Org',
        org_slug: 'test-org',
      })

      req.body = {
        member_id: 'member-456',
        role: 'owner',
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [{ role: 'admin', user_id: 'user-456' }],
        error: undefined,
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(403)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Only owners can change owner roles'),
          }),
        })
      )
    })

    it('should return 404 if member not found', async () => {
      req.body = {
        member_id: 'nonexistent',
        role: 'admin',
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [],
        error: undefined,
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(404)
    })
  })

  describe('DELETE - Remove Member', () => {
    beforeEach(() => {
      req.method = 'DELETE'
      req.user = { userId: 'user-123', email: 'admin@example.com' }
    })

    it('should successfully remove member', async () => {
      req.body = {
        member_id: 'member-456',
      }

      mockQueryPlatformDatabase
        .mockResolvedValueOnce({
          data: [{ role: 'developer', user_id: 'user-456' }],
          error: undefined,
        })
        .mockResolvedValueOnce({
          data: [],
          error: undefined,
        })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({ success: true })
    })

    it('should prevent removing self', async () => {
      req.body = {
        member_id: 'member-123',
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [{ role: 'admin', user_id: 'user-123' }],
        error: undefined,
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('cannot remove yourself'),
          }),
        })
      )
    })

    it('should only allow owners to remove owners', async () => {
      mockVerifyOrgAccess.mockResolvedValue({
        role: 'admin',
        user_id: 'user-123',
        org_id: 'org-123',
        org_name: 'Test Org',
        org_slug: 'test-org',
      })

      req.body = {
        member_id: 'member-456',
      }

      mockQueryPlatformDatabase.mockResolvedValueOnce({
        data: [{ role: 'owner', user_id: 'user-456' }],
        error: undefined,
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(403)
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Only owners can remove other owners'),
          }),
        })
      )
    })

    it('should require admin role to remove members', async () => {
      mockRequireRole.mockReturnValue(false)

      req.body = {
        member_id: 'member-456',
      }

      await handler(req as any, res as any)

      expect(mockRequireRole).toHaveBeenCalledWith(
        expect.anything(),
        'admin',
        expect.anything()
      )
    })
  })

  describe('Edge Cases', () => {
    it('should return 405 for unsupported methods', async () => {
      req.method = 'PATCH'

      await handler(req as any, res as any)

      expect(res.setHeader).toHaveBeenCalledWith('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
      expect(statusMock).toHaveBeenCalledWith(405)
    })

    it('should handle database connection failures gracefully', async () => {
      req.method = 'GET'
      req.user = { userId: 'user-123', email: 'test@example.com' }

      mockQueryPlatformDatabase.mockResolvedValue({
        data: undefined,
        error: new Error('Connection timeout'),
      })

      await handler(req as any, res as any)

      expect(statusMock).toHaveBeenCalledWith(500)
    })
  })
})
