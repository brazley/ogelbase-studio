# Testing Guide

Learn how to test Ogelfy applications without starting an HTTP server using `.inject()`.

## Why Use .inject()

- **No HTTP server** - Test routes directly without network overhead
- **Fast** - Tests run in milliseconds
- **Isolated** - Each test is independent
- **Easy** - Works with any test framework (Bun, Jest, Vitest)

## Basic Testing

### Simple Test

```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '@security/ogelfy';

describe('API Tests', () => {
  test('GET /hello', async () => {
    const app = new Ogelfy();

    app.get('/hello', async () => {
      return { message: 'world' };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/hello'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'world' });
  });
});
```

### Test with Parameters

```typescript
test('GET /users/:id', async () => {
  const app = new Ogelfy();

  app.get('/users/:id', async (req, context) => {
    return {
      id: context.params.id,
      name: 'John Doe'
    };
  });

  const response = await app.inject({
    method: 'GET',
    url: '/users/123'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    id: '123',
    name: 'John Doe'
  });
});
```

### POST with Body

```typescript
test('POST /users creates user', async () => {
  const app = new Ogelfy();

  app.post('/users', async (req, context) => {
    return {
      id: crypto.randomUUID(),
      ...context.body
    };
  });

  const response = await app.inject({
    method: 'POST',
    url: '/users',
    body: {
      name: 'Alice',
      email: 'alice@example.com'
    }
  });

  expect(response.statusCode).toBe(200);

  const data = response.json();
  expect(data.name).toBe('Alice');
  expect(data.email).toBe('alice@example.com');
  expect(data.id).toBeDefined();
});
```

## Test Suite Organization

### Setup/Teardown

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy } from '@security/ogelfy';

describe('User API', () => {
  let app: Ogelfy;

  beforeEach(() => {
    app = new Ogelfy();

    // Setup routes
    app.get('/users', async () => {
      return { users: [] };
    });

    app.post('/users', async (req, context) => {
      return { id: crypto.randomUUID(), ...context.body };
    });
  });

  test('GET /users returns empty array', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users'
    });

    expect(response.json()).toEqual({ users: [] });
  });

  test('POST /users creates user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'Alice' }
    });

    expect(response.statusCode).toBe(200);
  });
});
```

### Shared App Factory

```typescript
// test/helpers/create-app.ts
export function createApp() {
  const app = new Ogelfy();

  // Common setup
  app.get('/health', async () => ({ status: 'ok' }));

  // Add test routes
  return app;
}

// test/api.test.ts
import { createApp } from './helpers/create-app';

test('health check', async () => {
  const app = createApp();

  const response = await app.inject({
    method: 'GET',
    url: '/health'
  });

  expect(response.json()).toEqual({ status: 'ok' });
});
```

## Testing Patterns

### Testing Headers

```typescript
test('sets custom headers', async () => {
  const app = new Ogelfy();

  app.get('/cached', async (req, reply) => {
    reply.header('Cache-Control', 'max-age=3600');
    return { data: 'cached' };
  });

  const response = await app.inject({
    method: 'GET',
    url: '/cached'
  });

  expect(response.headers.get('Cache-Control')).toBe('max-age=3600');
});

test('requires authorization header', async () => {
  const app = new Ogelfy();

  app.get('/protected', async (req) => {
    const auth = req.headers.get('authorization');
    if (!auth) {
      throw app.httpErrors.unauthorized('Missing auth');
    }
    return { data: 'secret' };
  });

  // Without header
  const unauthorized = await app.inject({
    method: 'GET',
    url: '/protected'
  });

  expect(unauthorized.statusCode).toBe(401);

  // With header
  const authorized = await app.inject({
    method: 'GET',
    url: '/protected',
    headers: {
      'Authorization': 'Bearer token123'
    }
  });

  expect(authorized.statusCode).toBe(200);
});
```

### Testing Query Parameters

```typescript
test('handles query parameters', async () => {
  const app = new Ogelfy();

  app.get('/search', async (req, context) => {
    return {
      query: context.query.q,
      page: context.query.page || '1'
    };
  });

  const response = await app.inject({
    method: 'GET',
    url: '/search',
    query: {
      q: 'ogelfy',
      page: '2'
    }
  });

  expect(response.json()).toEqual({
    query: 'ogelfy',
    page: '2'
  });
});
```

### Testing Validation

```typescript
test('validates request body', async () => {
  const app = new Ogelfy();

  app.post('/users', {
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' }
        },
        required: ['email']
      }
    }
  }, async (req, context) => {
    return { email: context.body.email };
  });

  // Invalid email
  const invalid = await app.inject({
    method: 'POST',
    url: '/users',
    body: { email: 'not-an-email' }
  });

  expect(invalid.statusCode).toBe(400);

  // Valid email
  const valid = await app.inject({
    method: 'POST',
    url: '/users',
    body: { email: 'user@example.com' }
  });

  expect(valid.statusCode).toBe(200);
});
```

### Testing Error Handling

```typescript
test('handles not found', async () => {
  const app = new Ogelfy();

  const response = await app.inject({
    method: 'GET',
    url: '/does-not-exist'
  });

  expect(response.statusCode).toBe(404);
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
  expect(response.json()).toMatchObject({
    error: expect.stringContaining('Invalid input')
  });
});
```

## Testing with Mock Database

### In-Memory Database

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';

class MockDatabase {
  private users = new Map<string, any>();

  async getUser(id: string) {
    return this.users.get(id);
  }

  async createUser(data: any) {
    const id = crypto.randomUUID();
    const user = { id, ...data };
    this.users.set(id, user);
    return user;
  }

  async clear() {
    this.users.clear();
  }
}

describe('User CRUD', () => {
  let app: Ogelfy;
  let db: MockDatabase;

  beforeEach(() => {
    db = new MockDatabase();
    app = new Ogelfy();

    app.decorate('db', db);

    app.get('/users/:id', async (req, context) => {
      const user = await app.db.getUser(context.params.id);
      if (!user) throw app.httpErrors.notFound('User not found');
      return user;
    });

    app.post('/users', async (req, context) => {
      return await app.db.createUser(context.body);
    });
  });

  test('creates and retrieves user', async () => {
    // Create user
    const createResponse = await app.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'Alice', email: 'alice@example.com' }
    });

    const created = createResponse.json();
    expect(created.id).toBeDefined();

    // Retrieve user
    const getResponse = await app.inject({
      method: 'GET',
      url: `/users/${created.id}`
    });

    expect(getResponse.json()).toEqual(created);
  });

  test('returns 404 for missing user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/nonexistent'
    });

    expect(response.statusCode).toBe(404);
  });
});
```

## Testing Plugins

```typescript
test('plugin adds decorator', async () => {
  const app = new Ogelfy();

  // Define plugin
  async function testPlugin(app: Ogelfy) {
    app.decorate('customMethod', () => 'plugin value');

    app.get('/plugin-test', async () => {
      return { value: app.customMethod() };
    });
  }

  await app.register(testPlugin);

  const response = await app.inject({
    method: 'GET',
    url: '/plugin-test'
  });

  expect(response.json()).toEqual({ value: 'plugin value' });
});

test('plugin hooks work', async () => {
  const app = new Ogelfy();
  let hookCalled = false;

  async function hookPlugin(app: Ogelfy) {
    app.addHook('onRequest', async () => {
      hookCalled = true;
    });

    app.get('/test', async () => ({ ok: true }));
  }

  await app.register(hookPlugin);

  await app.inject({
    method: 'GET',
    url: '/test'
  });

  expect(hookCalled).toBe(true);
});
```

## Testing Hooks

```typescript
test('auth hook protects route', async () => {
  const app = new Ogelfy();

  app.addHook('preHandler', async (req, reply) => {
    const auth = req.headers.get('authorization');
    if (!auth) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/protected', async () => {
    return { data: 'secret' };
  });

  // Without auth
  const unauthorized = await app.inject({
    method: 'GET',
    url: '/protected'
  });

  expect(unauthorized.statusCode).toBe(401);

  // With auth
  const authorized = await app.inject({
    method: 'GET',
    url: '/protected',
    headers: { 'Authorization': 'Bearer token' }
  });

  expect(authorized.statusCode).toBe(200);
});
```

## Testing Best Practices

### 1. Test One Thing Per Test

```typescript
// ✅ Good - Focused test
test('returns user by ID', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/users/123'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().id).toBe('123');
});

// ❌ Bad - Testing multiple things
test('user API works', async () => {
  // Creates, updates, deletes all in one test
});
```

### 2. Use Descriptive Test Names

```typescript
// ✅ Good
test('POST /users returns 400 when email is invalid', async () => {});

test('GET /users/:id returns 404 when user does not exist', async () => {});

// ❌ Bad
test('users', async () => {});
test('test1', async () => {});
```

### 3. Assert Expected Behavior

```typescript
// ✅ Good - Specific assertions
const response = await app.inject({ method: 'GET', url: '/users' });

expect(response.statusCode).toBe(200);
expect(response.json()).toEqual({ users: [] });
expect(response.headers.get('Content-Type')).toContain('application/json');

// ❌ Bad - Only checking status
const response = await app.inject({ method: 'GET', url: '/users' });
expect(response.statusCode).toBe(200);
```

### 4. Clean Up Between Tests

```typescript
describe('User tests', () => {
  let app: Ogelfy;

  beforeEach(() => {
    app = new Ogelfy();
    // Fresh app for each test
  });

  afterEach(async () => {
    await app.close();
    // Clean up resources
  });
});
```

### 5. Test Error Cases

```typescript
describe('Error handling', () => {
  test('handles validation errors', async () => {
    // Test invalid input
  });

  test('handles not found errors', async () => {
    // Test missing resources
  });

  test('handles server errors', async () => {
    // Test unexpected failures
  });
});
```

## Complete Test Example

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy } from '@security/ogelfy';

describe('Todo API', () => {
  let app: Ogelfy;
  const todos = new Map<string, any>();

  beforeEach(() => {
    todos.clear();
    app = new Ogelfy();

    // List todos
    app.get('/todos', async () => {
      return { todos: Array.from(todos.values()) };
    });

    // Get todo
    app.get('/todos/:id', async (req, context) => {
      const todo = todos.get(context.params.id);
      if (!todo) {
        throw app.httpErrors.notFound('Todo not found');
      }
      return todo;
    });

    // Create todo
    app.post('/todos', {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            completed: { type: 'boolean', default: false }
          },
          required: ['title']
        }
      }
    }, async (req, context) => {
      const id = crypto.randomUUID();
      const todo = { id, ...context.body };
      todos.set(id, todo);
      return todo;
    });

    // Update todo
    app.put('/todos/:id', async (req, context) => {
      const todo = todos.get(context.params.id);
      if (!todo) {
        throw app.httpErrors.notFound('Todo not found');
      }

      const updated = { ...todo, ...context.body };
      todos.set(context.params.id, updated);
      return updated;
    });

    // Delete todo
    app.delete('/todos/:id', async (req, context) => {
      const deleted = todos.delete(context.params.id);
      if (!deleted) {
        throw app.httpErrors.notFound('Todo not found');
      }
      return { success: true };
    });
  });

  test('GET /todos returns empty array initially', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/todos'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ todos: [] });
  });

  test('POST /todos creates a todo', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/todos',
      body: { title: 'Test todo', completed: false }
    });

    expect(response.statusCode).toBe(200);

    const todo = response.json();
    expect(todo.id).toBeDefined();
    expect(todo.title).toBe('Test todo');
    expect(todo.completed).toBe(false);
  });

  test('POST /todos validates required title', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/todos',
      body: { completed: true }
    });

    expect(response.statusCode).toBe(400);
  });

  test('GET /todos/:id returns todo', async () => {
    // Create todo
    const createResponse = await app.inject({
      method: 'POST',
      url: '/todos',
      body: { title: 'Test' }
    });

    const created = createResponse.json();

    // Get todo
    const getResponse = await app.inject({
      method: 'GET',
      url: `/todos/${created.id}`
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(created);
  });

  test('GET /todos/:id returns 404 for nonexistent todo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/todos/nonexistent'
    });

    expect(response.statusCode).toBe(404);
  });

  test('PUT /todos/:id updates todo', async () => {
    // Create todo
    const createResponse = await app.inject({
      method: 'POST',
      url: '/todos',
      body: { title: 'Original', completed: false }
    });

    const created = createResponse.json();

    // Update todo
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/todos/${created.id}`,
      body: { completed: true }
    });

    expect(updateResponse.statusCode).toBe(200);

    const updated = updateResponse.json();
    expect(updated.title).toBe('Original');
    expect(updated.completed).toBe(true);
  });

  test('DELETE /todos/:id removes todo', async () => {
    // Create todo
    const createResponse = await app.inject({
      method: 'POST',
      url: '/todos',
      body: { title: 'To delete' }
    });

    const created = createResponse.json();

    // Delete todo
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/todos/${created.id}`
    });

    expect(deleteResponse.statusCode).toBe(200);

    // Verify deleted
    const getResponse = await app.inject({
      method: 'GET',
      url: `/todos/${created.id}`
    });

    expect(getResponse.statusCode).toBe(404);
  });
});
```

## See Also

- [Getting Started Guide](./GETTING_STARTED.md)
- [API Reference](../API.md)
- [Bun Test Documentation](https://bun.sh/docs/cli/test)
