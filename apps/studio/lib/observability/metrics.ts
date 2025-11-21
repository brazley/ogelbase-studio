import * as promClient from 'prom-client'

// Create a registry for metrics
export const register = new promClient.Registry()

// Add default metrics (process metrics, GC metrics, etc.)
promClient.collectDefaultMetrics({ register })

// HTTP Request metrics
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'org_id', 'project_id'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
})

export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'org_id', 'project_id'],
  registers: [register],
})

export const httpRequestErrorsTotal = new promClient.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type', 'org_id', 'project_id'],
  registers: [register],
})

// Database Query metrics
export const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'table', 'org_id', 'project_id'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
})

export const dbQueryTotal = new promClient.Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['query_type', 'table', 'status', 'org_id', 'project_id'],
  registers: [register],
})

export const dbQueryErrorsTotal = new promClient.Counter({
  name: 'db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['query_type', 'table', 'error_type', 'org_id', 'project_id'],
  registers: [register],
})

// Connection Pool metrics
export const dbConnectionPoolActive = new promClient.Gauge({
  name: 'db_connection_pool_active',
  help: 'Number of active database connections',
  labelNames: ['database', 'org_id', 'project_id'],
  registers: [register],
})

export const dbConnectionPoolIdle = new promClient.Gauge({
  name: 'db_connection_pool_idle',
  help: 'Number of idle database connections',
  labelNames: ['database', 'org_id', 'project_id'],
  registers: [register],
})

export const dbConnectionPoolWaiting = new promClient.Gauge({
  name: 'db_connection_pool_waiting',
  help: 'Number of queries waiting for a connection',
  labelNames: ['database', 'org_id', 'project_id'],
  registers: [register],
})

export const dbConnectionPoolMax = new promClient.Gauge({
  name: 'db_connection_pool_max',
  help: 'Maximum number of connections in the pool',
  labelNames: ['database', 'org_id', 'project_id'],
  registers: [register],
})

// Cache metrics
export const cacheHitsTotal = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'org_id', 'project_id'],
  registers: [register],
})

export const cacheMissesTotal = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'org_id', 'project_id'],
  registers: [register],
})

// API-specific metrics
export const apiAuthenticationAttempts = new promClient.Counter({
  name: 'api_authentication_attempts_total',
  help: 'Total number of API authentication attempts',
  labelNames: ['status', 'org_id'],
  registers: [register],
})

export const apiAuthenticationDuration = new promClient.Histogram({
  name: 'api_authentication_duration_seconds',
  help: 'Duration of API authentication in seconds',
  labelNames: ['status', 'org_id'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
})

// Platform-specific metrics
export const platformProjectsActive = new promClient.Gauge({
  name: 'platform_projects_active',
  help: 'Number of active projects',
  labelNames: ['org_id'],
  registers: [register],
})

export const platformOrganizationsActive = new promClient.Gauge({
  name: 'platform_organizations_active',
  help: 'Number of active organizations',
  registers: [register],
})

// Business metrics
export const apiRequestsByEndpoint = new promClient.Counter({
  name: 'api_requests_by_endpoint_total',
  help: 'Total API requests grouped by endpoint',
  labelNames: ['endpoint', 'org_id', 'project_id'],
  registers: [register],
})

/**
 * Helper function to track HTTP request metrics
 */
export function trackHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number,
  orgId?: string,
  projectId?: string
) {
  const labels = {
    method,
    route,
    status_code: statusCode.toString(),
    org_id: orgId || 'unknown',
    project_id: projectId || 'unknown',
  }

  httpRequestDuration.observe(labels, duration)
  httpRequestTotal.inc(labels)

  // Track errors (4xx and 5xx)
  if (statusCode >= 400) {
    const errorType = statusCode >= 500 ? 'server_error' : 'client_error'
    httpRequestErrorsTotal.inc({
      method,
      route,
      error_type: errorType,
      org_id: orgId || 'unknown',
      project_id: projectId || 'unknown',
    })
  }
}

/**
 * Helper function to track database query metrics
 */
export function trackDatabaseQuery(
  queryType: string,
  table: string,
  duration: number,
  success: boolean,
  orgId?: string,
  projectId?: string,
  error?: Error
) {
  const baseLabels = {
    query_type: queryType,
    table,
    org_id: orgId || 'unknown',
    project_id: projectId || 'unknown',
  }

  dbQueryDuration.observe(baseLabels, duration)
  dbQueryTotal.inc({
    ...baseLabels,
    status: success ? 'success' : 'error',
  })

  if (!success && error) {
    dbQueryErrorsTotal.inc({
      ...baseLabels,
      error_type: error.name || 'UnknownError',
    })
  }
}

/**
 * Update connection pool metrics
 */
export function updateConnectionPoolMetrics(
  database: string,
  active: number,
  idle: number,
  waiting: number,
  max: number,
  orgId?: string,
  projectId?: string
) {
  const labels = {
    database,
    org_id: orgId || 'unknown',
    project_id: projectId || 'unknown',
  }

  dbConnectionPoolActive.set(labels, active)
  dbConnectionPoolIdle.set(labels, idle)
  dbConnectionPoolWaiting.set(labels, waiting)
  dbConnectionPoolMax.set(labels, max)
}

/**
 * Initialize metrics collection
 */
export function initializeMetrics() {
  const isPlatform = process.env.NEXT_PUBLIC_PLATFORM === 'true'

  if (!isPlatform) {
    console.log('[Metrics] Skipping Prometheus metrics initialization - not in platform mode')
    return
  }

  console.log('[Metrics] Prometheus metrics initialized successfully')
  console.log(`[Metrics] Metrics available at /api/platform/metrics`)
}
