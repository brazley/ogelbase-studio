import { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { authenticateAndVerifyProjectAccess, getClientIp, getUserAgent, logAuditEvent } from 'lib/api/platform/project-access'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'POST':
      return handlePost(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

type ResponseData =
  paths['/platform/projects/{ref}/billing/addons']['get']['responses']['200']['content']['application/json']

const handleGet = async (req: NextApiRequest, res: NextApiResponse<ResponseData>) => {
  // Authenticate and verify access (any member can view)
  const result = await authenticateAndVerifyProjectAccess(req, res)
  if (!result) return // Response already sent

  const { access } = result
  const { ref } = req.query

  const defaultResponse: ResponseData = {
    ref: String(ref),
    selected_addons: [],
    available_addons: [
      {
        name: 'Compute Add-on',
        type: 'compute_instance' as const,
        variants: [
          {
            identifier: 'ci_micro' as const,
            name: 'Micro',
            price: 10,
            price_description: 'Additional compute resources',
            price_interval: 'monthly' as const,
            price_type: 'fixed' as const,
          },
        ],
      },
      {
        name: 'Storage Add-on',
        type: 'pitr' as const,
        variants: [
          {
            identifier: 'pitr_7' as const,
            name: '7 days',
            price: 10,
            price_description: 'Additional storage capacity',
            price_interval: 'monthly' as const,
            price_type: 'fixed' as const,
          },
        ],
      },
      {
        name: 'Bandwidth Add-on',
        type: 'custom_domain' as const,
        variants: [
          {
            identifier: 'cd_default' as const,
            name: 'Custom Domain',
            price: 10,
            price_description: 'Additional bandwidth allocation',
            price_interval: 'monthly' as const,
            price_type: 'fixed' as const,
          },
        ],
      },
    ],
  }

  // If no DATABASE_URL is configured, return default addons
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse)
  }

  // Import queryPlatformDatabase at runtime to avoid circular dependencies
  const { queryPlatformDatabase } = await import('lib/api/platform/database')

  // Try to query platform database for project addons
  const { data, error } = await queryPlatformDatabase({
    query: `
      SELECT
        pa.addon_id as id,
        a.name,
        a.description,
        a.price,
        a.interval
      FROM platform.project_addons pa
      JOIN platform.addons a ON a.id = pa.addon_id
      WHERE pa.project_id = (SELECT id FROM platform.projects WHERE ref = $1)
    `,
    parameters: [ref],
  })

  if (error) {
    // Fall back to default response if query fails
    return res.status(200).json(defaultResponse)
  }

  // Transform database results to match the expected type structure
  const selectedAddons = Array.isArray(data)
    ? data.map((addon: any) => ({
        type: 'compute_instance' as const,
        variant: {
          identifier: 'ci_micro' as const,
          name: addon.name || 'Unknown',
          price: addon.price || 0,
          price_description: addon.description || '',
          price_interval: 'monthly' as const,
          price_type: 'fixed' as const,
        },
      }))
    : []

  const response: ResponseData = {
    ref: String(ref),
    selected_addons: selectedAddons,
    available_addons: defaultResponse.available_addons,
  }

  return res.status(200).json(response)
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (admin or owner can add addons)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'admin')
  if (!result) return // Response already sent

  const { user, access } = result
  const { addon_type, addon_variant } = req.body

  if (!addon_type || !addon_variant) {
    return res.status(400).json({
      error: { message: 'addon_type and addon_variant are required' }
    })
  }

  // Import queryPlatformDatabase at runtime
  const { queryPlatformDatabase } = await import('lib/api/platform/database')

  // Check if addon already exists
  const { data: existing } = await queryPlatformDatabase({
    query: `
      SELECT id FROM platform.project_addons
      WHERE project_id = $1 AND addon_type = $2
    `,
    parameters: [access.project.id, addon_type],
  })

  if (existing && existing.length > 0) {
    return res.status(400).json({
      error: { message: 'Addon already exists for this project' }
    })
  }

  // Insert addon
  const { data, error } = await queryPlatformDatabase({
    query: `
      INSERT INTO platform.project_addons (project_id, addon_type, addon_variant, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `,
    parameters: [access.project.id, addon_type, addon_variant],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  // Log audit event
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'addon.add',
    changes: { addon_type, addon_variant },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res.status(201).json(data[0])
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (admin or owner can remove addons)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'admin')
  if (!result) return // Response already sent

  const { user, access } = result
  const { addon_type } = req.query

  if (!addon_type || typeof addon_type !== 'string') {
    return res.status(400).json({
      error: { message: 'addon_type is required in query parameters' }
    })
  }

  // Import queryPlatformDatabase at runtime
  const { queryPlatformDatabase } = await import('lib/api/platform/database')

  // Delete addon
  const { error } = await queryPlatformDatabase({
    query: `
      DELETE FROM platform.project_addons
      WHERE project_id = $1 AND addon_type = $2
    `,
    parameters: [access.project.id, addon_type],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  // Log audit event
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'addon.remove',
    changes: { addon_type },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res.status(200).json({ message: 'Addon removed successfully' })
}
