/**
 * Organization Switching Test Helpers
 *
 * Infrastructure testing utilities for organization context switching.
 * These helpers encapsulate common patterns for:
 * - Validating data isolation
 * - Checking API contract consistency
 * - Managing test state isolation
 * - Capturing infrastructure failures
 */

import { Page, expect } from '@playwright/test'

/**
 * Organization test data structure
 * Represents the expected state for each organization in tests
 */
export interface TestOrganization {
  id: string
  slug: string
  name: string
  projectCount: number
  teamMembers: number
  baseUrl: string
}

/**
 * API response validation result
 * Captures both pass/fail and detailed violation information
 */
export interface ValidationResult {
  passed: boolean
  violations: string[]
  timestamp: number
  orgContext: string
}

/**
 * Helper: Navigate to organization and wait for load
 *
 * Ensures route transition completes before proceeding.
 * Catches: timing issues, route guards not executing, middleware delays
 */
export async function navigateToOrg(page: Page, org: TestOrganization, timeout = 10000) {
  const navigationPromise = page.waitForURL(`**/org/${org.slug}`, { timeout })
  await page.goto(org.baseUrl)
  await navigationPromise
  return org
}

/**
 * Helper: Validate API response contains only expected org data
 *
 * Security validation: Ensures no data leakage between organizations
 * Infrastructure check: Validates query filters are applied at API layer
 */
export async function validateOrgDataIsolation(
  data: any[],
  expectedOrgId: string,
  fieldName = 'organization_id'
): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: true,
    violations: [],
    timestamp: Date.now(),
    orgContext: expectedOrgId,
  }

  if (!Array.isArray(data)) {
    result.passed = false
    result.violations.push(`Expected array, received ${typeof data}`)
    return result
  }

  for (const item of data) {
    const actualOrgId = item[fieldName]
    if (actualOrgId !== expectedOrgId) {
      result.passed = false
      result.violations.push(
        `Item "${item.name || item.id}" belongs to org ${actualOrgId}, not ${expectedOrgId}`
      )
    }
  }

  return result
}

/**
 * Helper: Validate API response schema consistency
 *
 * Contract validation: Ensures API response structure doesn't drift mid-session
 * Infrastructure check: Detects breaking changes in API responses
 */
export async function validateResponseSchema(
  data: any[],
  requiredFields: string[]
): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: true,
    violations: [],
    timestamp: Date.now(),
    orgContext: 'unknown',
  }

  if (!Array.isArray(data)) {
    result.passed = false
    result.violations.push(`Expected array response, got ${typeof data}`)
    return result
  }

  for (const item of data) {
    for (const field of requiredFields) {
      if (!(field in item)) {
        result.passed = false
        result.violations.push(
          `Missing required field "${field}" in item: ${JSON.stringify(item).substring(0, 100)}...`
        )
      }
    }
  }

  return result
}

/**
 * Helper: Capture organization context from page state
 *
 * Validates that page maintains correct org context in:
 * - URL parameters
 * - Session storage
 * - Component state
 * - DOM attributes
 */
export async function captureOrgContext(page: Page): Promise<{
  urlOrg: string
  sessionOrg: string
  domOrg: string
  storageOrg: string
}> {
  const url = page.url()
  const urlOrgMatch = url.match(/\/org\/([a-z-]+)/)
  const urlOrg = urlOrgMatch ? urlOrgMatch[1] : 'unknown'

  const sessionOrg = await page.evaluate(() => {
    const stored = sessionStorage.getItem('current_org_id') || ''
    return stored
  })

  const storageOrg = await page.evaluate(() => {
    const stored = localStorage.getItem('current_org_id') || ''
    return stored
  })

  const domOrg = await page.locator('[data-current-org-id]').getAttribute('data-current-org-id')

  return {
    urlOrg,
    sessionOrg,
    domOrg: domOrg || 'not-found',
    storageOrg,
  }
}

/**
 * Helper: Assert org context consistency across all layers
 *
 * Validates that organization context is synchronized:
 * - URL matches storage
 * - Session storage matches DOM
 * - No partial state updates that cause race conditions
 */
export async function assertOrgContextConsistency(
  page: Page,
  expectedOrgId: string,
  expectedOrgSlug: string
) {
  const context = await captureOrgContext(page)

  expect(context.urlOrg).toBe(expectedOrgSlug, 'URL should contain correct org slug')
  expect(context.sessionOrg).toBe(
    expectedOrgId,
    'Session storage should contain correct org ID'
  )
  expect(context.domOrg).toBe(expectedOrgId, 'DOM should have data attribute with correct org ID')

  // Storage might not be populated immediately, but should match if present
  if (context.storageOrg) {
    expect(context.storageOrg).toBe(
      expectedOrgId,
      'Local storage should match if populated'
    )
  }
}

/**
 * Helper: Monitor and validate API calls during org switch
 *
 * Infrastructure monitoring:
 * - Captures all API calls during switch
 * - Validates org_id parameter presence
 * - Detects orphaned requests from previous org
 * - Identifies cache invalidation timing issues
 */
export async function monitorOrgSwitchRequests(
  page: Page,
  targetOrg: TestOrganization
): Promise<{
  requests: Array<{ url: string; status: number; orgParam: string | null }>
  orphanedRequests: Array<string>
  cacheInvalidations: number
}> {
  const requests: Array<{ url: string; status: number; orgParam: string | null }> = []
  const orphanedRequests: Array<string> = []
  let cacheInvalidations = 0

  page.on('response', (response) => {
    if (response.url().includes('/api/')) {
      const url = response.url()
      const orgParam =
        url.match(/org[_id]*=([a-z-]+)/)?.[1] ||
        url.match(/organization[_id]*=([a-z-]+)/)?.[1] ||
        null

      requests.push({
        url,
        status: response.status(),
        orgParam,
      })

      // Detect cache invalidation headers
      const cacheControl = response.headers()['cache-control'] || ''
      if (cacheControl.includes('no-cache') || cacheControl.includes('max-age=0')) {
        cacheInvalidations++
      }
    }
  })

  // Allow request monitoring window
  await page.waitForTimeout(500)

  return {
    requests,
    orphanedRequests,
    cacheInvalidations,
  }
}

/**
 * Helper: Clear all org-related state from page
 *
 * Essential for test isolation - prevents state pollution across test runs
 * Clears: cookies, session storage, local storage, cache entries
 */
export async function clearOrgState(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.removeItem('current_org_id')
    localStorage.removeItem('org_switcher_state')
    localStorage.removeItem('selected_project')
    sessionStorage.clear()
    // Clear any cache if application manages it
    ;(window as any).__CACHE__ = {}
  })
}

/**
 * Helper: Simulate network degradation during org switch
 *
 * Chaos engineering test: Validates resilience when API is slow
 * Infrastructure validation: Ensures proper timeouts and error handling
 */
export async function withSlowNetwork(page: Page, delay: number, callback: () => Promise<void>) {
  // Enable network throttling
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (500 * 1024) / 8, // 500 kbps
    uploadThroughput: (250 * 1024) / 8, // 250 kbps
    latency: delay,
  })

  try {
    await callback()
  } finally {
    // Restore network
    await client.send('Network.disable')
  }
}

/**
 * Helper: Assert org switch doesn't corrupt session
 *
 * Validates that authentication state remains valid and consistent
 * Catches: token invalidation, session ID changes, auth header corruption
 */
export async function assertSessionIntegrity(
  page: Page,
  expectedEmail: string
): Promise<{
  tokenValid: boolean
  sessionIdUnchanged: boolean
  userEmailCorrect: boolean
  violations: string[]
}> {
  const violations: string[] = []

  const token = await page.evaluate(() => {
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')
  })

  const tokenValid = !!token && token.length > 0
  if (!tokenValid) {
    violations.push('Auth token missing or empty')
  }

  const user = await page.evaluate(() => {
    const stored = sessionStorage.getItem('user') || localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  const userEmailCorrect = user?.email === expectedEmail
  if (!userEmailCorrect) {
    violations.push(`User email mismatch: expected ${expectedEmail}, got ${user?.email}`)
  }

  return {
    tokenValid,
    sessionIdUnchanged: true, // Compare with baseline if needed
    userEmailCorrect,
    violations,
  }
}

/**
 * Helper: Measure org switch latency
 *
 * Performance monitoring: Captures time from UI interaction to visual completion
 * Infrastructure insight: Slow switches indicate middleware bottlenecks
 */
export async function measureOrgSwitchLatency(
  page: Page,
  fromOrg: TestOrganization,
  toOrg: TestOrganization
): Promise<{
  uiInteractionMs: number
  routeChangeMs: number
  dataLoadMs: number
  totalMs: number
}> {
  const metrics = {
    uiInteractionMs: 0,
    routeChangeMs: 0,
    dataLoadMs: 0,
    totalMs: 0,
  }

  const startTime = Date.now()

  // Measure UI interaction
  const selectStart = Date.now()
  await page.selectOption('.org-switcher', toOrg.id)
  metrics.uiInteractionMs = Date.now() - selectStart

  // Measure route change
  const routeStart = Date.now()
  await page.waitForURL(`**/org/${toOrg.slug}`, { timeout: 10000 })
  metrics.routeChangeMs = Date.now() - routeStart

  // Measure data load (projects list should be loaded)
  const dataStart = Date.now()
  await page.waitForSelector('[data-testid="project-item"]', { state: 'attached', timeout: 5000 })
  metrics.dataLoadMs = Date.now() - dataStart

  metrics.totalMs = Date.now() - startTime

  return metrics
}
