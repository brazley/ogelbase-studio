/**
 * Mock Factories
 *
 * This file provides factory functions for creating mock data and services.
 * All mocks should be created through these factories for consistency.
 */

import { vi } from 'vitest'
import type Redis from 'ioredis'

/**
 * Redis Mock Factory
 */
export function createMockRedis(overrides?: Partial<Redis>): jest.Mocked<Redis> {
  const mock = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    keys: vi.fn(),
    scan: vi.fn(),
    ping: vi.fn(),
    info: vi.fn(),
    quit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    status: 'ready',
    ...overrides,
  } as unknown as jest.Mocked<Redis>

  return mock
}

/**
 * Mock session data
 */
export interface MockSession {
  userId: string
  activeOrgId: string
  email: string
  name?: string
  role?: string
  expiresAt?: number
}

export function createMockSession(overrides?: Partial<MockSession>): MockSession {
  return {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    activeOrgId: '987fcdeb-51a2-43f1-b123-456789abcdef',
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    ...overrides,
  }
}

/**
 * Mock Redis health data
 */
export interface MockRedisHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  latency: number
  memoryUsage: number
  connections: number
  hitRate: number
  lastChecked: string
}

export function createMockRedisHealth(overrides?: Partial<MockRedisHealth>): MockRedisHealth {
  return {
    status: 'healthy',
    latency: 2.5,
    memoryUsage: 45.2,
    connections: 12,
    hitRate: 92.3,
    lastChecked: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mock Redis metrics data
 */
export interface MockRedisMetrics {
  timestamp: string
  commands: {
    get: number
    set: number
    del: number
    total: number
  }
  memory: {
    used: number
    peak: number
    fragmentation: number
  }
  connections: {
    current: number
    peak: number
    rejected: number
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
  }
  keyspace: {
    total: number
    expires: number
    avgTtl: number
  }
}

export function createMockRedisMetrics(overrides?: Partial<MockRedisMetrics>): MockRedisMetrics {
  return {
    timestamp: new Date().toISOString(),
    commands: {
      get: 1543,
      set: 234,
      del: 45,
      total: 1822,
    },
    memory: {
      used: 47234560, // ~45MB
      peak: 52428800, // ~50MB
      fragmentation: 1.15,
    },
    connections: {
      current: 12,
      peak: 18,
      rejected: 0,
    },
    cache: {
      hits: 1423,
      misses: 120,
      hitRate: 92.23,
    },
    keyspace: {
      total: 1247,
      expires: 892,
      avgTtl: 3600,
    },
    ...overrides,
  }
}

/**
 * Mock Redis alert data
 */
export interface MockRedisAlert {
  id: string
  type: 'high_memory' | 'low_hit_rate' | 'high_latency' | 'connection_spike' | 'hotkey'
  severity: 'info' | 'warning' | 'critical'
  message: string
  value: number
  threshold: number
  timestamp: string
}

export function createMockRedisAlert(overrides?: Partial<MockRedisAlert>): MockRedisAlert {
  return {
    id: `alert-${Date.now()}`,
    type: 'high_memory',
    severity: 'warning',
    message: 'Memory usage is approaching limit',
    value: 85.5,
    threshold: 80,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mock project data
 */
export interface MockProject {
  id: string
  ref: string
  name: string
  organizationId: string
  status: 'ACTIVE_HEALTHY' | 'INACTIVE' | 'RESTORING'
  region: string
  createdAt: string
}

export function createMockProject(overrides?: Partial<MockProject>): MockProject {
  return {
    id: 'proj_123456',
    ref: 'test-project-ref',
    name: 'Test Project',
    organizationId: '987fcdeb-51a2-43f1-b123-456789abcdef',
    status: 'ACTIVE_HEALTHY',
    region: 'us-east-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Mock user data
 */
export interface MockUser {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
  organizations: Array<{ id: string; name: string; role: string }>
}

export function createMockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner',
    organizations: [
      {
        id: '987fcdeb-51a2-43f1-b123-456789abcdef',
        name: 'Test Organization',
        role: 'owner',
      },
    ],
    ...overrides,
  }
}

/**
 * Mock API response
 */
export interface MockApiResponse<T = any> {
  data?: T
  error?: {
    message: string
    code?: string
    status?: number
  }
}

export function createMockApiResponse<T>(
  data?: T,
  error?: MockApiResponse['error']
): MockApiResponse<T> {
  if (error) {
    return { error }
  }
  return { data }
}

/**
 * Mock API endpoint with success response
 */
export function mockApiSuccess<T>(data: T) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => data,
  })
}

/**
 * Mock API endpoint with error response
 */
export function mockApiError(status: number = 500, message: string = 'Internal Server Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: { message, status } }),
  })
}

/**
 * Mock Next.js API request
 */
export function createMockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: any
  query?: Record<string, string | string[]>
  cookies?: Record<string, string>
}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    body: options.body,
    query: options.query || {},
    cookies: options.cookies || {},
  } as any
}

/**
 * Mock Next.js API response
 */
export function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  }
  return res as any
}

/**
 * Mock circuit breaker
 */
export function createMockCircuitBreaker(state: 'closed' | 'open' | 'half-open' = 'closed') {
  return {
    fire: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    status: {
      state,
      stats: {
        failures: 0,
        successes: 10,
        rejects: 0,
      },
    },
    on: vi.fn(),
    once: vi.fn(),
  }
}
