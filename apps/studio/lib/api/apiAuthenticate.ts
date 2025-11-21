import type { NextApiRequest, NextApiResponse } from 'next'
import type { ResponseError } from 'types'
import { queryPlatformDatabase } from './platform/database'
import * as crypto from 'crypto'

/**
 * User context returned by apiAuthenticate
 */
export interface UserContext {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  username: string | null
  sessionId: string
}

/**
 * Use this method on api routes to check if user is authenticated and having required permissions.
 * This method can only be used from the server side.
 *
 * @param {NextApiRequest}    req
 * @param {NextApiResponse}   res
 *
 * @returns {UserContext | {error: ResponseError}}
 *   UserContext with user details, or error object if authentication fails
 */
export async function apiAuthenticate(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<UserContext | { error: ResponseError }> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { error: new Error('Missing or invalid authorization header') }
    }

    const token = authHeader.replace(/^Bearer /i, '').trim()

    if (!token) {
      return { error: new Error('Empty authorization token') }
    }

    // Hash the token to match database storage
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Query session from platform.user_sessions
    const { data: sessions, error: dbError } = await queryPlatformDatabase<{
      session_id: string
      user_id: string
      expires_at: string
      last_activity_at: string
      email: string
      first_name: string | null
      last_name: string | null
      username: string | null
    }>({
      query: `
        SELECT
          s.id as session_id,
          s.user_id,
          s.expires_at,
          s.last_activity_at,
          u.email,
          u.first_name,
          u.last_name,
          u.username
        FROM platform.user_sessions s
        JOIN platform.users u ON s.user_id = u.id
        WHERE s.token = $1
          AND s.expires_at > NOW()
          AND u.deleted_at IS NULL
          AND u.banned_until IS NULL
      `,
      parameters: [tokenHash]
    })

    if (dbError) {
      console.error('[apiAuthenticate] Database error:', dbError)
      return { error: new Error('Database error during authentication') }
    }

    if (!sessions || sessions.length === 0) {
      return { error: new Error('Invalid or expired session') }
    }

    const session = sessions[0]

    // Update last_activity_at (fire and forget - don't wait)
    queryPlatformDatabase({
      query: 'UPDATE platform.user_sessions SET last_activity_at = NOW() WHERE id = $1',
      parameters: [session.session_id]
    }).catch(error => {
      console.error('[apiAuthenticate] Failed to update last_activity_at:', error)
    })

    // Return user context
    return {
      userId: session.user_id,
      email: session.email,
      firstName: session.first_name,
      lastName: session.last_name,
      username: session.username,
      sessionId: session.session_id
    }
  } catch (error) {
    console.error('[apiAuthenticate] Unexpected error:', error)
    return { error: error as ResponseError }
  }
}

/**
 * Extract user ID from request (requires apiAuthenticate to be called first)
 * @deprecated Use apiAuthenticate directly instead
 */
export async function fetchUserClaims(req: NextApiRequest): Promise<{ sub: string }> {
  const token = req.headers.authorization?.replace(/bearer /i, '')
  if (!token) {
    throw new Error('missing access token')
  }

  // For backwards compatibility, we'll still validate the token
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const { data: sessions, error } = await queryPlatformDatabase<{ user_id: string }>({
    query: `
      SELECT user_id
      FROM platform.user_sessions
      WHERE token = $1 AND expires_at > NOW()
    `,
    parameters: [tokenHash]
  })

  if (error) {
    throw error
  }

  if (!sessions || sessions.length === 0) {
    throw new Error('The user does not exist')
  }

  return { sub: sessions[0].user_id }
}
