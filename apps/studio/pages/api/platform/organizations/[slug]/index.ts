import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformOrganization } from 'lib/api/platform/database'
import { verifyOrgAccess } from 'lib/api/platform/org-access-control'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.error('Platform database not configured: DATABASE_URL environment variable is missing')
    return res.status(503).json({
      error: 'Platform database not configured',
      code: 'DB_NOT_CONFIGURED',
      message: 'DATABASE_URL environment variable is missing. Please configure the platform database.',
    })
  }

  // Verify user has access to this organization
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  const { data, error } = await queryPlatformDatabase<PlatformOrganization>({
    query: 'SELECT * FROM platform.organizations WHERE slug = $1',
    parameters: [slug],
  })

  if (error) {
    console.error(`Failed to fetch organization '${slug}':`, error)
    return res.status(500).json({
      error: 'Failed to fetch organization',
      code: 'DB_QUERY_FAILED',
      message: 'Database query failed. Please check server logs for details.',
      details: error instanceof Error ? error.message : String(error),
    })
  }

  if (!data || data.length === 0) {
    return res
      .status(404)
      .json({ error: { message: `Organization with slug '${slug}' not found` } })
  }

  const organization = data[0]
  return res.status(200).json(organization)
}
