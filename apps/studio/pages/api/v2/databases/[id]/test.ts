import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig, testDatabaseConnection } from 'lib/api/platform/databases'
import { BadRequestError } from 'lib/api/v2/errorHandler'

/**
 * POST /api/v2/databases/abc-123/test
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Test a database connection
     */
    POST: async (req: ApiV2Request, res: NextApiResponse) => {
      const { id } = req.query

      if (!id || typeof id !== 'string') {
        throw new BadRequestError('id parameter is required')
      }

      // Get database config
      const database = await getDatabaseConfig(id)

      // Test connection
      const result = await testDatabaseConnection(database.connection_string, database.type)

      res.json({
        data: {
          databaseId: id,
          ...result,
        },
      })
    },
  })
)
