/**
 * Organization Switcher Component
 * Simple dropdown for switching between user's organizations
 *
 * Architecture:
 * - Uses existing useOrganizationsQuery for fetching orgs
 * - Uses useSelectedOrganizationQuery for current selection
 * - Calls POST /api/auth/set-active-org to persist choice
 * - Handles router navigation to new org context
 *
 * Test integration:
 * - .org-switcher class for E2E test selectors
 * - [data-testid="org-name"] for org display verification
 * - Standard HTML select for straightforward interaction
 */

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { useState } from 'react'

import { useProductionAuth } from 'lib/auth/context'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import ShimmeringLoader from 'components/ui/ShimmeringLoader'

export function OrganizationSwitcher() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session } = useProductionAuth()
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch user's organizations
  const { data: organizations, isLoading: isLoadingOrgs } = useOrganizationsQuery()

  // Get currently selected organization
  const { data: selectedOrg } = useSelectedOrganizationQuery()

  // If we don't have orgs data yet or no session, don't render
  if (isLoadingOrgs || !session) {
    return <ShimmeringLoader className="w-[90px]" />
  }

  // If user has no organizations, don't render switcher
  if (!organizations || organizations.length === 0) {
    return null
  }

  // If there's only one organization, don't need a switcher
  if (organizations.length === 1) {
    return null
  }

  const handleSwitch = async (orgId: string) => {
    // Prevent switching to same org or when already switching
    if (orgId === selectedOrg?.id || switching) return

    setSwitching(true)
    setError(null)

    try {
      // Call backend to persist organization choice
      const response = await fetch('/api/auth/set-active-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ organizationId: orgId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to switch organization')
      }

      // Invalidate organization queries to force refresh
      queryClient.invalidateQueries({ queryKey: ['organizations'] })

      // Navigate to the new organization context
      const selectedOrgData = organizations.find((org) => org.id === orgId)
      if (selectedOrgData) {
        // If we're currently in an org route, replace the slug with the new one
        const currentPath = router.pathname
        if (currentPath.includes('[slug]')) {
          const newPath = currentPath.replace('[slug]', selectedOrgData.slug)
          await router.push(newPath)
        } else {
          // Navigate to org home
          await router.push(`/org/${selectedOrgData.slug}`)
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch organization'
      setError(errorMessage)
      console.error('[OrganizationSwitcher] Switch failed:', err)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {error && (
        <div className="text-xs text-red-500" role="alert">
          {error}
        </div>
      )}
      <select
        value={selectedOrg?.id || ''}
        onChange={(e) => handleSwitch(e.target.value)}
        disabled={switching || !selectedOrg}
        className="org-switcher px-3 py-2 text-sm border rounded bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="org-switcher"
        aria-label="Switch organization"
      >
        {!selectedOrg && <option value="">Select an organization...</option>}
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {selectedOrg && (
        <div className="text-xs text-foreground-muted" data-testid="org-name">
          {selectedOrg.name}
        </div>
      )}
    </div>
  )
}
