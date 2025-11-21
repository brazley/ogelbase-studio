/**
 * Sign Up Endpoint
 * POST /api/auth/signup
 *
 * Creates a new user account with email and password authentication
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { hashPassword, signUpSchema, getClientIp, getUserAgent } from 'lib/api/auth/utils'
import type { AuthResponse, AuthError, PlatformUser } from 'lib/api/auth/types'

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
    const validationResult = signUpSchema.safeParse(req.body)

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.flatten().fieldErrors,
      })
    }

    const { email, password, first_name, last_name, username } = validationResult.data

    // Check if user already exists
    const existingUserResult = await queryPlatformDatabase<PlatformUser>({
      query: `
        SELECT id, email
        FROM platform.users
        WHERE email = $1 AND deleted_at IS NULL
      `,
      parameters: [email],
    })

    if (existingUserResult.error) {
      console.error('[signup] Database error checking existing user:', existingUserResult.error)
      return res.status(500).json({
        error: 'Failed to check existing user',
        code: 'DATABASE_ERROR',
      })
    }

    if (existingUserResult.data && existingUserResult.data.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists',
        code: 'EMAIL_EXISTS',
      })
    }

    // Check if username is taken (if provided)
    if (username) {
      const existingUsernameResult = await queryPlatformDatabase<PlatformUser>({
        query: `
          SELECT id, username
          FROM platform.users
          WHERE username = $1 AND deleted_at IS NULL
        `,
        parameters: [username],
      })

      if (existingUsernameResult.error) {
        console.error('[signup] Database error checking existing username:', existingUsernameResult.error)
        return res.status(500).json({
          error: 'Failed to check existing username',
          code: 'DATABASE_ERROR',
        })
      }

      if (existingUsernameResult.data && existingUsernameResult.data.length > 0) {
        return res.status(409).json({
          error: 'This username is already taken',
          code: 'USERNAME_EXISTS',
        })
      }
    }

    // Hash password
    const password_hash = await hashPassword(password)

    // Create user
    const createUserResult = await queryPlatformDatabase<PlatformUser>({
      query: `
        INSERT INTO platform.users (
          email,
          username,
          first_name,
          last_name,
          password_hash,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          email,
          username,
          first_name,
          last_name,
          avatar_url,
          created_at
      `,
      parameters: [
        email,
        username || null,
        first_name,
        last_name,
        password_hash,
        JSON.stringify({
          signup_ip: getClientIp(req as unknown as Request),
          signup_user_agent: getUserAgent(req as unknown as Request),
        }),
      ],
    })

    if (createUserResult.error) {
      console.error('[signup] Database error creating user:', createUserResult.error)
      return res.status(500).json({
        error: 'Failed to create user account',
        code: 'DATABASE_ERROR',
      })
    }

    if (!createUserResult.data || createUserResult.data.length === 0) {
      return res.status(500).json({
        error: 'Failed to create user account',
        code: 'CREATE_FAILED',
      })
    }

    const newUser = createUserResult.data[0]

    // TODO: Send verification email
    // await sendVerificationEmail(email, verificationToken)

    // Return user info (excluding password hash)
    return res.status(201).json({
      token: '', // No session token on signup - user must sign in
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name || '',
        last_name: newUser.last_name || '',
        username: newUser.username,
        avatar_url: newUser.avatar_url,
        created_at: newUser.created_at,
      },
      expires_at: '', // No expiry on signup - user must sign in
    })

  } catch (error) {
    console.error('[signup] Unexpected error:', error)
    return res.status(500).json({
      error: 'An unexpected error occurred during signup',
      code: 'INTERNAL_ERROR',
    })
  }
}
