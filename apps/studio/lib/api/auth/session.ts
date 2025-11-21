/**
 * Session Management Utilities
 * Handles session validation, cleanup, and lifecycle management
 */

import { queryPlatformDatabase } from '../platform/database'
import { hashToken } from './utils'
import type { PlatformUserSession } from './types'

// ============================================
// Session Types
// ============================================

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
  lastActivityAt: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
}

export interface SessionWithUser extends Session {
  email: string
  firstName: string | null
  lastName: string | null
  username: string | null
}

// ============================================
// Session Validation
// ============================================

/**
 * Validate a session token and return session details with user info
 * @param token - The session token to validate
 * @returns Session with user details, or null if invalid/expired
 */
export async function validateSession(token: string): Promise<SessionWithUser | null> {
  try {
    const tokenHash = hashToken(token)

    const { data: sessions, error } = await queryPlatformDatabase<{
      id: string
      user_id: string
      token: string
      expires_at: string
      last_activity_at: string
      ip_address: string | null
      user_agent: string | null
      created_at: string
      email: string
      first_name: string | null
      last_name: string | null
      username: string | null
    }>({
      query: `
        SELECT
          s.id,
          s.user_id,
          s.token,
          s.expires_at,
          s.last_activity_at,
          s.ip_address,
          s.user_agent,
          s.created_at,
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

    if (error) {
      console.error('[validateSession] Database error:', error)
      return null
    }

    if (!sessions || sessions.length === 0) {
      return null
    }

    const session = sessions[0]

    // Update last activity timestamp (fire and forget)
    queryPlatformDatabase({
      query: 'UPDATE platform.user_sessions SET last_activity_at = NOW() WHERE id = $1',
      parameters: [session.id]
    }).catch(error => {
      console.error('[validateSession] Failed to update last_activity_at:', error)
    })

    return {
      id: session.id,
      userId: session.user_id,
      token: session.token,
      expiresAt: session.expires_at,
      lastActivityAt: session.last_activity_at,
      ipAddress: session.ip_address || undefined,
      userAgent: session.user_agent || undefined,
      createdAt: session.created_at,
      email: session.email,
      firstName: session.first_name,
      lastName: session.last_name,
      username: session.username
    }
  } catch (error) {
    console.error('[validateSession] Unexpected error:', error)
    return null
  }
}

// ============================================
// Session Cleanup
// ============================================

/**
 * Clean up expired sessions from the database
 * Should be called periodically (e.g., via cron job)
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const { data, error } = await queryPlatformDatabase<{ id: string }>({
      query: `
        DELETE FROM platform.user_sessions
        WHERE expires_at < NOW()
        RETURNING id
      `,
      parameters: []
    })

    if (error) {
      console.error('[cleanupExpiredSessions] Database error:', error)
      return 0
    }

    const deletedCount = data?.length || 0
    console.log(`[cleanupExpiredSessions] Deleted ${deletedCount} expired sessions`)
    return deletedCount
  } catch (error) {
    console.error('[cleanupExpiredSessions] Unexpected error:', error)
    return 0
  }
}

/**
 * Clean up inactive sessions (no activity for 30+ days)
 * @returns Number of sessions deleted
 */
export async function cleanupInactiveSessions(): Promise<number> {
  try {
    const { data, error } = await queryPlatformDatabase<{ id: string }>({
      query: `
        DELETE FROM platform.user_sessions
        WHERE last_activity_at < NOW() - INTERVAL '30 days'
        RETURNING id
      `,
      parameters: []
    })

    if (error) {
      console.error('[cleanupInactiveSessions] Database error:', error)
      return 0
    }

    const deletedCount = data?.length || 0
    console.log(`[cleanupInactiveSessions] Deleted ${deletedCount} inactive sessions`)
    return deletedCount
  } catch (error) {
    console.error('[cleanupInactiveSessions] Unexpected error:', error)
    return 0
  }
}

// ============================================
// User Session Management
// ============================================

/**
 * Get all active sessions for a user
 * @param userId - The user ID to query
 * @returns Array of active sessions
 */
export async function getUserSessions(userId: string): Promise<Session[]> {
  try {
    const { data: sessions, error } = await queryPlatformDatabase<{
      id: string
      user_id: string
      token: string
      expires_at: string
      last_activity_at: string
      ip_address: string | null
      user_agent: string | null
      created_at: string
    }>({
      query: `
        SELECT
          id,
          user_id,
          token,
          expires_at,
          last_activity_at,
          ip_address,
          user_agent,
          created_at
        FROM platform.user_sessions
        WHERE user_id = $1
          AND expires_at > NOW()
        ORDER BY last_activity_at DESC
      `,
      parameters: [userId]
    })

    if (error) {
      console.error('[getUserSessions] Database error:', error)
      return []
    }

    if (!sessions) {
      return []
    }

    return sessions.map(s => ({
      id: s.id,
      userId: s.user_id,
      token: s.token,
      expiresAt: s.expires_at,
      lastActivityAt: s.last_activity_at,
      ipAddress: s.ip_address || undefined,
      userAgent: s.user_agent || undefined,
      createdAt: s.created_at
    }))
  } catch (error) {
    console.error('[getUserSessions] Unexpected error:', error)
    return []
  }
}

/**
 * Revoke a specific session
 * @param sessionId - The session ID to revoke
 * @returns True if successful, false otherwise
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await queryPlatformDatabase<{ id: string }>({
      query: `
        DELETE FROM platform.user_sessions
        WHERE id = $1
        RETURNING id
      `,
      parameters: [sessionId]
    })

    if (error) {
      console.error('[revokeSession] Database error:', error)
      return false
    }

    return data !== undefined && data.length > 0
  } catch (error) {
    console.error('[revokeSession] Unexpected error:', error)
    return false
  }
}

/**
 * Revoke all sessions for a user except the current one
 * @param userId - The user ID
 * @param exceptSessionId - Session ID to keep active
 * @returns Number of sessions revoked
 */
export async function revokeOtherSessions(userId: string, exceptSessionId: string): Promise<number> {
  try {
    const { data, error } = await queryPlatformDatabase<{ id: string }>({
      query: `
        DELETE FROM platform.user_sessions
        WHERE user_id = $1 AND id != $2
        RETURNING id
      `,
      parameters: [userId, exceptSessionId]
    })

    if (error) {
      console.error('[revokeOtherSessions] Database error:', error)
      return 0
    }

    return data?.length || 0
  } catch (error) {
    console.error('[revokeOtherSessions] Unexpected error:', error)
    return 0
  }
}

/**
 * Revoke all sessions for a user
 * @param userId - The user ID
 * @returns Number of sessions revoked
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  try {
    const { data, error } = await queryPlatformDatabase<{ id: string }>({
      query: `
        DELETE FROM platform.user_sessions
        WHERE user_id = $1
        RETURNING id
      `,
      parameters: [userId]
    })

    if (error) {
      console.error('[revokeAllUserSessions] Database error:', error)
      return 0
    }

    return data?.length || 0
  } catch (error) {
    console.error('[revokeAllUserSessions] Unexpected error:', error)
    return 0
  }
}

// ============================================
// Session Analytics
// ============================================

/**
 * Get session statistics for a user
 * @param userId - The user ID
 */
export async function getUserSessionStats(userId: string): Promise<{
  totalActive: number
  oldestSession: string | null
  newestSession: string | null
  devicesCount: number
}> {
  try {
    const { data, error } = await queryPlatformDatabase<{
      total_active: string
      oldest_session: string | null
      newest_session: string | null
      devices_count: string
    }>({
      query: `
        SELECT
          COUNT(*) as total_active,
          MIN(created_at) as oldest_session,
          MAX(created_at) as newest_session,
          COUNT(DISTINCT user_agent) as devices_count
        FROM platform.user_sessions
        WHERE user_id = $1
          AND expires_at > NOW()
      `,
      parameters: [userId]
    })

    if (error || !data || data.length === 0) {
      return {
        totalActive: 0,
        oldestSession: null,
        newestSession: null,
        devicesCount: 0
      }
    }

    const stats = data[0]
    return {
      totalActive: parseInt(stats.total_active, 10),
      oldestSession: stats.oldest_session,
      newestSession: stats.newest_session,
      devicesCount: parseInt(stats.devices_count, 10)
    }
  } catch (error) {
    console.error('[getUserSessionStats] Unexpected error:', error)
    return {
      totalActive: 0,
      oldestSession: null,
      newestSession: null,
      devicesCount: 0
    }
  }
}
