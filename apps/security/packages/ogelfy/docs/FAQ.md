# Frequently Asked Questions

## General

### What is Ogelfy?

Ogelfy is a high-performance web framework for Bun, inspired by Fastify's developer experience but built for Bun's native performance. It provides a familiar API while leveraging Bun's speed and modern JavaScript features.

### Why choose Ogelfy over Fastify?

- **3-5x faster** - Native Bun performance (85k vs 30k req/sec)
- **Built for Bun** - Uses Bun.serve() directly, no Node.js compatibility layer
- **Same developer experience** - Familiar API if you know Fastify
- **Modern TypeScript** - Built with TypeScript from the ground up
- **Simpler** - No stream handling complexity, uses Web standard APIs

### Can I use Ogelfy with Node.js?

No. Ogelfy is built specifically for Bun and uses Bun-specific APIs. It will not work with Node.js. If you need Node.js, use Fastify instead.

### Is Ogelfy production-ready?

Ogelfy is actively developed and tested. While it's newer than Fastify, it's stable enough for production use. Always test thoroughly for your specific use case.

## Installation & Setup

### How do I install Ogelfy?

```bash
bun add @security/ogelfy
```

### What version of Bun do I need?

Bun 1.0 or later. Latest stable version recommended.

### How do I update Ogelfy?

```bash
bun update @security/ogelfy
```

## Development

### How do I access request body?

The body is automatically parsed and available in `context.body`:

```typescript
app.post('/users', async (req, context) => {
  const { name, email } = context.body;
  return { name, email };
});
```

### How do I access query parameters?

Query parameters are in `context.query`:

```typescript
app.get('/search', async (req, context) => {
  const { q, limit } = context.query;
  return { query: q, limit };
});
```

### How do I access URL parameters?

URL parameters are in `context.params`:

```typescript
app.get('/users/:id', async (req, context) => {
  const userId = context.params.id;
  return { userId };
});
```

### How do I set response status code?

Return an object with `statusCode` or use `reply.status()`:

```typescript
// Option 1: Return with statusCode
app.post('/users', async () => {
  return {
    statusCode: 201,
    id: crypto.randomUUID()
  };
});

// Option 2: Use reply
app.post('/users', async (req, context, reply) => {
  reply.status(201);
  return { id: crypto.randomUUID() };
});
```

### How do I set response headers?

Use `reply.header()`:

```typescript
app.get('/data', async (req, context, reply) => {
  reply.header('Cache-Control', 'max-age=3600');
  reply.header('X-Custom-Header', 'value');

  return { data: 'cached' };
});
```

### How do I send JSON responses?

Just return an object - it's automatically JSON serialized:

```typescript
app.get('/users', async () => {
  return { users: [] }; // Automatically becomes JSON
});
```

### How do I handle file uploads?

Use multipart form data:

```typescript
app.post('/upload', async (req, context) => {
  // context.body contains parsed multipart data
  const file = context.body.file;

  await Bun.write(`./uploads/${file.name}`, file.data);

  return { filename: file.name, size: file.size };
});
```

### How do I serve static files?

Use Bun.file():

```typescript
app.get('/public/*', async (req) => {
  const url = new URL(req.url);
  const filePath = url.pathname.replace('/public/', '');
  const file = Bun.file(`./public/${filePath}`);

  if (await file.exists()) {
    return new Response(file);
  }

  throw app.httpErrors.notFound('File not found');
});
```

## Validation

### How do I validate request data?

Use JSON Schema in route options:

```typescript
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
  // body is validated
  return { email: context.body.email };
});
```

### Can I use Zod for validation?

Yes, Ogelfy includes Zod as a dependency. You can use it for validation:

```typescript
import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

app.post('/users', async (req, context) => {
  const user = userSchema.parse(context.body);
  return user;
});
```

### How do I customize validation errors?

Use a custom error handler:

```typescript
import { SchemaValidationError } from '@security/ogelfy';

app.setErrorHandler((error, req) => {
  if (error instanceof SchemaValidationError) {
    return new Response(JSON.stringify({
      error: 'Validation failed',
      fields: error.errors
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: error.message }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

## Authentication & Security

### How do I add authentication?

Create an auth plugin:

```typescript
async function authPlugin(app: Ogelfy, options: any) {
  app.addHook('preHandler', async (req, reply) => {
    const token = req.headers.get('authorization');

    if (!token) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    req.user = await verifyToken(token);
  });
}

await app.register(authPlugin);
```

### How do I handle CORS?

Add CORS headers in a hook:

```typescript
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});

// Handle preflight
app.options('/*', async (req, reply) => {
  reply.status(204).send();
});
```

### How do I implement rate limiting?

Use a preHandler hook:

```typescript
const rateLimiter = new Map();

app.addHook('preHandler', async (req, reply) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const requests = rateLimiter.get(ip) || [];

  if (requests.filter((t: number) => now - t < 60000).length >= 100) {
    reply.status(429).send({ error: 'Too Many Requests' });
    return;
  }

  requests.push(now);
  rateLimiter.set(ip, requests);
});
```

## Plugins

### How do I create a plugin?

```typescript
async function myPlugin(app: Ogelfy, options: any) {
  // Add decorators
  app.decorate('myMethod', () => 'value');

  // Add hooks
  app.addHook('onRequest', async (req, reply) => {
    console.log('Plugin hook');
  });

  // Add routes
  app.get('/plugin-route', async () => {
    return { message: 'from plugin' };
  });
}

await app.register(myPlugin, { option: 'value' });
```

### How do I encapsulate a plugin?

Use `fp()` wrapper:

```typescript
import { fp } from '@security/ogelfy';

const myPlugin = fp(async function(app: Ogelfy, options: any) {
  // Plugin code
}, {
  name: 'my-plugin',
  encapsulate: true
});

await app.register(myPlugin);
```

### Can I use Fastify plugins?

No. Fastify plugins are not compatible with Ogelfy due to different runtime (Node.js vs Bun) and API differences. You'll need to rewrite them for Ogelfy.

## Testing

### How do I test my routes?

Use `.inject()` for testing without starting a server:

```typescript
import { describe, test, expect } from 'bun:test';

describe('API tests', () => {
  test('GET /users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ users: [] });
  });
});
```

### How do I test with authentication?

Pass headers in inject options:

```typescript
const response = await app.inject({
  method: 'GET',
  url: '/protected',
  headers: {
    'Authorization': 'Bearer token123'
  }
});
```

### How do I mock database calls?

Create a mock database and decorate the app:

```typescript
const mockDb = {
  getUser: async (id: string) => ({ id, name: 'Test' })
};

app.decorate('db', mockDb);

// Now routes use mockDb
app.get('/users/:id', async (req, context) => {
  return await app.db.getUser(context.params.id);
});
```

## Performance

### How fast is Ogelfy?

Ogelfy achieves ~85,000 req/sec on Apple M1 for simple JSON responses, compared to Fastify's ~30,000 req/sec on Node.js.

### How do I optimize performance?

1. Use response schemas for fast serialization
2. Minimize lifecycle hooks
3. Share schemas with `addSchema()`
4. Use connection pooling for databases
5. Cache expensive operations

See [Performance Guide](./PERFORMANCE.md) for details.

### Does Ogelfy support HTTP/2?

Yes, when using HTTPS:

```typescript
await app.listen({
  port: 443,
  tls: {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem')
  }
});
```

## Errors

### How do I handle errors?

Throw HTTP errors using built-in helpers:

```typescript
import { httpErrors } from '@security/ogelfy';

app.get('/users/:id', async (req, context) => {
  const user = await db.getUser(context.params.id);

  if (!user) {
    throw httpErrors.notFound('User not found');
  }

  return user;
});
```

### How do I create custom errors?

Extend HttpError:

```typescript
import { HttpError } from '@security/ogelfy';

class CustomError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'CustomError';
  }
}

throw new CustomError('Something went wrong');
```

### How do I set a global error handler?

Use `setErrorHandler()`:

```typescript
app.setErrorHandler((error, req) => {
  console.error('Error:', error);

  return new Response(JSON.stringify({
    error: error.message,
    statusCode: error.statusCode || 500
  }), {
    status: error.statusCode || 500,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

## Deployment

### How do I deploy to production?

Use a process manager like PM2 or systemd:

```bash
# PM2
pm2 start app.ts --name ogelfy-api

# Or with clustering
pm2 start app.ts -i max
```

### How do I configure for production?

```typescript
const app = new Ogelfy({
  bodyLimit: 10 * 1024 * 1024, // 10MB
  schemaCompiler: {
    coerceTypes: true,
    removeAdditional: true
  }
});
```

### How do I handle environment variables?

Use `process.env`:

```typescript
const PORT = parseInt(process.env.PORT || '3000');
const DATABASE_URL = process.env.DATABASE_URL!;

await app.listen({ port: PORT });
```

### How do I enable HTTPS?

Pass TLS options to `listen()`:

```typescript
await app.listen({
  port: 443,
  tls: {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem')
  }
});
```

## Troubleshooting

### My validation isn't working

Make sure you're passing the schema in options, not as a separate argument:

```typescript
// ❌ Wrong
app.post('/users', handler, { schema: userSchema });

// ✅ Correct
app.post('/users', { schema: userSchema }, handler);
```

### Body is null/undefined

Ensure:
1. Content-Type header is `application/json`
2. Request method is POST/PUT/PATCH (not GET)
3. Body is valid JSON

### Routes not found

Check route order - more specific routes should come first:

```typescript
// ✅ Correct order
app.get('/users/admin', adminHandler);
app.get('/users/:id', userHandler);

// ❌ Wrong - :id would match 'admin'
app.get('/users/:id', userHandler);
app.get('/users/admin', adminHandler); // Never reached
```

### TypeScript errors with decorators

Add type declarations:

```typescript
declare module '@security/ogelfy' {
  interface Ogelfy {
    myDecorator: MyType;
  }
}
```

## Migration

### How do I migrate from Fastify?

See [Migration Guide](./guides/MIGRATION_FROM_FASTIFY.md) for detailed steps.

### How do I migrate from Express?

Ogelfy is closer to Fastify than Express. Main changes:
- Replace middleware with hooks
- Use schema validation instead of validator libraries
- Update route handler signatures

## Getting Help

### Where can I get help?

- Read the [documentation](./README.md)
- Check [examples](../examples)
- File an issue on GitHub
- Join the community discussions

### How do I report a bug?

File an issue on GitHub with:
- Ogelfy version
- Bun version
- Minimal reproduction code
- Expected vs actual behavior

### How do I request a feature?

File a feature request on GitHub with:
- Use case description
- Expected API
- Why it would be useful

## See Also

- [Getting Started](./guides/GETTING_STARTED.md)
- [API Reference](./API.md)
- [Migration Guide](./guides/MIGRATION_FROM_FASTIFY.md)
- [Performance Guide](./PERFORMANCE.md)
