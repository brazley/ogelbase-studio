import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig } from 'lib/api/platform/databases'
import { createRedisClient } from 'lib/api/platform/redis'
import { BadRequestError, NotFoundError } from 'lib/api/v2/errorHandler'

/**
 * GET  /api/v2/redis/db-123/keys/user:123/ttl
 * POST /api/v2/redis/db-123/keys/user:123/ttl  // Set expiration
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Get TTL for a key
     */
    GET: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId, key } = req.query

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      if (!key || typeof key !== 'string') {
        throw new BadRequestError('key parameter is required')
      }

      // Get database config
      const dbConfig = await getDatabaseConfig(databaseId)

      // Create Redis client
      const redis = createRedisClient(databaseId, {
        connectionString: dbConfig.connection_string,
        tier: req.user?.tier || 'free',
      })

      try {
        // Check if key exists
        const exists = await redis.exists(key)
        if (!exists) {
          throw new NotFoundError(`Key '${key}' not found`)
        }

        // Get TTL
        const ttl = await redis.ttl(key)

        res.json({
          data: {
            key,
            ttl: ttl === -1 ? null : ttl, // -1 means no expiration
            hasExpiration: ttl !== -1,
          },
        })
      } finally {
        await redis.close()
      }
    },

    /**
     * Set expiration for a key
     */
    POST: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId, key } = req.query
      const { ttl } = req.body

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      if (!key || typeof key !== 'string') {
        throw new BadRequestError('key parameter is required')
      }

      if (!ttl || typeof ttl !== 'number' || ttl < 1) {
        throw new BadRequestError('ttl must be a positive number (seconds)')
      }

      // Get database config
      const dbConfig = await getDatabaseConfig(databaseId)

      // Create Redis client
      const redis = createRedisClient(databaseId, {
        connectionString: dbConfig.connection_string,
        tier: req.user?.tier || 'free',
      })

      try {
        // Check if key exists
        const exists = await redis.exists(key)
        if (!exists) {
          throw new NotFoundError(`Key '${key}' not found`)
        }

        // Set expiration
        const result = await redis.expire(key, ttl)

        if (result === 0) {
          throw new Error('Failed to set expiration')
        }

        // Get new TTL for confirmation
        const newTtl = await redis.ttl(key)

        res.json({
          data: {
            key,
            ttl: newTtl,
            success: true,
          },
        })
      } finally {
        await redis.close()
      }
    },
  })
)
