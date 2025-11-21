import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { verifyOrgAccess } from 'lib/api/platform/org-access-control'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetProjects(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      return res.status(405).json({ error: `Method ${method} Not Allowed` })
  }
}

async function handleGetProjects(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query
  const {
    limit = '96',
    offset = '0',
    sort = 'name_asc',
    search,
    statuses,
  } = req.query as {
    limit?: string
    offset?: string
    sort?: string
    search?: string
    statuses?: string
  }

  try {
    // Verify user has access to this organization
    const membership = await verifyOrgAccess(slug as string, req.user!, res)
    if (!membership) {
      return // Response already sent by verifyOrgAccess
    }

    // Import queryPlatformDatabase
    const { queryPlatformDatabase } = await import('lib/api/platform/database')

    const organization = {
      id: membership.org_id,
      name: membership.org_name,
      slug: membership.org_slug,
    }

    // Build WHERE clause for search and status filters
    let whereConditions = ['p.organization_id = $1']
    const params: any[] = [organization.id]
    let paramIndex = 2

    if (search) {
      whereConditions.push(`p.name ILIKE $${paramIndex}`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (statuses) {
      const statusList = statuses.split(',')
      whereConditions.push(`p.status = ANY($${paramIndex})`)
      params.push(statusList)
      paramIndex++
    }

    // Build ORDER BY clause
    let orderBy = 'p.name ASC'
    switch (sort) {
      case 'name_desc':
        orderBy = 'p.name DESC'
        break
      case 'created_asc':
        orderBy = 'p.created_at ASC'
        break
      case 'created_desc':
        orderBy = 'p.created_at DESC'
        break
      default:
        orderBy = 'p.name ASC'
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM platform.projects p
      WHERE ${whereConditions.join(' AND ')}
    `
    const countResult = await queryPlatformDatabase<{ count: string }>({
      query: countQuery,
      parameters: params,
    })

    if (countResult.error) {
      throw countResult.error
    }

    const totalCount = parseInt(countResult.data?.[0]?.count || '0')

    // Get projects with pagination
    params.push(parseInt(limit))
    params.push(parseInt(offset))

    type ProjectRow = {
      id: string
      ref: string
      name: string
      organization_id: string
      cloud_provider: string | null
      status: string | null
      region: string | null
      created_at: string
      infra_compute_size: string | null
      connection_string: string | null
      rest_url: string | null
      databases: any[]
    }

    const projectsQuery = `
      SELECT
        p.id,
        p.ref,
        p.name,
        p.organization_id,
        p.cloud_provider,
        p.status,
        p.region,
        p.created_at,
        p.infra_compute_size,
        p.db_dns,
        p.restUrl as rest_url,
        p.connectionString as connection_string,
        COALESCE(
          json_agg(
            json_build_object(
              'id', d.id,
              'identifier', d.identifier,
              'region', d.region,
              'infra_compute_size', d.infra_compute_size,
              'host', d.host,
              'port', d.port,
              'database', d.database,
              'user', d.user
            )
          ) FILTER (WHERE d.id IS NOT NULL),
          '[]'::json
        ) as databases
      FROM platform.projects p
      LEFT JOIN platform.databases d ON d.project_id = p.id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY p.id
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    const projectsResult = await queryPlatformDatabase<ProjectRow>({
      query: projectsQuery,
      parameters: params,
    })

    if (projectsResult.error) {
      throw projectsResult.error
    }

    const projects = (projectsResult.data || []).map((row: ProjectRow) => ({
      id: row.id,
      ref: row.ref,
      name: row.name,
      organization_id: row.organization_id,
      cloud_provider: row.cloud_provider || 'AWS',
      status: row.status || 'ACTIVE_HEALTHY',
      region: row.region || 'us-east-1',
      created_at: row.created_at,
      infra_compute_size: row.infra_compute_size,
      connectionString: row.connection_string,
      restUrl: row.rest_url,
      databases: row.databases || [],
    }))

    return res.status(200).json({
      projects,
      pagination: {
        count: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    })
  } catch (error: any) {
    console.error('Error fetching projects:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    })
  }
}
