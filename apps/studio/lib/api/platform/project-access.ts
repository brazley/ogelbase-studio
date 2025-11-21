import { NextApiRequest, NextApiResponse } from 'next'
import { queryPlatformDatabase, PlatformProject } from './database'
import { apiAuthenticate, UserContext } from '../apiAuthenticate'

/**
 * Role hierarchy for permission checking
 * Higher numbers = more permissions
 */
const ROLE_HIERARCHY: Record<string, number> = {
  member: 1,
  admin: 2,
  owner: 3,
}

/**
 * Project access information
 */
export interface ProjectAccess {
  project: PlatformProject & {
    user_role: string
    access_type: 'direct' | 'via_org'
  }
  role: string
  accessType: 'direct' | 'via_org'
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  userId: string
  entityType: 'project' | 'organization' | 'user'
  entityId: string
  action: string
  changes?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Verifies that a user has access to a project either directly or via organization membership
 *
 * @param projectRef Project reference (slug/ref)
 * @param userId User ID to check access for
 * @param minimumRole Optional minimum role required (e.g., 'admin', 'owner')
 * @returns ProjectAccess object if user has access, null otherwise
 */
export async function verifyProjectAccess(
  projectRef: string,
  userId: string,
  minimumRole?: string
): Promise<ProjectAccess | null> {
  const { data, error } = await queryPlatformDatabase<
    PlatformProject & {
      user_role: string
      access_type: 'direct' | 'via_org'
    }
  >({
    query: `
      SELECT
        p.*,
        COALESCE(pm.role, om.role) as user_role,
        CASE
          WHEN pm.user_id IS NOT NULL THEN 'direct'
          WHEN om.user_id IS NOT NULL THEN 'via_org'
          ELSE NULL
        END as access_type
      FROM platform.projects p
      LEFT JOIN platform.project_members pm
        ON p.id = pm.project_id AND pm.user_id = $2
      LEFT JOIN platform.organization_members om
        ON p.organization_id = om.organization_id AND om.user_id = $2
      WHERE p.ref = $1
        AND (pm.user_id = $2 OR om.user_id = $2)
    `,
    parameters: [projectRef, userId],
  })

  if (error) {
    console.error('[verifyProjectAccess] Database error:', error)
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  const project = data[0]
  const userRole = project.user_role
  const accessType = project.access_type

  // Check if user has minimum required role
  if (minimumRole && !hasMinimumRole(userRole, minimumRole)) {
    return null
  }

  return {
    project,
    role: userRole,
    accessType,
  }
}

/**
 * Checks if a user role meets the minimum required role
 *
 * @param userRole The user's current role
 * @param minimumRole The minimum required role
 * @returns true if user has sufficient permissions
 */
export function hasMinimumRole(userRole: string, minimumRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 0
  const requiredLevel = ROLE_HIERARCHY[minimumRole] || 0
  return userLevel >= requiredLevel
}

/**
 * Middleware-style helper that authenticates user and verifies project access
 * Returns 401/403/404 errors automatically if access is denied
 *
 * @param req NextApiRequest
 * @param res NextApiResponse
 * @param minimumRole Optional minimum role required
 * @returns User context and project access if successful, null if access denied
 */
export async function authenticateAndVerifyProjectAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  minimumRole?: string
): Promise<{ user: UserContext; access: ProjectAccess } | null> {
  // 1. Authenticate user
  const userResult = await apiAuthenticate(req, res)

  if ('error' in userResult) {
    res.status(401).json({
      error: {
        message: userResult.error.message || 'Unauthorized',
      },
    })
    return null
  }

  const user = userResult as UserContext
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    res.status(400).json({
      error: {
        message: 'Project ref is required',
      },
    })
    return null
  }

  // 2. Verify project access
  const access = await verifyProjectAccess(ref, user.userId, minimumRole)

  if (!access) {
    // Check if project exists at all
    const { data: projectExists } = await queryPlatformDatabase({
      query: 'SELECT id FROM platform.projects WHERE ref = $1',
      parameters: [ref],
    })

    if (!projectExists || projectExists.length === 0) {
      res.status(404).json({
        error: {
          message: `Project with ref '${ref}' not found`,
        },
      })
      return null
    }

    // Project exists but user doesn't have access or insufficient role
    const roleMessage = minimumRole
      ? ` You need at least '${minimumRole}' role.`
      : ''

    res.status(403).json({
      error: {
        message: `Access denied. You do not have access to this project.${roleMessage}`,
      },
    })
    return null
  }

  return { user, access }
}

/**
 * Logs an audit event for project actions
 *
 * @param entry Audit log entry
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await queryPlatformDatabase({
      query: `
        INSERT INTO platform.audit_logs (
          user_id,
          entity_type,
          entity_id,
          action,
          changes,
          ip_address,
          user_agent,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      parameters: [
        entry.userId,
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.changes ? JSON.stringify(entry.changes) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
      ],
    })
  } catch (error) {
    // Log audit failures but don't block the operation
    console.error('[logAuditEvent] Failed to log audit event:', error)
  }
}

/**
 * Helper to extract IP address from request
 */
export function getClientIp(req: NextApiRequest): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    req.socket?.remoteAddress
  )
}

/**
 * Helper to extract user agent from request
 */
export function getUserAgent(req: NextApiRequest): string | undefined {
  return req.headers['user-agent']
}
