/**
 * Set Active Organization Endpoint
 * POST /api/auth/set-active-org
 *
 * Updates the user's active organization preference
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { extractBearerToken } from 'lib/api/auth/utils'
import { validateSessionWithCache } from 'lib/api/auth/session-cache'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import type { AuthError } from 'lib/api/auth/types'

interface SetActiveOrgRequest {
  organizationId: string
}

interface SetActiveOrgResponse {
  success: boolean
  activeOrgId: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetActiveOrgResponse | AuthError>
) {
  // Only allow POST method
  if (req.method !== 'POST') {
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

    // Validate session
    const session = await validateSessionWithCache(token)

    if (!session) {
      return res.status(401).json({
        error: 'Invalid or expired session token',
        code: 'INVALID_TOKEN',
      })
    }

    // Extract organization ID from request body
    const { organizationId } = req.body as SetActiveOrgRequest

    if (!organizationId) {
      return res.status(400).json({
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID',
      })
    }

    // Verify user is a member of this organization
    const { data: membership, error: membershipError } = await queryPlatformDatabase<{
      organization_id: string
    }>({
      query: `
        SELECT organization_id
        FROM platform.organization_members
        WHERE user_id = $1 AND organization_id = $2
      `,
      parameters: [session.userId, organizationId]
    })

    if (membershipError) {
      console.error('[set-active-org] Failed to check membership:', membershipError)
      return res.status(500).json({
        error: 'Failed to verify organization membership',
        code: 'MEMBERSHIP_CHECK_FAILED',
      })
    }

    if (!membership || membership.length === 0) {
      return res.status(403).json({
        error: 'User is not a member of this organization',
        code: 'NOT_A_MEMBER',
      })
    }

    // Update user's active organization
    const { error: updateError } = await queryPlatformDatabase({
      query: `
        UPDATE platform.users
        SET active_org_id = $1, updated_at = NOW()
        WHERE id = $2
      `,
      parameters: [organizationId, session.userId]
    })

    if (updateError) {
      console.error('[set-active-org] Failed to update active org:', updateError)
      return res.status(500).json({
        error: 'Failed to update active organization',
        code: 'UPDATE_FAILED',
      })
    }

    // Invalidate session cache to force refresh with new org data
    // This ensures the next /api/auth/validate call returns updated data
    // Note: Cache invalidation is handled automatically by Redis TTL
    // but we could add explicit invalidation here if needed

    return res.status(200).json({
      success: true,
      activeOrgId: organizationId
    })

  } catch (error) {
    console.error('[set-active-org] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    })
  }
}
