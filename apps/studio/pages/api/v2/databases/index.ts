import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabasesByProject, createDatabase } from 'lib/api/platform/databases'
import { BadRequestError, ValidationFailedError } from 'lib/api/v2/errorHandler'

/**
 * GET  /api/v2/databases?projectId=123
 * POST /api/v2/databases
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * List all databases for a project
     */
    GET: async (req: ApiV2Request, res: NextApiResponse) => {
      const { projectId } = req.query

      if (!projectId || typeof projectId !== 'string') {
        throw new BadRequestError('projectId query parameter is required')
      }

      const databases = await getDatabasesByProject(projectId)

      res.json({
        data: databases,
        total: databases.length,
      })
    },

    /**
     * Create a new database connection
     */
    POST: async (req: ApiV2Request, res: NextApiResponse) => {
      const {
        projectId,
        name,
        type,
        connection_string,
        host,
        port,
        database,
        username,
        password,
        ssl_enabled,
        metadata,
      } = req.body

      // Validation
      const errors: Array<{ field: string; message: string }> = []

      if (!projectId) errors.push({ field: 'projectId', message: 'projectId is required' })
      if (!name) errors.push({ field: 'name', message: 'name is required' })
      if (!type) errors.push({ field: 'type', message: 'type is required' })
      if (!['redis', 'postgresql', 'mongodb'].includes(type)) {
        errors.push({ field: 'type', message: 'type must be redis, postgresql, or mongodb' })
      }
      if (!connection_string)
        errors.push({ field: 'connection_string', message: 'connection_string is required' })
      if (!host) errors.push({ field: 'host', message: 'host is required' })
      if (!port) errors.push({ field: 'port', message: 'port is required' })
      if (typeof port !== 'number' || port < 1 || port > 65535) {
        errors.push({ field: 'port', message: 'port must be between 1 and 65535' })
      }

      if (errors.length > 0) {
        throw new ValidationFailedError('Validation failed', errors)
      }

      const newDatabase = await createDatabase(projectId, {
        name,
        type,
        connection_string,
        host,
        port,
        database,
        username,
        password,
        ssl_enabled,
        metadata,
      })

      res.status(201).json({
        data: newDatabase,
      })
    },
  })
)
