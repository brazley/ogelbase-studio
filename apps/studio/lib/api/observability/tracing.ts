/**
 * OpenTelemetry Distributed Tracing
 *
 * Provides distributed tracing instrumentation for:
 * - Redis operations and connection pooling
 * - Session cache operations
 * - Circuit breaker events
 * - Database queries
 * - HTTP requests
 *
 * Features:
 * - Automatic trace propagation via context
 * - Correlation with Winston logs
 * - Configurable sampling rates
 * - OTLP export to collectors
 * - Semantic conventions compliance
 *
 * Usage:
 *   import { tracer, traceRedisOperation } from './observability/tracing'
 *
 *   const span = tracer.startSpan('redis.get')
 *   try {
 *     const result = await redis.get(key)
 *     span.setStatus({ code: SpanStatusCode.OK })
 *     return result
 *   } catch (error) {
 *     span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
 *     span.recordException(error)
 *     throw error
 *   } finally {
 *     span.end()
 *   }
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { trace, context, Span, SpanStatusCode, SpanKind, Tracer } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { getCorrelationId } from './correlation'
import { logger } from './logger'

/**
 * Tracing configuration
 */
const TRACING_CONFIG = {
  enabled: process.env.OTEL_ENABLED !== 'false', // Enabled by default
  serviceName: process.env.OTEL_SERVICE_NAME || 'studio',
  serviceVersion: process.env.npm_package_version || '0.0.10',
  environment: process.env.NODE_ENV || 'development',
  exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  sampleRate: parseFloat(process.env.OTEL_TRACE_SAMPLE_RATE || '0.1'), // 10% in prod, 100% in dev
}

/**
 * OpenTelemetry SDK instance
 */
let sdk: NodeSDK | null = null

/**
 * Initialize OpenTelemetry SDK
 * Call this once at application startup
 */
export function initializeTracing(): NodeSDK | null {
  if (!TRACING_CONFIG.enabled) {
    logger.info('OpenTelemetry tracing disabled', {
      reason: 'OTEL_ENABLED=false',
    })
    return null
  }

  // Skip initialization if already initialized
  if (sdk) {
    logger.warn('OpenTelemetry SDK already initialized')
    return sdk
  }

  try {
    // Configure resource attributes
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: TRACING_CONFIG.serviceName,
      [ATTR_SERVICE_VERSION]: TRACING_CONFIG.serviceVersion,
      'deployment.environment': TRACING_CONFIG.environment,
    })

    // Configure OTLP exporter
    const traceExporter = new OTLPTraceExporter({
      url: TRACING_CONFIG.exporterEndpoint,
      headers: {},
    })

    // Create SDK with auto-instrumentations
    sdk = new NodeSDK({
      resource,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Customize instrumentations
          '@opentelemetry/instrumentation-http': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true,
          },
        }),
      ],
    })

    // Start SDK
    sdk.start()

    logger.info('OpenTelemetry tracing initialized', {
      service_name: TRACING_CONFIG.serviceName,
      service_version: TRACING_CONFIG.serviceVersion,
      environment: TRACING_CONFIG.environment,
      exporter_endpoint: TRACING_CONFIG.exporterEndpoint,
      sample_rate: TRACING_CONFIG.sampleRate,
    })

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      try {
        await sdk?.shutdown()
        logger.info('OpenTelemetry SDK shut down successfully')
      } catch (error) {
        logger.error('Error shutting down OpenTelemetry SDK', { error })
      }
    })

    return sdk
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', {
      error: error as Error,
      exporter_endpoint: TRACING_CONFIG.exporterEndpoint,
    })
    return null
  }
}

/**
 * Get tracer instance
 * Use this to create spans manually
 */
export function getTracer(name: string = 'redis-cache'): Tracer {
  return trace.getTracer(name, TRACING_CONFIG.serviceVersion)
}

/**
 * Default tracer for Redis operations
 */
export const tracer = getTracer('redis-cache')

/**
 * Check if tracing is enabled
 */
export function isTracingEnabled(): boolean {
  return TRACING_CONFIG.enabled
}

/**
 * Get trace configuration
 */
export function getTracingConfig() {
  return {
    ...TRACING_CONFIG,
    sdk_initialized: sdk !== null,
  }
}

/**
 * Trace a Redis operation
 * Higher-level helper that creates span, handles errors, and adds attributes
 */
export async function traceRedisOperation<T>(
  operation: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  if (!TRACING_CONFIG.enabled) {
    // If tracing disabled, execute without span
    const noop = { setStatus: () => {}, setAttribute: () => {}, recordException: () => {}, end: () => {} } as unknown as Span
    return await fn(noop)
  }

  const span = tracer.startSpan(`redis.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'redis',
      'db.operation': operation,
      ...attributes,
    },
  })

  // Add correlation ID if available
  const correlationId = getCorrelationId()
  if (correlationId) {
    span.setAttribute('correlation.id', correlationId)
  }

  const startTime = Date.now()

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span)
    })

    // Record success
    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttribute('redis.success', true)
    span.setAttribute('redis.duration_ms', Date.now() - startTime)

    return result
  } catch (error) {
    // Record error
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    span.setAttribute('redis.success', false)
    span.setAttribute('redis.error.type', error instanceof Error ? error.constructor.name : 'UnknownError')

    if (error instanceof Error) {
      span.recordException(error)
    }

    throw error
  } finally {
    span.end()
  }
}

/**
 * Trace a session cache operation
 */
export async function traceSessionCache<T>(
  operation: 'get' | 'set' | 'invalidate',
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  if (!TRACING_CONFIG.enabled) {
    const noop = { setStatus: () => {}, setAttribute: () => {}, recordException: () => {}, end: () => {} } as unknown as Span
    return await fn(noop)
  }

  const span = tracer.startSpan(`cache.session.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'cache.type': 'redis',
      'cache.operation': operation,
      ...attributes,
    },
  })

  // Add correlation ID
  const correlationId = getCorrelationId()
  if (correlationId) {
    span.setAttribute('correlation.id', correlationId)
  }

  const startTime = Date.now()

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span)
    })

    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttribute('cache.success', true)
    span.setAttribute('cache.duration_ms', Date.now() - startTime)

    return result
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    span.setAttribute('cache.success', false)

    if (error instanceof Error) {
      span.recordException(error)
    }

    throw error
  } finally {
    span.end()
  }
}

/**
 * Trace connection pool operations
 */
export async function tracePoolOperation<T>(
  operation: 'acquire' | 'release' | 'create' | 'destroy',
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  if (!TRACING_CONFIG.enabled) {
    const noop = { setStatus: () => {}, setAttribute: () => {}, recordException: () => {}, end: () => {} } as unknown as Span
    return await fn(noop)
  }

  const span = tracer.startSpan(`pool.${operation}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'pool.operation': operation,
      ...attributes,
    },
  })

  const startTime = Date.now()

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span)
    })

    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttribute('pool.duration_ms', Date.now() - startTime)

    return result
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    })

    if (error instanceof Error) {
      span.recordException(error)
    }

    throw error
  } finally {
    span.end()
  }
}

/**
 * Trace circuit breaker events
 */
export function traceCircuitBreakerEvent(
  event: 'open' | 'half-open' | 'close' | 'failure',
  attributes: Record<string, string | number | boolean>
): void {
  if (!TRACING_CONFIG.enabled) {
    return
  }

  const span = tracer.startSpan(`circuit_breaker.${event}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'circuit_breaker.event': event,
      ...attributes,
    },
  })

  // Circuit breaker events are instantaneous
  span.setStatus({ code: SpanStatusCode.OK })
  span.end()
}

/**
 * Get current trace context for logging correlation
 * Returns trace_id and span_id for linking logs to traces
 */
export function getTraceContext(): { trace_id?: string; span_id?: string } {
  if (!TRACING_CONFIG.enabled) {
    return {}
  }

  const span = trace.getSpan(context.active())
  if (!span) {
    return {}
  }

  const spanContext = span.spanContext()
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  }
}

/**
 * Shutdown tracing gracefully
 * Call this on application shutdown
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    logger.info('OpenTelemetry SDK shut down')
    sdk = null
  }
}

/**
 * Export span status codes for use in instrumented code
 */
export { SpanStatusCode, SpanKind }
export type { Span }
