/**
 * Redis Configuration Script
 *
 * Configures Railway Redis instance for production use:
 * - Sets maxmemory limit (256MB recommended for Railway free tier)
 * - Configures allkeys-lru eviction policy
 * - Verifies AUTH is enabled
 * - Tests configuration
 *
 * Usage:
 *   REDIS_URL=redis://... tsx scripts/configure-redis.ts
 */

import Redis from 'ioredis'

interface ConfigCheck {
  parameter: string
  expected: string | null
  actual: string | null
  status: 'OK' | 'WARNING' | 'ERROR'
  action?: string
}

async function configureRedis() {
  console.log('='.repeat(80))
  console.log('REDIS PRODUCTION CONFIGURATION')
  console.log('='.repeat(80))
  console.log()

  if (!process.env.REDIS_URL) {
    console.error('ERROR: REDIS_URL environment variable not set')
    console.log('Usage: REDIS_URL=redis://... tsx scripts/configure-redis.ts')
    process.exit(1)
  }

  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  })

  try {
    // Test connection
    console.log('Connecting to Redis...')
    await redis.ping()
    console.log('✓ Connected successfully')
    console.log()

    // ========================================
    // Configuration Changes
    // ========================================
    console.log('APPLYING CONFIGURATION CHANGES')
    console.log('-'.repeat(80))
    console.log()

    const changes: Array<{ parameter: string; value: string; description: string }> = []

    // 1. Configure maxmemory
    const maxmemoryMB = 256 // 256MB for Railway free tier
    const maxmemoryBytes = maxmemoryMB * 1024 * 1024

    try {
      await redis.config('SET', 'maxmemory', maxmemoryBytes.toString())
      changes.push({
        parameter: 'maxmemory',
        value: `${maxmemoryMB}MB (${maxmemoryBytes} bytes)`,
        description: 'Prevents OOM crashes by limiting memory usage',
      })
      console.log(`✓ Set maxmemory to ${maxmemoryMB}MB`)
    } catch (error) {
      console.error(`✗ Failed to set maxmemory: ${error}`)
      console.log('  Note: Some Redis providers (like Railway) may not allow CONFIG SET')
      console.log('  You may need to configure this through Railway dashboard')
    }

    // 2. Configure eviction policy
    try {
      await redis.config('SET', 'maxmemory-policy', 'allkeys-lru')
      changes.push({
        parameter: 'maxmemory-policy',
        value: 'allkeys-lru',
        description: 'Evicts least recently used keys when memory limit reached',
      })
      console.log('✓ Set maxmemory-policy to allkeys-lru')
    } catch (error) {
      console.error(`✗ Failed to set maxmemory-policy: ${error}`)
      console.log('  Note: Some Redis providers may not allow CONFIG SET')
    }

    console.log()

    // ========================================
    // Verify Current Configuration
    // ========================================
    console.log('VERIFYING CONFIGURATION')
    console.log('-'.repeat(80))
    console.log()

    const checks: ConfigCheck[] = []

    // Check maxmemory
    const maxmemoryConfig = (await redis.config('GET', 'maxmemory')) as [string, string]
    const currentMaxmemory = maxmemoryConfig[1]
    const maxmemoryOK = currentMaxmemory !== '0'

    checks.push({
      parameter: 'maxmemory',
      expected: `${maxmemoryBytes} bytes or configured limit`,
      actual: currentMaxmemory === '0' ? 'unlimited (0)' : `${currentMaxmemory} bytes (${Math.round(parseInt(currentMaxmemory) / 1024 / 1024)}MB)`,
      status: maxmemoryOK ? 'OK' : 'WARNING',
      action: maxmemoryOK ? undefined : 'Configure maxmemory via Railway dashboard',
    })

    // Check eviction policy
    const policyConfig = (await redis.config('GET', 'maxmemory-policy')) as [string, string]
    const currentPolicy = policyConfig[1]
    const policyOK = currentPolicy === 'allkeys-lru'

    checks.push({
      parameter: 'maxmemory-policy',
      expected: 'allkeys-lru',
      actual: currentPolicy,
      status: policyOK ? 'OK' : 'WARNING',
      action: policyOK ? undefined : 'Configure eviction policy via Railway dashboard',
    })

    // Check AUTH requirement
    const requirepassConfig = (await redis.config('GET', 'requirepass')) as [string, string]
    const requirepass = requirepassConfig[1]
    const authEnabled = requirepass !== ''

    checks.push({
      parameter: 'requirepass (AUTH)',
      expected: 'enabled (password set)',
      actual: authEnabled ? 'enabled' : 'disabled',
      status: authEnabled ? 'OK' : 'ERROR',
      action: authEnabled ? undefined : 'Enable AUTH via Railway dashboard - CRITICAL SECURITY ISSUE',
    })

    // Display results
    for (const check of checks) {
      const statusIcon = check.status === 'OK' ? '✓' : check.status === 'WARNING' ? '⚠' : '✗'
      console.log(`${statusIcon} ${check.parameter}`)
      console.log(`  Expected: ${check.expected}`)
      console.log(`  Actual:   ${check.actual}`)
      if (check.action) {
        console.log(`  Action:   ${check.action}`)
      }
      console.log()
    }

    // ========================================
    // Test Eviction Behavior
    // ========================================
    if (policyOK && maxmemoryOK) {
      console.log('TESTING EVICTION BEHAVIOR')
      console.log('-'.repeat(80))
      console.log()

      try {
        // Create test keys
        const testKeyPrefix = 'eviction:test:'
        const testKeys = []

        console.log('Creating test keys...')
        for (let i = 0; i < 100; i++) {
          const key = `${testKeyPrefix}${i}`
          await redis.set(key, `test-value-${i}`, 'EX', 300) // 5 minute TTL
          testKeys.push(key)

          // Access every 5th key to make it "recently used"
          if (i % 5 === 0) {
            await redis.get(key)
          }
        }

        console.log(`✓ Created ${testKeys.length} test keys`)

        // Check memory info
        const info = await redis.info('memory')
        const usedMemoryMatch = info.match(/used_memory:(\d+)/)
        const maxmemoryMatch = info.match(/maxmemory:(\d+)/)

        if (usedMemoryMatch && maxmemoryMatch) {
          const usedMemory = parseInt(usedMemoryMatch[1])
          const maxmemory = parseInt(maxmemoryMatch[1])
          const usagePercent = maxmemory > 0 ? (usedMemory / maxmemory * 100).toFixed(1) : 'N/A'

          console.log(`Memory Usage: ${Math.round(usedMemory / 1024 / 1024)}MB / ${Math.round(maxmemory / 1024 / 1024)}MB (${usagePercent}%)`)
        }

        // Cleanup test keys
        console.log('Cleaning up test keys...')
        await redis.del(...testKeys)
        console.log('✓ Test keys cleaned up')
        console.log()

      } catch (error) {
        console.error(`✗ Eviction test failed: ${error}`)
        console.log()
      }
    }

    // ========================================
    // Summary
    // ========================================
    console.log('='.repeat(80))
    console.log('CONFIGURATION SUMMARY')
    console.log('='.repeat(80))
    console.log()

    const hasErrors = checks.some((c) => c.status === 'ERROR')
    const hasWarnings = checks.some((c) => c.status === 'WARNING')

    if (!hasErrors && !hasWarnings) {
      console.log('✓ ALL CHECKS PASSED - Redis is configured for production')
    } else if (hasErrors) {
      console.log('✗ CRITICAL ISSUES FOUND - Redis is NOT ready for production')
      console.log()
      console.log('Required Actions:')
      checks
        .filter((c) => c.status === 'ERROR' && c.action)
        .forEach((c) => console.log(`  - ${c.action}`))
    } else if (hasWarnings) {
      console.log('⚠ WARNINGS FOUND - Redis may need additional configuration')
      console.log()
      console.log('Recommended Actions:')
      checks
        .filter((c) => c.status === 'WARNING' && c.action)
        .forEach((c) => console.log(`  - ${c.action}`))
    }

    console.log()

    // ========================================
    // Manual Configuration Instructions
    // ========================================
    if (hasErrors || hasWarnings) {
      console.log('='.repeat(80))
      console.log('MANUAL CONFIGURATION INSTRUCTIONS (Railway)')
      console.log('='.repeat(80))
      console.log()
      console.log('If CONFIG SET commands failed, configure via Railway dashboard:')
      console.log()
      console.log('1. Go to your Railway project')
      console.log('2. Select the Redis service')
      console.log('3. Go to Variables tab')
      console.log('4. Add these configuration variables:')
      console.log()
      console.log('   REDIS_ARGS=--maxmemory 256mb --maxmemory-policy allkeys-lru')
      console.log()
      console.log('5. Redeploy the Redis service')
      console.log('6. Run this script again to verify')
      console.log()
      console.log('Alternatively, Railway may support redis.conf file:')
      console.log('1. Create redis.conf in your project')
      console.log('2. Add these lines:')
      console.log('   maxmemory 256mb')
      console.log('   maxmemory-policy allkeys-lru')
      console.log('3. Configure Railway to use this config file')
      console.log()
    }

    console.log('='.repeat(80))
    console.log('CONFIGURATION COMPLETE')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\nConfiguration failed:', error)
    process.exit(1)
  } finally {
    await redis.quit()
  }
}

// Run configuration
if (require.main === module) {
  configureRedis()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

export { configureRedis }
