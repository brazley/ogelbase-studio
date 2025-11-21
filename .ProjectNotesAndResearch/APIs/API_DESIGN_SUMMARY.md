# Unified Database API Design - Executive Summary

## Overview

This document provides a comprehensive API design for managing Redis, MongoDB, and PostgreSQL through a unified Supabase Studio interface. The design extends the existing platform API patterns while maintaining consistency, type safety, and security.

---

## Key Documents

1. **UNIFIED_DATABASE_API_DESIGN.md** - Complete technical specification
2. **UNIFIED_API_QUICK_REFERENCE.md** - Quick reference and examples
3. **API_ARCHITECTURE_DIAGRAM.md** - Visual architecture and data flows
4. **This document** - Executive summary and implementation roadmap

---

## Current State Analysis

### Existing API Architecture

**Location:** `/apps/studio/pages/api/platform/`

**Key Files:**

- `/lib/api/apiWrapper.ts` (Lines 1-51) - Authentication wrapper
- `/lib/api/apiAuthenticate.ts` (Lines 1-52) - JWT validation
- `/lib/api/platform/database.ts` (Lines 27-72) - Platform DB queries
- `/pages/api/platform/pg-meta/[ref]/query/index.ts` - Postgres proxy

**Authentication Flow:**

```typescript
apiWrapper(req, res, handler, { withAuth: true })
  → apiAuthenticate(req, res)
  → getUserClaims(token from Authorization header)
  → Return user claims or 401 error
```

**Database Access Pattern:**

```typescript
const { data, error } = await queryPlatformDatabase<T>({
  query: 'SELECT ...',
  parameters: [...]
})
// Returns: WrappedResult<T[]>
```

**Platform Schema:**

```
platform.organizations  - Multi-tenant organization management
platform.projects       - Project metadata and DB connection details
platform.credentials    - JWT keys per project
```

---

## Proposed Extensions

### 1. Database Schema Extension

**New Migration:** `002_add_multi_database_support.sql`

```sql
-- New enum for database types
CREATE TYPE platform.database_type AS ENUM ('postgres', 'redis', 'mongodb');

-- New table for multi-database connections
CREATE TABLE platform.database_connections (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES platform.projects(id),
  database_type platform.database_type NOT NULL,
  identifier TEXT NOT NULL,  -- e.g., "cache-redis", "primary-mongo"

  -- Connection details
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT,
  username TEXT,
  password TEXT,

  -- Flexible options
  options JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_primary BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE',

  UNIQUE(project_id, identifier)
);
```

### 2. TypeScript Type System

**New File:** `/lib/api/platform/database-types.ts`

```typescript
export type DatabaseType = 'postgres' | 'redis' | 'mongodb'

export interface DatabaseConnection {
  id: string
  project_id: string
  database_type: DatabaseType
  identifier: string
  host: string
  port: number
  // ... connection details
  options: Record<string, unknown>
  is_primary: boolean
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'CONNECTING'
}

export interface RedisConnection extends DatabaseConnection {
  database_type: 'redis'
  options: { db?: number; tls?: boolean; cluster?: boolean }
}

export interface MongoDBConnection extends DatabaseConnection {
  database_type: 'mongodb'
  database_name: string
  options: { replica_set?: string; auth_source?: string; tls?: boolean }
}
```

### 3. Database Client Abstraction

**New File:** `/lib/api/database/client.ts`

Provides unified interface for all database types:

```typescript
export interface DatabaseClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  ping(): Promise<number>
  getInfo(): Promise<any>
}

export class RedisClient implements DatabaseClient {
  // Uses ioredis
  // Additional methods: get, set, del, scan, type, ttl, publish, subscribe
}

export class MongoDBClient implements DatabaseClient {
  // Uses mongodb driver
  // Additional methods: getDb, listDatabases, listCollections
}

export class PostgresClient implements DatabaseClient {
  // Uses pg.Pool
  // Additional methods: query
}

export function createDatabaseClient(config: DatabaseClientConfig): DatabaseClient {
  switch (config.connection.database_type) {
    case 'redis':
      return new RedisClient(config)
    case 'mongodb':
      return new MongoDBClient(config)
    case 'postgres':
      return new PostgresClient(config)
  }
}
```

### 4. Connection Pool Manager

**New File:** `/lib/api/database/pool-manager.ts`

```typescript
class ConnectionPoolManager {
  private pools: Map<string, PoolEntry> = new Map()

  async getClient(connectionId: string, projectRef: string): Promise<DatabaseClient>
  async releaseClient(connectionId: string, projectId: string, type: string): Promise<void>
  private cleanupIdleConnections(): Promise<void> // Runs every 60s
}

export const poolManager = new ConnectionPoolManager()
```

**Features:**

- Connection reuse across requests
- Automatic cleanup of idle connections (5 min timeout)
- Per-project connection limits
- Health monitoring

---

## API Endpoint Design

### Redis Management API

**Base Path:** `/api/platform/redis/[ref]/`

#### Connection Management

```
GET    /connections              List all Redis connections
POST   /connections              Create new connection
PUT    /connections/[id]         Update connection
DELETE /connections/[id]         Delete connection
POST   /connections/[id]/test    Test connection health
```

#### Key-Value Operations

```
GET    /keys                     List keys (SCAN with pattern, cursor)
GET    /keys/[key]               Get key value, type, TTL, size
POST   /keys/[key]               Set key value with optional TTL
PUT    /keys/[key]               Update key value
DELETE /keys/[key]               Delete key
POST   /keys/[key]/expire        Set/update TTL
```

#### Pub/Sub

```
GET    /pubsub/channels          List active channels
POST   /pubsub/publish           Publish message to channel
WS     /pubsub/subscribe         Subscribe to channels (WebSocket)
```

#### Server Info

```
GET    /info                     Server info (version, memory, stats)
GET    /stats                    Real-time statistics
```

### MongoDB Management API

**Base Path:** `/api/platform/mongodb/[ref]/`

#### Connection Management

```
GET    /connections              List MongoDB connections
POST   /connections              Create new connection
PUT    /connections/[id]         Update connection
DELETE /connections/[id]         Delete connection
POST   /connections/[id]/test    Test connection
```

#### Database Operations

```
GET    /databases                List all databases
GET    /databases/[db]/stats     Database statistics
```

#### Collection Operations

```
GET    /databases/[db]/collections                List collections
POST   /databases/[db]/collections                Create collection
DELETE /databases/[db]/collections/[coll]         Drop collection
```

#### Document Operations

```
GET    /databases/[db]/collections/[coll]/documents
       ?filter={"age":{"$gte":18}}&limit=50&skip=0
       Query documents with MongoDB filter syntax

POST   /databases/[db]/collections/[coll]/documents
       Insert single or multiple documents

GET    /databases/[db]/collections/[coll]/documents/[id]
       Get document by _id

PUT    /databases/[db]/collections/[coll]/documents/[id]
       Update document with MongoDB update operators

DELETE /databases/[db]/collections/[coll]/documents/[id]
       Delete document

POST   /databases/[db]/collections/[coll]/aggregate
       Run aggregation pipeline
```

#### Index Management

```
GET    /databases/[db]/collections/[coll]/indexes      List indexes
POST   /databases/[db]/collections/[coll]/indexes      Create index
DELETE /databases/[db]/collections/[coll]/indexes/[name] Drop index
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goal:** Core infrastructure and abstractions

**Tasks:**

1. Create database migration `002_add_multi_database_support.sql`
2. Implement TypeScript types in `database-types.ts`
3. Build database client abstraction in `client.ts`
4. Create connection pool manager in `pool-manager.ts`
5. Add shared helpers and error handling

**Files to Create:**

- `/database/migrations/002_add_multi_database_support.sql`
- `/lib/api/platform/database-types.ts`
- `/lib/api/database/client.ts`
- `/lib/api/database/pool-manager.ts`
- `/lib/api/database/helpers.ts`
- `/lib/api/database/errors.ts`

**Success Criteria:**

- [ ] Migration runs successfully on platform database
- [ ] Can create RedisClient and connect to Redis
- [ ] Can create MongoDBClient and connect to MongoDB
- [ ] Pool manager reuses connections correctly
- [ ] Type definitions compile without errors

### Phase 2: Redis API (Week 2)

**Goal:** Complete Redis management functionality

**Tasks:**

1. Implement connection management endpoints
2. Build key-value operation endpoints
3. Add server info and stats endpoints
4. Write unit tests for Redis operations

**Files to Create:**

- `/pages/api/platform/redis/[ref]/connections/index.ts`
- `/pages/api/platform/redis/[ref]/connections/[id]/index.ts`
- `/pages/api/platform/redis/[ref]/connections/[id]/test.ts`
- `/pages/api/platform/redis/[ref]/keys/index.ts`
- `/pages/api/platform/redis/[ref]/keys/[key]/index.ts`
- `/pages/api/platform/redis/[ref]/keys/[key]/expire.ts`
- `/pages/api/platform/redis/[ref]/info.ts`
- `/pages/api/platform/redis/[ref]/stats.ts`

**Success Criteria:**

- [ ] Can create/read/update/delete Redis connections
- [ ] Can list keys with pattern matching
- [ ] Can get/set/delete key values
- [ ] Can set TTL on keys
- [ ] Server info endpoint returns valid data
- [ ] All endpoints have proper authentication

### Phase 3: MongoDB API (Week 3)

**Goal:** Complete MongoDB management functionality

**Tasks:**

1. Implement connection management endpoints
2. Build database and collection endpoints
3. Create document CRUD operations
4. Add index management
5. Implement aggregation pipeline support

**Files to Create:**

- `/pages/api/platform/mongodb/[ref]/connections/index.ts`
- `/pages/api/platform/mongodb/[ref]/connections/[id]/index.ts`
- `/pages/api/platform/mongodb/[ref]/connections/[id]/test.ts`
- `/pages/api/platform/mongodb/[ref]/databases/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/stats.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/aggregate.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/[name]/index.ts`

**Success Criteria:**

- [ ] Can create/test MongoDB connections
- [ ] Can list databases and collections
- [ ] Can query documents with filters
- [ ] Can insert/update/delete documents
- [ ] Can run aggregation pipelines
- [ ] Can manage indexes

### Phase 4: Advanced Features (Week 4)

**Goal:** Real-time and performance features

**Tasks:**

1. Implement Redis Pub/Sub with WebSocket
2. Add response caching layer
3. Implement rate limiting
4. Add performance monitoring
5. Optimize query patterns

**Files to Create:**

- `/pages/api/platform/redis/[ref]/pubsub/channels.ts`
- `/pages/api/platform/redis/[ref]/pubsub/publish.ts`
- `/pages/api/platform/redis/[ref]/pubsub/subscribe.ts` (WebSocket)
- `/lib/api/middleware/cache.ts`
- `/lib/api/middleware/rate-limit.ts`
- `/lib/api/monitoring/metrics.ts`

**Success Criteria:**

- [ ] WebSocket Pub/Sub works for Redis
- [ ] Response caching reduces database load
- [ ] Rate limiting prevents abuse
- [ ] Metrics collection is working
- [ ] Connection pooling is optimized

### Phase 5: Frontend Integration (Week 5)

**Goal:** UI components and end-to-end testing

**Tasks:**

1. Create Redis management UI components
2. Create MongoDB management UI components
3. Add unified database switcher
4. Write end-to-end tests
5. Bug fixes and polish

**Files to Create:**

- `/components/interfaces/Database/Redis/ConnectionsList.tsx`
- `/components/interfaces/Database/Redis/KeysExplorer.tsx`
- `/components/interfaces/Database/MongoDB/DatabaseExplorer.tsx`
- `/components/interfaces/Database/MongoDB/DocumentEditor.tsx`
- `/components/interfaces/Database/DatabaseSwitcher.tsx`
- `/tests/e2e/redis-management.spec.ts`
- `/tests/e2e/mongodb-management.spec.ts`

**Success Criteria:**

- [ ] Can manage Redis connections from UI
- [ ] Can browse and edit Redis keys from UI
- [ ] Can browse MongoDB databases from UI
- [ ] Can query and edit MongoDB documents from UI
- [ ] Database switcher works seamlessly
- [ ] E2E tests pass

---

## Security Implementation

### 1. Authentication & Authorization

```typescript
// Every endpoint uses the existing auth wrapper
export default (req, res) => apiWrapper(req, res, handler, { withAuth: true })

// Enhanced authorization for database operations
const { authorized, error } = await requirePermission(req, projectRef, 'write')
if (!authorized) {
  return res.status(403).json({ error: { message: 'Permission denied' } })
}
```

### 2. Data Protection

**Connection String Encryption:**

```typescript
// All passwords and connection strings encrypted at rest
const ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY
const ALGORITHM = 'aes-256-gcm'

function encryptConnectionString(str: string): { encrypted; iv; authTag }
function decryptConnectionString(encrypted, iv, authTag): string
```

### 3. Query Sanitization

**MongoDB Query Protection:**

```typescript
// Prevent NoSQL injection
const dangerousOperators = ['$where', '$function', '$accumulator']

function sanitizeMongoQuery(query: any): any {
  // Recursively check for dangerous operators
  // Throw QueryError if found
}
```

### 4. Rate Limiting

```typescript
// Per-user rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function rateLimit(req, res, maxRequests = 100, windowMs = 60000): boolean {
  // Return false and send 429 if limit exceeded
}
```

---

## Performance Optimizations

### 1. Connection Pooling

- Reuse database connections across requests
- Maximum 10 connections per database per project
- Automatic cleanup of idle connections (5-minute timeout)

### 2. Caching Strategy

- Connection metadata: 5 minutes TTL
- Database lists: 1 minute TTL
- Collection/table schemas: 10 minutes TTL
- Server info: 30 seconds TTL

### 3. Query Optimization

- Indexed lookups in platform database
- Pagination for all list endpoints (max 1000 items)
- Projection to limit data transfer
- Batch operations where supported

### 4. Monitoring

- Request latency tracking per database type
- Error rate monitoring
- Connection pool utilization metrics
- Cache hit rate analysis

---

## Testing Strategy

### Unit Tests

```typescript
// Example: Redis client tests
describe('RedisClient', () => {
  it('should connect and ping', async () => {
    const client = new RedisClient({ connection: testConnection })
    await client.connect()
    const latency = await client.ping()
    expect(latency).toBeGreaterThan(0)
    await client.disconnect()
  })
})
```

### Integration Tests

```typescript
// Example: API endpoint tests
describe('GET /api/platform/redis/[ref]/keys', () => {
  it('should list keys with authentication', async () => {
    const response = await fetch('/api/platform/redis/default/keys?pattern=test:*', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })
    expect(response.status).toBe(200)
  })
})
```

### End-to-End Tests

```typescript
// Example: Playwright test
test('Create Redis key via UI', async ({ page }) => {
  await page.goto('/project/default/databases/redis')
  await page.click('button:has-text("New Key")')
  await page.fill('input[name="key"]', 'test:key')
  await page.fill('input[name="value"]', 'test value')
  await page.click('button:has-text("Create")')
  await expect(page.locator('text=test:key')).toBeVisible()
})
```

---

## Deployment Checklist

### Environment Variables (Railway)

```bash
# Platform Database
DATABASE_URL=postgresql://...

# Encryption Keys
PG_META_CRYPTO_KEY=your-secret-key
DATABASE_ENCRYPTION_KEY=your-aes-256-key

# Platform Mode
NEXT_PUBLIC_IS_PLATFORM=true

# Service URLs
PLATFORM_PG_META_URL=http://pg-meta-service
SUPABASE_PUBLIC_URL=http://your-domain.railway.app
```

### Pre-Deployment Checks

- [ ] All migrations tested on staging database
- [ ] Environment variables configured in Railway
- [ ] Connection string encryption keys generated securely
- [ ] Rate limiting configured
- [ ] Monitoring and logging enabled
- [ ] Error tracking (Sentry) configured
- [ ] Security audit completed
- [ ] Performance testing completed
- [ ] Documentation updated
- [ ] Team training completed

### Post-Deployment Verification

- [ ] Can create Redis connections via API
- [ ] Can create MongoDB connections via API
- [ ] Authentication works correctly
- [ ] Connection pooling is functioning
- [ ] Error handling is working
- [ ] Metrics are being collected
- [ ] No memory leaks detected
- [ ] Response times are acceptable

---

## Key Metrics to Monitor

### Performance Metrics

- API response time (p50, p95, p99)
- Database query latency
- Connection pool utilization
- Cache hit rates

### Reliability Metrics

- Error rates per endpoint
- Database connection failures
- Authentication failures
- Rate limit violations

### Business Metrics

- Number of database connections per project
- Most used database types
- API usage per organization
- Storage growth per database type

---

## Future Enhancements

### Phase 6 (Future)

- [ ] Redis Cluster support
- [ ] MongoDB Sharding support
- [ ] Real-time collaboration on database queries
- [ ] Query builder UI
- [ ] Database backups and restore
- [ ] Migration tools (Postgres to MongoDB, etc.)
- [ ] Performance recommendations
- [ ] Cost optimization insights
- [ ] Multi-region support
- [ ] Advanced monitoring dashboards

---

## Support & Documentation

### Developer Resources

1. **API Documentation:** Auto-generated from TypeScript types
2. **Example Requests:** Included in UNIFIED_API_QUICK_REFERENCE.md
3. **Architecture Diagrams:** Available in API_ARCHITECTURE_DIAGRAM.md
4. **Troubleshooting Guide:** Common issues and solutions

### Getting Help

- Internal documentation: `/docs/database-management/`
- API playground: `/project/[ref]/api-playground`
- Error reference: `/docs/errors/database-api`
- Team contact: #database-api Slack channel

---

## Conclusion

This unified database API design provides:

1. **Consistency:** All database types follow similar REST patterns
2. **Type Safety:** Full TypeScript coverage with strong typing
3. **Security:** Multi-layered authentication, authorization, and encryption
4. **Performance:** Connection pooling, caching, and optimization
5. **Extensibility:** Easy to add new database types in the future
6. **Developer Experience:** Clean APIs with comprehensive documentation

The implementation maintains compatibility with existing Supabase Studio patterns while extending functionality to support Redis and MongoDB through a unified, developer-friendly interface.

**Total Implementation Time:** 5 weeks
**Total New Files:** ~50 files
**Lines of Code:** ~8,000-10,000 LOC
**Test Coverage Target:** 80%+
