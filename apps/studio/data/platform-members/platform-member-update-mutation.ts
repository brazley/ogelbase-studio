import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { platformMemberKeys } from './keys'

export type UpdatePlatformMemberVariables = {
  slug: string
  member_id: string
  role: 'owner' | 'admin' | 'developer' | 'read_only'
}

export async function updatePlatformMemberRole({
  slug,
  member_id,
  role,
}: UpdatePlatformMemberVariables) {
  const response = await fetch(`/api/platform/organizations/${slug}/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id, role }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to update member role')
  }

  return response.json()
}

type UpdatePlatformMemberData = Awaited<ReturnType<typeof updatePlatformMemberRole>>

export const useUpdatePlatformMemberMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    UpdatePlatformMemberData,
    ResponseError,
    UpdatePlatformMemberVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    UpdatePlatformMemberData,
    ResponseError,
    UpdatePlatformMemberVariables
  >({
    mutationFn: updatePlatformMemberRole,
    async onSuccess(data, variables, context) {
      const { slug } = variables
      await queryClient.invalidateQueries({ queryKey: platformMemberKeys.list(slug) })
      toast.success('Member role updated successfully')
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update member role: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
