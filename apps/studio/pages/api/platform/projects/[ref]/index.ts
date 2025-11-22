import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { DEFAULT_PROJECT } from 'lib/constants/api'
import { authenticateAndVerifyProjectAccess, getClientIp, getUserAgent, logAuditEvent } from 'lib/api/platform/project-access'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'PATCH':
      return handlePatch(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  // Special case: if ref is 'default' and no database is configured, return DEFAULT_PROJECT
  if (ref === 'default' && !process.env.DATABASE_URL) {
    return res.status(200).json(DEFAULT_PROJECT)
  }

  // Authenticate and verify access (any member can view)
  const result = await authenticateAndVerifyProjectAccess(req, res)
  if (!result) return // Response already sent

  const { access } = result
  const project = access.project

  // Transform platform database format to ProjectDetailResponse format
  const projectResponse = {
    id: project.id,
    ref: project.ref,
    name: project.name,
    organization_id: project.organization_id,
    cloud_provider: 'railway',
    status: project.status,
    region: process.env.RAILWAY_REGION || 'us-west',
    inserted_at: project.created_at || new Date().toISOString(),
    connectionString: '',
    restUrl: project.supabase_url ? `${project.supabase_url}/rest/v1/` : '',
  }

  return res.status(200).json(projectResponse)
}

const handlePatch = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (admin or owner can update)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'admin')
  if (!result) return // Response already sent

  const { user, access } = result
  const { name, status } = req.body

  if (!name && !status) {
    return res.status(400).json({
      error: { message: 'At least one field (name, status) is required for update' }
    })
  }

  // Build update query dynamically
  const updates: string[] = []
  const parameters: unknown[] = []
  let paramIndex = 1

  if (name) {
    updates.push(`name = $${paramIndex}`)
    parameters.push(name)
    paramIndex++
  }

  if (status) {
    updates.push(`status = $${paramIndex}`)
    parameters.push(status)
    paramIndex++
  }

  // Add project ID as final parameter
  parameters.push(access.project.id)

  const { queryPlatformDatabase } = await import('lib/api/platform/database')
  const { data, error } = await queryPlatformDatabase({
    query: `
      UPDATE platform.projects
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `,
    parameters,
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  // Log audit event
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'update',
    changes: { name, status },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res.status(200).json(data[0])
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (only owner can delete)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'owner')
  if (!result) return // Response already sent

  const { user, access } = result

  // Soft delete the project
  const { queryPlatformDatabase } = await import('lib/api/platform/database')
  const { error } = await queryPlatformDatabase({
    query: `
      UPDATE platform.projects
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
    `,
    parameters: [access.project.id],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  // Log audit event
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'delete',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res.status(200).json({ message: 'Project deleted successfully' })
}
