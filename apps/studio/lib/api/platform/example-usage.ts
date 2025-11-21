/**
 * Example Usage of Advanced Connection Management Layer
 * Demonstrates how to use Redis and MongoDB clients with circuit breakers
 */

import { connectionManager, DatabaseType, Tier } from './connection-manager'
import { createRedisClient } from './redis'
import { createMongoDBClient } from './mongodb'

/**
 * Example 1: Using Redis Client
 */
export async function exampleRedisUsage() {
  const projectId = 'my-project-123'
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

  // Create Redis client
  const redis = createRedisClient(
    projectId,
    {
      connectionString: redisUrl,
      tier: Tier.PRO,
      config: {
        minPoolSize: 2,
        maxPoolSize: 10,
      },
    },
    connectionManager
  )

  try {
    // Health check
    console.log('Redis health check:', await redis.healthCheck())

    // Basic operations
    await redis.set('user:1:name', 'John Doe', 3600)
    const name = await redis.get('user:1:name')
    console.log('Retrieved name:', name)

    // Hash operations
    await redis.hset('user:1:profile', 'email', 'john@example.com')
    await redis.hset('user:1:profile', 'age', '30')
    const profile = await redis.hgetall('user:1:profile')
    console.log('User profile:', profile)

    // List operations
    await redis.lpush('notifications', 'Welcome!', 'New message')
    const notifications = await redis.lrange('notifications', 0, -1)
    console.log('Notifications:', notifications)

    // Pool stats
    console.log('Redis pool stats:', redis.getPoolStats())
  } catch (error) {
    console.error('Redis error:', error)
  } finally {
    await redis.close()
  }
}

/**
 * Example 2: Using MongoDB Client
 */
export async function exampleMongoDBUsage() {
  const projectId = 'my-project-123'
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/testdb'

  // Create MongoDB client
  const mongo = createMongoDBClient(
    projectId,
    {
      connectionString: mongoUrl,
      tier: Tier.PRO,
      config: {
        minPoolSize: 2,
        maxPoolSize: 10,
      },
    },
    connectionManager
  )

  try {
    // Health check
    console.log('MongoDB health check:', await mongo.healthCheck())
    console.log('Database name:', mongo.getDatabaseName())

    // Insert document
    const insertResult = await mongo.insertOne('users', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      age: 28,
      createdAt: new Date(),
    })
    console.log('Inserted document ID:', insertResult.insertedId)

    // Find documents
    const users = await mongo.find('users', { age: { $gte: 18 } })
    console.log('Found users:', users.length)

    // Update document
    const updateResult = await mongo.updateOne('users', { name: 'Jane Doe' }, { $set: { age: 29 } })
    console.log('Modified count:', updateResult.modifiedCount)

    // Aggregate
    const stats = await mongo.aggregate('users', [
      { $group: { _id: null, avgAge: { $avg: '$age' }, count: { $sum: 1 } } },
    ])
    console.log('User statistics:', stats)

    // Pool stats
    console.log('MongoDB pool stats:', mongo.getPoolStats())
  } catch (error) {
    console.error('MongoDB error:', error)
  } finally {
    await mongo.close()
  }
}

/**
 * Example 3: Connection Manager Metrics
 */
export async function exampleMetrics() {
  // Get all connection metadata
  const allConnections = connectionManager.getAllConnectionMetadata()
  console.log('Active connections:', allConnections.length)

  allConnections.forEach((conn) => {
    console.log(`Project: ${conn.projectId}`)
    console.log(`Type: ${conn.databaseType}`)
    console.log(`Tier: ${conn.tier}`)
    console.log(`Queries: ${conn.queryCount}`)
    console.log(`Errors: ${conn.errorCount}`)
    console.log(`Last used: ${conn.lastUsedAt}`)
    console.log('---')
  })

  // Get Prometheus metrics
  const metrics = connectionManager.getMetrics()
  console.log('Prometheus metrics:', metrics)

  // Get pool statistics
  const poolStats = connectionManager.getAllPoolStats()
  console.log('Pool statistics:', poolStats.size)
}

/**
 * Example 4: Circuit Breaker in Action
 */
export async function exampleCircuitBreaker() {
  const projectId = 'circuit-breaker-demo'
  const redisUrl = 'redis://localhost:9999' // Invalid URL to trigger failures

  const redis = createRedisClient(
    projectId,
    {
      connectionString: redisUrl,
      tier: Tier.FREE,
    },
    connectionManager
  )

  // This will fail and eventually open the circuit breaker
  for (let i = 0; i < 15; i++) {
    try {
      await redis.get('test-key')
      console.log(`Attempt ${i + 1}: Success`)
    } catch (error) {
      console.log(
        `Attempt ${i + 1}: Failed - ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  // Check health
  const isHealthy = await connectionManager.checkHealth(projectId, DatabaseType.REDIS)
  console.log('Connection health:', isHealthy ? 'Healthy' : 'Unhealthy (circuit open)')

  await redis.close()
}

/**
 * Example 5: Connection Cleanup
 */
export async function exampleCleanup() {
  // Close idle connections (those not used in last 5 minutes)
  const closedCount = await connectionManager.closeIdleConnections()
  console.log('Closed idle connections:', closedCount)

  // Close specific connection
  await connectionManager.closeConnection('my-project-123', DatabaseType.REDIS)

  // Close all connections
  await connectionManager.closeAll()
}

/**
 * Example 6: Multi-Database Workflow
 */
export async function exampleMultiDatabaseWorkflow() {
  const projectId = 'multi-db-project'
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/testdb'

  const redis = createRedisClient(projectId, { connectionString: redisUrl, tier: Tier.PRO })
  const mongo = createMongoDBClient(projectId, { connectionString: mongoUrl, tier: Tier.PRO })

  try {
    // 1. Check cache (Redis)
    const cachedUser = await redis.get('user:123')

    if (cachedUser) {
      console.log('User found in cache')
      return JSON.parse(cachedUser)
    }

    // 2. Cache miss - fetch from database (MongoDB)
    console.log('Cache miss - fetching from MongoDB')
    const user = await mongo.findOne('users', { userId: '123' } as any)

    if (user) {
      // 3. Store in cache for 1 hour
      await redis.set('user:123', JSON.stringify(user), 3600)
      console.log('User cached for 1 hour')
    }

    return user
  } finally {
    await redis.close()
    await mongo.close()
  }
}

// Main execution (for testing)
if (require.main === module) {
  ;(async () => {
    console.log('=== Redis Example ===')
    await exampleRedisUsage()

    console.log('\n=== MongoDB Example ===')
    await exampleMongoDBUsage()

    console.log('\n=== Metrics Example ===')
    await exampleMetrics()

    console.log('\n=== Circuit Breaker Example ===')
    await exampleCircuitBreaker()

    console.log('\n=== Cleanup Example ===')
    await exampleCleanup()
  })()
}
