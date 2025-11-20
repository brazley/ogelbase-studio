import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'

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

interface FreeProjectLimit {
  limit: number
  used: number
  remaining: number
}

const DEFAULT_LIMIT: FreeProjectLimit = {
  limit: 2,
  used: 0,
  remaining: 2,
}

// GET - Get free tier project limit info
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: { message: 'Organization slug is required' } })
  }

  // If no DATABASE_URL is configured, return default limit
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_LIMIT)
  }

  // Try to query platform database for project count
  const { data, error } = await queryPlatformDatabase<{ count: number }>({
    query: `
      SELECT COUNT(*)::int as count
      FROM platform.projects p
      JOIN platform.organizations o ON o.id = p.organization_id
      WHERE o.slug = $1
    `,
    parameters: [slug],
  })

  if (error) {
    // Fall back to default limit if query fails
    return res.status(200).json(DEFAULT_LIMIT)
  }

  const used = data?.[0]?.count || 0
  const limit = 2 // Default free tier limit

  return res.status(200).json({
    limit,
    used,
    remaining: Math.max(0, limit - used),
  })
}
