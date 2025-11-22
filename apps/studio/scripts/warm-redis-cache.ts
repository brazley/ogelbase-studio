#!/usr/bin/env tsx
/**
 * Manual Redis Cache Warming Script
 *
 * Pre-loads active sessions into Redis cache for immediate high hit rates.
 * Run this script manually or as part of deployment automation.
 *
 * Usage:
 *   npm run warm-cache              # Warm with defaults (1000 sessions)
 *   npm run warm-cache -- --count 500    # Warm 500 sessions
 *   npm run warm-cache -- --estimate     # Show estimate without warming
 *   npm run warm-cache -- --stats        # Show current cache stats
 *
 * Environment:
 *   Requires REDIS_URL and DATABASE_URL to be set
 */

import { warmCache, getCacheWarmingStats, estimateWarmableSessionCount } from '../lib/api/cache/warming'

// Parse command line arguments
function parseArgs(): {
  count?: number
  estimate: boolean
  stats: boolean
  help: boolean
} {
  const args = process.argv.slice(2)
  const result = {
    count: undefined as number | undefined,
    estimate: false,
    stats: false,
    help: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '--count':
      case '-c':
        const count = parseInt(args[i + 1], 10)
        if (!isNaN(count) && count > 0) {
          result.count = count
          i++ // Skip next arg
        } else {
          console.error('Invalid count value')
          process.exit(1)
        }
        break

      case '--estimate':
      case '-e':
        result.estimate = true
        break

      case '--stats':
      case '-s':
        result.stats = true
        break

      case '--help':
      case '-h':
        result.help = true
        break

      default:
        console.error(`Unknown argument: ${arg}`)
        result.help = true
    }
  }

  return result
}

// Show help
function showHelp() {
  console.log(`
Redis Cache Warming Script

Usage:
  npm run warm-cache [options]

Options:
  -c, --count <n>     Number of sessions to warm (default: 1000)
  -e, --estimate      Show estimate of warmable sessions
  -s, --stats         Show current cache statistics
  -h, --help          Show this help message

Examples:
  npm run warm-cache
  npm run warm-cache -- --count 500
  npm run warm-cache -- --estimate
  npm run warm-cache -- --stats

Environment Variables:
  REDIS_URL          Redis connection string (required)
  DATABASE_URL       PostgreSQL connection string (required)
`)
}

// Main script execution
async function main() {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  console.log('🔥 Redis Cache Warming Tool\n')

  // Check environment
  if (!process.env.REDIS_URL) {
    console.error('❌ REDIS_URL environment variable not set')
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set')
    process.exit(1)
  }

  // Show estimate
  if (args.estimate) {
    console.log('📊 Estimating warmable sessions...\n')
    const estimate = await estimateWarmableSessionCount()
    console.log(`✅ Warmable sessions (last 24h): ${estimate}`)
    console.log(`   Recommended warming count: ${Math.min(estimate, 1000)}`)
    process.exit(0)
  }

  // Show stats
  if (args.stats) {
    console.log('📈 Current Cache Statistics:\n')
    const stats = getCacheWarmingStats()

    console.log('Cache Metrics:')
    console.log(`  Enabled: ${stats.cache.enabled}`)
    console.log(`  Hit Rate: ${stats.cache.hitRate}%`)
    console.log(`  Hits: ${stats.cache.hits}`)
    console.log(`  Misses: ${stats.cache.misses}`)
    console.log(`  Errors: ${stats.cache.errors}`)
    console.log(`  Invalidations: ${stats.cache.invalidations}`)
    console.log(`  TTL: ${stats.cache.ttl}s`)

    if (stats.pool) {
      console.log('\nConnection Pool:')
      console.log(`  Size: ${stats.pool.size}`)
      console.log(`  Available: ${stats.pool.available}`)
      console.log(`  Pending: ${stats.pool.pending}`)
    }

    console.log('\nConfiguration:')
    console.log(`  Default Session Count: ${stats.config.defaultSessionCount}`)
    console.log(`  Batch Size: ${stats.config.batchSize}`)
    console.log(`  Recent Window: ${stats.config.recentWindowHours}h`)

    process.exit(0)
  }

  // Perform warming
  const sessionCount = args.count || 1000
  console.log(`🔄 Warming cache with up to ${sessionCount} sessions...\n`)

  const startTime = Date.now()

  try {
    // Run in blocking mode for script execution
    const result = await warmCache(sessionCount, true)

    const duration = Date.now() - startTime

    console.log('\n' + '='.repeat(60))

    if (result.success) {
      console.log('✅ Cache warming completed successfully!')
      console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`)
      console.log(`   Sessions warmed: ${result.progress.warmed}/${result.progress.total}`)
      console.log(`   Failed: ${result.progress.failed}`)
      console.log(`   Estimated hit rate: ${result.hitRateEstimate}%`)

      if (result.hitRateEstimate >= 90) {
        console.log('\n🎯 Target hit rate achieved (>=90%)!')
      } else if (result.hitRateEstimate >= 75) {
        console.log('\n⚠️  Hit rate below target but acceptable')
      } else {
        console.log('\n❌ Hit rate below target - investigate failures')
      }
    } else {
      console.log('❌ Cache warming failed')
      if (result.error) {
        console.log(`   Error: ${result.error}`)
      }
      console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`)
      console.log(`   Sessions warmed: ${result.progress.warmed}/${result.progress.total}`)
      console.log(`   Failed: ${result.progress.failed}`)
      process.exit(1)
    }

    console.log('='.repeat(60))

    // Show final stats
    console.log('\n📊 Updated Cache Metrics:')
    const finalStats = getCacheWarmingStats()
    console.log(`   Hit Rate: ${finalStats.cache.hitRate}%`)
    console.log(`   Total Operations: ${finalStats.cache.total}`)
    console.log(`   Cache Hits: ${finalStats.cache.hits}`)
    console.log(`   Cache Misses: ${finalStats.cache.misses}`)

  } catch (error) {
    console.error('\n❌ Unexpected error during cache warming:')
    console.error(error)
    process.exit(1)
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
