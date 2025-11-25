import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis'
import * as genericPool from 'generic-pool'
import type { Pool } from 'generic-pool'
import type { ConnectionOptions as TLSConnectionOptions } from 'tls'
import {
  DatabaseConnectionManager,
  DatabaseType,
  Tier,
  ConnectionPool,
  ConnectionOptions,
} from './connection-manager'
import { logger, logRedisOperation, logPoolEvent } from '../observability/logger'
import { getHotkeyDetector } from '../cache/hotkey-detection'
import { traceRedisOperation, tracePoolOperation } from '../observability/tracing'

/**
 * Redis connection pool implementation
 */
export class RedisConnectionPool implements ConnectionPool<RedisClient> {
  private pool: Pool<RedisClient>
  private connectionString: string
  private options: RedisOptions

  constructor(connectionString: string, config: { min?: number; max?: number } = {}) {
    this.connectionString = connectionString
    this.options = this.parseConnectionString(connectionString)

    // Create connection pool
    this.pool = genericPool.createPool(
      {
        create: async () => {
          const startTime = Date.now()
          try {
            const client = new Redis({
              ...this.options,
              maxRetriesPerRequest: 3,
              enableReadyCheck: true,
              lazyConnect: false,
            })

            await client.ping()

            const duration = Date.now() - startTime
            logPoolEvent({
              event: 'create',
              duration_ms: duration,
              pool_size: this.pool.size,
              pool_available: this.pool.available,
              message: 'Redis connection created',
            })

            return client
          } catch (error) {
            const duration = Date.now() - startTime
            logRedisOperation({
              operation: 'pool_create',
              message: 'Failed to create Redis connection',
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
              message: 'Redis connection destroyed',
            })
          } catch (error) {
            logRedisOperation({
              operation: 'pool_destroy',
              message: 'Error destroying Redis connection',
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
              operation: 'pool_validate',
              message: 'Connection validation failed',
              level: 'debug',
              error: error as Error,
            })
            return false
          }
        },
      },
      {
        min: config.min || 1,
        max: config.max || 10,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 10000,
        testOnBorrow: true,
      }
    )

    logPoolEvent({
      event: 'create',
      pool_size: this.pool.size,
      message: `Redis pool initialized (min=${config.min || 1}, max=${config.max || 10})`,
    })
  }

  /**
   * Parse Redis connection string and configure TLS
   */
  private parseConnectionString(connectionString: string): RedisOptions {
    try {
      const url = new URL(connectionString)
      const useTLS = url.protocol === 'rediss:' || process.env.REDIS_USE_TLS === 'true'

      const baseOptions: RedisOptions = {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: parseInt(url.pathname.slice(1)) || 0,
        username: url.username || undefined,
      }

      // Configure TLS encryption
      if (useTLS) {
        // SECURITY: Only allow disabling certificate validation in development with explicit opt-in
        const allowInsecure = process.env.NODE_ENV === 'development' && process.env.REDIS_ALLOW_INSECURE_TLS === 'true'

        baseOptions.tls = {
          // Enforce certificate validation (only disable in dev with explicit flag)
          rejectUnauthorized: !allowInsecure,
          // Optional custom CA certificate (for self-signed certs in dev/staging)
          ca: process.env.REDIS_CA_CERT ? Buffer.from(process.env.REDIS_CA_CERT, 'base64') : undefined,
          // Optional client certificate for mutual TLS (recommended for production)
          cert: process.env.REDIS_CLIENT_CERT
            ? Buffer.from(process.env.REDIS_CLIENT_CERT, 'base64')
            : undefined,
          key: process.env.REDIS_CLIENT_KEY ? Buffer.from(process.env.REDIS_CLIENT_KEY, 'base64') : undefined,
          // Minimum TLS version for security (TLS 1.2+)
          minVersion: 'TLSv1.2',
          // Maximum TLS version (TLS 1.3 preferred for forward secrecy)
          maxVersion: 'TLSv1.3',
          // Verify server hostname matches certificate (only bypass in dev with explicit flag)
          checkServerIdentity: allowInsecure ? () => undefined : undefined,
          // Disable legacy SSL/TLS renegotiation (prevents MITM attacks)
          honorCipherOrder: true,
          // Enable secure cipher suites only
          ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
        }

        logRedisOperation({
          operation: 'tls_config',
          message: 'TLS encryption enabled for Redis connection',
          level: allowInsecure ? 'warn' : 'info',
          tls_enabled: true,
          reject_unauthorized: !allowInsecure,
          min_tls_version: 'TLSv1.2',
          max_tls_version: 'TLSv1.3',
          allow_insecure_dev: allowInsecure,
          mutual_tls: !!process.env.REDIS_CLIENT_CERT,
        })

        // SECURITY WARNING: Log if insecure TLS is enabled
        if (allowInsecure) {
          logger.warn({
            message: 'INSECURE: TLS certificate validation disabled for Redis',
            env: process.env.NODE_ENV,
            warning: 'This should NEVER be enabled in production',
          })
        }
      }

      return baseOptions
    } catch (error) {
      logRedisOperation({
        operation: 'connection_string_parse',
        message: 'Invalid Redis connection string',
        level: 'error',
        error: error as Error,
      })
      throw new Error(`Invalid Redis connection string: ${error}`)
    }
  }

  async acquire(): Promise<RedisClient> {
    return tracePoolOperation(
      'acquire',
      {
        'pool.size': this.pool.size,
        'pool.available': this.pool.available,
        'pool.pending': this.pool.pending,
      },
      async (span) => {
        const startTime = Date.now()
        try {
          const client = await this.pool.acquire()
          const duration = Date.now() - startTime

          span.setAttribute('pool.acquire.duration_ms', duration)
          span.setAttribute('pool.size.after', this.pool.size)
          span.setAttribute('pool.available.after', this.pool.available)

          logPoolEvent({
            event: 'acquire',
            duration_ms: duration,
            pool_size: this.pool.size,
            pool_available: this.pool.available,
            pool_pending: this.pool.pending,
          })

          return client
        } catch (error) {
          const duration = Date.now() - startTime
          logRedisOperation({
            operation: 'pool_acquire',
            message: 'Failed to acquire connection from pool',
            level: 'error',
            duration_ms: duration,
            pool_pending: this.pool.pending,
            error: error as Error,
          })
          throw error
        }
      }
    )
  }

  release(connection: RedisClient): void {
    this.pool.release(connection)
    logPoolEvent({
      event: 'release',
      pool_size: this.pool.size,
      pool_available: this.pool.available,
      pool_pending: this.pool.pending,
    })
  }

  async destroy(connection: RedisClient): Promise<void> {
    await this.pool.destroy(connection)
    logPoolEvent({
      event: 'destroy',
      pool_size: this.pool.size,
      pool_available: this.pool.available,
      message: 'Connection destroyed from pool',
    })
  }

  async drain(): Promise<void> {
    logPoolEvent({
      event: 'drain',
      pool_size: this.pool.size,
      message: 'Draining connection pool',
    })
    await this.pool.drain()
    await this.pool.clear()
    logPoolEvent({
      event: 'drain',
      pool_size: 0,
      pool_available: 0,
      message: 'Connection pool drained',
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
 * Redis client with circuit breaker protection
 */
export class RedisClientWrapper {
  private connectionManager: DatabaseConnectionManager
  private projectId: string
  private tier: Tier
  private pool: RedisConnectionPool
  private poolKey: string

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

    // Create Redis pool
    this.pool = new RedisConnectionPool(options.connectionString, {
      min: options.config?.minPoolSize || 1,
      max: options.config?.maxPoolSize || 10,
    })

    this.poolKey = `${projectId}:${DatabaseType.REDIS}`

    logRedisOperation({
      operation: 'client_init',
      message: 'Redis client initialized',
      level: 'info',
      project_id: projectId,
      tier: this.tier,
    })
  }

  /**
   * Execute Redis command with circuit breaker protection
   */
  private async execute<T>(
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
        const client = await this.pool.acquire()
        try {
          const result = await action(client)

          const duration = Date.now() - startTime
          logRedisOperation({
            operation,
            message: `Redis ${operation} completed`,
            level: 'debug',
            duration_ms: duration,
            project_id: this.projectId,
            tier: this.tier,
            ...context,
          })

          return result
        } finally {
          this.pool.release(client)
        }
      }
    )
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<string> {
    return this.execute('ping', async (client) => client.ping())
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    // Track key access for hotkey detection
    const detector = getHotkeyDetector()
    detector.track(key)

    return traceRedisOperation(
      'get',
      {
        'redis.key': key,
        'redis.command': 'GET',
      },
      async (span) => {
        const result = await this.execute('get', async (client) => client.get(key), { key })

        span.setAttribute('redis.cache.hit', result !== null)
        span.setAttribute('redis.key.exists', result !== null)

        return result
      }
    )
  }

  /**
   * Set value with optional expiration
   */
  async set(key: string, value: string, expirationSeconds?: number): Promise<'OK'> {
    // Track key access for hotkey detection
    const detector = getHotkeyDetector()
    detector.track(key)

    return traceRedisOperation(
      'set',
      {
        'redis.key': key,
        'redis.command': 'SET',
        'redis.value.size': value.length,
        ...(expirationSeconds ? { 'redis.ttl': expirationSeconds } : {}),
      },
      async (span) => {
        const result = await this.execute(
          'set',
          async (client) => {
            if (expirationSeconds) {
              return client.set(key, value, 'EX', expirationSeconds)
            }
            return client.set(key, value)
          },
          { key, ttl_seconds: expirationSeconds }
        )

        span.setAttribute('redis.set.success', true)

        return result
      }
    )
  }

  /**
   * Delete one or more keys
   */
  async del(...keys: string[]): Promise<number> {
    return this.execute('del', async (client) => client.del(...keys), { keys_count: keys.length })
  }

  /**
   * Check if key exists
   */
  async exists(...keys: string[]): Promise<number> {
    return this.execute('exists', async (client) => client.exists(...keys), { keys_count: keys.length })
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.execute('expire', async (client) => client.expire(key, seconds), {
      key,
      ttl_seconds: seconds,
    })
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    return this.execute('ttl', async (client) => client.ttl(key), { key })
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    // Track key access for hotkey detection
    const detector = getHotkeyDetector()
    detector.track(key)

    return this.execute('incr', async (client) => client.incr(key), { key })
  }

  /**
   * Increment by amount
   */
  async incrby(key: string, increment: number): Promise<number> {
    return this.execute('incrby', async (client) => client.incrby(key, increment), { key, increment })
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number> {
    return this.execute('decr', async (client) => client.decr(key), { key })
  }

  /**
   * Decrement by amount
   */
  async decrby(key: string, decrement: number): Promise<number> {
    return this.execute('decrby', async (client) => client.decrby(key, decrement), { key, decrement })
  }

  /**
   * Get multiple keys
   */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.execute('mget', async (client) => client.mget(...keys), { keys_count: keys.length })
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(data: Record<string, string>): Promise<'OK'> {
    return this.execute('mset', async (client) => client.mset(data), {
      pairs_count: Object.keys(data).length,
    })
  }

  /**
   * Scan keys with pattern
   */
  async scan(cursor: string, pattern?: string, count?: number): Promise<[string, string[]]> {
    return this.execute(
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

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.execute('keys', async (client) => client.keys(pattern), { pattern })
  }

  /**
   * Hash operations - set field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    // Track key access for hotkey detection
    const detector = getHotkeyDetector()
    detector.track(key)

    return traceRedisOperation(
      'hset',
      {
        'redis.key': key,
        'redis.command': 'HSET',
        'redis.hash.field': field,
        'redis.value.size': value.length,
      },
      async (span) => {
        const result = await this.execute('hset', async (client) => client.hset(key, field, value), { key, field })

        span.setAttribute('redis.hash.field.created', result === 1)

        return result
      }
    )
  }

  /**
   * Hash operations - get field
   */
  async hget(key: string, field: string): Promise<string | null> {
    // Track key access for hotkey detection
    const detector = getHotkeyDetector()
    detector.track(key)

    return traceRedisOperation(
      'hget',
      {
        'redis.key': key,
        'redis.command': 'HGET',
        'redis.hash.field': field,
      },
      async (span) => {
        const result = await this.execute('hget', async (client) => client.hget(key, field), { key, field })

        span.setAttribute('redis.hash.field.exists', result !== null)

        return result
      }
    )
  }

  /**
   * Hash operations - get all fields and values
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    // Track key access for hotkey detection
    const detector = getHotkeyDetector()
    detector.track(key)

    return traceRedisOperation(
      'hgetall',
      {
        'redis.key': key,
        'redis.command': 'HGETALL',
      },
      async (span) => {
        const result = await this.execute('hgetall', async (client) => client.hgetall(key), { key })

        const fieldCount = Object.keys(result).length
        span.setAttribute('redis.hash.field.count', fieldCount)
        span.setAttribute('redis.hash.exists', fieldCount > 0)

        return result
      }
    )
  }

  /**
   * Hash operations - delete field
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.execute('hdel', async (client) => client.hdel(key, ...fields), {
      key,
      fields_count: fields.length,
    })
  }

  /**
   * Hash operations - check if field exists
   */
  async hexists(key: string, field: string): Promise<number> {
    return this.execute('hexists', async (client) => client.hexists(key, field), { key, field })
  }

  /**
   * List operations - push to left
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.execute('lpush', async (client) => client.lpush(key, ...values), {
      key,
      values_count: values.length,
    })
  }

  /**
   * List operations - push to right
   */
  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.execute('rpush', async (client) => client.rpush(key, ...values), {
      key,
      values_count: values.length,
    })
  }

  /**
   * List operations - pop from left
   */
  async lpop(key: string): Promise<string | null> {
    return this.execute('lpop', async (client) => client.lpop(key), { key })
  }

  /**
   * List operations - pop from right
   */
  async rpop(key: string): Promise<string | null> {
    return this.execute('rpop', async (client) => client.rpop(key), { key })
  }

  /**
   * List operations - get range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.execute('lrange', async (client) => client.lrange(key, start, stop), { key, start, stop })
  }

  /**
   * List operations - get length
   */
  async llen(key: string): Promise<number> {
    return this.execute('llen', async (client) => client.llen(key), { key })
  }

  /**
   * Set operations - add members
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.execute('sadd', async (client) => client.sadd(key, ...members), {
      key,
      members_count: members.length,
    })
  }

  /**
   * Set operations - remove members
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.execute('srem', async (client) => client.srem(key, ...members), {
      key,
      members_count: members.length,
    })
  }

  /**
   * Set operations - get all members
   */
  async smembers(key: string): Promise<string[]> {
    return this.execute('smembers', async (client) => client.smembers(key), { key })
  }

  /**
   * Set operations - check if member exists
   */
  async sismember(key: string, member: string): Promise<number> {
    return this.execute('sismember', async (client) => client.sismember(key, member), { key, member })
  }

  /**
   * Sorted set operations - add members with scores
   */
  async zadd(key: string, ...args: Array<number | string>): Promise<number> {
    return this.execute('zadd', async (client) => client.zadd(key, ...(args as any)), { key })
  }

  /**
   * Sorted set operations - get range by score
   */
  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    withScores?: boolean
  ): Promise<string[]> {
    return this.execute(
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
   * Sorted set operations - get range
   */
  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    return this.execute(
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

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.execute('publish', async (client) => client.publish(channel, message), { channel })
  }

  /**
   * Flush all data (use with caution)
   */
  async flushall(): Promise<'OK'> {
    logRedisOperation({
      operation: 'flushall',
      message: 'WARNING: Flushing all Redis data',
      level: 'warn',
      project_id: this.projectId,
    })
    return this.execute('flushall', async (client) => client.flushall())
  }

  /**
   * Flush current database (use with caution)
   */
  async flushdb(): Promise<'OK'> {
    logRedisOperation({
      operation: 'flushdb',
      message: 'WARNING: Flushing current Redis database',
      level: 'warn',
      project_id: this.projectId,
    })
    return this.execute('flushdb', async (client) => client.flushdb())
  }

  /**
   * Get database info
   */
  async info(section?: string): Promise<string> {
    return this.execute(
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

  /**
   * Get/set Redis configuration
   */
  async config(operation: 'GET' | 'SET', parameter: string, value?: string): Promise<any> {
    return this.execute(
      'config',
      async (client) => {
        if (operation === 'GET') {
          return client.config('GET', parameter)
        } else if (operation === 'SET' && value !== undefined) {
          return client.config('SET', parameter, value)
        }
        throw new Error('Invalid config operation')
      },
      { operation, parameter, value }
    )
  }

  /**
   * Get database size
   */
  async dbsize(): Promise<number> {
    return this.execute('dbsize', async (client) => client.dbsize())
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    logRedisOperation({
      operation: 'client_close',
      message: 'Closing Redis client and draining pool',
      level: 'info',
      project_id: this.projectId,
    })
    await this.pool.drain()
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { size: number; available: number; pending: number } {
    return {
      size: this.pool.size,
      available: this.pool.available,
      pending: this.pool.pending,
    }
  }

  /**
   * Check connection health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ping()
      logRedisOperation({
        operation: 'health_check',
        message: 'Redis health check passed',
        level: 'info',
        project_id: this.projectId,
        healthy: true,
      })
      return true
    } catch (error) {
      logRedisOperation({
        operation: 'health_check',
        message: 'Redis health check failed',
        level: 'error',
        project_id: this.projectId,
        healthy: false,
        error: error as Error,
      })
      return false
    }
  }
}

/**
 * Create Redis client
 */
export function createRedisClient(
  projectId: string,
  options: ConnectionOptions,
  connectionManager?: DatabaseConnectionManager
): RedisClientWrapper {
  return new RedisClientWrapper(projectId, options, connectionManager)
}
