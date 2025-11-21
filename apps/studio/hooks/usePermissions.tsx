/**
 * React hooks for permission and role checking in components.
 *
 * This module provides convenient hooks for checking user permissions
 * and roles in React components, making it easy to conditionally render
 * UI elements based on user access levels.
 *
 * @module usePermissions
 */

import React, { useMemo } from 'react'
import {
  hasPermission,
  hasMinimumRole,
  hasAnyPermission,
  hasAllPermissions,
  getRolePermissions,
  getRoleLevel,
  isHigherRole,
  Permission,
  Role,
} from 'lib/api/platform/rbac'

/**
 * Hook return type with permission checking functions.
 */
export interface UsePermissionsReturn {
  // Core permission checks
  hasPermission: (permission: Permission) => boolean
  hasAnyPermission: (permissions: Permission[]) => boolean
  hasAllPermissions: (permissions: Permission[]) => boolean
  hasMinimumRole: (role: Role) => boolean
  isHigherThan: (role: Role) => boolean

  // Convenience shortcuts - Organization
  canViewOrg: boolean
  canEditOrg: boolean
  canDeleteOrg: boolean
  canViewBilling: boolean
  canManageBilling: boolean

  // Convenience shortcuts - Projects
  canViewProject: boolean
  canCreateProject: boolean
  canEditProject: boolean
  canDeleteProject: boolean
  canViewCompute: boolean
  canEditCompute: boolean
  canViewAddons: boolean
  canManageAddons: boolean
  canViewDisk: boolean
  canEditDisk: boolean

  // Convenience shortcuts - Members
  canViewMembers: boolean
  canInviteMembers: boolean
  canEditMembers: boolean
  canRemoveMembers: boolean

  // Convenience shortcuts - Settings
  canViewSettings: boolean
  canEditSettings: boolean

  // Convenience shortcuts - Database
  canViewDatabase: boolean
  canExecuteQueries: boolean
  canRunMigrations: boolean

  // Convenience shortcuts - API
  canViewApiKeys: boolean
  canRotateApiKeys: boolean

  // Role information
  role: string
  roleLevel: number
  permissions: Permission[]
  isOwner: boolean
  isAdmin: boolean
  isDeveloper: boolean
  isReadOnly: boolean
}

/**
 * Custom hook for checking user permissions and roles.
 *
 * @param userRole - Optional user role. If not provided, defaults to 'read_only'
 * @returns Object with permission checking functions and convenience flags
 *
 * @example
 * ```typescript
 * function ProjectSettings() {
 *   const { canEditProject, canDeleteProject, role } = usePermissions('admin')
 *
 *   return (
 *     <div>
 *       {canEditProject && <EditButton />}
 *       {canDeleteProject && <DeleteButton />}
 *       <p>Current role: {role}</p>
 *     </div>
 *   )
 * }
 * ```
 */
export function usePermissions(userRole?: string): UsePermissionsReturn {
  const role = userRole || Role.READ_ONLY

  // Memoize all permission checks to avoid recalculation on every render
  return useMemo(() => {
    const permissions = getRolePermissions(role)
    const roleLevel = getRoleLevel(role)

    return {
      // Core permission checks
      hasPermission: (permission: Permission) => hasPermission(role, permission),
      hasAnyPermission: (perms: Permission[]) => hasAnyPermission(role, perms),
      hasAllPermissions: (perms: Permission[]) => hasAllPermissions(role, perms),
      hasMinimumRole: (requiredRole: Role) => hasMinimumRole(role, requiredRole),
      isHigherThan: (otherRole: Role) => isHigherRole(role, otherRole),

      // Organization permissions
      canViewOrg: hasPermission(role, Permission.ORG_VIEW),
      canEditOrg: hasPermission(role, Permission.ORG_EDIT),
      canDeleteOrg: hasPermission(role, Permission.ORG_DELETE),
      canViewBilling: hasPermission(role, Permission.ORG_BILLING_VIEW),
      canManageBilling: hasPermission(role, Permission.ORG_BILLING_MANAGE),

      // Project permissions
      canViewProject: hasPermission(role, Permission.PROJECT_VIEW),
      canCreateProject: hasPermission(role, Permission.PROJECT_CREATE),
      canEditProject: hasPermission(role, Permission.PROJECT_EDIT),
      canDeleteProject: hasPermission(role, Permission.PROJECT_DELETE),
      canViewCompute: hasPermission(role, Permission.PROJECT_COMPUTE_VIEW),
      canEditCompute: hasPermission(role, Permission.PROJECT_COMPUTE_EDIT),
      canViewAddons: hasPermission(role, Permission.PROJECT_ADDONS_VIEW),
      canManageAddons: hasPermission(role, Permission.PROJECT_ADDONS_MANAGE),
      canViewDisk: hasPermission(role, Permission.PROJECT_DISK_VIEW),
      canEditDisk: hasPermission(role, Permission.PROJECT_DISK_EDIT),

      // Member permissions
      canViewMembers: hasPermission(role, Permission.MEMBER_VIEW),
      canInviteMembers: hasPermission(role, Permission.MEMBER_INVITE),
      canEditMembers: hasPermission(role, Permission.MEMBER_EDIT),
      canRemoveMembers: hasPermission(role, Permission.MEMBER_REMOVE),

      // Settings permissions
      canViewSettings: hasPermission(role, Permission.SETTINGS_VIEW),
      canEditSettings: hasPermission(role, Permission.SETTINGS_EDIT),

      // Database permissions
      canViewDatabase: hasPermission(role, Permission.DATABASE_VIEW),
      canExecuteQueries: hasPermission(role, Permission.DATABASE_EXECUTE),
      canRunMigrations: hasPermission(role, Permission.DATABASE_MIGRATE),

      // API permissions
      canViewApiKeys: hasPermission(role, Permission.API_KEY_VIEW),
      canRotateApiKeys: hasPermission(role, Permission.API_KEY_ROTATE),

      // Role information
      role,
      roleLevel,
      permissions,
      isOwner: role === Role.OWNER,
      isAdmin: role === Role.ADMIN,
      isDeveloper: role === Role.DEVELOPER,
      isReadOnly: role === Role.READ_ONLY,
    }
  }, [role])
}

/**
 * Hook for checking permissions with a specific organization context.
 * Retrieves the user's role from the organization membership.
 *
 * @param organizationSlug - Organization slug to check permissions for
 * @returns Permission checking object
 *
 * @example
 * ```typescript
 * function OrganizationSettings() {
 *   const { canEditOrg, role } = useOrganizationPermissions('my-org')
 *
 *   if (!canEditOrg) {
 *     return <div>You don't have permission to edit this organization</div>
 *   }
 *
 *   return <OrganizationForm />
 * }
 * ```
 */
export function useOrganizationPermissions(organizationSlug: string): UsePermissionsReturn {
  // In a real implementation, this would fetch the user's role from the organization
  // For now, we'll use a placeholder that defaults to read_only
  // You would integrate this with your organization query hooks

  // Example integration:
  // const { data: membership } = useOrganizationMembership(organizationSlug)
  // return usePermissions(membership?.role)

  return usePermissions(Role.READ_ONLY)
}

/**
 * Hook for checking permissions with a specific project context.
 * Retrieves the user's role from the project access.
 *
 * @param projectRef - Project reference to check permissions for
 * @returns Permission checking object
 *
 * @example
 * ```typescript
 * function ProjectSettings() {
 *   const { canEditProject, canDeleteProject } = useProjectPermissions('my-project')
 *
 *   return (
 *     <div>
 *       {canEditProject && <EditProjectButton />}
 *       {canDeleteProject && <DeleteProjectButton />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useProjectPermissions(projectRef: string): UsePermissionsReturn {
  // In a real implementation, this would fetch the user's role from the project
  // For now, we'll use a placeholder that defaults to read_only
  // You would integrate this with your project query hooks

  // Example integration:
  // const { data: access } = useProjectAccess(projectRef)
  // return usePermissions(access?.role)

  return usePermissions(Role.READ_ONLY)
}

/**
 * Higher-order component for protecting routes based on permissions.
 *
 * @param Component - Component to wrap
 * @param requiredPermission - Permission required to access the component
 * @returns Wrapped component that checks permissions
 *
 * @example
 * ```typescript
 * const ProtectedSettings = withPermission(
 *   OrganizationSettings,
 *   Permission.ORG_EDIT
 * )
 * ```
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  requiredPermission: Permission
) {
  return function PermissionProtectedComponent(props: P & { userRole?: string }) {
    const { userRole, ...restProps } = props
    const { hasPermission: checkPermission } = usePermissions(userRole)

    if (!checkPermission(requiredPermission)) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-gray-600">
              You don't have permission to access this resource.
            </p>
          </div>
        </div>
      )
    }

    return <Component {...(restProps as P)} />
  }
}

/**
 * Higher-order component for protecting routes based on minimum role.
 *
 * @param Component - Component to wrap
 * @param requiredRole - Minimum role required to access the component
 * @returns Wrapped component that checks role
 *
 * @example
 * ```typescript
 * const AdminOnlySettings = withRole(
 *   OrganizationSettings,
 *   Role.ADMIN
 * )
 * ```
 */
export function withRole<P extends object>(
  Component: React.ComponentType<P>,
  requiredRole: Role
) {
  return function RoleProtectedComponent(props: P & { userRole?: string }) {
    const { userRole, ...restProps } = props
    const { hasMinimumRole: checkRole } = usePermissions(userRole)

    if (!checkRole(requiredRole)) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Insufficient Privileges</h2>
            <p className="text-gray-600">
              This resource requires {requiredRole} role or higher.
            </p>
          </div>
        </div>
      )
    }

    return <Component {...(restProps as P)} />
  }
}
