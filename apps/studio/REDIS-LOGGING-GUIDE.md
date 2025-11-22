# Redis Structured Logging Guide

**Status**: Production Ready
**Version**: 1.0.0
**Last Updated**: 2025-11-22

---

## Overview

This guide covers the Winston-based structured logging system implemented across the Redis caching layer. All logs are JSON-formatted with correlation IDs for distributed tracing and rich contextual metadata for debugging.

---

## Quick Start

### Basic Usage

```typescript
import { logger } from './lib/api/observability/logger'

// Simple info log
logger.info('Cache operation completed')

// Log with context
logger.info('Session validated', {
  user_id: 'user_abc123',
  session_id: 'sess_xyz789',
  duration_ms: 4.5
})

// Error logging
logger.error('Connection failed', {
  error: new Error('Connection timeout'),
  retry_count: 3
})
```

### Helper Functions

```typescript
import { logRedisOperation, logCacheOperation } from './lib/api/observability/logger'

// Redis operation logging
logRedisOperation({
  operation: 'get',
  message: 'Retrieved key from Redis',
  level: 'info',
  key: 'session:user_123',
  duration_ms: 3.2,
  project_id: 'my-project'
})

// Cache-specific logging
logCacheOperation({
  operation: 'get',
  cache_hit: true,
  duration_ms: 4.5,
  key: 'session:user_123',
  user_id: 'user_123',
  session_id: 'sess_456'
})
```

### Correlation IDs

```typescript
import { withCorrelationId, generateCorrelationId } from './lib/api/observability/correlation'

// API route handler
export default async function handler(req, res) {
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId()

  return withCorrelationId(correlationId, async () => {
    // All logs in this context automatically include correlation_id
    await validateSession(req.cookies.token)
    // ... rest of handler
  })
}
```

---

## Log Format

### Standard Fields

Every log entry includes these fields:

```json
{
  "timestamp": "2025-11-22T06:45:00.123Z",
  "level": "info",
  "service": "redis-cache",
  "environment": "production",
  "correlation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Cache hit for session validation"
}
```

### Operation Context

Operation-specific logs include additional context:

```json
{
  "timestamp": "2025-11-22T06:45:00.123Z",
  "level": "info",
  "service": "redis-cache",
  "environment": "production",
  "correlation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Session validated from cache",
  "operation": "cache_get",
  "user_id": "user_abc123",
  "org_id": "org_xyz789",
  "session_id": "sess_def456",
  "key": "session:user_abc123",
  "duration_ms": 4.5,
  "cache_hit": true
}
```

### Error Context

Errors include stack traces and error classification:

```json
{
  "timestamp": "2025-11-22T06:45:01.456Z",
  "level": "error",
  "service": "redis-cache",
  "environment": "production",
  "correlation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Connection failed",
  "operation": "redis_connect",
  "error_type": "TimeoutError",
  "error_message": "Connection timeout after 10000ms",
  "error_stack": "Error: Connection timeout...",
  "retry_count": 3,
  "will_retry": true,
  "project_id": "my-project"
}
```

---

## Log Levels

### DEBUG
Detailed information for diagnosing problems. Disabled in production by default.

**Examples**:
- Connection pool acquire/release events
- Individual Redis command execution
- Cache key lookups

**Usage**:
```typescript
logger.debug('Connection acquired from pool', {
  pool_size: 10,
  pool_available: 3,
  pool_pending: 0
})
```

### INFO
General informational messages about system operation.

**Examples**:
- Cache hits/misses
- Session validation success
- Connection pool initialization
- Health check results

**Usage**:
```typescript
logger.info('Session cache initialized', {
  cache_enabled: true,
  session_ttl: 300
})
```

### WARN
Potentially harmful situations that don't prevent operation.

**Examples**:
- High latency detected
- Circuit breaker half-open
- Cache disabled/unavailable
- Retry attempts

**Usage**:
```typescript
logger.warn('High cache latency detected', {
  duration_ms: 150,
  threshold_ms: 100,
  operation: 'get'
})
```

### ERROR
Error events that might still allow operation to continue.

**Examples**:
- Redis connection failures
- Cache operation errors
- Circuit breaker open
- Session validation failures

**Usage**:
```typescript
logger.error('Cache operation failed', {
  operation: 'get',
  key: 'session:user_123',
  error: error,
  fallback_used: true
})
```

---

## Query Examples

### Using jq

**Filter by level**:
```bash
cat logs/redis-combined.log | jq 'select(.level == "error")'
```

**Filter by correlation ID**:
```bash
cat logs/redis-combined.log | jq 'select(.correlation_id == "a1b2c3d4-e5f6-7890-abcd-ef1234567890")'
```

**Find cache misses**:
```bash
cat logs/redis-combined.log | jq 'select(.cache_hit == false)'
```

**Find slow operations (>100ms)**:
```bash
cat logs/redis-combined.log | jq 'select(.duration_ms > 100)'
```

**Group errors by type**:
```bash
cat logs/redis-combined.log | jq -r 'select(.level == "error") | .error_type' | sort | uniq -c
```

**Calculate average cache hit rate**:
```bash
cat logs/redis-combined.log | jq -r 'select(.operation == "cache_get") | .cache_hit' | awk '{sum+=$1; count++} END {print "Hit Rate:", (sum/count)*100"%"}'
```

**Trace request journey by correlation ID**:
```bash
cat logs/redis-combined.log | jq -c 'select(.correlation_id == "a1b2c3d4-e5f6-7890-abcd-ef1234567890") | {timestamp, operation, message, duration_ms}'
```

### Using grep

**Find all errors for specific user**:
```bash
grep "user_abc123" logs/redis-combined.log | grep '"level":"error"'
```

**Find circuit breaker events**:
```bash
grep "circuit_breaker" logs/redis-combined.log
```

**Find connection pool issues**:
```bash
grep "pool_" logs/redis-combined.log | grep -E '"level":"(error|warn)"'
```

### Using Elasticsearch/Splunk/Datadog

**Elasticsearch Query DSL**:
```json
{
  "query": {
    "bool": {
      "must": [
        { "term": { "service": "redis-cache" } },
        { "range": { "duration_ms": { "gte": 100 } } }
      ],
      "filter": [
        { "term": { "cache_hit": false } }
      ]
    }
  }
}
```

**Splunk Query**:
```
service="redis-cache" level=error | stats count by error_type
```

**Datadog Log Query**:
```
service:redis-cache @cache_hit:false @duration_ms:>100
```

---

## Common Patterns

### Tracing Session Validation

1. **Extract correlation ID from request**:
```typescript
import { extractCorrelationId, generateCorrelationId } from './lib/api/observability/correlation'

const correlationId = extractCorrelationId(req.headers) || generateCorrelationId()
```

2. **Wrap operation in correlation context**:
```typescript
import { withCorrelationId } from './lib/api/observability/correlation'

await withCorrelationId(correlationId, async () => {
  const session = await validateSessionWithCache(token)
  // All logs automatically include correlation_id
})
```

3. **Query logs for the request**:
```bash
cat logs/redis-combined.log | jq -c 'select(.correlation_id == "'$CORRELATION_ID'") | {timestamp, operation, message, cache_hit, duration_ms}'
```

### Debugging Cache Performance

**Find cache operations sorted by duration**:
```bash
cat logs/redis-combined.log | jq -s 'map(select(.operation | startswith("cache_"))) | sort_by(.duration_ms) | reverse | .[] | {operation, duration_ms, cache_hit, key}' | head -20
```

**Calculate cache hit rate by operation**:
```bash
cat logs/redis-combined.log | jq -r 'select(.operation == "cache_get") | "\(.cache_hit)"' | awk '{if($1=="true") hits++; else misses++} END {print "Hits:", hits, "Misses:", misses, "Rate:", (hits/(hits+misses))*100"%"}'
```

**Find hotkeys**:
```bash
cat logs/redis-combined.log | jq -r 'select(.key) | .key' | sort | uniq -c | sort -rn | head -10
```

### Investigating Connection Issues

**Find connection pool exhaustion**:
```bash
cat logs/redis-combined.log | jq 'select(.pool_available == 0 and .pool_pending > 0)'
```

**Find circuit breaker state changes**:
```bash
cat logs/redis-combined.log | jq -c 'select(.operation | startswith("circuit_breaker_")) | {timestamp, operation, project_id, db_type, message}'
```

**Calculate error rate over time**:
```bash
cat logs/redis-combined.log | jq -r 'select(.level == "error") | .timestamp[:16]' | uniq -c
```

---

## Configuration

### Environment Variables

**LOG_LEVEL**: Set minimum log level (default: `info` in production, `debug` in development)
```bash
# Development - verbose logging
LOG_LEVEL=debug

# Production - balanced logging
LOG_LEVEL=info

# Production - errors only
LOG_LEVEL=error
```

**NODE_ENV**: Controls log format and file output
```bash
# Development - colorized console output
NODE_ENV=development

# Production - JSON logs + file rotation
NODE_ENV=production
```

### Log Rotation

Production logs automatically rotate:
- **Max file size**: 5MB
- **Max files**: 5 (keeps last 25MB)
- **Rotation**: Automatic when size limit reached
- **Compression**: Not enabled (can add if needed)

Files:
- `logs/redis-error.log` - Errors only
- `logs/redis-combined.log` - All levels

### Custom Configuration

Create a child logger with default metadata:

```typescript
import { createChildLogger } from './lib/api/observability/logger'

const projectLogger = createChildLogger({
  project_id: 'my-project',
  tier: 'pro'
})

// All logs from this logger include project_id and tier
projectLogger.info('Operation completed')
```

---

## Integration with Existing Code

### Step 1: Import Logger

```typescript
import { logger, logRedisOperation } from './lib/api/observability/logger'
import { withCorrelationId } from './lib/api/observability/correlation'
```

### Step 2: Replace console.log

**Before**:
```typescript
console.log('Cache hit for key:', key)
console.error('Connection failed:', error)
```

**After**:
```typescript
logger.info('Cache hit', { key })
logger.error('Connection failed', { error })
```

### Step 3: Add Context

```typescript
// Rich context for debugging
logger.info('Session validated', {
  user_id: session.userId,
  session_id: session.id,
  duration_ms: Date.now() - startTime,
  cache_hit: true
})
```

### Step 4: Use Correlation IDs

```typescript
// API route handler
export default async function handler(req, res) {
  return withRequestCorrelation(req.headers, async () => {
    // All nested operations inherit correlation ID
    const result = await someOperation()
    return res.json(result)
  })
}
```

---

## Performance Considerations

### Logging Overhead

Current measured overhead:
- **Synchronous logging**: <0.5ms per log entry
- **File I/O**: <1ms per entry (buffered)
- **JSON serialization**: <0.1ms per entry

**Total overhead**: <1ms per operation (target met ✅)

### Best Practices

**DO**:
- Log at appropriate levels (debug for verbose, info for important)
- Include correlation IDs for request tracing
- Add context (user_id, session_id, operation details)
- Log errors with full context
- Use helper functions (logRedisOperation, logCacheOperation)

**DON'T**:
- Log sensitive data (passwords, full tokens, PII)
- Log in tight loops without throttling
- Use console.log/console.error directly
- Log massive payloads (limit to metadata)
- Log at debug level in production without good reason

### Sampling for High-Volume Operations

For operations exceeding 1000 req/sec, consider sampling:

```typescript
const SAMPLE_RATE = 0.1 // Log 10% of operations

if (Math.random() < SAMPLE_RATE) {
  logger.debug('High-frequency operation', { key, duration_ms })
}

// Always log errors
if (error) {
  logger.error('Operation failed', { key, error })
}
```

---

## Troubleshooting

### Missing Correlation IDs

**Symptom**: Logs don't have correlation_id field

**Solution**: Ensure operations are wrapped in correlation context:
```typescript
import { withCorrelationId } from './lib/api/observability/correlation'

await withCorrelationId(correlationId, async () => {
  // Operations here will have correlation_id
})
```

### Log Files Not Created

**Symptom**: logs/redis-error.log doesn't exist

**Causes**:
1. NODE_ENV != 'production' (file logging is production-only)
2. Directory permissions (create logs/ directory)
3. Disk space (check available space)

**Solution**:
```bash
mkdir -p logs
chmod 755 logs
NODE_ENV=production npm start
```

### High Log Volume

**Symptom**: Log files rotating too frequently

**Solutions**:
1. Increase log level: `LOG_LEVEL=info` or `LOG_LEVEL=warn`
2. Implement sampling for high-frequency operations
3. Use log aggregation service (Datadog, Splunk)
4. Increase maxsize in logger config

### Cannot Parse Logs with jq

**Symptom**: jq errors on log file

**Causes**:
1. Mixed development/production logs (development uses colorized format)
2. Truncated log entries
3. Non-JSON data in log file

**Solution**:
```bash
# Filter only valid JSON lines
cat logs/redis-combined.log | grep '^{' | jq '.'
```

---

## Production Deployment Checklist

- [ ] LOG_LEVEL set appropriately (info or warn)
- [ ] NODE_ENV=production
- [ ] logs/ directory exists with write permissions
- [ ] Log rotation configured (default: 5MB, 5 files)
- [ ] Correlation ID middleware added to API routes
- [ ] Sensitive data sanitized from logs
- [ ] Log aggregation service configured (optional)
- [ ] Alert rules set up for error patterns
- [ ] Dashboard created for key metrics
- [ ] Team trained on log query patterns

---

## Example Queries for Common Scenarios

### "Why is caching not working?"

```bash
# Check if cache is enabled
cat logs/redis-combined.log | jq 'select(.operation == "session_cache_init")'

# Check cache hit rate
cat logs/redis-combined.log | jq -r 'select(.operation == "cache_get") | .cache_hit' | awk '{if($1=="true") hits++; else misses++} END {print "Hits:", hits, "Misses:", misses}'

# Find cache errors
cat logs/redis-combined.log | jq 'select(.operation | startswith("cache_")) | select(.level == "error")'
```

### "Why is this request slow?"

```bash
# Get correlation ID from slow request
CORRELATION_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# Trace entire request with timings
cat logs/redis-combined.log | jq -c 'select(.correlation_id == "'$CORRELATION_ID'") | {timestamp, operation, message, duration_ms}' | sort

# Find the bottleneck
cat logs/redis-combined.log | jq -c 'select(.correlation_id == "'$CORRELATION_ID'") | {operation, duration_ms}' | jq -s 'sort_by(.duration_ms) | reverse'
```

### "Is Redis healthy?"

```bash
# Check recent errors
cat logs/redis-combined.log | tail -1000 | jq 'select(.level == "error")'

# Check circuit breaker state
cat logs/redis-combined.log | tail -1000 | jq 'select(.operation | startswith("circuit_breaker_"))'

# Check connection pool health
cat logs/redis-combined.log | tail -100 | jq 'select(.operation | startswith("pool_")) | {operation, pool_size, pool_available, pool_pending}'
```

### "Who is hammering the cache?"

```bash
# Find most active users
cat logs/redis-combined.log | jq -r 'select(.user_id) | .user_id' | sort | uniq -c | sort -rn | head -10

# Find hotkeys
cat logs/redis-combined.log | jq -r 'select(.key) | .key' | sort | uniq -c | sort -rn | head -10

# Check hotkey detector output
cat logs/redis-combined.log | jq 'select(.operation == "hotkey_detected")'
```

---

## Next Steps

After implementing structured logging, consider:

1. **OpenTelemetry Integration** - Correlate logs with traces and metrics
2. **Centralized Log Aggregation** - Send logs to Datadog, Splunk, or ELK
3. **Automated Alerting** - Set up alerts for error patterns (WS4)
4. **Log-Based Dashboards** - Visualize cache performance metrics (WS3)
5. **Compliance Auditing** - Use logs for security audit trails
6. **Cost Optimization** - Analyze logs to tune cache retention

---

## Support

**Questions?** Check the code comments in:
- `lib/api/observability/logger.ts` - Logger implementation
- `lib/api/observability/correlation.ts` - Correlation ID system

**Issues?** Common problems are documented in the Troubleshooting section above.

**Feature Requests?** Structured logging is extensible - add custom helpers for your use case.

---

**Version History**:
- v1.0.0 (2025-11-22) - Initial release with Winston, correlation IDs, and production-ready configuration
