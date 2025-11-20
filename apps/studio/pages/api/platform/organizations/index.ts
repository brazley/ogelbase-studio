import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformOrganization } from 'lib/api/platform/database'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'

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
  // If no DATABASE_URL is configured, return default organization
  if (!process.env.DATABASE_URL) {
    const defaultOrganizations = [
      {
        id: 1,
        name: 'Org 1',
        slug: 'org-1',
        billing_email: 'admin@org1.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    return res.status(200).json(defaultOrganizations)
  }

  // Query all organizations from platform database
  const { data, error } = await queryPlatformDatabase<PlatformOrganization>({
    query: 'SELECT * FROM platform.organizations ORDER BY name',
    parameters: [],
  })

  if (error) {
    // If database query fails, fall back to default organization
    const defaultOrganizations = [
      {
        id: 1,
        name: 'Org 1',
        slug: 'org-1',
        billing_email: 'admin@org1.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    return res.status(200).json(defaultOrganizations)
  }

  return res.status(200).json(data || [])
}
