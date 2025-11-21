/**
 * Navigation Guards
 * Route-level access control utilities
 */

import { Permission, Role, hasPermission, hasMinimumRole } from 'lib/api/platform/rbac'

/**
 * User type with organization and project memberships
 */
interface UserWithAccess {
  id: string
  email: string
  role?: string
  organizations?: Array<{
    id: string
    slug: string
    role: string
  }>
  projects?: Array<{
    id: string
    ref: string
    role: string
  }>
}

/**
 * Check if user can access a specific organization
 *
 * @param user - Authenticated user
 * @param orgSlug - Organization slug to check
 * @returns true if user has access to the organization
 *
 * @example
 * ```typescript
 * if (!canAccessOrganization(user, 'my-org')) {
 *   router.push('/organizations')
 * }
 * ```
 */
export function canAccessOrganization(user: UserWithAccess | null, orgSlug: string): boolean {
  if (!user) return false
  return user.organizations?.some(org => org.slug === orgSlug) ?? false
}

/**
 * Check if user can access a specific project
 *
 * @param user - Authenticated user
 * @param projectRef - Project reference to check
 * @returns true if user has access to the project
 *
 * @example
 * ```typescript
 * if (!canAccessProject(user, 'project-ref')) {
 *   router.push('/projects')
 * }
 * ```
 */
export function canAccessProject(user: UserWithAccess | null, projectRef: string): boolean {
  if (!user) return false
  return user.projects?.some(proj => proj.ref === projectRef) ?? false
}

/**
 * Get user's role for a specific organization
 *
 * @param user - Authenticated user
 * @param orgSlug - Organization slug
 * @returns User's role in the organization, or null if not a member
 */
export function getOrgRole(user: UserWithAccess | null, orgSlug: string): string | null {
  if (!user) return null
  const org = user.organizations?.find(o => o.slug === orgSlug)
  return org?.role ?? null
}

/**
 * Get user's role for a specific project
 *
 * @param user - Authenticated user
 * @param projectRef - Project reference
 * @returns User's role in the project, or null if not a member
 */
export function getProjectRole(user: UserWithAccess | null, projectRef: string): string | null {
  if (!user) return null
  const project = user.projects?.find(p => p.ref === projectRef)
  return project?.role ?? null
}

/**
 * Check if user has permission for an organization
 *
 * @param user - Authenticated user
 * @param orgSlug - Organization slug
 * @param permission - Permission to check
 * @returns true if user has the permission
 *
 * @example
 * ```typescript
 * if (!hasOrgPermission(user, 'my-org', Permission.ORG_EDIT)) {
 *   return <AccessDenied />
 * }
 * ```
 */
export function hasOrgPermission(
  user: UserWithAccess | null,
  orgSlug: string,
  permission: Permission
): boolean {
  const role = getOrgRole(user, orgSlug)
  if (!role) return false
  return hasPermission(role, permission)
}

/**
 * Check if user has permission for a project
 *
 * @param user - Authenticated user
 * @param projectRef - Project reference
 * @param permission - Permission to check
 * @returns true if user has the permission
 */
export function hasProjectPermission(
  user: UserWithAccess | null,
  projectRef: string,
  permission: Permission
): boolean {
  const role = getProjectRole(user, projectRef)
  if (!role) return false
  return hasPermission(role, permission)
}

/**
 * Check if user has minimum role for an organization
 *
 * @param user - Authenticated user
 * @param orgSlug - Organization slug
 * @param minimumRole - Minimum required role
 * @returns true if user meets the minimum role requirement
 */
export function hasMinimumOrgRole(
  user: UserWithAccess | null,
  orgSlug: string,
  minimumRole: Role
): boolean {
  const role = getOrgRole(user, orgSlug)
  if (!role) return false
  return hasMinimumRole(role, minimumRole)
}

/**
 * Check if user has minimum role for a project
 *
 * @param user - Authenticated user
 * @param projectRef - Project reference
 * @param minimumRole - Minimum required role
 * @returns true if user meets the minimum role requirement
 */
export function hasMinimumProjectRole(
  user: UserWithAccess | null,
  projectRef: string,
  minimumRole: Role
): boolean {
  const role = getProjectRole(user, projectRef)
  if (!role) return false
  return hasMinimumRole(role, minimumRole)
}

/**
 * Filter organizations by minimum role
 *
 * @param user - Authenticated user
 * @param minimumRole - Minimum required role
 * @returns Array of organizations where user has minimum role
 *
 * @example
 * ```typescript
 * // Get all organizations where user is admin or owner
 * const adminOrgs = filterOrgsByRole(user, Role.ADMIN)
 * ```
 */
export function filterOrgsByRole(
  user: UserWithAccess | null,
  minimumRole: Role
): Array<{ id: string; slug: string; role: string }> {
  if (!user || !user.organizations) return []

  return user.organizations.filter(org => hasMinimumRole(org.role, minimumRole))
}

/**
 * Filter projects by minimum role
 *
 * @param user - Authenticated user
 * @param minimumRole - Minimum required role
 * @returns Array of projects where user has minimum role
 */
export function filterProjectsByRole(
  user: UserWithAccess | null,
  minimumRole: Role
): Array<{ id: string; ref: string; role: string }> {
  if (!user || !user.projects) return []

  return user.projects.filter(proj => hasMinimumRole(proj.role, minimumRole))
}

/**
 * Get redirect URL for unauthorized access
 *
 * @param type - Type of resource (organization or project)
 * @returns Redirect URL
 */
export function getUnauthorizedRedirect(type: 'organization' | 'project'): string {
  return type === 'organization' ? '/organizations' : '/projects'
}

/**
 * Navigation guard configuration for routes
 */
export interface RouteGuard {
  /** Require authentication */
  requireAuth?: boolean
  /** Minimum role required */
  minimumRole?: Role
  /** Required permission */
  requiredPermission?: Permission
  /** Redirect path if unauthorized */
  redirectTo?: string
}

/**
 * Check if user can access a route based on guard configuration
 *
 * @param user - Authenticated user
 * @param guard - Route guard configuration
 * @param context - Additional context (orgSlug or projectRef)
 * @returns Object with allowed flag and redirect path
 *
 * @example
 * ```typescript
 * const result = canAccessRoute(user, {
 *   requireAuth: true,
 *   minimumRole: Role.ADMIN,
 * }, { orgSlug: 'my-org' })
 *
 * if (!result.allowed) {
 *   router.push(result.redirectTo)
 * }
 * ```
 */
export function canAccessRoute(
  user: UserWithAccess | null,
  guard: RouteGuard,
  context?: { orgSlug?: string; projectRef?: string }
): { allowed: boolean; redirectTo: string } {
  const defaultRedirect = guard.redirectTo || '/sign-in'

  // Check authentication
  if (guard.requireAuth && !user) {
    return { allowed: false, redirectTo: defaultRedirect }
  }

  // Check minimum role for organization
  if (guard.minimumRole && context?.orgSlug) {
    const role = getOrgRole(user, context.orgSlug)
    if (!role || !hasMinimumRole(role, guard.minimumRole)) {
      return { allowed: false, redirectTo: getUnauthorizedRedirect('organization') }
    }
  }

  // Check minimum role for project
  if (guard.minimumRole && context?.projectRef) {
    const role = getProjectRole(user, context.projectRef)
    if (!role || !hasMinimumRole(role, guard.minimumRole)) {
      return { allowed: false, redirectTo: getUnauthorizedRedirect('project') }
    }
  }

  // Check required permission for organization
  if (guard.requiredPermission && context?.orgSlug) {
    if (!hasOrgPermission(user, context.orgSlug, guard.requiredPermission)) {
      return { allowed: false, redirectTo: getUnauthorizedRedirect('organization') }
    }
  }

  // Check required permission for project
  if (guard.requiredPermission && context?.projectRef) {
    if (!hasProjectPermission(user, context.projectRef, guard.requiredPermission)) {
      return { allowed: false, redirectTo: getUnauthorizedRedirect('project') }
    }
  }

  return { allowed: true, redirectTo: '' }
}
