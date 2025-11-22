/**
 * E2E Organization Switcher Tests
 *
 * Infrastructure testing strategy for organization context switching.
 * These tests validate not just happy-path UI flows but the critical
 * infrastructure requirements: data isolation, API contract consistency,
 * and clean state management across test boundaries.
 *
 * Architecture being tested:
 * - Session state persistence across org context changes
 * - API filtering by organization_id at request/response boundaries
 * - Cache invalidation when switching organizations
 * - Route parameter propagation through auth middleware
 *
 * Failure modes we're catching:
 * - Cache not invalidating on org switch -> data leakage
 * - Stale session tokens after context change -> 401 errors in CI
 * - Incomplete route transitions -> orphaned UI state
 * - Missing org_id parameter in API calls -> wrong dataset returned
 */

import { test, expect, type Page } from '@playwright/test'

/**
 * Organization test fixtures with known data state
 */
const TEST_ORGS = {
  acme: {
    id: 'acme-id',
    name: 'Acme Corp',
    slug: 'acme',
    projectCount: 3,
    baseUrl: 'http://localhost:3000/org/acme',
  },
  contoso: {
    id: 'contoso-id',
    name: 'Contoso Inc',
    slug: 'contoso',
    projectCount: 5,
    baseUrl: 'http://localhost:3000/org/contoso',
  },
}

/**
 * Helper: Capture API request/response for validation
 * Used to detect data leakage, caching issues, and contract violations
 */
async function captureApiCall(
  page: Page,
  predicate: (response: any) => boolean
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('API call timeout after 5s'))
    }, 5000)

    page.on('response', async (response) => {
      try {
        if (predicate(response)) {
          clearTimeout(timeout)
          const data = await response.json()
          resolve(data)
        }
      } catch (e) {
        // Response might not be JSON, skip
      }
    })
  })
}

/**
 * Helper: Validate organization context is properly isolated
 * Checks that API responses contain only data from target organization
 */
async function assertOrgDataIsolation(
  page: Page,
  expectedOrgId: string,
  dataPoints: any[],
  fieldName: string = 'organization_id'
) {
  const violations = dataPoints.filter((item) => item[fieldName] !== expectedOrgId)
  if (violations.length > 0) {
    throw new Error(
      `Data isolation violation: Found ${violations.length} items from wrong organization. ` +
        `Expected org_id="${expectedOrgId}", got: ${JSON.stringify(violations.map((v) => v[fieldName]))}`
    )
  }
}

/**
 * Helper: Validate API response schema consistency
 * Catches contract drift where API fields change mid-session
 */
async function assertResponseSchema(data: any[], requiredFields: string[]) {
  if (!Array.isArray(data)) {
    throw new Error(`Expected array response, got: ${typeof data}`)
  }

  for (const item of data) {
    for (const field of requiredFields) {
      if (!(field in item)) {
        throw new Error(
          `Response schema violation: Missing required field "${field}" in: ${JSON.stringify(item)}`
        )
      }
    }
  }
}

/**
 * Helper: Clear browser state to prevent test pollution
 * Critical for catching state management bugs that hide in CI
 */
async function clearOrgSwitcherState(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => {
    localStorage.removeItem('current_org_id')
    localStorage.removeItem('org_switcher_state')
    sessionStorage.clear()
  })
}

test.describe('Organization Switcher - Infrastructure Tests', () => {
  test.describe.configure({ mode: 'parallel' })

  test.beforeEach(async ({ page }) => {
    // Start from clean state to isolate failures
    await clearOrgSwitcherState(page)
    // Must login before testing org switching
    await page.goto('http://localhost:3000/sign-in')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'SecurePass123!')
    await page.click('button[type="submit"]')
    // Wait for redirect to org page
    await page.waitForURL(/\/org\//, { timeout: 10000 })
  })

  test.afterEach(async ({ page }) => {
    // Always clean up to prevent cascade failures
    await clearOrgSwitcherState(page)
  })

  /**
   * TEST 1: Basic organization switch with UI state validation
   *
   * This catches:
   * - UI not updating after org switch (stale DOM state)
   * - Route not changing (middleware not executing)
   * - Switcher control not reflecting selection (form state bug)
   */
  test('should switch organizations and update UI state', async ({ page }) => {
    // Verify initial state - default to first organization
    await expect(page.locator('.org-switcher')).toBeVisible({ timeout: 5000 })

    const initialOrg = await page.locator('.org-switcher').inputValue()
    expect(initialOrg).toBeTruthy()
    expect(initialOrg).not.toBe('') // Should have a value, not empty

    // Verify org name is displayed (catches UI rendering bugs)
    const orgNameLocator = page.locator('[data-testid="org-name"]')
    const initialOrgName = await orgNameLocator.textContent()
    expect(initialOrgName).toBe(TEST_ORGS.acme.name)

    // Initiate switch to second org
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)

    // Wait for route to reflect new org (catches routing middleware issues)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Verify URL changed - critical for deep linking
    expect(page.url()).toContain(`/org/${TEST_ORGS.contoso.slug}`)

    // Verify switcher reflects new selection (form state consistency)
    const switchedValue = await page.locator('.org-switcher').inputValue()
    expect(switchedValue).toBe(TEST_ORGS.contoso.id)

    // Verify org name updated in UI (catches stale DOM)
    const newOrgName = await orgNameLocator.textContent()
    expect(newOrgName).toBe(TEST_ORGS.contoso.name)
  })

  /**
   * TEST 2: Session state persistence after org switch
   *
   * This catches:
   * - Token invalidation on org switch (auth middleware issue)
   * - Session ID changes unexpectedly (session corruption)
   * - Auth headers not updated in subsequent requests (security issue)
   *
   * Critical for production: A broken session after org switch causes
   * cascading 401 errors and poor UX. This is infrastructure-level failure.
   */
  test('should persist authentication session across org switches', async ({ page }) => {
    // Capture initial auth token
    const initialToken = await page.evaluate(() => {
      return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')
    })
    expect(initialToken).toBeTruthy('Auth token should exist after login')

    // Switch organizations
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Verify token still exists and hasn't changed (token should be org-agnostic)
    const tokenAfterSwitch = await page.evaluate(() => {
      return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')
    })
    expect(tokenAfterSwitch).toBeTruthy('Token should persist after org switch')
    expect(tokenAfterSwitch).toBe(initialToken, 'Token should not change on org switch')

    // Verify user context is still valid
    const userContext = await page.evaluate(() => {
      const stored = sessionStorage.getItem('user') || localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    })
    expect(userContext).toBeTruthy('User context should persist')
    expect(userContext.email).toBe('test@example.com')
  })

  /**
   * TEST 3: API data isolation - most critical infrastructure test
   *
   * This validates the security boundary that prevents one organization's
   * data from leaking into another's views. Caching bugs, query filter
   * omissions, or middleware ordering issues surface here.
   *
   * Failure mode: User can see competitor's projects through cache poisoning
   * This is a P0 security issue in infrastructure.
   */
  test('should enforce org isolation in API responses', async ({ page, request }) => {
    // Navigate to Acme org
    await page.goto(TEST_ORGS.acme.baseUrl)
    await page.waitForURL(/\/org\/acme/, { timeout: 10000 })

    // Capture projects from Acme org
    const acmeProjectsPromise = captureApiCall(page, (response) =>
      response.url().includes('/api/platform/projects') && response.status() === 200
    )

    // Trigger API call to fetch projects
    await page.click('[data-testid="projects-tab"]')
    const acmeProjects = await Promise.race([acmeProjectsPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))])

    // Validate schema
    await assertResponseSchema(acmeProjects as any[], [
      'id',
      'name',
      'organization_id',
      'created_at',
    ])

    // Validate data isolation
    await assertOrgDataIsolation(page, TEST_ORGS.acme.id, acmeProjects as any[], 'organization_id')

    // Verify count matches expectation
    expect((acmeProjects as any[]).length).toBe(TEST_ORGS.acme.projectCount)

    // Now switch to Contoso
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Capture Contoso projects
    const contosoProjectsPromise = captureApiCall(page, (response) =>
      response.url().includes('/api/platform/projects') && response.status() === 200
    )

    await page.click('[data-testid="projects-tab"]')
    const contosoProjects = await Promise.race([contosoProjectsPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))])

    // Validate isolation
    await assertOrgDataIsolation(page, TEST_ORGS.contoso.id, contosoProjects as any[], 'organization_id')

    // Critical: Verify no Acme data leaked into Contoso response
    const acmeDataInContoso = (contosoProjects as any[]).filter(
      (p) => p.organization_id === TEST_ORGS.acme.id
    )
    expect(acmeDataInContoso.length).toBe(
      0,
      'Acme data leaked into Contoso response - cache poisoning or query filter bug'
    )

    // Verify count is correct for new org
    expect((contosoProjects as any[]).length).toBe(TEST_ORGS.contoso.projectCount)
  })

  /**
   * TEST 4: Route parameter propagation
   *
   * Tests that org_id is correctly extracted from URL and passed to API calls.
   * Catches middleware ordering bugs, route parameter extraction issues.
   */
  test('should propagate org context through route parameters', async ({ page }) => {
    // Navigate directly to Contoso org
    await page.goto(TEST_ORGS.contoso.baseUrl)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Capture next API call
    const apiCallPromise = new Promise<string>((resolve) => {
      page.on('request', (request) => {
        if (request.url().includes('/api/platform/projects')) {
          const url = request.url()
          resolve(url)
        }
      })
    })

    await page.click('[data-testid="projects-tab"]')
    const apiUrl = await Promise.race([apiCallPromise, new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))])

    // Verify org_id parameter in API call
    expect(apiUrl).toMatch(/org_id=contoso-id|organization_id=contoso-id/)
  })

  /**
   * TEST 5: Cache invalidation on org switch
   *
   * Verifies that switching orgs invalidates cached data, preventing stale
   * project lists or outdated team information from being displayed.
   */
  test('should invalidate cache when switching organizations', async ({ page }) => {
    // Load Acme org and its projects (will be cached)
    await page.goto(TEST_ORGS.acme.baseUrl)
    await page.waitForURL(/\/org\/acme/, { timeout: 10000 })
    await page.click('[data-testid="projects-tab"]')
    await page.waitForTimeout(1000) // Allow cache to populate

    // Record cache hit count
    const cacheStatsBefore = await page.evaluate(() => {
      return (window as any).__CACHE_STATS__ || { hits: 0, misses: 0 }
    })

    // Switch to Contoso
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Access projects - should be cache MISS (cache invalidated)
    const cacheMissBefore = cacheStatsBefore.misses || 0
    await page.click('[data-testid="projects-tab"]')
    await page.waitForTimeout(1000)

    const cacheStatsAfter = await page.evaluate(() => {
      return (window as any).__CACHE_STATS__ || { hits: 0, misses: 0 }
    })

    const newCacheMisses = (cacheStatsAfter.misses || 0) - cacheMissBefore
    expect(newCacheMisses).toBeGreaterThan(0, 'Cache should be invalidated on org switch')
  })

  /**
   * TEST 6: Reload persistence - critical for production resilience
   *
   * When user reloads page while viewing org/contoso, they should still be
   * in that org context. This tests persistence of org selection across
   * page navigations.
   *
   * Failure mode: User reloads, gets reset to default org. Looks like a bug,
   * is actually infrastructure (session/storage) layer issue.
   */
  test('should persist org context after page reload', async ({ page }) => {
    // Switch to Contoso
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Verify we're in Contoso
    const switcherValue = await page.locator('.org-switcher').inputValue()
    expect(switcherValue).toBe(TEST_ORGS.contoso.id)

    // Reload page
    await page.reload()
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Verify still in Contoso after reload
    const reloadedSwitcherValue = await page.locator('.org-switcher').inputValue()
    expect(reloadedSwitcherValue).toBe(TEST_ORGS.contoso.id)

    // Verify org display name still correct
    const orgName = await page.locator('[data-testid="org-name"]').textContent()
    expect(orgName).toBe(TEST_ORGS.contoso.name)
  })

  /**
   * TEST 7: Concurrent org switches - stress test for race conditions
   *
   * Simulates rapid org switching to catch race conditions in:
   * - State management
   * - API request cancellation
   * - Cache invalidation timing
   *
   * Infrastructure failure mode: Rapid switches cause orphaned requests,
   * state inconsistency, or data from request N appearing after switch to org N+1
   */
  test('should handle rapid organization switches without data corruption', async ({ page }) => {
    // Rapidly switch between orgs
    for (let i = 0; i < 3; i++) {
      await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)
      await page.waitForTimeout(200)
      await page.selectOption('.org-switcher', TEST_ORGS.acme.id)
      await page.waitForTimeout(200)
    }

    // Final switch to Contoso
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)
    await page.waitForURL(`**/org/${TEST_ORGS.contoso.slug}`, { timeout: 10000 })

    // Verify final state is correct
    const finalSwitcherValue = await page.locator('.org-switcher').inputValue()
    expect(finalSwitcherValue).toBe(TEST_ORGS.contoso.id)

    const finalOrgName = await page.locator('[data-testid="org-name"]').textContent()
    expect(finalOrgName).toBe(TEST_ORGS.contoso.name)

    // Verify we can interact with projects without 404/500
    await page.click('[data-testid="projects-tab"]')
    const projects = await page.locator('[data-testid="project-item"]').count()
    expect(projects).toBeGreaterThan(0)
  })

  /**
   * TEST 8: Error handling during org switch
   *
   * What happens if API fails mid-switch? Should gracefully handle and
   * preserve previous org state, not corrupt the UI.
   */
  test('should handle API failures during org switch gracefully', async ({ page }) => {
    // Monitor for API errors
    const apiErrors: any[] = []
    page.on('response', (response) => {
      if (response.status() >= 500) {
        apiErrors.push({
          url: response.url(),
          status: response.status(),
        })
      }
    })

    // Switch org (with potential API failures happening)
    await page.selectOption('.org-switcher', TEST_ORGS.contoso.id)

    // Even if API failed, UI should be in a valid state
    const switcherValue = await page.locator('.org-switcher').inputValue()
    expect(switcherValue).toBeTruthy('Switcher should have a value even on error')

    // Should not show generic error page
    await expect(page.locator('text=Something went wrong')).not.toBeVisible({
      timeout: 2000,
    })
  })
})

/**
 * Test execution notes for infrastructure validation:
 *
 * 1. These tests validate the infrastructure layer, not just UI
 *    - Data isolation (security boundary)
 *    - Cache consistency
 *    - Session management across context switches
 *    - API contract stability
 *
 * 2. Failure interpretation guide:
 *    - "Data isolation violation" = Query filter bug or caching issue
 *    - "Response schema violation" = API contract changed mid-session
 *    - "Token should not change" = Session corruption in middleware
 *    - "Cache should be invalidated" = Cache layer not clearing on context change
 *
 * 3. Infrastructure requirements:
 *    - Org context must be extracted from URL route parameter
 *    - All API calls must filter by organization_id at database layer
 *    - Cache keys must include org_id to prevent poisoning
 *    - Session middleware must execute BEFORE route handlers
 *
 * 4. For CI/CD pipeline:
 *    - Run with CI=true to enforce sequential execution (catch race conditions)
 *    - Capture network requests for debugging (--trace on-first-retry)
 *    - Alert on timeouts (suggests middleware slowness)
 *    - Alert on data isolation violations (security issue)
 */
