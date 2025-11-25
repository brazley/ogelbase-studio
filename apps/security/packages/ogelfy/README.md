# Ogelfy

High-performance, Bun-native web framework inspired by Fastify's developer experience and API design.

## Why Ogelfy?

- **3-5x faster than Fastify** (85k req/sec vs 30k) - Built on Bun.serve() for native performance
- **Fastify-compatible API** - Familiar patterns, easy migration from Fastify
- **Built for Bun** - Native Bun runtime optimization, no Node.js overhead
- **Type-safe** - Full TypeScript support with excellent type inference
- **Well-tested** - 300+ tests covering all framework features
- **Plugin ecosystem** - Encapsulated plugins with lifecycle hooks
- **Schema validation** - Built-in JSON Schema validation with AJV
- **Developer-friendly** - Great error messages and intuitive API

## Quick Start

Create your first Ogelfy server in under 5 minutes:

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

app.get('/', async () => {
  return { hello: 'world' };
});

app.get('/user/:id', async (req, context) => {
  return {
    id: context.params.id,
    name: 'John Doe'
  };
});

await app.listen({ port: 3000 });
console.log('Server running on http://localhost:3000');
```

That's it! You now have a running web server with route parameters and JSON responses.

## Installation

```bash
bun add @security/ogelfy
```

**Requirements**: Bun 1.0+ (not compatible with Node.js)

## Basic Usage

### Simple Routes

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

// GET request
app.get('/hello', async () => {
  return { message: 'Hello!' };
});

// POST request
app.post('/users', async (req, context) => {
  const userData = context.body;
  return { id: crypto.randomUUID(), ...userData };
});

// Route parameters
app.get('/users/:id', async (req, context) => {
  return { userId: context.params.id };
});

await app.listen({ port: 3000 });
```

### Route Chaining

Build multiple routes for the same path:

```typescript
app.route('/users')
  .get(getAllUsers)
  .post(createUser)
  .delete(deleteUser);
```

### Request Context

Every route handler receives a `context` object:

```typescript
app.post('/api/users/:id', async (req, context) => {
  const { params, query, body } = context;

  console.log(params.id);      // URL params: /api/users/123
  console.log(query.sort);     // Query string: ?sort=name
  console.log(body.email);     // Request body (auto-parsed)

  return { success: true };
});
```

## Core Concepts

### 1. Routes

Ogelfy uses a fast radix tree router that supports:
- Static routes: `/users`
- Dynamic routes: `/users/:id`
- Wildcard routes: `/files/*`
- Regex patterns: `/api/v[0-9]+/users`

### 2. Schema Validation

Validate requests and responses with JSON Schema:

```typescript
app.post('/user', {
  schema: {
    body: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        age: { type: 'number', minimum: 0 }
      },
      required: ['email']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' }
        }
      }
    }
  }
}, async (req, context) => {
  // body is already validated
  return {
    id: crypto.randomUUID(),
    email: context.body.email
  };
});
```

### 3. Lifecycle Hooks

Execute code at different stages of the request lifecycle:

```typescript
// Global hooks (all routes)
app.addHook('onRequest', async (req, reply) => {
  console.log(`${req.method} ${new URL(req.url).pathname}`);
});

app.addHook('onResponse', async (req, reply) => {
  console.log(`Responded with ${reply.statusCode}`);
});

// Route-specific hooks
app.get('/protected', {
  hooks: {
    preHandler: async (req, reply) => {
      if (!req.headers.get('authorization')) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  }
}, async () => {
  return { data: 'secret' };
});
```

Available hooks (in order):
1. `onRequest` - First thing, before routing
2. `preParsing` - Before body parsing
3. `preValidation` - Before schema validation
4. `preHandler` - After validation, before handler (auth, permissions)
5. `preSerialization` - Transform response data
6. `onSend` - Before response sent (compression, logging)
7. `onResponse` - After response sent (metrics, cleanup)
8. `onError` - When errors occur

### 4. Plugins

Encapsulate functionality in reusable plugins:

```typescript
// Define a plugin
async function authPlugin(app, options) {
  app.decorate('authenticate', async (req) => {
    const token = req.headers.get('authorization');
    if (!token) throw app.httpErrors.unauthorized('Missing token');
    return { userId: 'abc123' };
  });

  app.addHook('preHandler', async (req, reply) => {
    if (options.protect) {
      req.user = await app.authenticate(req);
    }
  });
}

// Use the plugin
await app.register(authPlugin, { protect: true });

// Now all routes are protected
app.get('/profile', async (req) => {
  return { user: req.user };
});
```

### 5. Error Handling

Built-in HTTP error utilities:

```typescript
import { httpErrors } from '@security/ogelfy';

app.get('/users/:id', async (req, context) => {
  const user = await db.findUser(context.params.id);

  if (!user) {
    throw httpErrors.notFound('User not found');
  }

  return user;
});

// Custom error handler
app.setErrorHandler((error, req) => {
  console.error('Request failed:', error);

  return new Response(JSON.stringify({
    error: error.message,
    statusCode: error.statusCode || 500
  }), {
    status: error.statusCode || 500,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### 6. Testing

Test your routes without starting an HTTP server:

```typescript
import { describe, test, expect } from 'bun:test';

const app = new Ogelfy();
app.get('/hello', async () => ({ message: 'world' }));

describe('API tests', () => {
  test('GET /hello', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/hello'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'world' });
  });

  test('POST /users with body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'Alice' }
    });

    expect(response.statusCode).toBe(200);
  });
});
```

## API Reference Overview

Complete API documentation is available in [docs/API.md](./docs/API.md).

### Main Methods

- `app.get(path, [options], handler)` - Register GET route
- `app.post(path, [options], handler)` - Register POST route
- `app.put(path, [options], handler)` - Register PUT route
- `app.delete(path, [options], handler)` - Register DELETE route
- `app.patch(path, [options], handler)` - Register PATCH route
- `app.all(path, [options], handler)` - Register route for all methods
- `app.route(path)` - Create route chain builder
- `app.listen(options)` - Start HTTP server
- `app.inject(options)` - Inject request for testing

### Plugin System

- `app.register(plugin, options)` - Register plugin
- `app.decorate(name, value)` - Add property/method to app
- `app.decorateRequest(name, value)` - Add property to request
- `app.decorateReply(name, value)` - Add property to reply
- `app.addHook(name, handler)` - Add lifecycle hook

### Validation & Schemas

- `app.addSchema(id, schema)` - Add shared JSON schema
- Schema options: `body`, `querystring`, `params`, `headers`, `response`

### Error Handling

- `app.setErrorHandler(handler)` - Custom error handler
- `app.setNotFoundHandler(handler)` - Custom 404 handler
- `app.httpErrors.*` - HTTP error factory methods

## Examples

See the [examples/](./examples) directory for complete working examples:

- [basic-server.ts](./examples/basic-server.ts) - Simple API server
- [with-validation.ts](./examples/with-validation.ts) - Schema validation
- [with-auth-plugin.ts](./examples/with-auth-plugin.ts) - Authentication plugin
- [with-database.ts](./examples/with-database.ts) - Database integration
- [full-crud-api.ts](./examples/full-crud-api.ts) - Complete CRUD API
- [testing-example.ts](./examples/testing-example.ts) - Testing with .inject()

## Comparison to Fastify

Ogelfy is inspired by Fastify but built for Bun:

| Feature | Ogelfy | Fastify |
|---------|--------|---------|
| Runtime | Bun only | Node.js |
| Performance | 85k req/sec | 30k req/sec |
| API | Fastify-compatible | Original |
| Plugins | ✅ With encapsulation | ✅ |
| Hooks | ✅ Full lifecycle | ✅ |
| Validation | ✅ JSON Schema + Zod | ✅ JSON Schema |
| TypeScript | ✅ Native | ✅ Via @types |
| Testing | ✅ .inject() | ✅ .inject() |

**Migration from Fastify**: Most Fastify code works with minimal changes. See [docs/guides/MIGRATION_FROM_FASTIFY.md](./docs/guides/MIGRATION_FROM_FASTIFY.md) for details.

## Performance Benchmarks

Tested on Apple M1, Bun 1.3.3, wrk 10k requests:

| Framework | Requests/sec | Latency (P99) |
|-----------|--------------|---------------|
| **Ogelfy** | **85,000** | **<5ms** |
| Fastify | 30,000 | <15ms |
| Express | 10,000 | <40ms |

See [docs/PERFORMANCE.md](./docs/PERFORMANCE.md) for detailed benchmarks and optimization tips.

## Documentation

- [API Reference](./docs/API.md) - Complete API documentation
- [Getting Started Guide](./docs/guides/GETTING_STARTED.md) - Step-by-step tutorial
- [Routing Guide](./docs/guides/ROUTING.md) - All about routes
- [Validation Guide](./docs/guides/VALIDATION.md) - Schema validation
- [Plugins Guide](./docs/guides/PLUGINS.md) - Creating plugins
- [Hooks Guide](./docs/guides/HOOKS.md) - Lifecycle hooks
- [Testing Guide](./docs/guides/TESTING.md) - Testing with .inject()
- [Migration Guide](./docs/guides/MIGRATION_FROM_FASTIFY.md) - From Fastify to Ogelfy
- [TypeScript Guide](./docs/TYPESCRIPT.md) - Type-safe development
- [Performance Guide](./docs/PERFORMANCE.md) - Benchmarks & optimization
- [FAQ](./docs/FAQ.md) - Frequently asked questions

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](./CONTRIBUTING.md) guide.

## License

MIT

## Acknowledgments

Ogelfy is inspired by [Fastify](https://www.fastify.io/) and built for the [Bun](https://bun.sh/) runtime. Special thanks to the Fastify team for pioneering many of the patterns used here.
