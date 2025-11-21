import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import type { IncomingMessage } from 'http'

let sdk: NodeSDK | null = null

export function initializeTracing() {
  // Don't initialize if already initialized
  if (sdk) {
    return
  }

  // Only initialize in platform mode and if OTEL endpoint is configured
  const isPlatform = process.env.NEXT_PUBLIC_PLATFORM === 'true'
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

  if (!isPlatform) {
    console.log('[Tracing] Skipping OpenTelemetry initialization - not in platform mode')
    return
  }

  console.log('[Tracing] Initializing OpenTelemetry...')

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: 'supabase-studio-api',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '0.0.9',
    })
  )

  // Configure trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint || 'http://localhost:4318/v1/traces',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? Object.fromEntries(
          process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map((header) => {
            const [key, value] = header.split('=')
            return [key.trim(), value.trim()]
          })
        )
      : {},
  })

  sdk = new NodeSDK({
    resource,
    traceExporter,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable filesystem instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Enable HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          requestHook: (span, request) => {
            // Add custom attributes
            const incomingMsg = request as IncomingMessage
            span.setAttribute('http.route', incomingMsg.url || '')
          },
        },
        // Enable PostgreSQL instrumentation
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
          enhancedDatabaseReporting: true,
        },
        // Disable MongoDB (not used in this project)
        '@opentelemetry/instrumentation-mongodb': { enabled: false },
      }),
    ],
  })

  sdk.start()

  console.log('[Tracing] OpenTelemetry initialized successfully')

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Tracing] Shutting down OpenTelemetry...')
    sdk
      ?.shutdown()
      .then(() => console.log('[Tracing] OpenTelemetry shut down successfully'))
      .catch((error) => console.error('[Tracing] Error shutting down OpenTelemetry', error))
      .finally(() => process.exit(0))
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

/**
 * Create a traced span for an operation
 * @param name - Name of the span
 * @param fn - Function to execute within the span
 * @param attributes - Additional attributes to add to the span
 */
export async function withTracing<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = trace.getTracer('supabase-studio-api')
  const span = tracer.startSpan(name)

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value)
    })
  }

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn()
    })
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    span.recordException(error as Error)
    throw error
  } finally {
    span.end()
  }
}

/**
 * Add multi-tenant context to the current span
 */
export function addTenantContext(orgId?: string, projectId?: string) {
  const span = trace.getActiveSpan()
  if (span) {
    if (orgId) span.setAttribute('tenant.org_id', orgId)
    if (projectId) span.setAttribute('tenant.project_id', projectId)
  }
}

/**
 * Get the current trace context for correlation
 */
export function getTraceContext() {
  const span = trace.getActiveSpan()
  if (!span) return {}

  const spanContext = span.spanContext()
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  }
}
