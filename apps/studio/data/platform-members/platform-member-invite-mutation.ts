import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { platformMemberKeys } from './keys'

export type InvitePlatformMemberVariables = {
  slug: string
  email: string
  role: 'owner' | 'admin' | 'developer' | 'read_only'
}

export async function invitePlatformMember({
  slug,
  email,
  role,
}: InvitePlatformMemberVariables) {
  const response = await fetch(`/api/platform/organizations/${slug}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to invite member')
  }

  return response.json()
}

type InvitePlatformMemberData = Awaited<ReturnType<typeof invitePlatformMember>>

export const useInvitePlatformMemberMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    InvitePlatformMemberData,
    ResponseError,
    InvitePlatformMemberVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    InvitePlatformMemberData,
    ResponseError,
    InvitePlatformMemberVariables
  >({
    mutationFn: invitePlatformMember,
    async onSuccess(data, variables, context) {
      const { slug } = variables
      await queryClient.invalidateQueries({ queryKey: platformMemberKeys.list(slug) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to invite member: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
