import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import {
  queryAuditLogs,
  AuditLogFilters,
  AuditEntityType,
  AuditLogEntry,
} from 'lib/api/platform/audit'

/**
 * Audit Logs API
 *
 * GET /api/platform/audit/logs
 * Returns audit logs with optional filters
 *
 * Query Parameters:
 * - entity_type: Filter by entity type (project, organization, user, addon, billing)
 * - entity_id: Filter by specific entity ID
 * - action: Filter by action performed
 * - user_id: Filter by user who performed the action
 * - start_date: Filter logs from this date (ISO format)
 * - end_date: Filter logs until this date (ISO format)
 * - limit: Maximum number of results (default: 50, max: 1000)
 * - offset: Number of results to skip for pagination (default: 0)
 *
 * Example:
 * GET /api/platform/audit/logs?entity_type=project&entity_id=abc123&limit=100
 */

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetLogs(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({
        data: null,
        error: { message: `Method ${method} Not Allowed` },
      })
  }
}

/**
 * GET /api/platform/audit/logs
 * Query audit logs with filters
 */
async function handleGetLogs(req: AuthenticatedRequest, res: NextApiResponse) {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.error('Platform database not configured: DATABASE_URL environment variable is missing')
    return res.status(503).json({
      error: 'Platform database not configured',
      code: 'DB_NOT_CONFIGURED',
      message: 'DATABASE_URL environment variable is missing. Please configure the platform database.',
    })
  }

  // Extract and validate query parameters
  const {
    entity_type,
    entity_id,
    action,
    user_id,
    start_date,
    end_date,
    limit = '50',
    offset = '0',
  } = req.query

  // Validate entity_type if provided
  if (entity_type && typeof entity_type === 'string') {
    const validEntityTypes: AuditEntityType[] = [
      'project',
      'organization',
      'user',
      'addon',
      'billing',
    ]
    if (!validEntityTypes.includes(entity_type as AuditEntityType)) {
      return res.status(400).json({
        error: 'Invalid entity_type',
        code: 'INVALID_ENTITY_TYPE',
        message: `entity_type must be one of: ${validEntityTypes.join(', ')}`,
      })
    }
  }

  // Parse and validate limit
  const parsedLimit = parseInt(Array.isArray(limit) ? limit[0] : limit, 10)
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
    return res.status(400).json({
      error: 'Invalid limit',
      code: 'INVALID_LIMIT',
      message: 'limit must be a number between 1 and 1000',
    })
  }

  // Parse and validate offset
  const parsedOffset = parseInt(Array.isArray(offset) ? offset[0] : offset, 10)
  if (isNaN(parsedOffset) || parsedOffset < 0) {
    return res.status(400).json({
      error: 'Invalid offset',
      code: 'INVALID_OFFSET',
      message: 'offset must be a non-negative number',
    })
  }

  // Validate date formats if provided
  if (start_date && typeof start_date === 'string') {
    const startDateObj = new Date(start_date)
    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({
        error: 'Invalid start_date',
        code: 'INVALID_START_DATE',
        message: 'start_date must be a valid ISO date string',
      })
    }
  }

  if (end_date && typeof end_date === 'string') {
    const endDateObj = new Date(end_date)
    if (isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        error: 'Invalid end_date',
        code: 'INVALID_END_DATE',
        message: 'end_date must be a valid ISO date string',
      })
    }
  }

  // Build filters object
  const filters: AuditLogFilters = {
    limit: parsedLimit,
    offset: parsedOffset,
  }

  if (entity_type && typeof entity_type === 'string') {
    filters.entityType = entity_type as AuditEntityType
  }

  if (entity_id && typeof entity_id === 'string') {
    filters.entityId = entity_id
  }

  if (action && typeof action === 'string') {
    filters.action = action
  }

  if (user_id && typeof user_id === 'string') {
    filters.userId = user_id
  }

  if (start_date && typeof start_date === 'string') {
    filters.startDate = start_date
  }

  if (end_date && typeof end_date === 'string') {
    filters.endDate = end_date
  }

  // Query audit logs
  const { logs, total, error } = await queryAuditLogs(filters)

  if (error) {
    console.error('Failed to query audit logs:', error)
    return res.status(500).json({
      error: 'Failed to query audit logs',
      code: 'QUERY_FAILED',
      message: 'Database query failed. Please check server logs for details.',
      details: error.message,
    })
  }

  // Return response with pagination metadata
  return res.status(200).json({
    data: logs,
    pagination: {
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      hasMore: parsedOffset + parsedLimit < total,
    },
  })
}
