import CircuitBreaker from 'opossum'
import { EventEmitter } from 'events'
import { Registry, Counter, Gauge, Histogram } from 'prom-client'
import * as crypto from 'crypto-js'
import { logger, logCircuitBreakerEvent, logRedisOperation } from '../observability/logger'

const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY || 'SAMPLE_KEY'

/**
 * Database types supported
 */
export enum DatabaseType {
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
  REDIS = 'redis',
  BUN_API = 'bun_api',
}

/**
 * Tier-based configuration
 */
export enum Tier {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Configuration for each tier
 */
interface TierConfig {
  minPoolSize: number
  maxPoolSize: number
  maxConcurrent: number
  priority: 'low' | 'medium' | 'high' | 'critical'
  queryTimeoutMs: number
  connectionTimeoutMs: number
}

/**
 * Tier configurations
 */
const TIER_CONFIGS: Record<Tier, TierConfig> = {
  [Tier.FREE]: {
    minPoolSize: 2,
    maxPoolSize: 5,
    maxConcurrent: 20,
    priority: 'low',
    queryTimeoutMs: 10000, // 10s
    connectionTimeoutMs: 5000, // 5s
  },
  [Tier.STARTER]: {
    minPoolSize: 5,
    maxPoolSize: 10,
    maxConcurrent: 50,
    priority: 'medium',
    queryTimeoutMs: 30000, // 30s
    connectionTimeoutMs: 10000, // 10s
  },
  [Tier.PRO]: {
    minPoolSize: 10,
    maxPoolSize: 50,
    maxConcurrent: 200,
    priority: 'high',
    queryTimeoutMs: 60000, // 60s
    connectionTimeoutMs: 15000, // 15s
  },
  [Tier.ENTERPRISE]: {
    minPoolSize: 20,
    maxPoolSize: 100,
    maxConcurrent: 500,
    priority: 'critical',
    queryTimeoutMs: 120000, // 120s
    connectionTimeoutMs: 30000, // 30s
  },
}

/**
 * Connection pool interface
 */
export interface ConnectionPool<T> {
  acquire(): Promise<T>
  release(connection: T): void
  destroy(connection: T): Promise<void>
  drain(): Promise<void>
  size: number
  available: number
  pending: number
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  timeout: number
  errorThresholdPercentage: number
  resetTimeout: number
  rollingCountTimeout: number
  rollingCountBuckets: number
  volumeThreshold: number
}

/**
 * Database-specific circuit breaker configs
 */
const CIRCUIT_BREAKER_CONFIGS: Record<DatabaseType, CircuitBreakerConfig> = {
  [DatabaseType.POSTGRES]: {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    volumeThreshold: 10,
  },
  [DatabaseType.MONGODB]: {
    timeout: 10000,
    errorThresholdPercentage: 60,
    resetTimeout: 45000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    volumeThreshold: 10,
  },
  [DatabaseType.REDIS]: {
    timeout: 1000,
    errorThresholdPercentage: 70,
    resetTimeout: 15000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    volumeThreshold: 10,
  },
  [DatabaseType.BUN_API]: {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    volumeThreshold: 10,
  },
}

/**
 * Connection metadata
 */
export interface ConnectionMetadata {
  projectId: string
  databaseType: DatabaseType
  tier: Tier
  createdAt: Date
  lastUsedAt: Date
  queryCount: number
  errorCount: number
}

/**
 * Metrics collector
 */
export class DatabaseMetrics {
  private registry: Registry

  // Gauges
  private activeConnections: Gauge
  private poolSize: Gauge
  private circuitState: Gauge

  // Counters
  private queriesTotal: Counter
  private errorsTotal: Counter
  private circuitOpenTotal: Counter

  // Histograms
  private queryDuration: Histogram
  private connectionAcquireDuration: Histogram

  constructor() {
    this.registry = new Registry()

    // Active connections gauge
    this.activeConnections = new Gauge({
      name: 'db_active_connections',
      help: 'Number of active database connections',
      labelNames: ['database_type', 'tier', 'project_id'],
      registers: [this.registry],
    })

    // Pool size gauge
    this.poolSize = new Gauge({
      name: 'db_pool_size',
      help: 'Current database connection pool size',
      labelNames: ['database_type', 'tier', 'status'],
      registers: [this.registry],
    })

    // Circuit breaker state
    this.circuitState = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
      labelNames: ['database_type', 'project_id'],
      registers: [this.registry],
    })

    // Queries counter
    this.queriesTotal = new Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['database_type', 'tier', 'status'],
      registers: [this.registry],
    })

    // Errors counter
    this.errorsTotal = new Counter({
      name: 'db_errors_total',
      help: 'Total number of database errors',
      labelNames: ['database_type', 'tier', 'error_type'],
      registers: [this.registry],
    })

    // Circuit open counter
    this.circuitOpenTotal = new Counter({
      name: 'circuit_breaker_open_total',
      help: 'Total number of times circuit breaker opened',
      labelNames: ['database_type', 'project_id'],
      registers: [this.registry],
    })

    // Query duration histogram
    this.queryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['database_type', 'tier', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
      registers: [this.registry],
    })

    // Connection acquire duration
    this.connectionAcquireDuration = new Histogram({
      name: 'db_connection_acquire_duration_seconds',
      help: 'Time to acquire database connection from pool',
      labelNames: ['database_type', 'tier'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    })
  }

  recordQuery(
    dbType: DatabaseType,
    tier: Tier,
    durationSec: number,
    operation: string,
    success: boolean
  ) {
    this.queriesTotal.inc({
      database_type: dbType,
      tier,
      status: success ? 'success' : 'error',
    })

    this.queryDuration.observe({ database_type: dbType, tier, operation }, durationSec)
  }

  recordError(dbType: DatabaseType, tier: Tier, errorType: string) {
    this.errorsTotal.inc({
      database_type: dbType,
      tier,
      error_type: errorType,
    })
  }

  recordCircuitState(
    dbType: DatabaseType,
    projectId: string,
    state: 'closed' | 'half-open' | 'open'
  ) {
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2
    this.circuitState.set({ database_type: dbType, project_id: projectId }, stateValue)

    if (state === 'open') {
      this.circuitOpenTotal.inc({ database_type: dbType, project_id: projectId })
    }
  }

  recordConnectionAcquire(dbType: DatabaseType, tier: Tier, durationSec: number) {
    this.connectionAcquireDuration.observe({ database_type: dbType, tier }, durationSec)
  }

  setActiveConnections(dbType: DatabaseType, tier: Tier, projectId: string, count: number) {
    this.activeConnections.set({ database_type: dbType, tier, project_id: projectId }, count)
  }

  setPoolSize(
    dbType: DatabaseType,
    tier: Tier,
    status: 'total' | 'available' | 'pending',
    count: number
  ) {
    this.poolSize.set({ database_type: dbType, tier, status }, count)
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics()
  }

  getRegistry(): Registry {
    return this.registry
  }
}

/**
 * Connection options
 */
export interface ConnectionOptions {
  connectionString: string
  tier?: Tier
  config?: Record<string, any>
}

/**
 * Advanced Database Connection Manager
 *
 * Features:
 * - Dynamic connection pooling based on tier
 * - Circuit breakers for failure isolation
 * - Connection health monitoring
 * - Automatic idle connection cleanup
 * - Comprehensive metrics
 * - Query cost estimation integration
 */
export class DatabaseConnectionManager extends EventEmitter {
  private pools: Map<string, ConnectionPool<any>> = new Map()
  private circuitBreakers: Map<string, CircuitBreaker> = new Map()
  private connectionMetadata: Map<string, ConnectionMetadata> = new Map()
  private metrics: DatabaseMetrics
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

  constructor() {
    super()
    this.metrics = new DatabaseMetrics()
    this.startCleanupInterval()
  }

  /**
   * Get tier configuration
   */
  private getTierConfig(tier: Tier): TierConfig {
    return TIER_CONFIGS[tier] || TIER_CONFIGS[Tier.FREE]
  }

  /**
   * Generate connection pool key
   */
  private getPoolKey(projectId: string, dbType: DatabaseType): string {
    return `${projectId}:${dbType}`
  }

  /**
   * Get or create circuit breaker for a database connection
   */
  private getCircuitBreaker(
    projectId: string,
    dbType: DatabaseType
  ): CircuitBreaker {
    const key = this.getPoolKey(projectId, dbType)

    if (this.circuitBreakers.has(key)) {
      return this.circuitBreakers.get(key)!
    }

    const config = CIRCUIT_BREAKER_CONFIGS[dbType]
    // Create circuit breaker with a passthrough function
    // The actual action is passed to fire() each time
    const breaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), {
      timeout: config.timeout,
      errorThresholdPercentage: config.errorThresholdPercentage,
      resetTimeout: config.resetTimeout,
      rollingCountTimeout: config.rollingCountTimeout,
      rollingCountBuckets: config.rollingCountBuckets,
      volumeThreshold: config.volumeThreshold,
      name: key,
    })

    // Event listeners
    breaker.on('open', () => {
      logCircuitBreakerEvent({
        event: 'open',
        project_id: projectId,
        db_type: dbType,
        message: `Circuit breaker opened - system unhealthy`,
      })
      this.metrics.recordCircuitState(dbType, projectId, 'open')
      this.emit('circuit-open', { projectId, dbType })
    })

    breaker.on('halfOpen', () => {
      logCircuitBreakerEvent({
        event: 'half-open',
        project_id: projectId,
        db_type: dbType,
        message: `Circuit breaker half-open - testing recovery`,
      })
      this.metrics.recordCircuitState(dbType, projectId, 'half-open')
      this.emit('circuit-half-open', { projectId, dbType })
    })

    breaker.on('close', () => {
      logCircuitBreakerEvent({
        event: 'close',
        project_id: projectId,
        db_type: dbType,
        message: `Circuit breaker closed - system healthy`,
      })
      this.metrics.recordCircuitState(dbType, projectId, 'closed')
      this.emit('circuit-closed', { projectId, dbType })
    })

    breaker.on('failure', (error: any) => {
      logCircuitBreakerEvent({
        event: 'failure',
        project_id: projectId,
        db_type: dbType,
        message: `Circuit breaker recorded failure`,
        error_message: error.message,
      })
    })

    this.circuitBreakers.set(key, breaker)
    return breaker
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    projectId: string,
    dbType: DatabaseType,
    tier: Tier,
    operation: string,
    action: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now()

    try {
      const breaker = this.getCircuitBreaker(projectId, dbType)
      // Pass the action to fire() - the breaker's function will execute it
      const result = await breaker.fire(action) as T

      const durationSec = (Date.now() - startTime) / 1000
      this.metrics.recordQuery(dbType, tier, durationSec, operation, true)

      // Update metadata
      this.updateMetadata(projectId, dbType, tier, false)

      return result
    } catch (error) {
      const durationSec = (Date.now() - startTime) / 1000
      this.metrics.recordQuery(dbType, tier, durationSec, operation, false)

      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError'
      this.metrics.recordError(dbType, tier, errorType)

      // Update metadata
      this.updateMetadata(projectId, dbType, tier, true)

      throw error
    }
  }

  /**
   * Update connection metadata
   */
  private updateMetadata(
    projectId: string,
    dbType: DatabaseType,
    tier: Tier,
    isError: boolean
  ): void {
    const key = this.getPoolKey(projectId, dbType)
    const metadata = this.connectionMetadata.get(key)

    if (metadata) {
      metadata.lastUsedAt = new Date()
      metadata.queryCount++
      if (isError) {
        metadata.errorCount++
      }
    } else {
      this.connectionMetadata.set(key, {
        projectId,
        databaseType: dbType,
        tier,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        queryCount: 1,
        errorCount: isError ? 1 : 0,
      })
    }
  }

  /**
   * Get connection metadata
   */
  getConnectionMetadata(projectId: string, dbType: DatabaseType): ConnectionMetadata | undefined {
    const key = this.getPoolKey(projectId, dbType)
    return this.connectionMetadata.get(key)
  }

  /**
   * Get all connection metadata
   */
  getAllConnectionMetadata(): ConnectionMetadata[] {
    return Array.from(this.connectionMetadata.values())
  }

  /**
   * Check if connection is healthy
   */
  async checkHealth(projectId: string, dbType: DatabaseType): Promise<boolean> {
    const key = this.getPoolKey(projectId, dbType)
    const breaker = this.circuitBreakers.get(key)

    if (!breaker) {
      return true // No breaker means no connection yet
    }

    return !breaker.opened
  }

  /**
   * Start idle connection cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.closeIdleConnections()
    }, this.CLEANUP_INTERVAL_MS)
  }

  /**
   * Close idle connections
   */
  async closeIdleConnections(): Promise<number> {
    const now = Date.now()
    let closedCount = 0

    for (const [key, metadata] of Array.from(this.connectionMetadata.entries())) {
      const idleTime = now - metadata.lastUsedAt.getTime()

      if (idleTime > this.IDLE_TIMEOUT_MS) {
        const pool = this.pools.get(key)

        if (pool) {
          try {
            await pool.drain()
            this.pools.delete(key)
            this.circuitBreakers.delete(key)
            this.connectionMetadata.delete(key)
            closedCount++

            logRedisOperation({
              operation: 'pool_close_idle',
              message: 'Closed idle connection pool',
              level: 'info',
              pool_key: key,
              idle_time_ms: idleTime,
            })
          } catch (error) {
            logRedisOperation({
              operation: 'pool_close_idle',
              message: 'Error closing idle connection pool',
              level: 'error',
              pool_key: key,
              error: error as Error,
            })
          }
        }
      }
    }

    return closedCount
  }

  /**
   * Close specific connection
   */
  async closeConnection(projectId: string, dbType: DatabaseType): Promise<void> {
    const key = this.getPoolKey(projectId, dbType)
    const pool = this.pools.get(key)

    if (pool) {
      await pool.drain()
      this.pools.delete(key)

      logRedisOperation({
        operation: 'pool_close',
        message: 'Closed connection pool',
        level: 'info',
        pool_key: key,
        project_id: projectId,
        db_type: dbType,
      })
    }

    // Always clean up circuit breakers and metadata
    this.circuitBreakers.delete(key)
    this.connectionMetadata.delete(key)
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const poolEntries = Array.from(this.pools.entries())
    const promises = poolEntries.map(async ([key, pool]) => {
      try {
        await pool.drain()
        logRedisOperation({
          operation: 'pool_close_all',
          message: 'Closed connection pool during shutdown',
          level: 'info',
          pool_key: key,
        })
      } catch (error) {
        logRedisOperation({
          operation: 'pool_close_all',
          message: 'Error closing connection pool during shutdown',
          level: 'error',
          pool_key: key,
          error: error as Error,
        })
      }
    })

    await Promise.all(promises)

    this.pools.clear()
    this.circuitBreakers.clear()
    this.connectionMetadata.clear()

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Get metrics
   */
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics()
  }

  /**
   * Get metrics registry
   */
  getMetricsRegistry(): Registry {
    return this.metrics.getRegistry()
  }

  /**
   * Encrypt connection string
   */
  encryptConnectionString(connectionString: string): string {
    return crypto.AES.encrypt(connectionString, ENCRYPTION_KEY).toString()
  }

  /**
   * Decrypt connection string
   */
  decryptConnectionString(encrypted: string): string {
    const bytes = crypto.AES.decrypt(encrypted, ENCRYPTION_KEY)
    return bytes.toString(crypto.enc.Utf8)
  }

  /**
   * Get pool statistics
   */
  getPoolStats(
    projectId: string,
    dbType: DatabaseType
  ): {
    size: number
    available: number
    pending: number
  } | null {
    const key = this.getPoolKey(projectId, dbType)
    const pool = this.pools.get(key)

    if (!pool) {
      return null
    }

    return {
      size: pool.size,
      available: pool.available,
      pending: pool.pending,
    }
  }

  /**
   * Get all pool statistics
   */
  getAllPoolStats(): Map<
    string,
    {
      size: number
      available: number
      pending: number
      metadata?: ConnectionMetadata
    }
  > {
    const stats = new Map()

    for (const [key, pool] of this.pools.entries()) {
      stats.set(key, {
        size: pool.size,
        available: pool.available,
        pending: pool.pending,
        metadata: this.connectionMetadata.get(key),
      })
    }

    return stats
  }
}

/**
 * Global connection manager instance
 */
export const connectionManager = new DatabaseConnectionManager()
