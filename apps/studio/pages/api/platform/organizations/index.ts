import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformOrganization } from 'lib/api/platform/database'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.error('Platform database not configured: DATABASE_URL environment variable is missing')
    return res.status(503).json({
      error: 'Platform database not configured',
      code: 'DB_NOT_CONFIGURED',
      message: 'DATABASE_URL environment variable is missing. Please configure the platform database.',
    })
  }

  // Query only organizations the user is a member of
  const { data, error } = await queryPlatformDatabase<
    PlatformOrganization & { role: string; member_id: string }
  >({
    query: `
      SELECT
        o.*,
        om.role,
        om.id as member_id
      FROM platform.organizations o
      INNER JOIN platform.organization_members om ON om.organization_id = o.id
      WHERE om.user_id = $1
      ORDER BY o.name
    `,
    parameters: [req.user!.userId],
  })

  if (error) {
    console.error('Failed to fetch organizations:', error)
    return res.status(500).json({
      error: 'Failed to fetch organizations',
      code: 'DB_QUERY_FAILED',
      message: 'Database query failed. Please check server logs for details.',
      details: error instanceof Error ? error.message : String(error),
    })
  }

  return res.status(200).json(data || [])
}
