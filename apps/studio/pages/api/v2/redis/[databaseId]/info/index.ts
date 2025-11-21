import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig } from 'lib/api/platform/databases'
import { createRedisClient } from 'lib/api/platform/redis'
import { BadRequestError } from 'lib/api/v2/errorHandler'

/**
 * Parse Redis INFO output into a structured object
 */
function parseRedisInfo(infoString: string): Record<string, any> {
  const sections: Record<string, any> = {}
  let currentSection = 'default'

  const lines = infoString.split('\r\n')

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue

    // Section headers start with #
    if (line.startsWith('#')) {
      const sectionName = line.replace('#', '').trim()
      currentSection = sectionName.toLowerCase().replace(/\s+/g, '_')
      sections[currentSection] = {}
      continue
    }

    // Parse key-value pairs
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim()

      // Try to parse numeric values
      const numValue = parseFloat(value)
      sections[currentSection][key] = isNaN(numValue) ? value : numValue
    }
  }

  return sections
}

/**
 * GET /api/v2/redis/db-123/info
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Get Redis server info
     */
    GET: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId } = req.query
      const { section } = req.query

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      // Validate section if provided
      const validSections = [
        'server',
        'clients',
        'memory',
        'persistence',
        'stats',
        'replication',
        'cpu',
        'commandstats',
        'cluster',
        'keyspace',
      ]

      if (section && typeof section === 'string' && !validSections.includes(section)) {
        throw new BadRequestError(`Invalid section. Valid sections: ${validSections.join(', ')}`)
      }

      // Get database config
      const dbConfig = await getDatabaseConfig(databaseId)

      // Create Redis client
      const redis = createRedisClient(databaseId, {
        connectionString: dbConfig.connection_string,
        tier: req.user?.tier || 'free',
      })

      try {
        // Get server info
        const infoString = await redis.info(section as string | undefined)

        // Parse info into structured format
        const parsedInfo = parseRedisInfo(infoString)

        res.json({
          data: {
            raw: infoString,
            parsed: parsedInfo,
          },
        })
      } finally {
        await redis.close()
      }
    },
  })
)
