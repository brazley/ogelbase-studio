/**
 * Redis Historical Metrics Endpoint
 *
 * Returns time-series data for Redis metrics over a specified range.
 * Used for chart visualizations in the Redis dashboard.
 *
 * GET /api/health/redis/metrics?range=1h&interval=5s
 *
 * Query Parameters:
 * - range: Time range (5m, 15m, 1h, 6h, 24h, 7d) - default: 1h
 * - interval: Data point interval (5s, 30s, 1m, 5m, 15m, 1h) - default: 5s
 * - ref: Project reference (optional)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCacheMetrics } from '../../../../lib/api/auth/session-cache'
import { createRedisClient } from '../../../../lib/api/platform/redis'
import { Tier } from '../../../../lib/api/platform/connection-manager'
import type { RedisMetricsHistory, TimeRange, MetricInterval } from '../../../../types/redis'

// Time range to milliseconds conversion
const TIME_RANGE_MS: Record<TimeRange, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

// Interval to milliseconds conversion
const INTERVAL_MS: Record<MetricInterval, number> = {
  '5s': 5 * 1000,
  '30s': 30 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RedisMetricsHistory | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Parse query parameters
    const range = (req.query.range as TimeRange) || '1h'
    const interval = (req.query.interval as MetricInterval) || '5s'

    // Validate parameters
    if (!TIME_RANGE_MS[range]) {
      return res.status(400).json({ error: `Invalid range: ${range}` })
    }

    if (!INTERVAL_MS[interval]) {
      return res.status(400).json({ error: `Invalid interval: ${interval}` })
    }

    // Check if Redis is configured
    if (!process.env.REDIS_URL) {
      return res.status(200).json({
        range,
        interval,
        dataPoints: [],
      })
    }

    // Calculate number of data points
    const rangeMs = TIME_RANGE_MS[range]
    const intervalMs = INTERVAL_MS[interval]
    const numPoints = Math.floor(rangeMs / intervalMs)

    // For MVP, we'll simulate historical data by taking current metrics
    // and adding slight variations over time
    // TODO: Replace with actual time-series storage (Redis TimeSeries, PostgreSQL, etc.)

    const redis = createRedisClient('metrics-history', {
      connectionString: process.env.REDIS_URL,
      tier: Tier.PRO,
    })

    try {
      // Get current metrics
      const cacheMetrics = getSessionCacheMetrics()

      // Get current Redis performance
      let currentLatency = 0
      try {
        const start = Date.now()
        await redis.ping()
        currentLatency = Date.now() - start
      } catch (error) {
        currentLatency = 100 // Fallback for failed ping
      }

      // Get memory info
      let memoryPercent = 0
      try {
        const info = await redis.info('memory')
        const usedMatch = info.match(/used_memory:(\d+)/)
        const maxMatch = info.match(/maxmemory:(\d+)/)

        if (usedMatch && maxMatch) {
          const used = parseInt(usedMatch[1])
          const max = parseInt(maxMatch[1])
          if (max > 0) {
            memoryPercent = (used / max) * 100
          }
        }
      } catch (error) {
        memoryPercent = 50 // Fallback
      }

      // Close Redis connection
      await redis.close()

      // Generate historical data points
      // In production, this should fetch from a time-series database
      const now = Date.now()
      const dataPoints = Array.from({ length: numPoints }, (_, i) => {
        const timestamp = new Date(now - (numPoints - i - 1) * intervalMs).toISOString()

        // Add realistic variations (±5% for demo purposes)
        const hitRateVariation = (Math.random() - 0.5) * 10
        const latencyVariation = (Math.random() - 0.5) * 4
        const memoryVariation = (Math.random() - 0.5) * 10

        return {
          timestamp,
          hitRate: Math.max(0, Math.min(100, cacheMetrics.hitRate + hitRateVariation)),
          latencyP99: Math.max(1, currentLatency + latencyVariation),
          latencyP95: Math.max(1, currentLatency * 0.85 + latencyVariation * 0.8),
          latencyP50: Math.max(1, currentLatency * 0.5 + latencyVariation * 0.5),
          memoryPercent: Math.max(0, Math.min(100, memoryPercent + memoryVariation)),
        }
      })

      return res.status(200).json({
        range,
        interval,
        dataPoints,
      })
    } finally {
      try {
        await redis.close()
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('[RedisMetrics] Error fetching historical metrics:', error)

    return res.status(500).json({
      error: 'Failed to fetch Redis metrics',
    })
  }
}
