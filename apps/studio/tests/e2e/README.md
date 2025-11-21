# E2E Authentication Testing Suite

Comprehensive end-to-end testing for the authentication system using Playwright.

## 🚨 Important: Integration Gap

**BLOCKER:** Sign-up form is not wired to the new auth API.

- **Issue:** `apps/studio/data/misc/signup-mutation.ts` calls `/platform/signup` instead of `/api/auth/signup`
- **Impact:** Cannot test complete sign-up → sign-in user journey
- **Status:** Sign-up E2E tests are SKIPPED until integration is fixed

**Working Tests:**
- ✅ Sign-in flow
- ✅ Sign-out flow
- ✅ Protected routes
- ✅ Remember me functionality
- ✅ Rate limiting
- ✅ Session management

---

## Setup

### 1. Install Dependencies

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium firefox webkit

# Or install all browsers with system dependencies
npx playwright install --with-deps
```

### 2. Database Setup

```bash
# Ensure test database is set up
export DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"

# Run migrations
node apps/studio/database/run-migration.js

# Seed test user (required for sign-in tests)
# Create user: test@example.com / SecurePass123!
node apps/studio/database/seeds/seed-test-user.js
```

### 3. Environment Variables

```bash
# .env.test
DATABASE_URL="postgresql://..."
PLAYWRIGHT_BASE_URL="http://localhost:3000"
NODE_ENV="test"
```

---

## Running Tests

### All E2E Tests

```bash
pnpm test:e2e
```

### Auth Tests Only

```bash
pnpm playwright test tests/e2e/auth-flow.spec.ts
```

### UI Mode (Interactive)

```bash
pnpm test:e2e:ui
```

### Debug Mode (Step-by-step)

```bash
pnpm test:e2e:debug
```

### Specific Browser

```bash
# Chrome only
pnpm playwright test --project=chromium

# Firefox only
pnpm playwright test --project=firefox

# Mobile Chrome
pnpm playwright test --project="Mobile Chrome"
```

### View Test Report

```bash
pnpm test:e2e:report
```

---

## Test Coverage

### ✅ Sign-In Flow (Working)

- Valid credentials → success + redirect
- Invalid email → error message
- Invalid password → error message
- Rate limiting (5 attempts, 15min cooldown)
- Remember me → localStorage
- Session only → sessionStorage
- Token storage verification
- Session database verification

### ✅ Sign-Out Flow (Working)

- Sign out button → redirect to sign-in
- Token cleared from storage
- Session deleted from database
- User data cleared

### ✅ Protected Routes (Working)

- Unauthenticated → redirect to sign-in
- returnTo parameter preserved
- Authenticated → access granted
- Sign-in → redirect to original route

### ✅ Remember Me (Working)

- Checked → token in localStorage
- Not checked → token in sessionStorage
- Browser restart → session persists (localStorage)
- Tab close → session lost (sessionStorage)

### ❌ Sign-Up Flow (BLOCKED)

**Skipped until integration fixed:**
- Valid sign-up → user created
- Duplicate email → error
- Weak password → validation error
- Invalid email → validation error
- Username validation
- Terms acceptance
- Redirect to sign-in after success

---

## Test Structure

```
tests/e2e/
├── README.md                    # This file
├── auth-flow.spec.ts            # Main auth E2E tests
├── fixtures/
│   ├── test-users.ts            # Test user data generators
│   └── database-helpers.ts      # DB query utilities
└── ...
```

---

## Test Data

### Pre-seeded Users

Tests require at least one test user:

```typescript
{
  email: 'test@example.com',
  password: 'SecurePass123!',
  first_name: 'Test',
  last_name: 'User'
}
```

### Dynamic Test Users

Tests generate unique users with timestamp-based emails:

```
testuser+1737584720123@test.example.com
```

This prevents collisions across test runs.

---

## Debugging Failed Tests

### 1. Run in UI Mode

```bash
pnpm test:e2e:ui
```

Interactive mode with timeline, DOM snapshots, and network logs.

### 2. Run in Debug Mode

```bash
pnpm test:e2e:debug
```

Step through tests line-by-line with browser DevTools.

### 3. View Screenshots

Failed tests automatically capture screenshots:

```
test-results/
└── auth-flow-Sign-In-Flow-should-successfully-sign-in-chromium/
    └── test-failed-1.png
```

### 4. View Videos

Failed tests record video:

```
test-results/
└── auth-flow-Sign-In-Flow-should-successfully-sign-in-chromium/
    └── video.webm
```

### 5. View Traces

```bash
npx playwright show-trace test-results/.../trace.zip
```

Detailed timeline with network, console, and DOM snapshots.

---

## Continuous Integration

### GitHub Actions

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: test-results/
```

---

## Troubleshooting

### Tests Fail: "test@example.com user not found"

**Solution:** Seed test database with required user:

```bash
node apps/studio/database/seeds/seed-test-user.js
```

### Tests Fail: "Network timeout"

**Solution:** Ensure dev server is running:

```bash
pnpm dev
```

Or increase timeout in `playwright.config.ts`:

```typescript
timeout: 60 * 1000  // 60 seconds
```

### Tests Fail: "Database connection error"

**Solution:** Check DATABASE_URL environment variable:

```bash
echo $DATABASE_URL
```

Ensure test database is running and accessible.

### Sign-Up Tests Are Skipped

**Expected behavior.** Sign-up form integration is blocked.

See `TICKET-6-TEST-REPORT.md` for details.

---

## Performance Expectations

### Target Metrics

- Sign-in: < 300ms (p95)
- Sign-out: < 200ms (p95)
- Protected route check: < 50ms (p95)
- Session validation: < 50ms (p95)

### Measuring Performance

```typescript
test('measure sign-in performance', async ({ page }) => {
  const startTime = Date.now()

  await signInViaUI(page, 'test@example.com', 'SecurePass123!', false)
  await expectOnDashboard(page)

  const duration = Date.now() - startTime
  expect(duration).toBeLessThan(3000)  // 3 second max
})
```

---

## Next Steps

### Once Integration Is Fixed

1. Update `signup-mutation.ts` to call `/api/auth/signup`
2. Remove `.skip()` from blocked tests in `auth-flow.spec.ts`
3. Run full test suite:
   ```bash
   pnpm test:auth:all
   ```

### Additional Test Coverage Needed

- [ ] Multi-user concurrent sign-ins
- [ ] Session isolation between users
- [ ] Chaos engineering (network failures, DB outages)
- [ ] Performance benchmarks under load
- [ ] Mobile device testing (more viewports)
- [ ] Accessibility testing (screen readers, keyboard nav)

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [TICKET-6-TEST-REPORT.md](../../TICKET-6-TEST-REPORT.md) - Full test analysis
- [Auth API Documentation](../../pages/api/auth/README.md)

---

**Questions?** See full test report: `TICKET-6-TEST-REPORT.md`
