/**
 * Sign In Endpoint
 * POST /api/auth/signin
 *
 * Authenticates a user with email and password, creating a session
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import {
  verifyPassword,
  signInSchema,
  generateToken,
  hashToken,
  generateTokenExpiry,
  getClientIp,
  getUserAgent,
  checkRateLimit,
  clearRateLimit,
} from 'lib/api/auth/utils'
import type { AuthResponse, AuthError, PlatformUser, PlatformUserSession } from 'lib/api/auth/types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse | AuthError>
) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate request body
    const validationResult = signInSchema.safeParse(req.body)

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.flatten().fieldErrors,
      })
    }

    const { email, password } = validationResult.data

    // Rate limiting check
    const clientIp = getClientIp(req as unknown as Request)
    if (checkRateLimit(`signin:${clientIp}`, 5, 15 * 60 * 1000)) {
      return res.status(429).json({
        error: 'Too many sign-in attempts. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      })
    }

    // Query user by email
    const userResult = await queryPlatformDatabase<PlatformUser>({
      query: `
        SELECT
          id,
          email,
          username,
          first_name,
          last_name,
          avatar_url,
          password_hash,
          banned_until,
          deleted_at,
          created_at
        FROM platform.users
        WHERE email = $1
      `,
      parameters: [email],
    })

    if (userResult.error) {
      console.error('[signin] Database error querying user:', userResult.error)
      return res.status(500).json({
        error: 'Authentication failed',
        code: 'DATABASE_ERROR',
      })
    }

    if (!userResult.data || userResult.data.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      })
    }

    const user = userResult.data[0]

    // Check if account is deleted
    if (user.deleted_at) {
      return res.status(401).json({
        error: 'This account has been deleted',
        code: 'ACCOUNT_DELETED',
      })
    }

    // Check if account is banned
    if (user.banned_until) {
      const bannedUntil = new Date(user.banned_until)
      if (bannedUntil > new Date()) {
        return res.status(403).json({
          error: `Account is banned until ${bannedUntil.toISOString()}`,
          code: 'ACCOUNT_BANNED',
        })
      }
    }

    // Verify password
    if (!user.password_hash) {
      return res.status(401).json({
        error: 'Password authentication not configured for this account',
        code: 'NO_PASSWORD_AUTH',
      })
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash)

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      })
    }

    // Clear rate limit on successful auth
    clearRateLimit(`signin:${clientIp}`)

    // Generate session token
    const sessionToken = generateToken()
    const tokenHash = hashToken(sessionToken)
    const expiresAt = generateTokenExpiry()
    const userAgent = getUserAgent(req as unknown as Request)

    // Create session in database
    const createSessionResult = await queryPlatformDatabase<PlatformUserSession>({
      query: `
        INSERT INTO platform.user_sessions (
          user_id,
          token,
          ip_address,
          user_agent,
          expires_at,
          last_activity_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING
          id,
          token,
          expires_at
      `,
      parameters: [
        user.id,
        tokenHash,
        clientIp,
        userAgent,
        expiresAt.toISOString(),
      ],
    })

    if (createSessionResult.error) {
      console.error('[signin] Database error creating session:', createSessionResult.error)
      return res.status(500).json({
        error: 'Failed to create session',
        code: 'SESSION_ERROR',
      })
    }

    if (!createSessionResult.data || createSessionResult.data.length === 0) {
      return res.status(500).json({
        error: 'Failed to create session',
        code: 'SESSION_CREATE_FAILED',
      })
    }

    // Update last sign in timestamp
    await queryPlatformDatabase({
      query: `
        UPDATE platform.users
        SET last_sign_in_at = NOW()
        WHERE id = $1
      `,
      parameters: [user.id],
    })

    // Return session token and user info
    return res.status(200).json({
      token: sessionToken, // Return the unhashed token to the client
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: user.username,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
      expires_at: expiresAt.toISOString(),
    })

  } catch (error) {
    console.error('[signin] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred during sign in',
      code: 'INTERNAL_ERROR',
    })
  }
}
