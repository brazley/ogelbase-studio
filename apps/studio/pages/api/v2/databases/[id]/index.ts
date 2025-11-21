import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig, updateDatabase, deleteDatabase } from 'lib/api/platform/databases'
import { BadRequestError } from 'lib/api/v2/errorHandler'

/**
 * GET    /api/v2/databases/abc-123
 * PATCH  /api/v2/databases/abc-123
 * DELETE /api/v2/databases/abc-123
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Get a single database connection
     */
    GET: async (req: ApiV2Request, res: NextApiResponse) => {
      const { id } = req.query

      if (!id || typeof id !== 'string') {
        throw new BadRequestError('id parameter is required')
      }

      const database = await getDatabaseConfig(id)

      res.json({
        data: database,
      })
    },

    /**
     * Update a database connection
     */
    PATCH: async (req: ApiV2Request, res: NextApiResponse) => {
      const { id } = req.query

      if (!id || typeof id !== 'string') {
        throw new BadRequestError('id parameter is required')
      }

      const {
        name,
        connection_string,
        host,
        port,
        database,
        username,
        password,
        ssl_enabled,
        status,
        metadata,
      } = req.body

      // Validate port if provided
      if (port !== undefined && (typeof port !== 'number' || port < 1 || port > 65535)) {
        throw new BadRequestError('port must be between 1 and 65535')
      }

      // Validate status if provided
      if (status !== undefined && !['active', 'inactive', 'error'].includes(status)) {
        throw new BadRequestError('status must be active, inactive, or error')
      }

      const updatedDatabase = await updateDatabase(id, {
        name,
        connection_string,
        host,
        port,
        database,
        username,
        password,
        ssl_enabled,
        status,
        metadata,
      })

      res.json({
        data: updatedDatabase,
      })
    },

    /**
     * Delete a database connection
     */
    DELETE: async (req: ApiV2Request, res: NextApiResponse) => {
      const { id } = req.query

      if (!id || typeof id !== 'string') {
        throw new BadRequestError('id parameter is required')
      }

      await deleteDatabase(id)

      res.status(204).end()
    },
  })
)
