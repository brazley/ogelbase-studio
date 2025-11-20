import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

interface DiskAutoScaleConfig {
  enabled: boolean
  limit_gb: number
}

const DEFAULT_AUTO_SCALE_CONFIG: DiskAutoScaleConfig = {
  enabled: false,
  limit_gb: 8,
}

// GET - Get disk auto-scale config
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  // If no DATABASE_URL is configured, return default config
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_AUTO_SCALE_CONFIG)
  }

  // Try to query platform database for auto-scale config
  const { data, error } = await queryPlatformDatabase<DiskAutoScaleConfig>({
    query: `
      SELECT
        COALESCE(disk_auto_scale_enabled, false) as enabled,
        COALESCE(disk_auto_scale_limit_gb, disk_size_gb, 8) as limit_gb
      FROM platform.projects
      WHERE ref = $1
    `,
    parameters: [ref],
  })

  if (error || !data || data.length === 0) {
    // Fall back to default config if query fails
    return res.status(200).json(DEFAULT_AUTO_SCALE_CONFIG)
  }

  return res.status(200).json(data[0])
}

// POST - Update disk auto-scale
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query
  const { enabled, limit_gb } = req.body

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: { message: 'enabled must be a boolean' } })
  }

  if (limit_gb !== undefined && (typeof limit_gb !== 'number' || limit_gb < 8 || limit_gb > 16384)) {
    return res.status(400).json({ error: { message: 'limit_gb must be between 8 and 16384' } })
  }

  // If no DATABASE_URL is configured, return success with new config
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      enabled,
      limit_gb: limit_gb || DEFAULT_AUTO_SCALE_CONFIG.limit_gb,
    })
  }

  // Update auto-scale config in database
  const updateFields = ['disk_auto_scale_enabled = $2']
  const parameters = [ref, enabled]

  if (limit_gb !== undefined) {
    updateFields.push('disk_auto_scale_limit_gb = $3')
    parameters.push(limit_gb)
  }

  const { data, error } = await queryPlatformDatabase<DiskAutoScaleConfig>({
    query: `
      UPDATE platform.projects
      SET ${updateFields.join(', ')},
          updated_at = NOW()
      WHERE ref = $1
      RETURNING
        disk_auto_scale_enabled as enabled,
        disk_auto_scale_limit_gb as limit_gb
    `,
    parameters,
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to update auto-scale config' } })
  }

  return res.status(200).json(data?.[0] || { enabled, limit_gb: limit_gb || DEFAULT_AUTO_SCALE_CONFIG.limit_gb })
}
