# ELENA RODRIGUEZ - Backend Systems Architecture Handoff

**Mission**: Build Fastify-level plugin architecture + 10+ lifecycle hooks for Ogelfy

**Date**: 2025-11-22
**TPM**: Dylan Torres
**Estimated Effort**: 12-16 hours (complex backend architecture work)
**Priority**: P0 (Critical framework upgrade)

---

## Context & Background

**What is Ogelfy?**
Ogelfy is a high-performance, Bun-native web framework inspired by Fastify's architecture. Currently it's minimal (~150 lines), with basic routing, simple plugins, and basic validation.

**What We're Building Now**:
You're upgrading Ogelfy from a minimal framework to a production-grade system with:
1. **Advanced Plugin Architecture** - Full encapsulation, metadata, dependencies
2. **Complete Lifecycle Hooks** - 10+ hooks covering entire request lifecycle
3. **Decorator System** - Extend server/request/reply objects safely
4. **Plugin Registry** - Dependency management, loading order, isolated contexts

**Why This Matters**:
This transforms Ogelfy from a toy framework into a production backend system. The plugin architecture needs to support complex distributed systems patterns - proper isolation, dependency injection, and lifecycle management.

---

## Current State

**Working Directory**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/`

**Existing Files**:
```
src/
├── index.ts          # 66 lines - Basic Ogelfy class
├── router.ts         # 66 lines - Simple path matching
├── types.ts          # 11 lines - Basic types
├── plugins.ts        # 3 lines - Placeholder
└── validation.ts     # 5 lines - Minimal validation
```

**Current Capabilities**:
- ✅ Basic HTTP routing (GET, POST, PUT, DELETE)
- ✅ Path parameter extraction (`:id` syntax)
- ✅ Simple plugin registration (no isolation)
- ✅ Basic Bun.serve() integration

**What's Missing** (Your Work):
- ❌ Plugin encapsulation (isolated state)
- ❌ Plugin metadata & dependencies
- ❌ Advanced lifecycle hooks (only have 4 basic ones)
- ❌ Decorator system
- ❌ Plugin registry with dependency resolution

---

## Technical Requirements

### Part 1: Advanced Plugin Architecture

**Goal**: Upgrade `src/plugins.ts` from 3 lines to ~500 lines with full plugin system.

#### 1.1 Plugin Encapsulation
```typescript
// Plugins get isolated context - changes don't leak to parent
app.register(async (instance, opts) => {
  // This instance is isolated from parent
  instance.get('/private', handler);

  // Decorators only visible to this plugin and its children
  instance.decorate('utility', () => {});
});

// Parent app doesn't see '/private' route or 'utility' decorator
```

**Key Pattern**: Each plugin gets its own Ogelfy instance that inherits from parent but has isolated state. Like Fastify's avvio-based encapsulation.

#### 1.2 Plugin Metadata & Dependencies
```typescript
import fp from 'fastify-plugin'; // (we'll build our own version)

const plugin = fp(async (app, opts) => {
  app.decorate('db', dbConnection);
}, {
  name: 'database-plugin',
  fastify: '>=4.0.0', // Version constraint
  dependencies: ['other-plugin'] // Load order guarantee
});
```

**Features Needed**:
- Plugin name registration (for dependency references)
- Version constraints (semantic version checking)
- Dependency array (load order management)
- Circular dependency detection

#### 1.3 Plugin Options Validation
```typescript
const plugin = async (app, opts) => {
  // Validate plugin options with Zod
  const schema = z.object({
    connectionString: z.string().url(),
    poolSize: z.number().default(10),
    timeout: z.number().optional()
  });

  const config = schema.parse(opts);
  // Use validated config...
};
```

**Pattern**: Each plugin can validate its options schema. Failed validation throws clear error before plugin executes.

#### 1.4 Decorator System
```typescript
// Server decorators
app.decorate('utility', () => {});
app.utility(); // Now available on app

// Request decorators
app.decorateRequest('user', null);
app.addHook('preHandler', async (req) => {
  req.user = await getUserFromToken(req.headers.authorization);
});

// Reply decorators
app.decorateReply('sendUser', function(user) {
  this.send({ user });
});

app.get('/me', async (req, reply) => {
  reply.sendUser(req.user); // Custom reply method
});
```

**Key Pattern**: Decorators extend prototypes safely. Check for naming conflicts. Support getters for lazy initialization.

---

### Part 2: Complete Lifecycle Hooks System

**Goal**: Build `src/hooks.ts` with 10+ hooks covering entire request lifecycle.

#### 2.1 Hook Execution Order
```
Incoming Request
    ↓
onRequest (earliest interception)
    ↓
preParsing (before body parse - decompress, validate headers)
    ↓
[BODY PARSING HAPPENS HERE]
    ↓
preValidation (before schema validation)
    ↓
[SCHEMA VALIDATION HAPPENS HERE]
    ↓
preHandler (auth, permissions, data loading)
    ↓
[ROUTE HANDLER EXECUTES]
    ↓
preSerialization (transform response data)
    ↓
[JSON SERIALIZATION HAPPENS HERE]
    ↓
onSend (modify final response, compression)
    ↓
onResponse (logging, metrics, cleanup)
    ↓
Response Sent

[Error Path]
onError (any error during lifecycle)

[Timeout Path]
onTimeout (request exceeded time limit)
```

#### 2.2 Hook Manager Implementation
```typescript
// src/hooks.ts
export type HookName =
  | 'onRequest'
  | 'preParsing'
  | 'preValidation'
  | 'preHandler'
  | 'preSerialization'
  | 'onError'
  | 'onSend'
  | 'onResponse'
  | 'onTimeout';

export type HookHandler = (
  req: Request,
  reply: Reply
) => Promise<void> | void;

export class HookManager {
  private hooks: Map<HookName, HookHandler[]>;

  add(name: HookName, handler: HookHandler): void {
    // Add to hooks array
  }

  async run(name: HookName, req: Request, reply: Reply): Promise<void> {
    const handlers = this.hooks.get(name) || [];

    // Execute all handlers in order
    for (const handler of handlers) {
      await handler(req, reply);

      // If reply was sent during hook, stop processing
      if (reply.sent) return;
    }
  }

  // Route-level hooks
  async runRouteHooks(
    name: HookName,
    routeHooks: HookHandler[],
    req: Request,
    reply: Reply
  ): Promise<void> {
    // Execute route-specific hooks before global hooks
  }
}
```

#### 2.3 Hook Usage Examples
```typescript
// Early request inspection
app.addHook('onRequest', async (req, reply) => {
  console.log('Request received:', req.method, req.url);

  // Can modify request or reply
  req.requestId = crypto.randomUUID();
});

// Before body parsing (decompress gzip, rate limit)
app.addHook('preParsing', async (req, reply) => {
  // Check rate limit before expensive body parse
  if (rateLimitExceeded(req.ip)) {
    reply.status(429).send({ error: 'Rate limit exceeded' });
  }
});

// After validation, before handler (auth)
app.addHook('preHandler', async (req, reply) => {
  req.user = await authenticate(req);

  if (!req.user) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// Transform response before serialization
app.addHook('preSerialization', async (req, reply, payload) => {
  // Wrap all responses in standard envelope
  return {
    data: payload,
    timestamp: Date.now(),
    requestId: req.requestId
  };
});

// Error handling
app.addHook('onError', async (req, reply, error) => {
  console.error('Error:', error);

  // Custom error formatting
  reply.status(500).send({
    error: 'Internal Server Error',
    requestId: req.requestId
  });
});

// Response logging (after response sent)
app.addHook('onResponse', async (req, reply) => {
  console.log('Response sent:', {
    method: req.method,
    url: req.url,
    status: reply.statusCode,
    duration: Date.now() - req.startTime
  });
});

// Timeout handling
app.addHook('onTimeout', async (req, reply) => {
  console.log('Request timeout:', req.url);
  reply.status(408).send({ error: 'Request timeout' });
});
```

#### 2.4 Route-Level Hooks
```typescript
// Hooks can be attached to specific routes
app.get('/users', {
  onRequest: [logRequestHook],
  preHandler: [authHook, loadUserPermissions],
  onResponse: [trackMetrics]
}, async (req, reply) => {
  return { users: await getUsers() };
});
```

**Pattern**: Route-level hooks execute BEFORE global hooks for that phase.

---

### Part 3: Plugin Registry & Lifecycle

**Goal**: Build `src/plugin-registry.ts` for managing plugin loading, dependencies, and contexts.

#### 3.1 Plugin Registry Core
```typescript
export interface PluginMetadata {
  name: string;
  version?: string;
  dependencies?: string[];
  fastify?: string; // Version constraint like ">=4.0.0"
}

export class PluginRegistry {
  private plugins: Map<string, PluginMetadata>;
  private loaded: Set<string>;
  private loading: Set<string>; // Circular dependency detection

  async register(
    plugin: OgelfyPlugin,
    opts?: any,
    meta?: PluginMetadata
  ): Promise<void> {
    // 1. Check dependencies exist
    if (meta?.dependencies) {
      for (const dep of meta.dependencies) {
        if (!this.loaded.has(dep)) {
          throw new Error(
            `Plugin "${meta.name}" depends on "${dep}" which is not loaded`
          );
        }
      }
    }

    // 2. Check for circular dependencies
    if (meta?.name && this.loading.has(meta.name)) {
      throw new Error(`Circular dependency detected: ${meta.name}`);
    }

    // 3. Mark as loading
    if (meta?.name) {
      this.loading.add(meta.name);
    }

    // 4. Create isolated context
    const instance = this.createContext();

    // 5. Execute plugin
    await plugin(instance, opts);

    // 6. Mark as loaded
    if (meta?.name) {
      this.loaded.add(meta.name);
      this.loading.delete(meta.name);
      this.plugins.set(meta.name, meta);
    }
  }

  private createContext(): Ogelfy {
    // Create new Ogelfy instance that:
    // 1. Inherits hooks from parent
    // 2. Has isolated decorator namespace
    // 3. Has isolated route tree (encapsulated routes)
    // 4. Shares core server instance

    // This is the HARDEST part - context isolation while sharing core
  }

  hasPlugin(name: string): boolean {
    return this.loaded.has(name);
  }

  getMetadata(name: string): PluginMetadata | undefined {
    return this.plugins.get(name);
  }
}
```

#### 3.2 Context Isolation Pattern
```typescript
// Parent app
const app = new Ogelfy();
app.decorate('sharedConfig', config);

// Plugin 1
app.register(async (instance1, opts) => {
  // instance1 can access parent decorators
  console.log(instance1.sharedConfig); // ✅ Works

  // But its decorators are isolated
  instance1.decorate('plugin1Thing', value);

  // Nested plugin
  instance1.register(async (instance2, opts) => {
    console.log(instance2.sharedConfig); // ✅ Works (from grandparent)
    console.log(instance2.plugin1Thing); // ✅ Works (from parent)

    instance2.decorate('plugin2Thing', value);
  });
});

// Plugin 2 (sibling to Plugin 1)
app.register(async (instanceB, opts) => {
  console.log(instanceB.sharedConfig); // ✅ Works
  console.log(instanceB.plugin1Thing); // ❌ Undefined (isolated)
  console.log(instanceB.plugin2Thing); // ❌ Undefined (isolated)
});
```

**Key Insight**: Each plugin context inherits from parent but siblings are isolated.

---

## Implementation Steps

### Phase 1: Hook System Foundation (4-5 hours)
1. Create `src/hooks.ts` with HookManager class
2. Define all 10+ hook types
3. Implement hook execution pipeline
4. Add error handling in hooks
5. Test hook ordering and execution

**Deliverable**: `src/hooks.ts` (~400 lines), `__tests__/hooks.test.ts` (~300 lines)

### Phase 2: Decorator System (2-3 hours)
1. Create `src/decorators.ts` with decorator management
2. Implement `decorate()` for server decorators
3. Implement `decorateRequest()` for request decorators
4. Implement `decorateReply()` for reply decorators
5. Add naming conflict checks
6. Test decorator inheritance and isolation

**Deliverable**: `src/decorators.ts` (~200 lines), `__tests__/decorators.test.ts` (~200 lines)

### Phase 3: Plugin Registry (4-5 hours)
1. Create `src/plugin-registry.ts` with PluginRegistry class
2. Implement plugin metadata tracking
3. Build dependency resolution system
4. Add circular dependency detection
5. Implement context creation (hardest part)
6. Test plugin loading order
7. Test plugin isolation

**Deliverable**: `src/plugin-registry.ts` (~400 lines), `__tests__/plugin-registry.test.ts` (~300 lines)

### Phase 4: Integration (2-3 hours)
1. Update `src/index.ts` to integrate:
   - HookManager
   - DecoratorManager
   - PluginRegistry
2. Update request pipeline to run hooks at correct points
3. Wire up decorator systems
4. Ensure plugin encapsulation works end-to-end
5. Integration tests

**Deliverable**: Updated `src/index.ts` (~200 lines added), `__tests__/integration.test.ts` (~200 lines)

---

## Architecture Patterns to Follow

### Pattern 1: Hook Pipeline (Event-Driven)
```typescript
// In Ogelfy.fetch() handler
async fetch(req: Request): Promise<Response> {
  const reply = new Reply();

  try {
    await this.hooks.run('onRequest', req, reply);
    if (reply.sent) return reply.response;

    await this.hooks.run('preParsing', req, reply);
    if (reply.sent) return reply.response;

    // Parse body...

    await this.hooks.run('preValidation', req, reply);
    if (reply.sent) return reply.response;

    // Validate...

    await this.hooks.run('preHandler', req, reply);
    if (reply.sent) return reply.response;

    // Execute handler...
    const result = await handler(req, reply);

    await this.hooks.run('preSerialization', req, reply, result);

    // Serialize...

    await this.hooks.run('onSend', req, reply);

    const response = reply.response;

    await this.hooks.run('onResponse', req, reply);

    return response;

  } catch (error) {
    await this.hooks.run('onError', req, reply, error);
    return reply.response;
  }
}
```

### Pattern 2: Context Inheritance (Prototype Chain)
```typescript
class OgelfyContext {
  private parent?: OgelfyContext;
  private decorators: Map<string, any>;

  decorate(name: string, value: any): void {
    if (this.hasDecorator(name)) {
      throw new Error(`Decorator '${name}' already exists`);
    }
    this.decorators.set(name, value);
    this[name] = value;
  }

  hasDecorator(name: string): boolean {
    // Check self
    if (this.decorators.has(name)) return true;

    // Check parent chain
    if (this.parent) return this.parent.hasDecorator(name);

    return false;
  }

  getDecorator(name: string): any {
    // Check self first
    if (this.decorators.has(name)) {
      return this.decorators.get(name);
    }

    // Check parent chain
    if (this.parent) {
      return this.parent.getDecorator(name);
    }

    return undefined;
  }
}
```

### Pattern 3: Plugin Dependency Graph
```typescript
// Topological sort for plugin loading order
function resolveDependencyOrder(plugins: PluginWithMeta[]): PluginWithMeta[] {
  const sorted: PluginWithMeta[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(plugin: PluginWithMeta) {
    if (visited.has(plugin.name)) return;
    if (visiting.has(plugin.name)) {
      throw new Error(`Circular dependency: ${plugin.name}`);
    }

    visiting.add(plugin.name);

    // Visit dependencies first
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        const depPlugin = plugins.find(p => p.name === dep);
        if (!depPlugin) {
          throw new Error(`Missing dependency: ${dep}`);
        }
        visit(depPlugin);
      }
    }

    visiting.delete(plugin.name);
    visited.add(plugin.name);
    sorted.push(plugin);
  }

  for (const plugin of plugins) {
    visit(plugin);
  }

  return sorted;
}
```

---

## Testing Strategy

### Test Coverage Requirements
- **Hook System**: 40+ tests
- **Decorator System**: 20+ tests
- **Plugin Registry**: 30+ tests
- **Total**: 90+ tests with >85% coverage

### Critical Test Cases

**Hooks**:
```typescript
describe('Hook System', () => {
  it('should execute hooks in correct order');
  it('should stop pipeline if reply sent in hook');
  it('should handle async hooks');
  it('should catch errors in hooks');
  it('should execute route-level hooks before global');
  it('should pass payload to preSerialization hook');
  it('should call onError on any error');
  it('should call onTimeout on timeout');
  it('should support multiple hooks of same type');
  it('should inherit parent hooks in plugin context');
});
```

**Decorators**:
```typescript
describe('Decorator System', () => {
  it('should add server decorator');
  it('should add request decorator');
  it('should add reply decorator');
  it('should throw on duplicate decorator name');
  it('should inherit parent decorators');
  it('should isolate sibling decorators');
  it('should support getter decorators');
  it('should preserve decorator types');
});
```

**Plugin Registry**:
```typescript
describe('Plugin Registry', () => {
  it('should register plugin with metadata');
  it('should enforce dependency order');
  it('should detect circular dependencies');
  it('should create isolated context');
  it('should inherit parent context');
  it('should track loaded plugins');
  it('should validate version constraints');
  it('should support async plugin initialization');
  it('should handle plugin errors gracefully');
});
```

---

## Acceptance Criteria

### Functional Requirements
- [ ] 10+ lifecycle hooks implemented and working
- [ ] Hook execution order guaranteed (onRequest → onTimeout)
- [ ] Plugin encapsulation (isolated state between siblings)
- [ ] Plugin dependencies and loading order
- [ ] Plugin metadata validation
- [ ] Server/request/reply decorators working
- [ ] Route-level hooks
- [ ] Error handling in hooks
- [ ] Context inheritance working correctly

### Quality Requirements
- [ ] 90+ tests passing
- [ ] >85% test coverage
- [ ] Zero TypeScript errors (strict mode)
- [ ] All edge cases covered
- [ ] Memory leaks tested (context cleanup)
- [ ] Performance overhead <0.2ms per request

### Documentation Requirements
- [ ] JSDoc comments on all public APIs
- [ ] Hook lifecycle diagram
- [ ] Plugin system architecture doc
- [ ] Usage examples for all features

---

## Reference Materials

**Fastify Source Code**:
- `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/hooks.js` - Hook implementation
- `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/plugin-utils.js` - Plugin system
- `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/avvio.js` - Dependency injection

**Research Document**:
- `.ProjectNotesAndResearch/Ogelfy/FASTIFY-PARITY-ROADMAP.md` - Full analysis

**Current Ogelfy**:
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/` - Current minimal implementation

---

## Key Challenges & Solutions

### Challenge 1: Context Isolation
**Problem**: How to create isolated plugin contexts that inherit from parent but isolate siblings?

**Solution**: Use prototype chain pattern. Each context has parent reference. Decorators checked locally first, then parent chain. Sibling contexts share same parent but different local state.

### Challenge 2: Hook Execution Performance
**Problem**: 10+ hooks per request could add significant overhead.

**Solution**:
- Only execute hooks that exist (skip empty hook arrays)
- Use Set for O(1) hook existence check
- Early return if reply already sent
- Benchmark to ensure <0.2ms overhead

### Challenge 3: Circular Dependencies
**Problem**: Plugin A depends on B, B depends on A.

**Solution**: Track "loading" state separately from "loaded". If we encounter a plugin in "loading" state, it's circular. Use topological sort for dependency resolution.

### Challenge 4: Plugin Error Handling
**Problem**: What if a plugin throws during initialization?

**Solution**:
- Catch plugin errors
- Clean up partial state
- Remove from loading set
- Throw clear error with plugin name
- Don't leave system in inconsistent state

---

## Timeline

**Phase 1 (4-5 hours)**: Hook system foundation
**Phase 2 (2-3 hours)**: Decorator system
**Phase 3 (4-5 hours)**: Plugin registry
**Phase 4 (2-3 hours)**: Integration
**Total**: 12-16 hours

**Target Completion**: Within 2 days

---

## Questions & Clarifications

**Q**: Should we support fastify-plugin's `fastify-plugin` wrapper for skipping encapsulation?
**A**: Yes - add optional `{ encapsulate: false }` option to preserve Fastify compatibility.

**Q**: Should hooks be able to modify the response payload?
**A**: Yes - `preSerialization` hook receives payload and can return modified version.

**Q**: How to handle plugin version constraints?
**A**: Use simple semver check - compare major.minor.patch. Support `>=`, `<=`, `^`, `~` operators.

**Q**: Should we support plugin namespaces?
**A**: Start without namespaces. Can add later if needed (`@scope/plugin-name`).

---

## Communication

**TPM**: Dylan Torres
**Blockers**: Report immediately via sprint status update
**Questions**: Document in handoff response, @mention Dylan
**Status Updates**: Update `.SoT/sprints/sprint-ogelfy/STATUS.md` at end of each work session

---

## Success Criteria

You'll know you're done when:
1. All 90+ tests passing
2. Can create plugin with dependencies that load in correct order
3. Plugin contexts are fully isolated (siblings can't see each other's decorators)
4. All 10+ hooks execute in correct order
5. Route-level hooks work
6. Performance overhead <0.2ms per request
7. Integration tests demonstrate full plugin system working

This is complex distributed systems architecture. Focus on correctness over speed. The patterns here need to be rock-solid for production systems.

---

**Ready to start? Read this handoff completely, ask any questions, then begin with Phase 1 (Hook System).**
