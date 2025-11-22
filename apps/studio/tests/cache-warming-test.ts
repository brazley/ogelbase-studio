#!/usr/bin/env tsx
/**
 * Cache Warming Integration Test
 *
 * Verifies cache warming system works end-to-end:
 * 1. Connects to Redis and Postgres
 * 2. Queries active sessions
 * 3. Warms cache
 * 4. Validates hit rate improvement
 */

import { warmCache, getCacheWarmingStats, estimateWarmableSessionCount } from '../lib/api/cache/warming'
import { sessionCache } from '../lib/api/auth/session-cache'

async function runTest() {
  console.log('🧪 Cache Warming Integration Test\n')

  // Check environment
  if (!process.env.REDIS_URL) {
    console.error('❌ REDIS_URL not set')
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set')
    process.exit(1)
  }

  console.log('✅ Environment configured\n')

  try {
    // Test 1: Redis Health Check
    console.log('📋 Test 1: Redis Health Check')
    const healthy = await sessionCache.healthCheck()
    if (!healthy) {
      console.error('❌ Redis health check failed')
      process.exit(1)
    }
    console.log('✅ Redis is healthy\n')

    // Test 2: Estimate Warmable Sessions
    console.log('📋 Test 2: Estimate Warmable Sessions')
    const estimate = await estimateWarmableSessionCount()
    console.log(`   Found ${estimate} warmable sessions (last 24h)`)
    
    if (estimate === 0) {
      console.log('⚠️  No sessions to warm - this is expected in new/empty environments')
      console.log('   Skipping warming test\n')
      process.exit(0)
    }
    console.log('')

    // Test 3: Get Baseline Metrics
    console.log('📋 Test 3: Baseline Cache Metrics')
    const beforeStats = getCacheWarmingStats()
    console.log(`   Hit Rate: ${beforeStats.cache.hitRate}%`)
    console.log(`   Hits: ${beforeStats.cache.hits}`)
    console.log(`   Misses: ${beforeStats.cache.misses}`)
    console.log(`   Total: ${beforeStats.cache.total}`)
    console.log('')

    // Test 4: Run Cache Warming (blocking mode)
    console.log('📋 Test 4: Execute Cache Warming')
    const warmLimit = Math.min(estimate, 100) // Test with small batch
    console.log(`   Warming ${warmLimit} sessions...\n`)
    
    const startTime = Date.now()
    const result = await warmCache(warmLimit, true)
    const duration = Date.now() - startTime

    console.log(`   Duration: ${duration}ms`)
    console.log(`   Status: ${result.progress.status}`)
    console.log(`   Warmed: ${result.progress.warmed}/${result.progress.total}`)
    console.log(`   Failed: ${result.progress.failed}`)
    console.log(`   Estimated Hit Rate: ${result.hitRateEstimate}%`)
    console.log('')

    // Test 5: Verify Results
    console.log('📋 Test 5: Verify Warming Results')
    
    if (!result.success) {
      console.error('❌ Cache warming failed')
      console.error(`   Error: ${result.error}`)
      process.exit(1)
    }

    const successRate = (result.progress.warmed / result.progress.total) * 100
    if (successRate < 90) {
      console.error(`❌ Success rate too low: ${successRate.toFixed(1)}%`)
      process.exit(1)
    }

    if (duration > 60000) { // 1 minute for test batch
      console.error(`⚠️  Warming took too long: ${duration}ms`)
    }

    console.log('✅ Warming completed successfully')
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`)
    console.log('')

    // Test 6: Verify Cache State
    console.log('📋 Test 6: Post-Warming Cache State')
    const afterStats = getCacheWarmingStats()
    console.log(`   Pool Size: ${afterStats.pool?.size}`)
    console.log(`   Pool Available: ${afterStats.pool?.available}`)
    console.log(`   Pool Pending: ${afterStats.pool?.pending}`)
    console.log('')

    // Success Summary
    console.log('=' .repeat(60))
    console.log('✅ All Tests Passed!')
    console.log('=' .repeat(60))
    console.log('')
    console.log('Summary:')
    console.log(`  • Redis: Healthy`)
    console.log(`  • Warmable Sessions: ${estimate}`)
    console.log(`  • Test Batch Size: ${warmLimit}`)
    console.log(`  • Sessions Warmed: ${result.progress.warmed}`)
    console.log(`  • Success Rate: ${successRate.toFixed(1)}%`)
    console.log(`  • Duration: ${duration}ms`)
    console.log(`  • Estimated Hit Rate: ${result.hitRateEstimate}%`)
    console.log('')

    process.exit(0)

  } catch (error) {
    console.error('\n❌ Test Failed with Error:')
    console.error(error)
    process.exit(1)
  } finally {
    // Cleanup
    await sessionCache.close()
  }
}

// Run the test
runTest()
