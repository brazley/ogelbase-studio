# WS1: OpenTelemetry Distributed Tracing Implementation

**Status**: In Progress
**Assigned**: Jamal Washington (SRE/Observability Specialist)
**Priority**: High (Blocks WS3 Monitoring Dashboards)
**Created**: 2025-11-22

## Context

We need full OTLP implementation with Jaeger export for visualizing request flows through Redis operations. This will enable:
- Cross-service correlation for future multi-service architecture
- Detailed timing breakdown of Redis operations within requests
- Visualization of distributed traces in Jaeger UI

**Performance Requirement**: <5ms overhead (acceptable trade-off confirmed)

## Current State Audit

### Already Installed (package.json)
```json
"@opentelemetry/api": "^1.9.0",
"@opentelemetry/auto-instrumentations-node": "^0.67.0",
"@opentelemetry/exporter-trace-otlp-http": "^0.208.0",
"@opentelemetry/instrumentation-express": "^0.57.0",
"@opentelemetry/instrumentation-http": "^0.208.0",
"@opentelemetry/instrumentation-pg": "^0.61.0",
"@opentelemetry/resources": "^2.2.0",
"@opentelemetry/sdk-node": "^0.208.0",
"@opentelemetry/sdk-trace-node": "^2.2.0",
"@opentelemetry/semantic-conventions": "^1.38.0",
```

### Existing Infrastructure
1. **Redis Operations**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/session-cache.ts`
   - Session validation (lines 377-435)
   - All Redis commands (GET, SET, HGET, HGETALL, DEL, SCAN, EXPIRE)
   - Cache warming operations
   - Invalidation flows

2. **Connection Management**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/connection-manager.ts`
   - Circuit breaker events (lines 384-429)
   - Query execution with timing (lines 434-467)
   - Prometheus metrics integration

3. **Structured Logging**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/observability/logger.ts`
   - Correlation ID system via AsyncLocalStorage
   - Structured log formats

4. **No Tracing Infrastructure**: Directory `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/tracing/` does not exist

## Deliverables

### 1. OpenTelemetry SDK Setup
**File**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/tracing/setup.ts`

Requirements:
- Initialize NodeTracerProvider
- Configure JaegerExporter for Railway deployment
- Set up BatchSpanProcessor (non-blocking)
- Configure sampling (10% sample rate for production, 100% for development)
- Register global tracer provider
- Resource attributes: service.name, service.version, deployment.environment

Environment variables:
```typescript
JAEGER_ENDPOINT=<Railway Jaeger URL> // You'll need to provide/configure
OTEL_SERVICE_NAME=studio-api
OTEL_ENVIRONMENT=production|development
OTEL_SAMPLING_RATE=0.1 // 10% for production
```

### 2. Redis Operation Instrumentation
**File**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/tracing/redis-instrumentation.ts`

Create span helpers for Redis operations with attributes:
```typescript
- operation: string (e.g., "GET", "HGETALL", "SET")
- key: string (sanitized, no PII)
- latency_ms: number
- cache_hit: boolean (for GET operations)
- cache_miss: boolean (for GET operations)
- error: string (if operation fails)
- connection_pool: string (pool key)
- db_type: "redis"
```

### 3. Integrate with Session Validation
**File**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/session-cache.ts`

Add spans to:
- `validateSession()` (line 377) - Parent span "session.validate"
- `getFromCache()` (line 183) - Child span "redis.get"
- `storeInCache()` (line 248) - Child span "redis.set"
- `invalidateSession()` (line 289) - Child span "redis.delete"
- `invalidateUserSessions()` (line 318) - Parent span "session.invalidate_all"

### 4. Integrate with Connection Manager
**File**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/connection-manager.ts`

Add spans to:
- `executeWithCircuitBreaker()` (line 434) - Parent span with operation type
- Circuit breaker events (lines 384-429) - Add span events for open/close/failure
- Record span status based on success/failure

### 5. Context Propagation
**Integration**: Link with existing AsyncLocalStorage correlation ID system

Ensure:
- Trace context flows through async operations
- Correlation IDs are added as span attributes
- Parent-child span relationships are correct
- Trace IDs are logged in structured logs

### 6. Performance Validation
**Test Script**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/tests/tracing-performance.bench.ts`

Benchmark requirements:
- Measure overhead with 1000+ requests/second
- Verify <5ms P95 latency impact
- Test batch span processor efficiency
- Validate sampling works correctly

### 7. Documentation
**Files**:
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/TRACING-GUIDE.md`
- Update `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/REDIS-OPERATIONS-GUIDE.md`

Include:
- How to view traces in Jaeger (with screenshots/URLs)
- Key metrics to monitor
- Troubleshooting guide
- Example trace IDs for common flows
- How to add custom spans

## Success Criteria

✅ All Redis operations traced with correct attributes
✅ <5ms P95 overhead verified with benchmark
✅ Traces visible in Jaeger UI with correct parent-child relationships
✅ Context propagates correctly through async operations
✅ Zero TypeScript compilation errors
✅ All existing tests passing
✅ Documentation complete with example trace IDs
✅ Jaeger URL and access instructions provided

## Dependencies

**Blocks**: WS3 (Monitoring Dashboards) - needs trace metrics

## Notes for Jamal

1. **Jaeger Deployment**: You may need to deploy Jaeger on Railway or use a managed service. Confirm Jaeger endpoint configuration.

2. **Sampling Strategy**: 10% sampling for production is a starting point. Monitor trace volume and adjust if needed.

3. **Performance Testing**: Use existing `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/tests/session-performance-benchmark.ts` as a baseline, then add tracing overhead measurement.

4. **Integration Points**: The existing logger already uses AsyncLocalStorage for correlation IDs. Your trace context should integrate seamlessly.

5. **Circuit Breaker Events**: When circuit breaker opens/closes, add span events with timestamps to visualize failure patterns.

6. **Report Back With**:
   - Jaeger URL for viewing traces
   - Example trace IDs for common flows (session validation, cache miss, invalidation)
   - Benchmark results showing overhead
   - Any configuration changes needed

## Acceptance

When complete:
1. PR with all code changes
2. Performance benchmark showing <5ms overhead
3. Jaeger access instructions
4. Example trace IDs
5. Documentation complete

Current date: 2025-11-22 13:36 EST
