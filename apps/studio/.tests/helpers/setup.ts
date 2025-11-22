/**
 * Global Test Setup
 *
 * This file provides centralized setup utilities for all tests in the .tests/ directory.
 * It initializes mocks, configures the test environment, and provides common setup patterns.
 */

import { beforeAll, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'

// Configure dayjs plugins globally
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)

/**
 * Global test environment setup
 * Call this in your test files if you need the full setup
 */
export function setupTestEnvironment() {
  beforeAll(() => {
    // Mock environment variables
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000'
    process.env.NODE_ENV = 'test'
  })

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Reset timers if you're using fake timers
    if (vi.isFakeTimers()) {
      vi.clearAllTimers()
    }
  })
}

/**
 * Setup for React component tests
 * Includes cleanup and React Testing Library configuration
 */
export function setupReactTests() {
  setupTestEnvironment()

  beforeEach(() => {
    cleanup()
  })
}

/**
 * Setup for API/endpoint tests
 * Mocks fetch and provides request/response utilities
 */
export function setupApiTests() {
  setupTestEnvironment()

  beforeAll(() => {
    // Global fetch mock if needed
    global.fetch = vi.fn()
  })
}

/**
 * Setup for Redis tests
 * Provides Redis mock configuration
 */
export function setupRedisTests() {
  setupTestEnvironment()

  beforeAll(() => {
    // Mock Redis environment variables
    process.env.REDIS_URL = 'redis://localhost:6379'
    process.env.REDIS_TLS_ENABLED = 'false'
  })
}

/**
 * Setup for authentication tests
 * Provides auth mock configuration
 */
export function setupAuthTests() {
  setupTestEnvironment()

  beforeAll(() => {
    // Mock auth-related environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })
}

/**
 * Setup for performance benchmarks
 * Configures timing and benchmark utilities
 */
export function setupPerformanceTests() {
  setupTestEnvironment()

  beforeAll(() => {
    // Enable high-resolution timing
    if (!performance.mark) {
      global.performance.mark = vi.fn()
    }
    if (!performance.measure) {
      global.performance.measure = vi.fn()
    }
  })
}

/**
 * Creates a mock timer for testing time-sensitive code
 */
export function useFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  beforeEach(() => {
    vi.useRealTimers()
  })
}

/**
 * Utility to wait for async operations in tests
 */
export async function waitForAsync(ms: number = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Utility to flush all pending promises
 */
export async function flushPromises() {
  return new Promise(resolve => setImmediate(resolve))
}
