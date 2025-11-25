# ELENA RODRIGUEZ - Ogelfy Logging System Implementation

**Mission**: Build production-grade Pino logger integration with request-scoped child loggers

**Date**: 2025-11-22
**TPM**: Dylan Torres
**Estimated Effort**: 6-8 hours
**Priority**: P1 (Production observability feature)

---

## Context & Background

**What is Ogelfy?**
Ogelfy is a high-performance, Bun-native web framework with Fastify-inspired architecture. It's now a mature framework with hooks, plugins, error handling, schema validation, and comprehensive testing infrastructure.

**Current State**:
- ✅ Complete lifecycle hooks system (onRequest → onResponse)
- ✅ Plugin architecture with encapsulation
- ✅ Error handling with custom handlers
- ✅ Schema validation with Ajv
- ✅ Content parsing and serialization
- ✅ Decorator system for extending objects
- ✅ 322 passing tests

**What's Missing**:
- ❌ Structured logging with Pino
- ❌ Request-scoped child loggers
- ❌ Log correlation with request IDs
- ❌ Sensitive data redaction
- ❌ Development vs production log formats

---

## Working Directory

**Base Path**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/`

**Key Files to Understand**:
```
src/
├── index.ts              # Main Ogelfy class (530 lines)
├── types.ts              # RouteContext, OgelfyOptions (72 lines)
├── hooks.ts              # Lifecycle hooks + HookRequest (11,781 lines)
├── error-handler.ts      # Error handling system (7,585 lines)
├── router.ts             # Route matching (10,805 lines)
├── testing.ts            # Test injection (11,607 lines)
└── (other modules...)
```

**Test Infrastructure**:
```
__tests__/
├── hooks.test.ts         # Hook system tests
├── error-handler.test.ts # Error handling tests
├── integration.test.ts   # End-to-end tests
└── (12 test files total)
```

---

## Technical Requirements

### 1. Create `src/logger.ts` - Pino Logger Factory

**Purpose**: Create and configure Pino logger instances with proper serialization and redaction.

**Requirements**:

#### 1.1 Logger Configuration Interface
```typescript
export interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyPrint?: boolean;
  redact?: string[];
  serializers?: Record<string, (value: any) => any>;
}
```

#### 1.2 Logger Factory
```typescript
export function createLogger(options: LoggerOptions = {}): Logger {
  // Create Pino logger with:
  // - Configurable log level (default: 'info')
  // - Default redaction paths for sensitive data
  // - Request/Response serializers
  // - Error serializer (use pino.stdSerializers.err)
  // - Optional pretty printing for development
}
```

**Default Redaction Paths** (CRITICAL for security):
```typescript
[
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key'
]
```

#### 1.3 Request Serializer
```typescript
function reqSerializer(req: Request) {
  return {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
    remoteAddress: req.headers.get('x-forwarded-for') || 'unknown'
  };
}
```

#### 1.4 Response Serializer
```typescript
function resSerializer(res: Response) {
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries())
  };
}
```

#### 1.5 Pretty Print Configuration
For development, use `pino-pretty`:
```typescript
if (options.prettyPrint) {
  config.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  };
}
```

---

### 2. Update `src/types.ts` - Add Logger to Context

**Current `RouteContext`**:
```typescript
export interface RouteContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;
}
```

**Updated `RouteContext`**:
```typescript
import type { Logger } from 'pino';

export interface RouteContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  log: Logger;           // Request-scoped child logger
  requestId: string;     // Correlation ID for request
}
```

**Updated `OgelfyOptions`**:
```typescript
import type { LoggerOptions } from './logger';

export interface OgelfyOptions {
  logger?: LoggerOptions | boolean;  // false = disable, true = defaults, object = custom
  bodyLimit?: number;
  fileSizeLimit?: number;
  requestTimeout?: number;
  schemaCompiler?: { /* ... */ };
}
```

---

### 3. Update `src/index.ts` - Integrate Logger

**Current Constructor** (lines 50-75):
```typescript
constructor(options?: OgelfyOptions, parent?: Ogelfy) {
  this.parent = parent;
  this.requestTimeout = options?.requestTimeout;

  this.schemaCompiler = new SchemaCompiler(/* ... */);
  this.router = new Router(this.schemaCompiler);
  this.errorHandling = new ErrorHandling();
  this.contentParser = new ContentTypeParser();
  this.serializer = new Serializer();

  // ... plugin architecture setup
}
```

**Add Logger to Constructor**:
```typescript
import { createLogger } from './logger';
import type { Logger } from 'pino';

export class Ogelfy {
  private logger: Logger;
  // ... other private fields

  constructor(options?: OgelfyOptions, parent?: Ogelfy) {
    // Inherit logger from parent or create new one
    if (parent) {
      this.logger = parent.logger;
    } else {
      // Handle logger options
      if (options?.logger === false) {
        // Disable logging (create noop logger)
        this.logger = createLogger({ level: 'silent' });
      } else if (options?.logger === true || options?.logger === undefined) {
        // Default logging
        this.logger = createLogger();
      } else {
        // Custom logger options
        this.logger = createLogger(options.logger);
      }
    }

    // ... rest of constructor
  }
}
```

**Update `handleRequest` Method** (lines 343-494):

Current flow:
1. Create HookRequest with id/startTime
2. Find route
3. Parse body
4. Create RouteContext
5. Validate
6. Execute handler
7. Serialize response

**Add logging at these points**:

```typescript
private async handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const startTime = Date.now();

  // Create request-scoped logger with correlation ID
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const log = this.logger.child({
    requestId,
    method: req.method,
    url: url.pathname
  });

  // Log incoming request
  log.info({ req }, 'Incoming request');

  try {
    // ... existing code for hooks, routing, parsing ...

    // Create route context WITH logger
    const context: RouteContext = {
      params: route.params,
      query,
      body,
      log,              // Add logger to context
      requestId         // Add request ID to context
    };

    // ... validation, handler execution ...

    // Log successful completion
    log.info({
      res: response,
      duration: Date.now() - startTime
    }, 'Request completed');

    return response;
  } catch (error) {
    // Log errors
    log.error({
      err: error,
      duration: Date.now() - startTime
    }, 'Request failed');

    // ... existing error handling ...
  }
}
```

**Key Integration Points**:
1. **Before route lookup**: Log incoming request
2. **In context creation**: Add `log` and `requestId` to context
3. **After response**: Log completion with duration
4. **On error**: Log error with stack trace
5. **Async onResponse hook**: Can use context.log for post-response logging

---

### 4. Update `src/hooks.ts` - Export HookRequest Type

**Current `HookRequest`** (lines 30-35):
```typescript
export interface HookRequest extends Request {
  id?: string;
  startTime?: number;
  context?: RouteContext;
  [key: string]: any;
}
```

**No changes needed** - already supports context which now has logger.

The `context.log` will be available in all hooks after `preValidation` (when context is created).

---

### 5. Add Dependencies to `package.json`

**Current dependencies**:
```json
{
  "dependencies": {
    "@fastify/busboy": "^3.2.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1",
    "fast-json-stringify": "^6.1.1",
    "zod": "^3.22.4"
  }
}
```

**Add Pino**:
```json
{
  "dependencies": {
    "@fastify/busboy": "^3.2.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1",
    "fast-json-stringify": "^6.1.1",
    "pino": "^9.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "pino-pretty": "^11.0.0"
  }
}
```

---

### 6. Create Tests - `__tests__/logger.test.ts`

**Required Test Coverage** (minimum 20 tests):

#### 6.1 Logger Creation Tests (5 tests)
- ✅ Creates logger with default options
- ✅ Creates logger with custom level
- ✅ Enables pretty print in development
- ✅ Adds custom redaction paths
- ✅ Adds custom serializers

#### 6.2 Logger Integration Tests (8 tests)
- ✅ Logger available in route context
- ✅ Request ID generated for each request
- ✅ Request ID used from x-request-id header if present
- ✅ Child logger includes request metadata
- ✅ Logs incoming requests
- ✅ Logs successful responses with duration
- ✅ Logs errors with stack traces
- ✅ Logger disabled when options.logger = false

#### 6.3 Redaction Tests (4 tests)
- ✅ Redacts authorization headers
- ✅ Redacts cookie headers
- ✅ Redacts password fields
- ✅ Redacts token fields

#### 6.4 Serialization Tests (3 tests)
- ✅ Serializes request objects correctly
- ✅ Serializes response objects correctly
- ✅ Serializes errors with stack traces

**Test Pattern** (use existing test infrastructure):
```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';

describe('Logger', () => {
  test('creates request-scoped logger', async () => {
    const app = new Ogelfy({ logger: true });

    let capturedLog: any;
    app.get('/test', async (req, context) => {
      capturedLog = context.log;
      expect(context.log).toBeDefined();
      expect(context.requestId).toBeDefined();
      return { ok: true };
    });

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(200);
    expect(capturedLog).toBeDefined();
  });
});
```

---

## Usage Examples for Documentation

### Basic Usage
```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy({
  logger: true  // Enable with defaults
});

app.get('/user/:id', async (req, context) => {
  // Logger automatically available in context
  context.log.info('Fetching user');

  const user = await db.getUser(context.params.id);

  if (!user) {
    context.log.warn('User not found');
    throw app.httpErrors.notFound('User not found');
  }

  context.log.info({ user }, 'User fetched successfully');
  return user;
});
```

### Development Mode (Pretty Printing)
```typescript
const app = new Ogelfy({
  logger: {
    level: 'debug',
    prettyPrint: true
  }
});
```

### Production Mode (JSON Logs)
```typescript
const app = new Ogelfy({
  logger: {
    level: 'info',
    prettyPrint: false,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'apiKey'
    ]
  }
});
```

### Child Loggers for Components
```typescript
app.get('/api/data', async (req, context) => {
  const dbLogger = context.log.child({ component: 'database' });
  dbLogger.info('Querying database');

  const authLogger = context.log.child({ component: 'auth' });
  authLogger.info('Checking permissions');

  return { data: [] };
});
```

### Disabled Logging
```typescript
const app = new Ogelfy({
  logger: false  // No logging
});
```

---

## Expected Log Output

### Development (Pretty Print)
```
[14:23:45] INFO: Incoming request
    requestId: "abc-123"
    method: "GET"
    url: "/user/456"

[14:23:45] INFO: User fetched successfully
    requestId: "abc-123"
    user: { id: "456", name: "John" }

[14:23:45] INFO: Request completed
    requestId: "abc-123"
    statusCode: 200
    duration: 24
```

### Production (JSON)
```json
{"level":30,"time":1701234567890,"requestId":"abc-123","method":"GET","url":"/user/456","msg":"Incoming request"}
{"level":30,"time":1701234567914,"requestId":"abc-123","user":{"id":"456","name":"John"},"msg":"User fetched successfully"}
{"level":30,"time":1701234567914,"requestId":"abc-123","statusCode":200,"duration":24,"msg":"Request completed"}
```

### Error Logging
```json
{"level":50,"time":1701234567914,"requestId":"abc-123","err":{"type":"Error","message":"Database connection failed","stack":"Error: Database connection failed\n at ..."},"duration":15,"msg":"Request failed"}
```

---

## Deliverables Checklist

### Code Files
- [ ] `src/logger.ts` - Pino logger factory (~150-200 lines)
- [ ] `src/types.ts` - Updated interfaces (add log + requestId to RouteContext)
- [ ] `src/index.ts` - Logger integration in constructor and handleRequest
- [ ] `package.json` - Add pino and pino-pretty dependencies

### Tests
- [ ] `__tests__/logger.test.ts` - 20+ tests covering all features
- [ ] All existing tests still pass (322 tests)
- [ ] New tests pass with >80% coverage on logger module

### Documentation
- [ ] Update `docs/` with logging guide
- [ ] Add usage examples to README
- [ ] Document logger options in API docs

---

## Acceptance Criteria

**Functional Requirements**:
- ✅ Pino logger integrated with configurable options
- ✅ Request-scoped child loggers with correlation IDs
- ✅ Logger available in `context.log` for all routes
- ✅ Automatic logging of incoming requests
- ✅ Automatic logging of responses with duration
- ✅ Automatic logging of errors with stack traces
- ✅ Sensitive data redaction working
- ✅ Pretty print mode for development
- ✅ JSON mode for production
- ✅ Logger can be disabled with `logger: false`

**Quality Requirements**:
- ✅ 20+ tests with >80% coverage
- ✅ All existing 322 tests still passing
- ✅ TypeScript strict mode compliance
- ✅ No breaking changes to existing APIs
- ✅ Documentation with clear examples

**Performance Requirements**:
- ✅ Minimal overhead (<5% latency increase)
- ✅ Async logging doesn't block requests
- ✅ Efficient serialization

---

## Implementation Strategy

### Phase 1: Logger Module (2 hours)
1. Create `src/logger.ts` with factory function
2. Implement serializers (req, res, err)
3. Add redaction configuration
4. Add pretty print support

### Phase 2: Type Updates (30 minutes)
1. Update `RouteContext` interface
2. Update `OgelfyOptions` interface
3. Export Logger type from index

### Phase 3: Integration (2-3 hours)
1. Update Ogelfy constructor to create logger
2. Update handleRequest to create child loggers
3. Add log statements at key lifecycle points
4. Ensure logger flows to context

### Phase 4: Testing (2-3 hours)
1. Write 20+ comprehensive tests
2. Test logger creation with various options
3. Test request-scoped loggers
4. Test redaction
5. Test serialization
6. Verify all existing tests still pass

### Phase 5: Documentation (1 hour)
1. Add usage examples
2. Document configuration options
3. Show development vs production setup
4. Document child logger patterns

---

## Technical Notes & Patterns

### Pattern: Request ID Generation
```typescript
// Prefer user-provided request ID, fall back to UUID
const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
```

### Pattern: Child Logger Creation
```typescript
// Always include request metadata in child logger
const log = this.logger.child({
  requestId,
  method: req.method,
  url: url.pathname
});
```

### Pattern: Duration Tracking
```typescript
const startTime = Date.now();
// ... request processing ...
const duration = Date.now() - startTime;
log.info({ duration }, 'Request completed');
```

### Pattern: Error Logging
```typescript
catch (error) {
  log.error({
    err: error,  // Pino serializes with stack trace
    duration: Date.now() - startTime
  }, 'Request failed');

  throw error;  // Re-throw for error handler
}
```

---

## Architecture Considerations (Elena's Domain)

### Observability Tradeoffs
- **Structured JSON logs** → Easy to parse, query in log aggregators
- **Request IDs** → Distributed tracing across services
- **Child loggers** → Context-aware logging without passing logger everywhere
- **Redaction** → Security vs debuggability (default: security wins)

### Performance Characteristics
- **Pino is async** → Non-blocking, high throughput
- **Child logger overhead** → Minimal (lightweight object creation)
- **Serialization cost** → Only when log level active (efficient)
- **Pretty print penalty** → Development only (not production)

### Production Patterns
- **JSON logs** → Structured for log aggregation (Loki, Elasticsearch)
- **Request correlation** → Critical for distributed systems debugging
- **Log levels** → info/warn/error in production, debug in staging
- **Redaction** → Must be enabled by default for security compliance

---

## Resources

**Pino Documentation**:
- https://getpino.io/
- https://github.com/pinojs/pino

**Existing Ogelfy Architecture**:
- Review `src/index.ts` lines 343-494 for handleRequest flow
- Review `src/hooks.ts` for lifecycle hook execution
- Review `src/types.ts` for current RouteContext structure
- Review `__tests__/*.test.ts` for testing patterns

**Reference Frameworks**:
- Fastify logging: https://fastify.dev/docs/latest/Reference/Logging/
- Express morgan: https://github.com/expressjs/morgan
- Koa logger: https://github.com/koajs/logger

---

## Questions or Blockers?

**TPM Contact**: Dylan Torres
**Sprint Docs**: `.SoT/sprints/sprint-ogelfy/`

If you encounter issues:
1. Check existing test patterns in `__tests__/` directory
2. Review how other modules integrate (hooks, error-handler, etc.)
3. Consult Dylan for architectural decisions

---

**Ready to build production-grade observability into Ogelfy!**
