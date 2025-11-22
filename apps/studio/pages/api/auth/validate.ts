/**
 * Token Validation Endpoint
 * GET /api/auth/validate
 *
 * Validates a session token and returns the associated user with organizations
 * Uses Redis caching for improved performance
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { extractBearerToken } from 'lib/api/auth/utils'
import { validateSessionWithCache } from 'lib/api/auth/session-cache'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import type { AuthError, AuthenticatedUser, UserOrganization } from 'lib/api/auth/types'

interface ValidateResponse {
  user: AuthenticatedUser
  expires_at: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ValidateResponse | AuthError>
) {
  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Extract token from Authorization header
    const token = extractBearerToken(req as unknown as Request)

    if (!token) {
      return res.status(401).json({
        error: 'Authorization token required',
        code: 'TOKEN_MISSING',
      })
    }

    // Validate session using cache-enabled validation
    // This will check Redis first, fall back to DB on cache miss
    const session = await validateSessionWithCache(token)

    if (!session) {
      return res.status(401).json({
        error: 'Invalid or expired session token',
        code: 'INVALID_TOKEN',
      })
    }

    // Fetch user's organizations and active org
    const { data: userOrgData, error: orgError } = await queryPlatformDatabase<{
      active_org_id: string | null
      organization_id: string
      organization_slug: string
      organization_name: string
      role: string
      joined_at: string
    }>({
      query: `
        SELECT
          u.active_org_id,
          o.id as organization_id,
          o.slug as organization_slug,
          o.name as organization_name,
          om.role,
          om.joined_at
        FROM platform.users u
        LEFT JOIN platform.organization_members om ON om.user_id = u.id
        LEFT JOIN platform.organizations o ON o.id = om.organization_id
        WHERE u.id = $1
        ORDER BY om.joined_at ASC
      `,
      parameters: [session.userId]
    })

    if (orgError) {
      console.error('[validate] Failed to fetch user organizations:', orgError)
      // Continue without org data rather than failing
    }

    // Extract active org ID (same for all rows) and build organizations array
    const activeOrgId = userOrgData && userOrgData.length > 0
      ? userOrgData[0].active_org_id
      : null

    const organizations: UserOrganization[] = userOrgData
      ?.filter(row => row.organization_id) // Filter out rows with no org (LEFT JOIN nulls)
      .map(row => ({
        organization_id: row.organization_id,
        organization_slug: row.organization_slug,
        organization_name: row.organization_name,
        role: row.role as UserOrganization['role'],
        joined_at: row.joined_at
      })) || []

    // Return user info with organizations
    const user: AuthenticatedUser = {
      id: session.userId,
      email: session.email,
      first_name: session.firstName || '',
      last_name: session.lastName || '',
      username: session.username,
      avatar_url: undefined, // Not stored in session cache
      created_at: session.createdAt,
      activeOrgId,
      organizations
    }

    return res.status(200).json({
      user,
      expires_at: session.expiresAt,
    })

  } catch (error) {
    console.error('[validate] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred during token validation',
      code: 'INTERNAL_ERROR',
    })
  }
}
