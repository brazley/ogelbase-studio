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

interface ComputeConfig {
  instance_size: string
  cpu: string
  memory_gb: number
}

const INSTANCE_SIZES = {
  micro: { cpu: '2-core shared', memory_gb: 1 },
  small: { cpu: '2-core shared', memory_gb: 2 },
  medium: { cpu: '2-core', memory_gb: 4 },
  large: { cpu: '4-core', memory_gb: 8 },
  xlarge: { cpu: '8-core', memory_gb: 16 },
  '2xlarge': { cpu: '16-core', memory_gb: 32 },
  '4xlarge': { cpu: '32-core', memory_gb: 64 },
  '8xlarge': { cpu: '64-core', memory_gb: 128 },
  '12xlarge': { cpu: '96-core', memory_gb: 192 },
  '16xlarge': { cpu: '128-core', memory_gb: 256 },
}

const DEFAULT_COMPUTE_CONFIG: ComputeConfig = {
  instance_size: 'micro',
  cpu: '2-core shared',
  memory_gb: 1,
}

// GET - Get compute instance size
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  // If no DATABASE_URL is configured, return default compute config
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_COMPUTE_CONFIG)
  }

  // Try to query platform database for compute config
  const { data, error } = await queryPlatformDatabase<{ instance_size: string }>({
    query: `
      SELECT COALESCE(instance_size, 'micro') as instance_size
      FROM platform.projects
      WHERE ref = $1
    `,
    parameters: [ref],
  })

  if (error || !data || data.length === 0) {
    // Fall back to default config if query fails
    return res.status(200).json(DEFAULT_COMPUTE_CONFIG)
  }

  const instanceSize = data[0].instance_size
  const sizeConfig = INSTANCE_SIZES[instanceSize] || INSTANCE_SIZES.micro

  return res.status(200).json({
    instance_size: instanceSize,
    cpu: sizeConfig.cpu,
    memory_gb: sizeConfig.memory_gb,
  })
}

// POST - Update compute size
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query
  const { instance_size } = req.body

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  if (!instance_size || typeof instance_size !== 'string') {
    return res.status(400).json({ error: { message: 'instance_size is required' } })
  }

  // Validate instance size
  if (!INSTANCE_SIZES[instance_size]) {
    return res.status(400).json({
      error: {
        message: `Invalid instance size. Must be one of: ${Object.keys(INSTANCE_SIZES).join(', ')}`,
      },
    })
  }

  const sizeConfig = INSTANCE_SIZES[instance_size]

  // If no DATABASE_URL is configured, return success with new config
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({
      instance_size,
      cpu: sizeConfig.cpu,
      memory_gb: sizeConfig.memory_gb,
    })
  }

  // Update instance size in database
  const { data, error } = await queryPlatformDatabase<{ instance_size: string }>({
    query: `
      UPDATE platform.projects
      SET instance_size = $2,
          updated_at = NOW()
      WHERE ref = $1
      RETURNING instance_size
    `,
    parameters: [ref, instance_size],
  })

  if (error) {
    return res.status(500).json({ error: { message: 'Failed to update compute size' } })
  }

  return res.status(200).json({
    instance_size,
    cpu: sizeConfig.cpu,
    memory_gb: sizeConfig.memory_gb,
  })
}
