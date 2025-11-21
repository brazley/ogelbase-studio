/**
 * Sign Out Endpoint
 * POST /api/auth/signout
 *
 * Terminates a user session by deleting it from the database
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { extractBearerToken, hashToken } from 'lib/api/auth/utils'
import type { SignOutResponse, AuthError } from 'lib/api/auth/types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SignOutResponse | AuthError>
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

    // Hash the token to match database storage
    const tokenHash = hashToken(token)

    // Delete the session from database
    const deleteSessionResult = await queryPlatformDatabase({
      query: `
        DELETE FROM platform.user_sessions
        WHERE token = $1
        RETURNING id
      `,
      parameters: [tokenHash],
    })

    if (deleteSessionResult.error) {
      console.error('[signout] Database error deleting session:', deleteSessionResult.error)
      return res.status(500).json({
        error: 'Failed to sign out',
        code: 'DATABASE_ERROR',
      })
    }

    if (!deleteSessionResult.data || deleteSessionResult.data.length === 0) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      })
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Successfully signed out',
    })

  } catch (error) {
    console.error('[signout] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred during sign out',
      code: 'INTERNAL_ERROR',
    })
  }
}
