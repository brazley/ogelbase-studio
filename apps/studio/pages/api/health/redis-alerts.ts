/**
 * Redis Monitoring Alerts Endpoint
 *
 * Returns alert status for critical Redis metrics:
 * - Cache hit rate < 90%
 * - p99 latency > 10ms
 * - Circuit breaker open
 * - Redis connection failures
 * - Memory usage > 80%
 *
 * GET /api/health/redis-alerts
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCacheMetrics } from '../../../lib/api/auth/session-cache'
import { createRedisClient } from '../../../lib/api/platform/redis'
import { Tier } from '../../../lib/api/platform/connection-manager'
import { getHotkeyDetector } from '../../../lib/api/cache/hotkey-detection'

interface Alert {
  severity: 'critical' | 'warning' | 'info'
  metric: string
  message: string
  threshold: string
  actual: string
  recommendation: string
  timestamp: string
}

interface AlertsResponse {
  status: 'healthy' | 'warning' | 'critical'
  timestamp: string
  alerts: Alert[]
  summary: {
    critical: number
    warning: number
    info: number
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AlertsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'critical',
      timestamp: new Date().toISOString(),
      alerts: [],
      summary: { critical: 0, warning: 0, info: 0 },
    })
  }

  const alerts: Alert[] = []
  const timestamp = new Date().toISOString()

  try {
    // Check if Redis is configured
    if (!process.env.REDIS_URL) {
      alerts.push({
        severity: 'critical',
        metric: 'redis_configuration',
        message: 'Redis URL not configured',
        threshold: 'configured',
        actual: 'not configured',
        recommendation: 'Set REDIS_URL environment variable',
        timestamp,
      })

      return res.status(200).json({
        status: 'critical',
        timestamp,
        alerts,
        summary: { critical: 1, warning: 0, info: 0 },
      })
    }

    // Initialize Redis client for monitoring
    const redis = createRedisClient('alerts-check', {
      connectionString: process.env.REDIS_URL,
      tier: Tier.PRO,
    })

    try {
      // ========================================
      // Alert 1: Cache Hit Rate
      // ========================================
      const cacheMetrics = getSessionCacheMetrics()
      const hitRateThreshold = 90
      const currentHitRate = cacheMetrics.hitRate

      if (cacheMetrics.total > 10) {
        // Only alert if we have meaningful sample size
        if (currentHitRate < hitRateThreshold) {
          alerts.push({
            severity: currentHitRate < 70 ? 'critical' : 'warning',
            metric: 'cache_hit_rate',
            message: `Cache hit rate is ${currentHitRate.toFixed(1)}%, below ${hitRateThreshold}% threshold`,
            threshold: `>= ${hitRateThreshold}%`,
            actual: `${currentHitRate.toFixed(1)}%`,
            recommendation:
              'Investigate cache misses. Check TTL settings, cache invalidation patterns, or increase cache size.',
            timestamp,
          })
        }
      }

      // ========================================
      // Alert 2: Performance Latency
      // ========================================
      // Run quick performance test
      const testKey = `alert:perf:${Date.now()}`
      const measurements: number[] = []

      for (let i = 0; i < 10; i++) {
        const start = Date.now()
        await redis.set(testKey, 'test', 60)
        await redis.get(testKey)
        measurements.push(Date.now() - start)
      }

      await redis.del(testKey)

      // Calculate p99
      measurements.sort((a, b) => a - b)
      const p99 = measurements[Math.floor(measurements.length * 0.99)]
      const p99Threshold = 10 // 10ms

      if (p99 > p99Threshold) {
        alerts.push({
          severity: p99 > 50 ? 'critical' : 'warning',
          metric: 'p99_latency',
          message: `p99 latency is ${p99}ms, above ${p99Threshold}ms threshold`,
          threshold: `<= ${p99Threshold}ms`,
          actual: `${p99}ms`,
          recommendation:
            'Check network latency to Redis. Verify using railway.internal domain. Consider connection pool optimization.',
          timestamp,
        })
      }

      // ========================================
      // Alert 3: Connection Health
      // ========================================
      try {
        await redis.ping()
      } catch (error) {
        alerts.push({
          severity: 'critical',
          metric: 'redis_connection',
          message: `Redis connection failed: ${error}`,
          threshold: 'connected',
          actual: 'disconnected',
          recommendation:
            'Check Redis service status on Railway. Verify REDIS_URL is correct. Check network connectivity.',
          timestamp,
        })
      }

      // ========================================
      // Alert 4: Memory Usage
      // ========================================
      const info = await redis.info('memory')

      // Parse memory info
      const usedMemoryMatch = info.match(/used_memory:(\d+)/)
      const maxmemoryMatch = info.match(/maxmemory:(\d+)/)

      if (usedMemoryMatch && maxmemoryMatch) {
        const usedMemory = parseInt(usedMemoryMatch[1])
        const maxmemory = parseInt(maxmemoryMatch[1])

        if (maxmemory > 0) {
          const usagePercent = (usedMemory / maxmemory) * 100
          const memoryThreshold = 80

          if (usagePercent > memoryThreshold) {
            alerts.push({
              severity: usagePercent > 95 ? 'critical' : 'warning',
              metric: 'memory_usage',
              message: `Memory usage is ${usagePercent.toFixed(1)}%, above ${memoryThreshold}% threshold`,
              threshold: `<= ${memoryThreshold}%`,
              actual: `${usagePercent.toFixed(1)}% (${Math.round(usedMemory / 1024 / 1024)}MB / ${Math.round(maxmemory / 1024 / 1024)}MB)`,
              recommendation:
                'Review eviction policy effectiveness. Consider increasing maxmemory limit. Check for memory leaks or inefficient data structures.',
              timestamp,
            })
          }
        } else {
          // No maxmemory set
          alerts.push({
            severity: 'warning',
            metric: 'maxmemory_configuration',
            message: 'No maxmemory limit configured - risk of OOM crashes',
            threshold: 'configured',
            actual: 'unlimited',
            recommendation: 'Set maxmemory limit via CONFIG SET or Railway dashboard',
            timestamp,
          })
        }
      }

      // ========================================
      // Alert 5: Eviction Policy
      // ========================================
      const policyConfig = await redis.config('GET', 'maxmemory-policy')
      const currentPolicy = policyConfig[1]
      const recommendedPolicy = 'allkeys-lru'

      if (currentPolicy !== recommendedPolicy && currentPolicy !== 'noeviction') {
        alerts.push({
          severity: 'warning',
          metric: 'eviction_policy',
          message: `Eviction policy is ${currentPolicy}, recommended is ${recommendedPolicy}`,
          threshold: recommendedPolicy,
          actual: currentPolicy,
          recommendation: `Set maxmemory-policy to ${recommendedPolicy} for optimal cache behavior`,
          timestamp,
        })
      }

      if (currentPolicy === 'noeviction') {
        alerts.push({
          severity: 'critical',
          metric: 'eviction_policy',
          message: 'No eviction policy configured - will cause write failures when memory full',
          threshold: recommendedPolicy,
          actual: currentPolicy,
          recommendation: `Set maxmemory-policy to ${recommendedPolicy} immediately`,
          timestamp,
        })
      }

      // ========================================
      // Alert 6: Cache Error Rate
      // ========================================
      if (cacheMetrics.errors > 0) {
        const errorRate = (cacheMetrics.errors / Math.max(cacheMetrics.total, 1)) * 100

        if (errorRate > 1) {
          // More than 1% error rate
          alerts.push({
            severity: errorRate > 5 ? 'critical' : 'warning',
            metric: 'cache_error_rate',
            message: `Cache error rate is ${errorRate.toFixed(1)}%, indicating reliability issues`,
            threshold: '<= 1%',
            actual: `${errorRate.toFixed(1)}% (${cacheMetrics.errors} errors)`,
            recommendation:
              'Check Redis logs for error patterns. Verify connection stability. Review circuit breaker status.',
            timestamp,
          })
        }
      }

      // ========================================
      // Alert 7: Hotkey Detection
      // ========================================
      const hotkeyDetector = getHotkeyDetector()
      const hotkeyStats = hotkeyDetector.getHotkeys(10)
      const detectorStats = hotkeyDetector.getStats()

      if (hotkeyStats.thresholdExceeded > 0) {
        const topHotkey = hotkeyStats.hotkeys[0]

        if (topHotkey && topHotkey.isHot) {
          alerts.push({
            severity: topHotkey.accessesPerMinute > detectorStats.threshold * 5 ? 'critical' : 'warning',
            metric: 'hotkey_detected',
            message: `Hotkey detected: "${topHotkey.key}" with ${topHotkey.accessesPerMinute} accesses/min (threshold: ${detectorStats.threshold})`,
            threshold: `<= ${detectorStats.threshold} accesses/min`,
            actual: `${topHotkey.accessesPerMinute} accesses/min across ${hotkeyStats.thresholdExceeded} keys`,
            recommendation:
              'Consider read replicas for hot keys, implement client-side caching, or use hash tags for cluster distribution. Review access patterns for optimization opportunities.',
            timestamp,
          })
        }

        // If there are many hotkeys, add an aggregated warning
        if (hotkeyStats.thresholdExceeded > 5) {
          alerts.push({
            severity: 'warning',
            metric: 'multiple_hotkeys',
            message: `${hotkeyStats.thresholdExceeded} keys exceeding hotkey threshold`,
            threshold: '<= 5 hotkeys',
            actual: `${hotkeyStats.thresholdExceeded} hotkeys detected`,
            recommendation:
              'Multiple hotkeys indicate access pattern issues. Review key design, implement caching layers, or consider data structure optimization.',
            timestamp,
          })
        }
      }

      // Check if we're tracking too many keys (memory concern)
      if (detectorStats.trackedKeys >= detectorStats.maxTrackedKeys * 0.9) {
        alerts.push({
          severity: detectorStats.trackedKeys >= detectorStats.maxTrackedKeys ? 'critical' : 'warning',
          metric: 'hotkey_detector_capacity',
          message: `Hotkey detector tracking ${detectorStats.trackedKeys} keys, approaching limit of ${detectorStats.maxTrackedKeys}`,
          threshold: `< ${Math.floor(detectorStats.maxTrackedKeys * 0.9)} keys`,
          actual: `${detectorStats.trackedKeys} keys`,
          recommendation:
            'Increase REDIS_MAX_TRACKED_KEYS or review key namespace patterns. High key count may indicate need for aggregation.',
          timestamp,
        })
      }

      // Close monitoring Redis connection
      await redis.close()
    } catch (error) {
      alerts.push({
        severity: 'critical',
        metric: 'monitoring_system',
        message: `Monitoring system error: ${error}`,
        threshold: 'operational',
        actual: 'error',
        recommendation: 'Check monitoring system logs and Redis connectivity',
        timestamp,
      })
    }

    // ========================================
    // Build Response
    // ========================================
    const summary = {
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
    }

    const status = summary.critical > 0 ? 'critical' : summary.warning > 0 ? 'warning' : 'healthy'

    return res.status(200).json({
      status,
      timestamp,
      alerts,
      summary,
    })
  } catch (error) {
    console.error('[RedisAlerts] Unexpected error:', error)

    return res.status(503).json({
      status: 'critical',
      timestamp,
      alerts: [
        {
          severity: 'critical',
          metric: 'alert_system',
          message: `Alert system failure: ${error}`,
          threshold: 'operational',
          actual: 'failed',
          recommendation: 'Check application logs and Redis connectivity',
          timestamp,
        },
      ],
      summary: { critical: 1, warning: 0, info: 0 },
    })
  }
}
