import jwt from 'jsonwebtoken'
import crypto from 'crypto'

/**
 * Generates a cryptographically secure JWT secret
 * @param length Length of the secret (minimum 32 characters recommended)
 * @returns Base64-encoded random string
 */
export function generateJWTSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('base64')
}

/**
 * JWT payload for Supabase tokens
 */
export interface SupabaseJWTPayload {
  role: 'anon' | 'service_role' | 'authenticated'
  iss: string
  iat: number
  exp: number
}

/**
 * Generates a JWT token for Supabase
 * @param secret JWT secret to sign the token
 * @param role The role for the token (anon, service_role, authenticated)
 * @param expiresIn Expiration time (e.g., '10y' for 10 years)
 * @returns Signed JWT token
 */
export function generateSupabaseJWT(
  secret: string,
  role: 'anon' | 'service_role' | 'authenticated',
  expiresIn: string = '10y'
): string {
  const now = Math.floor(Date.now() / 1000)

  const payload: SupabaseJWTPayload = {
    role,
    iss: 'supabase',
    iat: now,
    exp: now + getExpirationSeconds(expiresIn),
  }

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
  })
}

/**
 * Converts expiration string to seconds
 * @param expiresIn Expiration string (e.g., '10y', '30d', '24h')
 * @returns Number of seconds
 */
function getExpirationSeconds(expiresIn: string): number {
  const units: Record<string, number> = {
    y: 365 * 24 * 60 * 60, // years
    d: 24 * 60 * 60, // days
    h: 60 * 60, // hours
    m: 60, // minutes
    s: 1, // seconds
  }

  const match = expiresIn.match(/^(\d+)([ydhms])$/)
  if (!match) {
    throw new Error(`Invalid expiresIn format: ${expiresIn}`)
  }

  const [, value, unit] = match
  const multiplier = units[unit]

  if (!multiplier) {
    throw new Error(`Invalid time unit: ${unit}`)
  }

  return parseInt(value, 10) * multiplier
}

/**
 * Generates all required credentials for a Supabase project
 * @returns Object containing jwt_secret, anon_key, and service_role_key
 */
export function generateProjectCredentials(): {
  jwt_secret: string
  anon_key: string
  service_role_key: string
} {
  const jwtSecret = generateJWTSecret()
  const anonKey = generateSupabaseJWT(jwtSecret, 'anon')
  const serviceRoleKey = generateSupabaseJWT(jwtSecret, 'service_role')

  return {
    jwt_secret: jwtSecret,
    anon_key: anonKey,
    service_role_key: serviceRoleKey,
  }
}

/**
 * Verifies a JWT token
 * @param token JWT token to verify
 * @param secret JWT secret used to sign the token
 * @returns Decoded payload if valid, null if invalid
 */
export function verifySupabaseJWT(
  token: string,
  secret: string
): SupabaseJWTPayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as SupabaseJWTPayload

    return decoded
  } catch (error) {
    return null
  }
}
