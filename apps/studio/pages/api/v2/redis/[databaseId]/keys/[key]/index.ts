import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig } from 'lib/api/platform/databases'
import { createRedisClient } from 'lib/api/platform/redis'
import { BadRequestError, NotFoundError } from 'lib/api/v2/errorHandler'

/**
 * GET    /api/v2/redis/db-123/keys/user:123
 * PUT    /api/v2/redis/db-123/keys/user:123
 * DELETE /api/v2/redis/db-123/keys/user:123
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Get value for a key
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

        // Get value
        const value = await redis.get(key)

        // Get TTL
        const ttl = await redis.ttl(key)

        res.json({
          data: {
            key,
            value,
            ttl: ttl === -1 ? null : ttl, // -1 means no expiration
          },
        })
      } finally {
        await redis.close()
      }
    },

    /**
     * Set value for a key
     */
    PUT: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId, key } = req.query
      const { value, ttl } = req.body

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      if (!key || typeof key !== 'string') {
        throw new BadRequestError('key parameter is required')
      }

      if (value === undefined || value === null) {
        throw new BadRequestError('value is required in request body')
      }

      // Validate TTL if provided
      if (ttl !== undefined && (typeof ttl !== 'number' || ttl < 1)) {
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
        // Convert value to string
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value)

        // Set value
        await redis.set(key, stringValue, ttl)

        // Get the value back for confirmation
        const newValue = await redis.get(key)
        const newTtl = await redis.ttl(key)

        res.json({
          data: {
            key,
            value: newValue,
            ttl: newTtl === -1 ? null : newTtl,
          },
        })
      } finally {
        await redis.close()
      }
    },

    /**
     * Delete a key
     */
    DELETE: async (req: ApiV2Request, res: NextApiResponse) => {
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
        // Delete key
        const deleted = await redis.del(key)

        if (deleted === 0) {
          throw new NotFoundError(`Key '${key}' not found`)
        }

        res.status(204).end()
      } finally {
        await redis.close()
      }
    },
  })
)
