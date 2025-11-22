/**
 * Correlation ID Management
 *
 * Provides correlation ID generation and propagation for distributed tracing:
 * - AsyncLocalStorage for context propagation
 * - Request-level correlation ID tracking
 * - Thread-safe ID management
 * - Integration with logging framework
 *
 * Usage:
 *   import { withCorrelationId } from './observability/correlation'
 *
 *   await withCorrelationId('req-123', async () => {
 *     // All logs within this context will include correlation_id: 'req-123'
 *     await someOperation()
 *   })
 */

import { v4 as uuidv4 } from 'uuid'
import { AsyncLocalStorage } from 'async_hooks'

/**
 * Correlation context storage
 * Uses AsyncLocalStorage for thread-safe context propagation
 */
const correlationStorage = new AsyncLocalStorage<string>()

/**
 * Generate a new correlation ID
 * Format: UUID v4 (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
 */
export function generateCorrelationId(): string {
  return uuidv4()
}

/**
 * Set correlation ID for current async context
 * This is lower-level - prefer withCorrelationId for most use cases
 */
export function setCorrelationId(id: string): void {
  correlationStorage.enterWith(id)
}

/**
 * Get current correlation ID from async context
 * Returns undefined if no correlation ID is set
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()
}

/**
 * Execute function with correlation ID context
 * All async operations within fn will have access to this correlation ID
 *
 * @param id - Correlation ID to use (or will generate one if not provided)
 * @param fn - Async function to execute with correlation context
 * @returns Result of fn
 */
export async function withCorrelationId<T>(id: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const correlationId = id || generateCorrelationId()
  return await correlationStorage.run(correlationId, fn)
}

/**
 * Extract correlation ID from HTTP request headers
 * Checks multiple common header names
 *
 * @param headers - HTTP headers object (from Next.js request)
 * @returns Correlation ID if found, undefined otherwise
 */
export function extractCorrelationId(headers: Record<string, string | string[] | undefined>): string | undefined {
  // Try common header names
  const headerNames = [
    'x-correlation-id',
    'x-request-id',
    'x-trace-id',
    'correlation-id',
    'request-id',
  ]

  for (const name of headerNames) {
    const value = headers[name]
    if (value) {
      return Array.isArray(value) ? value[0] : value
    }
  }

  return undefined
}

/**
 * Middleware helper to extract or generate correlation ID from request
 * Use this at the start of API route handlers
 *
 * @param headers - Request headers
 * @returns Correlation ID (extracted from headers or newly generated)
 */
export function ensureCorrelationId(headers: Record<string, string | string[] | undefined>): string {
  return extractCorrelationId(headers) || generateCorrelationId()
}

/**
 * Create correlation ID context for Next.js API route
 * Wraps handler execution with correlation ID
 *
 * @param headers - Request headers
 * @param fn - Handler function to execute
 * @returns Result of handler
 */
export async function withRequestCorrelation<T>(
  headers: Record<string, string | string[] | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const correlationId = ensureCorrelationId(headers)
  return withCorrelationId(correlationId, fn)
}

/**
 * Get or create correlation ID
 * Useful for operations that might be called both with and without existing context
 */
export function getOrCreateCorrelationId(): string {
  return getCorrelationId() || generateCorrelationId()
}

/**
 * Format correlation ID for display (shortened)
 * Takes first 8 characters for logging readability
 */
export function formatCorrelationId(id?: string): string {
  if (!id) {
    return 'no-correlation'
  }
  return id.substring(0, 8)
}

/**
 * Validate correlation ID format
 * Checks if string is a valid UUID v4
 */
export function isValidCorrelationId(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}
