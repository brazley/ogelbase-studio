# Plugins Guide

Learn how to create and use plugins in Ogelfy to encapsulate reusable functionality.

## Table of Contents

- [What are Plugins](#what-are-plugins)
- [Creating Plugins](#creating-plugins)
- [Plugin Encapsulation](#plugin-encapsulation)
- [Plugin Metadata](#plugin-metadata)
- [Decorators](#decorators)
- [Plugin Hooks](#plugin-hooks)
- [Plugin Options](#plugin-options)
- [Plugin Examples](#plugin-examples)

## What are Plugins

Plugins allow you to:
- **Encapsulate** related functionality
- **Reuse** code across projects
- **Isolate** plugin context from parent
- **Share** functionality with the community
- **Organize** large applications

## Creating Plugins

### Basic Plugin

A plugin is an async function that receives the app instance:

```typescript
import type { Ogelfy } from '@security/ogelfy';

async function myPlugin(app: Ogelfy, options: any) {
  // Add routes
  app.get('/plugin-route', async () => {
    return { message: 'From plugin!' };
  });

  // Add hooks
  app.addHook('onRequest', async (req, reply) => {
    console.log('Plugin hook executed');
  });

  // Add decorators
  app.decorate('pluginMethod', () => {
    return 'Hello from plugin';
  });
}

// Register plugin
await app.register(myPlugin);
```

### Plugin with Options

Accept configuration when registering:

```typescript
interface DatabaseOptions {
  host: string;
  port: number;
  database: string;
}

async function databasePlugin(app: Ogelfy, options: DatabaseOptions) {
  const db = await connectDatabase({
    host: options.host,
    port: options.port,
    database: options.database
  });

  // Make database available to routes
  app.decorate('db', db);

  // Close connection on shutdown
  app.addHook('onClose', async () => {
    await db.close();
  });
}

// Register with options
await app.register(databasePlugin, {
  host: 'localhost',
  port: 5432,
  database: 'myapp'
});

// Use in routes
app.get('/users', async (req) => {
  return await app.db.query('SELECT * FROM users');
});
```

## Plugin Encapsulation

### Why Encapsulation

Encapsulation prevents plugins from affecting the parent scope:

```typescript
import { fp } from '@security/ogelfy';

// Plugin WITHOUT encapsulation
async function pluginA(app: Ogelfy) {
  app.decorate('myValue', 'A');

  app.get('/test', async () => {
    return { value: app.myValue };
  });
}

// Plugin WITH encapsulation
const pluginB = fp(async function(app: Ogelfy) {
  app.decorate('myValue', 'B'); // Only available in this plugin

  app.get('/test', async () => {
    return { value: app.myValue };
  });
});

await app.register(pluginA);
await app.register(pluginB);

// pluginB's decorator doesn't leak to parent
console.log(app.myValue); // 'A', not 'B'
```

### Encapsulated Plugin

Use `fp()` wrapper for encapsulation:

```typescript
import { fp } from '@security/ogelfy';

const authPlugin = fp(async function(app: Ogelfy, options: any) {
  // This decorator only exists within this plugin
  app.decorate('verifyToken', async (token: string) => {
    // Verify JWT token
    return decoded;
  });

  // Routes in this plugin can use the decorator
  app.get('/auth/profile', async (req) => {
    const token = req.headers.get('authorization');
    const user = await app.verifyToken(token);
    return { user };
  });
}, {
  name: 'auth-plugin',
  version: '1.0.0'
});

await app.register(authPlugin);

// app.verifyToken() is NOT available here (encapsulated)
```

### Breaking Encapsulation

Share decorators with parent:

```typescript
import { fp } from '@security/ogelfy';

const sharedPlugin = fp(async function(app: Ogelfy) {
  // This will be available to parent
  app.decorate('shared', 'value');
}, {
  encapsulate: false // Disable encapsulation
});

await app.register(sharedPlugin);

// Now app.shared is available
console.log(app.shared); // 'value'
```

## Plugin Metadata

### Adding Metadata

Provide metadata for plugin discovery:

```typescript
import { fp } from '@security/ogelfy';

const myPlugin = fp(async function(app: Ogelfy, options: any) {
  // Plugin code
}, {
  name: 'my-plugin',
  version: '1.0.0',
  dependencies: ['auth-plugin'], // Requires other plugins
  encapsulate: true
});
```

### Checking Plugin Load Status

```typescript
if (!app.hasPlugin('auth-plugin')) {
  await app.register(authPlugin);
}

// Now safe to use auth features
app.get('/protected', async (req) => {
  await app.authenticate(req);
  return { data: 'secret' };
});
```

## Decorators

### Server Decorators

Add properties/methods to the app instance:

```typescript
async function apiPlugin(app: Ogelfy, options: any) {
  // Add a utility method
  app.decorate('generateId', () => {
    return crypto.randomUUID();
  });

  // Add configuration
  app.decorate('config', {
    apiVersion: '1.0',
    maxRequestSize: 1024 * 1024
  });

  // Routes can now use these
  app.post('/items', async (req, context) => {
    return {
      id: app.generateId(),
      version: app.config.apiVersion,
      ...context.body
    };
  });
}
```

### Request Decorators

Add properties to request objects:

```typescript
async function requestIdPlugin(app: Ogelfy) {
  // Add property to all requests
  app.decorateRequest('id', '');
  app.decorateRequest('timestamp', 0);

  // Set values in hook
  app.addHook('onRequest', async (req, reply) => {
    req.id = crypto.randomUUID();
    req.timestamp = Date.now();
  });

  // Use in routes
  app.get('/test', async (req) => {
    return {
      requestId: req.id,
      timestamp: req.timestamp
    };
  });
}
```

### Reply Decorators

Add methods to reply objects:

```typescript
async function replyHelpersPlugin(app: Ogelfy) {
  // Add caching helper
  app.decorateReply('cache', function(ttl: number) {
    this.header('Cache-Control', `max-age=${ttl}`);
    return this;
  });

  // Add pagination helper
  app.decorateReply('paginate', function(data: any[], page: number, total: number) {
    this.header('X-Page', String(page));
    this.header('X-Total', String(total));
    return this;
  });

  // Use in routes
  app.get('/users', async (req, reply) => {
    const users = await db.getUsers();

    reply.cache(3600).paginate(users, 1, users.length);

    return { users };
  });
}
```

## Plugin Hooks

### Plugin-scoped Hooks

Hooks added in plugins only affect plugin routes:

```typescript
const loggingPlugin = fp(async function(app: Ogelfy) {
  // This hook only runs for routes in this plugin
  app.addHook('onRequest', async (req, reply) => {
    console.log('Plugin route accessed');
  });

  app.get('/plugin-route', async () => {
    return { message: 'hello' };
  });
});

await app.register(loggingPlugin);

// This route won't trigger the plugin's hook
app.get('/other-route', async () => {
  return { message: 'world' };
});
```

### Global Hooks from Plugins

```typescript
async function globalLoggingPlugin(app: Ogelfy) {
  // Add hook before any routes
  app.addHook('onRequest', async (req, reply) => {
    const url = new URL(req.url);
    console.log(`${req.method} ${url.pathname}`);
  });
}

// Register early, before routes
await app.register(globalLoggingPlugin);
```

## Plugin Options

### Default Options

Provide defaults for plugin options:

```typescript
interface AuthOptions {
  secret: string;
  expiresIn?: string;
  algorithm?: string;
}

async function authPlugin(app: Ogelfy, options: AuthOptions) {
  const config = {
    expiresIn: '7d',
    algorithm: 'HS256',
    ...options // User options override defaults
  };

  if (!config.secret) {
    throw new Error('Auth plugin requires a secret');
  }

  app.decorate('auth', {
    sign: (payload: any) => jwt.sign(payload, config.secret, {
      expiresIn: config.expiresIn,
      algorithm: config.algorithm
    }),
    verify: (token: string) => jwt.verify(token, config.secret)
  });
}

await app.register(authPlugin, {
  secret: process.env.JWT_SECRET!
  // Uses default expiresIn and algorithm
});
```

### Validating Options

```typescript
interface DatabaseOptions {
  host: string;
  port: number;
  ssl?: boolean;
}

async function databasePlugin(app: Ogelfy, options: DatabaseOptions) {
  // Validate required options
  if (!options.host) {
    throw new Error('Database plugin requires host option');
  }

  if (!options.port || options.port < 1 || options.port > 65535) {
    throw new Error('Database plugin requires valid port option');
  }

  // Use options
  const db = await connect(options);
  app.decorate('db', db);
}
```

## Plugin Examples

### Authentication Plugin

```typescript
import { fp } from '@security/ogelfy';
import * as jwt from 'jsonwebtoken';

interface AuthOptions {
  secret: string;
  publicRoutes?: string[];
}

const authPlugin = fp(async function(app: Ogelfy, options: AuthOptions) {
  const { secret, publicRoutes = [] } = options;

  // Add auth methods
  app.decorate('authenticate', async (token: string) => {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      throw app.httpErrors.unauthorized('Invalid token');
    }
  });

  app.decorate('signToken', (payload: any) => {
    return jwt.sign(payload, secret, { expiresIn: '7d' });
  });

  // Add request decorator for user
  app.decorateRequest('user', null);

  // Authenticate on all requests
  app.addHook('preHandler', async (req, reply) => {
    const url = new URL(req.url);

    // Skip public routes
    if (publicRoutes.includes(url.pathname)) {
      return;
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing authorization' });
      return;
    }

    const token = authHeader.slice(7);
    req.user = await app.authenticate(token);
  });

  // Add auth routes
  app.post('/auth/login', async (req, context) => {
    const { email, password } = context.body;

    const user = await db.verifyCredentials(email, password);
    if (!user) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    const token = app.signToken({ userId: user.id, email: user.email });

    return { token, user };
  });

  app.get('/auth/me', async (req) => {
    return { user: req.user };
  });
}, {
  name: 'auth',
  version: '1.0.0'
});

// Use plugin
await app.register(authPlugin, {
  secret: process.env.JWT_SECRET!,
  publicRoutes: ['/auth/login', '/health']
});
```

### Database Plugin

```typescript
import { fp } from '@security/ogelfy';

interface DbOptions {
  connectionString: string;
}

const databasePlugin = fp(async function(app: Ogelfy, options: DbOptions) {
  // Connect to database
  const db = await connectToDatabase(options.connectionString);

  // Make available to routes
  app.decorate('db', db);

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await db.close();
    console.log('Database connection closed');
  });

  // Health check route
  app.get('/health/db', async () => {
    try {
      await db.ping();
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      throw app.httpErrors.serviceUnavailable('Database unavailable');
    }
  });
}, {
  name: 'database',
  version: '1.0.0'
});

await app.register(databasePlugin, {
  connectionString: process.env.DATABASE_URL!
});
```

### CORS Plugin

```typescript
interface CorsOptions {
  origin?: string | string[];
  methods?: string[];
  credentials?: boolean;
}

async function corsPlugin(app: Ogelfy, options: CorsOptions) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials = false
  } = options;

  app.addHook('onRequest', async (req, reply) => {
    // Set CORS headers
    reply.header('Access-Control-Allow-Origin', Array.isArray(origin) ? origin.join(', ') : origin);
    reply.header('Access-Control-Allow-Methods', methods.join(', '));
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (credentials) {
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
  });

  // Handle preflight
  app.options('/*', async (req, reply) => {
    reply.status(204).send();
  });
}

await app.register(corsPlugin, {
  origin: ['https://example.com', 'https://app.example.com'],
  credentials: true
});
```

### Rate Limiting Plugin

```typescript
interface RateLimitOptions {
  max: number;        // Max requests
  window: number;     // Time window in ms
}

async function rateLimitPlugin(app: Ogelfy, options: RateLimitOptions) {
  const { max, window } = options;
  const requests = new Map<string, number[]>();

  app.addHook('preHandler', async (req, reply) => {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();

    // Get request times for this IP
    const times = requests.get(ip) || [];

    // Remove old requests outside window
    const recentTimes = times.filter(time => now - time < window);

    if (recentTimes.length >= max) {
      reply.status(429).send({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((recentTimes[0] + window - now) / 1000)
      });
      return;
    }

    // Record this request
    recentTimes.push(now);
    requests.set(ip, recentTimes);
  });

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of requests.entries()) {
      const recentTimes = times.filter(time => now - time < window);
      if (recentTimes.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, recentTimes);
      }
    }
  }, window);
}

await app.register(rateLimitPlugin, {
  max: 100,           // 100 requests
  window: 60 * 1000   // per minute
});
```

## Best Practices

### 1. Use Encapsulation

```typescript
// ✅ Good - Encapsulated
const plugin = fp(async function(app: Ogelfy) {
  app.decorate('helper', () => {});
}, { encapsulate: true });

// ❌ Bad - Pollutes parent scope
async function plugin(app: Ogelfy) {
  app.decorate('helper', () => {});
}
```

### 2. Provide Metadata

```typescript
// ✅ Good - Clear metadata
const plugin = fp(async function(app: Ogelfy) {
  // ...
}, {
  name: 'my-plugin',
  version: '1.0.0',
  dependencies: ['auth']
});
```

### 3. Validate Options

```typescript
// ✅ Good - Validate early
async function plugin(app: Ogelfy, options: any) {
  if (!options.required) {
    throw new Error('Option "required" is required');
  }
  // ...
}
```

### 4. Handle Cleanup

```typescript
// ✅ Good - Clean up resources
async function plugin(app: Ogelfy) {
  const resource = await allocate();

  app.addHook('onClose', async () => {
    await resource.cleanup();
  });
}
```

## See Also

- [Hooks Guide](./HOOKS.md)
- [API Reference](../API.md)
- [Getting Started](./GETTING_STARTED.md)
