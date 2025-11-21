import { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { PROJECT_REST_URL } from 'lib/constants/api'
import { authenticateAndVerifyProjectAccess } from 'lib/api/platform/project-access'

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

type ResponseData =
  paths['/platform/projects/{ref}/databases']['get']['responses']['200']['content']['application/json']

const handleGet = async (req: NextApiRequest, res: NextApiResponse<ResponseData>) => {
  // Authenticate and verify access (any member can view databases)
  const result = await authenticateAndVerifyProjectAccess(req, res)
  if (!result) return // Response already sent

  const { access } = result
  const project = access.project

  return res.status(200).json([
    {
      cloud_provider: 'railway' as any,
      connectionString: '', // Never expose actual connection string
      connection_string_read_only: '',
      db_host: project.database_host || '127.0.0.1',
      db_name: project.database_name || 'postgres',
      db_port: project.database_port || 5432,
      db_user: project.database_user || 'postgres',
      identifier: 'default',
      inserted_at: project.created_at || '',
      region: process.env.RAILWAY_REGION || 'us-west',
      restUrl: project.supabase_url ? `${project.supabase_url}/rest/v1/` : PROJECT_REST_URL,
      size: '',
      status: project.status === 'ACTIVE_HEALTHY' ? 'ACTIVE_HEALTHY' : project.status,
    },
  ])
}
