#!/usr/bin/env tsx
/**
 * Server Initialization Script
 *
 * Runs background initialization tasks after server startup:
 * - Cache warming for Redis
 * - Health checks
 *
 * This script is designed to be non-blocking and runs in the background
 * after the Next.js server has started.
 *
 * Usage:
 *   tsx scripts/init-server.ts
 */

import { warmCacheBackground, getCacheWarmingStats } from '../lib/api/cache/warming'

async function initializeServer() {
  console.log('🚀 Server initialization starting...\n')

  // Check if Redis is configured
  if (!process.env.REDIS_URL) {
    console.log('⚠️  Redis not configured - skipping cache warming')
    return
  }

  try {
    // Start background cache warming (non-blocking)
    console.log('🔥 Starting background cache warming...')
    warmCacheBackground(1000)
      .then((result) => {
        if (result.success) {
          console.log(`✅ Cache warming completed: ${result.progress.warmed}/${result.progress.total} sessions`)
          
          // Show final stats
          const stats = getCacheWarmingStats()
          console.log(`📊 Cache hit rate: ${stats.cache.hitRate}%`)
        } else {
          console.log(`⚠️  Cache warming completed with errors: ${result.progress.failed} failures`)
        }
      })
      .catch((error) => {
        console.error('❌ Background cache warming failed:', error)
      })

    console.log('✅ Server initialization tasks started in background\n')
  } catch (error) {
    console.error('❌ Server initialization failed:', error)
  }
}

// Run initialization
initializeServer().catch(error => {
  console.error('Fatal initialization error:', error)
  process.exit(1)
})
