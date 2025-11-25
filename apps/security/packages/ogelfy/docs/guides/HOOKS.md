# Hooks Guide

Master Ogelfy's lifecycle hooks system for intercepting and modifying request/response flow.

## Hook Execution Order

Hooks run in this order during request processing:

```
1. onRequest        → First interception, before routing
2. preParsing       → Before request body parsing
3. preValidation    → Before schema validation
4. preHandler       → After validation, before handler (auth, permissions)
5. [HANDLER]        → Your route handler executes
6. preSerialization → Transform response data
7. onSend           → Before response sent (compression, logging)
8. onResponse       → After response sent (metrics, cleanup)
9. onError          → When any error occurs (anytime)
```

## Hook Types

### onRequest

**When**: First hook, before routing
**Use for**: Request logging, early authentication checks

```typescript
app.addHook('onRequest', async (req, reply) => {
  const url = new URL(req.url);
  console.log(`→ ${req.method} ${url.pathname}`);

  // Can short-circuit the request
  if (req.headers.get('x-maintenance') === 'true') {
    reply.status(503).send({ error: 'Maintenance mode' });
  }
});
```

### preParsing

**When**: Before body parsing
**Use for**: Raw body access, custom parsing

```typescript
app.addHook('preParsing', async (req, reply) => {
  // Access raw request before parsing
  const contentType = req.headers.get('content-type');

  if (contentType?.includes('application/xml')) {
    // Handle XML before default parser
    const body = await req.text();
    req.body = parseXML(body);
  }
});
```

### preValidation

**When**: After parsing, before schema validation
**Use for**: Data sanitization, preprocessing

```typescript
app.addHook('preValidation', async (req, reply) => {
  // Sanitize input before validation
  if (req.context?.body) {
    req.context.body.email = req.context.body.email?.toLowerCase();
  }
});
```

### preHandler

**When**: After validation, before route handler
**Use for**: Authentication, authorization, permissions

```typescript
app.addHook('preHandler', async (req, reply) => {
  const token = req.headers.get('authorization');

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return; // Stops processing
  }

  // Verify token and attach user
  req.user = await verifyToken(token);

  // Check permissions
  if (!req.user.isActive) {
    reply.status(403).send({ error: 'Account disabled' });
  }
});
```

### preSerialization

**When**: After handler, before JSON serialization
**Use for**: Response transformation, data masking

```typescript
app.addHook('preSerialization', async (req, reply, payload) => {
  // Transform response data
  return {
    ...payload,
    timestamp: new Date().toISOString(),
    requestId: req.id
  };
});

// Remove sensitive fields
app.addHook('preSerialization', async (req, reply, payload) => {
  if (payload.user) {
    delete payload.user.password;
    delete payload.user.salt;
  }
  return payload;
});
```

### onSend

**When**: Before response sent to client
**Use for**: Compression, final logging, response headers

```typescript
app.addHook('onSend', async (req, reply) => {
  // Add custom headers
  reply.header('X-Request-Id', req.id);
  reply.header('X-Response-Time', `${Date.now() - req.startTime}ms`);

  // Log response
  console.log(`← ${reply.statusCode} (${Date.now() - req.startTime}ms)`);
});
```

### onResponse

**When**: After response sent (non-blocking)
**Use for**: Metrics, analytics, cleanup

```typescript
app.addHook('onResponse', async (req, reply) => {
  // Log to analytics (doesn't block response)
  await analytics.track({
    method: req.method,
    path: new URL(req.url).pathname,
    statusCode: reply.statusCode,
    duration: Date.now() - req.startTime,
    userId: req.user?.id
  });

  // Cleanup temporary resources
  if (req.tempFiles) {
    await cleanupTempFiles(req.tempFiles);
  }
});
```

### onError

**When**: Any error occurs during request processing
**Use for**: Error logging, error transformation

```typescript
app.addHook('onError', async (req, reply, error) => {
  // Log error with context
  console.error('Request error:', {
    method: req.method,
    url: req.url,
    error: error.message,
    stack: error.stack,
    userId: req.user?.id
  });

  // Send to error tracking service
  await errorTracker.captureException(error, {
    user: req.user,
    request: {
      method: req.method,
      url: req.url
    }
  });
});
```

## Route-Specific Hooks

Add hooks to individual routes:

```typescript
app.get('/admin', {
  hooks: {
    preHandler: async (req, reply) => {
      if (!req.user?.isAdmin) {
        reply.status(403).send({ error: 'Admin only' });
      }
    },
    onResponse: async (req, reply) => {
      console.log('Admin route accessed');
    }
  }
}, async (req) => {
  return { admin: true, user: req.user };
});
```

Multiple hooks on same route:

```typescript
app.post('/users', {
  hooks: {
    preValidation: [
      async (req, reply) => {
        // Sanitize input
        req.context.body.email = req.context.body.email.toLowerCase();
      },
      async (req, reply) => {
        // Check for duplicates
        const exists = await db.userExists(req.context.body.email);
        if (exists) {
          reply.status(409).send({ error: 'User already exists' });
        }
      }
    ],
    preSerialization: async (req, reply, payload) => {
      // Remove sensitive data
      delete payload.password;
      return payload;
    }
  }
}, createUserHandler);
```

## Hook Patterns

### Authentication Hook

```typescript
async function authHook(req: Request, reply: Reply) {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
    return;
  }

  try {
    const token = authHeader.slice(7);
    req.user = await jwt.verify(token, process.env.JWT_SECRET!);
  } catch (error) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }
}

// Apply to all routes
app.addHook('preHandler', authHook);

// Or specific routes
app.get('/protected', { hooks: { preHandler: authHook } }, handler);
```

### Request Logging Hook

```typescript
app.addHook('onRequest', async (req, reply) => {
  req.id = crypto.randomUUID();
  req.startTime = Date.now();

  const url = new URL(req.url);
  console.log(`[${req.id}] ${req.method} ${url.pathname}`);
});

app.addHook('onResponse', async (req, reply) => {
  const duration = Date.now() - req.startTime;
  console.log(`[${req.id}] ${reply.statusCode} (${duration}ms)`);
});
```

### Rate Limiting Hook

```typescript
const rateLimiter = new Map<string, number[]>();

app.addHook('preHandler', async (req, reply) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const window = 60 * 1000; // 1 minute
  const max = 100; // Max requests

  const requests = rateLimiter.get(ip) || [];
  const recentRequests = requests.filter(time => now - time < window);

  if (recentRequests.length >= max) {
    reply.status(429).send({
      error: 'Too Many Requests',
      retryAfter: Math.ceil((recentRequests[0] + window - now) / 1000)
    });
    return;
  }

  recentRequests.push(now);
  rateLimiter.set(ip, recentRequests);
});
```

### Response Caching Hook

```typescript
const cache = new Map<string, { data: any; expires: number }>();

app.addHook('preHandler', async (req, reply) => {
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const cacheKey = url.pathname + url.search;
  const cached = cache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    reply.status(200).send(cached.data);
  }
});

app.addHook('onSend', async (req, reply) => {
  if (req.method === 'GET' && reply.statusCode === 200) {
    const url = new URL(req.url);
    const cacheKey = url.pathname + url.search;

    cache.set(cacheKey, {
      data: reply.response,
      expires: Date.now() + 60000 // 1 minute TTL
    });
  }
});
```

### Data Sanitization Hook

```typescript
app.addHook('preValidation', async (req, reply) => {
  if (!req.context?.body) return;

  const { body } = req.context;

  // Trim strings
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      body[key] = value.trim();
    }
  }

  // Convert emails to lowercase
  if (body.email && typeof body.email === 'string') {
    body.email = body.email.toLowerCase();
  }

  // Remove null/undefined values
  for (const key in body) {
    if (body[key] === null || body[key] === undefined) {
      delete body[key];
    }
  }
});
```

## Hook Best Practices

### 1. Order Matters

```typescript
// ✅ Correct - Auth before business logic
app.addHook('preHandler', authHook);
app.addHook('preHandler', businessLogicHook);

// ❌ Wrong - Business logic might run without auth
app.addHook('preHandler', businessLogicHook);
app.addHook('preHandler', authHook);
```

### 2. Short-Circuit with reply.send()

```typescript
app.addHook('preHandler', async (req, reply) => {
  if (!authorized) {
    reply.status(403).send({ error: 'Forbidden' });
    return; // Important: return after send
  }
});
```

### 3. Handle Errors Properly

```typescript
app.addHook('preHandler', async (req, reply) => {
  try {
    req.user = await verifyToken(req.headers.get('authorization'));
  } catch (error) {
    // Don't throw - use reply.send() for controlled errors
    reply.status(401).send({ error: 'Invalid token' });
  }
});
```

### 4. Use Route-Specific Hooks for Special Cases

```typescript
// Global auth
app.addHook('preHandler', authHook);

// Special handling for specific route
app.post('/webhook', {
  hooks: {
    preHandler: async (req, reply) => {
      // Skip global auth, use webhook signature instead
      const signature = req.headers.get('x-webhook-signature');
      if (!verifyWebhookSignature(signature)) {
        reply.status(401).send({ error: 'Invalid signature' });
      }
    }
  }
}, webhookHandler);
```

### 5. Cleanup in onResponse

```typescript
app.addHook('preHandler', async (req, reply) => {
  // Create temporary file
  req.tempFile = await createTempFile();
});

app.addHook('onResponse', async (req, reply) => {
  // Clean up after response sent
  if (req.tempFile) {
    await deleteTempFile(req.tempFile);
  }
});
```

## Advanced Patterns

### Conditional Hooks

```typescript
app.addHook('preHandler', async (req, reply) => {
  const url = new URL(req.url);

  // Only auth for /api routes
  if (url.pathname.startsWith('/api')) {
    await authenticateRequest(req, reply);
  }

  // Only rate limit for POST requests
  if (req.method === 'POST') {
    await checkRateLimit(req, reply);
  }
});
```

### Async Hook Dependencies

```typescript
app.addHook('onRequest', async (req, reply) => {
  // Load user session
  req.session = await loadSession(req);
});

app.addHook('preHandler', async (req, reply) => {
  // Depends on session from onRequest
  if (req.session?.user) {
    req.user = await db.getUser(req.session.user.id);
  }
});
```

### Plugin Hooks

```typescript
async function metricsPlugin(app: Ogelfy) {
  const metrics = { requests: 0, errors: 0 };

  app.addHook('onRequest', async () => {
    metrics.requests++;
  });

  app.addHook('onError', async () => {
    metrics.errors++;
  });

  app.get('/metrics', async () => {
    return metrics;
  });
}

await app.register(metricsPlugin);
```

## See Also

- [Plugins Guide](./PLUGINS.md)
- [API Reference](../API.md)
- [Getting Started](./GETTING_STARTED.md)
