/**
 * Redis Health Check Endpoint
 *
 * Provides comprehensive Redis health and metrics:
 * - Connection pool statistics
 * - Session cache metrics
 * - Performance benchmarks
 * - Redis server info
 *
 * GET /api/health/redis
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  sessionCacheHealthCheck,
  getSessionCacheMetrics,
  getSessionCachePoolStats,
} from '../../../lib/api/auth/session-cache'
import { createRedisClient } from '../../../lib/api/platform/redis'
import { Tier } from '../../../lib/api/platform/connection-manager'
import { getHotkeyDetector } from '../../../lib/api/cache/hotkey-detection'
import type { HotkeyMetric } from '../../../lib/api/cache/hotkey-detection'
import { logRedisOperation } from '../../../lib/api/observability/logger'
import { getTraceContext, getTracingConfig } from '../../../lib/api/observability/tracing'

interface RedisHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  trace?: {
    trace_id?: string
    span_id?: string
  }
  tracing: {
    enabled: boolean
    service_name: string
    sample_rate: number
  }
  redis: {
    connected: boolean
    version?: string
    uptime?: number
    usedMemory?: string
    totalKeys?: number
  }
  sessionCache: {
    enabled: boolean
    healthy: boolean
    metrics: {
      hits: number
      misses: number
      errors: number
      total: number
      hitRate: number
      ttl: number
    }
    pool: {
      size: number
      available: number
      pending: number
    } | null
  }
  hotkeys: {
    totalTracked: number
    totalAccesses: number
    thresholdExceeded: number
    topHotkeys: HotkeyMetric[]
    detectorStats: {
      threshold: number
      windowSizeMs: number
      maxTrackedKeys: number
    }
  }
  performance: {
    ping: number | null
    set: number | null
    get: number | null
  }
  errors: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<RedisHealthResponse>) {
  if (req.method !== 'GET') {
    const tracingConfig = getTracingConfig()
    return res.status(405).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      trace: getTraceContext(),
      tracing: {
        enabled: tracingConfig.enabled,
        service_name: tracingConfig.serviceName,
        sample_rate: tracingConfig.sampleRate,
      },
      redis: { connected: false },
      sessionCache: {
        enabled: false,
        healthy: false,
        metrics: { hits: 0, misses: 0, errors: 0, total: 0, hitRate: 0, ttl: 0 },
        pool: null,
      },
      hotkeys: {
        totalTracked: 0,
        totalAccesses: 0,
        thresholdExceeded: 0,
        topHotkeys: [],
        detectorStats: { threshold: 0, windowSizeMs: 0, maxTrackedKeys: 0 },
      },
      performance: { ping: null, set: null, get: null },
      errors: ['Method not allowed'],
    })
  }

  const errors: string[] = []
  let redis: ReturnType<typeof createRedisClient> | null = null

  try {
    // Check if Redis is configured
    if (!process.env.REDIS_URL) {
      const tracingConfig = getTracingConfig()
      return res.status(200).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        trace: getTraceContext(),
        tracing: {
          enabled: tracingConfig.enabled,
          service_name: tracingConfig.serviceName,
          sample_rate: tracingConfig.sampleRate,
        },
        redis: { connected: false },
        sessionCache: {
          enabled: false,
          healthy: false,
          metrics: { hits: 0, misses: 0, errors: 0, total: 0, hitRate: 0, ttl: 0 },
          pool: null,
        },
        hotkeys: {
          totalTracked: 0,
          totalAccesses: 0,
          thresholdExceeded: 0,
          topHotkeys: [],
          detectorStats: { threshold: 0, windowSizeMs: 0, maxTrackedKeys: 0 },
        },
        performance: { ping: null, set: null, get: null },
        errors: ['Redis URL not configured'],
      })
    }

    // Initialize Redis client for health check
    redis = createRedisClient('health-check', {
      connectionString: process.env.REDIS_URL,
      tier: Tier.PRO,
    })

    // Test 1: Basic connectivity
    let connected = false
    let pingTime: number | null = null

    try {
      const pingStart = Date.now()
      await redis.ping()
      pingTime = Date.now() - pingStart
      connected = true
    } catch (error) {
      errors.push(`Connection failed: ${error}`)
    }

    // Test 2: Performance benchmarks
    let setTime: number | null = null
    let getTime: number | null = null

    if (connected) {
      try {
        const testKey = `health:check:${Date.now()}`
        const testValue = 'health-check-value'

        // SET benchmark
        const setStart = Date.now()
        await redis.set(testKey, testValue, 60) // 60 second TTL
        setTime = Date.now() - setStart

        // GET benchmark
        const getStart = Date.now()
        const retrieved = await redis.get(testKey)
        getTime = Date.now() - getStart

        if (retrieved !== testValue) {
          errors.push('Data integrity check failed')
        }

        // Cleanup
        await redis.del(testKey)
      } catch (error) {
        errors.push(`Performance test failed: ${error}`)
      }
    }

    // Test 3: Get Redis server info
    let version: string | undefined
    let uptime: number | undefined
    let usedMemory: string | undefined
    let totalKeys: number | undefined

    if (connected) {
      try {
        const info = await redis.info()

        // Parse version
        const versionMatch = info.match(/redis_version:([^\r\n]+)/)
        if (versionMatch) {
          version = versionMatch[1]
        }

        // Parse uptime
        const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/)
        if (uptimeMatch) {
          uptime = parseInt(uptimeMatch[1])
        }

        // Parse memory
        const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/)
        if (memoryMatch) {
          usedMemory = memoryMatch[1]
        }

        // Get total keys
        try {
          totalKeys = await redis.dbsize()
        } catch (error) {
          errors.push(`Failed to get dbsize: ${error}`)
        }
      } catch (error) {
        errors.push(`Failed to get server info: ${error}`)
      }
    }

    // Test 4: Session cache health
    const cacheHealthy = await sessionCacheHealthCheck()
    const cacheMetrics = getSessionCacheMetrics()
    const poolStats = getSessionCachePoolStats()

    // Test 5: Hotkey detection metrics
    const hotkeyDetector = getHotkeyDetector()
    const hotkeyStats = hotkeyDetector.getHotkeys(10) // Top 10 hotkeys
    const detectorStats = hotkeyDetector.getStats()

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy'

    if (!connected) {
      status = 'unhealthy'
    } else if (errors.length > 0 || !cacheHealthy) {
      status = 'degraded'
    } else if (pingTime && pingTime > 100) {
      // If ping is slower than 100ms, consider degraded
      status = 'degraded'
      errors.push(`High latency detected: ${pingTime}ms`)
    } else {
      status = 'healthy'
    }

    // Get trace context for correlation
    const traceContext = getTraceContext()
    const tracingConfig = getTracingConfig()

    // Build response
    const response: RedisHealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      ...(Object.keys(traceContext).length > 0 ? { trace: traceContext } : {}),
      tracing: {
        enabled: tracingConfig.enabled,
        service_name: tracingConfig.serviceName,
        sample_rate: tracingConfig.sampleRate,
      },
      redis: {
        connected,
        version,
        uptime,
        usedMemory,
        totalKeys,
      },
      sessionCache: {
        enabled: cacheMetrics.enabled,
        healthy: cacheHealthy,
        metrics: cacheMetrics,
        pool: poolStats,
      },
      hotkeys: {
        totalTracked: hotkeyStats.totalKeys,
        totalAccesses: hotkeyStats.totalAccesses,
        thresholdExceeded: hotkeyStats.thresholdExceeded,
        topHotkeys: hotkeyStats.hotkeys,
        detectorStats: {
          threshold: detectorStats.threshold,
          windowSizeMs: detectorStats.windowSizeMs,
          maxTrackedKeys: detectorStats.maxTrackedKeys,
        },
      },
      performance: {
        ping: pingTime,
        set: setTime,
        get: getTime,
      },
      errors,
    }

    // Close health check Redis connection
    if (redis) {
      await redis.close()
    }

    // Return appropriate status code
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503

    return res.status(statusCode).json(response)
  } catch (error) {
    logRedisOperation({
      operation: 'health_check',
      message: 'Unexpected error in Redis health check',
      level: 'error',
      error: error as Error,
    })

    if (redis) {
      try {
        await redis.close()
      } catch {
        // Ignore cleanup errors
      }
    }

    const tracingConfig = getTracingConfig()
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      trace: getTraceContext(),
      tracing: {
        enabled: tracingConfig.enabled,
        service_name: tracingConfig.serviceName,
        sample_rate: tracingConfig.sampleRate,
      },
      redis: { connected: false },
      sessionCache: {
        enabled: false,
        healthy: false,
        metrics: { hits: 0, misses: 0, errors: 0, total: 0, hitRate: 0, ttl: 0 },
        pool: null,
      },
      hotkeys: {
        totalTracked: 0,
        totalAccesses: 0,
        thresholdExceeded: 0,
        topHotkeys: [],
        detectorStats: { threshold: 0, windowSizeMs: 0, maxTrackedKeys: 0 },
      },
      performance: { ping: null, set: null, get: null },
      errors: [String(error)],
    })
  }
}
