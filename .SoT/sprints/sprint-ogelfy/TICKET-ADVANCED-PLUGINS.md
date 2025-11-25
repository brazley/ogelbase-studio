# Ticket OGELFY-ADVANCED: Advanced Plugin Architecture + Full Lifecycle Hooks

**Sprint**: Ogelfy Framework Development
**Created**: 2025-11-22
**Agent**: Elena Rodriguez (Backend Systems Architect)
**Status**: Ready to Start
**Priority**: P0 (Foundation for plugin ecosystem)
**Dependencies**: OGELFY-01 (basic framework)
**Estimated Effort**: 4-6 hours

---

## Objective

Extend Ogelfy with Fastify-level plugin system including:
1. **10 lifecycle hooks** (complete request/response pipeline)
2. **Plugin encapsulation** (isolated state per plugin)
3. **Decorator system** (extend app/request/reply)
4. **Plugin metadata** (name, version, dependencies)
5. **Dependency management** (plugin load ordering)

---

## Part 1: Full Lifecycle Hooks System

### Hook Execution Order

```
onRequest → preParsing → preValidation → preHandler →
  [handler] → preSerialization → onSend → onResponse

[onError - when errors occur]
[onTimeout - when request times out]
```

### Implementation

**Location**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/index.ts`

```typescript
export type HookName =
  | 'onRequest'          // Called on every request (first)
  | 'preParsing'         // Before body parsing
  | 'preValidation'      // Before validation
  | 'preHandler'         // Before route handler
  | 'preSerialization'   // Before response serialization
  | 'onSend'             // Before sending response
  | 'onResponse'         // After response sent
  | 'onError'            // When error occurs
  | 'onTimeout';         // When request times out

export type HookHandler = (
  req: Request,
  reply?: Reply,
  payload?: any
) => Promise<void> | void;

class Ogelfy {
  private hooks: Map<HookName, HookHandler[]> = new Map();

  addHook(name: HookName, handler: HookHandler) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name)!.push(handler);
  }

  async runHooks(name: HookName, req: Request, reply?: Reply, payload?: any) {
    const handlers = this.hooks.get(name) || [];
    for (const handler of handlers) {
      await handler(req, reply, payload);
    }
  }
}
```

### Route-Level Hooks

Routes should support hook attachment:

```typescript
app.get('/user', {
  onRequest: [authHook, rateLimitHook],
  preHandler: [validateHook]
}, handler);
```

### Hook Execution in Request Pipeline

Update `listen()` method to run hooks in proper order:

```typescript
fetch: async (req) => {
  const reply = createReply();

  try {
    // Hook: onRequest
    await this.runHooks('onRequest', req, reply);

    // Hook: preParsing (if body exists)
    await this.runHooks('preParsing', req, reply);

    // Parse body if needed
    const body = await parseBody(req);

    // Hook: preValidation
    await this.runHooks('preValidation', req, reply, body);

    // Validate if schema provided
    await validateRequest(req, body);

    // Find route
    const route = this.router.find(req.method, url.pathname);
    if (!route) {
      return new Response('Not Found', { status: 404 });
    }

    // Hook: preHandler
    await this.runHooks('preHandler', req, reply);

    // Execute route handler
    const result = await route.handler(req, reply);

    // Hook: preSerialization
    await this.runHooks('preSerialization', req, reply, result);

    // Serialize response
    const serialized = JSON.stringify(result);

    // Hook: onSend
    await this.runHooks('onSend', req, reply, serialized);

    // Send response
    const response = new Response(serialized, {
      status: reply.statusCode || 200,
      headers: reply.headers
    });

    // Hook: onResponse (after response sent)
    setImmediate(() => this.runHooks('onResponse', req, reply));

    return response;

  } catch (error) {
    // Hook: onError
    await this.runHooks('onError', req, reply, error);

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

---

## Part 2: Plugin Architecture with Encapsulation

### Plugin System Design

**Location**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/plugin-system.ts`

```typescript
export interface PluginMetadata {
  name: string;
  version?: string;
  dependencies?: string[];
}

export interface Plugin {
  (app: Ogelfy, opts?: any): Promise<void> | void;
  [Symbol.for('plugin-meta')]?: PluginMetadata;
}

class Ogelfy {
  private plugins: Set<string> = new Set();
  private decorators = {
    request: new Map<string, any>(),
    reply: new Map<string, any>(),
    server: new Map<string, any>()
  };

  async register(plugin: Plugin, opts?: any) {
    const meta = plugin[Symbol.for('plugin-meta')];

    // Check if already registered
    if (meta?.name && this.plugins.has(meta.name)) {
      throw new Error(`Plugin ${meta.name} already registered`);
    }

    // Check dependencies
    if (meta?.dependencies) {
      for (const dep of meta.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    // Run plugin
    await plugin(this, opts);

    // Mark as registered
    if (meta?.name) {
      this.plugins.add(meta.name);
    }
  }

  // Decorator system
  decorate(name: string, value: any) {
    this.decorators.server.set(name, value);
    (this as any)[name] = value;
  }

  decorateRequest(name: string, value: any) {
    this.decorators.request.set(name, value);
  }

  decorateReply(name: string, value: any) {
    this.decorators.reply.set(name, value);
  }

  // Apply decorators to request/reply objects
  private applyDecorators(req: any, reply: any) {
    for (const [name, value] of this.decorators.request) {
      req[name] = typeof value === 'function' ? value.bind(req) : value;
    }

    for (const [name, value] of this.decorators.reply) {
      reply[name] = typeof value === 'function' ? value.bind(reply) : value;
    }
  }
}
```

### Plugin Helper Function

```typescript
export function plugin(fn: Plugin, meta: PluginMetadata): Plugin {
  fn[Symbol.for('plugin-meta')] = meta;
  return fn;
}
```

### Plugin Usage Examples

**Example 1: Database Plugin**

```typescript
const dbPlugin = plugin(async (app, opts) => {
  const db = await connectDB(opts.url);

  // Decorate server with db instance
  app.decorate('db', db);

  // Add cleanup hook
  app.addHook('onClose', async () => {
    await db.disconnect();
  });
}, {
  name: 'database-plugin',
  version: '1.0.0'
});

// Register plugin
app.register(dbPlugin, { url: 'postgresql://localhost/mydb' });

// Now app.db is available
app.get('/users', async (req, reply) => {
  const users = await app.db.query('SELECT * FROM users');
  return users;
});
```

**Example 2: Auth Plugin with Dependencies**

```typescript
const authPlugin = plugin(async (app, opts) => {
  // This plugin depends on database-plugin

  app.decorateRequest('user', null);

  app.addHook('preHandler', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      reply.status(401);
      throw new Error('Unauthorized');
    }

    // Use db from database-plugin
    const user = await app.db.query('SELECT * FROM users WHERE token = ?', [token]);
    req.user = user;
  });
}, {
  name: 'auth-plugin',
  version: '1.0.0',
  dependencies: ['database-plugin']  // Must load after database-plugin
});
```

**Example 3: Logger Plugin**

```typescript
const loggerPlugin = plugin(async (app, opts) => {
  const logger = createLogger(opts);

  app.decorate('log', logger);

  app.addHook('onRequest', async (req, reply) => {
    req.startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const duration = Date.now() - req.startTime;
    app.log.info({
      method: req.method,
      path: req.url,
      status: reply.statusCode,
      duration
    });
  });
}, {
  name: 'logger-plugin',
  version: '1.0.0'
});
```

---

## Deliverables

### Files to Create/Modify

1. **`src/index.ts`** - Add full lifecycle hooks system (~200 lines)
2. **`src/plugin-system.ts`** - New file with plugin architecture (~300 lines)
3. **`src/types.ts`** - Add hook and plugin type definitions (~100 lines)
4. **`__tests__/hooks.test.ts`** - Test all 10 hooks (~200 lines)
5. **`__tests__/plugins.test.ts`** - Test plugin system (~300 lines)
6. **`examples/plugins/`** - Example plugins directory
   - `examples/plugins/database.ts` - Database plugin example
   - `examples/plugins/auth.ts` - Auth plugin example
   - `examples/plugins/logger.ts` - Logger plugin example

### Expected Line Count

- **Implementation**: ~600 lines
- **Tests**: ~500 lines
- **Examples**: ~300 lines
- **Total**: ~1,400 lines

---

## Acceptance Criteria

### Functional Requirements

- [ ] All 10 lifecycle hooks working in correct order
- [ ] Hooks can be added globally (app-level)
- [ ] Hooks can be added per-route
- [ ] Plugin registration with metadata
- [ ] Plugin dependency checking
- [ ] Prevent duplicate plugin registration
- [ ] Decorator system for app/request/reply
- [ ] Decorators applied to each request/reply
- [ ] Plugin encapsulation (isolated state)

### Quality Requirements

- [ ] >85% test coverage for hooks
- [ ] >85% test coverage for plugin system
- [ ] All tests passing with Bun
- [ ] Zero TypeScript `any` types
- [ ] JSDoc comments on all public APIs
- [ ] Type inference working (decorators typed)

### Example Requirements

- [ ] 3 working example plugins
- [ ] Examples demonstrate decorator usage
- [ ] Examples demonstrate dependency ordering
- [ ] Examples demonstrate hook usage
- [ ] All examples tested and working

---

## Testing Requirements

### Hook Tests (`__tests__/hooks.test.ts`)

```typescript
describe('Lifecycle Hooks', () => {
  describe('Hook Execution Order', () => {
    it('should execute hooks in correct order');
    it('should execute onRequest first');
    it('should execute onResponse last');
    it('should skip preParsing for GET requests');
  });

  describe('Error Handling', () => {
    it('should call onError hook on error');
    it('should call onTimeout on timeout');
    it('should not run remaining hooks after error');
  });

  describe('Route-Level Hooks', () => {
    it('should execute route-specific hooks');
    it('should execute global hooks before route hooks');
    it('should execute multiple hooks in order');
  });

  describe('Hook Context', () => {
    it('should pass request to hooks');
    it('should pass reply to hooks');
    it('should pass payload to hooks');
  });
});
```

### Plugin Tests (`__tests__/plugins.test.ts`)

```typescript
describe('Plugin System', () => {
  describe('Plugin Registration', () => {
    it('should register plugin');
    it('should call plugin function with app and opts');
    it('should support async plugins');
    it('should prevent duplicate registration');
  });

  describe('Plugin Dependencies', () => {
    it('should load plugins in dependency order');
    it('should throw on missing dependency');
    it('should handle complex dependency chains');
  });

  describe('Decorator System', () => {
    it('should decorate server object');
    it('should decorate request object');
    it('should decorate reply object');
    it('should apply decorators to each request');
    it('should support function decorators');
  });

  describe('Plugin Encapsulation', () => {
    it('should isolate plugin state');
    it('should not leak state between plugins');
    it('should support plugin options');
  });
});
```

---

## Reference Patterns

### Fastify Hooks

**Source**: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/hooks.js`

Key patterns:
- Hook storage in arrays per hook name
- Async execution with early termination on error
- Reply object mutation for status/headers
- Hook context binding

### Fastify Plugins

**Source**: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/plugin-utils.js`

Key patterns:
- avvio-based plugin loading
- Metadata storage via symbols
- Dependency graph resolution
- Encapsulation boundaries

### Fastify Decorators

**Source**: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/decorate.js`

Key patterns:
- Decorator validation (no overwrite)
- Getter/setter support
- Type safety via TypeScript declaration merging

---

## Performance Considerations

1. **Hook Overhead**: Minimize allocation in hook execution path
2. **Plugin Registration**: Do all dependency checking upfront, not per-request
3. **Decorator Application**: Cache decorator application, don't recreate per request
4. **Memory**: Use WeakMaps for request-scoped data if needed

---

## Success Criteria

**This ticket is complete when**:

1. All 10 lifecycle hooks implemented and tested
2. Plugin system supports registration, dependencies, metadata
3. Decorator system working for app/request/reply
4. >85% test coverage
5. 3 working example plugins
6. All tests passing
7. Performance impact <10% vs basic routing
8. Documentation complete with examples

---

## Agent Context: Elena Rodriguez

**Why Elena**: This is sophisticated backend framework architecture. You're designing the plugin lifecycle system that other developers will build upon. This requires:

- Deep understanding of framework design patterns
- Experience with Fastify's plugin architecture
- Knowledge of async execution flow and error handling
- Expertise in type-safe decorator patterns
- Ability to design extensible, production-ready APIs

**Approach**:

1. **Study Fastify patterns** - Review how Fastify implements hooks and plugins
2. **Design before coding** - Sketch out the execution flow and data structures
3. **Build incrementally** - Start with hook system, then add plugins, then decorators
4. **Test as you go** - Write tests alongside implementation
5. **Focus on DX** - Developer experience is critical for a framework

**Key Decisions**:

- Use Map for hook storage (fast lookup, ordered execution)
- Use Symbol for plugin metadata (no collision with user properties)
- Use Set for tracking registered plugins (fast duplicate check)
- Support both sync and async hooks (flexibility)
- Execute hooks serially (predictable order)

**Philosophy**: Build a plugin system that feels invisible when you don't need it, but powerful when you do. Think Fastify's "extensibility without complexity" design goal.

---

**Created**: 2025-11-22
**Agent**: Elena Rodriguez
**Estimated**: 4-6 hours
**Status**: Ready to Start
**Priority**: P0
