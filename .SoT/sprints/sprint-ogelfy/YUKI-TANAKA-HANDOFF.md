# OGELFY-04: Performance Benchmarking - Yuki Tanaka Handoff

**Agent**: Yuki Tanaka (Performance & Load Testing Engineer)
**Ticket**: OGELFY-04
**Status**: Ready to Start
**Estimated Effort**: 4-6 hours
**Priority**: High

---

## Mission

Validate Ogelfy achieves **>40,000 req/sec** and establish comprehensive performance benchmarks comparing against Fastify. Create a complete benchmark suite that tests simple routes, validated routes, and complex routes with hooks and middleware.

---

## Context

**What is Ogelfy?**
Ogelfy is a high-performance, Bun-native web framework inspired by Fastify's architecture. It's built entirely in TypeScript with:
- Zero-copy routing with path parameters
- Fast JSON validation (Zod + AJV)
- Plugin system with lifecycle hooks
- Fast JSON serialization
- Content-type parsing
- Error handling

**Current State**:
- Core framework: ✅ Complete (4,275 lines)
- All modules implemented: router, validation, hooks, serializer, plugins
- Test suite: ✅ Comprehensive (though some tests failing - ignore for benchmarking)
- Benchmarks: ❌ Not yet created - **YOUR TASK**

**Working Directory**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/`

---

## Performance Targets

### Target Metrics (Bun Runtime)
- **Simple route** (GET /hello): >80,000 req/sec
- **JSON route** (validated POST /user): >40,000 req/sec
- **Complex route** (hooks + auth middleware): >30,000 req/sec

### Comparison Baseline
Fastify on Node.js typically achieves:
- Simple route: ~30,000 req/sec
- Validated route: ~18,000 req/sec
- Complex route: ~15,000 req/sec

**Expected Result**: Ogelfy on Bun should be **2-3x faster** than Fastify on Node.js due to Bun's performance characteristics.

---

## Deliverables

Create the following benchmark suite:

### 1. Benchmark Server Scripts

**File**: `benchmarks/simple-route.ts`
- Simple GET /hello route returning JSON
- No validation, no middleware, no hooks
- Minimal overhead - pure routing + serialization

**File**: `benchmarks/validated-route.ts`
- POST /user with JSON body validation
- Schema validation using Ogelfy's validation system
- Tests schema compilation + validation overhead

**File**: `benchmarks/complex-route.ts`
- GET /protected with multiple hooks
- `onRequest` hook (logging simulation)
- `preHandler` hook (auth check - requires header)
- Tests full lifecycle overhead

### 2. Benchmark Execution Script

**File**: `benchmarks/run-benchmarks.sh`
- Bash script that:
  1. Starts each benchmark server in background
  2. Waits for server to be ready
  3. Runs autocannon load test
  4. Kills server process
  5. Reports results
- Should run all 3 benchmarks sequentially
- Should output formatted results

### 3. Results Documentation

**File**: `benchmarks/RESULTS.md`
- Document actual performance achieved
- Compare against targets
- Compare against Fastify baseline
- Include:
  - Requests/second for each scenario
  - Latency percentiles (p50, p95, p99)
  - Memory usage observations
  - Conclusions about performance characteristics

### 4. Automated Performance Tests

**File**: `__tests__/benchmarks.test.ts`
- Unit tests that validate performance
- Test 1: Simple route handles 1000 requests in <100ms
- Test 2: Memory usage stays stable over 10,000 requests (<50MB growth)
- Should run with `bun test benchmarks`

### 5. Package.json Updates

Add to `package.json`:
- `autocannon` as dev dependency
- Benchmark script: `"bench": "./benchmarks/run-benchmarks.sh"`

---

## Technical Implementation Details

### Benchmark Server Pattern

Each benchmark server should follow this pattern:

```typescript
import { Ogelfy } from '../src/index';

const app = new Ogelfy();

// Define routes here
app.get('/hello', async () => {
  return { hello: 'world' };
});

// Start server
await app.listen({ port: 3000 });
console.log('Server ready for benchmarking on port 3000');
```

### Autocannon Usage

Run load tests with autocannon:

```bash
# Basic usage
autocannon -c 100 -d 10 http://localhost:3000/hello

# POST with JSON body
autocannon -c 100 -d 10 -m POST \
  -H "content-type: application/json" \
  -b '{"name":"John","age":30}' \
  http://localhost:3001/user

# With custom headers
autocannon -c 100 -d 10 \
  -H "authorization: Bearer token123" \
  http://localhost:3002/protected
```

**Parameters**:
- `-c 100`: 100 concurrent connections
- `-d 10`: 10 second duration
- `-m POST`: HTTP method
- `-H`: Custom headers
- `-b`: Request body

### Port Assignment

Use different ports to avoid conflicts:
- Simple route: `3000`
- Validated route: `3001`
- Complex route: `3002`

### Bash Script Structure

```bash
#!/bin/bash

echo "=== Ogelfy Performance Benchmarks ==="

# Simple route
echo "1. Simple Route"
bun run benchmarks/simple-route.ts &
PID=$!
sleep 2
autocannon -c 100 -d 10 http://localhost:3000/hello
kill $PID

# ... repeat for other scenarios
```

---

## Current Codebase Structure

### Core Files You'll Reference

**Main Framework** (`src/index.ts`):
- `Ogelfy` class with `.get()`, `.post()`, `.listen()` methods
- `.addHook()` for lifecycle hooks
- `.inject()` for testing (no HTTP server)

**Router** (`src/router.ts`):
- Path matching with parameters (`:id` syntax)
- HTTP method routing
- Schema compilation and validation

**Hooks** (`src/hooks.ts`):
- Lifecycle hooks: `onRequest`, `preParsing`, `preValidation`, `preHandler`, `preSerialization`, `onSend`, `onResponse`, `onError`
- `HookManager` for hook execution

**Validation** (`src/schema-compiler.ts`):
- JSON Schema validation with AJV
- Zod schema support
- Fast validation compilation

### Example Usage (Reference)

```typescript
import { Ogelfy } from '../src/index';

const app = new Ogelfy();

// Simple route
app.get('/hello', async () => {
  return { hello: 'world' };
});

// Validated route
app.post('/user', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    }
  }
}, async (req, context) => {
  return { created: true, user: context.body };
});

// Route with hooks
app.addHook('onRequest', async (req, context) => {
  console.log('Request received');
});

app.addHook('preHandler', async (req, context) => {
  if (!req.headers.get('authorization')) {
    throw app.httpErrors.unauthorized();
  }
});

app.get('/protected', async (req, context) => {
  return { data: 'sensitive' };
});

await app.listen({ port: 3000 });
```

---

## Testing Strategy

### Manual Testing
1. Start benchmark server: `bun run benchmarks/simple-route.ts`
2. Verify server responds: `curl http://localhost:3000/hello`
3. Run autocannon: `autocannon -c 100 -d 10 http://localhost:3000/hello`
4. Verify results look reasonable

### Automated Testing
1. Run benchmark tests: `bun test benchmarks`
2. Verify tests pass
3. Check performance assertions are met

### Full Benchmark Suite
1. Run full suite: `./benchmarks/run-benchmarks.sh`
2. Verify all 3 scenarios complete
3. Document results in `RESULTS.md`

---

## Acceptance Criteria

**Benchmark Implementation**:
- [x] 3 benchmark server scripts created
- [x] `run-benchmarks.sh` script created and executable
- [x] All benchmarks use correct Ogelfy API
- [x] Servers start successfully and respond to requests

**Performance Validation**:
- [x] Simple route: >80,000 req/sec achieved
- [x] Validated route: >40,000 req/sec achieved
- [x] Complex route: >30,000 req/sec achieved
- [x] Latency p99 < 5ms for all scenarios

**Documentation**:
- [x] `RESULTS.md` created with actual performance data
- [x] Comparison with Fastify documented
- [x] Latency percentiles documented
- [x] Memory usage observations included

**Automated Tests**:
- [x] `__tests__/benchmarks.test.ts` created
- [x] Performance assertions validate targets
- [x] Memory stability test passes

**Package Configuration**:
- [x] `autocannon` added to devDependencies
- [x] Benchmark script added to package.json

---

## Dependencies & Blockers

**Dependencies**:
- ✅ Ogelfy core framework (complete)
- ✅ Bun runtime (installed at `~/.bun/bin/bun`)
- ⏸️ `autocannon` (you will install: `bun add -d autocannon`)

**No Blockers**: All necessary code is complete and ready for benchmarking.

---

## Commands Reference

### Setup
```bash
# Install autocannon
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy
bun add -d autocannon

# Create benchmarks directory
mkdir -p benchmarks
```

### Development
```bash
# Test a benchmark server manually
bun run benchmarks/simple-route.ts

# Run autocannon manually
autocannon -c 100 -d 10 http://localhost:3000/hello

# Run full benchmark suite
chmod +x benchmarks/run-benchmarks.sh
./benchmarks/run-benchmarks.sh
```

### Testing
```bash
# Run benchmark tests
bun test benchmarks

# Run all tests
bun test
```

---

## Expected Results Format

### Console Output from `run-benchmarks.sh`

```
=== Ogelfy Performance Benchmarks ===

1. Simple Route (GET /hello)
Running 10s test @ http://localhost:3000/hello
100 connections

┌─────────┬──────┬──────┬───────┬──────┬─────────┬─────────┬────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev   │ Max    │
├─────────┼──────┼──────┼───────┼──────┼─────────┼─────────┼────────┤
│ Latency │ 0 ms │ 0 ms │ 1 ms  │ 2 ms │ 0.23 ms │ 0.45 ms │ 15 ms  │
└─────────┴──────┴──────┴───────┴──────┴─────────┴─────────┴────────┘

Req/Sec: 85,000
Throughput: 25 MB/sec

2. Validated Route (POST /user with JSON Schema)
...

3. Complex Route (hooks + auth middleware)
...

=== Benchmarks Complete ===
```

### RESULTS.md Format

```markdown
# Ogelfy Performance Benchmark Results

## Test Environment
- Runtime: Bun 1.3.3
- CPU: [Document actual CPU]
- Memory: [Document actual RAM]
- OS: macOS [version]
- Date: 2025-11-22

## Results Summary

| Scenario | Req/Sec | p50 | p95 | p99 | Target | Status |
|----------|---------|-----|-----|-----|--------|--------|
| Simple   | 85k     | 0ms | 1ms | 2ms | 80k    | ✅ PASS |
| Validated| 42k     | 1ms | 3ms | 5ms | 40k    | ✅ PASS |
| Complex  | 32k     | 1ms | 4ms | 6ms | 30k    | ✅ PASS |

## Comparison with Fastify

[Document comparative analysis]

## Memory Usage

[Document memory observations]

## Conclusions

[Document key findings]
```

---

## Tips for Success

1. **Start Simple**: Begin with simple-route.ts, verify it works, then build others
2. **Port Management**: Use different ports (3000, 3001, 3002) to avoid conflicts
3. **Process Cleanup**: Ensure bash script kills processes with `kill $PID`
4. **Sleep Timing**: Give servers 2 seconds to start before running autocannon
5. **Error Handling**: Test error scenarios (missing auth header) work correctly
6. **Memory Profiling**: Use `process.memoryUsage()` to track memory
7. **Statistical Significance**: Run each benchmark multiple times if results vary widely

---

## Resources

**Ogelfy Source**:
- Main: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/index.ts`
- Tests: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/__tests__/`
- Docs: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/docs/`

**Autocannon Docs**:
- npm: https://www.npmjs.com/package/autocannon
- GitHub: https://github.com/mcollina/autocannon

**Bun Performance Docs**:
- https://bun.sh/docs/runtime/web-apis
- https://bun.sh/docs/api/http

---

## Success Definition

This ticket is **DONE** when:

1. ✅ All 3 benchmark servers implemented and working
2. ✅ `run-benchmarks.sh` executes successfully
3. ✅ All performance targets achieved (>40k req/sec for validated routes)
4. ✅ `RESULTS.md` documents actual performance with comparison
5. ✅ Automated benchmark tests pass
6. ✅ `autocannon` installed in package.json
7. ✅ TPM review complete

---

## Communication

**Questions?** Ask Dylan Torres (TPM) via this conversation.

**Status Updates**: Update this handoff document with progress notes.

**Completion**: When done, report back with:
- Actual performance numbers achieved
- Whether targets were met
- Any interesting findings
- Link to RESULTS.md

---

**Ready to start?** Install autocannon, create the benchmarks directory, and build the simple-route.ts first. Test it manually before building the automation. Let's validate Ogelfy's speed! 🚀

---

**Created**: 2025-11-22
**Status**: Ready to Start
**Agent**: Yuki Tanaka
**Ticket**: OGELFY-04
