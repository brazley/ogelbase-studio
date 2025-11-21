/**
 * Session Cleanup Endpoint
 * POST /api/auth/cleanup-sessions
 *
 * Removes expired and inactive sessions from the database
 * This endpoint should be called periodically (e.g., via cron job)
 *
 * Security: Requires admin privileges or API key authentication
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { cleanupExpiredSessions, cleanupInactiveSessions } from 'lib/api/auth/session'

interface CleanupResponse {
  success: boolean
  expiredDeleted: number
  inactiveDeleted: number
  totalDeleted: number
  timestamp: string
}

interface CleanupError {
  error: string
  code?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CleanupResponse | CleanupError>
) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  try {
    // Security check: Require API key or internal secret
    const authHeader = req.headers.authorization
    const internalSecret = process.env.INTERNAL_API_SECRET

    // Check if request is from internal cron job
    if (internalSecret && authHeader === `Bearer ${internalSecret}`) {
      // Authorized via internal secret
    } else {
      // For external requests, would implement proper admin authentication here
      // For now, we'll allow if PLATFORM_MODE allows it
      // TODO: Implement proper role-based access control
      return res.status(401).json({
        error: 'Unauthorized. This endpoint requires admin privileges.',
        code: 'UNAUTHORIZED'
      })
    }

    console.log('[cleanup-sessions] Starting session cleanup...')

    // Run cleanup operations
    const expiredDeleted = await cleanupExpiredSessions()
    const inactiveDeleted = await cleanupInactiveSessions()
    const totalDeleted = expiredDeleted + inactiveDeleted

    console.log('[cleanup-sessions] Cleanup complete:', {
      expiredDeleted,
      inactiveDeleted,
      totalDeleted
    })

    return res.status(200).json({
      success: true,
      expiredDeleted,
      inactiveDeleted,
      totalDeleted,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[cleanup-sessions] Unexpected error:', error)
    return res.status(500).json({
      error: 'Failed to cleanup sessions',
      code: 'INTERNAL_ERROR'
    })
  }
}
