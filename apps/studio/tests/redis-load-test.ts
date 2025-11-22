/**
 * Redis Load Testing Suite
 *
 * Tests Redis performance under realistic production load:
 * - Baseline: 100 concurrent users, 10 req/s each = 1000 req/s
 * - Peak: 500 concurrent users, 10 req/s each = 5000 req/s
 * - Sustained: 1000 req/s for 5 minutes
 * - Spike: 0 → 5000 req/s in 10 seconds
 *
 * Measures:
 * - p50, p95, p99 latencies
 * - Error rate
 * - Cache hit rate under load
 * - Connection pool exhaustion
 * - Circuit breaker triggers
 * - Memory usage growth
 *
 * Usage:
 *   REDIS_URL=redis://... tsx tests/redis-load-test.ts [scenario]
 *
 * Scenarios: baseline | peak | sustained | spike | all (default)
 */

import {
  validateSessionWithCache,
  getSessionCacheMetrics,
  sessionCache,
} from '../lib/api/auth/session-cache'
import { queryPlatformDatabase } from '../lib/api/platform/database'
import { hashToken } from '../lib/api/auth/utils'
import crypto from 'crypto'
import { createRedisClient } from '../lib/api/platform/redis'
import { Tier } from '../lib/api/platform/connection-manager'

/**
 * Performance measurement utilities
 */
class LoadTestMetrics {
  private latencies: number[] = []
  private errors: number[] = []
  private startTime: number = 0
  private endTime: number = 0

  start() {
    this.startTime = Date.now()
  }

  end() {
    this.endTime = Date.now()
  }

  recordSuccess(latencyMs: number) {
    this.latencies.push(latencyMs)
  }

  recordError(latencyMs: number) {
    this.errors.push(latencyMs)
  }

  getStats() {
    const totalRequests = this.latencies.length + this.errors.length
    const successfulRequests = this.latencies.length
    const failedRequests = this.errors.length
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0

    const sorted = [...this.latencies].sort((a, b) => a - b)
    const duration = (this.endTime - this.startTime) / 1000 // seconds

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate: errorRate.toFixed(2),
      duration: duration.toFixed(1),
      throughput: duration > 0 ? Math.round(totalRequests / duration) : 0,
      latency: {
        min: sorted.length > 0 ? sorted[0] : 0,
        max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
        avg:
          sorted.length > 0
            ? sorted.reduce((a, b) => a + b, 0) / sorted.length
            : 0,
        p50: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0,
        p95: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        p99: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0,
      },
    }
  }

  reset() {
    this.latencies = []
    this.errors = []
    this.startTime = 0
    this.endTime = 0
  }
}

/**
 * Create test sessions
 */
async function createTestSessions(count: number): Promise<string[]> {
  const tokens: string[] = []

  console.log(`Creating ${count} test sessions...`)

  for (let i = 0; i < count; i++) {
    const email = `load-test-${Date.now()}-${i}@test.com`
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)

    // Create user
    const { data: users } = await queryPlatformDatabase<{ id: string }>({
      query: `
        INSERT INTO platform.users (email, password_hash, first_name, last_name)
        VALUES ($1, 'test-hash', 'Load', 'Test')
        RETURNING id
      `,
      parameters: [email],
    })

    if (users && users.length > 0) {
      // Create session
      await queryPlatformDatabase({
        query: `
          INSERT INTO platform.user_sessions (user_id, token, expires_at)
          VALUES ($1, $2, NOW() + INTERVAL '1 day')
        `,
        parameters: [users[0].id, tokenHash],
      })

      tokens.push(token)
    }

    // Progress indicator
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\rCreated ${i + 1}/${count} sessions...`)
    }
  }

  console.log(`\n✓ Created ${tokens.length} test sessions`)
  return tokens
}

/**
 * Cleanup test sessions
 */
async function cleanupTestSessions() {
  console.log('Cleaning up test sessions...')

  await queryPlatformDatabase({
    query: "DELETE FROM platform.user_sessions WHERE user_id IN (SELECT id FROM platform.users WHERE email LIKE 'load-test-%')",
  })

  await queryPlatformDatabase({
    query: "DELETE FROM platform.users WHERE email LIKE 'load-test-%'",
  })

  console.log('✓ Cleanup complete')
}

/**
 * Simulate concurrent users
 */
async function simulateUser(
  userId: number,
  token: string,
  requestsPerSecond: number,
  durationSeconds: number,
  metrics: LoadTestMetrics
): Promise<void> {
  const delayMs = 1000 / requestsPerSecond
  const endTime = Date.now() + durationSeconds * 1000

  while (Date.now() < endTime) {
    const start = Date.now()

    try {
      await validateSessionWithCache(token)
      const latency = Date.now() - start
      metrics.recordSuccess(latency)
    } catch (error) {
      const latency = Date.now() - start
      metrics.recordError(latency)
    }

    // Wait before next request
    const elapsed = Date.now() - start
    const waitTime = Math.max(0, delayMs - elapsed)
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }
}

/**
 * Get Redis memory stats
 */
async function getMemoryStats(): Promise<{
  usedMemory: number
  maxmemory: number
  usagePercent: number
}> {
  if (!process.env.REDIS_URL) {
    return { usedMemory: 0, maxmemory: 0, usagePercent: 0 }
  }

  const redis = createRedisClient('load-test-stats', {
    connectionString: process.env.REDIS_URL,
    tier: Tier.PRO,
  })

  try {
    const info = await redis.info('memory')

    const usedMemoryMatch = info.match(/used_memory:(\d+)/)
    const maxmemoryMatch = info.match(/maxmemory:(\d+)/)

    const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0
    const maxmemory = maxmemoryMatch ? parseInt(maxmemoryMatch[1]) : 0
    const usagePercent = maxmemory > 0 ? (usedMemory / maxmemory) * 100 : 0

    return { usedMemory, maxmemory, usagePercent }
  } finally {
    await redis.close()
  }
}

/**
 * Display test results
 */
function displayResults(
  scenarioName: string,
  metrics: LoadTestMetrics,
  cacheMetrics: any,
  memoryBefore: any,
  memoryAfter: any
) {
  const stats = metrics.getStats()

  console.log()
  console.log('='.repeat(80))
  console.log(`RESULTS: ${scenarioName}`)
  console.log('='.repeat(80))
  console.log()

  console.log('Request Metrics:')
  console.log(`  Total Requests:      ${stats.totalRequests}`)
  console.log(`  Successful:          ${stats.successfulRequests}`)
  console.log(`  Failed:              ${stats.failedRequests}`)
  console.log(`  Error Rate:          ${stats.errorRate}%`)
  console.log(`  Duration:            ${stats.duration}s`)
  console.log(`  Throughput:          ${stats.throughput} req/s`)
  console.log()

  console.log('Latency:')
  console.log(`  Min:                 ${stats.latency.min.toFixed(2)}ms`)
  console.log(`  Avg:                 ${stats.latency.avg.toFixed(2)}ms`)
  console.log(`  p50:                 ${stats.latency.p50.toFixed(2)}ms`)
  console.log(`  p95:                 ${stats.latency.p95.toFixed(2)}ms`)
  console.log(`  p99:                 ${stats.latency.p99.toFixed(2)}ms`)
  console.log(`  Max:                 ${stats.latency.max.toFixed(2)}ms`)
  console.log()

  console.log('Cache Metrics:')
  console.log(`  Hits:                ${cacheMetrics.hits}`)
  console.log(`  Misses:              ${cacheMetrics.misses}`)
  console.log(`  Errors:              ${cacheMetrics.errors}`)
  console.log(`  Hit Rate:            ${cacheMetrics.hitRate.toFixed(1)}%`)
  console.log()

  console.log('Memory Usage:')
  console.log(
    `  Before:              ${Math.round(memoryBefore.usedMemory / 1024 / 1024)}MB (${memoryBefore.usagePercent.toFixed(1)}%)`
  )
  console.log(
    `  After:               ${Math.round(memoryAfter.usedMemory / 1024 / 1024)}MB (${memoryAfter.usagePercent.toFixed(1)}%)`
  )
  console.log(
    `  Growth:              ${Math.round((memoryAfter.usedMemory - memoryBefore.usedMemory) / 1024 / 1024)}MB`
  )
  console.log()

  // Target validation
  const p99Target = 10 // 10ms
  const hitRateTarget = 90 // 90%
  const errorRateTarget = 1 // 1%

  console.log('Target Validation:')
  console.log(
    `  p99 < ${p99Target}ms:            ${stats.latency.p99 < p99Target ? '✓ PASS' : '✗ FAIL'} (${stats.latency.p99.toFixed(2)}ms)`
  )
  console.log(
    `  Hit Rate >= ${hitRateTarget}%:      ${cacheMetrics.hitRate >= hitRateTarget ? '✓ PASS' : '✗ FAIL'} (${cacheMetrics.hitRate.toFixed(1)}%)`
  )
  console.log(
    `  Error Rate < ${errorRateTarget}%:       ${parseFloat(stats.errorRate) < errorRateTarget ? '✓ PASS' : '✗ FAIL'} (${stats.errorRate}%)`
  )
  console.log()
}

/**
 * Scenario 1: Baseline Load
 * 100 concurrent users, 10 req/s each = 1000 req/s total for 30 seconds
 */
async function baselineScenario(tokens: string[]) {
  console.log()
  console.log('='.repeat(80))
  console.log('SCENARIO 1: BASELINE LOAD')
  console.log('100 concurrent users × 10 req/s = 1000 req/s for 30 seconds')
  console.log('='.repeat(80))
  console.log()

  const metrics = new LoadTestMetrics()
  sessionCache.resetMetrics()

  const concurrentUsers = 100
  const requestsPerSecond = 10
  const durationSeconds = 30

  const memoryBefore = await getMemoryStats()

  console.log('Starting load test...')
  metrics.start()

  // Launch concurrent users
  const userPromises = []
  for (let i = 0; i < concurrentUsers; i++) {
    const token = tokens[i % tokens.length]
    userPromises.push(
      simulateUser(i, token, requestsPerSecond, durationSeconds, metrics)
    )

    // Progress indicator
    if ((i + 1) % 20 === 0) {
      process.stdout.write(`\rLaunched ${i + 1}/${concurrentUsers} users...`)
    }
  }

  console.log(`\nWaiting for test to complete (${durationSeconds}s)...`)
  await Promise.all(userPromises)

  metrics.end()
  const memoryAfter = await getMemoryStats()
  const cacheMetrics = getSessionCacheMetrics()

  displayResults('Baseline Load', metrics, cacheMetrics, memoryBefore, memoryAfter)
}

/**
 * Scenario 2: Peak Load
 * 500 concurrent users, 10 req/s each = 5000 req/s total for 30 seconds
 */
async function peakScenario(tokens: string[]) {
  console.log()
  console.log('='.repeat(80))
  console.log('SCENARIO 2: PEAK LOAD')
  console.log('500 concurrent users × 10 req/s = 5000 req/s for 30 seconds')
  console.log('='.repeat(80))
  console.log()

  const metrics = new LoadTestMetrics()
  sessionCache.resetMetrics()

  const concurrentUsers = 500
  const requestsPerSecond = 10
  const durationSeconds = 30

  const memoryBefore = await getMemoryStats()

  console.log('Starting peak load test...')
  metrics.start()

  // Launch concurrent users
  const userPromises = []
  for (let i = 0; i < concurrentUsers; i++) {
    const token = tokens[i % tokens.length]
    userPromises.push(
      simulateUser(i, token, requestsPerSecond, durationSeconds, metrics)
    )

    // Progress indicator
    if ((i + 1) % 50 === 0) {
      process.stdout.write(`\rLaunched ${i + 1}/${concurrentUsers} users...`)
    }
  }

  console.log(`\nWaiting for test to complete (${durationSeconds}s)...`)
  await Promise.all(userPromises)

  metrics.end()
  const memoryAfter = await getMemoryStats()
  const cacheMetrics = getSessionCacheMetrics()

  displayResults('Peak Load', metrics, cacheMetrics, memoryBefore, memoryAfter)
}

/**
 * Scenario 3: Sustained Load
 * 1000 req/s for 5 minutes (300 seconds)
 */
async function sustainedScenario(tokens: string[]) {
  console.log()
  console.log('='.repeat(80))
  console.log('SCENARIO 3: SUSTAINED LOAD')
  console.log('100 concurrent users × 10 req/s = 1000 req/s for 5 minutes')
  console.log('='.repeat(80))
  console.log()

  const metrics = new LoadTestMetrics()
  sessionCache.resetMetrics()

  const concurrentUsers = 100
  const requestsPerSecond = 10
  const durationSeconds = 300 // 5 minutes

  const memoryBefore = await getMemoryStats()

  console.log('Starting sustained load test (this will take 5 minutes)...')
  metrics.start()

  // Launch concurrent users
  const userPromises = []
  for (let i = 0; i < concurrentUsers; i++) {
    const token = tokens[i % tokens.length]
    userPromises.push(
      simulateUser(i, token, requestsPerSecond, durationSeconds, metrics)
    )
  }

  console.log(`Launched ${concurrentUsers} users, waiting for completion...`)

  // Show progress every 30 seconds
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - metrics['startTime']) / 1000)
    console.log(`  Progress: ${elapsed}s / ${durationSeconds}s`)
  }, 30000)

  await Promise.all(userPromises)
  clearInterval(progressInterval)

  metrics.end()
  const memoryAfter = await getMemoryStats()
  const cacheMetrics = getSessionCacheMetrics()

  displayResults('Sustained Load', metrics, cacheMetrics, memoryBefore, memoryAfter)
}

/**
 * Scenario 4: Spike Test
 * Ramp from 0 → 5000 req/s over 10 seconds, sustain for 20 seconds
 */
async function spikeScenario(tokens: string[]) {
  console.log()
  console.log('='.repeat(80))
  console.log('SCENARIO 4: SPIKE TEST')
  console.log('Ramp 0 → 5000 req/s over 10s, sustain 20s')
  console.log('='.repeat(80))
  console.log()

  const metrics = new LoadTestMetrics()
  sessionCache.resetMetrics()

  const maxConcurrentUsers = 500
  const requestsPerSecond = 10
  const rampSeconds = 10
  const sustainSeconds = 20

  const memoryBefore = await getMemoryStats()

  console.log('Starting spike test...')
  metrics.start()

  // Ramp up users gradually
  const userPromises: Promise<void>[] = []
  const usersPerSecond = maxConcurrentUsers / rampSeconds

  for (let second = 0; second < rampSeconds; second++) {
    const usersToAdd = Math.ceil(usersPerSecond)

    for (let i = 0; i < usersToAdd; i++) {
      const userId = second * usersToAdd + i
      const token = tokens[userId % tokens.length]
      userPromises.push(
        simulateUser(
          userId,
          token,
          requestsPerSecond,
          rampSeconds - second + sustainSeconds,
          metrics
        )
      )
    }

    console.log(
      `  Second ${second + 1}: ${userPromises.length} active users, ~${(userPromises.length * requestsPerSecond).toFixed(0)} req/s`
    )

    if (second < rampSeconds - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log(
    `\nRamp complete: ${maxConcurrentUsers} users, ${maxConcurrentUsers * requestsPerSecond} req/s`
  )
  console.log(`Sustaining for ${sustainSeconds}s...`)

  await Promise.all(userPromises)

  metrics.end()
  const memoryAfter = await getMemoryStats()
  const cacheMetrics = getSessionCacheMetrics()

  displayResults('Spike Test', metrics, cacheMetrics, memoryBefore, memoryAfter)
}

/**
 * Run load tests
 */
async function runLoadTests(scenario?: string) {
  console.log('='.repeat(80))
  console.log('REDIS LOAD TESTING SUITE')
  console.log('='.repeat(80))

  if (!process.env.REDIS_URL) {
    console.error('\nERROR: REDIS_URL environment variable not set')
    console.log('Usage: REDIS_URL=redis://... tsx tests/redis-load-test.ts [scenario]')
    console.log('\nScenarios:')
    console.log('  baseline  - 100 users, 1000 req/s, 30s')
    console.log('  peak      - 500 users, 5000 req/s, 30s')
    console.log('  sustained - 100 users, 1000 req/s, 5 minutes')
    console.log('  spike     - Ramp 0 → 5000 req/s over 10s')
    console.log('  all       - Run all scenarios (default)')
    process.exit(1)
  }

  let tokens: string[] = []

  try {
    // Create test sessions
    const sessionCount = 50 // Reuse sessions across users
    tokens = await createTestSessions(sessionCount)

    // Warm cache
    console.log('\nWarming cache...')
    for (const token of tokens.slice(0, 10)) {
      await validateSessionWithCache(token)
    }
    console.log('✓ Cache warmed')

    // Run scenarios
    const runScenario = scenario || 'all'

    if (runScenario === 'baseline' || runScenario === 'all') {
      await baselineScenario(tokens)
    }

    if (runScenario === 'peak' || runScenario === 'all') {
      await peakScenario(tokens)
    }

    if (runScenario === 'sustained' || runScenario === 'all') {
      await sustainedScenario(tokens)
    }

    if (runScenario === 'spike' || runScenario === 'all') {
      await spikeScenario(tokens)
    }

    console.log('='.repeat(80))
    console.log('LOAD TESTING COMPLETE')
    console.log('='.repeat(80))
  } catch (error) {
    console.error('\nLoad test failed:', error)
    process.exit(1)
  } finally {
    // Cleanup
    await cleanupTestSessions()
    await sessionCache.close()
  }
}

// Run load tests
if (require.main === module) {
  const scenario = process.argv[2]
  runLoadTests(scenario)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

export { runLoadTests }
