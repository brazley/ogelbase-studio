/**
 * Database Helper Utilities for E2E Tests
 *
 * Provides utilities to interact with the test database:
 * - Create test users directly
 * - Clean up test data
 * - Verify database state
 */

import { queryPlatformDatabase } from '../../../lib/api/platform/database'
import type { TestUser } from './test-users'

export interface DatabaseUser {
  id: string
  email: string
  username?: string
  first_name?: string
  last_name?: string
  created_at: string
}

export interface DatabaseSession {
  id: string
  user_id: string
  token: string
  expires_at: string
  created_at: string
}

/**
 * Find user by email in database
 */
export async function findUserByEmail(email: string): Promise<DatabaseUser | null> {
  const result = await queryPlatformDatabase<DatabaseUser>({
    query: `
      SELECT id, email, username, first_name, last_name, created_at
      FROM platform.users
      WHERE email = $1 AND deleted_at IS NULL
    `,
    parameters: [email],
  })

  if (result.error) {
    console.error('[findUserByEmail] Database error:', result.error)
    return null
  }

  return result.data && result.data.length > 0 ? result.data[0] : null
}

/**
 * Find all sessions for a user
 */
export async function findSessionsByUserId(userId: string): Promise<DatabaseSession[]> {
  const result = await queryPlatformDatabase<DatabaseSession>({
    query: `
      SELECT id, user_id, token, expires_at, created_at
      FROM platform.user_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    parameters: [userId],
  })

  if (result.error) {
    console.error('[findSessionsByUserId] Database error:', result.error)
    return []
  }

  return result.data || []
}

/**
 * Delete user and all related data
 * Use this to clean up after tests
 */
export async function deleteUserByEmail(email: string): Promise<boolean> {
  const result = await queryPlatformDatabase({
    query: `
      DELETE FROM platform.users
      WHERE email = $1
    `,
    parameters: [email],
  })

  if (result.error) {
    console.error('[deleteUserByEmail] Database error:', result.error)
    return false
  }

  return true
}

/**
 * Delete all sessions for a user
 */
export async function deleteSessionsByUserId(userId: string): Promise<boolean> {
  const result = await queryPlatformDatabase({
    query: `
      DELETE FROM platform.user_sessions
      WHERE user_id = $1
    `,
    parameters: [userId],
  })

  if (result.error) {
    console.error('[deleteSessionsByUserId] Database error:', result.error)
    return false
  }

  return true
}

/**
 * Clean up all test users (emails containing 'test.example.com')
 * WARNING: Use only in test environment!
 */
export async function cleanupAllTestUsers(): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') {
    console.error('[cleanupAllTestUsers] Cannot run in production!')
    return false
  }

  const result = await queryPlatformDatabase({
    query: `
      DELETE FROM platform.users
      WHERE email LIKE '%test.example.com'
    `,
    parameters: [],
  })

  if (result.error) {
    console.error('[cleanupAllTestUsers] Database error:', result.error)
    return false
  }

  console.log('[cleanupAllTestUsers] Cleaned up test users')
  return true
}

/**
 * Verify session exists and is valid
 */
export async function verifySessionExists(userId: string, tokenHash: string): Promise<boolean> {
  const result = await queryPlatformDatabase<DatabaseSession>({
    query: `
      SELECT id
      FROM platform.user_sessions
      WHERE user_id = $1 AND token = $2 AND expires_at > NOW()
    `,
    parameters: [userId, tokenHash],
  })

  if (result.error) {
    console.error('[verifySessionExists] Database error:', result.error)
    return false
  }

  return result.data && result.data.length > 0
}

/**
 * Count active sessions for a user
 */
export async function countActiveSessions(userId: string): Promise<number> {
  const result = await queryPlatformDatabase<{ count: string }>({
    query: `
      SELECT COUNT(*) as count
      FROM platform.user_sessions
      WHERE user_id = $1 AND expires_at > NOW()
    `,
    parameters: [userId],
  })

  if (result.error) {
    console.error('[countActiveSessions] Database error:', result.error)
    return 0
  }

  return parseInt(result.data?.[0]?.count || '0', 10)
}
