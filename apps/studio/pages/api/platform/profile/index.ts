import { NextApiRequest, NextApiResponse } from 'next'
import * as crypto from 'crypto'

import apiWrapper from 'lib/api/apiWrapper'
import {
  queryPlatformDatabase,
  PlatformOrganization,
  PlatformProject,
} from 'lib/api/platform/database'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'

/**
 * Platform user type from platform.users table
 */
interface PlatformUser {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
}

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.error('Platform database not configured: DATABASE_URL environment variable is missing')
    return res.status(503).json({
      error: 'Platform database not configured',
      code: 'DB_NOT_CONFIGURED',
      message: 'DATABASE_URL environment variable is missing. Please configure the platform database.',
    })
  }

  // Get user from auth token
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    })
  }

  // Validate the token and get user info
  const token = authHeader.substring(7)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  // Get user info from session token
  const { data: userData, error: userError } = await queryPlatformDatabase<PlatformUser>({
    query: `
      SELECT u.id, u.email, u.username, u.first_name, u.last_name
      FROM platform.users u
      JOIN platform.user_sessions s ON s.user_id = u.id
      WHERE s.token = $1 AND s.expires_at > NOW()
    `,
    parameters: [tokenHash],
  })

  if (userError) {
    console.error('Failed to validate session:', userError)
    return res.status(500).json({
      error: 'Failed to validate session',
      code: 'DB_QUERY_FAILED',
      message: 'Database query failed. Please check server logs for details.',
      details: userError instanceof Error ? userError.message : String(userError),
    })
  }

  const user = userData?.[0]
  if (!user) {
    return res.status(401).json({
      error: 'Invalid session',
      code: 'INVALID_SESSION',
      message: 'Session token is invalid or expired',
    })
  }

  // Get organizations user has access to via organization_members
  const { data: orgs, error: orgsError } = await queryPlatformDatabase<PlatformOrganization>({
    query: `
      SELECT DISTINCT o.*
      FROM platform.organizations o
      INNER JOIN platform.organization_members om ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.created_at ASC
    `,
    parameters: [user.id],
  })

  if (orgsError) {
    console.error('Failed to fetch organizations for profile:', orgsError)
    return res.status(500).json({
      error: 'Failed to fetch organizations',
      code: 'DB_QUERY_FAILED',
      message: 'Database query failed. Please check server logs for details.',
      details: orgsError instanceof Error ? orgsError.message : String(orgsError),
    })
  }

  // Get projects user has access to (direct membership OR via org membership)
  const { data: projects, error: projectsError } = await queryPlatformDatabase<PlatformProject>({
    query: `
      SELECT DISTINCT p.*
      FROM platform.projects p
      LEFT JOIN platform.project_members pm ON p.id = pm.project_id
      LEFT JOIN platform.organization_members om ON p.organization_id = om.organization_id
      WHERE pm.user_id = $1 OR om.user_id = $1
      ORDER BY p.created_at ASC
    `,
    parameters: [user.id],
  })

  if (projectsError) {
    console.error('Failed to fetch projects for profile:', projectsError)
    return res.status(500).json({
      error: 'Failed to fetch projects',
      code: 'DB_QUERY_FAILED',
      message: 'Database query failed. Please check server logs for details.',
      details: projectsError instanceof Error ? projectsError.message : String(projectsError),
    })
  }

  // Map projects to their organizations (only include orgs user has access to)
  const organizations = (orgs || []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    billing_email: org.billing_email || 'billing@ogelbase.com',
    projects: (projects || [])
      .filter((p) => p.organization_id === org.id)
      .map((p) => ({
        id: p.id,
        ref: p.ref,
        name: p.name,
        status: p.status,
        organization_id: p.organization_id,
        cloud_provider: 'railway',
        region: process.env.RAILWAY_REGION || 'us-west',
        inserted_at: p.created_at || new Date().toISOString(),
        connectionString: '',
      })),
  }))

  const response = {
    id: user.id,
    primary_email: user.email,
    username: user.username || user.email.split('@')[0],
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    organizations,
  }

  return res.status(200).json(response)
}
