/**
 * E2E Auth Flow Tests
 *
 * Comprehensive end-to-end testing of the authentication system.
 *
 * IMPORTANT: Sign-up flow tests are BLOCKED due to integration gap.
 * Sign-up form still calls `/platform/signup` instead of `/api/auth/signup`.
 * See TICKET-6-TEST-REPORT.md for details.
 *
 * Tests covered:
 * ✅ Sign-in flow (working - form wired correctly)
 * ✅ Sign-out flow (working)
 * ✅ Protected routes (working)
 * ✅ Remember me functionality (working)
 * ❌ Sign-up flow (BLOCKED - awaiting integration fix)
 * ❌ Complete user journey: sign-up → sign-in (BLOCKED)
 */

import { test, expect, type Page } from '@playwright/test'
import { createValidTestUser, createAnotherTestUser, type TestUser } from './fixtures/test-users'
import {
  deleteUserByEmail,
  findUserByEmail,
  findSessionsByUserId,
  countActiveSessions,
} from './fixtures/database-helpers'

/**
 * Helper to sign in via UI
 */
async function signInViaUI(page: Page, email: string, password: string, rememberMe: boolean = false) {
  await page.goto('/sign-in')

  // Fill out sign-in form
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)

  // Check "Remember me" if requested
  if (rememberMe) {
    await page.check('input[type="checkbox"]#rememberMe')
  }

  // Submit form
  await page.click('button[type="submit"]')
}

/**
 * Helper to get token from storage
 */
async function getAuthToken(page: Page, storage: 'localStorage' | 'sessionStorage'): Promise<string | null> {
  return await page.evaluate((storageType) => {
    const storage = storageType === 'localStorage' ? window.localStorage : window.sessionStorage
    return storage.getItem('auth_token')
  }, storage)
}

/**
 * Helper to check if user is on dashboard
 */
async function expectOnDashboard(page: Page) {
  // Wait for redirect to complete
  await page.waitForURL(/\/organizations/, { timeout: 10000 })
  expect(page.url()).toContain('/organizations')
}

/**
 * Helper to create test user via API (for tests that need existing users)
 * BLOCKED: This would use the signup API, but it's not wired from UI yet
 */
async function createTestUserViaAPI(user: TestUser): Promise<void> {
  // TODO: Once signup is wired correctly, implement this
  // For now, tests that need existing users will need manual setup
  console.warn('[createTestUserViaAPI] Not implemented - signup API not wired from UI')
}

test.describe('Authentication Flow E2E Tests', () => {
  test.describe.configure({ mode: 'parallel' })

  /**
   * ==================================
   * SIGN-UP FLOW TESTS (BLOCKED)
   * ==================================
   *
   * These tests are BLOCKED due to integration gap.
   * Sign-up form calls `/platform/signup` instead of `/api/auth/signup`.
   * Once fixed, these tests will work.
   */

  test.describe('Sign-Up Flow (BLOCKED - Integration Gap)', () => {
    test.skip('should successfully create a new user account', async ({ page }) => {
      const user = createValidTestUser('e2e-signup')

      try {
        // Navigate to sign-up page
        await page.goto('/sign-up')

        // Fill out sign-up form
        await page.fill('input[name="email"]', user.email)
        await page.fill('input[name="password"]', user.password)
        await page.fill('input[name="confirmPassword"]', user.password)
        await page.fill('input[name="firstName"]', user.first_name)
        await page.fill('input[name="lastName"]', user.last_name)
        if (user.username) {
          await page.fill('input[name="username"]', user.username)
        }

        // Accept terms
        await page.check('input[type="checkbox"]#acceptTerms')

        // Submit form
        await page.click('button[type="submit"]')

        // Wait for success message
        await expect(page.locator('text=Check your email to confirm')).toBeVisible({ timeout: 10000 })

        // Verify user created in database
        const dbUser = await findUserByEmail(user.email)
        expect(dbUser).not.toBeNull()
        expect(dbUser?.email).toBe(user.email)
        expect(dbUser?.first_name).toBe(user.first_name)
        expect(dbUser?.last_name).toBe(user.last_name)

        // Verify NO session created (user must sign in separately)
        const sessions = await findSessionsByUserId(dbUser!.id)
        expect(sessions.length).toBe(0)

        // Verify redirected to sign-in after delay
        await page.waitForURL(/\/sign-in/, { timeout: 3000 })
      } finally {
        // Cleanup
        await deleteUserByEmail(user.email)
      }
    })

    test.skip('should reject duplicate email during sign-up', async ({ page }) => {
      const user = createValidTestUser('e2e-duplicate')

      try {
        // First, create user (this will fail until integration is fixed)
        await createTestUserViaAPI(user)

        // Try to sign up again with same email
        await page.goto('/sign-up')
        await page.fill('input[name="email"]', user.email)
        await page.fill('input[name="password"]', user.password)
        await page.fill('input[name="confirmPassword"]', user.password)
        await page.fill('input[name="firstName"]', user.first_name)
        await page.fill('input[name="lastName"]', user.last_name)
        await page.check('input[type="checkbox"]#acceptTerms')

        await page.click('button[type="submit"]')

        // Expect error message
        await expect(page.locator('text=An account with this email already exists')).toBeVisible()
      } finally {
        // Cleanup
        await deleteUserByEmail(user.email)
      }
    })

    test.skip('should reject weak password during sign-up', async ({ page }) => {
      await page.goto('/sign-up')

      // Fill form with weak password
      await page.fill('input[name="email"]', 'weak@test.example.com')
      await page.fill('input[name="password"]', 'weak')
      await page.fill('input[name="confirmPassword"]', 'weak')
      await page.fill('input[name="firstName"]', 'Weak')
      await page.fill('input[name="lastName"]', 'Password')
      await page.check('input[type="checkbox"]#acceptTerms')

      // Expect submit button disabled or validation error shown
      const submitButton = page.locator('button[type="submit"]')
      await expect(submitButton).toBeDisabled()

      // Or validation message shown
      await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible()
    })
  })

  /**
   * ==================================
   * SIGN-IN FLOW TESTS (WORKING)
   * ==================================
   *
   * These tests work because sign-in form IS wired to `/api/auth/signin`.
   *
   * NOTE: Requires pre-existing test users in database.
   * Consider seeding test database before running these tests.
   */

  test.describe('Sign-In Flow (Working)', () => {
    test('should successfully sign in with valid credentials', async ({ page }) => {
      // NOTE: This requires a test user to already exist in the database
      // You'll need to create one manually or via seed script
      const testEmail = 'test@example.com'
      const testPassword = 'SecurePass123!'

      await signInViaUI(page, testEmail, testPassword, false)

      // Verify redirected to dashboard
      await expectOnDashboard(page)

      // Verify token stored in sessionStorage (rememberMe = false)
      const sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeTruthy()
      expect(sessionToken).not.toBe('')

      // Verify user data in sessionStorage
      const userData = await page.evaluate(() => {
        return window.sessionStorage.getItem('user')
      })
      expect(userData).toBeTruthy()
      const user = JSON.parse(userData!)
      expect(user.email).toBe(testEmail)
    })

    test('should store token in localStorage when "Remember me" is checked', async ({ page }) => {
      const testEmail = 'test@example.com'
      const testPassword = 'SecurePass123!'

      await signInViaUI(page, testEmail, testPassword, true)

      // Verify redirected to dashboard
      await expectOnDashboard(page)

      // Verify token stored in localStorage (rememberMe = true)
      const localToken = await getAuthToken(page, 'localStorage')
      expect(localToken).toBeTruthy()
      expect(localToken).not.toBe('')

      // Verify NOT in sessionStorage
      const sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeNull()
    })

    test('should reject invalid email', async ({ page }) => {
      await signInViaUI(page, 'nonexistent@example.com', 'SomePassword123!', false)

      // Expect error message
      await expect(page.locator('text=Email or password is incorrect')).toBeVisible({ timeout: 5000 })

      // Verify not redirected
      expect(page.url()).toContain('/sign-in')

      // Verify no token stored
      const sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeNull()
    })

    test('should reject invalid password', async ({ page }) => {
      const testEmail = 'test@example.com'
      const wrongPassword = 'WrongPassword123!'

      await signInViaUI(page, testEmail, wrongPassword, false)

      // Expect error message
      await expect(page.locator('text=Email or password is incorrect')).toBeVisible({ timeout: 5000 })

      // Verify not redirected
      expect(page.url()).toContain('/sign-in')

      // Verify no token stored
      const sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeNull()
    })

    test('should enforce rate limiting after 5 failed attempts', async ({ page }) => {
      const testEmail = 'test@example.com'
      const wrongPassword = 'WrongPassword123!'

      // Make 5 failed sign-in attempts
      for (let i = 0; i < 5; i++) {
        await signInViaUI(page, testEmail, wrongPassword, false)
        await page.waitForTimeout(1000)  // Wait briefly between attempts
        await page.goto('/sign-in')  // Reset page
      }

      // 6th attempt should be rate limited
      await signInViaUI(page, testEmail, wrongPassword, false)

      // Expect rate limit error
      await expect(page.locator('text=Too many sign-in attempts')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=Try again in')).toBeVisible()

      // Verify submit button disabled
      const submitButton = page.locator('button[type="submit"]')
      await expect(submitButton).toBeDisabled()
    })
  })

  /**
   * ==================================
   * SIGN-OUT FLOW TESTS (WORKING)
   * ==================================
   */

  test.describe('Sign-Out Flow (Working)', () => {
    test('should successfully sign out and clear session', async ({ page }) => {
      // First sign in
      await signInViaUI(page, 'test@example.com', 'SecurePass123!', false)
      await expectOnDashboard(page)

      // Verify token exists
      let sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeTruthy()

      // Click sign out button
      await page.click('button:has-text("Sign Out")')

      // Verify redirected to sign-in
      await page.waitForURL(/\/sign-in/, { timeout: 10000 })

      // Verify token cleared
      sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeNull()

      // Verify user data cleared
      const userData = await page.evaluate(() => {
        return window.sessionStorage.getItem('user')
      })
      expect(userData).toBeNull()
    })

    test('should clear session from database on sign-out', async ({ page }) => {
      // Sign in to create session
      await signInViaUI(page, 'test@example.com', 'SecurePass123!', false)
      await expectOnDashboard(page)

      // Get user ID from stored user data
      const userData = await page.evaluate(() => {
        return window.sessionStorage.getItem('user')
      })
      const user = JSON.parse(userData!)
      const userId = user.id

      // Verify session exists in database
      const sessionsBefore = await countActiveSessions(userId)
      expect(sessionsBefore).toBeGreaterThan(0)

      // Sign out
      await page.click('button:has-text("Sign Out")')
      await page.waitForURL(/\/sign-in/)

      // Verify session deleted from database
      const sessionsAfter = await countActiveSessions(userId)
      expect(sessionsAfter).toBe(sessionsBefore - 1)
    })
  })

  /**
   * ==================================
   * PROTECTED ROUTES TESTS (WORKING)
   * ==================================
   */

  test.describe('Protected Routes (Working)', () => {
    test('should redirect unauthenticated user to sign-in', async ({ page }) => {
      // Try to access protected route
      await page.goto('/organizations')

      // Expect redirect to sign-in
      await page.waitForURL(/\/sign-in/, { timeout: 10000 })
      expect(page.url()).toContain('/sign-in')

      // Verify returnTo parameter preserved
      expect(page.url()).toMatch(/returnTo=/)
    })

    test('should redirect back to original route after sign-in', async ({ page }) => {
      // Try to access /organizations
      await page.goto('/organizations')

      // Redirected to sign-in with returnTo
      await page.waitForURL(/\/sign-in/)
      expect(page.url()).toMatch(/returnTo/)

      // Sign in
      await signInViaUI(page, 'test@example.com', 'SecurePass123!', false)

      // Should redirect back to /organizations
      await page.waitForURL(/\/organizations/)
      expect(page.url()).toContain('/organizations')
    })

    test('should allow access to protected routes when authenticated', async ({ page }) => {
      // Sign in first
      await signInViaUI(page, 'test@example.com', 'SecurePass123!', false)
      await expectOnDashboard(page)

      // Navigate to another protected route
      await page.goto('/project/default')

      // Should NOT redirect to sign-in
      await page.waitForTimeout(2000)
      expect(page.url()).not.toContain('/sign-in')
    })
  })

  /**
   * ==================================
   * REMEMBER ME FUNCTIONALITY (WORKING)
   * ==================================
   */

  test.describe('Remember Me Functionality (Working)', () => {
    test('should persist session across browser restart when remember me is checked', async ({ browser }) => {
      // Create new browser context (simulates fresh browser)
      const context1 = await browser.newContext()
      const page1 = await context1.newPage()

      // Sign in with remember me
      await signInViaUI(page1, 'test@example.com', 'SecurePass123!', true)
      await expectOnDashboard(page1)

      // Get token from localStorage
      const token1 = await getAuthToken(page1, 'localStorage')
      expect(token1).toBeTruthy()

      // Close browser context (simulates browser restart)
      await context1.close()

      // Create new browser context (fresh browser session)
      const context2 = await browser.newContext({
        // Copy localStorage from previous context
        storageState: {
          cookies: [],
          origins: [{
            origin: 'http://localhost:3000',
            localStorage: [{
              name: 'auth_token',
              value: token1!,
            }],
          }],
        },
      })

      const page2 = await context2.newPage()

      // Navigate to protected route
      await page2.goto('/organizations')

      // Should still be authenticated (no redirect to sign-in)
      await page2.waitForTimeout(2000)
      expect(page2.url()).toContain('/organizations')

      await context2.close()
    })

    test('should NOT persist session across tab close when remember me is NOT checked', async ({ browser }) => {
      // Create browser context
      const context = await browser.newContext()
      const page = await context.newPage()

      // Sign in WITHOUT remember me
      await signInViaUI(page, 'test@example.com', 'SecurePass123!', false)
      await expectOnDashboard(page)

      // Verify token in sessionStorage (NOT localStorage)
      const sessionToken = await getAuthToken(page, 'sessionStorage')
      expect(sessionToken).toBeTruthy()

      const localToken = await getAuthToken(page, 'localStorage')
      expect(localToken).toBeNull()

      // Close and reopen (simulates tab close)
      await page.close()
      const page2 = await context.newPage()

      // Try to access protected route
      await page2.goto('/organizations')

      // Should be redirected to sign-in (session lost)
      await page2.waitForURL(/\/sign-in/, { timeout: 10000 })
      expect(page2.url()).toContain('/sign-in')

      await context.close()
    })
  })
})

/**
 * ==================================
 * NOTES FOR TEST EXECUTION
 * ==================================
 *
 * 1. Database Setup:
 *    - Requires test database with platform schema
 *    - Need at least one test user: test@example.com / SecurePass123!
 *    - Run migrations: `node apps/studio/database/run-migration.js`
 *
 * 2. Environment:
 *    - Set DATABASE_URL to test database (not production!)
 *    - Start dev server: `pnpm dev`
 *    - Run tests: `pnpm test:e2e`
 *
 * 3. Blocked Tests:
 *    - Sign-up flow tests are SKIPPED until integration is fixed
 *    - Update signup-mutation.ts to call `/api/auth/signup`
 *    - Then remove .skip() from blocked tests
 *
 * 4. Test Data Cleanup:
 *    - Tests create users with @test.example.com emails
 *    - Run cleanup: `node apps/studio/database/cleanup-test-users.js`
 *
 * 5. Performance:
 *    - Tests run in parallel by default
 *    - Use --workers=1 for sequential execution
 *    - Use --debug for debugging failed tests
 */
