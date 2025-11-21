import type { NextApiResponse } from 'next'
import type { ApiV2Request } from 'lib/api/v2/types'
import { authenticatedApiV2, methodRouter } from 'lib/api/v2/apiWrapper'
import { getDatabaseConfig } from 'lib/api/platform/databases'
import { createRedisClient } from 'lib/api/platform/redis'
import { BadRequestError } from 'lib/api/v2/errorHandler'

/**
 * Parse memory info from Redis INFO memory
 */
function parseMemoryInfo(infoString: string): Record<string, any> {
  const memoryInfo: Record<string, any> = {}
  const lines = infoString.split('\r\n')

  for (const line of lines) {
    // Skip empty lines and section headers
    if (!line.trim() || line.startsWith('#')) continue

    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim()
      const numValue = parseFloat(value)
      memoryInfo[key] = isNaN(numValue) ? value : numValue
    }
  }

  return memoryInfo
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * GET /api/v2/redis/db-123/memory
 */
export default authenticatedApiV2(
  methodRouter({
    /**
     * Get Redis memory statistics
     */
    GET: async (req: ApiV2Request, res: NextApiResponse) => {
      const { databaseId } = req.query

      if (!databaseId || typeof databaseId !== 'string') {
        throw new BadRequestError('databaseId parameter is required')
      }

      // Get database config
      const dbConfig = await getDatabaseConfig(databaseId)

      // Create Redis client
      const redis = createRedisClient(databaseId, {
        connectionString: dbConfig.connection_string,
        tier: req.user?.tier || 'free',
      })

      try {
        // Get memory info and key count
        const [memoryInfoString, dbSize] = await Promise.all([redis.info('memory'), redis.dbsize()])

        // Parse memory info
        const memoryInfo = parseMemoryInfo(memoryInfoString)

        // Extract key metrics
        const usedMemory = memoryInfo.used_memory || 0
        const usedMemoryRss = memoryInfo.used_memory_rss || 0
        const usedMemoryPeak = memoryInfo.used_memory_peak || 0
        const maxMemory = memoryInfo.maxmemory || 0
        const memoryFragmentationRatio = memoryInfo.mem_fragmentation_ratio || 0

        res.json({
          data: {
            memory: {
              used: usedMemory,
              usedFormatted: formatBytes(usedMemory),
              rss: usedMemoryRss,
              rssFormatted: formatBytes(usedMemoryRss),
              peak: usedMemoryPeak,
              peakFormatted: formatBytes(usedMemoryPeak),
              max: maxMemory,
              maxFormatted: maxMemory > 0 ? formatBytes(maxMemory) : 'unlimited',
              fragmentationRatio: memoryFragmentationRatio,
            },
            keys: {
              total: dbSize,
            },
            raw: memoryInfo,
          },
        })
      } finally {
        await redis.close()
      }
    },
  })
)
