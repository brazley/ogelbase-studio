# Ticket: Advanced Error Handling + Testing Utilities for Ogelfy

**Agent**: Quinn Martinez - Test Automation Architect
**Status**: In Progress
**Priority**: High
**Sprint**: Sprint Ogelfy
**Created**: 2025-11-22

---

## Objective

Build Fastify-level error handling and comprehensive testing utilities for Ogelfy framework. This includes HTTP error classes, custom error handlers, validation error formatting, and a `.inject()` testing pattern for testing without HTTP server.

---

## Context

**Working Directory**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/`

**Current State**:
- Minimal Ogelfy framework (~1,300 lines) with routing, validation, plugins
- Basic error handling (only generic 500 errors)
- No testing utilities beyond basic route tests
- Bun-native framework using `Bun.serve()`

**Reference Documentation**:
- `.ProjectNotesAndResearch/Ogelfy/FASTIFY-PARITY-ROADMAP.md` (Section 8 & 11)
- Fastify error handling patterns
- Current test example: `__tests__/router.test.ts`

**Current Files**:
- `src/index.ts` - Main Ogelfy class (66 lines)
- `src/router.ts` - Router with path matching (67 lines)
- `src/types.ts` - Type definitions (12 lines)
- `src/validation.ts` - Zod validation (exists)
- `src/plugins.ts` - Plugin system (exists)

---

## Deliverables

### Part 1: Error Handling System

#### 1.1 Create `src/errors.ts` (300-400 lines)

**Required Features**:

1. **Base HTTP Error Class**
```typescript
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
```

2. **HTTP Error Factory Functions**
```typescript
export const httpErrors = {
  badRequest: (msg?: string) => new HttpError(400, msg || 'Bad Request', 'BAD_REQUEST'),
  unauthorized: (msg?: string) => new HttpError(401, msg || 'Unauthorized', 'UNAUTHORIZED'),
  forbidden: (msg?: string) => new HttpError(403, msg || 'Forbidden', 'FORBIDDEN'),
  notFound: (msg?: string) => new HttpError(404, msg || 'Not Found', 'NOT_FOUND'),
  conflict: (msg?: string) => new HttpError(409, msg || 'Conflict', 'CONFLICT'),
  internalServerError: (msg?: string) => new HttpError(500, msg || 'Internal Server Error', 'INTERNAL_ERROR'),
  serviceUnavailable: (msg?: string) => new HttpError(503, msg || 'Service Unavailable', 'SERVICE_UNAVAILABLE'),
};
```

3. **Validation Error Class**
```typescript
export class ValidationError extends HttpError {
  constructor(
    public validation: Array<{ field: string; message: string }>,
    message = 'Validation failed'
  ) {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
```

4. **Error Serialization Utilities**
```typescript
export function serializeError(error: Error | HttpError, includeStack = false): ErrorResponse {
  const response: ErrorResponse = {
    error: error.message,
    statusCode: error instanceof HttpError ? error.statusCode : 500,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof HttpError && error.code) {
    response.code = error.code;
  }

  if (error instanceof ValidationError) {
    response.validation = error.validation;
  }

  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  return response;
}
```

#### 1.2 Update `src/index.ts` - Integrate Error Handling

**Add to Ogelfy class**:

1. **Custom Error Handler Property**
```typescript
private errorHandler?: (error: Error, req: Request) => Response | Promise<Response>;
private notFoundHandler?: (req: Request) => Response | Promise<Response>;
```

2. **Error Handler Setters**
```typescript
setErrorHandler(handler: (error: Error, req: Request) => Response | Promise<Response>) {
  this.errorHandler = handler;
}

setNotFoundHandler(handler: (req: Request) => Response | Promise<Response>) {
  this.notFoundHandler = handler;
}
```

3. **Update `fetch` Handler in `listen()`**
```typescript
fetch: async (req) => {
  const url = new URL(req.url);
  const route = this.router.find(req.method, url.pathname);

  // Use custom 404 handler
  if (!route) {
    if (this.notFoundHandler) {
      return this.notFoundHandler(req);
    }
    return new Response(JSON.stringify({
      error: 'Not Found',
      path: url.pathname
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const result = await route.handler(req);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Use custom error handler
    if (this.errorHandler) {
      return this.errorHandler(error as Error, req);
    }

    // Default error handling
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const errorResponse = serializeError(
      error as Error,
      process.env.NODE_ENV === 'development'
    );

    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

4. **Export httpErrors from index.ts**
```typescript
export { httpErrors, HttpError, ValidationError } from './errors';
```

#### 1.3 Update `src/types.ts` - Add Error Types

```typescript
export interface ErrorResponse {
  error: string;
  statusCode: number;
  timestamp: string;
  code?: string;
  validation?: Array<{ field: string; message: string }>;
  stack?: string;
  path?: string;
}
```

---

### Part 2: Testing Utilities

#### 2.1 Create `src/testing.ts` (400-500 lines)

**Required Features**:

1. **TestClient for .inject() Pattern**
```typescript
export interface InjectOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: <T = any>() => T;
}

export class TestClient {
  constructor(private app: Ogelfy) {}

  async inject(options: InjectOptions): Promise<InjectResponse> {
    const { method, url, headers = {}, body, query } = options;

    // Build full URL with query params
    let fullUrl = `http://localhost${url}`;
    if (query) {
      const params = new URLSearchParams(query);
      fullUrl += `?${params.toString()}`;
    }

    // Build headers
    const reqHeaders = new Headers(headers);
    if (body && !reqHeaders.has('content-type')) {
      reqHeaders.set('content-type', 'application/json');
    }

    // Create mock request
    const request = new Request(fullUrl, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    // Execute through app's router (bypass HTTP)
    const url_parsed = new URL(request.url);
    const route = (this.app as any).router.find(method, url_parsed.pathname);

    let response: Response;

    if (!route) {
      // Simulate 404
      const notFoundHandler = (this.app as any).notFoundHandler;
      if (notFoundHandler) {
        response = await notFoundHandler(request);
      } else {
        response = new Response(JSON.stringify({
          error: 'Not Found',
          path: url_parsed.pathname
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      try {
        const result = await route.handler(request);
        response = new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        // Use app's error handler
        const errorHandler = (this.app as any).errorHandler;
        if (errorHandler) {
          response = await errorHandler(error, request);
        } else {
          const statusCode = error instanceof HttpError ? error.statusCode : 500;
          response = new Response(JSON.stringify({
            error: error instanceof Error ? error.message : String(error)
          }), {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Convert to InjectResponse
    const bodyText = await response.text();
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: bodyText,
      json: <T = any>() => JSON.parse(bodyText) as T
    };
  }
}
```

2. **Test Helper Functions**
```typescript
export const testHelpers = {
  // Start test server with random port
  async startTestServer(app: Ogelfy): Promise<{ url: string; port: number; close: () => Promise<void> }> {
    const server = await app.listen({ port: 0 }); // Random port
    const port = (server as any).port;
    const url = `http://localhost:${port}`;
    return { url, port, close: () => app.close() };
  },

  // Create mock request
  mockRequest(url: string, options?: Partial<RequestInit>): Request {
    return new Request(url, options);
  },

  // Sleep utility for async tests
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
```

3. **Assertion Helpers**
```typescript
export const assertions = {
  assertStatus(response: InjectResponse, expected: number) {
    if (response.statusCode !== expected) {
      throw new Error(
        `Expected status ${expected}, got ${response.statusCode}. Body: ${response.body}`
      );
    }
  },

  assertHeader(response: InjectResponse, header: string, value: string) {
    const actual = response.headers[header.toLowerCase()];
    if (actual !== value) {
      throw new Error(`Expected header ${header}=${value}, got ${actual}`);
    }
  },

  assertJson(response: InjectResponse, expected: any) {
    const actual = response.json();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected JSON: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`);
    }
  },

  assertBodyContains(response: InjectResponse, substring: string) {
    if (!response.body.includes(substring)) {
      throw new Error(`Expected body to contain "${substring}", got: ${response.body}`);
    }
  }
};
```

4. **Export Helper to Create TestClient**
```typescript
export function createTestClient(app: Ogelfy): TestClient {
  return new TestClient(app);
}
```

---

### Part 3: Comprehensive Test Suite

#### 3.1 Create `__tests__/errors.test.ts` (600-800 lines, 40+ tests)

**Test Categories**:

1. **HTTP Error Classes (10 tests)**
   - Create badRequest error
   - Create unauthorized error
   - Create forbidden error
   - Create notFound error
   - Create conflict error
   - Create internalServerError error
   - Create serviceUnavailable error
   - Custom error messages
   - Error codes
   - Error inheritance

2. **Validation Errors (8 tests)**
   - Create validation error with multiple fields
   - Single field validation error
   - Validation error serialization
   - Validation error status code
   - Empty validation array
   - Nested field errors
   - Custom validation messages
   - Validation error in route handler

3. **Error Serialization (8 tests)**
   - Serialize HTTP error
   - Serialize validation error
   - Include stack trace in development
   - Exclude stack trace in production
   - Timestamp format
   - Error code in response
   - Generic Error serialization
   - Unknown error types

4. **Custom Error Handlers (10 tests)**
   - Set custom error handler
   - Custom error handler receives error
   - Custom error handler receives request
   - Custom error handler can modify response
   - Error handler for validation errors
   - Error handler for HTTP errors
   - Error handler for unknown errors
   - Async error handler
   - Error handler can access request data
   - Multiple error types in handler

5. **404 Not Found Handlers (4 tests)**
   - Default 404 response
   - Custom 404 handler
   - 404 includes request path
   - 404 handler can be async

**Example Test Structure**:
```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';
import { httpErrors, HttpError, ValidationError } from '../src/errors';
import { createTestClient } from '../src/testing';

describe('HTTP Error Classes', () => {
  test('creates badRequest error with default message', () => {
    const error = httpErrors.badRequest();
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Bad Request');
    expect(error.code).toBe('BAD_REQUEST');
  });

  test('creates badRequest error with custom message', () => {
    const error = httpErrors.badRequest('Invalid email format');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid email format');
    expect(error.code).toBe('BAD_REQUEST');
  });

  // ... 38 more tests
});

describe('Error Handlers in Routes', () => {
  test('custom error handler catches HTTP errors', async () => {
    const app = new Ogelfy();

    let capturedError: Error | null = null;
    app.setErrorHandler((error, req) => {
      capturedError = error;
      return new Response(JSON.stringify({ custom: true }), {
        status: 418,
        headers: { 'content-type': 'application/json' }
      });
    });

    app.get('/error', () => {
      throw httpErrors.badRequest('Test error');
    });

    const client = createTestClient(app);
    const response = await client.inject({ method: 'GET', url: '/error' });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual({ custom: true });
    expect(capturedError).toBeInstanceOf(HttpError);
  });
});
```

#### 3.2 Create `__tests__/testing.test.ts` (500-600 lines, 30+ tests)

**Test Categories**:

1. **TestClient .inject() Method (12 tests)**
   - Inject GET request
   - Inject POST request with body
   - Inject PUT request
   - Inject DELETE request
   - Inject with query parameters
   - Inject with custom headers
   - Inject with JSON body
   - Multiple query parameters
   - Empty body
   - URL encoding
   - Response status codes
   - Response body parsing

2. **InjectResponse Interface (8 tests)**
   - Response statusCode property
   - Response headers property
   - Response body property
   - Response json() method
   - JSON parsing errors
   - Empty response body
   - Non-JSON response
   - Header case-insensitivity

3. **Test Helpers (6 tests)**
   - startTestServer creates server
   - startTestServer returns URL
   - startTestServer returns close function
   - mockRequest creates Request
   - mockRequest with custom options
   - sleep utility works

4. **Assertion Helpers (8 tests)**
   - assertStatus passes on match
   - assertStatus throws on mismatch
   - assertHeader passes on match
   - assertHeader throws on mismatch
   - assertJson passes on match
   - assertJson throws on mismatch
   - assertBodyContains passes
   - assertBodyContains throws

**Example Test Structure**:
```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';
import { createTestClient, testHelpers, assertions } from '../src/testing';

describe('TestClient .inject()', () => {
  test('injects GET request without starting server', async () => {
    const app = new Ogelfy();
    app.get('/hello', () => ({ message: 'world' }));

    const client = createTestClient(app);
    const response = await client.inject({ method: 'GET', url: '/hello' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'world' });
  });

  test('injects POST request with JSON body', async () => {
    const app = new Ogelfy();
    app.post('/users', async (req) => {
      const body = await req.json();
      return { created: true, user: body };
    });

    const client = createTestClient(app);
    const response = await client.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'Alice', email: 'alice@example.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().created).toBe(true);
    expect(response.json().user.name).toBe('Alice');
  });

  // ... 28 more tests
});

describe('Assertion Helpers', () => {
  test('assertStatus passes when status matches', async () => {
    const app = new Ogelfy();
    app.get('/ok', () => ({ ok: true }));

    const client = createTestClient(app);
    const response = await client.inject({ method: 'GET', url: '/ok' });

    expect(() => assertions.assertStatus(response, 200)).not.toThrow();
  });

  test('assertStatus throws when status does not match', async () => {
    const app = new Ogelfy();
    app.get('/ok', () => ({ ok: true }));

    const client = createTestClient(app);
    const response = await client.inject({ method: 'GET', url: '/ok' });

    expect(() => assertions.assertStatus(response, 404)).toThrow('Expected status 404, got 200');
  });

  // ... more assertion tests
});
```

#### 3.3 Create `__tests__/integration.test.ts` (500-600 lines, 30+ tests)

**Test Categories**:

1. **Full Request/Response Cycle (8 tests)**
   - GET request with response
   - POST request with body and response
   - PUT request with update
   - DELETE request
   - Request with query parameters
   - Request with custom headers
   - Multiple requests in sequence
   - Concurrent requests

2. **Error Handling in Routes (10 tests)**
   - Route throws HTTP error
   - Route throws validation error
   - Route throws generic Error
   - Custom error handler in action
   - 404 handler for missing routes
   - Error response format
   - Error with stack trace (development)
   - Error without stack trace (production)
   - Multiple error types
   - Async errors

3. **Validation Error Responses (6 tests)**
   - Validation error response structure
   - Multiple validation errors
   - Single validation error
   - Validation error status code
   - Validation error with custom message
   - Validation error in nested fields

4. **Custom 404 Responses (3 tests)**
   - Default 404 format
   - Custom 404 handler
   - 404 includes request path

5. **Real-World Scenarios (5 tests)**
   - CRUD API simulation
   - Authentication error flows
   - Rate limiting error responses
   - Database error handling
   - External API error handling

**Example Test Structure**:
```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';
import { httpErrors, ValidationError } from '../src/errors';
import { createTestClient } from '../src/testing';

describe('Full Request/Response Cycle', () => {
  test('handles complete CRUD flow', async () => {
    const app = new Ogelfy();
    const users = new Map();

    // Create
    app.post('/users', async (req) => {
      const body = await req.json();
      const id = Math.random().toString(36);
      users.set(id, body);
      return { id, ...body };
    });

    // Read
    app.get('/users/:id', (req) => {
      const url = new URL(req.url);
      const id = url.pathname.split('/')[2];
      const user = users.get(id);
      if (!user) throw httpErrors.notFound('User not found');
      return user;
    });

    const client = createTestClient(app);

    // Test create
    const createResponse = await client.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'Alice' }
    });
    expect(createResponse.statusCode).toBe(200);
    const userId = createResponse.json().id;

    // Test read
    const readResponse = await client.inject({
      method: 'GET',
      url: `/users/${userId}`
    });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().name).toBe('Alice');
  });

  // ... 29 more integration tests
});

describe('Error Handling Scenarios', () => {
  test('handles authentication error flow', async () => {
    const app = new Ogelfy();

    app.get('/protected', (req) => {
      const auth = req.headers.get('authorization');
      if (!auth) throw httpErrors.unauthorized('Missing token');
      if (!auth.startsWith('Bearer ')) throw httpErrors.unauthorized('Invalid token format');
      return { data: 'secret' };
    });

    const client = createTestClient(app);

    // No auth
    const noAuthResponse = await client.inject({ method: 'GET', url: '/protected' });
    expect(noAuthResponse.statusCode).toBe(401);
    expect(noAuthResponse.json().error).toBe('Missing token');

    // Invalid format
    const invalidResponse = await client.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'BadFormat token' }
    });
    expect(invalidResponse.statusCode).toBe(401);
    expect(invalidResponse.json().error).toBe('Invalid token format');

    // Valid auth
    const validResponse = await client.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json().data).toBe('secret');
  });
});
```

---

### Part 4: Documentation

#### 4.1 Create `TESTING.md` (300-400 lines)

**Required Sections**:

1. **Overview**
   - What is the testing system
   - Why use .inject() over HTTP
   - Performance benefits

2. **Quick Start**
   - Install dependencies
   - Write first test
   - Run tests with Bun

3. **Testing Utilities**
   - TestClient overview
   - .inject() method
   - InjectOptions interface
   - InjectResponse interface
   - Code examples

4. **Test Helpers**
   - startTestServer
   - mockRequest
   - sleep
   - Usage examples

5. **Assertion Helpers**
   - assertStatus
   - assertHeader
   - assertJson
   - assertBodyContains
   - Usage examples

6. **Error Handling**
   - HTTP error classes
   - Validation errors
   - Custom error handlers
   - 404 handlers
   - Code examples

7. **Best Practices**
   - Test structure
   - Async/await patterns
   - Cleanup
   - Isolation
   - Coverage goals

8. **Examples**
   - Basic route test
   - POST with body
   - Error testing
   - Custom headers
   - Query parameters
   - Full CRUD flow

**Example Format**:
```markdown
# Testing Guide for Ogelfy

## Overview

Ogelfy provides a comprehensive testing system inspired by Fastify's `.inject()` pattern. This allows you to test your routes without starting an HTTP server, making tests faster and more reliable.

## Quick Start

```typescript
import { test, expect } from 'bun:test';
import { Ogelfy } from '@security/ogelfy';
import { createTestClient } from '@security/ogelfy/testing';

test('my first test', async () => {
  const app = new Ogelfy();
  app.get('/hello', () => ({ message: 'world' }));

  const client = createTestClient(app);
  const response = await client.inject({ method: 'GET', url: '/hello' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ message: 'world' });
});
```

## Testing Utilities

### TestClient

... (continue with full documentation)
```

---

## Acceptance Criteria

- [ ] `src/errors.ts` created with all HTTP error classes (400, 401, 403, 404, 409, 500, 503)
- [ ] Validation error class supports multiple field errors
- [ ] Error serialization with stack traces (dev only)
- [ ] Custom error handler integration in `src/index.ts`
- [ ] Custom 404 handler integration in `src/index.ts`
- [ ] `src/testing.ts` created with TestClient class
- [ ] `.inject()` method works without HTTP server
- [ ] Test helpers (startTestServer, mockRequest, sleep)
- [ ] Assertion helpers (assertStatus, assertHeader, assertJson, assertBodyContains)
- [ ] `__tests__/errors.test.ts` with 40+ passing tests
- [ ] `__tests__/testing.test.ts` with 30+ passing tests
- [ ] `__tests__/integration.test.ts` with 30+ passing tests
- [ ] All tests pass when running `bun test` (100+ total)
- [ ] `TESTING.md` documentation complete with examples
- [ ] All error classes exported from main index.ts
- [ ] Type definitions updated in `src/types.ts`

---

## Technical Requirements

### TypeScript/Bun Specifics
- Use Bun's native `Request`/`Response` objects
- Follow existing Ogelfy patterns (no major refactors)
- Maintain type safety throughout
- Use Bun test runner (`bun:test`)

### Code Quality
- Clear, descriptive variable names
- Comments for complex logic
- Consistent error messages
- Proper async/await patterns
- No console.log in production code

### Testing Standards
- Each test should be independent
- Use descriptive test names
- Test both success and failure cases
- Cover edge cases
- Aim for 100% code coverage on new files

---

## Files to Create/Modify

**Create**:
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/errors.ts`
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/testing.ts`
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/__tests__/errors.test.ts`
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/__tests__/testing.test.ts`
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/__tests__/integration.test.ts`
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/TESTING.md`

**Modify**:
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/index.ts` (add error handling)
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/types.ts` (add error types)

---

## Dependencies

No new dependencies required. Use existing:
- Bun runtime
- Bun test runner
- TypeScript
- Zod (already installed)

---

## Testing Strategy

1. **Unit tests first** - Test individual error classes and utilities
2. **Integration tests second** - Test error handling in routes
3. **Real-world scenarios last** - Test complete flows

Run tests incrementally:
```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy
bun test __tests__/errors.test.ts
bun test __tests__/testing.test.ts
bun test __tests__/integration.test.ts
bun test  # All tests
```

---

## Success Metrics

- [ ] 100+ tests passing
- [ ] 0 test failures
- [ ] 100% code coverage on `src/errors.ts`
- [ ] 100% code coverage on `src/testing.ts`
- [ ] All acceptance criteria met
- [ ] Documentation complete and accurate
- [ ] No breaking changes to existing Ogelfy API

---

## Quinn's Instructions

Hey Quinn! This is a comprehensive testing infrastructure build for our Bun-native framework. You're building the testing foundation that will make Ogelfy production-ready.

**Your Mission**:
Build Fastify-level error handling and testing utilities that make testing feel like a superpower.

**What Makes This Special**:
- `.inject()` pattern means no HTTP overhead in tests
- Comprehensive error handling catches bugs before production
- Testing utilities that make writing tests actually enjoyable

**Quality Bar**:
- 100+ tests, all passing
- Clear error messages that help debug
- Documentation that teaches by example
- Type-safe throughout

**Working Style**:
- Build incrementally: errors → testing → tests
- Run tests frequently as you build
- Write tests that document behavior
- Make failure messages helpful

You've got the complete spec above. Let me know if you need any clarification on Ogelfy's architecture or Bun-specific patterns. Make this testing system something we'll want to open-source!

---

**Created**: 2025-11-22
**Agent**: Quinn Martinez
**Estimated Effort**: 6-8 hours
**Priority**: High
