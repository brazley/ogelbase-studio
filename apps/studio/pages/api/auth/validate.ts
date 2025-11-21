/**
 * Token Validation Endpoint
 * GET /api/auth/validate
 *
 * Validates a session token and returns the associated user
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { extractBearerToken, hashToken } from 'lib/api/auth/utils'
import type { AuthError, PlatformUser, PlatformUserSession } from 'lib/api/auth/types'

interface ValidateResponse {
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    username?: string | null
    avatar_url?: string | null
    created_at: string
  }
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

    // Hash the token to match database storage
    const tokenHash = hashToken(token)

    // Query session with user data
    const sessionResult = await queryPlatformDatabase<PlatformUserSession & { user: PlatformUser }>({
      query: `
        SELECT
          s.id,
          s.user_id,
          s.token,
          s.expires_at,
          u.id as user_id,
          u.email,
          u.username,
          u.first_name,
          u.last_name,
          u.avatar_url,
          u.created_at,
          u.banned_until,
          u.deleted_at
        FROM platform.user_sessions s
        JOIN platform.users u ON s.user_id = u.id
        WHERE s.token = $1
      `,
      parameters: [tokenHash],
    })

    if (sessionResult.error) {
      console.error('[validate] Database error querying session:', sessionResult.error)
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

    // Check if account is deleted
    if (session.deleted_at) {
      return res.status(401).json({
        error: 'This account has been deleted',
        code: 'ACCOUNT_DELETED',
      })
    }

    // Check if account is banned
    if (session.banned_until) {
      const bannedUntil = new Date(session.banned_until)
      if (bannedUntil > new Date()) {
        return res.status(403).json({
          error: `Account is banned until ${bannedUntil.toISOString()}`,
          code: 'ACCOUNT_BANNED',
        })
      }
    }

    // Update last activity timestamp
    await queryPlatformDatabase({
      query: `
        UPDATE platform.user_sessions
        SET last_activity_at = NOW()
        WHERE id = $1
      `,
      parameters: [session.id],
    })

    // Return user info
    return res.status(200).json({
      user: {
        id: session.user_id,
        email: session.email,
        first_name: session.first_name || '',
        last_name: session.last_name || '',
        username: session.username,
        avatar_url: session.avatar_url,
        created_at: session.created_at,
      },
      expires_at: session.expires_at,
    })

  } catch (error) {
    console.error('[validate] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred during token validation',
      code: 'INTERNAL_ERROR',
    })
  }
}
