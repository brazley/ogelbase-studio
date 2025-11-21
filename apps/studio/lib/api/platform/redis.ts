import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis'
import * as genericPool from 'generic-pool'
import type { Pool } from 'generic-pool'
import {
  DatabaseConnectionManager,
  DatabaseType,
  Tier,
  ConnectionPool,
  ConnectionOptions,
} from './connection-manager'

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
          const client = new Redis({
            ...this.options,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
          })

          await client.ping()
          return client
        },
        destroy: async (client: RedisClient) => {
          await client.quit()
        },
        validate: async (client: RedisClient) => {
          try {
            await client.ping()
            return true
          } catch {
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
  }

  /**
   * Parse Redis connection string
   */
  private parseConnectionString(connectionString: string): RedisOptions {
    try {
      const url = new URL(connectionString)

      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: parseInt(url.pathname.slice(1)) || 0,
        username: url.username || undefined,
      }
    } catch (error) {
      throw new Error(`Invalid Redis connection string: ${error}`)
    }
  }

  async acquire(): Promise<RedisClient> {
    return this.pool.acquire()
  }

  release(connection: RedisClient): void {
    this.pool.release(connection)
  }

  async destroy(connection: RedisClient): Promise<void> {
    this.pool.destroy(connection)
  }

  async drain(): Promise<void> {
    await this.pool.drain()
    await this.pool.clear()
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
  }

  /**
   * Execute Redis command with circuit breaker protection
   */
  private async execute<T>(
    operation: string,
    action: (client: RedisClient) => Promise<T>
  ): Promise<T> {
    return this.connectionManager.executeWithCircuitBreaker(
      this.projectId,
      DatabaseType.REDIS,
      this.tier,
      operation,
      async () => {
        const client = await this.pool.acquire()
        try {
          return await action(client)
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
    return this.execute('get', async (client) => client.get(key))
  }

  /**
   * Set value with optional expiration
   */
  async set(key: string, value: string, expirationSeconds?: number): Promise<'OK'> {
    return this.execute('set', async (client) => {
      if (expirationSeconds) {
        return client.set(key, value, 'EX', expirationSeconds)
      }
      return client.set(key, value)
    })
  }

  /**
   * Delete one or more keys
   */
  async del(...keys: string[]): Promise<number> {
    return this.execute('del', async (client) => client.del(...keys))
  }

  /**
   * Check if key exists
   */
  async exists(...keys: string[]): Promise<number> {
    return this.execute('exists', async (client) => client.exists(...keys))
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.execute('expire', async (client) => client.expire(key, seconds))
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    return this.execute('ttl', async (client) => client.ttl(key))
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    return this.execute('incr', async (client) => client.incr(key))
  }

  /**
   * Increment by amount
   */
  async incrby(key: string, increment: number): Promise<number> {
    return this.execute('incrby', async (client) => client.incrby(key, increment))
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number> {
    return this.execute('decr', async (client) => client.decr(key))
  }

  /**
   * Decrement by amount
   */
  async decrby(key: string, decrement: number): Promise<number> {
    return this.execute('decrby', async (client) => client.decrby(key, decrement))
  }

  /**
   * Get multiple keys
   */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.execute('mget', async (client) => client.mget(...keys))
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(data: Record<string, string>): Promise<'OK'> {
    return this.execute('mset', async (client) => client.mset(data))
  }

  /**
   * Scan keys with pattern
   */
  async scan(cursor: string, pattern?: string, count?: number): Promise<[string, string[]]> {
    return this.execute('scan', async (client) => {
      const args: any[] = [cursor]
      if (pattern) {
        args.push('MATCH', pattern)
      }
      if (count) {
        args.push('COUNT', count)
      }
      return client.scan(...(args as [string, ...any[]]))
    })
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.execute('keys', async (client) => client.keys(pattern))
  }

  /**
   * Hash operations - set field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.execute('hset', async (client) => client.hset(key, field, value))
  }

  /**
   * Hash operations - get field
   */
  async hget(key: string, field: string): Promise<string | null> {
    return this.execute('hget', async (client) => client.hget(key, field))
  }

  /**
   * Hash operations - get all fields and values
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.execute('hgetall', async (client) => client.hgetall(key))
  }

  /**
   * Hash operations - delete field
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.execute('hdel', async (client) => client.hdel(key, ...fields))
  }

  /**
   * Hash operations - check if field exists
   */
  async hexists(key: string, field: string): Promise<number> {
    return this.execute('hexists', async (client) => client.hexists(key, field))
  }

  /**
   * List operations - push to left
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.execute('lpush', async (client) => client.lpush(key, ...values))
  }

  /**
   * List operations - push to right
   */
  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.execute('rpush', async (client) => client.rpush(key, ...values))
  }

  /**
   * List operations - pop from left
   */
  async lpop(key: string): Promise<string | null> {
    return this.execute('lpop', async (client) => client.lpop(key))
  }

  /**
   * List operations - pop from right
   */
  async rpop(key: string): Promise<string | null> {
    return this.execute('rpop', async (client) => client.rpop(key))
  }

  /**
   * List operations - get range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.execute('lrange', async (client) => client.lrange(key, start, stop))
  }

  /**
   * List operations - get length
   */
  async llen(key: string): Promise<number> {
    return this.execute('llen', async (client) => client.llen(key))
  }

  /**
   * Set operations - add members
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.execute('sadd', async (client) => client.sadd(key, ...members))
  }

  /**
   * Set operations - remove members
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this.execute('srem', async (client) => client.srem(key, ...members))
  }

  /**
   * Set operations - get all members
   */
  async smembers(key: string): Promise<string[]> {
    return this.execute('smembers', async (client) => client.smembers(key))
  }

  /**
   * Set operations - check if member exists
   */
  async sismember(key: string, member: string): Promise<number> {
    return this.execute('sismember', async (client) => client.sismember(key, member))
  }

  /**
   * Sorted set operations - add members with scores
   */
  async zadd(key: string, ...args: Array<number | string>): Promise<number> {
    return this.execute('zadd', async (client) => client.zadd(key, ...(args as any)))
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
    return this.execute('zrangebyscore', async (client) => {
      if (withScores) {
        return client.zrangebyscore(key, min as any, max as any, 'WITHSCORES')
      }
      return client.zrangebyscore(key, min as any, max as any)
    })
  }

  /**
   * Sorted set operations - get range
   */
  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    return this.execute('zrange', async (client) => {
      if (withScores) {
        return client.zrange(key, start, stop, 'WITHSCORES')
      }
      return client.zrange(key, start, stop)
    })
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.execute('publish', async (client) => client.publish(channel, message))
  }

  /**
   * Flush all data (use with caution)
   */
  async flushall(): Promise<'OK'> {
    return this.execute('flushall', async (client) => client.flushall())
  }

  /**
   * Flush current database (use with caution)
   */
  async flushdb(): Promise<'OK'> {
    return this.execute('flushdb', async (client) => client.flushdb())
  }

  /**
   * Get database info
   */
  async info(section?: string): Promise<string> {
    return this.execute('info', async (client) => {
      if (section) {
        return client.info(section)
      }
      return client.info()
    })
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
      return true
    } catch {
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
