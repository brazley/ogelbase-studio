import winston from 'winston'
import { getTraceContext } from './tracing'

// PII patterns to redact
const PII_PATTERNS = [
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { name: 'phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'credit_card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g },
  { name: 'api_key', pattern: /\b[a-zA-Z0-9_-]{32,}\b/g },
]

/**
 * Redact PII from log messages
 */
function redactPII(message: string): string {
  let redacted = message
  for (const { name, pattern } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, `[REDACTED_${name.toUpperCase()}]`)
  }
  return redacted
}

/**
 * ECS (Elastic Common Schema) formatter
 */
const ecsFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const traceContext = getTraceContext()

  const ecsLog = {
    '@timestamp': timestamp,
    'log.level': level,
    message: typeof message === 'string' ? redactPII(message) : message,
    ecs: { version: '1.12.0' },
    service: {
      name: 'supabase-studio-api',
      version: process.env.npm_package_version || '0.0.9',
    },
    // Add trace context for correlation
    ...(traceContext.traceId && {
      trace: { id: traceContext.traceId },
      transaction: { id: traceContext.spanId },
    }),
    // Add custom metadata
    ...meta,
  }

  return JSON.stringify(ecsLog)
})

/**
 * Create logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    ecsFormat
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          return `${timestamp} [${level}]: ${message} ${metaStr}`
        })
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
})

// If not in production, log to console with pretty format
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  )
}

/**
 * Create child logger with context
 */
export function createLogger(context: {
  orgId?: string
  projectId?: string
  userId?: string
  [key: string]: unknown
}) {
  return logger.child(context)
}

/**
 * Log HTTP request
 */
export function logHttpRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  context?: {
    orgId?: string
    projectId?: string
    userId?: string
    [key: string]: unknown
  }
) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

  logger.log(level, 'HTTP Request', {
    http: {
      request: { method },
      response: { status_code: statusCode },
    },
    url: { path: url },
    event: { duration: duration * 1000 }, // Convert to ms
    ...context,
  })
}

/**
 * Log database query
 */
export function logDatabaseQuery(
  queryType: string,
  table: string,
  duration: number,
  success: boolean,
  context?: {
    orgId?: string
    projectId?: string
    error?: Error
    [key: string]: unknown
  }
) {
  const level = success ? 'debug' : 'error'

  logger.log(level, 'Database Query', {
    db: {
      query_type: queryType,
      table,
      duration: duration * 1000, // Convert to ms
      success,
    },
    ...context,
    ...(context?.error && {
      error: {
        message: context.error.message,
        stack: context.error.stack,
        type: context.error.name,
      },
    }),
  })
}

/**
 * Log authentication attempt
 */
export function logAuthentication(
  success: boolean,
  method: string,
  context?: {
    orgId?: string
    userId?: string
    error?: Error
    [key: string]: unknown
  }
) {
  const level = success ? 'info' : 'warn'

  logger.log(level, 'Authentication Attempt', {
    auth: {
      method,
      success,
    },
    ...context,
    ...(context?.error && {
      error: {
        message: context.error.message,
        type: context.error.name,
      },
    }),
  })
}

/**
 * Log error with full context
 */
export function logError(
  error: Error,
  context?: {
    orgId?: string
    projectId?: string
    userId?: string
    operation?: string
    [key: string]: unknown
  }
) {
  logger.error('Application Error', {
    error: {
      message: redactPII(error.message),
      stack: error.stack,
      type: error.name,
    },
    ...context,
  })
}

/**
 * Initialize logging
 */
export function initializeLogging() {
  const isPlatform = process.env.NEXT_PUBLIC_PLATFORM === 'true'

  if (!isPlatform) {
    console.log('[Logging] Skipping Winston initialization - not in platform mode')
    return
  }

  // Create logs directory if it doesn't exist
  const fs = require('fs')
  const path = require('path')
  const logsDir = path.join(process.cwd(), 'logs')

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  console.log('[Logging] Winston structured logging initialized successfully')
  logger.info('Logger initialized', {
    log_level: process.env.LOG_LEVEL || 'info',
    environment: process.env.NODE_ENV || 'development',
  })
}

export default logger
