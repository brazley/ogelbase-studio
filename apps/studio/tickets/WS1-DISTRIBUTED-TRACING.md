# WS1: Distributed Tracing (OpenTelemetry)

**Owner**: Yuki Nakamura | **Agent**: `YukiNakamura` | **Days**: 3 | **Status**: 🟡 READY

## Objective
Instrument Redis operations with OpenTelemetry for end-to-end request tracing.

## Current State
- OpenTelemetry SDK already installed (v1.9.0)
- Auto-instrumentation available
- Need to instrument Redis operations

## Scope
1. Create `lib/api/observability/telemetry.ts` - OTel setup
2. Update `lib/api/platform/redis.ts` - Add spans for all operations
3. Update `lib/api/auth/session-cache.ts` - Add cache spans
4. Configure trace export (Jaeger/Honeycomb)

## Implementation
```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('redis-client')

async function get(key: string) {
  return tracer.startActiveSpan('redis.get', async (span) => {
    span.setAttribute('redis.key', key)
    try {
      const result = await client.get(key)
      span.setAttribute('redis.hit', !!result)
      return result
    } finally {
      span.end()
    }
  })
}
```

## Deliverables
- `lib/api/observability/telemetry.ts`
- Updated redis.ts with spans
- Updated session-cache.ts with spans
- `REDIS-TRACING-GUIDE.md`
- Example traces

## Acceptance Criteria
- [ ] All Redis ops create spans
- [ ] Spans show full context
- [ ] <5ms tracing overhead
- [ ] Exportable to multiple backends

**Dependencies**: None | **Ready**: ✅ (OTel already installed)
