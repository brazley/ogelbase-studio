/**
 * PermissionGuard Component
 * Conditionally renders children based on user permissions
 */

import { ReactNode } from 'react'
import { useProductionAuth } from 'lib/auth/context'
import { usePermissions } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'

interface PermissionGuardProps {
  children: ReactNode
  /** Permission required to render children */
  permission?: Permission
  /** Minimum role required to render children */
  minimumRole?: Role
  /** Fallback content when permission is denied */
  fallback?: ReactNode
}

/**
 * Guard component that shows/hides UI based on permissions
 *
 * @example
 * ```tsx
 * <PermissionGuard permission={Permission.ORG_EDIT}>
 *   <Button>Edit Organization</Button>
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({
  children,
  permission,
  minimumRole,
  fallback = null,
}: PermissionGuardProps) {
  const { user } = useProductionAuth()
  const userRole = (user as any)?.role
  const { hasPermission, hasMinimumRole: checkMinimumRole } = usePermissions(userRole)

  // If no permission or role specified, render children
  if (!permission && !minimumRole) {
    return <>{children}</>
  }

  // Check permission requirement
  if (permission && (!userRole || !hasPermission(permission))) {
    return <>{fallback}</>
  }

  // Check minimum role requirement
  if (minimumRole && (!userRole || !checkMinimumRole(minimumRole))) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Convenience wrapper for hiding UI elements without permission
 * Simplified version of PermissionGuard with no fallback
 *
 * @example
 * ```tsx
 * <Can permission={Permission.ORG_DELETE}>
 *   <Button variant="destructive">Delete Organization</Button>
 * </Can>
 * ```
 */
export function Can({
  children,
  permission,
  minimumRole,
}: {
  children: ReactNode
  permission?: Permission
  minimumRole?: Role
}) {
  return (
    <PermissionGuard permission={permission} minimumRole={minimumRole}>
      {children}
    </PermissionGuard>
  )
}

/**
 * Inverse of Can - shows content when user does NOT have permission
 * Useful for showing upgrade prompts or alternative actions
 *
 * @example
 * ```tsx
 * <Cannot permission={Permission.ORG_BILLING_MANAGE}>
 *   <UpgradePrompt />
 * </Cannot>
 * ```
 */
export function Cannot({
  children,
  permission,
  minimumRole,
}: {
  children: ReactNode
  permission?: Permission
  minimumRole?: Role
}) {
  const { user } = useProductionAuth()
  const userRole = (user as any)?.role
  const { hasPermission, hasMinimumRole: checkMinimumRole } = usePermissions(userRole)

  // If no permission or role specified, don't render
  if (!permission && !minimumRole) {
    return null
  }

  // Check permission requirement (inverse)
  if (permission && userRole && hasPermission(permission)) {
    return null
  }

  // Check minimum role requirement (inverse)
  if (minimumRole && userRole && checkMinimumRole(minimumRole)) {
    return null
  }

  return <>{children}</>
}

/**
 * Component for disabling interactive elements based on permissions
 * Useful for buttons, inputs, and other interactive components
 *
 * @example
 * ```tsx
 * <DisableIfNoPermission permission={Permission.PROJECT_EDIT}>
 *   {(disabled) => (
 *     <Button disabled={disabled}>Save Changes</Button>
 *   )}
 * </DisableIfNoPermission>
 * ```
 */
export function DisableIfNoPermission({
  children,
  permission,
  minimumRole,
}: {
  children: (disabled: boolean) => ReactNode
  permission?: Permission
  minimumRole?: Role
}) {
  const { user } = useProductionAuth()
  const userRole = (user as any)?.role
  const { hasPermission, hasMinimumRole: checkMinimumRole } = usePermissions(userRole)

  let disabled = false

  if (permission && (!userRole || !hasPermission(permission))) {
    disabled = true
  }

  if (minimumRole && (!userRole || !checkMinimumRole(minimumRole))) {
    disabled = true
  }

  return <>{children(disabled)}</>
}
