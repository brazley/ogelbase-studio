import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'
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

interface OrganizationUsage {
  db_size_bytes: number
  db_size_gb: number
  storage_size_bytes: number
  storage_size_gb: number
  egress_bytes: number
  egress_gb: number
  monthly_active_users: number
  total_projects: number
  total_members: number
}

const DEFAULT_USAGE: OrganizationUsage = {
  db_size_bytes: 0,
  db_size_gb: 0,
  storage_size_bytes: 0,
  storage_size_gb: 0,
  egress_bytes: 0,
  egress_gb: 0,
  monthly_active_users: 0,
  total_projects: 0,
  total_members: 0,
}

// GET - Organization usage metrics
const handleGet = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // Verify user has access to this organization
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  // If no DATABASE_URL is configured, return empty usage
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_USAGE)
  }

  // Try to query platform database for usage metrics
  const { data, error } = await queryPlatformDatabase<OrganizationUsage>({
    query: `
      SELECT
        COALESCE(SUM(p.db_size_bytes), 0) as db_size_bytes,
        COALESCE(SUM(p.db_size_bytes) / 1073741824.0, 0) as db_size_gb,
        COALESCE(SUM(p.storage_size_bytes), 0) as storage_size_bytes,
        COALESCE(SUM(p.storage_size_bytes) / 1073741824.0, 0) as storage_size_gb,
        COALESCE(SUM(p.egress_bytes), 0) as egress_bytes,
        COALESCE(SUM(p.egress_bytes) / 1073741824.0, 0) as egress_gb,
        COALESCE(SUM(p.monthly_active_users), 0) as monthly_active_users,
        COUNT(p.id) as total_projects,
        (SELECT COUNT(*) FROM platform.organization_members om WHERE om.organization_id = o.id) as total_members
      FROM platform.organizations o
      LEFT JOIN platform.projects p ON p.organization_id = o.id
      WHERE o.slug = $1
      GROUP BY o.id
    `,
    parameters: [slug],
  })

  if (error) {
    // Fall back to default usage if query fails
    return res.status(200).json(DEFAULT_USAGE)
  }

  return res.status(200).json(data?.[0] || DEFAULT_USAGE)
}
