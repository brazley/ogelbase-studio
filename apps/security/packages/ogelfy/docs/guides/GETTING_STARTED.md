# Getting Started with Ogelfy

This guide will walk you through creating your first Ogelfy application from scratch.

## Prerequisites

- **Bun 1.0+** installed on your machine
- Basic knowledge of TypeScript/JavaScript
- Familiarity with REST APIs

## Installation

Create a new project and install Ogelfy:

```bash
mkdir my-api && cd my-api
bun init -y
bun add @security/ogelfy
```

## Your First Server

Create `index.ts`:

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

app.get('/', async () => {
  return { message: 'Hello from Ogelfy!' };
});

await app.listen({ port: 3000 });
console.log('Server running on http://localhost:3000');
```

Run it:

```bash
bun run index.ts
```

Visit `http://localhost:3000` in your browser - you should see:

```json
{
  "message": "Hello from Ogelfy!"
}
```

## Adding More Routes

Let's build a simple user API:

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

// In-memory storage (use a real database in production!)
const users = new Map();

// List all users
app.get('/users', async () => {
  return { users: Array.from(users.values()) };
});

// Get single user
app.get('/users/:id', async (req, context) => {
  const user = users.get(context.params.id);

  if (!user) {
    throw app.httpErrors.notFound('User not found');
  }

  return user;
});

// Create user
app.post('/users', async (req, context) => {
  const id = crypto.randomUUID();
  const user = {
    id,
    ...context.body,
    createdAt: new Date().toISOString()
  };

  users.set(id, user);
  return user;
});

// Update user
app.put('/users/:id', async (req, context) => {
  const user = users.get(context.params.id);

  if (!user) {
    throw app.httpErrors.notFound('User not found');
  }

  const updated = {
    ...user,
    ...context.body,
    updatedAt: new Date().toISOString()
  };

  users.set(context.params.id, updated);
  return updated;
});

// Delete user
app.delete('/users/:id', async (req, context) => {
  const existed = users.delete(context.params.id);

  if (!existed) {
    throw app.httpErrors.notFound('User not found');
  }

  return { success: true };
});

await app.listen({ port: 3000 });
console.log('API running on http://localhost:3000');
```

Test your API:

```bash
# Create a user
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

# Get all users
curl http://localhost:3000/users

# Get specific user
curl http://localhost:3000/users/<id-from-response>

# Update user
curl -X PUT http://localhost:3000/users/<id> \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Smith"}'

# Delete user
curl -X DELETE http://localhost:3000/users/<id>
```

## Understanding Route Parameters

Ogelfy extracts URL parameters into `context.params`:

```typescript
// URL pattern: /users/:userId/posts/:postId
app.get('/users/:userId/posts/:postId', async (req, context) => {
  const { userId, postId } = context.params;

  return {
    userId,  // from URL: /users/123/posts/456
    postId   // postId = "456"
  };
});
```

## Understanding Query Parameters

Query strings are automatically parsed into `context.query`:

```typescript
// URL: /search?q=ogelfy&limit=10&sort=date
app.get('/search', async (req, context) => {
  const { q, limit, sort } = context.query;

  return {
    query: q,        // "ogelfy"
    limit: limit,    // "10" (string - use schema validation for type conversion)
    sort: sort       // "date"
  };
});
```

## Understanding Request Body

POST/PUT/PATCH requests automatically parse JSON bodies:

```typescript
app.post('/users', async (req, context) => {
  // Body is automatically parsed from JSON
  const { name, email, age } = context.body;

  return {
    id: crypto.randomUUID(),
    name,
    email,
    age
  };
});
```

## Adding Validation

Validate requests with JSON Schema:

```typescript
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3 },
        email: { type: 'string', format: 'email' },
        age: { type: 'number', minimum: 0, maximum: 150 }
      },
      required: ['name', 'email']
    }
  }
}, async (req, context) => {
  // If we get here, the body is valid
  const user = {
    id: crypto.randomUUID(),
    ...context.body,
    createdAt: new Date().toISOString()
  };

  return user;
});
```

Try sending invalid data:

```bash
# Missing required field
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'

# Response: 400 Bad Request
{
  "error": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "must have required property 'email'"
    }
  ]
}

# Invalid email format
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"not-an-email"}'

# Response: 400 Bad Request
{
  "error": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "must match format \"email\""
    }
  ]
}
```

## Error Handling

Throw HTTP errors using the built-in error factory:

```typescript
import { httpErrors } from '@security/ogelfy';

app.get('/users/:id', async (req, context) => {
  const user = users.get(context.params.id);

  if (!user) {
    throw httpErrors.notFound('User not found');
  }

  if (!user.isActive) {
    throw httpErrors.forbidden('User account is disabled');
  }

  if (user.age < 18) {
    throw httpErrors.unprocessableEntity('User must be 18+');
  }

  return user;
});
```

Add a custom error handler:

```typescript
app.setErrorHandler((error, req) => {
  const url = new URL(req.url);

  console.error('Error:', {
    method: req.method,
    path: url.pathname,
    error: error.message,
    stack: error.stack
  });

  const statusCode = error.statusCode || 500;

  return new Response(JSON.stringify({
    error: statusCode === 500 ? 'Internal Server Error' : error.message,
    statusCode,
    path: url.pathname
  }), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

## Adding Logging

Use the `onRequest` and `onResponse` hooks for logging:

```typescript
// Log incoming requests
app.addHook('onRequest', async (req, reply) => {
  const url = new URL(req.url);
  console.log(`→ ${req.method} ${url.pathname}`);
});

// Log responses
app.addHook('onResponse', async (req, reply) => {
  const duration = Date.now() - req.startTime;
  console.log(`← ${reply.statusCode} (${duration}ms)`);
});
```

## Project Structure

For larger applications, organize your code:

```
my-api/
├── src/
│   ├── index.ts           # Application entry point
│   ├── routes/
│   │   ├── users.ts       # User routes
│   │   ├── posts.ts       # Post routes
│   │   └── auth.ts        # Auth routes
│   ├── schemas/
│   │   ├── user.ts        # User validation schemas
│   │   └── post.ts        # Post validation schemas
│   ├── plugins/
│   │   ├── auth.ts        # Authentication plugin
│   │   └── database.ts    # Database plugin
│   └── utils/
│       ├── database.ts    # Database utilities
│       └── auth.ts        # Auth utilities
├── package.json
└── tsconfig.json
```

**src/routes/users.ts:**

```typescript
import type { Ogelfy } from '@security/ogelfy';
import { userSchema } from '../schemas/user';

export async function userRoutes(app: Ogelfy) {
  app.get('/users', async () => {
    return { users: await app.db.getUsers() };
  });

  app.post('/users', {
    schema: { body: userSchema }
  }, async (req, context) => {
    return await app.db.createUser(context.body);
  });
}
```

**src/index.ts:**

```typescript
import { Ogelfy } from '@security/ogelfy';
import { userRoutes } from './routes/users';
import { authPlugin } from './plugins/auth';

const app = new Ogelfy();

// Register plugins
await app.register(authPlugin);

// Register routes
await app.register(userRoutes);

await app.listen({ port: 3000 });
```

## Next Steps

Now that you have the basics:

1. **Learn about routing** - [Routing Guide](./ROUTING.md)
2. **Add validation** - [Validation Guide](./VALIDATION.md)
3. **Create plugins** - [Plugins Guide](./PLUGINS.md)
4. **Use lifecycle hooks** - [Hooks Guide](./HOOKS.md)
5. **Write tests** - [Testing Guide](./TESTING.md)

## Common Patterns

### Environment Configuration

```typescript
const app = new Ogelfy();

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || 'localhost';

await app.listen({ port: PORT, hostname: HOST });
console.log(`Server running on http://${HOST}:${PORT}`);
```

### CORS Support

```typescript
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});

// Handle preflight requests
app.options('/*', async (req, reply) => {
  reply.status(204).send();
});
```

### Health Check Endpoint

```typescript
app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
});
```

### Graceful Shutdown

```typescript
const app = new Ogelfy();

// ... configure routes ...

const server = await app.listen({ port: 3000 });

// Handle shutdown signals
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await app.close();
  process.exit(0);
});
```

## Troubleshooting

### Port Already in Use

```
Error: Failed to start server: Address already in use
```

Solution: Change the port or kill the process using it:

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Validation Not Working

Make sure you're passing the schema in the options object:

```typescript
// ❌ Wrong
app.post('/users', async (req, context) => {
  // No validation
});

// ✅ Correct
app.post('/users', {
  schema: { body: userSchema }
}, async (req, context) => {
  // Body is validated
});
```

### Body Not Parsed

Ogelfy automatically parses JSON bodies. Make sure:
1. Content-Type header is set to `application/json`
2. Request method is POST, PUT, or PATCH (not GET)

```bash
# ✅ Correct
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}'

# ❌ Wrong (missing header)
curl -X POST http://localhost:3000/users \
  -d '{"name":"Alice"}'
```

## Additional Resources

- [API Reference](../API.md) - Complete API documentation
- [Examples](../../examples) - Working code examples
- [Performance Guide](../PERFORMANCE.md) - Optimization tips
- [TypeScript Guide](../TYPESCRIPT.md) - Type-safe development
