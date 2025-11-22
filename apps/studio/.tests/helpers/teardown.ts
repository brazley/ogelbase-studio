/**
 * Global Test Teardown
 *
 * This file provides centralized teardown utilities for cleaning up after tests.
 * It ensures proper cleanup of mocks, timers, and test resources.
 */

import { afterEach, afterAll, vi } from 'vitest'

/**
 * Global test environment teardown
 * Call this in your test files to ensure proper cleanup
 */
export function teardownTestEnvironment() {
  afterEach(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Clear all timers if using fake timers
    if (vi.isFakeTimers()) {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  afterAll(() => {
    // Final cleanup
    vi.restoreAllMocks()
  })
}

/**
 * Teardown for React component tests
 */
export function teardownReactTests() {
  teardownTestEnvironment()
}

/**
 * Teardown for API tests
 */
export function teardownApiTests() {
  teardownTestEnvironment()

  afterAll(() => {
    // Restore fetch if mocked
    if (global.fetch && vi.isMockFunction(global.fetch)) {
      vi.restoreAllMocks()
    }
  })
}

/**
 * Teardown for Redis tests
 */
export function teardownRedisTests() {
  teardownTestEnvironment()
}

/**
 * Teardown for authentication tests
 */
export function teardownAuthTests() {
  teardownTestEnvironment()
}

/**
 * Teardown for performance tests
 */
export function teardownPerformanceTests() {
  teardownTestEnvironment()

  afterAll(() => {
    // Clear performance marks/measures
    if (performance.clearMarks) {
      performance.clearMarks()
    }
    if (performance.clearMeasures) {
      performance.clearMeasures()
    }
  })
}
