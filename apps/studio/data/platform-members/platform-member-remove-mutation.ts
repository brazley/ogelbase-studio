import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { platformMemberKeys } from './keys'

export type RemovePlatformMemberVariables = {
  slug: string
  member_id: string
}

export async function removePlatformMember({ slug, member_id }: RemovePlatformMemberVariables) {
  const response = await fetch(`/api/platform/organizations/${slug}/members`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to remove member')
  }

  return response.json()
}

type RemovePlatformMemberData = Awaited<ReturnType<typeof removePlatformMember>>

export const useRemovePlatformMemberMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    RemovePlatformMemberData,
    ResponseError,
    RemovePlatformMemberVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    RemovePlatformMemberData,
    ResponseError,
    RemovePlatformMemberVariables
  >({
    mutationFn: removePlatformMember,
    async onSuccess(data, variables, context) {
      const { slug } = variables
      await queryClient.invalidateQueries({ queryKey: platformMemberKeys.list(slug) })
      toast.success('Member removed successfully')
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to remove member: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
