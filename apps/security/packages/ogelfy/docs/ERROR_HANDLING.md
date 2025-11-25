# Error Handling in Ogelfy

Production-grade error handling system with custom error classes, handlers, and consistent error responses.

## Table of Contents

- [HTTP Error Classes](#http-error-classes)
- [Error Factory Functions](#error-factory-functions)
- [Custom Error Handlers](#custom-error-handlers)
- [Not Found Handler](#not-found-handler)
- [Validation Errors](#validation-errors)
- [Error Utilities](#error-utilities)
- [Best Practices](#best-practices)

---

## HTTP Error Classes

### HttpError

Base error class for HTTP errors with status codes.

```typescript
import { HttpError } from 'ogelfy';

throw new HttpError(400, 'Bad Request', 'BAD_REQUEST', {
  field: 'email',
  reason: 'invalid format'
});
```

**Properties:**
- `statusCode: number` - HTTP status code
- `message: string` - Error message
- `code?: string` - Error code for client identification
- `details?: any` - Additional error details

**Methods:**
- `toJSON()` - Serialize error to JSON response format

---

## Error Factory Functions

Convenient factory functions for common HTTP errors.

### Available Errors

```typescript
import { httpErrors } from 'ogelfy';

// 400 Bad Request
throw httpErrors.badRequest('Invalid input');

// 401 Unauthorized
throw httpErrors.unauthorized('Missing or invalid token');

// 403 Forbidden
throw httpErrors.forbidden('Access denied');

// 404 Not Found
throw httpErrors.notFound('User not found');

// 409 Conflict
throw httpErrors.conflict('Email already exists');

// 422 Unprocessable Entity
throw httpErrors.unprocessableEntity('Cannot process request');

// 429 Too Many Requests
throw httpErrors.tooManyRequests('Rate limit exceeded');

// 500 Internal Server Error
throw httpErrors.internalServerError('Something went wrong');

// 501 Not Implemented
throw httpErrors.notImplemented('Feature not available');

// 503 Service Unavailable
throw httpErrors.serviceUnavailable('Service temporarily down');
```

### With Details

```typescript
throw httpErrors.badRequest('Validation failed', {
  fields: ['email', 'password'],
  errors: ['Email is required', 'Password too short']
});
```

---

## Custom Error Handlers

Override default error handling behavior.

### Setting Error Handler

```typescript
import { Ogelfy } from 'ogelfy';

const app = new Ogelfy();

app.setErrorHandler((error, req) => {
  // Custom logging
  console.error('Error occurred:', {
    url: req.url,
    method: req.method,
    error: error.message,
    stack: error.stack
  });

  // Custom error response
  if (error instanceof HttpError) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      }),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Unknown errors
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Internal Server Error',
      timestamp: new Date().toISOString()
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  );
});
```

### Advanced Error Handling

```typescript
app.setErrorHandler((error, req) => {
  // Handle different error types
  if (error instanceof ValidationError) {
    return new Response(
      JSON.stringify({
        error: 'Validation failed',
        fields: error.errors
      }),
      { status: 400 }
    );
  }

  if (error instanceof DatabaseError) {
    // Log to monitoring service
    monitoring.logError(error);

    return new Response(
      JSON.stringify({ error: 'Database error' }),
      { status: 500 }
    );
  }

  // Default handling
  return new Response(
    JSON.stringify({ error: error.message }),
    { status: 500 }
  );
});
```

---

## Not Found Handler

Custom 404 handler for unknown routes.

### Basic Not Found Handler

```typescript
app.setNotFoundHandler((req) => {
  const url = new URL(req.url);

  return {
    error: 'Route not found',
    path: url.pathname,
    method: req.method,
    availableRoutes: ['/api/users', '/api/posts']
  };
});
```

### Advanced Not Found Handler

```typescript
app.setNotFoundHandler(async (req) => {
  const url = new URL(req.url);

  // Log 404s for monitoring
  await logNotFound(url.pathname);

  // Suggest similar routes
  const suggestions = findSimilarRoutes(url.pathname);

  return {
    error: 'Not Found',
    path: url.pathname,
    message: 'The requested resource does not exist',
    suggestions,
    timestamp: new Date().toISOString()
  };
});
```

---

## Validation Errors

Special handling for Zod validation errors.

### Automatic Zod Error Handling

```typescript
import { z } from 'zod';
import { httpErrors } from 'ogelfy';

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
  username: z.string().min(3)
});

app.post('/user', async (req) => {
  const body = await req.json();

  // Validate with Zod
  const result = userSchema.safeParse(body);

  if (!result.success) {
    // Automatically formats Zod errors
    throw httpErrors.validation(result.error);
  }

  return { created: true, user: result.data };
});
```

**Response format:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "details": [
    {
      "path": "email",
      "message": "Invalid email",
      "code": "invalid_string"
    },
    {
      "path": "age",
      "message": "Number must be greater than or equal to 18",
      "code": "too_small"
    }
  ]
}
```

### Manual Validation Errors

```typescript
import { ValidationError } from 'ogelfy';

throw new ValidationError('Validation failed', [
  { path: 'email', message: 'Email is required', code: 'required' },
  { path: 'password', message: 'Password too short', code: 'too_short' }
]);
```

---

## Error Utilities

### Assert Helper

Throw errors conditionally.

```typescript
import { assert, httpErrors } from 'ogelfy';

app.get('/user/:id', async (req) => {
  const { id } = req.params;

  const user = await db.user.findById(id);

  // Throws 404 if user is null/undefined
  assert(user, httpErrors.notFound('User not found'));

  return { user };
});
```

### Error Boundary

Wrap async functions with error handling.

```typescript
import { errorBoundary, httpErrors } from 'ogelfy';

const getUserById = errorBoundary(
  async (id: string) => {
    const user = await db.user.findById(id);

    if (!user) {
      throw httpErrors.notFound('User not found');
    }

    return user;
  },
  (error) => {
    // Custom error transformation
    console.error('Failed to get user:', error);
    return null; // Return fallback value
  }
);

app.get('/user/:id', async (req) => {
  const user = await getUserById(req.params.id);

  if (!user) {
    return { error: 'User not found' };
  }

  return { user };
});
```

### Create Error Response

Helper to create error responses manually.

```typescript
import { createErrorResponse } from 'ogelfy';

app.get('/special', async (req) => {
  if (someCondition) {
    return createErrorResponse(418, "I'm a teapot", 'TEAPOT', {
      reason: 'Cannot brew coffee'
    });
  }

  return { ok: true };
});
```

---

## Best Practices

### 1. Use Specific Error Codes

```typescript
// ✅ Good - specific error
throw httpErrors.notFound('User not found');
throw httpErrors.conflict('Email already exists');

// ❌ Bad - generic error
throw new Error('Something went wrong');
```

### 2. Include Helpful Error Details

```typescript
// ✅ Good - helpful details
throw httpErrors.badRequest('Invalid user data', {
  fields: ['email', 'age'],
  reasons: ['Email format invalid', 'Age must be 18+']
});

// ❌ Bad - no context
throw httpErrors.badRequest();
```

### 3. Don't Expose Internal Errors

```typescript
// ✅ Good - safe error messages
app.setErrorHandler((error, req) => {
  if (error instanceof HttpError) {
    return new Response(JSON.stringify(error.toJSON()), {
      status: error.statusCode
    });
  }

  // Log internal error but don't expose details
  console.error('Internal error:', error);

  return new Response(
    JSON.stringify({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR'
    }),
    { status: 500 }
  );
});

// ❌ Bad - exposing stack traces
throw new Error(error.stack); // Never do this in production
```

### 4. Validate Early

```typescript
// ✅ Good - validate at route entry
app.post('/user', async (req) => {
  const body = await req.json();

  // Validate immediately
  const result = userSchema.safeParse(body);
  if (!result.success) {
    throw httpErrors.validation(result.error);
  }

  // Now work with validated data
  const user = await createUser(result.data);
  return { user };
});
```

### 5. Use Assert for Preconditions

```typescript
// ✅ Good - clear assertions
app.delete('/post/:id', async (req) => {
  const post = await db.post.findById(req.params.id);
  assert(post, httpErrors.notFound('Post not found'));

  const user = await getCurrentUser(req);
  assert(user.id === post.authorId, httpErrors.forbidden('Not your post'));

  await db.post.delete(post.id);
  return { deleted: true };
});
```

### 6. Create Custom Error Classes

```typescript
// ✅ Good - domain-specific errors
class RateLimitError extends HttpError {
  constructor(retryAfter: number) {
    super(429, 'Rate limit exceeded', 'RATE_LIMIT', {
      retryAfter
    });
  }
}

class PaymentRequiredError extends HttpError {
  constructor(feature: string) {
    super(402, 'Payment required', 'PAYMENT_REQUIRED', {
      feature,
      upgradeUrl: '/pricing'
    });
  }
}

// Use them
throw new RateLimitError(60);
throw new PaymentRequiredError('Advanced analytics');
```

---

## Testing Error Handling

See [TESTING.md](./TESTING.md) for comprehensive testing examples.

```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from 'ogelfy';

describe('Error Handling', () => {
  test('handles not found errors', async () => {
    const app = new Ogelfy();

    const response = await app.inject({
      method: 'GET',
      url: '/unknown'
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');
  });

  test('handles custom errors', async () => {
    const app = new Ogelfy();

    app.get('/error', async () => {
      throw app.httpErrors.badRequest('Invalid input');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/error'
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid input');
  });
});
```

---

## Error Response Format

All errors follow a consistent format:

```typescript
{
  error: string;        // Human-readable error message
  code: string;         // Machine-readable error code
  statusCode: number;   // HTTP status code
  details?: any;        // Optional additional details
}
```

**Examples:**

```json
// 404 Not Found
{
  "error": "User not found",
  "code": "NOT_FOUND",
  "statusCode": 404
}

// 400 Validation Error
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "details": [
    {
      "path": "email",
      "message": "Invalid email",
      "code": "invalid_string"
    }
  ]
}

// 500 Internal Error
{
  "error": "Internal Server Error",
  "code": "INTERNAL_ERROR",
  "statusCode": 500
}
```
