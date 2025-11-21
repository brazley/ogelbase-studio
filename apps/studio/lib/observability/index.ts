/**
 * Observability module for Supabase Studio
 *
 * Provides comprehensive observability through:
 * - OpenTelemetry distributed tracing
 * - Prometheus metrics collection
 * - Structured logging with Winston
 * - Multi-tenant context propagation
 */

export { initializeTracing, withTracing, addTenantContext, getTraceContext } from './tracing'

export {
  register,
  httpRequestDuration,
  httpRequestTotal,
  httpRequestErrorsTotal,
  dbQueryDuration,
  dbQueryTotal,
  dbQueryErrorsTotal,
  dbConnectionPoolActive,
  dbConnectionPoolIdle,
  dbConnectionPoolWaiting,
  dbConnectionPoolMax,
  cacheHitsTotal,
  cacheMissesTotal,
  apiAuthenticationAttempts,
  apiAuthenticationDuration,
  platformProjectsActive,
  platformOrganizationsActive,
  apiRequestsByEndpoint,
  trackHttpRequest,
  trackDatabaseQuery,
  updateConnectionPoolMetrics,
  initializeMetrics,
} from './metrics'

export {
  default as logger,
  createLogger,
  logHttpRequest,
  logDatabaseQuery,
  logAuthentication,
  logError,
  initializeLogging,
} from './logger'

export { withObservability } from './middleware'

/**
 * Initialize all observability systems
 * Call this once at application startup
 */
export function initializeObservability() {
  const isPlatform = process.env.NEXT_PUBLIC_PLATFORM === 'true'

  if (!isPlatform) {
    console.log('[Observability] Skipping initialization - not in platform mode')
    return
  }

  console.log('[Observability] Initializing observability stack...')

  // Import and initialize each system
  const { initializeTracing } = require('./tracing')
  const { initializeMetrics } = require('./metrics')
  const { initializeLogging } = require('./logger')

  initializeTracing()
  initializeMetrics()
  initializeLogging()

  console.log('[Observability] Observability stack initialized successfully')
}
