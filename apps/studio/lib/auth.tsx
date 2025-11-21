import { useQueryClient } from '@tanstack/react-query'
import { PropsWithChildren, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

import {
  AuthProvider as AuthProviderInternal,
  clearLocalStorage,
  gotrueClient,
  posthogClient,
  useAuthError,
} from 'common'
import { useAiAssistantStateSnapshot } from 'state/ai-assistant-state'
import { GOTRUE_ERRORS, IS_PLATFORM } from './constants'

const AuthErrorToaster = ({ children }: PropsWithChildren) => {
  const error = useAuthError()

  useEffect(() => {
    if (error !== null) {
      // Check for unverified GitHub users after a GitHub sign in
      if (error.message === GOTRUE_ERRORS.UNVERIFIED_GITHUB_USER) {
        toast.error(
          'Please verify your email on GitHub first, then reach out to us at support@supabase.io to log into the dashboard'
        )
        return
      }

      toast.error(error.message)
    }
  }, [error])

  return children
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  // Check if mock auth is enabled for platform mode
  const enableMockAuth = IS_PLATFORM && process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true'

  // For platform mode with mock auth enabled, use alwaysLoggedIn to bypass real auth
  // The AuthProviderInternal will use its DEFAULT_SESSION when alwaysLoggedIn is true
  const shouldBypassAuth = !IS_PLATFORM || enableMockAuth

  return (
    <AuthProviderInternal alwaysLoggedIn={shouldBypassAuth}>
      <AuthErrorToaster>{children}</AuthErrorToaster>
    </AuthProviderInternal>
  )
}

export function useSignOut() {
  const queryClient = useQueryClient()
  const { clearStorage: clearAssistantStorage } = useAiAssistantStateSnapshot()

  return useCallback(async () => {
    const result = await gotrueClient.signOut()
    posthogClient.reset()
    clearLocalStorage()
    // Clear Assistant IndexedDB
    await clearAssistantStorage()
    queryClient.clear()

    return result
  }, [queryClient, clearAssistantStorage])
}
