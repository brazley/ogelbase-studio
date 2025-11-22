# WS2: Structured Logging (Winston)

**Sprint**: 4 - Redis Observability & Scale
**Owner**: Luca Rossi (Log Aggregation & Analysis Specialist)
**Agent Type**: `LucaRossi`
**Est. Duration**: 2 days
**Priority**: P1 (Observability - Quick Win)
**Status**: 🟡 READY TO START

---

## Objective

Replace console.log statements with Winston structured logging throughout the Redis implementation. Add correlation IDs, context-rich metadata, and proper log levels for production observability.

---

## Context

**Current State**:
- Winston is already installed (`winston@^3.18.3` in package.json)
- Redis client uses basic console.log for debugging
- No correlation IDs or structured context
- Logs are not searchable or filterable

**Desired State**:
- All logs are JSON structured
- Correlation IDs track requests end-to-end
- Rich context (user_id, org_id, session_id, operation_type)
- Log levels properly configured (debug, info, warn, error)
- Production-ready log rotation

---

## Files to Modify

### Create New Files

**1. `lib/api/observability/logger.ts`** (NEW)
- Winston logger configuration
- Custom formatters for Redis operations
- Correlation ID middleware
- Log level filtering
- Production log rotation config

**2. `lib/api/observability/correlation.ts`** (NEW)
- Correlation ID generation
- Context propagation utilities
- Request tracking helpers

### Modify Existing Files

**3. `lib/api/platform/redis.ts`** (UPDATE)
- Replace all console.log with structured logging
- Add operation context (operation_type, key_pattern, latency)
- Log connection pool events
- Circuit breaker state changes

**4. `lib/api/auth/session-cache.ts`** (UPDATE)
- Log cache hits/misses with context
- Session validation events
- Error context enrichment
- Performance metrics logging

**5. `lib/api/platform/connection-manager.ts`** (UPDATE)
- Connection lifecycle events
- Circuit breaker triggers
- Performance degradation warnings

**6. `pages/api/health/redis.ts`** (UPDATE)
- Health check results logging
- Alert threshold breaches

---

## Technical Specifications

### Winston Logger Configuration

```typescript
// lib/api/observability/logger.ts
import winston from 'winston'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'redis-cache',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'logs/redis-error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/redis-combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

export default logger
```

### Correlation ID Pattern

```typescript
// lib/api/observability/correlation.ts
import { v4 as uuidv4 } from 'uuid'
import { AsyncLocalStorage } from 'async_hooks'

const correlationStorage = new AsyncLocalStorage<string>()

export function generateCorrelationId(): string {
  return uuidv4()
}

export function setCorrelationId(id: string): void {
  correlationStorage.enterWith(id)
}

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()
}

export function withCorrelationId<T>(
  id: string,
  fn: () => T
): T {
  return correlationStorage.run(id, fn)
}
```

### Log Entry Format

**Standard Fields (Every Log)**:
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

**Operation Context (Operation-Specific)**:
```json
{
  // ... standard fields ...
  "operation": "session_cache_get",
  "user_id": "user_abc123",
  "org_id": "org_xyz789",
  "session_id": "sess_def456",
  "key": "session:user_abc123",
  "duration_ms": 4.5,
  "cache_hit": true
}
```

**Error Context**:
```json
{
  // ... standard fields ...
  "level": "error",
  "operation": "redis_connection",
  "error_type": "ConnectionError",
  "error_message": "Connection timeout after 10000ms",
  "error_stack": "Error: Connection timeout...",
  "retry_count": 3,
  "fatal": false
}
```

---

## Implementation Steps

### Day 1: Logger Setup & Core Implementation

**Morning (4 hours)**:
1. Create `lib/api/observability/logger.ts`
   - Winston configuration
   - Custom formatters
   - Log rotation setup
   - Environment-based config

2. Create `lib/api/observability/correlation.ts`
   - AsyncLocalStorage setup
   - Correlation ID helpers
   - Context propagation

**Afternoon (4 hours)**:
3. Update `lib/api/platform/redis.ts`
   - Replace console.log with logger
   - Add operation context
   - Connection pool event logging
   - Circuit breaker logging

4. Update `lib/api/auth/session-cache.ts`
   - Cache operation logging
   - Performance metrics
   - Error enrichment

### Day 2: Integration & Documentation

**Morning (4 hours)**:
5. Update `lib/api/platform/connection-manager.ts`
   - Connection lifecycle logging
   - Circuit breaker events

6. Update `pages/api/health/redis.ts`
   - Health check logging
   - Alert logging

7. Add correlation ID middleware to API routes
   - Extract/generate correlation ID from headers
   - Propagate through request lifecycle

**Afternoon (4 hours)**:
8. Testing
   - Verify all logs are JSON formatted
   - Test correlation ID propagation
   - Validate log rotation
   - Performance impact testing (<1ms overhead)

9. Documentation
   - Create `REDIS-LOGGING-GUIDE.md`
   - Log format reference
   - Query examples (jq, grep)
   - Troubleshooting guide

---

## Acceptance Criteria

### Functional Requirements
- [ ] All console.log replaced with structured logging
- [ ] Every log entry has correlation_id
- [ ] Logs include rich context (user_id, org_id, operation_type)
- [ ] Log levels properly configured (debug/info/warn/error)
- [ ] Log rotation configured (5MB max, 5 files retention)
- [ ] Correlation IDs propagate through entire request

### Performance Requirements
- [ ] Logging overhead <1ms per operation
- [ ] No memory leaks from log buffers
- [ ] Log rotation doesn't block operations

### Testing Requirements
- [ ] Verify JSON format for all log entries
- [ ] Test correlation ID in nested operations
- [ ] Verify log rotation works
- [ ] Test log parsing with jq
- [ ] Validate log levels filter correctly

### Documentation Requirements
- [ ] `REDIS-LOGGING-GUIDE.md` created
- [ ] Log format documented
- [ ] Query examples provided
- [ ] Integration guide for new code

---

## Dependencies

**External**:
- ✅ Winston already installed (`winston@^3.18.3`)
- Need: `uuid` for correlation IDs (check if installed)

**Internal**:
- No blocking dependencies
- Can start immediately

---

## Risks & Mitigations

### Risk 1: Performance Overhead
**Impact**: Medium
**Mitigation**:
- Benchmark before/after
- Use async logging for non-critical entries
- Lazy evaluation of expensive context

### Risk 2: Log Explosion
**Impact**: Medium
**Mitigation**:
- Proper log levels (avoid debug in production)
- Log sampling for high-frequency operations
- Aggressive log rotation

### Risk 3: Sensitive Data in Logs
**Impact**: High
**Mitigation**:
- Never log full session tokens
- Redact passwords/secrets
- Hash user IDs in production (optional)

---

## Testing Plan

### Unit Tests
```typescript
// __tests__/logger.test.ts
describe('Redis Logger', () => {
  it('should create JSON formatted logs', () => {
    const log = logger.info('test message', { key: 'value' })
    expect(JSON.parse(log)).toHaveProperty('timestamp')
  })

  it('should include correlation ID', () => {
    withCorrelationId('test-123', () => {
      const log = logger.info('test')
      expect(JSON.parse(log).correlation_id).toBe('test-123')
    })
  })
})
```

### Integration Tests
```typescript
// __tests__/correlation.test.ts
describe('Correlation ID Propagation', () => {
  it('should propagate through Redis operations', async () => {
    const correlationId = generateCorrelationId()
    await withCorrelationId(correlationId, async () => {
      await redisClient.get('test-key')
      // Verify logs include correlation_id
    })
  })
})
```

### Manual Testing
1. Trigger cache operations
2. Check logs are JSON: `cat logs/redis-combined.log | jq '.'`
3. Filter by correlation ID: `cat logs/redis-combined.log | jq 'select(.correlation_id == "xyz")'`
4. Check log rotation: Fill logs, verify old files archived

---

## Deliverables

### Code
1. `lib/api/observability/logger.ts` - Winston setup
2. `lib/api/observability/correlation.ts` - Correlation helpers
3. Updated `lib/api/platform/redis.ts` - Structured logging
4. Updated `lib/api/auth/session-cache.ts` - Structured logging
5. Updated `lib/api/platform/connection-manager.ts` - Structured logging
6. Updated `pages/api/health/redis.ts` - Structured logging

### Documentation
7. `REDIS-LOGGING-GUIDE.md` - Complete logging guide

### Tests
8. Unit tests for logger
9. Integration tests for correlation
10. Manual test verification

---

## Example Log Output

### Cache Hit
```json
{
  "timestamp": "2025-11-22T06:45:00.123Z",
  "level": "info",
  "service": "redis-cache",
  "environment": "production",
  "correlation_id": "a1b2c3d4",
  "operation": "session_cache_get",
  "message": "Cache hit",
  "user_id": "user_abc",
  "session_id": "sess_def",
  "key": "session:user_abc",
  "duration_ms": 3.2,
  "cache_hit": true
}
```

### Connection Error
```json
{
  "timestamp": "2025-11-22T06:45:01.456Z",
  "level": "error",
  "service": "redis-cache",
  "environment": "production",
  "correlation_id": "a1b2c3d4",
  "operation": "redis_connect",
  "message": "Connection failed",
  "error_type": "TimeoutError",
  "error_message": "Connection timeout after 10000ms",
  "error_stack": "Error: Connection timeout...",
  "retry_count": 3,
  "will_retry": true
}
```

---

## Success Metrics

**Observability Improvement**:
- Correlation tracking: 0% → 100%
- Structured logs: 0% → 100%
- Searchable context: 0% → 100%

**Performance**:
- Logging overhead: <1ms per operation
- No memory leaks over 24 hours
- Log file size under control

**Usability**:
- Time to debug issues: -50%
- Log query success rate: +80%

---

## Next Steps After Completion

1. Integrate with WS1 (OpenTelemetry) for trace correlation
2. Export logs to centralized logging service (optional)
3. Set up log-based alerts (WS4)
4. Create log analysis dashboard (WS3)

---

**Ready to Start**: ✅ All dependencies verified, specs complete
**Blocked By**: None
**Blocks**: WS4 (alerting depends on structured logs)
