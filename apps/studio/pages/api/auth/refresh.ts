/**
 * Token Refresh Endpoint
 * POST /api/auth/refresh
 *
 * Refreshes an existing session token, optionally issuing a new token if near expiration
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import {
  extractBearerToken,
  hashToken,
  generateToken,
  generateTokenExpiry,
  isTokenNearExpiry,
} from 'lib/api/auth/utils'
import type { RefreshTokenResponse, AuthError, PlatformUserSession } from 'lib/api/auth/types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshTokenResponse | AuthError>
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

    // Query session
    const sessionResult = await queryPlatformDatabase<PlatformUserSession>({
      query: `
        SELECT
          id,
          user_id,
          token,
          expires_at,
          last_activity_at
        FROM platform.user_sessions
        WHERE token = $1
      `,
      parameters: [tokenHash],
    })

    if (sessionResult.error) {
      console.error('[refresh] Database error querying session:', sessionResult.error)
      return res.status(500).json({
        error: 'Failed to validate session',
        code: 'DATABASE_ERROR',
      })
    }

    if (!sessionResult.data || sessionResult.data.length === 0) {
      return res.status(401).json({
        error: 'Invalid session token',
        code: 'INVALID_TOKEN',
      })
    }

    const session = sessionResult.data[0]
    const expiresAt = new Date(session.expires_at)

    // Check if session has expired
    if (expiresAt <= new Date()) {
      // Delete expired session
      await queryPlatformDatabase({
        query: `DELETE FROM platform.user_sessions WHERE id = $1`,
        parameters: [session.id],
      })

      return res.status(401).json({
        error: 'Session has expired',
        code: 'SESSION_EXPIRED',
      })
    }

    // Check if token is near expiration (within 1 hour)
    const shouldIssueNewToken = isTokenNearExpiry(expiresAt)

    let newToken = token
    let newTokenHash = tokenHash
    let newExpiresAt = expiresAt

    if (shouldIssueNewToken) {
      // Generate new token
      newToken = generateToken()
      newTokenHash = hashToken(newToken)
      newExpiresAt = generateTokenExpiry()

      // Update session with new token
      const updateSessionResult = await queryPlatformDatabase<PlatformUserSession>({
        query: `
          UPDATE platform.user_sessions
          SET
            token = $1,
            expires_at = $2,
            last_activity_at = NOW()
          WHERE id = $3
          RETURNING
            id,
            token,
            expires_at
        `,
        parameters: [newTokenHash, newExpiresAt.toISOString(), session.id],
      })

      if (updateSessionResult.error) {
        console.error('[refresh] Database error updating session:', updateSessionResult.error)
        return res.status(500).json({
          error: 'Failed to refresh token',
          code: 'UPDATE_ERROR',
        })
      }
    } else {
      // Just update last activity timestamp
      await queryPlatformDatabase({
        query: `
          UPDATE platform.user_sessions
          SET last_activity_at = NOW()
          WHERE id = $1
        `,
        parameters: [session.id],
      })
    }

    // Return token (new if refreshed, same if not)
    return res.status(200).json({
      token: newToken,
      expires_at: newExpiresAt.toISOString(),
    })

  } catch (error) {
    console.error('[refresh] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred during token refresh',
      code: 'INTERNAL_ERROR',
    })
  }
}
