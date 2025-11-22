/**
 * Winston Structured Logger for Redis Operations
 *
 * Provides production-ready structured logging with:
 * - JSON formatting for log aggregation
 * - Correlation ID tracking
 * - Log rotation and retention
 * - Environment-based log levels
 * - Rich context metadata
 *
 * Usage:
 *   import { logger } from './observability/logger'
 *   logger.info('Cache hit', { user_id: 'user_123', duration_ms: 4.5 })
 */

import winston from 'winston'
import { getCorrelationId } from './correlation'

/**
 * Custom format to inject correlation ID into every log entry
 */
const correlationFormat = winston.format((info) => {
  const correlationId = getCorrelationId()
  if (correlationId) {
    info.correlation_id = correlationId
  }
  return info
})

/**
 * Custom format for Redis operation context
 */
const redisContextFormat = winston.format((info) => {
  // Add service identifier
  if (!info.service) {
    info.service = 'redis-cache'
  }

  // Add environment
  if (!info.environment) {
    info.environment = process.env.NODE_ENV || 'development'
  }

  return info
})

/**
 * Console format for development - colorized and readable
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  correlationFormat(),
  redisContextFormat(),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service, correlation_id, ...meta } = info

    // Build correlation ID display
    const corrId = correlation_id ? ` [${String(correlation_id).substring(0, 8)}]` : ''

    // Build metadata display
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''

    return `${timestamp} ${level} [${service}]${corrId}: ${message}${metaStr}`
  })
)

/**
 * Production format - structured JSON for log aggregation
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  correlationFormat(),
  redisContextFormat(),
  winston.format.json()
)

/**
 * Determine if running in production
 */
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Create logger instance
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'redis-cache',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Console output - always enabled
    new winston.transports.Console({
      format: isProduction ? productionFormat : developmentFormat,
    }),

    // Error log file - production only
    ...(isProduction
      ? [
          new winston.transports.File({
            filename: 'logs/redis-error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: productionFormat,
          }),
          new winston.transports.File({
            filename: 'logs/redis-combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            format: productionFormat,
          }),
        ]
      : []),
  ],
  // Don't exit on error
  exitOnError: false,
})

/**
 * Create child logger with additional default metadata
 */
export function createChildLogger(defaultMeta: Record<string, any>) {
  return logger.child(defaultMeta)
}

/**
 * Log Redis operation with standard format
 */
export function logRedisOperation(params: {
  operation: string
  message: string
  level?: 'debug' | 'info' | 'warn' | 'error'
  duration_ms?: number
  key?: string
  user_id?: string
  org_id?: string
  session_id?: string
  cache_hit?: boolean
  error?: Error
  [key: string]: any
}) {
  const { operation, message, level = 'info', error, ...meta } = params

  const logData: Record<string, any> = {
    operation,
    ...meta,
  }

  // Add error details if present
  if (error) {
    logData.error_type = error.constructor.name
    logData.error_message = error.message
    if (!isProduction) {
      logData.error_stack = error.stack
    }
  }

  logger[level](message, logData)
}

/**
 * Log cache operation specifically
 */
export function logCacheOperation(params: {
  operation: 'get' | 'set' | 'del' | 'invalidate'
  cache_hit?: boolean
  duration_ms?: number
  key?: string
  user_id?: string
  session_id?: string
  message?: string
  [key: string]: any
}) {
  const { operation, message, cache_hit, ...meta } = params

  const msg = message || (cache_hit ? 'Cache hit' : 'Cache miss')

  logRedisOperation({
    operation: `cache_${operation}`,
    message: msg,
    level: 'info',
    cache_hit,
    ...meta,
  })
}

/**
 * Log connection pool event
 */
export function logPoolEvent(params: {
  event: 'acquire' | 'release' | 'destroy' | 'drain' | 'create'
  pool_size?: number
  pool_available?: number
  pool_pending?: number
  duration_ms?: number
  message?: string
  [key: string]: any
}) {
  const { event, message, ...meta } = params

  logRedisOperation({
    operation: `pool_${event}`,
    message: message || `Connection pool ${event}`,
    level: 'debug',
    ...meta,
  })
}

/**
 * Log circuit breaker event
 */
export function logCircuitBreakerEvent(params: {
  event: 'open' | 'half-open' | 'close' | 'failure' | 'success'
  project_id: string
  db_type: string
  message?: string
  error?: Error
  [key: string]: any
}) {
  const { event, message, project_id, db_type, error, ...meta } = params

  const level = event === 'open' || event === 'failure' ? 'error' : event === 'half-open' ? 'warn' : 'info'

  logRedisOperation({
    operation: `circuit_breaker_${event}`,
    message: message || `Circuit breaker ${event} for ${project_id}:${db_type}`,
    level,
    project_id,
    db_type,
    error,
    ...meta,
  })
}

/**
 * Log health check result
 */
export function logHealthCheck(params: {
  healthy: boolean
  duration_ms: number
  checks?: Record<string, boolean>
  message?: string
  [key: string]: any
}) {
  const { healthy, message, ...meta } = params

  logRedisOperation({
    operation: 'health_check',
    message: message || (healthy ? 'Health check passed' : 'Health check failed'),
    level: healthy ? 'info' : 'warn',
    healthy,
    ...meta,
  })
}

/**
 * Stream to capture logs in tests
 */
export class LogCapture {
  private logs: any[] = []
  private transport: winston.transports.StreamTransportInstance

  constructor() {
    this.transport = new winston.transports.Stream({
      stream: {
        write: (message: string) => {
          try {
            this.logs.push(JSON.parse(message))
          } catch {
            this.logs.push({ raw: message })
          }
        },
      } as any,
    })

    logger.add(this.transport)
  }

  getLogs() {
    return this.logs
  }

  clear() {
    this.logs = []
  }

  stop() {
    logger.remove(this.transport)
  }
}

export default logger
