import type { NextApiRequest, NextApiResponse } from 'next'
import type { ResponseError } from 'types'
import { queryPlatformDatabase } from './platform/database'
import { jwtVerify } from 'jose'

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

    // Get JWT secret from environment
    const jwtSecret = process.env.SUPABASE_JWT_SECRET
    if (!jwtSecret) {
      console.error('[apiAuthenticate] SUPABASE_JWT_SECRET not configured')
      return { error: new Error('JWT secret not configured') }
    }

    // Decode and verify the GoTrue JWT
    let userId: string
    try {
      const secret = new TextEncoder().encode(jwtSecret)
      const { payload } = await jwtVerify(token, secret, {
        audience: 'authenticated'
      })

      // Extract user ID from JWT payload
      userId = payload.sub as string
      if (!userId) {
        return { error: new Error('Invalid JWT: missing user ID') }
      }
    } catch (jwtError) {
      console.error('[apiAuthenticate] JWT verification failed:', jwtError)
      if (jwtError instanceof Error) {
        if (jwtError.message.includes('expired')) {
          return { error: new Error('Token has expired') }
        }
        return { error: new Error('Invalid or malformed token') }
      }
      return { error: new Error('JWT verification failed') }
    }

    // Look up user in platform.users table
    const { data: users, error: dbError } = await queryPlatformDatabase<{
      user_id: string
      email: string
      first_name: string | null
      last_name: string | null
      username: string | null
    }>({
      query: `
        SELECT
          id as user_id,
          email,
          first_name,
          last_name,
          username
        FROM platform.users
        WHERE id = $1
          AND deleted_at IS NULL
          AND (banned_until IS NULL OR banned_until < NOW())
      `,
      parameters: [userId]
    })

    if (dbError) {
      console.error('[apiAuthenticate] Database error:', dbError)
      return { error: new Error('Database error during authentication') }
    }

    if (!users || users.length === 0) {
      return { error: new Error('User not found or account disabled') }
    }

    const user = users[0]

    // Return user context (sessionId is the user ID for JWT-based auth)
    return {
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      sessionId: userId // Use userId as sessionId for backwards compatibility
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

  // Get JWT secret from environment
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT secret not configured')
  }

  try {
    // Decode and verify the GoTrue JWT
    const secret = new TextEncoder().encode(jwtSecret)
    const { payload } = await jwtVerify(token, secret, {
      audience: 'authenticated'
    })

    const userId = payload.sub as string
    if (!userId) {
      throw new Error('Invalid JWT: missing user ID')
    }

    return { sub: userId }
  } catch (jwtError) {
    if (jwtError instanceof Error) {
      throw new Error(`JWT verification failed: ${jwtError.message}`)
    }
    throw new Error('JWT verification failed')
  }
}
