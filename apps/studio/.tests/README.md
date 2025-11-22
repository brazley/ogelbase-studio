# Test Suite Documentation

**Version:** 1.0.0
**Last Updated:** 2025-11-22
**Owner:** Quinn Martinez (QA Automation Engineer)

---

## Quick Start

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test .tests/unit/redis/cache-utils.test.ts

# Run tests matching pattern
pnpm test --grep "Redis health"
```

---

## Directory Structure

```
.tests/
├── unit/                          # Pure function tests
│   ├── redis/                     # Redis utilities
│   ├── auth/                      # Authentication
│   ├── api/                       # API helpers
│   ├── logging/                   # Logging utilities
│   └── utils/                     # General utilities
│
├── integration/                   # Component interaction tests
│   ├── redis-dashboard/           # Redis dashboard features
│   ├── auth-flow/                 # Auth flows
│   ├── database/                  # Database operations
│   └── api-endpoints/             # API integration
│
├── e2e/                           # End-to-end user flows
│   ├── redis-monitoring/          # Redis monitoring journeys
│   ├── project-setup/             # Project creation flows
│   └── database-management/       # Database management flows
│
├── performance/                   # Performance benchmarks
│   ├── redis-cache/               # Cache performance
│   ├── session-validation/        # Session performance
│   ├── logging/                   # Logging overhead
│   └── api-latency/               # API response times
│
├── fixtures/                      # Test data
│   ├── redis-responses/           # Redis mock data
│   ├── projects/                  # Project fixtures
│   ├── users/                     # User/session fixtures
│   └── api-responses/             # API response fixtures
│
├── helpers/                       # Test utilities
│   ├── setup.ts                   # Global setup
│   ├── teardown.ts                # Global cleanup
│   ├── mocks.ts                   # Mock factories
│   ├── assertions.ts              # Custom assertions
│   └── test-utils.tsx             # React testing utilities
│
├── README.md                      # This file
└── PLAN.md                        # Implementation plan
```

---

## Test Organization

### When to Write Which Type of Test

#### Unit Tests (`unit/`)
- **Purpose:** Test individual functions and modules in isolation
- **Speed:** < 100ms per test
- **Use When:**
  - Testing pure functions
  - Testing utility functions
  - Testing business logic
  - Testing data transformations

**Example:**
```typescript
// .tests/unit/redis/cache-utils.test.ts
import { test, expect } from 'vitest'
import { calculateHitRate } from '@/lib/redis/cache-utils'

test('calculateHitRate returns correct percentage', () => {
  const result = calculateHitRate(90, 10)
  expect(result).toBe(90.0)
})
```

#### Integration Tests (`integration/`)
- **Purpose:** Test how components work together
- **Speed:** < 500ms per test
- **Use When:**
  - Testing API endpoints
  - Testing data flows
  - Testing component interactions
  - Testing database operations

**Example:**
```typescript
// .tests/integration/redis-dashboard/dashboard-with-data.test.tsx
import { test, expect } from 'vitest'
import { customRender, screen } from '@/.tests/helpers/test-utils'
import { RedisDashboard } from '@/components/interfaces/Database/Redis/RedisDashboard'
import { healthyRedis } from '@/.tests/fixtures'

test('RedisDashboard displays health metrics', async () => {
  customRender(<RedisDashboard health={healthyRedis} />)

  expect(screen.getByText('Healthy')).toBeInTheDocument()
  expect(screen.getByText('92.3%')).toBeInTheDocument() // Hit rate
})
```

#### E2E Tests (`e2e/`)
- **Purpose:** Test complete user journeys
- **Speed:** < 5s per test
- **Use When:**
  - Testing critical user paths
  - Testing authentication flows
  - Testing multi-page interactions
  - Testing real browser behavior

**Example:**
```typescript
// .tests/e2e/redis-monitoring/view-dashboard.spec.ts
import { test, expect } from '@playwright/test'

test('User can view Redis dashboard and see alerts', async ({ page }) => {
  await page.goto('/project/test-ref/database/redis')

  await expect(page.locator('[data-testid="redis-health"]')).toBeVisible()
  await expect(page.locator('[data-testid="redis-alerts"]')).toBeVisible()

  const healthStatus = await page.locator('[data-testid="health-status"]').textContent()
  expect(['Healthy', 'Degraded', 'Unhealthy']).toContain(healthStatus)
})
```

#### Performance Tests (`performance/`)
- **Purpose:** Establish and verify performance baselines
- **Speed:** Variable (benchmark-dependent)
- **Use When:**
  - Testing operation latency
  - Testing throughput
  - Testing memory usage
  - Testing cache hit rates

**Example:**
```typescript
// .tests/performance/redis-cache/hit-rate.bench.ts
import { bench } from 'vitest'
import { validateSession } from '@/lib/api/auth/session'

bench('session validation with cache', async () => {
  await validateSession('test-token')
}, {
  time: 1000,
  warmup: 100,
  iterations: 1000,
})
```

---

## Writing Tests

### Test Structure (Arrange-Act-Assert)

Every test should follow the AAA pattern:

```typescript
test('descriptive test name explaining what is being tested', () => {
  // ARRANGE: Set up test data and conditions
  const mockData = createMockRedisHealth({ status: 'healthy' })

  // ACT: Execute the code under test
  const result = processHealthData(mockData)

  // ASSERT: Verify the results
  expect(result.isHealthy).toBe(true)
  expect(result.alerts).toHaveLength(0)
})
```

### Using Fixtures

Import pre-built fixtures instead of creating data in tests:

```typescript
import { healthyRedis, degradedRedis, unhealthyRedis } from '@/.tests/fixtures'

test('handles different health states', () => {
  expect(isHealthy(healthyRedis)).toBe(true)
  expect(isHealthy(degradedRedis)).toBe(false)
  expect(isHealthy(unhealthyRedis)).toBe(false)
})
```

### Using Mock Factories

Create custom mocks with the factory functions:

```typescript
import { createMockRedisHealth, createMockSession } from '@/.tests/helpers/mocks'

test('handles custom scenarios', () => {
  const customHealth = createMockRedisHealth({
    latency: 150, // Override specific values
    status: 'degraded',
  })

  expect(needsAlert(customHealth)).toBe(true)
})
```

### Custom Assertions

Use custom assertions for better error messages:

```typescript
import { assertValidRedisHealth, assertPerformance } from '@/.tests/helpers/assertions'

test('Redis health data is valid', () => {
  const health = getRedisHealth()
  assertValidRedisHealth(health) // Better than multiple expects
})

test('operation is fast enough', () => {
  const start = Date.now()
  performOperation()
  const duration = Date.now() - start

  assertPerformance(duration, 10, 0.2, 'Operation') // Target: 10ms ± 20%
})
```

### Testing React Components

Use the custom render function with all providers:

```typescript
import { customRender, screen, waitFor } from '@/.tests/helpers/test-utils'

test('component renders and handles interactions', async () => {
  const { user } = customRender(<MyComponent />)

  // Find elements
  const button = screen.getByRole('button', { name: /click me/i })

  // Simulate interaction
  await user.click(button)

  // Wait for async changes
  await waitFor(() => {
    expect(screen.getByText('Success!')).toBeInTheDocument()
  })
})
```

### Testing Async Operations

Always properly handle async code:

```typescript
test('async operation completes successfully', async () => {
  const promise = fetchData()

  await expect(promise).resolves.toBeDefined()

  const result = await promise
  expect(result.data).toHaveLength(3)
})

test('async operation handles errors', async () => {
  const promise = fetchDataWithError()

  await expect(promise).rejects.toThrow('Network error')
})
```

### Mocking APIs

Use MSW for API mocking (already set up in existing tests):

```typescript
import { mswServer } from '@/tests/lib/msw'
import { rest } from 'msw'

test('handles API success', async () => {
  mswServer.use(
    rest.get('/api/redis/health', (req, res, ctx) => {
      return res(ctx.json({ status: 'healthy' }))
    })
  )

  const result = await fetchRedisHealth()
  expect(result.status).toBe('healthy')
})

test('handles API error', async () => {
  mswServer.use(
    rest.get('/api/redis/health', (req, res, ctx) => {
      return res(ctx.status(500), ctx.json({ error: 'Internal error' }))
    })
  )

  await expect(fetchRedisHealth()).rejects.toThrow()
})
```

---

## Test Naming Conventions

### Test File Names

- Unit tests: `{feature}.test.ts`
- Integration tests: `{feature}-integration.test.tsx`
- E2E tests: `{flow}.spec.ts`
- Performance tests: `{metric}.bench.ts`

### Test Descriptions

Use clear, descriptive names that explain:
1. What is being tested
2. Under what conditions
3. What the expected outcome is

**Good:**
```typescript
test('RedisHealthMonitor shows warning alert when memory usage exceeds 80%', () => {
  // ...
})

test('session cache returns cached value on second call within TTL', () => {
  // ...
})
```

**Bad:**
```typescript
test('it works', () => {
  // Too vague
})

test('test redis', () => {
  // Not descriptive
})
```

---

## Coverage Targets

| Category | Target | Current |
|----------|--------|---------|
| Overall | 80% | TBD |
| Sprint 4 Code | 90% | TBD |
| Critical Paths | 95% | TBD |

### Viewing Coverage

```bash
# Generate coverage report
pnpm test --coverage

# Open HTML report in browser
pnpm test:report

# Coverage files are in:
# - coverage/lcov-report/index.html (HTML report)
# - coverage/lcov.info (LCOV format for CI)
# - coverage/coverage-final.json (JSON format)
```

### Interpreting Coverage

- **Lines:** Percentage of code lines executed
- **Functions:** Percentage of functions called
- **Branches:** Percentage of if/else branches taken
- **Statements:** Percentage of statements executed

**Focus on:**
- Critical business logic: 95%+
- Utilities and helpers: 90%+
- UI components: 80%+
- Error handling: Test all error paths

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Pushes to main
- Nightly builds

### Coverage Enforcement

Coverage thresholds are enforced in CI:
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

PRs that drop coverage below thresholds will fail CI.

---

## Troubleshooting

### Common Issues

#### Tests Fail Randomly (Flaky Tests)

**Symptoms:** Tests pass sometimes, fail other times

**Solutions:**
1. Check for race conditions in async code
2. Use `waitFor` instead of fixed timeouts
3. Ensure proper cleanup between tests
4. Check for shared state between tests

```typescript
// BAD: Race condition
test('loads data', () => {
  fetchData()
  expect(data).toBeDefined() // Might not be ready yet
})

// GOOD: Wait for async
test('loads data', async () => {
  await fetchData()
  expect(data).toBeDefined()
})
```

#### Tests Are Slow

**Symptoms:** Test suite takes > 5 minutes

**Solutions:**
1. Check for unnecessary API calls
2. Use mocks instead of real services
3. Parallelize tests (Vitest does this by default)
4. Move slow tests to integration/e2e folders

#### Mocks Not Working

**Symptoms:** Real services being called instead of mocks

**Solutions:**
1. Ensure MSW server is started (already in `vitestSetup.ts`)
2. Check mock handler paths match request URLs
3. Verify mocks are registered before tests run
4. Reset MSW handlers between tests (already done in `afterEach`)

#### Coverage Gaps

**Symptoms:** Coverage report shows uncovered lines

**Solutions:**
1. Add tests for error paths
2. Test edge cases
3. Add integration tests for complex flows
4. Review coverage report HTML to see specific gaps

### Debug Mode

Run tests with debugging:

```bash
# Show console logs
pnpm test --reporter=verbose

# Run single test file
pnpm test .tests/unit/redis/cache-utils.test.ts

# Use VS Code debugger
# 1. Set breakpoint in test
# 2. Open "Run and Debug"
# 3. Select "Vitest" configuration
# 4. Press F5
```

---

## Performance Benchmarks

### Running Benchmarks

```bash
# Run all benchmarks
pnpm test --run --benchmark

# Run specific benchmark
pnpm test .tests/performance/redis-cache/hit-rate.bench.ts
```

### Baseline Targets

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| Session validation (cached) | < 10ms | 15ms |
| Redis cache read | < 5ms | 10ms |
| Logging overhead | < 0.4ms | 1ms |
| API health check | < 50ms | 100ms |
| Hotkey detection | < 0.05ms | 0.1ms |

### Creating Benchmarks

```typescript
import { bench, describe } from 'vitest'

describe('Redis cache operations', () => {
  bench('cache hit', async () => {
    await redis.get('test-key')
  }, {
    time: 1000,      // Run for 1 second
    warmup: 100,     // 100 warmup iterations
    iterations: 1000, // At least 1000 iterations
  })
})
```

---

## Best Practices

### Do's ✅

1. **Write tests first** (TDD) when possible
2. **Use descriptive names** for tests and variables
3. **Test one thing** per test
4. **Use fixtures** for consistent data
5. **Mock external dependencies** (APIs, databases)
6. **Clean up** after tests (use afterEach)
7. **Test error cases** not just happy paths
8. **Keep tests fast** (< 100ms for unit tests)
9. **Use custom assertions** for better errors
10. **Document complex test setups**

### Don'ts ❌

1. **Don't test implementation details** (test behavior)
2. **Don't use real services** in unit tests
3. **Don't share state** between tests
4. **Don't use fixed timeouts** (use waitFor)
5. **Don't skip tests** (fix or delete them)
6. **Don't test third-party libraries**
7. **Don't make tests dependent** on each other
8. **Don't ignore flaky tests**
9. **Don't commit failing tests**
10. **Don't over-mock** (integration tests need some real code)

---

## Resources

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)

### Internal Guides

- `.tests/PLAN.md` - Test suite implementation plan
- `tests/vitestSetup.ts` - Global test setup
- `.tests/helpers/` - Test utilities and patterns

### Getting Help

- Ask in #engineering-qa Slack channel
- Review existing tests in `.tests/` for patterns
- Consult Quinn Martinez (QA owner) for guidance
- Check this README first!

---

## Maintenance

### Updating Fixtures

When features change, update fixtures:

```typescript
// .tests/fixtures/redis-responses/health.ts
export const healthyRedis: MockRedisHealth = {
  // Update values to match new feature requirements
  status: 'healthy',
  newField: 'new-value', // Add new fields
}
```

### Adding New Test Categories

1. Create directory: `.tests/{category}/`
2. Add README in category explaining purpose
3. Update this README with new category
4. Create example test
5. Update coverage config if needed

### Test Debt

Review and address:
- Skipped tests (`.skip`)
- TODO comments in tests
- Flaky tests (run suite 10x to find)
- Slow tests (> 500ms unit tests)
- Low coverage areas

---

## Quick Reference Card

```bash
# Common Commands
pnpm test                    # Run all tests
pnpm test:watch             # Watch mode
pnpm test:ui                # UI mode
pnpm test --coverage        # With coverage
pnpm test:report            # Open coverage report

# Run Specific Tests
pnpm test redis             # Tests matching "redis"
pnpm test .tests/unit/      # All unit tests
pnpm test --grep "health"   # Tests matching "health"

# Debug
pnpm test --reporter=verbose   # Verbose output
pnpm test --no-coverage        # Skip coverage

# Performance
pnpm test --run --benchmark    # Run benchmarks
```

---

**Last Updated:** 2025-11-22
**Next Review:** After Phase 2 completion
**Questions?** Contact Quinn Martinez or check Slack #engineering-qa
