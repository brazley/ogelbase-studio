import { NextApiRequest, NextApiResponse } from 'next'

import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'

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
  paths['/platform/projects/{ref}/billing/addons']['get']['responses']['200']['content']['application/json']

const handleGet = async (req: NextApiRequest, res: NextApiResponse<ResponseData>) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } } as any)
  }

  const defaultResponse: ResponseData = {
    ref: ref,
    selected_addons: [],
    available_addons: [
      {
        id: 'compute',
        name: 'Compute Add-on',
        description: 'Additional compute resources',
        price: 10,
        interval: 'month',
      },
      {
        id: 'storage',
        name: 'Storage Add-on',
        description: 'Additional storage capacity',
        price: 10,
        interval: 'month',
      },
      {
        id: 'bandwidth',
        name: 'Bandwidth Add-on',
        description: 'Additional bandwidth allocation',
        price: 10,
        interval: 'month',
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

  const response: ResponseData = {
    ref: ref,
    selected_addons: data || [],
    available_addons: defaultResponse.available_addons,
  }

  return res.status(200).json(response)
}
