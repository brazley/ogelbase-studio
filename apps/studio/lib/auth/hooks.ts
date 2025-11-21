/**
 * Production Auth Hooks
 * Custom hooks for authentication functionality
 */

import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useProductionAuth } from './context'
import type { User } from './types'

/**
 * Hook that requires authentication and redirects if not authenticated
 */
export function useRequireAuth() {
  const { user, loading } = useProductionAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = router.asPath
      router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
    }
  }, [user, loading, router])

  return { user, loading }
}

/**
 * Hook that redirects authenticated users away from auth pages
 */
export function useRedirectIfAuthenticated(redirectTo = '/') {
  const { user, loading } = useProductionAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      // Check for returnTo parameter
      const { returnTo: returnToParam } = router.query
      const destination = typeof returnToParam === 'string' ? returnToParam : redirectTo

      router.push(destination)
    }
  }, [user, loading, router, redirectTo])

  return { user, loading }
}

/**
 * Hook to get current user with type safety
 */
export function useCurrentUser(): User | null {
  const { user } = useProductionAuth()
  return user
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useProductionAuth()
  return isAuthenticated
}

/**
 * Hook to get auth loading state
 */
export function useAuthLoading(): boolean {
  const { loading } = useProductionAuth()
  return loading
}
