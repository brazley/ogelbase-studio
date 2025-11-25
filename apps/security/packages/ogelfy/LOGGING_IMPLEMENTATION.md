# Pino Logging Implementation

## Overview

Ogelfy now includes production-ready logging powered by Pino, a high-performance JSON logger.

## Features Implemented

### 1. Core Logger (`src/logger.ts`)
- **createLogger()** - Factory function for creating configured Pino loggers
- **createRequestLogger()** - Creates request-scoped child loggers with metadata
- Automatic request ID generation or custom via `x-request-id` header
- Configurable log levels: trace, debug, info, warn, error, fatal
- Pretty print mode for development
- Sensitive field redaction (passwords, tokens, secrets)

### 2. Type System Updates (`src/types.ts`)
- `RouteContext` now includes:
  - `log: Logger` - Pino logger instance
  - `requestId: string` - Unique request identifier
- `OgelfyOptions.logger` configuration:
  - `level` - Log level (default: 'info')
  - `prettyPrint` - Enable pretty output (default: false)
  - `redact` - Fields to redact from logs

### 3. Main Integration (`src/index.ts`)
- Logger initialized in Ogelfy constructor
- Request logger created per request with:
  - Request ID (auto-generated or from header)
  - HTTP method
  - Request path
- Automatic logging:
  - Incoming requests
  - Request completion (with status code and duration)
  - Request failures (with error details)

### 4. Testing Support (`src/testing.ts`)
- Testing harness updated to include logger in context
- Silent logger by default for tests
- Full logger functionality available in `inject()` calls

## Usage

### Basic Configuration

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy({
  logger: {
    level: 'info',
    prettyPrint: true, // Enable for development
    redact: ['password', 'token'] // Additional sensitive fields
  }
});
```

### Using Logger in Routes

```typescript
app.get('/users/:id', async (req, context) => {
  // Log with structured data
  context?.log.info({ userId: context.params.id }, 'Fetching user');

  const user = await fetchUser(context.params.id);

  context?.log.info({ user }, 'User fetched successfully');

  return user;
});
```

### Error Logging

```typescript
app.post('/users', async (req, context) => {
  try {
    context?.log.debug({ body: context?.body }, 'Creating user');

    const user = await createUser(context?.body);

    return { statusCode: 201, data: user };
  } catch (error) {
    context?.log.error({ err: error }, 'Failed to create user');
    throw error;
  }
});
```

### Custom Request IDs

```bash
# Clients can provide custom request IDs for tracing
curl -H "x-request-id: my-trace-id-123" http://localhost:3000/users
```

## Default Behavior

1. **Log Level**: `info` (logs info, warn, error, fatal)
2. **Pretty Print**: `false` (JSON output for production)
3. **Redacted Fields**:
   - `req.headers.authorization`
   - `req.headers.cookie`
   - `password`
   - `token`
   - `secret`

## Log Output Format

### Standard JSON (Production)
```json
{
  "level": 30,
  "time": 1763861849481,
  "pid": 37734,
  "hostname": "mac.lan",
  "requestId": "2b5c635a-963a-4c37-b378-7c55187fbf5a",
  "method": "POST",
  "path": "/users",
  "msg": "Incoming request"
}
```

### Pretty Print (Development)
```
[14:32:09] INFO: Incoming request
    requestId: "2b5c635a-963a-4c37-b378-7c55187fbf5a"
    method: "POST"
    path: "/users"
```

## Testing

### Unit Tests
- `__tests__/logger.test.ts` - Core logger functionality (4 tests)
- `__tests__/logger-integration.test.ts` - Integration with Ogelfy (3 tests)

### Running Tests
```bash
# Run logger tests only
bun test __tests__/logger.test.ts

# Run all tests
bun test
```

## Files Modified/Created

### Created
- `src/logger.ts` - Core logging functionality
- `__tests__/logger.test.ts` - Unit tests
- `__tests__/logger-integration.test.ts` - Integration tests
- `examples/logger-example.ts` - Usage examples

### Modified
- `src/index.ts` - Logger integration
- `src/types.ts` - Type definitions
- `src/testing.ts` - Testing support
- `package.json` - Dependencies added

## Dependencies Added

- `pino@^10.1.0` - Core logger
- `pino-pretty@^13.1.2` - Pretty printing

## Test Results

```
✓ Logger tests: 4/4 passing
✓ Logger integration tests: 3/3 passing
✓ Total tests: 337/338 passing (1 pre-existing failure unrelated to logging)
```

## Performance

Pino is one of the fastest Node.js loggers:
- Asynchronous by default (doesn't block request handling)
- Minimal overhead in hot path
- Zero-cost abstraction for disabled log levels

## Next Steps

Consider adding:
1. Log rotation (via pino-roll or similar)
2. Remote log shipping (to ELK, DataDog, etc.)
3. Custom formatters for specific use cases
4. Correlation ID propagation for distributed tracing
5. Log sampling for high-traffic endpoints
