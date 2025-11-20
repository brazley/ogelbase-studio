import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { DEFAULT_PROJECT } from 'lib/constants/api'
import { queryPlatformDatabase, PlatformProject } from 'lib/api/platform/database'
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
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  const { data, error } = await queryPlatformDatabase<PlatformProject>({
    query: 'SELECT * FROM platform.projects WHERE ref = $1',
    parameters: [ref],
  })

  if (error) {
    if (error instanceof PgMetaDatabaseError) {
      const { statusCode, message, formattedError } = error
      return res.status(statusCode).json({ error: { message, formattedError } })
    }
    const { message } = error
    return res.status(500).json({ error: { message, formattedError: message } })
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: { message: `Project with ref '${ref}' not found` } })
  }

  const project = data[0]

  // Transform platform database format to ProjectDetailResponse format
  const projectResponse = {
    ...DEFAULT_PROJECT,
    id: project.id,
    ref: project.ref,
    name: project.name,
    organization_id: project.organization_id,
    db_host: project.database_host,
    restUrl: project.supabase_url ? `${project.supabase_url}/rest/v1/` : DEFAULT_PROJECT.restUrl || '',
    inserted_at: project.created_at || new Date().toISOString(),
    cloud_provider: 'railway',
    region: process.env.RAILWAY_REGION || 'us-west',
  }

  return res.status(200).json(projectResponse)
}
