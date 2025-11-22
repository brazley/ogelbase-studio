/**
 * Redis Configuration and Connection Test
 *
 * This script tests Redis connectivity and verifies configuration.
 * Run this BEFORE the full test suite to validate setup.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import Redis from 'ioredis'

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') })

console.log('='.repeat(80))
console.log('REDIS CONFIGURATION TEST')
console.log('='.repeat(80))

// Check environment configuration
console.log('\n📋 Environment Configuration:')
console.log('─'.repeat(80))

const redisUrl = process.env.REDIS_URL
const hasRedisUrl = !!redisUrl

console.log(`REDIS_URL configured: ${hasRedisUrl ? '✓ YES' : '✗ NO'}`)

if (redisUrl) {
  // Parse and display (with password masked)
  try {
    const url = new URL(redisUrl)
    console.log(`  Host: ${url.hostname}`)
    console.log(`  Port: ${url.port || 6379}`)
    console.log(`  User: ${url.username || '(default)'}`)
    console.log(`  Password: ${url.password ? '***' + url.password.slice(-4) : '(none)'}`)
    console.log(`  Database: ${url.pathname.slice(1) || '0'}`)
  } catch (error) {
    console.log(`  ⚠️  Invalid URL format: ${error}`)
  }
} else {
  console.log('  ⚠️  REDIS_URL not found in environment')
  console.log('  💡 Add to .env.local:')
  console.log('     REDIS_URL=redis://default:PASSWORD@redis.railway.internal:6379')
}

// Attempt connection test
;(async () => {
if (hasRedisUrl) {
  console.log('\n🔌 Connection Test:')
  console.log('─'.repeat(80))

  let client: Redis | null = null

  try {
    // Create Redis client with explicit configuration
    client = new Redis(redisUrl!, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy(times) {
        if (times > 3) {
          return null // Stop retrying
        }
        return Math.min(times * 200, 2000) // Exponential backoff
      }
    })

    console.log('Creating Redis client...')

    // Try to connect
    await client.connect()
    console.log('✓ Connected to Redis server')

    // Test PING
    const startPing = Date.now()
    const pong = await client.ping()
    const pingTime = Date.now() - startPing

    if (pong === 'PONG') {
      console.log(`✓ PING successful (${pingTime}ms)`)
    } else {
      console.log(`✗ PING failed: expected PONG, got ${pong}`)
    }

    // Get server info
    const info = await client.info('server')
    const versionMatch = info.match(/redis_version:([^\r\n]+)/)
    if (versionMatch) {
      console.log(`✓ Redis version: ${versionMatch[1]}`)
    }

    // Test basic operations
    console.log('\n🧪 Basic Operations Test:')
    console.log('─'.repeat(80))

    const testKey = 'test:connection:' + Date.now()
    const testValue = 'connection-test-value'

    // SET
    const startSet = Date.now()
    await client.set(testKey, testValue, 'EX', 60)
    const setTime = Date.now() - startSet
    console.log(`✓ SET operation (${setTime}ms)`)

    // GET
    const startGet = Date.now()
    const retrieved = await client.get(testKey)
    const getTime = Date.now() - startGet

    if (retrieved === testValue) {
      console.log(`✓ GET operation (${getTime}ms)`)
    } else {
      console.log(`✗ GET failed: expected "${testValue}", got "${retrieved}"`)
    }

    // TTL
    const ttl = await client.ttl(testKey)
    if (ttl > 0 && ttl <= 60) {
      console.log(`✓ TTL verified (${ttl}s remaining)`)
    } else {
      console.log(`✗ TTL unexpected: ${ttl}`)
    }

    // Cleanup
    await client.del(testKey)
    console.log(`✓ Cleanup successful`)

    // Memory stats
    console.log('\n📊 Server Stats:')
    console.log('─'.repeat(80))

    const memInfo = await client.info('memory')
    const usedMemMatch = memInfo.match(/used_memory_human:([^\r\n]+)/)
    if (usedMemMatch) {
      console.log(`Memory used: ${usedMemMatch[1]}`)
    }

    const dbSize = await client.dbsize()
    console.log(`Total keys: ${dbSize}`)

    console.log('\n' + '='.repeat(80))
    console.log('✓ ALL TESTS PASSED')
    console.log('='.repeat(80))
    console.log('\nNext steps:')
    console.log('  1. Run full test suite: pnpm test:redis')
    console.log('  2. Check health endpoint: curl http://localhost:3000/api/health/redis')
    console.log('  3. Test session validation with real auth token')
    console.log('='.repeat(80))

  } catch (error: any) {
    console.log('\n' + '='.repeat(80))
    console.log('✗ CONNECTION FAILED')
    console.log('='.repeat(80))
    console.log('\nError details:')
    console.log(`  Type: ${error.name}`)
    console.log(`  Message: ${error.message}`)

    if (error.code === 'ENOTFOUND') {
      console.log('\n💡 Diagnosis: DNS resolution failed')
      console.log('   - Check if redis.railway.internal is resolvable')
      console.log('   - Verify you\'re running on Railway network')
      console.log('   - For local testing, use localhost or public endpoint')
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Diagnosis: Connection refused')
      console.log('   - Redis server may not be running')
      console.log('   - Check if port 6379 is accessible')
      console.log('   - Verify firewall rules')
    } else if (error.message?.includes('AUTH')) {
      console.log('\n💡 Diagnosis: Authentication failed')
      console.log('   - Check Redis password in REDIS_URL')
      console.log('   - Password should match Railway Redis configuration')
    } else if (error.message?.includes('timeout')) {
      console.log('\n💡 Diagnosis: Connection timeout')
      console.log('   - Redis server may be slow or unreachable')
      console.log('   - Check network connectivity')
    }

    console.log('\n='.repeat(80))
    process.exit(1)
  } finally {
    if (client) {
      await client.quit()
      console.log('\nRedis connection closed')
    }
  }
} else {
  console.log('\n⚠️  Cannot test connection without REDIS_URL')
  console.log('\n='.repeat(80))
  process.exit(1)
}
})()
