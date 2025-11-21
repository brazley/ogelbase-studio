# Production Observability Stack: World-Class Implementation Guide
**Infrastructure Architect**: Nikolai Volkov
**Date**: November 20, 2025
**Target Grade**: C → A (World-Class)
**Platform**: Railway.app Multi-Database Management SaaS
**Stack**: Grafana Cloud + OpenTelemetry + Prometheus

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [OpenTelemetry Setup](#opentelemetry-setup)
3. [Metrics Implementation](#metrics-implementation)
4. [Structured Logging](#structured-logging)
5. [Grafana Cloud Configuration](#grafana-cloud-configuration)
6. [Dashboard Templates](#dashboard-templates)
7. [SLO/SLI Implementation](#slosli-implementation)
8. [Alert Definitions](#alert-definitions)
9. [Runbook Templates](#runbook-templates)
10. [Cost Analysis](#cost-analysis)
11. [Implementation Plan](#implementation-plan)
12. [Testing Strategy](#testing-strategy)
13. [IaC Templates](#iac-templates)

---

## Executive Summary

### Current State: Grade C
- **No distributed tracing**: Cannot debug cross-service issues
- **No structured logging**: Logs are scattered, unqueryable
- **No metrics collection**: No visibility into database performance
- **No SLO tracking**: Cannot measure reliability objectively
- **No alerting**: Reactive firefighting instead of proactive monitoring

### Target State: Grade A (World-Class)
- **Complete distributed tracing** via OpenTelemetry + Grafana Tempo
- **Structured JSON logging** with ECS format + correlation IDs
- **Comprehensive metrics** for PostgreSQL, Redis, MongoDB, and application
- **SLO-driven alerting** with multi-burn-rate strategies
- **99.9% uptime SLO** supported by error budget tracking

### Why Grafana Cloud Over Alternatives?

| Feature | Grafana Cloud | Datadog | New Relic | Self-Hosted |
|---------|---------------|---------|-----------|-------------|
| **Cost** (50 hosts, 1TB logs/mo) | $1,200/mo | $8,000/mo | $2,500/mo | $6,700/mo* |
| **Vendor Lock-in** | None (OSS) | High | Medium | None |
| **Setup Time** | 1 week | 2 days | 1 week | 4 weeks |
| **Operational Overhead** | Low | None | None | High (0.5 FTE) |
| **Multi-Tenant Support** | Excellent | Good | Good | Excellent |
| **OpenTelemetry Native** | Yes | Partial | Partial | Yes |

*Includes infrastructure + 0.5 FTE operational overhead

**Decision**: **Grafana Cloud** provides 80-85% cost savings with zero vendor lock-in and production-ready managed services.

### Expected Outcomes

After full implementation (8 weeks):

✅ **Mean Time to Detection (MTTD)**: <5 minutes for critical issues
✅ **Mean Time to Resolution (MTTR)**: <15 minutes for common issues
✅ **API Availability SLO**: 99.9% compliance (43.8 min downtime/month max)
✅ **Cost**: <$1,500/month total observability spend
✅ **Trace Retention**: 30 days with 10% sampling + 100% errors
✅ **Zero blind spots**: Full visibility into PostgreSQL, Redis, MongoDB

---

## OpenTelemetry Setup

### 1. Installation

```bash
# Install OpenTelemetry dependencies
cd apps/studio
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/instrumentation-pg \
  @opentelemetry/instrumentation-redis-4 \
  @opentelemetry/instrumentation-mongodb \
  @opentelemetry/instrumentation-http \
  @opentelemetry/instrumentation-express \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

### 2. Core Instrumentation

**File**: `/apps/studio/lib/observability/instrumentation.ts`

```typescript
// instrumentation.ts - MUST be imported BEFORE any application code
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4'
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb'
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base'

// Environment configuration
const SERVICE_NAME = process.env.SERVICE_NAME || 'database-platform-api'
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0'
const ENVIRONMENT = process.env.NODE_ENV || 'production'
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector.railway.internal:4318'

// Create OpenTelemetry SDK
const sdk = new NodeSDK({
  // Service identification
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
    // Railway-specific attributes
    'railway.project.id': process.env.RAILWAY_PROJECT_ID || '',
    'railway.service.name': process.env.RAILWAY_SERVICE_NAME || '',
  }),

  // Trace exporter to OpenTelemetry Collector
  traceExporter: new OTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
    compression: CompressionAlgorithm.GZIP,
    headers: {
      'x-scope-orgid': process.env.GRAFANA_TENANT_ID || 'default',
    },
  }),

  // Metrics exporter to OpenTelemetry Collector
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${OTEL_ENDPOINT}/v1/metrics`,
      compression: CompressionAlgorithm.GZIP,
      headers: {
        'x-scope-orgid': process.env.GRAFANA_TENANT_ID || 'default',
      },
    }),
    exportIntervalMillis: 60000, // Export every 60 seconds
  }),

  // Auto-instrumentation for common libraries
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Too noisy for filesystem operations
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: false,
      },
      '@opentelemetry/instrumentation-net': {
        enabled: false,
      },

      // HTTP instrumentation with tenant context
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        headersToSpanAttributes: {
          client: ['user-agent', 'x-tenant-id', 'x-organization-id'],
          server: ['x-request-id', 'x-tenant-id', 'x-organization-id'],
        },
        ignoreIncomingPaths: [
          '/health',
          '/metrics',
          '/_next/static',
          '/favicon.ico',
        ],
      },

      // Express.js instrumentation
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),

    // PostgreSQL instrumentation with query logging
    new PgInstrumentation({
      enhancedDatabaseReporting: true, // Include sanitized SQL queries
      responseHook: (span, result) => {
        span.setAttribute('db.rows_affected', result.rowCount || 0)
      },
    }),

    // Redis instrumentation
    new RedisInstrumentation({
      // Disable command argument logging (may contain sensitive data)
      dbStatementSerializer: (cmdName, cmdArgs) => cmdName,
    }),

    // MongoDB instrumentation
    new MongoDBInstrumentation({
      enhancedDatabaseReporting: true,
      responseHook: (span, result) => {
        if (result && typeof result === 'object') {
          span.setAttribute('db.documents_affected', result.modifiedCount || 0)
        }
      },
    }),
  ],
})

// Start the SDK
sdk.start()

console.log('[OpenTelemetry] Instrumentation initialized', {
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  environment: ENVIRONMENT,
  endpoint: OTEL_ENDPOINT,
})

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown()
    console.log('[OpenTelemetry] SDK shut down successfully')
  } catch (error) {
    console.error('[OpenTelemetry] Error shutting down SDK', error)
  } finally {
    process.exit(0)
  }
})

export default sdk
```

### 3. Custom Spans for Business Operations

**File**: `/apps/studio/lib/observability/tracing.ts`

```typescript
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api'

const tracer = trace.getTracer('database-platform', '1.0.0')

/**
 * Trace database provisioning operation with detailed spans
 */
export async function traceDatabaseProvisioning<T>(
  tenantId: string,
  organizationId: string,
  dbConfig: {
    type: 'postgresql' | 'redis' | 'mongodb'
    size: string
    region: string
    name: string
  },
  operation: () => Promise<T>
): Promise<T> {
  return await tracer.startActiveSpan(
    'database.provision',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'tenant.id': tenantId,
        'organization.id': organizationId,
        'db.type': dbConfig.type,
        'db.size': dbConfig.size,
        'db.region': dbConfig.region,
        'db.name': dbConfig.name,
        'operation.type': 'provision',
      },
    },
    async (span) => {
      const startTime = Date.now()

      try {
        // Create nested spans for each provisioning step
        const result = await operation()

        // Record success metrics
        span.setStatus({ code: SpanStatusCode.OK })
        span.setAttribute('provisioning.duration_ms', Date.now() - startTime)
        span.setAttribute('provisioning.status', 'success')

        return result
      } catch (error) {
        // Record error details
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        span.setAttribute('provisioning.status', 'failure')
        span.setAttribute('provisioning.error', (error as Error).message)

        throw error
      } finally {
        span.end()
      }
    }
  )
}

/**
 * Trace database query execution
 */
export async function traceDatabaseQuery<T>(
  dbType: 'postgresql' | 'redis' | 'mongodb',
  operation: string,
  tenantId: string,
  query: () => Promise<T>
): Promise<T> {
  return await tracer.startActiveSpan(
    `db.query.${operation}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': dbType,
        'db.operation': operation,
        'tenant.id': tenantId,
      },
    },
    async (span) => {
      const startTime = Date.now()

      try {
        const result = await query()

        span.setStatus({ code: SpanStatusCode.OK })
        span.setAttribute('db.query.duration_ms', Date.now() - startTime)

        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })

        throw error
      } finally {
        span.end()
      }
    }
  )
}

/**
 * Trace backup operation
 */
export async function traceBackupOperation<T>(
  dbId: string,
  dbType: string,
  tenantId: string,
  backup: () => Promise<T>
): Promise<T> {
  return await tracer.startActiveSpan(
    'database.backup',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'db.id': dbId,
        'db.type': dbType,
        'tenant.id': tenantId,
        'operation.type': 'backup',
      },
    },
    async (span) => {
      const startTime = Date.now()

      try {
        const result = await backup()

        span.setStatus({ code: SpanStatusCode.OK })
        span.setAttribute('backup.duration_ms', Date.now() - startTime)
        span.setAttribute('backup.status', 'success')

        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        span.setAttribute('backup.status', 'failure')

        throw error
      } finally {
        span.end()
      }
    }
  )
}

/**
 * Get current trace and span IDs for correlation
 */
export function getTraceContext(): { traceId: string; spanId: string } | null {
  const span = trace.getActiveSpan()
  if (!span) return null

  const spanContext = span.spanContext()
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  }
}
```

### 4. Tenant Context Propagation Middleware

**File**: `/apps/studio/lib/observability/tenant-context-middleware.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { trace, context, propagation, Baggage } from '@opentelemetry/api'

/**
 * Middleware to propagate tenant context through all traces, logs, and metrics
 */
export function tenantContextMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
) {
  const tenantId = req.headers['x-tenant-id'] as string
  const organizationId = req.headers['x-organization-id'] as string

  // Get current active span
  const span = trace.getActiveSpan()

  if (span) {
    // Add tenant attributes to span (for filtering in Tempo)
    if (tenantId) span.setAttribute('tenant.id', tenantId)
    if (organizationId) span.setAttribute('organization.id', organizationId)

    // Add tier information for rate limiting insights
    const tier = getTenantTier(tenantId) // 'free', 'pro', 'enterprise'
    span.setAttribute('tenant.tier', tier)

    // Add request metadata
    span.setAttribute('http.method', req.method || '')
    span.setAttribute('http.url', req.url || '')
  }

  // Propagate tenant context via baggage (cross-service)
  const baggageEntries = new Map<string, string>()
  if (tenantId) baggageEntries.set('tenant.id', tenantId)
  if (organizationId) baggageEntries.set('organization.id', organizationId)

  const baggage = propagation.createBaggage(Object.fromEntries(baggageEntries))
  const ctxWithBaggage = propagation.setBaggage(context.active(), baggage)

  // Execute request handler within tenant context
  context.with(ctxWithBaggage, () => {
    next()
  })
}

/**
 * Determine tenant tier from database or cache
 */
function getTenantTier(tenantId: string | null): string {
  if (!tenantId) return 'unknown'

  // TODO: Query platform database or Redis cache for tenant tier
  // For now, return default
  return 'free'
}

/**
 * Extract tenant context from current context
 */
export function getCurrentTenantContext(): {
  tenantId: string | null
  organizationId: string | null
  tier: string
} {
  const baggage = propagation.getBaggage(context.active())

  return {
    tenantId: baggage?.getEntry('tenant.id')?.value || null,
    organizationId: baggage?.getEntry('organization.id')?.value || null,
    tier: baggage?.getEntry('tenant.tier')?.value || 'unknown',
  }
}
```

### 5. Application Entry Point Update

**File**: `/apps/studio/pages/_app.tsx` (or equivalent)

```typescript
// CRITICAL: Import instrumentation FIRST (before any other imports)
import '../lib/observability/instrumentation'

// Now import other dependencies
import { AppProps } from 'next/app'
import { useEffect } from 'react'

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    console.log('[App] OpenTelemetry instrumentation loaded')
  }, [])

  return <Component {...pageProps} />
}

export default MyApp
```

### 6. Sampling Configuration

**File**: `/infrastructure/otel-collector-config.yaml`

```yaml
# OpenTelemetry Collector Configuration
# Deploy as Railway service

receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - "https://ogelbase-studio.vercel.app"
            - "https://*.vercel.app"
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  # Batch processing for efficiency
  batch:
    timeout: 10s
    send_batch_size: 1024
    send_batch_max_size: 2048

  # Memory limiter to prevent OOM
  memory_limiter:
    check_interval: 1s
    limit_mib: 1024
    spike_limit_mib: 256

  # Add resource attributes
  resource:
    attributes:
      - key: deployment.environment
        value: production
        action: insert
      - key: platform
        value: railway
        action: insert

  # Tail-based sampling (intelligent sampling after trace completes)
  tail_sampling:
    decision_wait: 30s
    num_traces: 100000
    expected_new_traces_per_sec: 1000
    policies:
      # ALWAYS sample errors (100%)
      - name: error-policy
        type: status_code
        status_code:
          status_codes: [ERROR]

      # ALWAYS sample slow requests (>1s)
      - name: slow-requests
        type: latency
        latency:
          threshold_ms: 1000

      # ALWAYS sample critical operations (100%)
      - name: critical-operations
        type: string_attribute
        string_attribute:
          key: operation.type
          values:
            - provision
            - backup
            - delete
            - restore

      # ALWAYS sample specific tenants (for debugging)
      - name: debug-tenants
        type: string_attribute
        string_attribute:
          key: tenant.id
          values:
            - debug-tenant-1
            - debug-tenant-2

      # Probabilistic sampling for normal traffic (10%)
      - name: probabilistic-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

exporters:
  # Export to Grafana Tempo (traces)
  otlp/tempo:
    endpoint: ${GRAFANA_TEMPO_ENDPOINT}
    headers:
      authorization: "Bearer ${GRAFANA_API_KEY}"
    compression: gzip

  # Export to Grafana Mimir (metrics via Prometheus)
  prometheusremotewrite:
    endpoint: ${GRAFANA_MIMIR_ENDPOINT}/api/prom/push
    headers:
      authorization: "Bearer ${GRAFANA_API_KEY}"

  # Export logs to Grafana Loki
  loki:
    endpoint: ${GRAFANA_LOKI_ENDPOINT}/loki/api/v1/push
    headers:
      authorization: "Bearer ${GRAFANA_API_KEY}"
    tenant_id: "database-platform"

  # Debug logging (development only)
  logging:
    loglevel: info
    sampling_initial: 5
    sampling_thereafter: 200

service:
  pipelines:
    # Traces pipeline
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource, tail_sampling]
      exporters: [otlp/tempo, logging]

    # Metrics pipeline
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [prometheusremotewrite, logging]

    # Logs pipeline
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [loki, logging]
```

---

## Metrics Implementation

### 1. Prometheus Client Setup

**File**: `/apps/studio/lib/observability/metrics.ts`

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

// Create dedicated registry
export const register = new Registry()

// Collect default Node.js metrics (CPU, memory, event loop)
collectDefaultMetrics({
  register,
  prefix: 'database_platform_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
})

// ============================================
// HTTP Request Metrics
// ============================================

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'tenant_id', 'tier'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
})

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'tenant_id', 'tier'],
  registers: [register],
})

// ============================================
// Database Query Metrics
// ============================================

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['db_type', 'operation', 'tenant_id', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
})

export const databaseQueriesTotal = new Counter({
  name: 'database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['db_type', 'operation', 'tenant_id', 'status'],
  registers: [register],
})

// ============================================
// Connection Pool Metrics
// ============================================

export const databaseConnectionPoolSize = new Gauge({
  name: 'database_connection_pool_size',
  help: 'Number of connections in the pool by state',
  labelNames: ['db_type', 'tenant_id', 'state'], // state: active, idle, waiting
  registers: [register],
})

export const databaseConnectionPoolUtilization = new Gauge({
  name: 'database_connection_pool_utilization',
  help: 'Connection pool utilization ratio (0-1)',
  labelNames: ['db_type', 'tenant_id'],
  registers: [register],
})

// ============================================
// Business Operation Metrics
// ============================================

export const databaseProvisioningTotal = new Counter({
  name: 'database_provisioning_total',
  help: 'Total number of database provisioning operations',
  labelNames: ['db_type', 'status', 'tenant_id', 'tier'], // status: success, failure
  registers: [register],
})

export const databaseProvisioningDuration = new Histogram({
  name: 'database_provisioning_duration_seconds',
  help: 'Duration of database provisioning operations',
  labelNames: ['db_type', 'tenant_id', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
})

export const databaseBackupTotal = new Counter({
  name: 'database_backup_total',
  help: 'Total number of database backup operations',
  labelNames: ['db_type', 'status', 'tenant_id'],
  registers: [register],
})

export const databaseBackupDuration = new Histogram({
  name: 'database_backup_duration_seconds',
  help: 'Duration of database backup operations',
  labelNames: ['db_type', 'tenant_id', 'status'],
  buckets: [5, 10, 30, 60, 300, 600, 1800, 3600],
  registers: [register],
})

// ============================================
// Tenant Metrics
// ============================================

export const activeTenantsGauge = new Gauge({
  name: 'active_tenants_total',
  help: 'Number of active tenants by tier',
  labelNames: ['tier'], // tier: free, pro, enterprise
  registers: [register],
})

export const activeDatabasesGauge = new Gauge({
  name: 'active_databases_total',
  help: 'Number of active databases by type',
  labelNames: ['db_type', 'tier'],
  registers: [register],
})

// ============================================
// Error Metrics
// ============================================

export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'component', 'tenant_id'],
  registers: [register],
})

// ============================================
// Metrics Export Endpoint
// ============================================

export function getMetrics(): Promise<string> {
  return register.metrics()
}
```

### 2. HTTP Metrics Middleware

**File**: `/apps/studio/lib/observability/metrics-middleware.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { httpRequestDuration, httpRequestsTotal } from './metrics'
import { getCurrentTenantContext } from './tenant-context-middleware'

/**
 * Middleware to record HTTP request metrics
 */
export function metricsMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
) {
  const startTime = Date.now()
  const { tenantId, tier } = getCurrentTenantContext()

  // Hook into response finish event
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000
    const labels = {
      method: req.method || 'UNKNOWN',
      route: req.url?.split('?')[0] || '/unknown',
      status_code: res.statusCode.toString(),
      tenant_id: tenantId || 'unknown',
      tier: tier || 'unknown',
    }

    // Record duration histogram
    httpRequestDuration.labels(labels).observe(duration)

    // Increment request counter
    httpRequestsTotal.labels(labels).inc()
  })

  next()
}
```

### 3. Database Metrics Instrumentation

**File**: `/apps/studio/lib/observability/database-metrics.ts`

```typescript
import {
  databaseQueryDuration,
  databaseQueriesTotal,
  databaseConnectionPoolSize,
  databaseConnectionPoolUtilization,
} from './metrics'
import { getCurrentTenantContext } from './tenant-context-middleware'

/**
 * Record database query metrics
 */
export function recordDatabaseQuery(
  dbType: 'postgresql' | 'redis' | 'mongodb',
  operation: string,
  durationMs: number,
  status: 'success' | 'error'
) {
  const { tenantId } = getCurrentTenantContext()
  const durationSeconds = durationMs / 1000

  const labels = {
    db_type: dbType,
    operation,
    tenant_id: tenantId || 'unknown',
    status,
  }

  // Record query duration
  databaseQueryDuration.labels(labels).observe(durationSeconds)

  // Increment query counter
  databaseQueriesTotal.labels(labels).inc()
}

/**
 * Update connection pool metrics
 */
export function updateConnectionPoolMetrics(
  dbType: 'postgresql' | 'redis' | 'mongodb',
  tenantId: string,
  metrics: {
    total: number
    active: number
    idle: number
    waiting: number
  }
) {
  const baseLabels = { db_type: dbType, tenant_id: tenantId }

  // Update pool size gauges
  databaseConnectionPoolSize.labels({ ...baseLabels, state: 'total' }).set(metrics.total)
  databaseConnectionPoolSize.labels({ ...baseLabels, state: 'active' }).set(metrics.active)
  databaseConnectionPoolSize.labels({ ...baseLabels, state: 'idle' }).set(metrics.idle)
  databaseConnectionPoolSize.labels({ ...baseLabels, state: 'waiting' }).set(metrics.waiting)

  // Calculate utilization
  const utilization = metrics.total > 0 ? metrics.active / metrics.total : 0
  databaseConnectionPoolUtilization.labels(baseLabels).set(utilization)
}

/**
 * Monitor PostgreSQL connection pool (integrate with existing pool)
 */
export function monitorPostgresPool(pool: any, dbType: string, tenantId: string) {
  setInterval(() => {
    const metrics = {
      total: pool.totalCount || 0,
      active: (pool.totalCount || 0) - (pool.idleCount || 0),
      idle: pool.idleCount || 0,
      waiting: pool.waitingCount || 0,
    }

    updateConnectionPoolMetrics('postgresql', tenantId, metrics)
  }, 30000) // Update every 30 seconds
}
```

### 4. Metrics Endpoint

**File**: `/apps/studio/pages/api/metrics.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { getMetrics } from 'lib/observability/metrics'

/**
 * Prometheus metrics scrape endpoint
 * Called by OpenTelemetry Collector or Prometheus
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const metrics = await getMetrics()

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    res.status(200).send(metrics)
  } catch (error) {
    console.error('[Metrics] Error exporting metrics:', error)
    res.status(500).json({ error: 'Failed to export metrics' })
  }
}
```

---

## Structured Logging

### 1. Winston Logger Setup

**File**: `/apps/studio/lib/observability/logger.ts`

```typescript
import winston from 'winston'
import ecsFormat from '@elastic/ecs-winston-format'
import { trace, context } from '@opentelemetry/api'
import { getCurrentTenantContext } from './tenant-context-middleware'

// Create ECS-formatted logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: ecsFormat({
    convertReqRes: true,
    convertErr: true,
  }),
  defaultMeta: {
    service: {
      name: process.env.SERVICE_NAME || 'database-platform-api',
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'production',
    },
  },
  transports: [
    // Console output (captured by Railway logs)
    new winston.transports.Console({
      format: winston.format.combine(
        ecsFormat(),
        winston.format.json()
      ),
    }),
  ],
})

/**
 * Enhanced logger with automatic trace correlation and tenant context
 */
class ContextualLogger {
  private logger: winston.Logger

  constructor(logger: winston.Logger) {
    this.logger = logger
  }

  private enrichMetadata(meta: any = {}): any {
    // Add trace context for correlation
    const span = trace.getActiveSpan()
    const spanContext = span?.spanContext()

    // Add tenant context
    const tenantContext = getCurrentTenantContext()

    return {
      ...meta,
      trace: spanContext
        ? {
            trace_id: spanContext.traceId,
            span_id: spanContext.spanId,
            trace_flags: spanContext.traceFlags,
          }
        : undefined,
      tenant: tenantContext.tenantId
        ? {
            id: tenantContext.tenantId,
            organization_id: tenantContext.organizationId,
            tier: tenantContext.tier,
          }
        : undefined,
    }
  }

  debug(message: string, meta?: any) {
    this.logger.debug(message, this.enrichMetadata(meta))
  }

  info(message: string, meta?: any) {
    this.logger.info(message, this.enrichMetadata(meta))
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, this.enrichMetadata(meta))
  }

  error(message: string, meta?: any) {
    this.logger.error(message, this.enrichMetadata(meta))
  }

  /**
   * Log database operation
   */
  logDatabaseOperation(
    operation: string,
    dbType: string,
    durationMs: number,
    status: 'success' | 'error',
    meta?: any
  ) {
    const level = status === 'error' ? 'error' : durationMs > 1000 ? 'warn' : 'debug'

    this.logger.log(level, `Database operation: ${operation}`, this.enrichMetadata({
      ...meta,
      db: {
        type: dbType,
        operation,
        duration_ms: durationMs,
        status,
      },
    }))
  }

  /**
   * Log provisioning operation
   */
  logProvisioning(
    dbType: string,
    durationMs: number,
    status: 'success' | 'error',
    meta?: any
  ) {
    const level = status === 'error' ? 'error' : 'info'

    this.logger.log(level, `Database provisioning ${status}`, this.enrichMetadata({
      ...meta,
      provisioning: {
        db_type: dbType,
        duration_ms: durationMs,
        status,
      },
    }))
  }
}

export const logger = new ContextualLogger(baseLogger)
export default logger
```

### 2. PII Redaction

**File**: `/apps/studio/lib/observability/pii-redaction.ts`

```typescript
/**
 * Redact sensitive information from strings (SQL queries, connection strings, etc.)
 */
export function redactPII(text: string): string {
  let redacted = text

  // Redact email addresses
  redacted = redacted.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]'
  )

  // Redact phone numbers
  redacted = redacted.replace(
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    '[PHONE_REDACTED]'
  )

  // Redact credit card numbers
  redacted = redacted.replace(
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    '[CARD_REDACTED]'
  )

  // Redact passwords in connection strings
  redacted = redacted.replace(
    /:\/\/([^:]+):([^@]+)@/g,
    '://$1:[PASSWORD_REDACTED]@'
  )

  // Redact API keys (common patterns)
  redacted = redacted.replace(
    /\b[A-Za-z0-9_-]{32,}\b/g,
    '[API_KEY_REDACTED]'
  )

  return redacted
}

/**
 * Sanitize SQL query for logging
 */
export function sanitizeSQLQuery(sql: string): string {
  let sanitized = redactPII(sql)

  // Replace actual values with placeholders
  sanitized = sanitized.replace(/'[^']*'/g, "'[VALUE]'")
  sanitized = sanitized.replace(/\b\d+\b/g, '[NUMBER]')

  return sanitized
}
```

### 3. Usage Examples

**File**: `/apps/studio/lib/api/platform/database.ts` (updated)

```typescript
import logger from 'lib/observability/logger'
import { recordDatabaseQuery } from 'lib/observability/database-metrics'
import { sanitizeSQLQuery } from 'lib/observability/pii-redaction'

export async function queryPlatformDatabase(params: {
  query: string
  parameters?: any[]
}) {
  const startTime = Date.now()

  try {
    logger.debug('Executing database query', {
      query: sanitizeSQLQuery(params.query),
      parameter_count: params.parameters?.length || 0,
    })

    // Execute query (existing logic)
    const result = await executeQuery(params)

    const duration = Date.now() - startTime

    // Log success
    logger.logDatabaseOperation(
      'query',
      'postgresql',
      duration,
      'success',
      {
        rows_returned: result.rows?.length || 0,
      }
    )

    // Record metrics
    recordDatabaseQuery('postgresql', 'query', duration, 'success')

    return result
  } catch (error) {
    const duration = Date.now() - startTime

    // Log error
    logger.logDatabaseOperation(
      'query',
      'postgresql',
      duration,
      'error',
      {
        error: {
          message: (error as Error).message,
          code: (error as any).code,
        },
      }
    )

    // Record error metrics
    recordDatabaseQuery('postgresql', 'query', duration, 'error')

    throw error
  }
}
```

---

## Grafana Cloud Configuration

### 1. Account Setup

**Step 1: Create Grafana Cloud Account**

1. Go to https://grafana.com/auth/sign-up
2. Sign up with email (use company email: observability@ogelbase.com)
3. Select **Free Tier** to start (includes 10K metrics, 50GB logs, 50GB traces)
4. Create organization: "OgelBase"

**Step 2: Get API Credentials**

```bash
# Navigate to Grafana Cloud Console
# My Account → API Keys → Create API Key

# Copy the following:
GRAFANA_API_KEY=<your-api-key>
GRAFANA_INSTANCE_ID=<your-instance-id>
GRAFANA_TENANT_ID=<your-org-id>

# Endpoints (provided in console)
GRAFANA_TEMPO_ENDPOINT=https://tempo-<region>.grafana.net:443
GRAFANA_MIMIR_ENDPOINT=https://prometheus-<region>.grafana.net/api/prom
GRAFANA_LOKI_ENDPOINT=https://logs-<region>.grafana.net
```

### 2. Railway Environment Variables

**File**: Add to Railway Dashboard → studio service → Variables

```bash
# Grafana Cloud Configuration
GRAFANA_API_KEY=<your-grafana-api-key>
GRAFANA_TEMPO_ENDPOINT=https://tempo-us-central1.grafana.net:443
GRAFANA_MIMIR_ENDPOINT=https://prometheus-us-central1.grafana.net/api/prom
GRAFANA_LOKI_ENDPOINT=https://logs-us-central1.grafana.net
GRAFANA_TENANT_ID=database-platform

# OpenTelemetry Collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.railway.internal:4318
```

### 3. Deploy OpenTelemetry Collector on Railway

**Step 1: Create Collector Service**

```bash
# Via Railway Dashboard
1. Create new service: "otel-collector"
2. Use Docker image: otel/opentelemetry-collector-contrib:latest
3. Add environment variables (from step 2)
4. Mount config file: /etc/otel/config.yaml
5. Deploy
```

**Step 2: Collector Dockerfile**

**File**: `/infrastructure/otel-collector/Dockerfile`

```dockerfile
FROM otel/opentelemetry-collector-contrib:0.91.0

# Copy custom configuration
COPY otel-collector-config.yaml /etc/otel/config.yaml

# Expose ports
EXPOSE 4317 4318 8888 8889

# Start collector
ENTRYPOINT ["/otelcol-contrib"]
CMD ["--config=/etc/otel/config.yaml"]
```

### 4. Data Source Configuration

**In Grafana Cloud UI:**

**Step 1: Configure Tempo (Traces)**
1. Navigate to: Configuration → Data Sources → Add data source
2. Select: Tempo
3. URL: `https://tempo-<region>.grafana.net`
4. Auth: Use API key from step 1
5. Test connection → Save

**Step 2: Configure Mimir (Metrics)**
1. Add data source: Prometheus
2. URL: `https://prometheus-<region>.grafana.net/api/prom`
3. Auth: Use API key
4. Test → Save

**Step 3: Configure Loki (Logs)**
1. Add data source: Loki
2. URL: `https://logs-<region>.grafana.net`
3. Auth: Use API key
4. Test → Save

---

## Dashboard Templates

### 1. System Overview Dashboard

**File**: `/infrastructure/grafana/dashboards/system-overview.json`

```json
{
  "dashboard": {
    "title": "OgelBase - System Overview",
    "tags": ["ogelbase", "overview"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "API Request Rate (req/s)",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (status_code)",
            "legendFormat": "{{ status_code }}",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 }
      },
      {
        "id": 2,
        "title": "API Latency (p50, p95, p99)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "p50",
            "refId": "A"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "p95",
            "refId": "B"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "p99",
            "refId": "C"
          }
        ],
        "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 }
      },
      {
        "id": 3,
        "title": "Error Rate (%)",
        "type": "stat",
        "targets": [
          {
            "expr": "(sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))) * 100",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 0, "y": 8, "w": 6, "h": 4 },
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 1, "color": "yellow" },
                { "value": 5, "color": "red" }
              ]
            },
            "unit": "percent"
          }
        }
      },
      {
        "id": 4,
        "title": "Active Tenants",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(active_tenants_total)",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 6, "y": 8, "w": 6, "h": 4 }
      }
    ],
    "refresh": "30s",
    "time": { "from": "now-6h", "to": "now" }
  }
}
```

### 2. Database Performance Dashboard

**File**: `/infrastructure/grafana/dashboards/database-performance.json`

```json
{
  "dashboard": {
    "title": "OgelBase - Database Performance",
    "tags": ["ogelbase", "database"],
    "panels": [
      {
        "id": 1,
        "title": "PostgreSQL Query Latency (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(database_query_duration_seconds_bucket{db_type=\"postgresql\"}[5m])) by (le, operation))",
            "legendFormat": "{{ operation }}",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 0, "y": 0, "w": 8, "h": 8 }
      },
      {
        "id": 2,
        "title": "Redis Query Latency (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(database_query_duration_seconds_bucket{db_type=\"redis\"}[5m])) by (le, operation))",
            "legendFormat": "{{ operation }}",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 8, "y": 0, "w": 8, "h": 8 }
      },
      {
        "id": 3,
        "title": "MongoDB Query Latency (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(database_query_duration_seconds_bucket{db_type=\"mongodb\"}[5m])) by (le, operation))",
            "legendFormat": "{{ operation }}",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 16, "y": 0, "w": 8, "h": 8 }
      },
      {
        "id": 4,
        "title": "Connection Pool Utilization",
        "type": "graph",
        "targets": [
          {
            "expr": "database_connection_pool_utilization",
            "legendFormat": "{{ db_type }} ({{ tenant_id }})",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 0, "y": 8, "w": 12, "h": 8 },
        "yaxes": [
          { "format": "percentunit", "min": 0, "max": 1 }
        ],
        "alert": {
          "name": "Connection Pool Saturation",
          "conditions": [
            {
              "evaluator": { "type": "gt", "params": [0.9] },
              "operator": { "type": "and" },
              "query": { "params": ["A", "5m", "now"] },
              "reducer": { "type": "avg" },
              "type": "query"
            }
          ]
        }
      },
      {
        "id": 5,
        "title": "Query Error Rate by DB Type",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(database_queries_total{status=\"error\"}[5m])) by (db_type)",
            "legendFormat": "{{ db_type }}",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 12, "y": 8, "w": 12, "h": 8 }
      }
    ],
    "refresh": "10s"
  }
}
```

### 3. SLO Dashboard

**File**: `/infrastructure/grafana/dashboards/slo-tracking.json`

```json
{
  "dashboard": {
    "title": "OgelBase - SLO Tracking",
    "tags": ["ogelbase", "slo"],
    "panels": [
      {
        "id": 1,
        "title": "API Availability SLO (Target: 99.9%)",
        "type": "stat",
        "targets": [
          {
            "expr": "(sum(rate(http_requests_total{status_code!~\"5..\"}[30d])) / sum(rate(http_requests_total[30d]))) * 100",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 0, "y": 0, "w": 6, "h": 4 },
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 99.0, "color": "yellow" },
                { "value": 99.9, "color": "green" }
              ]
            },
            "unit": "percent",
            "decimals": 3
          }
        }
      },
      {
        "id": 2,
        "title": "Error Budget Remaining",
        "type": "gauge",
        "targets": [
          {
            "expr": "100 - ((sum(http_requests_total{status_code=~\"5..\"}) / sum(http_requests_total)) / 0.001 * 100)",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 6, "y": 0, "w": 6, "h": 4 },
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 50, "color": "yellow" },
                { "value": 80, "color": "green" }
              ]
            },
            "unit": "percent",
            "min": 0,
            "max": 100
          }
        }
      },
      {
        "id": 3,
        "title": "API Latency SLO Compliance (p95 < 200ms)",
        "type": "stat",
        "targets": [
          {
            "expr": "(sum(rate(http_request_duration_seconds_bucket{le=\"0.2\"}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))) * 100",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 12, "y": 0, "w": 6, "h": 4 },
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 95, "color": "yellow" },
                { "value": 99.5, "color": "green" }
              ]
            },
            "unit": "percent"
          }
        }
      },
      {
        "id": 4,
        "title": "Provisioning Success Rate SLO (Target: 99.5%)",
        "type": "stat",
        "targets": [
          {
            "expr": "(sum(rate(database_provisioning_total{status=\"success\"}[7d])) / sum(rate(database_provisioning_total[7d]))) * 100",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 18, "y": 0, "w": 6, "h": 4 }
      },
      {
        "id": 5,
        "title": "Error Budget Burn Rate (30d window)",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status_code=~\"5..\"}[1h])) / sum(rate(http_requests_total[1h]))",
            "legendFormat": "1h burn rate",
            "refId": "A"
          },
          {
            "expr": "sum(rate(http_requests_total{status_code=~\"5..\"}[6h])) / sum(rate(http_requests_total[6h]))",
            "legendFormat": "6h burn rate",
            "refId": "B"
          }
        ],
        "gridPos": { "x": 0, "y": 4, "w": 24, "h": 8 }
      }
    ]
  }
}
```

---

*(Continuing in next response due to length...)*

Would you like me to continue with:
- Alert Definitions (complete YAML)
- Runbook Templates (5 critical runbooks)
- Cost Analysis (detailed breakdown)
- Implementation Plan (8-week timeline)
- Testing Strategy (comprehensive test suite)
- IaC Templates (Terraform code)?
---

## Alert Definitions

### Complete Alert Rules

**File**: `/infrastructure/prometheus/alert-rules.yaml`

```yaml
groups:
  # ============================================
  # SLO-Based Alerts (Multi-Burn-Rate)
  # ============================================
  - name: slo_alerts
    interval: 30s
    rules:
      # Fast burn rate: Alert if 2% of error budget consumed in 1 hour
      - alert: ErrorBudgetBurnRateFast
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[1h])) /
            sum(rate(http_requests_total[1h]))
          ) > (0.001 * 14.4)
        for: 2m
        labels:
          severity: critical
          alert_type: slo_violation
          component: api
        annotations:
          summary: "CRITICAL: Fast error budget burn detected"
          description: "Error rate is {{ $value | humanizePercentage }}. At current rate, will exhaust error budget in 6 hours."
          runbook_url: "https://docs.ogelbase.com/runbooks/error-budget-burn"
          dashboard_url: "https://grafana.ogelbase.com/d/slo-dashboard"

      # Moderate burn rate: Alert if 5% of error budget consumed in 6 hours
      - alert: ErrorBudgetBurnRateModerate
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[6h])) /
            sum(rate(http_requests_total[6h]))
          ) > (0.001 * 6)
        for: 10m
        labels:
          severity: high
          alert_type: slo_violation
          component: api
        annotations:
          summary: "WARNING: Moderate error budget burn detected"
          description: "Error rate is {{ $value | humanizePercentage }}. Will exhaust error budget in 2 days at current rate."
          runbook_url: "https://docs.ogelbase.com/runbooks/error-budget-burn"

      # Slow burn rate: Alert if 10% of error budget consumed in 3 days
      - alert: ErrorBudgetBurnRateSlow
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[3d])) /
            sum(rate(http_requests_total[3d]))
          ) > (0.001 * 1)
        for: 30m
        labels:
          severity: medium
          alert_type: slo_violation
          component: api
        annotations:
          summary: "INFO: Slow error budget burn detected"
          description: "Error budget will be exhausted in 30 days at current rate."
          runbook_url: "https://docs.ogelbase.com/runbooks/error-budget-burn"

  # ============================================
  # API Health Alerts
  # ============================================
  - name: api_health
    interval: 30s
    rules:
      - alert: APIHighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m])) /
          sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
          component: api
        annotations:
          summary: "API error rate above 5%: {{ $value | humanizePercentage }}"
          description: "API is returning 5xx errors at an elevated rate."
          runbook_url: "https://docs.ogelbase.com/runbooks/api-high-error-rate"

      - alert: APIHighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          ) > 1.0
        for: 10m
        labels:
          severity: high
          component: api
        annotations:
          summary: "API p95 latency above 1s: {{ $value }}s"
          description: "API response times are degraded."
          runbook_url: "https://docs.ogelbase.com/runbooks/api-high-latency"

      - alert: APIRequestRateAnomalous
        expr: |
          abs(
            sum(rate(http_requests_total[5m])) -
            avg_over_time(sum(rate(http_requests_total[5m]))[1h:5m])
          ) > (2 * stddev_over_time(sum(rate(http_requests_total[5m]))[1h:5m]))
        for: 5m
        labels:
          severity: medium
          component: api
        annotations:
          summary: "Anomalous API request rate detected"
          description: "Request rate is {{ $value }} req/s (more than 2 std deviations from average)."

  # ============================================
  # Database Health Alerts
  # ============================================
  - name: database_health
    interval: 30s
    rules:
      # PostgreSQL Alerts
      - alert: PostgreSQLDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
          component: database
          db_type: postgresql
        annotations:
          summary: "PostgreSQL is down"
          description: "PostgreSQL instance {{ $labels.instance }} is not responding."
          runbook_url: "https://docs.ogelbase.com/runbooks/database-down"

      - alert: PostgreSQLConnectionPoolSaturated
        expr: |
          (database_connection_pool_size{db_type="postgresql", state="waiting"} > 0) or
          (database_connection_pool_utilization{db_type="postgresql"} > 0.9)
        for: 5m
        labels:
          severity: high
          component: database
          db_type: postgresql
        annotations:
          summary: "PostgreSQL connection pool saturated ({{ $labels.tenant_id }})"
          description: "Pool utilization: {{ $value | humanizePercentage }}"
          runbook_url: "https://docs.ogelbase.com/runbooks/connection-pool-saturation"

      - alert: PostgreSQLSlowQueries
        expr: |
          histogram_quantile(0.95,
            sum(rate(database_query_duration_seconds_bucket{db_type="postgresql"}[5m])) by (le)
          ) > 1.0
        for: 10m
        labels:
          severity: medium
          component: database
          db_type: postgresql
        annotations:
          summary: "PostgreSQL slow queries detected"
          description: "p95 query latency: {{ $value }}s (threshold: 1s)"
          runbook_url: "https://docs.ogelbase.com/runbooks/slow-queries"

      - alert: PostgreSQLReplicationLag
        expr: pg_replication_lag > 30
        for: 5m
        labels:
          severity: high
          component: database
          db_type: postgresql
        annotations:
          summary: "PostgreSQL replication lag high"
          description: "Replication lag: {{ $value }}s"
          runbook_url: "https://docs.ogelbase.com/runbooks/replication-lag"

      # Redis Alerts
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
          component: database
          db_type: redis
        annotations:
          summary: "Redis is down"
          description: "Redis instance {{ $labels.instance }} is not responding."
          runbook_url: "https://docs.ogelbase.com/runbooks/database-down"

      - alert: RedisMemoryHigh
        expr: |
          (redis_memory_used_bytes / redis_memory_max_bytes) > 0.85
        for: 5m
        labels:
          severity: high
          component: database
          db_type: redis
        annotations:
          summary: "Redis memory usage high: {{ $value | humanizePercentage }}"
          description: "Redis is approaching max memory limit."
          runbook_url: "https://docs.ogelbase.com/runbooks/redis-memory-high"

      - alert: RedisCacheHitRateLow
        expr: |
          (
            redis_keyspace_hits_total /
            (redis_keyspace_hits_total + redis_keyspace_misses_total)
          ) < 0.8
        for: 15m
        labels:
          severity: medium
          component: database
          db_type: redis
        annotations:
          summary: "Redis cache hit rate low: {{ $value | humanizePercentage }}"
          description: "Cache effectiveness is degraded."

      # MongoDB Alerts
      - alert: MongoDBDown
        expr: mongodb_up == 0
        for: 1m
        labels:
          severity: critical
          component: database
          db_type: mongodb
        annotations:
          summary: "MongoDB is down"
          description: "MongoDB instance {{ $labels.instance }} is not responding."
          runbook_url: "https://docs.ogelbase.com/runbooks/database-down"

      - alert: MongoDBReplicationLag
        expr: mongodb_mongod_replset_member_replication_lag > 30
        for: 5m
        labels:
          severity: high
          component: database
          db_type: mongodb
        annotations:
          summary: "MongoDB replication lag high"
          description: "Replication lag: {{ $value }}s"
          runbook_url: "https://docs.ogelbase.com/runbooks/replication-lag"

      - alert: MongoDBConnectionsHigh
        expr: |
          (mongodb_connections / mongodb_connections_available) > 0.8
        for: 5m
        labels:
          severity: high
          component: database
          db_type: mongodb
        annotations:
          summary: "MongoDB connections high: {{ $value | humanizePercentage }}"
          description: "MongoDB approaching connection limit."

  # ============================================
  # Business Operation Alerts
  # ============================================
  - name: business_operations
    interval: 30s
    rules:
      - alert: ProvisioningFailureRateHigh
        expr: |
          (
            sum(rate(database_provisioning_total{status="failure"}[1h])) /
            sum(rate(database_provisioning_total[1h]))
          ) > 0.05
        for: 10m
        labels:
          severity: high
          component: provisioning
        annotations:
          summary: "Database provisioning failure rate high: {{ $value | humanizePercentage }}"
          description: "More than 5% of provisioning operations are failing."
          runbook_url: "https://docs.ogelbase.com/runbooks/provisioning-failures"

      - alert: BackupFailure
        expr: |
          increase(database_backup_total{status="failure"}[1h]) > 0
        for: 5m
        labels:
          severity: high
          component: backup
        annotations:
          summary: "Database backup failed"
          description: "{{ $value }} backups have failed in the last hour."
          runbook_url: "https://docs.ogelbase.com/runbooks/backup-failure"

      - alert: ProvisioningDurationHigh
        expr: |
          histogram_quantile(0.95,
            sum(rate(database_provisioning_duration_seconds_bucket[1h])) by (le, db_type)
          ) > 300
        for: 30m
        labels:
          severity: medium
          component: provisioning
        annotations:
          summary: "Database provisioning taking too long"
          description: "p95 provisioning time for {{ $labels.db_type }}: {{ $value }}s (threshold: 300s)"

  # ============================================
  # Infrastructure Alerts
  # ============================================
  - name: infrastructure
    interval: 30s
    rules:
      - alert: HighMemoryUsage
        expr: |
          (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.9
        for: 5m
        labels:
          severity: high
          component: infrastructure
        annotations:
          summary: "High memory usage: {{ $value | humanizePercentage }}"
          description: "Instance {{ $labels.instance }} memory usage is critical."

      - alert: HighCPUUsage
        expr: |
          100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90
        for: 10m
        labels:
          severity: high
          component: infrastructure
        annotations:
          summary: "High CPU usage: {{ $value }}%"
          description: "Instance {{ $labels.instance }} CPU usage is critical."

      - alert: DiskSpaceLow
        expr: |
          (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: high
          component: infrastructure
        annotations:
          summary: "Disk space low: {{ $value | humanizePercentage }} available"
          description: "Instance {{ $labels.instance }} disk space is running low."
```

### PagerDuty Integration

**File**: `/infrastructure/prometheus/alertmanager.yaml`

```yaml
# Alertmanager Configuration
global:
  resolve_timeout: 5m
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  # Group alerts by tenant and alert name
  group_by: ['alertname', 'tenant_id', 'component']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-alerts'

  routes:
    # Critical alerts go to PagerDuty immediately
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      group_wait: 10s
      repeat_interval: 5m
      continue: true

    # High severity alerts go to PagerDuty with grouping
    - match:
        severity: high
      receiver: 'pagerduty-high'
      group_wait: 30s
      repeat_interval: 30m
      continue: true

    # Medium/low alerts go to Slack only
    - match_re:
        severity: (medium|low)
      receiver: 'slack-alerts'
      group_wait: 5m
      repeat_interval: 12h

receivers:
  # PagerDuty for critical incidents
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - routing_key: '${PAGERDUTY_CRITICAL_ROUTING_KEY}'
        severity: 'critical'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ template "pagerduty.default.instances" . }}'
          resolved: 'Alert resolved'
          runbook: '{{ .CommonAnnotations.runbook_url }}'
          dashboard: '{{ .CommonAnnotations.dashboard_url }}'
          tenant_id: '{{ .GroupLabels.tenant_id }}'
          component: '{{ .GroupLabels.component }}'

  # PagerDuty for high priority incidents
  - name: 'pagerduty-high'
    pagerduty_configs:
      - routing_key: '${PAGERDUTY_HIGH_ROUTING_KEY}'
        severity: 'error'
        description: '{{ .CommonAnnotations.summary }}'

  # Slack for all alerts (informational)
  - name: 'slack-alerts'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts'
        title: '{{ .CommonAnnotations.summary }}'
        text: |
          {{ range .Alerts }}
          *Alert:* {{ .Labels.alertname }}
          *Severity:* {{ .Labels.severity }}
          *Component:* {{ .Labels.component }}
          *Description:* {{ .Annotations.description }}
          *Runbook:* {{ .Annotations.runbook_url }}
          {{ end }}
        send_resolved: true

inhibit_rules:
  # Inhibit warning alerts if critical alert is firing
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'high'
    equal: ['alertname', 'component']

  # Inhibit medium alerts if high alert is firing
  - source_match:
      severity: 'high'
    target_match:
      severity: 'medium'
    equal: ['alertname', 'component']
```

---

## Runbook Templates

### Runbook 1: API High Error Rate

**File**: `/docs/runbooks/api-high-error-rate.md`

```markdown
# Runbook: API High Error Rate

**Alert Name**: APIHighErrorRate
**Severity**: P1 (Critical)
**Trigger Condition**: 5xx error rate > 5% for 5 minutes

---

## Symptom Description

Users are experiencing widespread API failures. The platform is returning 5xx errors (internal server errors) at an elevated rate, indicating a systemic problem.

**Impact**:
- High user impact
- Potential data loss
- SLO violation (99.9% availability target)
- Customer complaints

---

## Initial Response (First 5 Minutes)

1. **Acknowledge the alert** in PagerDuty
2. **Check status page**: https://status.ogelbase.com
3. **Join incident channel**: Create or join #incident-YYYY-MM-DD in Slack
4. **Assess impact**: Run these queries immediately

```bash
# Check error rate by tenant
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (tenant_id)'

# Check affected endpoints
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)'

# Check error types
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=sum(rate(errors_total[5m])) by (error_type)'
```

5. **Update status page** with initial incident notice

---

## Investigation Steps (5-15 Minutes)

### Step 1: Check Recent Deployments

```bash
# Via Railway Dashboard
railway logs --tail 100 --service studio

# Check for recent deployments
git log --oneline -5
```

**Questions**:
- Was there a deployment in the last hour?
- Did the error rate spike immediately after deployment?
- Are errors correlated with specific code paths?

### Step 2: Check Application Logs

```bash
# Query Grafana Loki for errors
# Navigate to: https://grafana.ogelbase.com/explore

# LogQL query:
{service="database-platform-api", level="error"} |= "5xx" | json | line_format "{{.message}} - {{.error.message}}"
```

**Look for**:
- Stack traces
- Database connection errors
- Timeout errors
- Unhandled exceptions

### Step 3: Check Database Health

```bash
# PostgreSQL health
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=pg_up'

# Connection pool status
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=database_connection_pool_utilization'

# Query latency
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(database_query_duration_seconds_bucket[5m])) by (le, db_type))'
```

### Step 4: Check External Dependencies

- Railway status: https://status.railway.app
- Vercel status: https://www.vercel-status.com
- Cloud provider status

### Step 5: Examine Distributed Traces

```bash
# Navigate to Grafana Tempo
# Search for failing traces:
# TraceQL query:
{ status = error && span.http.status_code >= 500 }

# Look for:
# - Which service is failing
# - Error messages in span attributes
# - Slow spans (potential timeout culprits)
```

---

## Mitigation Options

Choose based on root cause:

### Option 1: Rollback Recent Deployment

**When**: Errors started immediately after deployment

```bash
# Via Railway Dashboard
railway rollback --service studio

# Or via Git
git revert HEAD
git push origin main

# Verify rollback
railway logs --tail 50 --service studio
```

**Expected recovery time**: 2-5 minutes

---

### Option 2: Scale Up Resources

**When**: High CPU/memory usage or connection pool saturation

```bash
# Via Railway Dashboard → Service Settings → Resources
# Increase memory allocation (e.g., 512MB → 1GB)

# Or scale horizontally (if supported)
railway scale --replicas=3 --service studio
```

**Expected recovery time**: 3-5 minutes

---

### Option 3: Restart Failing Service

**When**: Memory leak, stuck processes, or connection exhaustion suspected

```bash
# Via Railway Dashboard
railway restart --service studio

# Or via API
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -d '{"query":"mutation { serviceInstanceRedeploy(serviceId: \"...\") { id } }"}'
```

**Expected recovery time**: 1-3 minutes

---

### Option 4: Enable Circuit Breaker

**When**: Downstream dependency (database, external API) is failing

```bash
# Update circuit breaker thresholds
railway variables set CIRCUIT_BREAKER_ENABLED=true --service studio
railway restart --service studio
```

---

### Option 5: Rate Limit Affected Tenants

**When**: Single tenant is overwhelming the system

```bash
# Identify problematic tenant
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=topk(5, sum(rate(http_requests_total[5m])) by (tenant_id))'

# Apply rate limit (via admin API)
curl -X POST https://ogelbase-studio.vercel.app/api/admin/rate-limit \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"tenant_id": "abc123", "limit_rps": 10}'
```

---

## Communication Plan

### Internal Communication

**Every 15 minutes**, post update in #incidents:

```
[HH:MM] Incident Update:
- Status: [Investigating | Mitigating | Resolved]
- Impact: [X% of requests failing, Y tenants affected]
- Action taken: [Description]
- Next steps: [What we're doing next]
- ETA: [Estimated time to resolution]
```

### External Communication

**If P1 > 15 minutes**, update status page:

1. Go to https://status.ogelbase.com/admin
2. Create incident:
   - **Title**: "Elevated API Error Rates"
   - **Impact**: "Major - Service Degraded"
   - **Message**: "We are investigating elevated error rates affecting API requests. Our team is actively working on a resolution."
3. Post updates every 30 minutes

**If P1 > 30 minutes**, send email to affected customers:

```
Subject: Service Degradation Notice - OgelBase API

We are currently experiencing elevated error rates affecting our API service.

Impact: Some API requests may fail with 5xx errors
Status: Our team is actively investigating and implementing a fix
ETA: We expect to restore normal service within [X minutes]

We apologize for the inconvenience and will provide updates as we make progress.

- OgelBase Team
```

---

## Resolution Checklist

Before closing the incident:

- [ ] Error rate back below 1% for 10 minutes
- [ ] All affected tenants confirmed operational
- [ ] Root cause identified and documented
- [ ] Incident postmortem scheduled (within 48 hours)
- [ ] Status page updated to "Resolved"
- [ ] Customers notified of resolution (if they were notified of incident)
- [ ] Alert silence removed
- [ ] Monitoring dashboards showing green

---

## Postmortem Template

Schedule within 48 hours. Use this template:

```markdown
# Incident Postmortem: API High Error Rate

**Date**: YYYY-MM-DD
**Duration**: X hours, Y minutes
**Severity**: P1 (Critical)
**Impact**: X% of API requests failed, Y tenants affected

## Timeline

- HH:MM - Alert triggered
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Mitigation deployed
- HH:MM - Service restored

## Root Cause

[Detailed explanation of what caused the incident]

## Impact

- API availability: X% (target: 99.9%)
- Error budget consumed: Y%
- Customer complaints: Z tickets

## What Went Well

- [Things that worked during incident response]

## What Went Poorly

- [Things that need improvement]

## Action Items

- [ ] [Action item 1] - Owner: [Name] - Due: [Date]
- [ ] [Action item 2] - Owner: [Name] - Due: [Date]
```

---

## Escalation Path

If unable to resolve in 30 minutes:

1. **L1 On-Call Engineer** (you) → Investigates
2. **L2 Senior Engineer** → Escalate after 30 min
3. **Engineering Manager** → Escalate after 1 hour
4. **CTO** → Escalate if customer-facing impact > 1 hour

**Escalation Contacts**:
- L2: #oncall-engineers in Slack
- Manager: #engineering-leadership
- CTO: Direct message or call
```

---

### Runbook 2: Connection Pool Saturation

**File**: `/docs/runbooks/connection-pool-saturation.md`

```markdown
# Runbook: Database Connection Pool Saturation

**Alert Name**: PostgreSQLConnectionPoolSaturated
**Severity**: P2 (High)
**Trigger Condition**: Pool utilization > 90% OR waiting connections > 0 for 5 minutes

---

## Symptom Description

Database connection pool is at or near capacity, causing request queuing and potential timeouts.

**Impact**:
- Degraded API performance
- Request timeouts
- Increased latency
- Potential cascading failures

---

## Initial Response (First 5 Minutes)

1. **Acknowledge the alert**
2. **Check current pool state**:

```bash
# Check pool metrics
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=database_connection_pool_size' | jq

# Pool utilization by tenant
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=database_connection_pool_utilization by (tenant_id, db_type)'
```

3. **Identify the affected database type** (PostgreSQL, Redis, MongoDB)

---

## Investigation Steps

### Step 1: Identify Long-Running Queries

**For PostgreSQL**:

```sql
-- Connect to platform database
psql $DATABASE_URL

-- Find long-running queries
SELECT 
  pid,
  usename,
  state,
  query_start,
  now() - query_start AS duration,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND (now() - query_start) > interval '5 minutes'
ORDER BY query_start;
```

**For MongoDB**:

```javascript
// Connect via mongosh
mongosh $MONGODB_URL

// Find current operations
db.currentOp({
  "active": true,
  "secs_running": { "$gt": 300 }
})
```

### Step 2: Check for Connection Leaks

```bash
# Review application logs for unclosed connections
# Loki query:
{service="database-platform-api"} |= "connection" |= "not released"

# Check connection lifecycle in traces
# Tempo TraceQL:
{ name =~ ".*connection.*" && duration > 30s }
```

### Step 3: Analyze Query Patterns

```bash
# Check query rate by operation
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=sum(rate(database_queries_total[5m])) by (operation)'

# Identify slow queries
curl -G 'https://prometheus.ogelbase.com/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(database_query_duration_seconds_bucket[5m])) by (le, operation))'
```

---

## Mitigation Options

### Option 1: Kill Long-Running Queries

**PostgreSQL**:

```sql
-- Terminate queries running > 10 minutes
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state != 'idle'
  AND (now() - query_start) > interval '10 minutes'
  AND query NOT ILIKE '%pg_stat_activity%';
```

**MongoDB**:

```javascript
// Kill operations running > 10 minutes
db.currentOp({"active": true, "secs_running": {"$gt": 600}}).inprog.forEach(function(op) {
  db.killOp(op.opid);
});
```

**Expected impact**: Immediate connection release

---

### Option 2: Increase Pool Size (Temporary)

**WARNING**: Only do this if database has capacity

```bash
# Update environment variable
railway variables set DB_POOL_MAX_SIZE=50 --service studio  # Current: 20
railway restart --service studio
```

**Expected recovery time**: 2-3 minutes

---

### Option 3: Scale Database Vertically

**For high CPU/memory on database**:

```bash
# Via Railway Dashboard → Database Service → Settings
# Increase instance size (e.g., 1GB → 2GB memory)

# Or via Terraform (if using IaC)
terraform apply -var="db_instance_type=db.r5.large"
```

**Expected recovery time**: 5-10 minutes (with restart)

---

### Option 4: Enable Connection Pooler (PgBouncer)

**For PostgreSQL (long-term solution)**:

Deploy PgBouncer between application and database:

```bash
# Create PgBouncer service on Railway
railway service create pgbouncer
railway link pgbouncer

# Configure PgBouncer
# See: /infrastructure/pgbouncer/pgbouncer.ini
```

**Expected recovery time**: 15-30 minutes

---

### Option 5: Implement Query Timeout

**Prevent queries from holding connections indefinitely**:

```bash
# Set statement timeout (PostgreSQL)
railway variables set PGSQL_STATEMENT_TIMEOUT=30000 --service studio  # 30 seconds

# Update code to set timeout per query
# Example in lib/api/platform/database.ts:
SET statement_timeout = '30s';
```

---

## Resolution Checklist

- [ ] Pool utilization back below 80% for 10 minutes
- [ ] No waiting connections
- [ ] Long-running queries terminated or completed
- [ ] Connection leak fixed (if found)
- [ ] Code review scheduled for query optimization
- [ ] Monitoring alert threshold reviewed

---

## Prevention

**Short-term** (implement within 1 week):
- [ ] Add query timeouts to all database operations
- [ ] Implement connection lifecycle logging
- [ ] Add pool metrics to dashboards

**Long-term** (implement within 1 month):
- [ ] Deploy connection pooler (PgBouncer/ProxySQL)
- [ ] Implement query performance monitoring
- [ ] Set up slow query alerts
- [ ] Review and optimize N+1 query patterns
- [ ] Add load testing for connection pool
```

---

## Cost Analysis

### Monthly Cost Breakdown

#### Grafana Cloud Pricing (Actual)

Based on workload:
- **50 hosts** (Railway services)
- **1TB logs/month**
- **100M spans/day** (with 10% sampling)
- **50K active metrics series**

| Component | Volume | Unit Cost | Monthly Cost |
|-----------|--------|-----------|--------------|
| **Grafana Cloud Pro** | Base subscription | $299/mo | $299 |
| **Metrics (Mimir)** | 50K active series | $0.15/series/mo | $7,500 ⚠️ |
| **Logs (Loki)** | 1TB ingestion | $0.50/GB | $500 |
| **Traces (Tempo)** | 100M spans/day | $0.10/M spans | $300 |
| **Dashboards** | 10 users | Included | $0 |
| **Alerting** | Unlimited | Included | $0 |
| **On-Call** | 5 users | $9/user | $45 |
| **SUBTOTAL** | | | **$8,644** ⚠️ |

**ISSUE**: Metrics cost is TOO HIGH due to cardinality explosion.

#### Cost Optimization (Implemented)

Apply these optimizations:

| Optimization | Savings | New Cost |
|--------------|---------|----------|
| **Use recording rules** (pre-aggregate) | -70% | $2,250 |
| **Reduce label cardinality** (remove tenant_id from high-freq metrics) | -30% | $1,575 |
| **Increase scrape interval** (60s → 120s for non-critical) | -20% | $1,260 |
| **Apply metric relabeling** (drop unused metrics) | -10% | $1,134 |

**OPTIMIZED COST**: $2,178/month

#### Final Cost Estimate

| Component | Optimized Cost |
|-----------|----------------|
| Metrics (Mimir) | $1,134 |
| Logs (Loki) | $500 |
| Traces (Tempo) | $300 |
| Grafana Cloud Pro | $299 |
| On-Call | $45 |
| **TOTAL** | **$2,278/month** |

---

### Cost Comparison

| Solution | Setup Time | Monthly Cost | Annual Cost |
|----------|------------|--------------|-------------|
| **Grafana Cloud (Optimized)** | 1 week | $2,278 | $27,336 |
| **Datadog** | 2 days | $8,000 | $96,000 |
| **New Relic** | 1 week | $2,500 | $30,000 |
| **Self-Hosted OSS** | 4 weeks | $6,700 | $80,400 |

**Savings vs Datadog**: $68,664/year (71% reduction)
**Savings vs Self-Hosted**: $53,064/year (66% reduction)

---

### Cost Scaling Projections

| Workload | Monthly Cost | Notes |
|----------|--------------|-------|
| **Current** (50 hosts, 1TB logs) | $2,278 | Baseline |
| **2x scale** (100 hosts, 2TB logs) | $3,856 | +69% cost |
| **5x scale** (250 hosts, 5TB logs) | $8,390 | +268% cost |
| **10x scale** (500 hosts, 10TB logs) | $15,780 | +593% cost |

**Break-even point**: At ~300 hosts, self-hosted becomes competitive (if operational overhead is ignored).

---

## Implementation Plan

### 8-Week Rollout

#### Week 1-2: Foundation (OpenTelemetry Auto-Instrumentation)

**Goal**: Get distributed tracing and basic metrics working

**Tasks**:
- [ ] **Day 1**: Set up Grafana Cloud account
- [ ] **Day 1**: Generate API keys and configure Railway env vars
- [ ] **Day 2-3**: Deploy OpenTelemetry Collector on Railway
- [ ] **Day 4-5**: Implement auto-instrumentation in studio app
- [ ] **Day 6-7**: Configure Tempo, Mimir, Loki data sources
- [ ] **Day 8-9**: Deploy database exporters (postgres_exporter, redis_exporter, mongodb_exporter)
- [ ] **Day 10**: End-to-end testing

**Deliverables**:
✅ Distributed tracing capturing HTTP requests and database queries
✅ Auto-instrumentation of Express.js, PostgreSQL, Redis, MongoDB
✅ Traces visible in Grafana Tempo
✅ Basic metrics flowing to Mimir
✅ Logs flowing to Loki

**Testing Criteria**:
```bash
# Verify traces are being collected
curl "https://grafana.ogelbase.com/api/datasources/proxy/tempo/api/search?tags=service.name%3Ddatabase-platform-api&limit=10"

# Verify metrics are being scraped
curl "https://prometheus.ogelbase.com/api/v1/query?query=up"

# Verify logs are being ingested
curl "https://grafana.ogelbase.com/loki/api/v1/query?query={service=\"database-platform-api\"}&limit=10"
```

---

#### Week 3-4: Advanced Instrumentation

**Goal**: Custom spans, tenant context propagation, business metrics

**Tasks**:
- [ ] **Day 11-12**: Implement custom spans for provisioning operations
- [ ] **Day 13-14**: Add tenant context middleware
- [ ] **Day 15-16**: Implement Prometheus metrics (prom-client)
- [ ] **Day 17-18**: Add connection pool monitoring
- [ ] **Day 19-20**: Implement structured logging with Winston
- [ ] **Day 21-22**: Configure tail-based sampling in OTel Collector

**Deliverables**:
✅ Custom spans for provision/backup/delete operations
✅ Tenant ID propagated through all traces, logs, metrics
✅ Business metrics: provisioning success rate, backup duration
✅ Connection pool metrics for all 3 database types
✅ Structured JSON logs with trace correlation
✅ 85% cost reduction via tail sampling (10% general + 100% errors)

**Testing Criteria**:
```bash
# Verify tenant context in traces
# TraceQL query in Tempo:
{ resource.tenant.id != "" }

# Verify custom metrics exist
curl "https://prometheus.ogelbase.com/api/v1/query?query=database_provisioning_total"

# Verify log-trace correlation
# Check logs have trace_id and span_id fields
curl "https://grafana.ogelbase.com/loki/api/v1/query?query={service=\"database-platform-api\"} | json | trace_id != \"\""
```

---

#### Week 5-6: SLOs, Dashboards, Alerting

**Goal**: Define SLOs, create dashboards, implement multi-burn-rate alerts

**Tasks**:
- [ ] **Day 23-24**: Define 6 core SLIs and SLO targets
- [ ] **Day 25-26**: Create SLO tracking dashboard
- [ ] **Day 27-28**: Implement recording rules for SLI calculations
- [ ] **Day 29-30**: Configure multi-burn-rate alerts (fast, moderate, slow)
- [ ] **Day 31-32**: Set up PagerDuty integration
- [ ] **Day 33-34**: Write runbooks for P1/P2 incidents

**Deliverables**:
✅ 6 SLIs defined and tracked:
  - API Availability (99.9% target)
  - API Latency (p95 < 200ms)
  - Provisioning Success Rate (99.5%)
  - Database Query Latency (varies by type)
  - Backup Success Rate (99.9%)
  - Data Durability (99.99%)
✅ Error budget dashboard showing burn rate
✅ Multi-burn-rate alerts configured
✅ PagerDuty routing for P1/P2 incidents
✅ 5 complete runbooks with escalation procedures

**Testing Criteria**:
```bash
# Fire test alert
curl -X POST https://alertmanager.ogelbase.com/api/v1/alerts \
  -d '[{"labels":{"alertname":"TestAlert","severity":"critical"},"annotations":{"summary":"Test alert"}}]'

# Verify PagerDuty receives alert
# Check PagerDuty dashboard

# Verify SLO calculation is correct
# Query Prometheus:
curl -G "https://prometheus.ogelbase.com/api/v1/query" \
  --data-urlencode 'query=(sum(rate(http_requests_total{status_code!~"5.."}[30d])) / sum(rate(http_requests_total[30d]))) * 100'
```

---

#### Week 7-8: Optimization, Testing, Documentation

**Goal**: Optimize costs, load test, finalize documentation

**Tasks**:
- [ ] **Day 35-36**: Implement Infrastructure as Code (Terraform) for Grafana resources
- [ ] **Day 37-38**: Optimize metric cardinality with recording rules
- [ ] **Day 39-40**: Set up tiered retention policies (7d hot, 30d cold, 90d archive)
- [ ] **Day 41-42**: Load testing with observability enabled
- [ ] **Day 43-44**: Chaos engineering tests (inject failures, verify alerts fire)
- [ ] **Day 45-46**: Team training on OpenTelemetry and observability stack
- [ ] **Day 47-48**: Final documentation and handoff

**Deliverables**:
✅ All Grafana dashboards, alerts, data sources managed via Terraform
✅ 50% reduction in metric cardinality via recording rules
✅ Tiered retention reducing storage costs by 60%
✅ Load test report showing observability overhead <5%
✅ Chaos test report showing MTTD <5 min for injected failures
✅ Team training materials and wiki documentation
✅ Production readiness review completed

**Testing Criteria**:
```bash
# Load test with k6
k6 run --vus 100 --duration 10m load-test.js

# Verify observability overhead
# Check CPU/memory delta before/after instrumentation
# Target: <5% overhead

# Chaos test: Kill database
railway stop --service postgres
# Verify alert fires within 1 minute
# Verify runbook is followed

# Chaos test: Inject 50% error rate
# Verify multi-burn-rate alerts fire appropriately
```

---

### Rollback Plan

If observability implementation causes production issues:

**Immediate Rollback** (< 5 minutes):
```bash
# Disable OpenTelemetry instrumentation
railway variables set OTEL_SDK_DISABLED=true --service studio
railway restart --service studio

# Verify application recovers
curl https://ogelbase-studio.vercel.app/api/health
```

**Partial Rollback** (remove specific components):
```bash
# Disable only tracing (keep metrics/logs)
railway variables set OTEL_TRACES_EXPORTER=none --service studio

# Disable only metrics
railway variables set OTEL_METRICS_EXPORTER=none --service studio

# Reduce sampling rate
railway variables set OTEL_TRACES_SAMPLER_ARG=0.01 --service studio  # 1% instead of 10%
```

---

## Testing Strategy

### 1. Unit Testing for Instrumentation

**File**: `/apps/studio/tests/observability/tracing.test.ts`

```typescript
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { trace, context } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import { traceDatabaseProvisioning, traceDatabaseQuery } from 'lib/observability/tracing'

describe('OpenTelemetry Tracing', () => {
  let provider: NodeTracerProvider
  let exporter: InMemorySpanExporter

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    provider = new NodeTracerProvider()
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
    provider.register()
  })

  afterEach(() => {
    exporter.reset()
    provider.shutdown()
  })

  it('should create span for database provisioning', async () => {
    const result = await traceDatabaseProvisioning(
      'tenant-123',
      'org-456',
      {
        type: 'postgresql',
        size: 'small',
        region: 'us-east-1',
        name: 'test-db',
      },
      async () => {
        return { id: 'db-789', status: 'active' }
      }
    )

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)

    const span = spans[0]
    expect(span.name).toBe('database.provision')
    expect(span.attributes['tenant.id']).toBe('tenant-123')
    expect(span.attributes['db.type']).toBe('postgresql')
    expect(span.status.code).toBe(SpanStatusCode.OK)
  })

  it('should record error in span on failure', async () => {
    await expect(
      traceDatabaseProvisioning(
        'tenant-123',
        'org-456',
        { type: 'postgresql', size: 'small', region: 'us-east-1', name: 'test-db' },
        async () => {
          throw new Error('Provisioning failed')
        }
      )
    ).rejects.toThrow('Provisioning failed')

    const spans = exporter.getFinishedSpans()
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR)
    expect(spans[0].events[0].name).toBe('exception')
  })

  it('should propagate tenant context', async () => {
    await traceDatabaseQuery('postgresql', 'SELECT', 'tenant-123', async () => {
      const span = trace.getActiveSpan()
      expect(span?.attributes['tenant.id']).toBe('tenant-123')
    })
  })
})
```

### 2. Integration Testing

**File**: `/apps/studio/tests/observability/integration.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals'

describe('Observability Integration', () => {
  it('should export metrics to Prometheus format', async () => {
    const response = await fetch('http://localhost:3000/api/metrics')
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(text).toContain('http_request_duration_seconds')
    expect(text).toContain('database_query_duration_seconds')
  })

  it('should send traces to OpenTelemetry Collector', async () => {
    // Make API request
    const response = await fetch('http://localhost:3000/api/platform/databases')

    expect(response.status).toBe(200)

    // Wait for trace export (async)
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Query Tempo for trace
    const traceQuery = await fetch(
      `https://tempo.ogelbase.com/api/search?tags=http.url%3D%2Fapi%2Fplatform%2Fdatabases`
    )
    const traces = await traceQuery.json()

    expect(traces.traces.length).toBeGreaterThan(0)
  })

  it('should correlate logs with traces', async () => {
    // Trigger operation that logs
    await fetch('http://localhost:3000/api/platform/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ /* ... */ }),
    })

    // Query logs from Loki
    const logsQuery = await fetch(
      `https://loki.ogelbase.com/loki/api/v1/query?query={service="database-platform-api"} | json | trace_id != ""`
    )
    const logs = await logsQuery.json()

    expect(logs.data.result.length).toBeGreaterThan(0)

    // Verify trace_id exists
    const log = logs.data.result[0].values[0][1]
    const logJson = JSON.parse(log)
    expect(logJson.trace.trace_id).toMatch(/^[0-9a-f]{32}$/)
  })
})
```

### 3. Load Testing with Observability

**File**: `/tests/load/observability-load-test.js`

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// Custom metrics
const errorRate = new Rate('errors')
const traceOverhead = new Trend('trace_overhead_ms')

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Steady state
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],  // 95% of requests < 500ms
    'errors': ['rate<0.01'],             // Error rate < 1%
    'trace_overhead_ms': ['avg<50'],     // Trace overhead < 50ms average
  },
}

export default function () {
  const baseUrl = 'https://ogelbase-studio.vercel.app'

  // Test with tracing enabled
  const startWithTrace = Date.now()
  const resWithTrace = http.get(`${baseUrl}/api/platform/databases`, {
    headers: {
      'Authorization': `Bearer ${__ENV.API_TOKEN}`,
      'X-Tenant-Id': 'test-tenant',
    },
  })
  const durationWithTrace = Date.now() - startWithTrace

  check(resWithTrace, {
    'status is 200': (r) => r.status === 200,
  })

  errorRate.add(resWithTrace.status !== 200)
  traceOverhead.add(durationWithTrace)

  sleep(1)
}
```

### 4. Chaos Engineering Tests

**File**: `/tests/chaos/database-failure.sh`

```bash
#!/bin/bash
# Chaos Test: Database Failure

set -e

echo "🔥 Starting Chaos Engineering Test: Database Failure"
echo "=============================================="

# Prerequisites
echo "📋 Prerequisites:"
echo "  - Alerts configured in Grafana"
echo "  - PagerDuty integration active"
echo "  - Runbook accessible"

# Step 1: Record baseline metrics
echo ""
echo "📊 Step 1: Recording baseline metrics (30s)..."
sleep 30

BASELINE_ERROR_RATE=$(curl -s "https://prometheus.ogelbase.com/api/v1/query?query=sum(rate(http_requests_total{status_code=~\"5..\"}[1m]))/sum(rate(http_requests_total[1m]))" | jq -r '.data.result[0].value[1]')
echo "  Baseline error rate: $BASELINE_ERROR_RATE"

# Step 2: Inject failure (stop database)
echo ""
echo "💥 Step 2: Injecting failure (stopping PostgreSQL)..."
INCIDENT_START=$(date +%s)
railway stop --service postgres

# Step 3: Wait for alert to fire
echo ""
echo "⏱️  Step 3: Waiting for alert to fire..."
ALERT_FIRED=false
for i in {1..120}; do
  ALERT_STATUS=$(curl -s "https://alertmanager.ogelbase.com/api/v2/alerts" | jq -r '.[] | select(.labels.alertname == "PostgreSQLDown") | .status.state')

  if [ "$ALERT_STATUS" == "firing" ]; then
    ALERT_FIRED=true
    MTTD=$(($(date +%s) - INCIDENT_START))
    echo "  ✅ Alert fired after $MTTD seconds"
    break
  fi

  echo -n "."
  sleep 1
done

if [ "$ALERT_FIRED" == "false" ]; then
  echo "  ❌ FAIL: Alert did not fire within 2 minutes"
  railway start --service postgres
  exit 1
fi

# Step 4: Verify error rate increased
echo ""
echo "📈 Step 4: Verifying error rate increased..."
sleep 10
FAILURE_ERROR_RATE=$(curl -s "https://prometheus.ogelbase.com/api/v1/query?query=sum(rate(http_requests_total{status_code=~\"5..\"}[1m]))/sum(rate(http_requests_total[1m]))" | jq -r '.data.result[0].value[1]')
echo "  Failure error rate: $FAILURE_ERROR_RATE"

if (( $(echo "$FAILURE_ERROR_RATE > $BASELINE_ERROR_RATE" | bc -l) )); then
  echo "  ✅ Error rate increased as expected"
else
  echo "  ❌ FAIL: Error rate did not increase"
fi

# Step 5: Restore database
echo ""
echo "🔄 Step 5: Restoring database..."
railway start --service postgres

# Wait for recovery
echo "  Waiting for database to be ready..."
sleep 30

# Step 6: Verify recovery
echo ""
echo "📉 Step 6: Verifying recovery..."
RECOVERY_ERROR_RATE=$(curl -s "https://prometheus.ogelbase.com/api/v1/query?query=sum(rate(http_requests_total{status_code=~\"5..\"}[1m]))/sum(rate(http_requests_total[1m]))" | jq -r '.data.result[0].value[1]')
echo "  Recovery error rate: $RECOVERY_ERROR_RATE"

RECOVERY_TIME=$(($(date +%s) - INCIDENT_START))
echo "  Total recovery time: $RECOVERY_TIME seconds"

# Results
echo ""
echo "=============================================="
echo "📊 Chaos Test Results:"
echo "  Mean Time to Detection (MTTD): $MTTD seconds"
echo "  Mean Time to Recovery (MTTR): $RECOVERY_TIME seconds"
echo "  Baseline Error Rate: $BASELINE_ERROR_RATE"
echo "  Peak Error Rate: $FAILURE_ERROR_RATE"
echo "  Recovery Error Rate: $RECOVERY_ERROR_RATE"
echo ""

# Pass/Fail criteria
if [ $MTTD -le 300 ] && [ $RECOVERY_TIME -le 900 ]; then
  echo "✅ PASS: Chaos test completed successfully"
  echo "  - MTTD < 5 minutes ✅"
  echo "  - MTTR < 15 minutes ✅"
  exit 0
else
  echo "❌ FAIL: Chaos test did not meet SLO"
  echo "  - MTTD target: <5 min (actual: $MTTD sec)"
  echo "  - MTTR target: <15 min (actual: $RECOVERY_TIME sec)"
  exit 1
fi
```

---

## IaC Templates

### Terraform Configuration

**File**: `/infrastructure/terraform/grafana-cloud.tf`

```hcl
# Grafana Cloud Provider Configuration
terraform {
  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 2.9.0"
    }
  }
}

provider "grafana" {
  url  = var.grafana_url
  auth = var.grafana_api_key
}

# Variables
variable "grafana_url" {
  description = "Grafana Cloud instance URL"
  type        = string
}

variable "grafana_api_key" {
  description = "Grafana Cloud API key"
  type        = string
  sensitive   = true
}

# Data Sources
resource "grafana_data_source" "tempo" {
  type = "tempo"
  name = "Tempo"
  url  = var.tempo_endpoint

  json_data_encoded = jsonencode({
    httpMethod    = "GET"
    tracesToLogs = {
      datasourceUid = grafana_data_source.loki.uid
      tags          = ["trace_id"]
    }
  })

  secure_json_data_encoded = jsonencode({
    basicAuthPassword = var.grafana_api_key
  })
}

resource "grafana_data_source" "prometheus" {
  type = "prometheus"
  name = "Mimir"
  url  = var.mimir_endpoint

  json_data_encoded = jsonencode({
    httpMethod = "POST"
  })

  secure_json_data_encoded = jsonencode({
    basicAuthPassword = var.grafana_api_key
  })
}

resource "grafana_data_source" "loki" {
  type = "loki"
  name = "Loki"
  url  = var.loki_endpoint

  json_data_encoded = jsonencode({
    maxLines       = 1000
    derivedFields = [
      {
        datasourceUid = grafana_data_source.tempo.uid
        matcherRegex  = "trace_id=(\\w+)"
        name          = "TraceID"
        url           = "$${__value.raw}"
      }
    ]
  })

  secure_json_data_encoded = jsonencode({
    basicAuthPassword = var.grafana_api_key
  })
}

# Dashboards
resource "grafana_dashboard" "system_overview" {
  config_json = file("${path.module}/../grafana/dashboards/system-overview.json")
  folder      = grafana_folder.ogelbase.id
}

resource "grafana_dashboard" "database_performance" {
  config_json = file("${path.module}/../grafana/dashboards/database-performance.json")
  folder      = grafana_folder.ogelbase.id
}

resource "grafana_dashboard" "slo_tracking" {
  config_json = file("${path.module}/../grafana/dashboards/slo-tracking.json")
  folder      = grafana_folder.ogelbase.id
}

resource "grafana_folder" "ogelbase" {
  title = "OgelBase"
}

# Alert Rules
resource "grafana_rule_group" "slo_alerts" {
  name             = "SLO Alerts"
  folder_uid       = grafana_folder.ogelbase.uid
  interval_seconds = 30

  rule {
    name      = "ErrorBudgetBurnRateFast"
    condition = "C"

    data {
      ref_id = "A"
      query_type = ""
      relative_time_range {
        from = 3600
        to   = 0
      }
      datasource_uid = grafana_data_source.prometheus.uid
      model = jsonencode({
        expr         = "(sum(rate(http_requests_total{status_code=~\"5..\"}[1h])) / sum(rate(http_requests_total[1h]))) > (0.001 * 14.4)"
        refId        = "A"
        instant      = true
      })
    }

    data {
      ref_id = "C"
      query_type = ""
      relative_time_range {
        from = 0
        to   = 0
      }
      datasource_uid = "-100"
      model = jsonencode({
        conditions = [
          {
            evaluator = {
              params = [0]
              type   = "gt"
            }
            operator = {
              type = "and"
            }
            query = {
              params = ["A"]
            }
            reducer = {
              params = []
              type   = "last"
            }
            type = "query"
          }
        ]
        refId = "C"
      })
    }

    annotations = {
      summary     = "CRITICAL: Fast error budget burn detected"
      description = "Error rate is {{ $values.A }}. At current rate, will exhaust error budget in 6 hours."
      runbook_url = "https://docs.ogelbase.com/runbooks/error-budget-burn"
    }

    labels = {
      severity   = "critical"
      alert_type = "slo_violation"
      component  = "api"
    }

    for = "2m"
  }
}

# Outputs
output "tempo_datasource_uid" {
  value = grafana_data_source.tempo.uid
}

output "prometheus_datasource_uid" {
  value = grafana_data_source.prometheus.uid
}

output "loki_datasource_uid" {
  value = grafana_data_source.loki.uid
}
```

**File**: `/infrastructure/terraform/variables.tf`

```hcl
variable "tempo_endpoint" {
  description = "Grafana Tempo endpoint"
  type        = string
  default     = "https://tempo-us-central1.grafana.net"
}

variable "mimir_endpoint" {
  description = "Grafana Mimir (Prometheus) endpoint"
  type        = string
  default     = "https://prometheus-us-central1.grafana.net/api/prom"
}

variable "loki_endpoint" {
  description = "Grafana Loki endpoint"
  type        = string
  default     = "https://logs-us-central1.grafana.net"
}
```

**File**: `/infrastructure/terraform/terraform.tfvars.example`

```hcl
grafana_url     = "https://ogelbase.grafana.net"
grafana_api_key = "your-grafana-api-key-here"
```

---

## Conclusion

This production observability stack provides **world-class visibility** into your multi-database management platform at a **fraction of the cost** of commercial APM solutions.

### Success Metrics (After 8 Weeks)

✅ **Mean Time to Detection**: <5 minutes (from hours/days)
✅ **Mean Time to Resolution**: <15 minutes for common issues
✅ **API Availability SLO**: 99.9% compliance
✅ **Observability Cost**: $2,278/month (vs $8,000 for Datadog)
✅ **Trace Retention**: 30 days with intelligent sampling
✅ **Zero Blind Spots**: Full coverage of PostgreSQL, Redis, MongoDB, API

### Key Differentiators

| Before (Grade C) | After (Grade A) |
|------------------|-----------------|
| ❌ No distributed tracing | ✅ End-to-end tracing with OpenTelemetry |
| ❌ Scattered logs | ✅ Structured JSON logs with trace correlation |
| ❌ No database metrics | ✅ Comprehensive metrics for all 3 database types |
| ❌ Reactive firefighting | ✅ Proactive SLO-driven alerting |
| ❌ No observability budget | ✅ $2,278/month (71% savings vs Datadog) |

### Next Steps

1. **Week 1**: Set up Grafana Cloud account and deploy OpenTelemetry Collector
2. **Week 2**: Implement auto-instrumentation and verify traces flowing
3. **Week 3-4**: Add custom spans, metrics, and structured logging
4. **Week 5-6**: Define SLOs and configure multi-burn-rate alerts
5. **Week 7-8**: Optimize costs, load test, and finalize documentation

**Questions?** Contact the DevOps team: devops@ogelbase.com

---

**Document Version**: 2.0
**Last Updated**: November 20, 2025
**Author**: Nikolai Volkov, Infrastructure Architect
**Maintained By**: DevOps Team
**Review Cycle**: Quarterly
