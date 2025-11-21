/**
 * AuthGuard Component
 * Protects routes that require authentication, roles, and permissions
 */

import { useRouter } from 'next/router'
import { ReactNode, useEffect } from 'react'
import { useProductionAuth } from 'lib/auth/context'
import { usePermissions } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'
import { Loader2 } from 'lucide-react'
import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_ } from 'ui'

interface AuthGuardProps {
  children: ReactNode
  /** Require authentication (default: true) */
  requireAuth?: boolean
  /** Minimum role required to access this route */
  minimumRole?: Role
  /** Specific permission required to access this route */
  requiredPermission?: Permission
  /** Custom fallback component for unauthorized access */
  fallback?: ReactNode
  /** Redirect path for unauthenticated users */
  redirectTo?: string
}

export function AuthGuard({
  children,
  requireAuth = true,
  minimumRole,
  requiredPermission,
  fallback,
  redirectTo = '/sign-in',
}: AuthGuardProps) {
  const { user, loading } = useProductionAuth()
  const router = useRouter()

  // Get user role for permission checks
  const userRole = (user as any)?.role
  const { hasPermission, hasMinimumRole: checkMinimumRole } = usePermissions(userRole)

  useEffect(() => {
    if (!loading && requireAuth && !user) {
      // Store current path for redirect after login
      const returnTo = router.asPath
      const redirectPath = `${redirectTo}?returnTo=${encodeURIComponent(returnTo)}`
      router.push(redirectPath)
    }
  }, [user, loading, requireAuth, router, redirectTo])

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-foreground-light" />
      </div>
    )
  }

  // Check authentication
  if (requireAuth && !user) {
    return null
  }

  // Check minimum role requirement
  if (minimumRole && user) {
    if (!userRole || !checkMinimumRole(minimumRole)) {
      if (fallback) return <>{fallback}</>

      return (
        <div className="flex items-center justify-center min-h-screen p-8">
          <Alert_Shadcn_ variant="warning">
            <AlertTitle_Shadcn_>Access Denied</AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_>
              You need {minimumRole} role or higher to access this page.
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </div>
      )
    }
  }

  // Check specific permission requirement
  if (requiredPermission && user) {
    if (!userRole || !hasPermission(requiredPermission)) {
      if (fallback) return <>{fallback}</>

      return (
        <div className="flex items-center justify-center min-h-screen p-8">
          <Alert_Shadcn_ variant="warning">
            <AlertTitle_Shadcn_>Access Denied</AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_>
              You don't have the required permission to access this page.
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </div>
      )
    }
  }

  return <>{children}</>
}
