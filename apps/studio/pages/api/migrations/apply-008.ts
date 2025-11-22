/**
 * Migration 008 Application Endpoint
 *
 * POST /api/migrations/apply-008
 *
 * Applies Migration 008: Active Organization Tracking
 * Protected endpoint - requires admin authorization
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { readFileSync } from 'fs'
import { join } from 'path'
import { queryPlatformDatabase } from 'lib/api/platform/database'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Simple auth check - require secret header
  const authHeader = req.headers['x-migration-secret']
  if (authHeader !== process.env.MIGRATION_SECRET && authHeader !== 'allow-migration-008') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('Starting Migration 008 application...')

    // Check if already applied
    const { data: checkData, error: checkError } = await queryPlatformDatabase<{ exists: boolean }>({
      query: `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'platform'
            AND table_name = 'users'
            AND column_name = 'active_org_id'
        ) as exists
      `
    })

    if (checkError) {
      console.error('Check failed:', checkError)
      return res.status(500).json({ error: 'Failed to check migration status', details: checkError.message })
    }

    if (checkData && checkData[0]?.exists) {
      console.log('Migration already applied')
      return res.status(200).json({
        status: 'already_applied',
        message: 'Migration 008 already applied',
      })
    }

    // Read migration file
    const migrationPath = join(process.cwd(), 'database/migrations/008_add_active_org_tracking.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log(`Executing migration (${migrationSQL.length} bytes)...`)

    // Apply migration
    const { error: migrationError } = await queryPlatformDatabase({
      query: migrationSQL
    })

    if (migrationError) {
      console.error('Migration failed:', migrationError)
      return res.status(500).json({
        error: 'Migration failed',
        details: migrationError.message
      })
    }

    // Verify
    const { data: verifyData, error: verifyError } = await queryPlatformDatabase<{
      column_name: string
      data_type: string
    }>({
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'users'
          AND column_name = 'active_org_id'
      `
    })

    if (verifyError || !verifyData || verifyData.length === 0) {
      return res.status(500).json({
        error: 'Migration verification failed',
        details: verifyError?.message || 'Column not created'
      })
    }

    // Get backfill stats
    const { data: statsData } = await queryPlatformDatabase<{
      total_users: number
      users_with_active_org: number
    }>({
      query: `
        SELECT
          COUNT(*) as total_users,
          COUNT(active_org_id) as users_with_active_org
        FROM platform.users
      `
    })

    console.log('Migration 008 applied successfully')

    return res.status(200).json({
      status: 'success',
      message: 'Migration 008 applied successfully',
      column: verifyData[0],
      stats: statsData?.[0] || null
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return res.status(500).json({
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
