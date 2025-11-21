import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { authenticateAndVerifyProjectAccess, getClientIp, getUserAgent, logAuditEvent } from 'lib/api/platform/project-access'

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

interface DiskConfig {
  size_gb: number
  io_budget: number
  status: 'active' | 'modifying' | 'error'
}

const DEFAULT_DISK_CONFIG: DiskConfig = {
  size_gb: 8,
  io_budget: 2400,
  status: 'active',
}

// GET - Get disk configuration
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (any member can view)
  const result = await authenticateAndVerifyProjectAccess(req, res)
  if (!result) return // Response already sent

  const { access } = result
  const { ref } = req.query

  // If no DATABASE_URL is configured, return default disk config
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_DISK_CONFIG)
  }

  // Try to query platform database for disk config
  const { data, error } = await queryPlatformDatabase<DiskConfig>({
    query: `
      SELECT
        COALESCE(disk_size_gb, 8) as size_gb,
        COALESCE(disk_io_budget, 2400) as io_budget,
        'active' as status
      FROM platform.projects
      WHERE ref = $1
    `,
    parameters: [ref],
  })

  if (error || !data || data.length === 0) {
    // Fall back to default config if query fails
    return res.status(200).json(DEFAULT_DISK_CONFIG)
  }

  return res.status(200).json(data[0])
}

// POST - Update disk size
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (admin or owner can update)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'admin')
  if (!result) return // Response already sent

  const { user, access } = result
  const { size_gb } = req.body

  if (!size_gb || typeof size_gb !== 'number') {
    return res.status(400).json({ error: { message: 'size_gb is required and must be a number' } })
  }

  // Validate disk size
  if (size_gb < 8 || size_gb > 16384) {
    return res.status(400).json({ error: { message: 'Disk size must be between 8GB and 16384GB' } })
  }

  // If no DATABASE_URL is configured, return success with new config
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      size_gb,
      io_budget: Math.floor(size_gb * 300), // Rough estimate: 300 IOPS per GB
      status: 'modifying',
    })
  }

  // Update disk size in database
  const { data, error } = await queryPlatformDatabase<DiskConfig>({
    query: `
      UPDATE platform.projects
      SET disk_size_gb = $2,
          disk_io_budget = $2 * 300,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        disk_size_gb as size_gb,
        disk_io_budget as io_budget,
        'modifying' as status
    `,
    parameters: [access.project.id, size_gb],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to update disk size' } })
  }

  // Log audit event
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'disk.update',
    changes: { size_gb, io_budget: size_gb * 300 },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res
    .status(200)
    .json(data?.[0] || { size_gb, io_budget: size_gb * 300, status: 'modifying' })
}
