/**
 * Authentication Utilities
 * Helper functions for password hashing, token generation, and validation
 */

import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { z } from 'zod'

// ============================================
// Validation Schemas
// ============================================

export const signUpSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{3,50}$/, 'Username must be 3-50 characters, alphanumeric with - and _')
    .optional(),
})

export const signInSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

export const refreshTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

// ============================================
// Password Hashing
// ============================================

const SALT_ROUNDS = 10

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ============================================
// Token Generation
// ============================================

/**
 * Generate a secure random token
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Generate a SHA-256 hash of a token for storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Generate token expiration time (24 hours from now)
 */
export function generateTokenExpiry(): Date {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24)
  return expiresAt
}

/**
 * Check if a token is near expiration (within 1 hour)
 */
export function isTokenNearExpiry(expiresAt: Date): boolean {
  const oneHourFromNow = new Date()
  oneHourFromNow.setHours(oneHourFromNow.getHours() + 1)
  return expiresAt <= oneHourFromNow
}

// ============================================
// Rate Limiting (basic implementation)
// ============================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Basic rate limiting check
 * @param identifier - IP address or user identifier
 * @param maxAttempts - Maximum attempts allowed (default 5)
 * @param windowMs - Time window in milliseconds (default 15 minutes)
 * @returns true if rate limit exceeded
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000
): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  if (!entry || now > entry.resetAt) {
    // No entry or expired - create new entry
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    })
    return false
  }

  if (entry.count >= maxAttempts) {
    return true // Rate limit exceeded
  }

  // Increment count
  entry.count++
  return false
}

/**
 * Clear rate limit for an identifier (for testing or after successful auth)
 */
export function clearRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier)
}

// ============================================
// Request Helpers
// ============================================

/**
 * Extract IP address from request
 */
export function getClientIp(req: Request): string {
  // Check various headers for the real IP
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return 'unknown'
}

/**
 * Extract user agent from request
 */
export function getUserAgent(req: Request): string {
  return req.headers.get('user-agent') || 'unknown'
}

/**
 * Extract authorization token from header
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return null
  }

  const match = authHeader.match(/^Bearer (.+)$/)
  return match ? match[1] : null
}
