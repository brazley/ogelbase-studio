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

interface DiskUtilization {
  used_gb: number
  total_gb: number
  percent: number
}

const DEFAULT_DISK_UTIL: DiskUtilization = {
  used_gb: 0.5,
  total_gb: 8,
  percent: 6.25,
}

// GET - Get disk utilization
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  // If no DATABASE_URL is configured, return default utilization
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_DISK_UTIL)
  }

  // Try to query platform database for disk utilization
  const { data, error } = await queryPlatformDatabase<DiskUtilization>({
    query: `
      SELECT
        COALESCE(db_size_bytes / 1073741824.0, 0.5) as used_gb,
        COALESCE(disk_size_gb, 8) as total_gb,
        COALESCE((db_size_bytes / 1073741824.0) / NULLIF(disk_size_gb, 0) * 100, 6.25) as percent
      FROM platform.projects
      WHERE ref = $1
    `,
    parameters: [ref],
  })

  if (error || !data || data.length === 0) {
    // Fall back to default utilization if query fails
    return res.status(200).json(DEFAULT_DISK_UTIL)
  }

  return res.status(200).json(data[0])
}
