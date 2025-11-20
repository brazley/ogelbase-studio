import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformOrganization, PlatformProject } from 'lib/api/platform/database'
import { PgMetaDatabaseError } from 'lib/api/self-hosted/types'
import { DEFAULT_PROJECT } from 'lib/constants/api'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  // If no DATABASE_URL is configured, return default self-hosted profile
  if (!process.env.DATABASE_URL) {
    const defaultResponse = {
      id: 1,
      primary_email: 'admin@ogelbase.com',
      username: 'admin',
      first_name: 'OgelBase',
      last_name: 'Admin',
      organizations: [
        {
          id: 1,
          name: 'Default Organization',
          slug: 'default-org',
          billing_email: 'billing@ogelbase.com',
          projects: [DEFAULT_PROJECT],
        },
      ],
    }
    return res.status(200).json(defaultResponse)
  }

  // Query all organizations from platform database
  const { data: orgs, error: orgsError } = await queryPlatformDatabase<PlatformOrganization>({
    query: 'SELECT * FROM platform.organizations ORDER BY created_at ASC',
    parameters: [],
  })

  if (orgsError) {
    // If database query fails, fall back to default profile
    const defaultResponse = {
      id: 1,
      primary_email: 'admin@ogelbase.com',
      username: 'admin',
      first_name: 'OgelBase',
      last_name: 'Admin',
      organizations: [
        {
          id: 1,
          name: 'Default Organization',
          slug: 'default-org',
          billing_email: 'billing@ogelbase.com',
          projects: [DEFAULT_PROJECT],
        },
      ],
    }
    return res.status(200).json(defaultResponse)
  }

  // Query all projects from platform database
  const { data: projects, error: projectsError } = await queryPlatformDatabase<PlatformProject>({
    query: 'SELECT * FROM platform.projects ORDER BY created_at ASC',
    parameters: [],
  })

  if (projectsError) {
    if (projectsError instanceof PgMetaDatabaseError) {
      const { statusCode, message, formattedError } = projectsError
      return res.status(statusCode).json({ error: { message, formattedError } })
    }
    const { message } = projectsError
    return res.status(500).json({ error: { message, formattedError: message } })
  }

  // Map projects to their organizations
  const organizations = (orgs || []).map(org => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    billing_email: org.billing_email || 'billing@ogelbase.com',
    projects: (projects || [])
      .filter(p => p.organization_id === org.id)
      .map(p => ({
        id: p.id,
        ref: p.ref,
        name: p.name,
        status: p.status,
        organization_id: p.organization_id,
        cloud_provider: 'railway',
        region: process.env.RAILWAY_REGION || 'us-west',
        inserted_at: p.created_at || new Date().toISOString(),
        connectionString: '',
      })),
  }))

  const response = {
    id: 1,
    primary_email: 'admin@ogelbase.com',
    username: 'admin',
    first_name: 'OgelBase',
    last_name: 'Admin',
    organizations,
  }

  return res.status(200).json(response)
}
