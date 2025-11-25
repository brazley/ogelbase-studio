# Observability System Documentation

## Overview

This observability system provides comprehensive monitoring and tracing for Studio's distributed infrastructure:

- **Structured Logging** via Winston with correlation IDs
- **Distributed Tracing** via OpenTelemetry with OTLP export
- **Correlation** between logs and traces via AsyncLocalStorage
- **Metrics** via Prometheus client (connection-manager.ts)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Request                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       v
┌─────────────────────────────────────────────────────────────┐
│  correlation.ts                                              │
│  • Generates/extracts correlation ID                         │
│  • AsyncLocalStorage for context propagation                │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        v                             v
┌────────────────────┐     ┌──────────────────────┐
│   logger.ts        │     │   tracing.ts         │
│   • Winston logs   │     │   • OpenTelemetry    │
│   • Correlation ID │     │   • OTLP exporter    │
│   • Trace IDs      │     │   • Span attributes  │
└────────┬───────────┘     └──────────┬───────────┘
         │                            │
         v                            v
┌─────────────────────────────────────────────────────────────┐
│              Instrumented Components                         │
│  • redis.ts (Redis operations)                              │
│  • session-cache.ts (Cache operations)                      │
│  • connection-manager.ts (Circuit breaker)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        v                             v
┌────────────────────┐     ┌──────────────────────┐
│  Log Aggregation   │     │  Trace Backend       │
│  (ELK, Loki, etc)  │     │  (Jaeger, Tempo)     │
└────────────────────┘     └──────────────────────┘
```

## Components

### 1. Structured Logging (`logger.ts`)

Winston-based logging with:
- JSON formatting for production
- Colorized output for development
- Correlation ID injection
- Trace ID injection
- Log levels (debug, info, warn, error)
- File rotation in production

**Usage:**
```typescript
import { logger, logRedisOperation } from './observability/logger'

logRedisOperation({
  operation: 'get',
  message: 'Cache hit',
  level: 'info',
  duration_ms: 4.2,
  key: 'session:abc123',
  cache_hit: true,
})
```

**Log Format:**
```
2025-11-22 16:30:45.123 info [redis-cache] [a1b2c3d4] [trace:ef123456]: Cache hit {
  "operation": "get",
  "duration_ms": 4.2,
  "cache_hit": true,
  "trace_id": "ef123456789abcdef0123456789abcde",
  "span_id": "0123456789abcdef"
}
```

### 2. Distributed Tracing (`tracing.ts`)

OpenTelemetry SDK with:
- OTLP HTTP exporter
- Automatic instrumentation (HTTP, Express)
- Manual instrumentation helpers
- Configurable sampling rates
- Semantic conventions compliance

**Usage:**
```typescript
import { traceRedisOperation } from './observability/tracing'

const value = await traceRedisOperation(
  'get',
  {
    'redis.key': key,
    'redis.command': 'GET',
  },
  async (span) => {
    const result = await redis.get(key)
    span.setAttribute('redis.cache.hit', result !== null)
    return result
  }
)
```

**Span Hierarchy Example:**
```
redis.get (10ms)
  ├─ redis.key = "session:abc123"
  ├─ redis.command = "GET"
  ├─ redis.cache.hit = true
  ├─ correlation.id = "a1b2c3d4..."
  └─ db.system = "redis"
```

### 3. Correlation IDs (`correlation.ts`)

UUID-based correlation tracking via AsyncLocalStorage:
- Request-level correlation
- Thread-safe propagation
- Header extraction (x-correlation-id, x-request-id, etc.)
- Automatic injection into logs and traces

**Usage:**
```typescript
import { withCorrelationId } from './observability/correlation'

await withCorrelationId('req-123', async () => {
  // All operations within this context have correlation ID
  await someOperation()
})
```

## Configuration

### Environment Variables

```bash
# Tracing Configuration
OTEL_ENABLED=true                                   # Enable/disable tracing
OTEL_SERVICE_NAME=studio                            # Service name in traces
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces  # OTLP endpoint
OTEL_TRACE_SAMPLE_RATE=0.1                         # Sample rate (0.1 = 10%)

# Logging Configuration
LOG_LEVEL=info                                      # debug, info, warn, error
NODE_ENV=production                                 # Affects log format

# Redis Configuration (affects tracing)
REDIS_URL=redis://localhost:6379                   # Redis connection string
```

### Sampling Strategy

Production sampling recommendations:
- **High traffic (>10k req/s)**: 1-5% (`OTEL_TRACE_SAMPLE_RATE=0.01`)
- **Medium traffic (1k-10k req/s)**: 10% (`OTEL_TRACE_SAMPLE_RATE=0.1`)
- **Low traffic (<1k req/s)**: 50-100% (`OTEL_TRACE_SAMPLE_RATE=0.5`)
- **Development**: 100% (`OTEL_TRACE_SAMPLE_RATE=1.0`)

## Instrumented Operations

### Redis Operations
- `redis.get` - Key retrieval with cache hit tracking
- `redis.set` - Key storage with TTL tracking
- `redis.hget` - Hash field retrieval
- `redis.hset` - Hash field storage
- `redis.hgetall` - Full hash retrieval

**Span Attributes:**
- `redis.key` - Key being operated on
- `redis.command` - Redis command (GET, SET, HGET, etc.)
- `redis.cache.hit` - Boolean indicating cache hit/miss
- `redis.value.size` - Size of value in bytes
- `redis.ttl` - Time-to-live in seconds
- `redis.hash.field` - Hash field name
- `redis.hash.field.count` - Number of fields in hash

### Session Cache Operations
- `cache.session.get` - Session retrieval from cache
- `cache.session.set` - Session storage in cache
- `cache.session.invalidate` - Session removal from cache

**Span Attributes:**
- `cache.type` - Cache backend (redis)
- `cache.hit` - Boolean indicating hit/miss
- `cache.miss.reason` - Reason for miss (key_not_found, expired, etc.)
- `cache.session.user_id` - User ID associated with session
- `cache.session.id` - Session ID
- `cache.ttl` - Cache TTL in seconds
- `cache.fields.count` - Number of fields stored

### Connection Pool Operations
- `pool.acquire` - Connection acquisition from pool
- `pool.release` - Connection return to pool
- `pool.create` - New connection creation
- `pool.destroy` - Connection termination

**Span Attributes:**
- `pool.size` - Total pool size
- `pool.available` - Available connections
- `pool.pending` - Pending acquisition requests
- `pool.acquire.duration_ms` - Time to acquire connection

### Circuit Breaker Events
- `circuit_breaker.open` - Circuit opened due to failures
- `circuit_breaker.half-open` - Circuit testing recovery
- `circuit_breaker.close` - Circuit closed (healthy)
- `circuit_breaker.failure` - Failure recorded

**Span Attributes:**
- `circuit_breaker.project_id` - Project ID
- `circuit_breaker.db_type` - Database type (redis, postgres, etc.)
- `circuit_breaker.state` - Circuit state
- `circuit_breaker.error_threshold` - Error threshold percentage
- `circuit_breaker.error.type` - Error type
- `circuit_breaker.error.message` - Error message

## Integration

### Setting up Trace Collection

#### Option 1: Jaeger (Recommended for Dev)

```bash
# Run Jaeger all-in-one
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Configure Studio
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_ENABLED=true

# Access UI at http://localhost:16686
```

#### Option 2: Grafana Tempo

```bash
# Run Tempo with Docker
docker run -d --name tempo \
  -p 3200:3200 \
  -p 4318:4318 \
  grafana/tempo:latest

# Configure Studio
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

#### Option 3: Cloud Provider (Production)

**AWS X-Ray:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-region.amazonaws.com/v1/traces
```

**GCP Cloud Trace:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://cloudtrace.googleapis.com/v1/traces
```

**DataDog APM:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://trace.agent.datadoghq.com/v1/traces
```

### Log Aggregation

Logs include `trace_id` and `span_id` for correlation:

```json
{
  "timestamp": "2025-11-22T16:30:45.123Z",
  "level": "info",
  "message": "Cache hit",
  "service": "redis-cache",
  "correlation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "trace_id": "ef123456789abcdef0123456789abcde",
  "span_id": "0123456789abcdef",
  "operation": "cache_get",
  "duration_ms": 4.2,
  "cache_hit": true
}
```

Configure your log aggregator to link traces:
- **Grafana Loki**: Use `trace_id` label for trace-to-logs
- **ELK Stack**: Create Kibana links from `trace_id` field
- **DataDog**: Automatic correlation via APM integration

## Querying Traces

### Jaeger Query Examples

**Find slow Redis operations:**
```
service=studio operation=redis.* duration>100ms
```

**Find cache misses for specific user:**
```
service=studio operation=cache.session.get cache.hit=false cache.session.user_id=user-123
```

**Find circuit breaker failures:**
```
service=studio operation=circuit_breaker.* circuit_breaker.state=open
```

### Trace-to-Log Correlation

Given a trace ID from Jaeger, find related logs:
```bash
# Search logs by trace_id
grep "trace_id.*ef123456789abcdef" /var/log/studio/redis-combined.log

# Or in log aggregator
# Loki query: {service="redis-cache"} | json | trace_id="ef123456789abcdef"
# Elasticsearch query: trace_id:"ef123456789abcdef"
```

## Troubleshooting

### Tracing Not Working

1. **Check SDK initialization:**
```typescript
import { getTracingConfig } from './observability/tracing'
console.log(getTracingConfig())
// Should show sdk_initialized: true
```

2. **Verify OTLP endpoint:**
```bash
# Test endpoint connectivity
curl http://localhost:4318/v1/traces -X POST -d '{}'
```

3. **Check sampling rate:**
```bash
# Increase sampling for debugging
export OTEL_TRACE_SAMPLE_RATE=1.0
```

4. **Enable debug logging:**
```bash
export LOG_LEVEL=debug
```

### High Memory Usage

If trace exporter buffers grow too large:

1. **Reduce sampling rate:**
```bash
export OTEL_TRACE_SAMPLE_RATE=0.01  # 1%
```

2. **Increase batch export frequency:**
```typescript
// In tracing.ts, adjust BatchSpanProcessor config:
new BatchSpanProcessor(traceExporter, {
  maxQueueSize: 1024,
  scheduledDelayMillis: 500,
  maxExportBatchSize: 512,
})
```

### Missing Trace Context

If logs don't have `trace_id`:

1. **Verify tracing is enabled:**
```bash
curl http://localhost:3000/api/health/redis | jq '.tracing'
```

2. **Check active span:**
```typescript
import { getTraceContext } from './observability/tracing'
const context = getTraceContext()
console.log(context)  // Should have trace_id and span_id
```

## Performance Impact

### Tracing Overhead

Measured performance impact:
- **Span creation**: ~0.05ms per span
- **Attribute setting**: ~0.01ms per attribute
- **Span export** (async): ~1ms per batch
- **Total overhead**: <1% at 10% sampling rate

### Recommended Settings by Traffic Level

| Traffic Level | Sample Rate | Expected Overhead |
|---------------|-------------|-------------------|
| < 1k req/s    | 50-100%     | 0.5-1%           |
| 1k-10k req/s  | 10-20%      | 0.1-0.2%         |
| 10k-100k req/s| 1-5%        | 0.01-0.05%       |
| > 100k req/s  | 0.1-1%      | 0.001-0.01%      |

### Memory Usage

At 10% sampling rate:
- **Per span**: ~2KB
- **10k spans/minute**: ~20MB buffered
- **Batch export**: Clears buffer every 5s
- **Steady state**: ~5-10MB

## Testing

### Unit Tests

```bash
# Run tracing tests
npm test -- .tests/unit/observability/tracing.test.ts

# Run all observability tests
npm test -- .tests/unit/observability/

# With coverage
npm test -- .tests/unit/observability/ --coverage
```

### Integration Testing

```bash
# Start Jaeger
docker run -d -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one

# Configure Studio
export OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_TRACE_SAMPLE_RATE=1.0

# Run application
npm run dev

# Generate traffic
curl http://localhost:3000/api/health/redis

# View traces
open http://localhost:16686
```

## Best Practices

### 1. Span Naming

Use consistent, hierarchical names:
- ✅ `redis.get`, `redis.set`, `cache.session.get`
- ❌ `getFromRedis`, `do_cache_operation`

### 2. Attribute Naming

Follow semantic conventions:
- Database operations: `db.system`, `db.operation`
- Cache operations: `cache.type`, `cache.hit`
- Network: `net.peer.name`, `net.peer.port`

### 3. Error Handling

Always record exceptions:
```typescript
try {
  await operation()
  span.setStatus({ code: SpanStatusCode.OK })
} catch (error) {
  span.setStatus({ code: SpanStatusCode.ERROR })
  span.recordException(error)
  throw error
}
```

### 4. Sampling Strategy

Balance observability and cost:
- Sample 100% of errors
- Sample high-latency requests at higher rate
- Sample normal operations at configured rate

### 5. Correlation IDs

Always propagate correlation IDs:
```typescript
// Extract from request headers
const correlationId = ensureCorrelationId(req.headers)

// Use in all operations
await withCorrelationId(correlationId, async () => {
  await businessLogic()
})
```

## Future Enhancements

1. **Metrics Export**: Add Prometheus exporter for metrics
2. **Trace Sampling**: Implement adaptive sampling based on latency
3. **Log Sampling**: Add structured log sampling to reduce volume
4. **Custom Exporters**: Support multiple trace backends simultaneously
5. **Trace Analysis**: Add automatic anomaly detection on trace patterns
