# Testing with Ogelfy

Production-grade testing utilities with `.inject()` for testing without HTTP servers.

## Table of Contents

- [Quick Start](#quick-start)
- [Inject API](#inject-api)
- [Test Helpers](#test-helpers)
- [Testing Routes](#testing-routes)
- [Testing Error Handling](#testing-error-handling)
- [Testing Middleware](#testing-middleware)
- [Best Practices](#best-practices)

---

## Quick Start

```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from 'ogelfy';

describe('User API', () => {
  test('get user by id', async () => {
    const app = new Ogelfy();

    app.get('/user/:id', async (req) => {
      return { id: req.params.id, name: 'John' };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/user/123'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: '123', name: 'John' });
  });
});
```

---

## Inject API

Test routes without starting an HTTP server.

### Basic Usage

```typescript
const response = await app.inject({
  method: 'GET',
  url: '/path'
});
```

### With Request Body

```typescript
const response = await app.inject({
  method: 'POST',
  url: '/user',
  body: { name: 'John', email: 'john@example.com' }
});
```

### With Headers

```typescript
const response = await app.inject({
  method: 'GET',
  url: '/protected',
  headers: {
    'Authorization': 'Bearer token123',
    'Content-Type': 'application/json'
  }
});
```

### With Query Parameters

```typescript
const response = await app.inject({
  method: 'GET',
  url: '/search',
  query: {
    q: 'test',
    page: '1',
    limit: '10'
  }
});
```

### Response Object

```typescript
interface InjectResponse {
  statusCode: number;                    // HTTP status code
  headers: Record<string, string>;       // Response headers
  body: string;                          // Raw response body
  payload: string;                       // Alias for body
  json<T>(): T;                          // Parse body as JSON
}
```

**Example:**

```typescript
const response = await app.inject({
  method: 'GET',
  url: '/user/123'
});

console.log(response.statusCode);      // 200
console.log(response.headers);         // { 'content-type': 'application/json' }
console.log(response.body);            // '{"id":"123","name":"John"}'
console.log(response.json());          // { id: '123', name: 'John' }
```

---

## Test Helpers

Assertion utilities for cleaner tests.

### assertStatus

Assert response status code.

```typescript
import { testHelpers } from 'ogelfy';

const response = await app.inject({ method: 'GET', url: '/test' });

testHelpers.assertStatus(response, 200);  // ✅ Pass
testHelpers.assertStatus(response, 404);  // ❌ Throws error
```

### assertJson

Assert response contains valid JSON.

```typescript
testHelpers.assertJson(response);  // Ensures response.json() works
```

### assertHeader

Assert response header exists and matches value.

```typescript
// Check header exists
testHelpers.assertHeader(response, 'content-type');

// Check header value
testHelpers.assertHeader(response, 'content-type', 'application/json');
```

### assertBody

Assert response body matches expected value.

```typescript
testHelpers.assertBody(response, { id: '123', name: 'John' });
```

### assertSuccess

Assert response is successful (2xx status).

```typescript
testHelpers.assertSuccess(response);  // Passes for 200-299
```

### assertError

Assert response is an error (4xx or 5xx status).

```typescript
testHelpers.assertError(response);  // Passes for 400+
```

---

## Testing Routes

### GET Requests

```typescript
test('get all users', async () => {
  const app = new Ogelfy();

  app.get('/users', async () => {
    return [
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' }
    ];
  });

  const response = await app.inject({
    method: 'GET',
    url: '/users'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toHaveLength(2);
});
```

### POST Requests

```typescript
test('create user', async () => {
  const app = new Ogelfy();

  app.post('/user', async (req) => {
    const body = await req.json();
    return { created: true, user: body };
  });

  const response = await app.inject({
    method: 'POST',
    url: '/user',
    body: { name: 'John', email: 'john@example.com' }
  });

  expect(response.statusCode).toBe(200);

  const json = response.json();
  expect(json.created).toBe(true);
  expect(json.user.name).toBe('John');
});
```

### PUT Requests

```typescript
test('update user', async () => {
  const app = new Ogelfy();

  app.put('/user/:id', async (req) => {
    const body = await req.json();
    return { updated: true, id: req.params.id, data: body };
  });

  const response = await app.inject({
    method: 'PUT',
    url: '/user/123',
    body: { name: 'Updated Name' }
  });

  expect(response.json().updated).toBe(true);
});
```

### DELETE Requests

```typescript
test('delete user', async () => {
  const app = new Ogelfy();

  app.delete('/user/:id', async (req) => {
    return { deleted: true, id: req.params.id };
  });

  const response = await app.inject({
    method: 'DELETE',
    url: '/user/123'
  });

  expect(response.json().deleted).toBe(true);
  expect(response.json().id).toBe('123');
});
```

### Route Parameters

```typescript
test('multiple route params', async () => {
  const app = new Ogelfy();

  app.get('/users/:userId/posts/:postId', async (req) => {
    return {
      userId: req.params.userId,
      postId: req.params.postId
    };
  });

  const response = await app.inject({
    method: 'GET',
    url: '/users/42/posts/99'
  });

  expect(response.json()).toEqual({
    userId: '42',
    postId: '99'
  });
});
```

### Query Parameters

```typescript
test('search with query params', async () => {
  const app = new Ogelfy();

  app.get('/search', async (req) => {
    const url = new URL(req.url);
    return {
      query: url.searchParams.get('q'),
      page: url.searchParams.get('page')
    };
  });

  const response = await app.inject({
    method: 'GET',
    url: '/search',
    query: { q: 'test', page: '2' }
  });

  const json = response.json();
  expect(json.query).toBe('test');
  expect(json.page).toBe('2');
});
```

---

## Testing Error Handling

### 404 Errors

```typescript
test('returns 404 for unknown routes', async () => {
  const app = new Ogelfy();

  const response = await app.inject({
    method: 'GET',
    url: '/unknown'
  });

  testHelpers.assertStatus(response, 404);
  testHelpers.assertError(response);

  expect(response.json().code).toBe('NOT_FOUND');
});
```

### Custom Error Handlers

```typescript
test('custom error handler', async () => {
  const app = new Ogelfy();

  app.setErrorHandler((error, req) => {
    return new Response(
      JSON.stringify({ custom: true, error: error.message }),
      { status: 418 }
    );
  });

  app.get('/error', async () => {
    throw new Error('Test error');
  });

  const response = await app.inject({
    method: 'GET',
    url: '/error'
  });

  expect(response.statusCode).toBe(418);
  expect(response.json().custom).toBe(true);
});
```

### HTTP Errors

```typescript
test('handles HTTP errors', async () => {
  const app = new Ogelfy();

  app.get('/error', async () => {
    throw app.httpErrors.badRequest('Invalid input');
  });

  const response = await app.inject({
    method: 'GET',
    url: '/error'
  });

  testHelpers.assertStatus(response, 400);

  const json = response.json();
  expect(json.error).toBe('Invalid input');
  expect(json.code).toBe('BAD_REQUEST');
});
```

### Validation Errors

```typescript
import { z } from 'zod';

test('handles validation errors', async () => {
  const app = new Ogelfy();

  const userSchema = z.object({
    email: z.string().email(),
    age: z.number().min(18)
  });

  app.post('/user', async (req) => {
    const body = await req.json();
    const result = userSchema.safeParse(body);

    if (!result.success) {
      throw app.httpErrors.validation(result.error);
    }

    return { created: true };
  });

  const response = await app.inject({
    method: 'POST',
    url: '/user',
    body: { email: 'invalid', age: 10 }
  });

  testHelpers.assertStatus(response, 400);

  const json = response.json();
  expect(json.code).toBe('VALIDATION_ERROR');
  expect(json.details).toHaveLength(2);
});
```

---

## Testing Middleware

### Authentication

```typescript
test('authentication middleware', async () => {
  const app = new Ogelfy();

  app.get('/protected', async (req) => {
    const token = req.headers.get('authorization');

    if (!token) {
      throw app.httpErrors.unauthorized('Missing token');
    }

    return { authenticated: true };
  });

  // Test without token
  const noTokenResponse = await app.inject({
    method: 'GET',
    url: '/protected'
  });

  expect(noTokenResponse.statusCode).toBe(401);

  // Test with token
  const withTokenResponse = await app.inject({
    method: 'GET',
    url: '/protected',
    headers: { 'Authorization': 'Bearer token123' }
  });

  expect(withTokenResponse.statusCode).toBe(200);
  expect(withTokenResponse.json().authenticated).toBe(true);
});
```

### Rate Limiting

```typescript
test('rate limiting', async () => {
  const app = new Ogelfy();

  let requestCount = 0;
  const RATE_LIMIT = 3;

  app.get('/limited', async () => {
    requestCount++;

    if (requestCount > RATE_LIMIT) {
      throw app.httpErrors.tooManyRequests('Rate limit exceeded');
    }

    return { ok: true };
  });

  // First 3 requests succeed
  for (let i = 0; i < RATE_LIMIT; i++) {
    const response = await app.inject({ method: 'GET', url: '/limited' });
    expect(response.statusCode).toBe(200);
  }

  // 4th request fails
  const response = await app.inject({ method: 'GET', url: '/limited' });
  expect(response.statusCode).toBe(429);
});
```

---

## Best Practices

### 1. Test Each Route Method

```typescript
describe('User API', () => {
  test('GET /users', async () => { /* ... */ });
  test('POST /user', async () => { /* ... */ });
  test('PUT /user/:id', async () => { /* ... */ });
  test('DELETE /user/:id', async () => { /* ... */ });
});
```

### 2. Test Error Cases

```typescript
test('validates user input', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/user',
    body: { invalid: 'data' }
  });

  testHelpers.assertStatus(response, 400);
});
```

### 3. Use Test Helpers

```typescript
// ✅ Good - clear and concise
testHelpers.assertStatus(response, 200);
testHelpers.assertSuccess(response);
testHelpers.assertBody(response, expectedData);

// ❌ Bad - verbose
expect(response.statusCode).toBe(200);
expect(response.statusCode >= 200 && response.statusCode < 300).toBe(true);
expect(JSON.stringify(response.json())).toBe(JSON.stringify(expectedData));
```

### 4. Create Reusable Test Fixtures

```typescript
// fixtures.ts
export function createTestApp() {
  const app = new Ogelfy();

  app.get('/user/:id', async (req) => {
    return { id: req.params.id, name: 'Test User' };
  });

  return app;
}

// test.ts
import { createTestApp } from './fixtures';

test('user routes', async () => {
  const app = createTestApp();

  const response = await app.inject({
    method: 'GET',
    url: '/user/123'
  });

  expect(response.statusCode).toBe(200);
});
```

### 5. Test Edge Cases

```typescript
test('handles empty request body', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/user',
    body: {}
  });

  testHelpers.assertStatus(response, 400);
});

test('handles very long IDs', async () => {
  const longId = 'a'.repeat(1000);

  const response = await app.inject({
    method: 'GET',
    url: `/user/${longId}`
  });

  expect(response.json().id).toBe(longId);
});
```

### 6. Test Async Handlers

```typescript
test('async error handling', async () => {
  const app = new Ogelfy();

  app.get('/async-error', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw app.httpErrors.internalServerError('Async error');
  });

  const response = await app.inject({
    method: 'GET',
    url: '/async-error'
  });

  testHelpers.assertStatus(response, 500);
});
```

### 7. Group Related Tests

```typescript
describe('User API', () => {
  describe('GET /users', () => {
    test('returns all users', async () => { /* ... */ });
    test('filters by query params', async () => { /* ... */ });
    test('handles pagination', async () => { /* ... */ });
  });

  describe('POST /user', () => {
    test('creates new user', async () => { /* ... */ });
    test('validates input', async () => { /* ... */ });
    test('handles duplicates', async () => { /* ... */ });
  });
});
```

---

## Complete Example

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy, testHelpers } from 'ogelfy';
import { z } from 'zod';

describe('Blog API', () => {
  let app: Ogelfy;

  beforeEach(() => {
    app = new Ogelfy();

    // Schema
    const postSchema = z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      authorId: z.string()
    });

    // Routes
    app.get('/posts', async () => {
      return [
        { id: '1', title: 'First Post', content: 'Hello' },
        { id: '2', title: 'Second Post', content: 'World' }
      ];
    });

    app.get('/posts/:id', async (req) => {
      const { id } = req.params;

      if (id === '999') {
        throw app.httpErrors.notFound('Post not found');
      }

      return { id, title: 'Test Post', content: 'Test content' };
    });

    app.post('/posts', async (req) => {
      const body = await req.json();
      const result = postSchema.safeParse(body);

      if (!result.success) {
        throw app.httpErrors.validation(result.error);
      }

      return {
        created: true,
        post: { id: '123', ...result.data }
      };
    });

    app.delete('/posts/:id', async (req) => {
      return { deleted: true, id: req.params.id };
    });
  });

  describe('GET /posts', () => {
    test('returns all posts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/posts'
      });

      testHelpers.assertSuccess(response);
      expect(response.json()).toHaveLength(2);
    });
  });

  describe('GET /posts/:id', () => {
    test('returns post by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/posts/1'
      });

      testHelpers.assertSuccess(response);

      const post = response.json();
      expect(post.id).toBe('1');
      expect(post.title).toBeDefined();
    });

    test('returns 404 for missing post', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/posts/999'
      });

      testHelpers.assertStatus(response, 404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('POST /posts', () => {
    test('creates new post', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/posts',
        body: {
          title: 'New Post',
          content: 'Content here',
          authorId: 'author123'
        }
      });

      testHelpers.assertSuccess(response);

      const json = response.json();
      expect(json.created).toBe(true);
      expect(json.post.title).toBe('New Post');
    });

    test('validates post data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/posts',
        body: { title: '' }  // Missing required fields
      });

      testHelpers.assertStatus(response, 400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /posts/:id', () => {
    test('deletes post', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/posts/1'
      });

      testHelpers.assertSuccess(response);

      const json = response.json();
      expect(json.deleted).toBe(true);
      expect(json.id).toBe('1');
    });
  });
});
```

---

## Performance Testing

```typescript
test('handles concurrent requests', async () => {
  const app = new Ogelfy();

  app.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true };
  });

  const requests = Array(100).fill(null).map(() =>
    app.inject({ method: 'GET', url: '/test' })
  );

  const responses = await Promise.all(requests);

  responses.forEach(response => {
    testHelpers.assertSuccess(response);
  });
});
```

---

## Integration with Testing Frameworks

Works seamlessly with Bun, Jest, Vitest, and other test runners:

```typescript
// Bun test
import { test, expect } from 'bun:test';

// Jest
import { test, expect } from '@jest/globals';

// Vitest
import { test, expect } from 'vitest';

// Usage is identical
test('my route', async () => {
  const response = await app.inject({ method: 'GET', url: '/test' });
  expect(response.statusCode).toBe(200);
});
```
