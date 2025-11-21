import { useQuery } from '@tanstack/react-query'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { platformMemberKeys } from './keys'

export interface PlatformMember {
  id: string
  user_id: string
  organization_id: string
  role: 'owner' | 'admin' | 'developer' | 'read_only'
  invited_at: string
  accepted_at: string | null
  email: string
  first_name: string | null
  last_name: string | null
  username: string | null
}

export type PlatformMembersVariables = {
  slug?: string
}

export async function getPlatformMembers(
  { slug }: PlatformMembersVariables,
  signal?: AbortSignal
): Promise<PlatformMember[]> {
  if (!slug) throw new Error('Organization slug is required')

  const response = await fetch(`/api/platform/organizations/${slug}/members`, { signal })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to fetch members')
  }

  return response.json()
}

export type PlatformMembersData = Awaited<ReturnType<typeof getPlatformMembers>>
export type PlatformMembersError = ResponseError

export const usePlatformMembersQuery = <TData = PlatformMembersData>(
  { slug }: PlatformMembersVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<PlatformMembersData, PlatformMembersError, TData> = {}
) =>
  useQuery<PlatformMembersData, PlatformMembersError, TData>({
    queryKey: platformMemberKeys.list(slug),
    queryFn: ({ signal }) => getPlatformMembers({ slug }, signal),
    enabled: enabled && typeof slug !== 'undefined',
    ...options,
  })
