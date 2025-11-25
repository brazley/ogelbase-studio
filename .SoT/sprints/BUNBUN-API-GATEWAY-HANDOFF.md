# BunBun API Gateway - Jordan Kim Handoff

**Date**: 2025-11-25
**TPM**: Dylan Torres (Cameron Vale)
**Assigned To**: Jordan Kim - Full-Stack TypeScript Architect
**Project**: BunBun Unified Internal API Gateway
**Location**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/server/`

---

## Mission

Build BunBun as a unified internal API gateway that exposes external endpoints for interacting with all Railway internal services. Users should hit BunBun's public API to run migrations, queries, auth operations, storage operations, etc., without needing direct access to individual Railway services.

**Why Jordan**: This is end-to-end TypeScript architecture requiring type-safe client wrappers, API contract design, service proxying, and security middleware integration - exactly your domain.

---

## Current State

### What Exists

**BunBun Server** at `apps/security/packages/server/`:
- ✅ Ogelfy framework (custom Bun web framework)
- ✅ Basic server at `src/api/server.ts` with `/health` and `/api/backups` endpoints
- ✅ Middleware: auth, rate limiting, CORS, logging
- ✅ Environment config at `src/config/env.ts`
- ✅ Running on Railway with internal network access

**Ogelfy Framework** at `apps/security/packages/ogelfy/`:
- Custom Bun-based web framework (Fastify-inspired)
- Route handlers, middleware, hooks, plugins
- Type-safe route context, schema validation
- Error handling and testing utilities

**Railway Internal Services** (all accessible via `*.railway.internal`):

| Service | Internal URL | Port | Purpose |
|---------|--------------|------|---------|
| Postgres | postgres.railway.internal | 5432 | Main database |
| Kong | kong.railway.internal | 8000 | API gateway |
| GoTrue (Auth) | supabase-auth.railway.internal | 9999 | Authentication |
| PostgREST | postgrest.railway.internal | 3000 | Auto REST API |
| Postgres Meta | postgres-meta.railway.internal | 8080 | DB introspection |
| Storage | supabase-storage.railway.internal | 5000 | File storage |
| Realtime | supabase-realtime.railway.internal | 4000 | WebSockets |
| Edge Functions | edge-functions.railway.internal | 9000 | Serverless |

### What's Missing

**Need to build**:
1. **Database client** (`src/clients/postgres.ts`) - Type-safe Postgres operations
2. **Service proxy clients** (`src/clients/`) - Auth, Storage, Meta wrappers
3. **API route handlers** (`src/routes/`) - db, auth, storage, health endpoints
4. **Environment updates** (`src/config/env.ts`) - All service URLs and credentials
5. **Security integration** - JWT validation, service_role checks, rate limiting

---

## Database Credentials (Railway Production)

```typescript
// These are real production credentials - handle securely
DB_SUPERUSER_PASSWORD=sl2i90d6w7lzgejxxqwh3tiwuqxhtl64
JWT_SECRET=PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk
```

---

## Required API Endpoints

### 1. Database Operations (`/api/db/*`)

**Security**: ALL routes require `service_role` JWT

```typescript
POST /api/db/query
  Body: { sql: string, params?: any[] }
  Response: { rows: any[], rowCount: number }

POST /api/db/migrate
  Body: { name: string, sql: string }
  Response: { success: boolean, migration: Migration }

GET /api/db/tables
  Query: { schema?: string }
  Response: { tables: Table[] }

GET /api/db/health
  Response: { connected: boolean, latency: number }
```

### 2. Auth Operations (`/api/auth/*`)

**Proxy to**: `supabase-auth.railway.internal:9999`

```typescript
POST /api/auth/signup
  Body: { email: string, password: string }
  Response: { user: User, session: Session }

POST /api/auth/signin
  Body: { email: string, password: string }
  Response: { user: User, session: Session }

POST /api/auth/signout
  Headers: { Authorization: "Bearer <token>" }
  Response: { success: boolean }

GET /api/auth/user
  Headers: { Authorization: "Bearer <token>" }
  Response: { user: User }

POST /api/auth/admin/users
  Headers: { Authorization: "Bearer <service_role_key>" }
  Body: { action: "list" | "create", data?: any }
  Response: { users: User[] }
```

### 3. Storage Operations (`/api/storage/*`)

**Proxy to**: `supabase-storage.railway.internal:5000`

```typescript
POST /api/storage/upload
  Headers: { Authorization: "Bearer <token>" }
  Body: FormData { bucket: string, file: File, path: string }
  Response: { key: string, url: string }

GET /api/storage/download/:bucket/:path
  Headers: { Authorization: "Bearer <token>" }
  Response: File stream

DELETE /api/storage/delete/:bucket/:path
  Headers: { Authorization: "Bearer <token>" }
  Response: { success: boolean }

GET /api/storage/list/:bucket
  Headers: { Authorization: "Bearer <token>" }
  Query: { prefix?: string }
  Response: { files: FileObject[] }
```

### 4. Service Health (`/api/health/*`)

```typescript
GET /api/health
  Response: { status: "ok", uptime: number, version: string }

GET /api/health/services
  Response: {
    services: {
      postgres: { status: "up" | "down", latency: number },
      auth: { status: "up" | "down", latency: number },
      storage: { status: "up" | "down", latency: number },
      meta: { status: "up" | "down", latency: number }
    }
  }
```

---

## File Structure to Create

```
apps/security/packages/server/src/
├── api/
│   └── server.ts                  (UPDATE: register new routes)
├── clients/
│   ├── postgres.ts                (CREATE: type-safe Postgres client)
│   ├── auth.ts                    (CREATE: GoTrue proxy client)
│   ├── storage.ts                 (CREATE: Storage proxy client)
│   └── meta.ts                    (CREATE: Postgres Meta client)
├── routes/
│   ├── db.ts                      (CREATE: database route handlers)
│   ├── auth.ts                    (CREATE: auth route handlers)
│   ├── storage.ts                 (CREATE: storage route handlers)
│   └── health.ts                  (CREATE: health check handlers)
├── config/
│   └── env.ts                     (UPDATE: add service URLs and secrets)
└── middleware/
    └── (existing: auth, rate-limit, cors, logging)
```

---

## Environment Variables (Railway)

**These will be set in Railway dashboard**:

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgres://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres

# Internal Services
AUTH_URL=http://supabase-auth.railway.internal:9999
STORAGE_URL=http://supabase-storage.railway.internal:5000
META_URL=http://postgres-meta.railway.internal:8080
KONG_URL=http://kong.railway.internal:8000
POSTGREST_URL=http://postgrest.railway.internal:3000
REALTIME_URL=http://supabase-realtime.railway.internal:4000
FUNCTIONS_URL=http://edge-functions.railway.internal:9000

# Auth & Security
JWT_SECRET=PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://studio.ogel.com
```

---

## Implementation Requirements

### 1. Type Safety Throughout

- ✅ All client functions fully typed
- ✅ Request/response schemas with Zod
- ✅ Type inference for route handlers
- ✅ No `any` types (use `unknown` when necessary)

### 2. Security

- ✅ `/api/db/*` requires `service_role` JWT
- ✅ `/api/auth/*` validates user JWT where applicable
- ✅ `/api/storage/*` validates user JWT
- ✅ Rate limiting on all endpoints (existing middleware)
- ✅ Input validation with Zod schemas

### 3. Error Handling

- ✅ Consistent error response format
- ✅ Proper HTTP status codes
- ✅ Meaningful error messages
- ✅ Security: Don't leak internal details

### 4. Performance

- ✅ Connection pooling for Postgres
- ✅ Efficient proxying (stream where possible)
- ✅ Minimal overhead on proxy routes

### 5. Observability

- ✅ Request logging (existing middleware)
- ✅ Error logging with context
- ✅ Health check endpoints
- ✅ Service connectivity monitoring

---

## Dependencies

**Already in monorepo**:
- ✅ `postgres` (npm package) - For Postgres client
- ✅ `zod` - Schema validation
- ✅ `jsonwebtoken` - JWT verification

**May need to add**:
- `@supabase/gotrue-js` (if wrapping GoTrue directly)
- `@supabase/storage-js` (if wrapping Storage directly)
- OR just use `fetch` to proxy requests

**Recommendation**: Start with `fetch` for proxying. Keep it simple. Add SDK wrappers only if needed for complex logic.

---

## Testing Strategy

### Unit Tests
- Client functions (postgres, auth, storage, meta)
- Route handlers with mocked clients
- Middleware integration

### Integration Tests
- Real calls to Railway internal services (from Railway environment)
- End-to-end flows (signup → query → upload)
- Health checks

### Manual Testing Checklist
```bash
# 1. Health checks
curl http://localhost:3000/health
curl http://localhost:3000/api/health/services

# 2. Database operations (need service_role JWT)
curl -X POST http://localhost:3000/api/db/query \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1 as test"}'

# 3. Auth operations
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'

# 4. Storage operations (need user JWT)
curl -X POST http://localhost:3000/api/storage/upload \
  -H "Authorization: Bearer $USER_JWT" \
  -F "bucket=test" \
  -F "path=test.txt" \
  -F "file=@test.txt"
```

---

## Deliverables

### Code Files
1. ✅ `src/clients/postgres.ts` - Postgres client with query, migrate, health
2. ✅ `src/clients/auth.ts` - GoTrue proxy client
3. ✅ `src/clients/storage.ts` - Storage proxy client
4. ✅ `src/clients/meta.ts` - Postgres Meta client
5. ✅ `src/routes/db.ts` - Database route handlers
6. ✅ `src/routes/auth.ts` - Auth route handlers
7. ✅ `src/routes/storage.ts` - Storage route handlers
8. ✅ `src/routes/health.ts` - Health check handlers
9. ✅ `src/api/server.ts` - Updated with all routes registered
10. ✅ `src/config/env.ts` - Updated with all service URLs

### Documentation
11. ✅ API endpoint documentation (README or OpenAPI spec)
12. ✅ Client usage examples
13. ✅ Deployment instructions
14. ✅ Testing guide

### Tests
15. ✅ Unit tests for clients
16. ✅ Integration tests for routes
17. ✅ Health check tests

---

## Code Style & Patterns

**Follow existing Ogelfy patterns**:

```typescript
// Route handler pattern (see server.ts)
app.get('/api/example', async (req) => {
  const start = Date.now();

  try {
    await rateLimitMiddleware(100, 900000)(req);
    const auth = await authMiddleware(req);

    // Your logic here
    const response = { data: [] };

    logRequest(req, 200, Date.now() - start);
    return response;
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 :
                   error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

    logRequest(req, status, Date.now() - start);
    throw new HttpError(status, error instanceof Error ? error.message : 'Unknown error');
  }
});
```

**Postgres client pattern**:
```typescript
// Use postgres npm package (already in monorepo)
import postgres from 'postgres';

const sql = postgres(env.DATABASE_URL, {
  max: 10, // connection pool size
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function query(sql: string, params?: any[]) {
  // Type-safe query execution
}

export async function migrate(name: string, sql: string) {
  // Migration execution with transaction
}
```

**Service proxy pattern**:
```typescript
// Simple fetch-based proxy
export async function proxyToAuth(
  endpoint: string,
  options: RequestInit
): Promise<Response> {
  const url = `${env.AUTH_URL}${endpoint}`;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'apikey': env.SUPABASE_SERVICE_KEY,
    },
  });
}
```

---

## Success Criteria

**Definition of Done**:
- ✅ All 4 route modules created and working
- ✅ All 4 client modules created and working
- ✅ All routes integrated into server.ts
- ✅ Environment config updated
- ✅ Can execute SQL queries via `/api/db/query`
- ✅ Can run migrations via `/api/db/migrate`
- ✅ Can signup/signin via `/api/auth/*`
- ✅ Can upload/download files via `/api/storage/*`
- ✅ Health checks return accurate service status
- ✅ Security: service_role routes protected
- ✅ Security: user routes validate JWT
- ✅ Tests passing
- ✅ Documentation complete

---

## Context & References

**Project Documentation**:
- Infrastructure Status: `.SoT/status-reports/INFRASTRUCTURE_STATUS.md`
- Railway Setup: `.ProjectNotesAndResearch/Ogel Deploy/RAILWAY_INFRASTRUCTURE_SETUP.md`
- Project README: `.SoT/README.md`

**Code References**:
- Existing Ogelfy usage: `apps/security/packages/server/src/api/server.ts`
- Ogelfy framework: `apps/security/packages/ogelfy/src/index.ts`
- Middleware patterns: `apps/security/packages/server/src/middleware/`

**Working Directory**:
```bash
cd /Users/quikolas/Documents/GitHub/supabase-master
```

---

## Notes for Jordan

**Why you're perfect for this**:
- End-to-end TypeScript architecture (your specialty)
- Type-safe database operations (you've done this)
- API contract design (tRPC, GraphQL experience)
- Service proxy patterns (BFF background)
- Security middleware integration (auth expertise)
- Monorepo structure (you know this well)

**Challenges to anticipate**:
- GoTrue and Storage may have quirks - proxy carefully
- JWT verification needs to handle both user and service_role tokens
- Connection pooling for Postgres is critical
- Error handling needs to be consistent across all routes
- Railway internal DNS should work but test thoroughly

**Your call on**:
- Whether to use Supabase SDKs or raw fetch for proxying
- How to structure the client modules (classes vs functions)
- Whether to add response caching (probably not needed initially)
- Testing approach (unit vs integration priority)

**Freedom to improve**:
- If you see better patterns than what I outlined, use them
- If types can be stronger, make them stronger
- If error handling can be better, improve it
- You're the expert - trust your judgment

---

## Timeline Estimate

**Your assessment welcome**, but rough estimate:
- Database client: 2-3 hours
- Service proxy clients: 2-3 hours
- Route handlers: 3-4 hours
- Integration & testing: 2-3 hours
- Documentation: 1-2 hours

**Total**: ~12-15 hours (1.5-2 days)

---

## Questions Before Starting?

Read through this handoff. If anything is unclear or you need more context:
- Read the referenced docs in `.SoT/`
- Check existing code patterns
- Ask Dylan (me) if you need clarification

Otherwise, start with the database client and work your way up the stack. Ship iteratively - don't wait until everything is perfect.

---

**Handoff complete. You have everything you need. Go build.**

— Dylan Torres (Cameron Vale), TPM
