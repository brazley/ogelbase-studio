import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig } from 'lib/api/platform/databases'
import { createRedisClient } from 'lib/api/platform/redis'
import { BadRequestError, ValidationFailedError } from 'lib/api/v2/errorHandler'
import { encodeCursor, decodeCursor } from 'lib/api/v2/pagination'

/**
 * GET  /api/v2/redis/db-123/keys?pattern=user:*&cursor=abc&limit=100
 * POST /api/v2/redis/db-123/keys  // Batch operations
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Scan keys with cursor pagination
     */
    GET: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId } = req.query
      const { pattern = '*', cursor, limit = '100' } = req.query

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      // Parse and validate limit
      const parsedLimit = parseInt(limit as string, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
        throw new BadRequestError('limit must be between 1 and 1000')
      }

      // Decode cursor
      const scanCursor = cursor && typeof cursor === 'string' ? decodeCursor(cursor) : '0'

      // Get database config
      const dbConfig = await getDatabaseConfig(databaseId)

      // Create Redis client
      const redis = createRedisClient(databaseId, {
        connectionString: dbConfig.connection_string,
        tier: req.user?.tier || 'free',
      })

      try {
        // Scan keys
        const [nextCursor, keys] = await redis.scan(scanCursor, pattern as string, parsedLimit)

        // Encode next cursor
        const hasMore = nextCursor !== '0'
        const encodedCursor = hasMore ? encodeCursor(nextCursor) : undefined

        res.json({
          data: keys,
          cursor: encodedCursor,
          hasMore,
          total: keys.length,
        })
      } finally {
        await redis.close()
      }
    },

    /**
     * Batch operations: set/delete multiple keys
     */
    POST: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId } = req.query
      const { operations } = req.body

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      if (!Array.isArray(operations)) {
        throw new ValidationFailedError('operations must be an array', [
          { field: 'operations', message: 'operations must be an array' },
        ])
      }

      if (operations.length === 0) {
        throw new ValidationFailedError('operations cannot be empty', [
          { field: 'operations', message: 'operations cannot be empty' },
        ])
      }

      if (operations.length > 100) {
        throw new ValidationFailedError('Cannot process more than 100 operations at once', [
          { field: 'operations', message: 'Maximum 100 operations allowed' },
        ])
      }

      // Get database config
      const dbConfig = await getDatabaseConfig(databaseId)

      // Create Redis client
      const redis = createRedisClient(databaseId, {
        connectionString: dbConfig.connection_string,
        tier: req.user?.tier || 'free',
      })

      try {
        const results = await Promise.all(
          operations.map(async (op: any, index: number) => {
            try {
              if (op.action === 'set') {
                if (!op.key || !op.value) {
                  return {
                    index,
                    success: false,
                    error: 'key and value are required for set operation',
                  }
                }

                await redis.set(op.key, op.value, op.ttl)
                return { index, success: true, key: op.key }
              } else if (op.action === 'delete') {
                if (!op.key) {
                  return {
                    index,
                    success: false,
                    error: 'key is required for delete operation',
                  }
                }

                const deleted = await redis.del(op.key)
                return { index, success: deleted > 0, key: op.key, deleted }
              } else {
                return {
                  index,
                  success: false,
                  error: `Unknown action: ${op.action}`,
                }
              }
            } catch (error) {
              return {
                index,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            }
          })
        )

        const successCount = results.filter((r) => r.success).length
        const failureCount = results.filter((r) => !r.success).length

        res.json({
          data: {
            results,
            summary: {
              total: operations.length,
              success: successCount,
              failed: failureCount,
            },
          },
        })
      } finally {
        await redis.close()
      }
    },
  })
)
