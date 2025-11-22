/**
 * Session Validation Performance Benchmark
 *
 * Measures and compares:
 * - Direct Postgres session validation
 * - Redis-cached session validation
 * - Cache hit rates
 * - Latency percentiles (p50, p95, p99)
 * - Throughput (ops/sec)
 *
 * Usage:
 *   REDIS_URL=redis://... tsx session-performance-benchmark.ts
 */

import { validateSession } from '../lib/api/auth/session'
import {
  validateSessionWithCache,
  getSessionCacheMetrics,
  sessionCache,
} from '../lib/api/auth/session-cache'
import { queryPlatformDatabase } from '../lib/api/platform/database'
import { hashToken } from '../lib/api/auth/utils'
import crypto from 'crypto'

/**
 * Performance measurement utilities
 */
class PerformanceMeasurement {
  private measurements: number[] = []

  record(durationMs: number) {
    this.measurements.push(durationMs)
  }

  getStats() {
    if (this.measurements.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      }
    }

    const sorted = [...this.measurements].sort((a, b) => a - b)
    const count = sorted.length

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / count,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    }
  }

  reset() {
    this.measurements = []
  }
}

/**
 * Create test session in database
 */
async function createTestSession(email: string): Promise<{ token: string; sessionId: string }> {
  // Generate session token
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)

  // Create test user
  const { data: users } = await queryPlatformDatabase<{ id: string }>({
    query: `
      INSERT INTO platform.users (email, password_hash, first_name, last_name)
      VALUES ($1, 'test-hash', 'Test', 'User')
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `,
    parameters: [email],
  })

  if (!users || users.length === 0) {
    throw new Error('Failed to create test user')
  }

  const userId = users[0].id

  // Create session
  const { data: sessions } = await queryPlatformDatabase<{ id: string }>({
    query: `
      INSERT INTO platform.user_sessions (user_id, token, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '1 day')
      RETURNING id
    `,
    parameters: [userId, tokenHash],
  })

  if (!sessions || sessions.length === 0) {
    throw new Error('Failed to create test session')
  }

  return {
    token,
    sessionId: sessions[0].id,
  }
}

/**
 * Cleanup test session
 */
async function cleanupTestSession(sessionId: string, email: string) {
  await queryPlatformDatabase({
    query: 'DELETE FROM platform.user_sessions WHERE id = $1',
    parameters: [sessionId],
  })

  await queryPlatformDatabase({
    query: 'DELETE FROM platform.users WHERE email = $1',
    parameters: [email],
  })
}

/**
 * Run performance benchmark
 */
async function runBenchmark() {
  console.log('='.repeat(80))
  console.log('SESSION VALIDATION PERFORMANCE BENCHMARK')
  console.log('='.repeat(80))
  console.log()

  const testEmail = `bench-${Date.now()}@test.com`
  let testSession: { token: string; sessionId: string } | null = null

  try {
    // Create test session
    console.log('Setting up test session...')
    testSession = await createTestSession(testEmail)
    console.log(`Test session created: ${testSession.sessionId}`)
    console.log()

    // Benchmark configuration
    const warmupRounds = 10
    const benchmarkRounds = 100

    // ========================================
    // Benchmark 1: Postgres Direct (Baseline)
    // ========================================
    console.log('Benchmark 1: Postgres Direct Validation (Baseline)')
    console.log('-'.repeat(80))

    const postgresPerf = new PerformanceMeasurement()

    // Warmup
    for (let i = 0; i < warmupRounds; i++) {
      await validateSession(testSession.token)
    }

    // Benchmark
    const postgresStart = Date.now()
    for (let i = 0; i < benchmarkRounds; i++) {
      const start = Date.now()
      await validateSession(testSession.token)
      postgresPerf.record(Date.now() - start)
    }
    const postgresTotalTime = Date.now() - postgresStart

    const postgresStats = postgresPerf.getStats()
    const postgresThroughput = Math.round((benchmarkRounds / postgresTotalTime) * 1000)

    console.log(`Operations: ${benchmarkRounds}`)
    console.log(`Total Time: ${postgresTotalTime}ms`)
    console.log(`Throughput: ${postgresThroughput} ops/sec`)
    console.log(`Latency:`)
    console.log(`  Min: ${postgresStats.min.toFixed(2)}ms`)
    console.log(`  Avg: ${postgresStats.avg.toFixed(2)}ms`)
    console.log(`  p50: ${postgresStats.p50.toFixed(2)}ms`)
    console.log(`  p95: ${postgresStats.p95.toFixed(2)}ms`)
    console.log(`  p99: ${postgresStats.p99.toFixed(2)}ms`)
    console.log(`  Max: ${postgresStats.max.toFixed(2)}ms`)
    console.log()

    // ========================================
    // Benchmark 2: Redis Cached (Cold Start)
    // ========================================
    if (process.env.REDIS_URL) {
      console.log('Benchmark 2: Redis Cached Validation (Cold Start)')
      console.log('-'.repeat(80))

      // Clear cache to simulate cold start
      await sessionCache.invalidateSession(testSession.token)
      sessionCache.resetMetrics()

      const redisColdPerf = new PerformanceMeasurement()

      // First request will be cache miss
      const coldStart = Date.now()
      await validateSessionWithCache(testSession.token)
      redisColdPerf.record(Date.now() - coldStart)

      const coldStats = redisColdPerf.getStats()
      const coldMetrics = getSessionCacheMetrics()

      console.log(`First Request (Cache Miss): ${coldStats.avg.toFixed(2)}ms`)
      console.log(`Cache Metrics:`)
      console.log(`  Hits: ${coldMetrics.hits}`)
      console.log(`  Misses: ${coldMetrics.misses}`)
      console.log(`  Hit Rate: ${coldMetrics.hitRate}%`)
      console.log()

      // ========================================
      // Benchmark 3: Redis Cached (Warm Cache)
      // ========================================
      console.log('Benchmark 3: Redis Cached Validation (Warm Cache)')
      console.log('-'.repeat(80))

      const redisWarmPerf = new PerformanceMeasurement()
      sessionCache.resetMetrics()

      // Warmup
      for (let i = 0; i < warmupRounds; i++) {
        await validateSessionWithCache(testSession.token)
      }

      // Benchmark
      const redisStart = Date.now()
      for (let i = 0; i < benchmarkRounds; i++) {
        const start = Date.now()
        await validateSessionWithCache(testSession.token)
        redisWarmPerf.record(Date.now() - start)
      }
      const redisTotalTime = Date.now() - redisStart

      const redisStats = redisWarmPerf.getStats()
      const redisThroughput = Math.round((benchmarkRounds / redisTotalTime) * 1000)
      const warmMetrics = getSessionCacheMetrics()

      console.log(`Operations: ${benchmarkRounds}`)
      console.log(`Total Time: ${redisTotalTime}ms`)
      console.log(`Throughput: ${redisThroughput} ops/sec`)
      console.log(`Latency:`)
      console.log(`  Min: ${redisStats.min.toFixed(2)}ms`)
      console.log(`  Avg: ${redisStats.avg.toFixed(2)}ms`)
      console.log(`  p50: ${redisStats.p50.toFixed(2)}ms`)
      console.log(`  p95: ${redisStats.p95.toFixed(2)}ms`)
      console.log(`  p99: ${redisStats.p99.toFixed(2)}ms`)
      console.log(`  Max: ${redisStats.max.toFixed(2)}ms`)
      console.log(`Cache Metrics:`)
      console.log(`  Hits: ${warmMetrics.hits}`)
      console.log(`  Misses: ${warmMetrics.misses}`)
      console.log(`  Hit Rate: ${warmMetrics.hitRate}%`)
      console.log()

      // ========================================
      // Performance Comparison
      // ========================================
      console.log('='.repeat(80))
      console.log('PERFORMANCE COMPARISON')
      console.log('='.repeat(80))
      console.log()

      const speedupAvg = (postgresStats.avg / redisStats.avg).toFixed(2)
      const speedupP99 = (postgresStats.p99 / redisStats.p99).toFixed(2)
      const throughputIncrease = ((redisThroughput / postgresThroughput - 1) * 100).toFixed(1)

      console.log(`Average Latency Improvement: ${speedupAvg}x faster`)
      console.log(`P99 Latency Improvement: ${speedupP99}x faster`)
      console.log(`Throughput Increase: ${throughputIncrease}%`)
      console.log()

      console.log('Absolute Latency Reduction:')
      console.log(`  Avg: ${postgresStats.avg.toFixed(2)}ms → ${redisStats.avg.toFixed(2)}ms (${(postgresStats.avg - redisStats.avg).toFixed(2)}ms saved)`)
      console.log(`  p95: ${postgresStats.p95.toFixed(2)}ms → ${redisStats.p95.toFixed(2)}ms (${(postgresStats.p95 - redisStats.p95).toFixed(2)}ms saved)`)
      console.log(`  p99: ${postgresStats.p99.toFixed(2)}ms → ${redisStats.p99.toFixed(2)}ms (${(postgresStats.p99 - redisStats.p99).toFixed(2)}ms saved)`)
      console.log()

      // ========================================
      // Target Analysis
      // ========================================
      console.log('='.repeat(80))
      console.log('TARGET ANALYSIS')
      console.log('='.repeat(80))
      console.log()

      const target = 5 // 5ms target
      const meetsTarget = redisStats.p99 < target

      console.log(`Target: <${target}ms p99 latency`)
      console.log(`Actual p99: ${redisStats.p99.toFixed(2)}ms`)
      console.log(`Status: ${meetsTarget ? '✓ TARGET MET' : '✗ TARGET MISSED'}`)
      console.log()

      if (!meetsTarget) {
        console.log(`Gap: ${(redisStats.p99 - target).toFixed(2)}ms over target`)
        console.log('Recommendations:')
        console.log('  - Check network latency to Redis')
        console.log('  - Verify Redis is running on railway.internal')
        console.log('  - Consider connection pool tuning')
        console.log('  - Review serialization overhead')
      }

      const hitRateTarget = 95
      const meetsHitRate = warmMetrics.hitRate >= hitRateTarget

      console.log()
      console.log(`Cache Hit Rate Target: >=${hitRateTarget}%`)
      console.log(`Actual Hit Rate: ${warmMetrics.hitRate}%`)
      console.log(`Status: ${meetsHitRate ? '✓ TARGET MET' : '✗ TARGET MISSED'}`)
      console.log()

    } else {
      console.log('Redis URL not configured, skipping Redis benchmarks')
      console.log('Set REDIS_URL environment variable to test caching performance')
      console.log()
    }

    console.log('='.repeat(80))
    console.log('BENCHMARK COMPLETE')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\nBenchmark failed:', error)
    process.exit(1)
  } finally {
    // Cleanup
    if (testSession) {
      console.log('\nCleaning up test session...')
      await cleanupTestSession(testSession.sessionId, testEmail)
    }

    // Close cache connection
    await sessionCache.close()
  }
}

// Run benchmark
if (require.main === module) {
  runBenchmark()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

export { runBenchmark }
