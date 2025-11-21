import type { NextApiResponse } from 'next'
import type { ApiV2Request, AuditLogEntry } from './types'

/**
 * Audit log storage interface
 */
interface AuditLogStore {
  log(entry: AuditLogEntry): Promise<void> | void
  query?(filters: Partial<AuditLogEntry>): Promise<AuditLogEntry[]> | AuditLogEntry[]
}

/**
 * In-memory audit log store (for development/testing)
 * In production, this should write to a database or logging service
 */
class InMemoryAuditLogStore implements AuditLogStore {
  private logs: AuditLogEntry[] = []
  private maxLogs = 10000 // Keep only the most recent logs

  log(entry: AuditLogEntry): void {
    this.logs.push(entry)

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Audit]', {
        timestamp: entry.timestamp,
        method: entry.method,
        path: entry.path,
        status: entry.statusCode,
        duration: `${entry.duration}ms`,
        userId: entry.userId || 'anonymous',
      })
    }
  }

  query(filters: Partial<AuditLogEntry>): AuditLogEntry[] {
    return this.logs.filter((entry) => {
      return Object.entries(filters).every(([key, value]) => {
        return entry[key as keyof AuditLogEntry] === value
      })
    })
  }

  clear(): void {
    this.logs = []
  }

  getAll(): AuditLogEntry[] {
    return [...this.logs]
  }

  getRecent(limit = 100): AuditLogEntry[] {
    return this.logs.slice(-limit)
  }
}

/**
 * Console audit log store (for production without database)
 */
class ConsoleAuditLogStore implements AuditLogStore {
  log(entry: AuditLogEntry): void {
    // Structured logging format for production log aggregators
    const logEntry = {
      level: 'info',
      msg: 'API Request',
      ...entry,
    }

    console.log(JSON.stringify(logEntry))
  }
}

/**
 * Global audit log store
 */
let auditLogStore: AuditLogStore

// Initialize appropriate store based on environment
if (process.env.NODE_ENV === 'production') {
  auditLogStore = new ConsoleAuditLogStore()
} else {
  auditLogStore = new InMemoryAuditLogStore()
}

/**
 * Audit logging middleware
 *
 * Logs all API requests with metadata including:
 * - User ID and organization ID
 * - Request method and path
 * - Response status code
 * - Request duration
 * - User agent and IP address
 *
 * The middleware wraps the response finish event to capture the final status.
 */
export function auditLogMiddleware(
  req: ApiV2Request,
  res: NextApiResponse,
  next: () => void
): void {
  // Record start time
  req.startTime = Date.now()

  // Set up response finish handler
  const originalEnd = res.end
  let finished = false

  // Override res.end to capture when response is sent
  res.end = function (this: NextApiResponse, chunk?: unknown, ...args: unknown[]): NextApiResponse {
    if (!finished) {
      finished = true

      // Calculate duration
      const duration = Date.now() - (req.startTime || Date.now())

      // Build audit log entry
      const entry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        userId: getUserId(req),
        orgId: getOrgId(req),
        method: req.method || 'UNKNOWN',
        path: req.url || '',
        statusCode: res.statusCode,
        duration,
        userAgent: getUserAgent(req),
        ip: getClientIp(req),
      }

      // Add error code if response is an error
      if (res.statusCode >= 400) {
        entry.errorCode = getErrorCode(chunk)
      }

      // Log the entry
      logAudit(entry)
    }

    // Call original end method
    return originalEnd.apply(this, [chunk, ...args] as any)
  } as typeof res.end

  next()
}

/**
 * Log an audit entry
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await auditLogStore.log(entry)
  } catch (error) {
    // Don't let audit logging failures break the request
    console.error('Failed to log audit entry:', error)
  }
}

/**
 * Query audit logs (for testing/debugging)
 */
export function queryAuditLogs(filters: Partial<AuditLogEntry>): AuditLogEntry[] {
  if (auditLogStore instanceof InMemoryAuditLogStore) {
    return auditLogStore.query(filters)
  }
  return []
}

/**
 * Clear audit logs (for testing)
 */
export function clearAuditLogs(): void {
  if (auditLogStore instanceof InMemoryAuditLogStore) {
    auditLogStore.clear()
  }
}

/**
 * Get all audit logs (for testing)
 */
export function getAllAuditLogs(): AuditLogEntry[] {
  if (auditLogStore instanceof InMemoryAuditLogStore) {
    return auditLogStore.getAll()
  }
  return []
}

/**
 * Get recent audit logs (for testing)
 */
export function getRecentAuditLogs(limit = 100): AuditLogEntry[] {
  if (auditLogStore instanceof InMemoryAuditLogStore) {
    return auditLogStore.getRecent(limit)
  }
  return []
}

/**
 * Set a custom audit log store
 */
export function setAuditLogStore(store: AuditLogStore): void {
  auditLogStore = store
}

/**
 * Helper functions
 */

function getUserId(req: ApiV2Request): string | undefined {
  return req.user?.sub || req.user?.id
}

function getOrgId(req: ApiV2Request): string | undefined {
  // Try to extract org ID from user metadata or query params
  return (
    req.user?.user_metadata?.orgId ||
    (typeof req.query.orgId === 'string' ? req.query.orgId : undefined)
  )
}

function getUserAgent(req: ApiV2Request): string | undefined {
  const userAgent = req.headers['user-agent']
  return Array.isArray(userAgent) ? userAgent[0] : userAgent
}

function getClientIp(req: ApiV2Request): string {
  // Check various headers for real IP
  const forwarded = req.headers['x-forwarded-for']
  const realIp = req.headers['x-real-ip']

  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded
    return ips.split(',')[0].trim()
  }

  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp
  }

  return req.socket?.remoteAddress || 'unknown'
}

function getErrorCode(chunk: unknown): string | undefined {
  try {
    if (typeof chunk === 'string') {
      const parsed = JSON.parse(chunk)
      return parsed.errorCode
    } else if (chunk && typeof chunk === 'object' && 'errorCode' in chunk) {
      return (chunk as { errorCode?: string }).errorCode
    }
  } catch {
    // Ignore parsing errors
  }
  return undefined
}
