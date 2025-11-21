import { NextApiRequest } from 'next'
import { queryPlatformDatabase } from './database'

/**
 * Audit Event Types
 * Matches the CHECK constraint in the database schema
 */
export type AuditEntityType = 'project' | 'organization' | 'user' | 'addon' | 'billing'

/**
 * Common audit actions
 * Can be extended with more specific actions (e.g., 'addon.add', 'compute.update')
 */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'member.add'
  | 'member.remove'
  | 'member.role_change'
  | 'addon.add'
  | 'addon.remove'
  | 'addon.update'
  | 'compute.update'
  | 'disk.update'
  | 'billing.subscription_change'
  | 'billing.payment_method_add'
  | 'billing.payment_method_remove'
  | 'settings.update'
  | string // Allow custom action strings

/**
 * Parameters for logging an audit event
 */
export interface AuditEventParams {
  /** User ID performing the action */
  userId: string
  /** Type of entity affected */
  entityType: AuditEntityType
  /** ID of the affected entity */
  entityId: string
  /** Action performed */
  action: AuditAction
  /** Optional: Before/after state or detailed changes */
  changes?: Record<string, unknown> | null
  /** Optional: IP address of the request */
  ipAddress?: string | null
  /** Optional: User agent string */
  userAgent?: string | null
}

/**
 * Audit log entry as stored in the database
 */
export interface AuditLogEntry {
  id: string
  user_id: string
  entity_type: AuditEntityType
  entity_id: string
  action: string
  changes: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/**
 * Logs an audit event to the platform database
 *
 * @example
 * ```typescript
 * await logAuditEvent({
 *   userId: 'user-uuid',
 *   entityType: 'project',
 *   entityId: 'project-uuid',
 *   action: 'create',
 *   changes: { name: 'My Project', region: 'us-east-1' },
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...'
 * })
 * ```
 */
export async function logAuditEvent({
  userId,
  entityType,
  entityId,
  action,
  changes = null,
  ipAddress = null,
  userAgent = null,
}: AuditEventParams): Promise<{ success: boolean; auditId?: string; error?: Error }> {
  try {
    const { data, error } = await queryPlatformDatabase<{ id: string }>({
      query: `
        INSERT INTO platform.audit_logs (
          user_id,
          entity_type,
          entity_id,
          action,
          changes,
          ip_address,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
      parameters: [
        userId,
        entityType,
        entityId,
        action,
        changes ? JSON.stringify(changes) : null,
        ipAddress,
        userAgent,
      ],
    })

    if (error) {
      console.error('Failed to log audit event:', error)
      return { success: false, error }
    }

    return { success: true, auditId: data?.[0]?.id }
  } catch (error) {
    console.error('Unexpected error logging audit event:', error)
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

/**
 * Extracts IP address from Next.js request
 * Handles proxies and load balancers (x-forwarded-for, x-real-ip)
 */
export function extractIpAddress(req: NextApiRequest): string | null {
  // Check common proxy headers
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list, take the first one
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
    return ip.trim()
  }

  const realIp = req.headers['x-real-ip']
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp
  }

  // Fallback to socket address
  return req.socket.remoteAddress || null
}

/**
 * Extracts user agent from Next.js request
 */
export function extractUserAgent(req: NextApiRequest): string | null {
  const userAgent = req.headers['user-agent']
  return Array.isArray(userAgent) ? userAgent[0] : userAgent || null
}

/**
 * Helper to log audit event from API request
 * Automatically extracts IP and user agent
 *
 * @example
 * ```typescript
 * await logAuditEventFromRequest(req, {
 *   userId: req.user.userId,
 *   entityType: 'organization',
 *   entityId: orgId,
 *   action: 'create',
 *   changes: { name: 'New Org' }
 * })
 * ```
 */
export async function logAuditEventFromRequest(
  req: NextApiRequest,
  params: Omit<AuditEventParams, 'ipAddress' | 'userAgent'>
): Promise<{ success: boolean; auditId?: string; error?: Error }> {
  return logAuditEvent({
    ...params,
    ipAddress: extractIpAddress(req),
    userAgent: extractUserAgent(req),
  })
}

/**
 * Creates a change log object for updates
 * Compares before and after states
 *
 * @example
 * ```typescript
 * const changes = createChangeLog(
 *   { name: 'Old Name', plan: 'free' },
 *   { name: 'New Name', plan: 'pro' }
 * )
 * // Result: { name: { before: 'Old Name', after: 'New Name' }, plan: { before: 'free', after: 'pro' } }
 * ```
 */
export function createChangeLog(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {}

  // Find all keys that changed
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const beforeValue = before[key]
    const afterValue = after[key]

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = {
        before: beforeValue,
        after: afterValue,
      }
    }
  }

  return changes
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  entityType?: AuditEntityType
  entityId?: string
  action?: string
  userId?: string
  startDate?: string // ISO date string
  endDate?: string // ISO date string
  limit?: number
  offset?: number
}

/**
 * Query audit logs with filters
 *
 * @example
 * ```typescript
 * const { logs, total } = await queryAuditLogs({
 *   entityType: 'project',
 *   entityId: 'project-uuid',
 *   limit: 50
 * })
 * ```
 */
export async function queryAuditLogs(
  filters: AuditLogFilters = {}
): Promise<{ logs: AuditLogEntry[]; total: number; error?: Error }> {
  const {
    entityType,
    entityId,
    action,
    userId,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = filters

  // Build WHERE clauses dynamically
  const whereClauses: string[] = []
  const parameters: unknown[] = []
  let paramIndex = 1

  if (entityType) {
    whereClauses.push(`entity_type = $${paramIndex}`)
    parameters.push(entityType)
    paramIndex++
  }

  if (entityId) {
    whereClauses.push(`entity_id = $${paramIndex}`)
    parameters.push(entityId)
    paramIndex++
  }

  if (action) {
    whereClauses.push(`action = $${paramIndex}`)
    parameters.push(action)
    paramIndex++
  }

  if (userId) {
    whereClauses.push(`user_id = $${paramIndex}`)
    parameters.push(userId)
    paramIndex++
  }

  if (startDate) {
    whereClauses.push(`created_at >= $${paramIndex}`)
    parameters.push(startDate)
    paramIndex++
  }

  if (endDate) {
    whereClauses.push(`created_at <= $${paramIndex}`)
    parameters.push(endDate)
    paramIndex++
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  try {
    // Get total count
    const { data: countData, error: countError } = await queryPlatformDatabase<{ count: number }>({
      query: `
        SELECT COUNT(*) as count
        FROM platform.audit_logs
        ${whereClause}
      `,
      parameters,
    })

    if (countError) {
      console.error('Failed to get audit log count:', countError)
      return { logs: [], total: 0, error: countError }
    }

    const total = countData?.[0]?.count || 0

    // Get paginated logs
    const { data: logsData, error: logsError } = await queryPlatformDatabase<AuditLogEntry>({
      query: `
        SELECT
          id,
          user_id,
          entity_type,
          entity_id,
          action,
          changes,
          ip_address,
          user_agent,
          created_at
        FROM platform.audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1}
      `,
      parameters: [...parameters, limit, offset],
    })

    if (logsError) {
      console.error('Failed to query audit logs:', logsError)
      return { logs: [], total: 0, error: logsError }
    }

    return { logs: logsData || [], total }
  } catch (error) {
    console.error('Unexpected error querying audit logs:', error)
    return {
      logs: [],
      total: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}
