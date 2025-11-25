# Ogelfy API Reference

Complete API documentation for Ogelfy web framework.

## Table of Contents

- [Ogelfy Class](#ogelfy-class)
- [Route Methods](#route-methods)
- [Route Options](#route-options)
- [RouteContext](#routecontext)
- [Plugin System](#plugin-system)
- [Decorators](#decorators)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Reply Object](#reply-object)
- [Schema Validation](#schema-validation)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Content Parsing](#content-parsing)
- [Serialization](#serialization)

---

## Ogelfy Class

The main application class for creating web servers.

### Constructor

```typescript
new Ogelfy(options?: OgelfyOptions)
```

**Options:**

```typescript
interface OgelfyOptions {
  logger?: boolean;              // Enable logging (default: false)
  bodyLimit?: number;            // Max body size in bytes (default: 1MB)
  fileSizeLimit?: number;        // Max file upload size (default: 10MB)
  requestTimeout?: number;       // Request timeout in ms (default: none)
  schemaCompiler?: {
    coerceTypes?: boolean;       // Coerce types in validation (default: true)
    removeAdditional?: boolean | 'all' | 'failing'; // Remove additional properties
    useDefaults?: boolean;       // Apply default values (default: true)
    strict?: boolean;            // Strict mode validation (default: false)
  };
}
```

**Example:**

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy({
  bodyLimit: 5 * 1024 * 1024,  // 5MB
  requestTimeout: 30000,        // 30 seconds
  schemaCompiler: {
    coerceTypes: true,
    removeAdditional: true
  }
});
```

---

## Route Methods

Register routes for different HTTP methods.

### app.get(path, [options], handler)

Register a GET route.

**Parameters:**
- `path: string | RegExp` - Route path (supports params `:id` and wildcards `*`)
- `options?: RouteOptions` - Route configuration (optional)
- `handler: RouteHandler` - Async function handling the request

**Returns:** `void`

**Example:**

```typescript
// Simple route
app.get('/hello', async () => {
  return { message: 'Hello!' };
});

// With parameters
app.get('/user/:id', async (req, context) => {
  return { userId: context.params.id };
});

// With options
app.get('/protected', {
  schema: {
    response: {
      200: { type: 'object', properties: { data: { type: 'string' } } }
    }
  }
}, async () => {
  return { data: 'secret' };
});
```

### app.post(path, [options], handler)

Register a POST route.

**Example:**

```typescript
app.post('/users', async (req, context) => {
  const userData = context.body;
  return {
    id: crypto.randomUUID(),
    ...userData
  };
});

// With validation
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3 },
        email: { type: 'string', format: 'email' }
      },
      required: ['name', 'email']
    }
  }
}, async (req, context) => {
  return { id: crypto.randomUUID(), ...context.body };
});
```

### app.put(path, [options], handler)

Register a PUT route for updating resources.

**Example:**

```typescript
app.put('/users/:id', async (req, context) => {
  const userId = context.params.id;
  const updates = context.body;

  return { id: userId, ...updates };
});
```

### app.delete(path, [options], handler)

Register a DELETE route.

**Example:**

```typescript
app.delete('/users/:id', async (req, context) => {
  const userId = context.params.id;

  // Delete from database
  await db.deleteUser(userId);

  return { success: true };
});
```

### app.patch(path, [options], handler)

Register a PATCH route for partial updates.

**Example:**

```typescript
app.patch('/users/:id', async (req, context) => {
  return {
    id: context.params.id,
    ...context.body
  };
});
```

### app.options(path, [options], handler)

Register an OPTIONS route (typically for CORS).

**Example:**

```typescript
app.options('/api/*', async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
    }
  });
});
```

### app.head(path, [options], handler)

Register a HEAD route.

**Example:**

```typescript
app.head('/health', async () => {
  return new Response(null, { status: 200 });
});
```

### app.all(path, [options], handler)

Register a route that matches ALL HTTP methods.

**Example:**

```typescript
app.all('/catch-all', async (req) => {
  return {
    method: req.method,
    message: 'This handles any HTTP method'
  };
});
```

---

## Route Chaining

### app.route(path)

Create a route builder for chaining multiple methods on the same path.

**Returns:** `RouteChain`

**Example:**

```typescript
app.route('/users')
  .get(async () => {
    return await db.getAllUsers();
  })
  .post(async (req, context) => {
    return await db.createUser(context.body);
  })
  .delete(async (req, context) => {
    return await db.deleteAllUsers();
  });

// Equivalent to:
app.get('/users', getAllUsers);
app.post('/users', createUser);
app.delete('/users', deleteAllUsers);
```

**RouteChain Methods:**
- `get(handler)` - Add GET handler
- `post(handler)` - Add POST handler
- `put(handler)` - Add PUT handler
- `delete(handler)` - Add DELETE handler
- `patch(handler)` - Add PATCH handler
- `options(handler)` - Add OPTIONS handler
- `head(handler)` - Add HEAD handler
- `all(handler)` - Add handler for all methods

---

## Route Options

Configure route behavior with options.

```typescript
interface RouteOptions {
  schema?: RouteSchema;          // JSON Schema validation
  constraints?: RouteConstraints; // Host/version constraints
  hooks?: RouteHooks;            // Route-specific lifecycle hooks
}
```

### RouteSchema

```typescript
interface RouteSchema {
  body?: any;          // Request body schema
  querystring?: any;   // Query parameters schema
  params?: any;        // URL parameters schema
  headers?: any;       // Request headers schema
  response?: {         // Response schemas by status code
    [statusCode: string]: any;
  };
}
```

**Example:**

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
    },
    querystring: {
      type: 'object',
      properties: {
        sendEmail: { type: 'boolean' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' }
        }
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (req, context) => {
  // body and querystring are already validated
  return {
    id: crypto.randomUUID(),
    name: context.body.name,
    email: context.body.email
  };
});
```

### RouteConstraints

```typescript
interface RouteConstraints {
  host?: string | string[];  // Allowed hosts
  version?: string;          // API version
  [key: string]: any;        // Custom constraints
}
```

**Example:**

```typescript
app.get('/api/users', {
  constraints: {
    host: 'api.example.com',
    version: '1.0'
  }
}, async () => {
  return { users: [] };
});
```

---

## RouteContext

Every route handler receives a context object with parsed request data.

```typescript
interface RouteContext {
  params: Record<string, string>;  // URL parameters
  query: Record<string, string>;   // Query string parameters
  body?: any;                      // Parsed request body
}
```

### Handler Signature

```typescript
type RouteHandler = (
  req: Request,
  context: RouteContext
) => Promise<any> | any;
```

**Example:**

```typescript
app.post('/api/users/:id/posts', async (req, context) => {
  // URL params: /api/users/123/posts
  const userId = context.params.id;  // "123"

  // Query string: ?sort=date&limit=10
  const sort = context.query.sort;   // "date"
  const limit = context.query.limit; // "10"

  // Request body (auto-parsed from JSON)
  const { title, content } = context.body;

  return {
    userId,
    postId: crypto.randomUUID(),
    title,
    content,
    createdAt: new Date().toISOString()
  };
});
```

---

## Plugin System

Encapsulate functionality in reusable plugins.

### app.register(plugin, options)

Register a plugin with the application.

**Parameters:**
- `plugin: OgelfyPlugin` - Plugin function
- `options?: any` - Plugin configuration

**Returns:** `Promise<void>`

**Plugin Signature:**

```typescript
type OgelfyPlugin = (
  app: Ogelfy,
  options?: any
) => void | Promise<void>;
```

**Example:**

```typescript
// Define plugin
async function authPlugin(app, options) {
  const { secret = 'default-secret' } = options;

  // Add authentication method to app
  app.decorate('authenticate', async (req) => {
    const token = req.headers.get('authorization');
    if (!token) {
      throw app.httpErrors.unauthorized('Missing token');
    }

    // Verify token (simplified)
    return { userId: 'user123', token };
  });

  // Add hook to protect routes
  if (options.protect) {
    app.addHook('preHandler', async (req, reply) => {
      req.user = await app.authenticate(req);
    });
  }
}

// Use plugin
await app.register(authPlugin, {
  secret: 'my-secret-key',
  protect: true
});

// Now app has .authenticate() method
app.get('/profile', async (req) => {
  return { user: req.user };
});
```

### Plugin Encapsulation

Plugins can be encapsulated to isolate their scope:

```typescript
import { fp } from '@security/ogelfy';

// Plugin with metadata
const myPlugin = fp(
  async function (app, options) {
    // Plugin code
    app.decorate('myMethod', () => 'hello');

    app.get('/plugin-route', async () => {
      return { from: 'plugin' };
    });
  },
  {
    name: 'my-plugin',
    version: '1.0.0',
    encapsulate: true // Isolate plugin context
  }
);

await app.register(myPlugin);
```

### app.hasPlugin(name)

Check if a plugin is registered.

**Parameters:**
- `name: string` - Plugin name

**Returns:** `boolean`

**Example:**

```typescript
if (!app.hasPlugin('auth')) {
  await app.register(authPlugin);
}
```

---

## Decorators

Extend application, request, and reply objects with custom properties.

### app.decorate(name, value)

Add a property or method to the app instance.

**Parameters:**
- `name: string` - Property name
- `value: any | (() => any)` - Value or factory function

**Returns:** `this`

**Example:**

```typescript
// Add a database connection
app.decorate('db', {
  async query(sql: string) {
    // Database logic
  }
});

// Use in routes
app.get('/users', async (req) => {
  const users = await app.db.query('SELECT * FROM users');
  return { users };
});

// Add a method
app.decorate('authenticate', async (token: string) => {
  // Auth logic
  return { userId: 'abc123' };
});
```

### app.decorateRequest(name, value)

Add a property to all request objects.

**Example:**

```typescript
app.decorateRequest('user', null);
app.decorateRequest('startTime', () => Date.now());

app.addHook('preHandler', async (req, reply) => {
  req.user = { id: 'user123' };
});

app.get('/profile', async (req) => {
  return { user: req.user };
});
```

### app.decorateReply(name, value)

Add a property or method to all reply objects.

**Example:**

```typescript
app.decorateReply('cache', function(ttl: number) {
  this.header('Cache-Control', `max-age=${ttl}`);
  return this;
});

app.get('/static', async (req, reply) => {
  reply.cache(3600); // 1 hour
  return { data: 'cached' };
});
```

### Checking Decorators

```typescript
app.hasDecorator('db')           // Check app decorator
app.hasRequestDecorator('user')  // Check request decorator
app.hasReplyDecorator('cache')   // Check reply decorator
```

---

## Lifecycle Hooks

Execute code at different stages of the request lifecycle.

### app.addHook(name, handler)

Register a lifecycle hook.

**Parameters:**
- `name: HookName` - Hook name
- `handler: HookHandler` - Async function to execute

**Returns:** `this`

### Hook Execution Order

```
1. onRequest      → First interception, before routing
2. preParsing     → Before request body parsing
3. preValidation  → Before schema validation
4. preHandler     → After validation, before handler (auth, permissions)
5. preSerialization → Transform response data
6. onSend         → Before response sent (compression, logging)
7. onResponse     → After response sent (metrics, cleanup)
8. onError        → When any error occurs
```

### Hook Signatures

```typescript
type HookHandler = (
  req: Request,
  reply: Reply
) => Promise<void> | void;

// For preSerialization
type PreSerializationHook = (
  req: Request,
  reply: Reply,
  payload: any
) => Promise<any> | any;

// For onError
type OnErrorHook = (
  req: Request,
  reply: Reply,
  error: Error
) => Promise<void> | void;
```

### Hook Examples

**onRequest - Logging**

```typescript
app.addHook('onRequest', async (req, reply) => {
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname}`);
});
```

**preHandler - Authentication**

```typescript
app.addHook('preHandler', async (req, reply) => {
  const token = req.headers.get('authorization');

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return; // Stop processing
  }

  req.user = await verifyToken(token);
});
```

**preSerialization - Transform Response**

```typescript
app.addHook('preSerialization', async (req, reply, payload) => {
  // Add timestamp to all responses
  return {
    ...payload,
    timestamp: new Date().toISOString()
  };
});
```

**onResponse - Metrics**

```typescript
app.addHook('onResponse', async (req, reply) => {
  const duration = Date.now() - req.startTime;
  console.log(`Request took ${duration}ms`);
});
```

**onError - Error Logging**

```typescript
app.addHook('onError', async (req, reply, error) => {
  console.error('Request failed:', {
    method: req.method,
    url: req.url,
    error: error.message
  });
});
```

### Route-Specific Hooks

Add hooks to individual routes:

```typescript
app.get('/protected', {
  hooks: {
    preHandler: async (req, reply) => {
      if (!req.headers.get('api-key')) {
        reply.status(403).send({ error: 'Forbidden' });
      }
    },
    onResponse: async (req, reply) => {
      console.log('Protected route accessed');
    }
  }
}, async () => {
  return { data: 'secret' };
});
```

---

## Reply Object

The reply object provides methods for building HTTP responses.

```typescript
class Reply {
  status(code: number): this;
  header(name: string, value: string): this;
  hasHeader(name: string): boolean;
  send(data: any): void;
  get statusCode(): number;
  get sent(): boolean;
  get response(): Response;
}
```

### reply.status(code)

Set the HTTP status code.

**Example:**

```typescript
app.get('/users/:id', async (req, context, reply) => {
  const user = await db.findUser(context.params.id);

  if (!user) {
    reply.status(404);
    return { error: 'User not found' };
  }

  return user;
});
```

### reply.header(name, value)

Set a response header.

**Example:**

```typescript
app.get('/download', async (req, reply) => {
  reply
    .status(200)
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', 'attachment; filename="file.pdf"');

  return fileData;
});
```

### reply.send(data)

Send the response immediately (stops further processing).

**Example:**

```typescript
app.get('/health', async (req, reply) => {
  reply.status(200).send({ status: 'ok' });
  // Handler stops here
});
```

### reply.hasHeader(name)

Check if a header has been set.

**Example:**

```typescript
if (!reply.hasHeader('Content-Type')) {
  reply.header('Content-Type', 'application/json');
}
```

---

## Schema Validation

Validate requests and responses with JSON Schema.

### app.addSchema(id, schema)

Add a shared schema that can be referenced in routes.

**Parameters:**
- `id: string` - Schema identifier
- `schema: any` - JSON Schema object

**Example:**

```typescript
// Define shared schema
app.addSchema('userSchema', {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', minLength: 3 },
    email: { type: 'string', format: 'email' }
  },
  required: ['id', 'name', 'email']
});

// Reference in routes
app.post('/users', {
  schema: {
    body: { $ref: 'userSchema#' },
    response: {
      200: { $ref: 'userSchema#' }
    }
  }
}, async (req, context) => {
  return {
    id: crypto.randomUUID(),
    ...context.body
  };
});
```

### Validation Features

**Type Coercion:**

```typescript
// Automatically convert query strings to correct types
app.get('/search', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'number' }, // "10" → 10
        active: { type: 'boolean' } // "true" → true
      }
    }
  }
}, async (req, context) => {
  const { limit, active } = context.query;
  // limit is a number, active is a boolean
  return { limit, active };
});
```

**Default Values:**

```typescript
app.get('/items', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'number', default: 1 },
        pageSize: { type: 'number', default: 20 }
      }
    }
  }
}, async (req, context) => {
  // page and pageSize have defaults if not provided
  return { page: context.query.page, pageSize: context.query.pageSize };
});
```

**Custom Formats:**

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const compiler = app.getSchemaCompiler();
addFormats(compiler.getAjv()); // Add email, uri, date formats
```

---

## Error Handling

### app.httpErrors

Factory methods for creating HTTP errors.

**Available Methods:**
- `badRequest(message?)` - 400
- `unauthorized(message?)` - 401
- `paymentRequired(message?)` - 402
- `forbidden(message?)` - 403
- `notFound(message?)` - 404
- `methodNotAllowed(message?)` - 405
- `notAcceptable(message?)` - 406
- `requestTimeout(message?)` - 408
- `conflict(message?)` - 409
- `gone(message?)` - 410
- `lengthRequired(message?)` - 411
- `preconditionFailed(message?)` - 412
- `payloadTooLarge(message?)` - 413
- `unsupportedMediaType(message?)` - 415
- `unprocessableEntity(message?)` - 422
- `tooManyRequests(message?)` - 429
- `internalServerError(message?)` - 500
- `notImplemented(message?)` - 501
- `badGateway(message?)` - 502
- `serviceUnavailable(message?)` - 503
- `gatewayTimeout(message?)` - 504

**Example:**

```typescript
import { httpErrors } from '@security/ogelfy';

app.get('/users/:id', async (req, context) => {
  const user = await db.findUser(context.params.id);

  if (!user) {
    throw httpErrors.notFound('User not found');
  }

  if (!user.isActive) {
    throw httpErrors.forbidden('User account is disabled');
  }

  return user;
});
```

### app.setErrorHandler(handler)

Set a custom error handler for all routes.

**Parameters:**
- `handler: ErrorHandler` - Error handling function

**ErrorHandler Signature:**

```typescript
type ErrorHandler = (
  error: Error,
  req: Request
) => Response | Promise<Response>;
```

**Example:**

```typescript
app.setErrorHandler((error, req) => {
  // Log error
  console.error('Request failed:', {
    method: req.method,
    url: req.url,
    error: error.message,
    stack: error.stack
  });

  // Custom error response
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500
    ? 'Internal Server Error'
    : error.message;

  return new Response(JSON.stringify({
    error: message,
    statusCode,
    timestamp: new Date().toISOString()
  }), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### app.setNotFoundHandler(handler)

Set a custom 404 handler.

**Parameters:**
- `handler: NotFoundHandler` - 404 handling function

**Example:**

```typescript
app.setNotFoundHandler((req) => {
  const url = new URL(req.url);

  return new Response(JSON.stringify({
    error: 'Not Found',
    message: `Route ${url.pathname} not found`,
    statusCode: 404
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

---

## Testing

### app.inject(options)

Inject a request for testing without starting an HTTP server.

**Parameters:**
- `options: InjectOptions` - Request configuration

**Returns:** `Promise<InjectResponse>`

**InjectOptions:**

```typescript
interface InjectOptions {
  method: string;           // HTTP method
  url: string;              // Request URL
  headers?: Record<string, string>; // Request headers
  body?: any;               // Request body (auto-stringified)
  query?: Record<string, string>; // Query parameters
}
```

**InjectResponse:**

```typescript
interface InjectResponse {
  statusCode: number;       // Response status code
  headers: Headers;         // Response headers
  body: string;             // Response body as string
  json(): any;              // Parse body as JSON
  text(): string;           // Get body as text
}
```

**Example:**

```typescript
import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '@security/ogelfy';

describe('User API', () => {
  const app = new Ogelfy();

  app.get('/users/:id', async (req, context) => {
    return { id: context.params.id, name: 'John' };
  });

  app.post('/users', async (req, context) => {
    return {
      id: crypto.randomUUID(),
      ...context.body
    };
  });

  test('GET /users/:id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/123'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: '123',
      name: 'John'
    });
  });

  test('POST /users', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'Alice', email: 'alice@example.com' }
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data.name).toBe('Alice');
    expect(data.id).toBeDefined();
  });

  test('with headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'Authorization': 'Bearer token123'
      }
    });

    expect(response.statusCode).toBe(200);
  });

  test('with query parameters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/search',
      query: { q: 'test', limit: '10' }
    });

    expect(response.statusCode).toBe(200);
  });
});
```

---

## Content Parsing

### app.addContentTypeParser(contentType, parser)

Add a custom content-type parser.

**Parameters:**
- `contentType: string` - MIME type to handle
- `parser: (req: Request) => Promise<any>` - Parser function

**Example:**

```typescript
// Custom XML parser
app.addContentTypeParser('application/xml', async (req) => {
  const text = await req.text();
  return parseXML(text); // Your XML parsing logic
});

app.post('/xml', async (req, context) => {
  // context.body contains parsed XML
  return { received: context.body };
});
```

### app.removeContentTypeParser(contentType)

Remove a content-type parser.

**Example:**

```typescript
app.removeContentTypeParser('application/xml');
```

### Built-in Parsers

- `application/json` - JSON parsing
- `text/*` - Text parsing
- `application/x-www-form-urlencoded` - Form parsing
- `multipart/form-data` - Multipart form parsing (file uploads)

---

## Serialization

### Fast JSON Serialization

Ogelfy uses `fast-json-stringify` for optimized response serialization.

**Example:**

```typescript
app.get('/users', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' }
          }
        }
      }
    }
  }
}, async () => {
  return await db.getAllUsers();
  // Response is serialized 3x faster with schema
});
```

---

## Server Lifecycle

### app.listen(options)

Start the HTTP server.

**Parameters:**
- `options: { port: number; hostname?: string }` - Server configuration

**Returns:** `Promise<Server>`

**Example:**

```typescript
const server = await app.listen({
  port: 3000,
  hostname: '0.0.0.0' // Listen on all interfaces
});

console.log('Server running on http://localhost:3000');
```

### app.close()

Stop the HTTP server.

**Example:**

```typescript
await app.close();
console.log('Server stopped');
```

---

## Type Definitions

Import TypeScript types for type-safe development:

```typescript
import type {
  RouteHandler,
  RouteContext,
  RouteOptions,
  RouteSchema,
  OgelfyOptions,
  OgelfyPlugin,
  HookName,
  HookHandler
} from '@security/ogelfy';
```

See [TypeScript Guide](./TYPESCRIPT.md) for advanced type usage.

---

## See Also

- [Getting Started Guide](./guides/GETTING_STARTED.md)
- [Routing Guide](./guides/ROUTING.md)
- [Validation Guide](./guides/VALIDATION.md)
- [Plugins Guide](./guides/PLUGINS.md)
- [Hooks Guide](./guides/HOOKS.md)
- [Testing Guide](./guides/TESTING.md)
