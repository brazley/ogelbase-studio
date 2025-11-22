import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis'
import * as genericPool from 'generic-pool'
import type { Pool } from 'generic-pool'
import {
  DatabaseConnectionManager,
  DatabaseType,
  Tier,
  ConnectionOptions,
} from './connection-manager'
import { logger, logRedisOperation, logPoolEvent } from '../observability/logger'
import { getHotkeyDetector } from '../cache/hotkey-detection'

/**
 * Sentinel Configuration Interface
 */
interface SentinelNode {
  host: string
  port: number
}

interface SentinelConfig {
  sentinels: SentinelNode[]
  name: string
  password?: string
  sentinelPassword?: string
  db?: number
}

/**
 * Parse Sentinel configuration from environment
 */
function parseSentinelConfig(): SentinelConfig | null {
  const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS
  const masterName = process.env.REDIS_MASTER_NAME || 'mymaster'
  const password = process.env.REDIS_PASSWORD
  const sentinelPassword = process.env.REDIS_SENTINEL_PASSWORD

  if (!sentinelHosts) {
    return null // Fall back to single-instance mode
  }

  // Parse "host1:port1,host2:port2,host3:port3"
  const sentinels: SentinelNode[] = sentinelHosts.split(',').map((hostPort) => {
    const [host, port] = hostPort.trim().split(':')
    return {
      host,
      port: parseInt(port) || 26379,
    }
  })

  if (sentinels.length < 3) {
    logger.warn({
      message: 'Sentinel configuration has <3 nodes, high availability compromised',
      sentinel_count: sentinels.length,
    })
  }

  return {
    sentinels,
    name: masterName,
    password,
    sentinelPassword,
    db: 0,
  }
}

/**
 * Redis Sentinel Connection Pool (Read or Write)
 */
export class RedisSentinelConnectionPool {
  private pool: Pool<RedisClient>
  private sentinelConfig: SentinelConfig
  private role: 'master' | 'slave'
  private options: RedisOptions

  constructor(
    sentinelConfig: SentinelConfig,
    role: 'master' | 'slave',
    poolConfig: { min?: number; max?: number } = {}
  ) {
    this.sentinelConfig = sentinelConfig
    this.role = role
    this.options = this.buildRedisOptions()

    // Create connection pool
    this.pool = genericPool.createPool(
      {
        create: async () => {
          const startTime = Date.now()
          try {
            const client = new Redis(this.options)

            // Wait for ready (Sentinel discovery + connection)
            await new Promise<void>((resolve, reject) => {
              client.once('ready', () => resolve())
              client.once('error', (err) => reject(err))
              setTimeout(() => reject(new Error('Connection timeout')), 10000)
            })

            const duration = Date.now() - startTime
            logPoolEvent({
              event: 'create',
              duration_ms: duration,
              pool_size: this.pool.size,
              pool_available: this.pool.available,
              message: `Redis Sentinel connection created (role: ${this.role})`,
            })

            return client
          } catch (error) {
            const duration = Date.now() - startTime
            logRedisOperation({
              operation: 'sentinel_pool_create',
              message: `Failed to create Sentinel connection (role: ${this.role})`,
              level: 'error',
              duration_ms: duration,
              error: error as Error,
            })
            throw error
          }
        },
        destroy: async (client: RedisClient) => {
          try {
            await client.quit()
            logPoolEvent({
              event: 'destroy',
              pool_size: this.pool.size,
              pool_available: this.pool.available,
              message: `Redis Sentinel connection destroyed (role: ${this.role})`,
            })
          } catch (error) {
            logRedisOperation({
              operation: 'sentinel_pool_destroy',
              message: 'Error destroying Sentinel connection',
              level: 'warn',
              error: error as Error,
            })
          }
        },
        validate: async (client: RedisClient) => {
          try {
            await client.ping()
            return true
          } catch (error) {
            logRedisOperation({
              operation: 'sentinel_pool_validate',
              message: 'Sentinel connection validation failed',
              level: 'debug',
              error: error as Error,
            })
            return false
          }
        },
      },
      {
        min: poolConfig.min || 2,
        max: poolConfig.max || (role === 'slave' ? 20 : 10), // More read connections
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 10000,
        testOnBorrow: true,
      }
    )

    logPoolEvent({
      event: 'create',
      pool_size: this.pool.size,
      message: `Sentinel ${this.role} pool initialized (min=${poolConfig.min || 2}, max=${poolConfig.max || 10})`,
    })
  }

  /**
   * Build ioredis options for Sentinel
   */
  private buildRedisOptions(): RedisOptions {
    const baseOptions: RedisOptions = {
      sentinels: this.sentinelConfig.sentinels,
      name: this.sentinelConfig.name,
      role: this.role,
      password: this.sentinelConfig.password,
      sentinelPassword: this.sentinelConfig.sentinelPassword,
      db: this.sentinelConfig.db || 0,

      // Connection behavior
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      enableOfflineQueue: true,

      // Sentinel-specific
      sentinelRetryStrategy: (times: number) => {
        if (times > 10) {
          logger.error({
            message: 'Sentinel connection failed after 10 retries',
            role: this.role,
          })
          return null // stop retrying
        }
        return Math.min(times * 100, 3000) // exponential backoff, max 3s
      },

      // Retry strategy for Redis connection
      retryStrategy: (times: number) => {
        if (times > 5) {
          logger.error({
            message: 'Redis connection failed after 5 retries',
            role: this.role,
          })
          return null
        }
        return Math.min(times * 200, 2000)
      },

      // Auto-discover Sentinel topology changes
      updateSentinels: true,
      sentinelMaxConnections: 10,

      // DNS resolution (Railway private network)
      natMap: {},
    }

    // Read client: prefer replicas, fallback to primary
    if (this.role === 'slave') {
      baseOptions.preferredSlaves = [
        { ip: '.*', port: '.*', prio: 1 }, // any replica
      ]
    }

    logRedisOperation({
      operation: 'sentinel_config',
      message: `Sentinel client configured (role: ${this.role})`,
      level: 'info',
      sentinel_nodes: this.sentinelConfig.sentinels.length,
      master_name: this.sentinelConfig.name,
      role: this.role,
    })

    return baseOptions
  }

  async acquire(): Promise<RedisClient> {
    const startTime = Date.now()
    try {
      const client = await this.pool.acquire()
      const duration = Date.now() - startTime

      logPoolEvent({
        event: 'acquire',
        duration_ms: duration,
        pool_size: this.pool.size,
        pool_available: this.pool.available,
        pool_pending: this.pool.pending,
        role: this.role,
      })

      return client
    } catch (error) {
      const duration = Date.now() - startTime
      logRedisOperation({
        operation: 'sentinel_pool_acquire',
        message: `Failed to acquire Sentinel connection (role: ${this.role})`,
        level: 'error',
        duration_ms: duration,
        pool_pending: this.pool.pending,
        error: error as Error,
      })
      throw error
    }
  }

  release(connection: RedisClient): void {
    this.pool.release(connection)
    logPoolEvent({
      event: 'release',
      pool_size: this.pool.size,
      pool_available: this.pool.available,
      pool_pending: this.pool.pending,
      role: this.role,
    })
  }

  async destroy(connection: RedisClient): Promise<void> {
    await this.pool.destroy(connection)
    logPoolEvent({
      event: 'destroy',
      pool_size: this.pool.size,
      pool_available: this.pool.available,
      message: `Sentinel connection destroyed from pool (role: ${this.role})`,
    })
  }

  async drain(): Promise<void> {
    logPoolEvent({
      event: 'drain',
      pool_size: this.pool.size,
      message: `Draining Sentinel connection pool (role: ${this.role})`,
    })
    await this.pool.drain()
    await this.pool.clear()
    logPoolEvent({
      event: 'drain',
      pool_size: 0,
      pool_available: 0,
      message: `Sentinel connection pool drained (role: ${this.role})`,
    })
  }

  get size(): number {
    return this.pool.size
  }

  get available(): number {
    return this.pool.available
  }

  get pending(): number {
    return this.pool.pending
  }
}

/**
 * Redis Sentinel Client Wrapper with Intelligent Read/Write Routing
 */
export class RedisSentinelClientWrapper {
  private connectionManager: DatabaseConnectionManager
  private projectId: string
  private tier: Tier
  private writePool: RedisSentinelConnectionPool
  private readPool: RedisSentinelConnectionPool
  private sentinelConfig: SentinelConfig
  private failoverStartTime: number = 0

  constructor(
    projectId: string,
    options: ConnectionOptions,
    connectionManager?: DatabaseConnectionManager
  ) {
    this.projectId = projectId
    this.tier = options.tier || Tier.FREE
    this.connectionManager =
      connectionManager ||
      (require('./connection-manager').connectionManager as DatabaseConnectionManager)

    // Parse Sentinel configuration
    this.sentinelConfig = parseSentinelConfig()!

    if (!this.sentinelConfig) {
      throw new Error('REDIS_SENTINEL_HOSTS not configured - use RedisSentinelClientWrapper only in Sentinel mode')
    }

    // Create separate pools for read and write
    this.writePool = new RedisSentinelConnectionPool(this.sentinelConfig, 'master', {
      min: options.config?.minPoolSize || 2,
      max: options.config?.maxPoolSize || 10,
    })

    this.readPool = new RedisSentinelConnectionPool(this.sentinelConfig, 'slave', {
      min: options.config?.minPoolSize || 5,
      max: options.config?.maxPoolSize || 20, // Higher for read throughput
    })

    // Set up failover event monitoring
    this.setupFailoverMonitoring()

    logRedisOperation({
      operation: 'sentinel_client_init',
      message: 'Redis Sentinel client initialized with dual pools',
      level: 'info',
      project_id: projectId,
      tier: this.tier,
      write_pool_max: this.writePool.size,
      read_pool_max: this.readPool.size,
    })
  }

  /**
   * Monitor Sentinel failover events
   */
  private setupFailoverMonitoring(): void {
    // Create a monitoring connection to Sentinels
    const monitorClient = new Redis({
      sentinels: this.sentinelConfig.sentinels,
      name: this.sentinelConfig.name,
      sentinelPassword: this.sentinelConfig.sentinelPassword,
    })

    monitorClient.on('+switch-master', (masterName, oldHost, oldPort, newHost, newPort) => {
      const duration = this.failoverStartTime ? Date.now() - this.failoverStartTime : 0

      logger.warn({
        message: 'FAILOVER COMPLETED - Primary switched',
        master_name: masterName,
        old_primary: `${oldHost}:${oldPort}`,
        new_primary: `${newHost}:${newPort}`,
        duration_ms: duration,
        project_id: this.projectId,
      })

      // Reset failover timer
      this.failoverStartTime = 0
    })

    monitorClient.on('-odown', (masterName) => {
      logger.warn({
        message: 'FAILOVER STARTING - Primary marked objectively down',
        master_name: masterName,
        project_id: this.projectId,
      })
      this.failoverStartTime = Date.now()
    })

    monitorClient.on('+sdown', (masterName) => {
      logger.warn({
        message: 'Primary marked subjectively down',
        master_name: masterName,
        project_id: this.projectId,
      })
    })

    monitorClient.on('+odown', (masterName) => {
      logger.error({
        message: 'Primary marked objectively down - quorum reached',
        master_name: masterName,
        project_id: this.projectId,
      })
    })

    monitorClient.on('reconnecting', () => {
      logger.warn({
        message: 'Sentinel monitor client reconnecting',
        project_id: this.projectId,
      })
    })
  }

  /**
   * Execute READ operation (routes to replicas)
   */
  private async executeRead<T>(
    operation: string,
    action: (client: RedisClient) => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now()

    return this.connectionManager.executeWithCircuitBreaker(
      this.projectId,
      DatabaseType.REDIS,
      this.tier,
      operation,
      async () => {
        const client = await this.readPool.acquire()
        try {
          const result = await action(client)

          const duration = Date.now() - startTime
          logRedisOperation({
            operation,
            message: `Redis READ ${operation} completed`,
            level: 'debug',
            duration_ms: duration,
            project_id: this.projectId,
            tier: this.tier,
            pool: 'read',
            ...context,
          })

          return result
        } catch (error) {
          // Fallback to primary if replica fails
          logger.warn({
            message: `Read fallback to primary for ${operation}`,
            project_id: this.projectId,
            error: error instanceof Error ? error.message : 'unknown',
          })

          // Retry on write pool (primary)
          const writeClient = await this.writePool.acquire()
          try {
            return await action(writeClient)
          } finally {
            this.writePool.release(writeClient)
          }
        } finally {
          this.readPool.release(client)
        }
      }
    )
  }

  /**
   * Execute WRITE operation (routes to primary)
   */
  private async executeWrite<T>(
    operation: string,
    action: (client: RedisClient) => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now()

    return this.connectionManager.executeWithCircuitBreaker(
      this.projectId,
      DatabaseType.REDIS,
      this.tier,
      operation,
      async () => {
        const client = await this.writePool.acquire()
        try {
          const result = await action(client)

          const duration = Date.now() - startTime
          logRedisOperation({
            operation,
            message: `Redis WRITE ${operation} completed`,
            level: 'debug',
            duration_ms: duration,
            project_id: this.projectId,
            tier: this.tier,
            pool: 'write',
            ...context,
          })

          return result
        } finally {
          this.writePool.release(client)
        }
      }
    )
  }

  /**
   * READ operations (route to replicas)
   */

  async ping(): Promise<string> {
    return this.executeRead('ping', async (client) => client.ping())
  }

  async get(key: string): Promise<string | null> {
    const detector = getHotkeyDetector()
    detector.track(key)
    return this.executeRead('get', async (client) => client.get(key), { key })
  }

  async exists(...keys: string[]): Promise<number> {
    return this.executeRead('exists', async (client) => client.exists(...keys), { keys_count: keys.length })
  }

  async ttl(key: string): Promise<number> {
    return this.executeRead('ttl', async (client) => client.ttl(key), { key })
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.executeRead('mget', async (client) => client.mget(...keys), { keys_count: keys.length })
  }

  async hget(key: string, field: string): Promise<string | null> {
    const detector = getHotkeyDetector()
    detector.track(key)
    return this.executeRead('hget', async (client) => client.hget(key, field), { key, field })
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const detector = getHotkeyDetector()
    detector.track(key)
    return this.executeRead('hgetall', async (client) => client.hgetall(key), { key })
  }

  async hexists(key: string, field: string): Promise<number> {
    return this.executeRead('hexists', async (client) => client.hexists(key, field), { key, field })
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeRead('lrange', async (client) => client.lrange(key, start, stop), { key, start, stop })
  }

  async llen(key: string): Promise<number> {
    return this.executeRead('llen', async (client) => client.llen(key), { key })
  }

  async smembers(key: string): Promise<string[]> {
    return this.executeRead('smembers', async (client) => client.smembers(key), { key })
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.executeRead('sismember', async (client) => client.sismember(key, member), { key, member })
  }

  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    return this.executeRead(
      'zrange',
      async (client) => {
        if (withScores) {
          return client.zrange(key, start, stop, 'WITHSCORES')
        }
        return client.zrange(key, start, stop)
      },
      { key, start, stop, with_scores: withScores }
    )
  }

  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    withScores?: boolean
  ): Promise<string[]> {
    return this.executeRead(
      'zrangebyscore',
      async (client) => {
        if (withScores) {
          return client.zrangebyscore(key, min as any, max as any, 'WITHSCORES')
        }
        return client.zrangebyscore(key, min as any, max as any)
      },
      { key, min, max, with_scores: withScores }
    )
  }

  /**
   * WRITE operations (route to primary)
   */

  async set(key: string, value: string, expirationSeconds?: number): Promise<'OK'> {
    const detector = getHotkeyDetector()
    detector.track(key)

    return this.executeWrite(
      'set',
      async (client) => {
        if (expirationSeconds) {
          return client.set(key, value, 'EX', expirationSeconds)
        }
        return client.set(key, value)
      },
      { key, ttl_seconds: expirationSeconds }
    )
  }

  async del(...keys: string[]): Promise<number> {
    return this.executeWrite('del', async (client) => client.del(...keys), { keys_count: keys.length })
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.executeWrite('expire', async (client) => client.expire(key, seconds), {
      key,
      ttl_seconds: seconds,
    })
  }

  async incr(key: string): Promise<number> {
    const detector = getHotkeyDetector()
    detector.track(key)
    return this.executeWrite('incr', async (client) => client.incr(key), { key })
  }

  async incrby(key: string, increment: number): Promise<number> {
    return this.executeWrite('incrby', async (client) => client.incrby(key, increment), { key, increment })
  }

  async decr(key: string): Promise<number> {
    return this.executeWrite('decr', async (client) => client.decr(key), { key })
  }

  async decrby(key: string, decrement: number): Promise<number> {
    return this.executeWrite('decrby', async (client) => client.decrby(key, decrement), { key, decrement })
  }

  async mset(data: Record<string, string>): Promise<'OK'> {
    return this.executeWrite('mset', async (client) => client.mset(data), {
      pairs_count: Object.keys(data).length,
    })
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const detector = getHotkeyDetector()
    detector.track(key)
    return this.executeWrite('hset', async (client) => client.hset(key, field, value), { key, field })
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.executeWrite('hdel', async (client) => client.hdel(key, ...fields), {
      key,
      fields_count: fields.length,
    })
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.executeWrite('lpush', async (client) => client.lpush(key, ...values), {
      key,
      values_count: values.length,
    })
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.executeWrite('rpush', async (client) => client.rpush(key, ...values), {
      key,
      values_count: values.length,
    })
  }

  async lpop(key: string): Promise<string | null> {
    return this.executeWrite('lpop', async (client) => client.lpop(key), { key })
  }

  async rpop(key: string): Promise<string | null> {
    return this.executeWrite('rpop', async (client) => client.rpop(key), { key })
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.executeWrite('sadd', async (client) => client.sadd(key, ...members), {
      key,
      members_count: members.length,
    })
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.executeWrite('srem', async (client) => client.srem(key, ...members), {
      key,
      members_count: members.length,
    })
  }

  async zadd(key: string, ...args: Array<number | string>): Promise<number> {
    return this.executeWrite('zadd', async (client) => client.zadd(key, ...(args as any)), { key })
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.executeWrite('publish', async (client) => client.publish(channel, message), { channel })
  }

  /**
   * Scan operations (use read pool)
   */
  async scan(cursor: string, pattern?: string, count?: number): Promise<[string, string[]]> {
    return this.executeRead(
      'scan',
      async (client) => {
        const args: any[] = [cursor]
        if (pattern) {
          args.push('MATCH', pattern)
        }
        if (count) {
          args.push('COUNT', count)
        }
        return client.scan(...(args as [string, ...any[]]))
      },
      { pattern, count }
    )
  }

  async keys(pattern: string): Promise<string[]> {
    return this.executeRead('keys', async (client) => client.keys(pattern), { pattern })
  }

  /**
   * Admin operations (use write pool with caution)
   */
  async flushall(): Promise<'OK'> {
    logRedisOperation({
      operation: 'flushall',
      message: 'WARNING: Flushing all Redis data',
      level: 'warn',
      project_id: this.projectId,
    })
    return this.executeWrite('flushall', async (client) => client.flushall())
  }

  async flushdb(): Promise<'OK'> {
    logRedisOperation({
      operation: 'flushdb',
      message: 'WARNING: Flushing current Redis database',
      level: 'warn',
      project_id: this.projectId,
    })
    return this.executeWrite('flushdb', async (client) => client.flushdb())
  }

  async info(section?: string): Promise<string> {
    return this.executeRead(
      'info',
      async (client) => {
        if (section) {
          return client.info(section)
        }
        return client.info()
      },
      { section }
    )
  }

  async dbsize(): Promise<number> {
    return this.executeRead('dbsize', async (client) => client.dbsize())
  }

  /**
   * Close all connection pools
   */
  async close(): Promise<void> {
    logRedisOperation({
      operation: 'sentinel_client_close',
      message: 'Closing Redis Sentinel client and draining all pools',
      level: 'info',
      project_id: this.projectId,
    })
    await Promise.all([this.writePool.drain(), this.readPool.drain()])
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    write: { size: number; available: number; pending: number }
    read: { size: number; available: number; pending: number }
  } {
    return {
      write: {
        size: this.writePool.size,
        available: this.writePool.available,
        pending: this.writePool.pending,
      },
      read: {
        size: this.readPool.size,
        available: this.readPool.available,
        pending: this.readPool.pending,
      },
    }
  }

  /**
   * Health check (tests both read and write)
   */
  async healthCheck(): Promise<{
    healthy: boolean
    write: boolean
    read: boolean
    replication_lag?: number
  }> {
    try {
      // Test write (primary)
      await this.set('health:check', Date.now().toString(), 5)
      const writeHealthy = true

      // Test read (replica)
      await this.get('health:check')
      const readHealthy = true

      // Get replication info
      const info = await this.info('replication')
      const lagMatch = info.match(/master_repl_offset:(\d+)/)
      const replicationLag = lagMatch ? parseInt(lagMatch[1]) : undefined

      logRedisOperation({
        operation: 'sentinel_health_check',
        message: 'Sentinel health check passed',
        level: 'info',
        project_id: this.projectId,
        write_healthy: writeHealthy,
        read_healthy: readHealthy,
        replication_lag: replicationLag,
      })

      return {
        healthy: writeHealthy && readHealthy,
        write: writeHealthy,
        read: readHealthy,
        replication_lag: replicationLag,
      }
    } catch (error) {
      logRedisOperation({
        operation: 'sentinel_health_check',
        message: 'Sentinel health check failed',
        level: 'error',
        project_id: this.projectId,
        error: error as Error,
      })
      return {
        healthy: false,
        write: false,
        read: false,
      }
    }
  }
}

/**
 * Create Redis Sentinel client
 */
export function createRedisSentinelClient(
  projectId: string,
  options: ConnectionOptions,
  connectionManager?: DatabaseConnectionManager
): RedisSentinelClientWrapper {
  return new RedisSentinelClientWrapper(projectId, options, connectionManager)
}

/**
 * Check if Sentinel mode is enabled
 */
export function isSentinelModeEnabled(): boolean {
  return !!process.env.REDIS_SENTINEL_HOSTS
}
