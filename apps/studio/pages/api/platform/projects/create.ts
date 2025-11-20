import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import {
  queryPlatformDatabase,
  PlatformProject,
  PlatformCredentials,
} from 'lib/api/platform/database'
import { generateProjectCredentials } from 'lib/api/platform/jwt'
import {
  generateProjectRef,
  generateSlug,
  isValidProjectRef,
  validateDatabaseConnection,
  validateURL,
} from 'lib/api/platform/project-utils'

/**
 * POST /api/platform/projects/create
 *
 * Creates a new project in the platform database with generated credentials
 *
 * Request body:
 * {
 *   name: string,                    // Project name (required)
 *   organization_id: string,         // UUID of the organization (required)
 *   database_host: string,           // Database host (required)
 *   database_port: number,           // Database port (default: 5432)
 *   database_name: string,           // Database name (required)
 *   database_user: string,           // Database user (required)
 *   database_password: string,       // Database password (required)
 *   postgres_meta_url: string,       // Postgres Meta service URL (required)
 *   supabase_url: string,            // Supabase Kong/API Gateway URL (required)
 *   ref?: string,                    // Optional custom project ref (auto-generated if not provided)
 *   status?: string                  // Optional status (default: 'ACTIVE_HEALTHY')
 * }
 *
 * Response (200):
 * {
 *   project: {
 *     id: string,
 *     organization_id: string,
 *     name: string,
 *     slug: string,
 *     ref: string,
 *     database_host: string,
 *     database_port: number,
 *     database_name: string,
 *     database_user: string,
 *     database_password: string,
 *     postgres_meta_url: string,
 *     supabase_url: string,
 *     status: string,
 *     created_at: string,
 *     updated_at: string
 *   },
 *   credentials: {
 *     id: string,
 *     project_id: string,
 *     anon_key: string,
 *     service_role_key: string,
 *     jwt_secret: string,
 *     created_at: string,
 *     updated_at: string
 *   }
 * }
 *
 * Response (400): Validation error
 * Response (500): Internal server error
 */

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handleCreate(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

interface CreateProjectRequest {
  name: string
  organization_id: string
  database_host: string
  database_port?: number
  database_name: string
  database_user: string
  database_password: string
  postgres_meta_url: string
  supabase_url: string
  ref?: string
  status?: string
}

const handleCreate = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const {
      name,
      organization_id,
      database_host,
      database_port = 5432,
      database_name,
      database_user,
      database_password,
      postgres_meta_url,
      supabase_url,
      ref: customRef,
      status = 'ACTIVE_HEALTHY',
    } = req.body as CreateProjectRequest

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        data: null,
        error: { message: 'Project name is required' },
      })
    }

    if (!organization_id || organization_id.trim().length === 0) {
      return res.status(400).json({
        data: null,
        error: { message: 'Organization ID is required' },
      })
    }

    // Validate database connection details
    const dbValidation = validateDatabaseConnection(
      database_host,
      database_port,
      database_name,
      database_user,
      database_password
    )

    if (!dbValidation.isValid) {
      return res.status(400).json({
        data: null,
        error: { message: dbValidation.error },
      })
    }

    // Validate URLs
    const postgresMetaValidation = validateURL(postgres_meta_url)
    if (!postgresMetaValidation.isValid) {
      return res.status(400).json({
        data: null,
        error: { message: `Postgres Meta URL: ${postgresMetaValidation.error}` },
      })
    }

    const supabaseUrlValidation = validateURL(supabase_url)
    if (!supabaseUrlValidation.isValid) {
      return res.status(400).json({
        data: null,
        error: { message: `Supabase URL: ${supabaseUrlValidation.error}` },
      })
    }

    // Generate or validate project ref
    let projectRef = customRef
    if (projectRef) {
      if (!isValidProjectRef(projectRef)) {
        return res.status(400).json({
          data: null,
          error: {
            message:
              'Invalid project ref format. Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric characters',
          },
        })
      }
    } else {
      projectRef = generateProjectRef()
    }

    // Generate slug from name
    const slug = generateSlug(name)

    // Verify organization exists
    const orgCheckResult = await queryPlatformDatabase<{ id: string }>({
      query: 'SELECT id FROM platform.organizations WHERE id = $1',
      parameters: [organization_id],
    })

    if (orgCheckResult.error) {
      return res.status(500).json({
        data: null,
        error: {
          message: `Failed to verify organization: ${orgCheckResult.error.message}`,
        },
      })
    }

    if (!orgCheckResult.data || orgCheckResult.data.length === 0) {
      return res.status(400).json({
        data: null,
        error: { message: `Organization with ID ${organization_id} not found` },
      })
    }

    // Check if project ref already exists
    const refCheckResult = await queryPlatformDatabase<{ ref: string }>({
      query: 'SELECT ref FROM platform.projects WHERE ref = $1',
      parameters: [projectRef],
    })

    if (refCheckResult.error) {
      return res.status(500).json({
        data: null,
        error: {
          message: `Failed to check project ref uniqueness: ${refCheckResult.error.message}`,
        },
      })
    }

    if (refCheckResult.data && refCheckResult.data.length > 0) {
      return res.status(400).json({
        data: null,
        error: { message: `Project with ref '${projectRef}' already exists` },
      })
    }

    // Generate credentials
    const credentials = generateProjectCredentials()

    // Insert project into database
    const projectInsertResult = await queryPlatformDatabase<PlatformProject>({
      query: `
        INSERT INTO platform.projects (
          organization_id,
          name,
          slug,
          ref,
          database_host,
          database_port,
          database_name,
          database_user,
          database_password,
          postgres_meta_url,
          supabase_url,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
      parameters: [
        organization_id,
        name,
        slug,
        projectRef,
        database_host,
        database_port,
        database_name,
        database_user,
        database_password,
        postgres_meta_url,
        supabase_url,
        status,
      ],
    })

    if (projectInsertResult.error || !projectInsertResult.data) {
      return res.status(500).json({
        data: null,
        error: {
          message: `Failed to create project: ${projectInsertResult.error?.message || 'Unknown error'}`,
        },
      })
    }

    const project = projectInsertResult.data[0]

    // Insert credentials into database
    const credentialsInsertResult = await queryPlatformDatabase<PlatformCredentials>({
      query: `
        INSERT INTO platform.credentials (
          project_id,
          anon_key,
          service_role_key,
          jwt_secret
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      parameters: [project.id, credentials.anon_key, credentials.service_role_key, credentials.jwt_secret],
    })

    if (credentialsInsertResult.error || !credentialsInsertResult.data) {
      // Rollback: delete the project if credentials creation failed
      await queryPlatformDatabase({
        query: 'DELETE FROM platform.projects WHERE id = $1',
        parameters: [project.id],
      })

      return res.status(500).json({
        data: null,
        error: {
          message: `Failed to create credentials: ${credentialsInsertResult.error?.message || 'Unknown error'}`,
        },
      })
    }

    const projectCredentials = credentialsInsertResult.data[0]

    // Return success response
    return res.status(200).json({
      project,
      credentials: projectCredentials,
    })
  } catch (error) {
    console.error('Error creating project:', error)
    return res.status(500).json({
      data: null,
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    })
  }
}
