import { NextApiResponse } from 'next'
import { queryPlatformDatabase } from './database'
import { UserContext } from '../apiAuthenticate'

/**
 * Organization membership with role information
 */
export interface OrganizationMembership {
  role: 'owner' | 'admin' | 'developer' | 'read_only'
  user_id: string
  org_id: string
  org_name: string
  org_slug: string
}

/**
 * Role hierarchy for permission checks
 */
const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  developer: 2,
  read_only: 1,
} as const

/**
 * Verify user has access to organization and return membership details
 * Returns 403 if user is not a member, 404 if org doesn't exist
 */
export async function verifyOrgAccess(
  slug: string,
  user: UserContext,
  res: NextApiResponse
): Promise<OrganizationMembership | null> {
  const { data: membership, error } = await queryPlatformDatabase<{
    role: 'owner' | 'admin' | 'developer' | 'read_only'
    user_id: string
    org_id: string
    org_name: string
    org_slug: string
  }>({
    query: `
      SELECT
        om.role,
        om.user_id,
        o.id as org_id,
        o.name as org_name,
        o.slug as org_slug
      FROM platform.organization_members om
      INNER JOIN platform.organizations o ON om.organization_id = o.id
      WHERE o.slug = $1 AND om.user_id = $2
    `,
    parameters: [slug, user.userId],
  })

  if (error) {
    console.error(`[verifyOrgAccess] Database error for org ${slug}, user ${user.userId}:`, error)
    res.status(500).json({
      error: 'Database error',
      message: 'Failed to verify organization access',
    })
    return null
  }

  // No membership found - could be org doesn't exist OR user isn't a member
  if (!membership || membership.length === 0) {
    // Check if org exists
    const { data: orgExists } = await queryPlatformDatabase({
      query: 'SELECT id FROM platform.organizations WHERE slug = $1',
      parameters: [slug],
    })

    if (!orgExists || orgExists.length === 0) {
      res.status(404).json({
        error: 'Not found',
        message: `Organization with slug '${slug}' not found`,
      })
    } else {
      // Org exists but user is not a member - log for security monitoring
      console.warn(
        `[verifyOrgAccess] Access denied: User ${user.userId} (${user.email}) attempted to access org ${slug}`
      )
      res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this organization',
      })
    }
    return null
  }

  return membership[0]
}

/**
 * Check if user has minimum required role
 */
export function hasMinimumRole(
  userRole: OrganizationMembership['role'],
  requiredRole: OrganizationMembership['role']
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Verify user has minimum required role, return 403 if not
 */
export function requireRole(
  membership: OrganizationMembership,
  requiredRole: OrganizationMembership['role'],
  res: NextApiResponse
): boolean {
  if (!hasMinimumRole(membership.role, requiredRole)) {
    console.warn(
      `[requireRole] Insufficient permissions: User ${membership.user_id} has role ${membership.role}, requires ${requiredRole} for org ${membership.org_slug}`
    )
    res.status(403).json({
      error: 'Insufficient permissions',
      message: `This action requires ${requiredRole} role or higher`,
    })
    return false
  }
  return true
}
