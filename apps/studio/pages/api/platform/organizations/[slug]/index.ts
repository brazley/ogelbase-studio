import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformOrganization } from 'lib/api/platform/database'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // If no DATABASE_URL is configured, return default organization for 'org-1'
  if (!process.env.DATABASE_URL) {
    if (slug === 'org-1') {
      const defaultOrganization = {
        id: 1,
        name: 'Org 1',
        slug: 'org-1',
        billing_email: 'admin@org1.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return res.status(200).json(defaultOrganization)
    }
    return res.status(404).json({ error: { message: `Organization with slug '${slug}' not found` } })
  }

  const { data, error } = await queryPlatformDatabase<PlatformOrganization>({
    query: 'SELECT * FROM platform.organizations WHERE slug = $1',
    parameters: [slug],
  })

  if (error) {
    // If database query fails, fall back to default organization for 'org-1'
    if (slug === 'org-1') {
      const defaultOrganization = {
        id: 1,
        name: 'Org 1',
        slug: 'org-1',
        billing_email: 'admin@org1.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return res.status(200).json(defaultOrganization)
    }
    return res.status(404).json({ error: { message: `Organization with slug '${slug}' not found` } })
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: { message: `Organization with slug '${slug}' not found` } })
  }

  const organization = data[0]
  return res.status(200).json(organization)
}
