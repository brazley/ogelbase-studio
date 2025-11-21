# Unified Database API - Architecture Diagram

## High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Supabase Studio                              │
│                        (Next.js Frontend)                            │
└────────────┬────────────────────────────────────────────────────────┘
             │
             │ HTTP/WebSocket Requests
             │ Authorization: Bearer <JWT>
             │
┌────────────▼────────────────────────────────────────────────────────┐
│                     API Layer (Next.js API Routes)                   │
│  /pages/api/platform/                                                │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Postgres   │  │    Redis     │  │   MongoDB    │              │
│  │   /pg-meta/  │  │   /redis/    │  │  /mongodb/   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                      │
└─────────┼──────────────────┼──────────────────┼──────────────────────┘
          │                  │                  │
          │  ┌───────────────┼──────────────────┼──────────────┐
          │  │          API Wrapper Layer                       │
          │  │  - apiWrapper() with auth                        │
          │  │  - apiAuthenticate()                             │
          │  │  - JWT validation                                │
          │  └───────────────┬──────────────────┬──────────────┘
          │                  │                  │
          │  ┌───────────────▼──────────────────▼──────────────┐
          │  │      Database Client Abstraction                 │
          │  │  - createDatabaseClient()                        │
          │  │  - RedisClient, MongoDBClient, PostgresClient   │
          │  │  - Connection Pool Manager                       │
          │  └───────────────┬──────────────────┬──────────────┘
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────────┐
│                    Platform Database (Postgres)               │
│  Schema: platform.*                                           │
│                                                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ organizations   │  │ database_connections             │  │
│  ├─────────────────┤  ├──────────────────────────────────┤  │
│  │ - id            │  │ - id                             │  │
│  │ - name          │  │ - project_id (FK)                │  │
│  │ - slug          │  │ - database_type (enum)           │  │
│  └─────────────────┘  │ - identifier                     │  │
│                       │ - host, port                      │  │
│  ┌─────────────────┐  │ - connection details             │  │
│  │ projects        │  │ - options (JSONB)                │  │
│  ├─────────────────┤  │ - is_primary, status             │  │
│  │ - id            │  └──────────────────────────────────┘  │
│  │ - org_id (FK)   │                                        │
│  │ - ref           │  ┌──────────────────────────────────┐  │
│  │ - name          │  │ credentials                      │  │
│  │ - db_host       │  ├──────────────────────────────────┤  │
│  │ - db_port       │  │ - id                             │  │
│  │ - pg_meta_url   │  │ - project_id (FK)                │  │
│  │ - supabase_url  │  │ - anon_key                       │  │
│  └─────────────────┘  │ - service_role_key               │  │
│                       │ - jwt_secret                      │  │
│                       └──────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────▼─────────┐ ┌───────▼───────┐ ┌────────▼──────────┐
│ PostgreSQL        │ │ Redis         │ │ MongoDB           │
│ (Project DBs)     │ │ (Cache Layer) │ │ (Document Store)  │
│                   │ │               │ │                   │
│ - Tables          │ │ - Keys        │ │ - Databases       │
│ - Views           │ │ - Pub/Sub     │ │ - Collections     │
│ - Functions       │ │ - Streams     │ │ - Documents       │
│ - Extensions      │ │ - Sets/Lists  │ │ - Indexes         │
└───────────────────┘ └───────────────┘ └───────────────────┘
```

---

## Request Flow - Detailed

### 1. Authentication Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │ 1. HTTP Request
     │    Authorization: Bearer <JWT>
     ▼
┌─────────────────────┐
│  API Route Handler  │
│  (Next.js)          │
└────┬────────────────┘
     │ 2. apiWrapper(req, res, handler, { withAuth: true })
     ▼
┌─────────────────────┐
│   apiWrapper()      │
└────┬────────────────┘
     │ 3. Check IS_PLATFORM flag
     │ 4. Call apiAuthenticate(req, res)
     ▼
┌─────────────────────┐
│ apiAuthenticate()   │
└────┬────────────────┘
     │ 5. Extract JWT from header
     │ 6. getUserClaims(token)
     ▼
┌─────────────────────┐
│   GoTrue Service    │
│   (Auth Server)     │
└────┬────────────────┘
     │ 7. Validate JWT
     │ 8. Return user claims
     ▼
┌─────────────────────┐
│   API Handler       │
│   (Business Logic)  │
└─────────────────────┘
```

### 2. Database Query Flow (Redis Example)

```
┌─────────┐
│ Client  │
└────┬────┘
     │ GET /api/platform/redis/[ref]/keys?pattern=user:*
     ▼
┌──────────────────────────────────────────┐
│  /redis/[ref]/keys/index.ts              │
│                                          │
│  1. Extract ref from req.query           │
│  2. withDatabaseClient(ref, 'redis', fn) │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  withDatabaseClient()                    │
│  (lib/api/database/helpers.ts)           │
│                                          │
│  3. getDatabaseConnection(ref, 'redis')  │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  queryPlatformDatabase()                 │
│  (lib/api/platform/database.ts)          │
│                                          │
│  4. Query platform.database_connections  │
│     WHERE project_ref = $1               │
│     AND database_type = 'redis'          │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  Platform Database                       │
│                                          │
│  5. Return connection details            │
│     { host, port, password, options }    │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  poolManager.getClient(connectionId)     │
│  (lib/api/database/pool-manager.ts)      │
│                                          │
│  6. Check connection pool                │
│  7. Create or reuse RedisClient          │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  RedisClient                             │
│  (lib/api/database/client.ts)            │
│                                          │
│  8. Execute client.scan(pattern)         │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  Redis Server                            │
│                                          │
│  9. SCAN command execution               │
│  10. Return keys matching pattern        │
└────┬─────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│  API Handler                             │
│                                          │
│  11. Format response                     │
│  12. Return { data: [...], cursor: 0 }   │
└────┬─────────────────────────────────────┘
     │
     ▼
┌─────────┐
│ Client  │
│ (JSON)  │
└─────────┘
```

---

## File Structure Map

```
apps/studio/
│
├── database/
│   └── migrations/
│       ├── 001_create_platform_schema.sql
│       └── 002_add_multi_database_support.sql    [NEW]
│
├── lib/
│   ├── api/
│   │   ├── apiWrapper.ts                         [EXISTING]
│   │   ├── apiAuthenticate.ts                    [EXISTING]
│   │   ├── authorization.ts                      [NEW]
│   │   │
│   │   ├── platform/
│   │   │   ├── database.ts                       [EXISTING]
│   │   │   ├── jwt.ts                            [EXISTING]
│   │   │   ├── project-utils.ts                  [EXISTING]
│   │   │   └── database-types.ts                 [NEW]
│   │   │
│   │   ├── database/                             [NEW FOLDER]
│   │   │   ├── client.ts                         [NEW]
│   │   │   ├── pool-manager.ts                   [NEW]
│   │   │   ├── helpers.ts                        [NEW]
│   │   │   └── errors.ts                         [NEW]
│   │   │
│   │   └── self-hosted/
│   │       └── types.ts                          [EXISTING]
│   │
│   └── constants/
│       ├── index.ts                              [EXISTING]
│       └── api.ts                                [EXISTING]
│
└── pages/api/platform/
    │
    ├── pg-meta/[ref]/                            [EXISTING]
    │   ├── query/index.ts
    │   ├── tables.ts
    │   └── views.ts
    │
    ├── redis/[ref]/                              [NEW FOLDER]
    │   ├── connections/
    │   │   ├── index.ts                          [NEW]
    │   │   └── [id]/
    │   │       ├── index.ts                      [NEW]
    │   │       └── test.ts                       [NEW]
    │   │
    │   ├── keys/
    │   │   ├── index.ts                          [NEW]
    │   │   └── [key]/
    │   │       ├── index.ts                      [NEW]
    │   │       └── expire.ts                     [NEW]
    │   │
    │   ├── pubsub/
    │   │   ├── channels.ts                       [NEW]
    │   │   ├── publish.ts                        [NEW]
    │   │   └── subscribe.ts                      [NEW]
    │   │
    │   ├── info.ts                               [NEW]
    │   └── stats.ts                              [NEW]
    │
    └── mongodb/[ref]/                            [NEW FOLDER]
        ├── connections/
        │   ├── index.ts                          [NEW]
        │   └── [id]/
        │       ├── index.ts                      [NEW]
        │       └── test.ts                       [NEW]
        │
        └── databases/
            ├── index.ts                          [NEW]
            └── [db]/
                ├── stats.ts                      [NEW]
                └── collections/
                    ├── index.ts                  [NEW]
                    └── [coll]/
                        ├── index.ts              [NEW]
                        ├── documents/
                        │   ├── index.ts          [NEW]
                        │   └── [id]/
                        │       └── index.ts      [NEW]
                        │
                        ├── aggregate.ts          [NEW]
                        └── indexes/
                            ├── index.ts          [NEW]
                            └── [name]/
                                └── index.ts      [NEW]
```

---

## API Endpoint Map

### Existing Postgres APIs

```
/api/platform/pg-meta/[ref]/
├── query/              POST    Execute SQL query
├── tables              GET     List tables
├── views               GET     List views
├── policies            GET     List RLS policies
├── triggers            GET     List triggers
├── extensions          GET     List extensions
└── types               GET     List custom types
```

### New Redis APIs

```
/api/platform/redis/[ref]/
├── connections/
│   ├── /               GET     List all Redis connections
│   ├── /               POST    Create new connection
│   └── [id]/
│       ├── /           PUT     Update connection
│       ├── /           DELETE  Remove connection
│       └── test        POST    Test connection
│
├── keys/
│   ├── /               GET     List keys (SCAN)
│   └── [key]/
│       ├── /           GET     Get key value & metadata
│       ├── /           POST    Set key value
│       ├── /           PUT     Update key
│       ├── /           DELETE  Delete key
│       └── expire      POST    Set/update TTL
│
├── pubsub/
│   ├── channels        GET     List active channels
│   ├── publish         POST    Publish message
│   └── subscribe       WS      Subscribe to channels
│
├── info                GET     Server information
└── stats               GET     Real-time statistics
```

### New MongoDB APIs

```
/api/platform/mongodb/[ref]/
├── connections/
│   ├── /               GET     List MongoDB connections
│   ├── /               POST    Create connection
│   └── [id]/
│       ├── /           PUT     Update connection
│       ├── /           DELETE  Remove connection
│       └── test        POST    Test connection
│
└── databases/
    ├── /               GET     List databases
    └── [db]/
        ├── stats       GET     Database statistics
        └── collections/
            ├── /       GET     List collections
            ├── /       POST    Create collection
            └── [coll]/
                ├── /               DELETE  Drop collection
                │
                ├── documents/
                │   ├── /           GET     Query documents
                │   ├── /           POST    Insert document(s)
                │   └── [id]/
                │       ├── /       GET     Get document by ID
                │       ├── /       PUT     Update document
                │       └── /       DELETE  Delete document
                │
                ├── aggregate       POST    Run aggregation
                │
                └── indexes/
                    ├── /           GET     List indexes
                    ├── /           POST    Create index
                    └── [name]/
                        └── /       DELETE  Drop index
```

---

## Data Flow Diagrams

### Connection Pool Management

```
┌─────────────────────────────────────────────────────┐
│              Connection Pool Manager                 │
│                                                      │
│  Pool Map: Map<string, PoolEntry>                   │
│                                                      │
│  Key Format: "{project_id}:{db_type}:{conn_id}"    │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ PoolEntry:                                    │  │
│  │  - client: DatabaseClient                     │  │
│  │  - lastUsed: timestamp                        │  │
│  │  - inUse: boolean                             │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Operations:                                         │
│  ├── getClient(connId, projectRef)                 │
│  │    ├── Lookup connection from platform DB       │
│  │    ├── Check pool for existing client           │
│  │    ├── Create new if not found                  │
│  │    └── Mark as inUse, update lastUsed           │
│  │                                                  │
│  ├── releaseClient(connId, projectId, dbType)     │
│  │    ├── Mark as not inUse                        │
│  │    └── Update lastUsed                          │
│  │                                                  │
│  └── cleanupIdleConnections()                      │
│       ├── Check all pool entries                   │
│       ├── Disconnect if idle > 5min                │
│       └── Remove from pool                         │
│                                                      │
│  Cleanup Timer: Every 60 seconds                    │
└─────────────────────────────────────────────────────┘
```

### Database Client Abstraction

```
┌────────────────────────────────────────────────────────────────┐
│                   DatabaseClient Interface                      │
│                                                                 │
│  Methods (common to all database types):                       │
│  ├── connect(): Promise<void>                                  │
│  ├── disconnect(): Promise<void>                               │
│  ├── ping(): Promise<number>                                   │
│  └── getInfo(): Promise<any>                                   │
└────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  RedisClient     │ │  MongoDBClient   │ │ PostgresClient   │
├──────────────────┤ ├──────────────────┤ ├──────────────────┤
│                  │ │                  │ │                  │
│ Uses: ioredis    │ │ Uses: mongodb    │ │ Uses: pg.Pool    │
│                  │ │ driver           │ │                  │
│ Extra Methods:   │ │                  │ │ Extra Methods:   │
│ - get()          │ │ Extra Methods:   │ │ - query()        │
│ - set()          │ │ - getDb()        │ │                  │
│ - del()          │ │ - listDatabases()│ │                  │
│ - scan()         │ │ - listColls()    │ │                  │
│ - type()         │ │                  │ │                  │
│ - ttl()          │ │                  │ │                  │
│ - publish()      │ │                  │ │                  │
│ - subscribe()    │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## Security Layers

```
┌─────────────────────────────────────────────────────────┐
│                  Security Architecture                   │
└─────────────────────────────────────────────────────────┘

Layer 1: Transport Security
├── HTTPS/WSS only in production
├── TLS for database connections (Redis, MongoDB, Postgres)
└── Certificate validation

Layer 2: Authentication
├── JWT token validation (GoTrue)
├── Token extraction from Authorization header
├── User claims verification
└── Session management

Layer 3: Authorization
├── Project ownership verification
├── Permission level checks (owner/admin/developer/viewer)
├── Resource-level access control
└── Operation-level permissions (read/write/admin)

Layer 4: Data Protection
├── Connection string encryption (AES-256-GCM)
├── Password encryption in platform DB
├── JWT secret protection
└── Environment variable security

Layer 5: Query Protection
├── SQL injection prevention (parameterized queries)
├── NoSQL injection prevention (query sanitization)
├── Input validation
└── Output encoding

Layer 6: Rate Limiting
├── Per-user request limits
├── Per-endpoint throttling
├── Burst protection
└── DDoS mitigation

Layer 7: Audit & Monitoring
├── Request logging
├── Error tracking
├── Performance monitoring
└── Security event alerts
```

---

## Error Handling Flow

```
┌────────────────────────────────────────────────────────┐
│                    Error Hierarchy                      │
└────────────────────────────────────────────────────────┘

Error (JavaScript native)
  │
  ├── DatabaseError (base class)
  │     ├── code: string
  │     ├── statusCode: number
  │     └── details?: any
  │
  ├── ConnectionError extends DatabaseError
  │     └── statusCode: 503
  │
  ├── QueryError extends DatabaseError
  │     └── statusCode: 400
  │
  ├── AuthenticationError extends DatabaseError
  │     └── statusCode: 401
  │
  ├── NotFoundError extends DatabaseError
  │     └── statusCode: 404
  │
  └── PgMetaDatabaseError (existing)
        ├── code: string
        ├── statusCode: number
        └── formattedError: string

Error Handler Flow:
┌─────────────┐
│ Try Block   │
│ (Operation) │
└──────┬──────┘
       │ Error thrown
       ▼
┌─────────────────────────┐
│ Catch Block             │
│                         │
│ if (error instanceof    │
│     DatabaseError)      │
│   → Return with         │
│     error.statusCode    │
│                         │
│ else if (Error)         │
│   → Return 500          │
│                         │
│ else                    │
│   → Return 500          │
│     "Unknown error"     │
└─────────────────────────┘
```

---

## Deployment Architecture (Railway)

```
┌───────────────────────────────────────────────────────────────┐
│                        Railway Environment                     │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Supabase Studio (Bun Server)                          │  │
│  │  - Next.js frontend                                    │  │
│  │  - API routes                                          │  │
│  │  - Connection pool manager                             │  │
│  │  - Environment: NODE_ENV=production                    │  │
│  └────────────────┬───────────────────────────────────────┘  │
│                   │                                           │
│  ┌────────────────▼───────────────────────────────────────┐  │
│  │  Platform Database (PostgreSQL)                        │  │
│  │  - platform.* schema                                   │  │
│  │  - Organizations, projects, connections, credentials   │  │
│  │  - Environment: DATABASE_URL                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  External Database Connections:                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Project      │  │ Redis        │  │ MongoDB      │       │
│  │ PostgreSQL   │  │ Instance     │  │ Instance     │       │
│  │ (per project)│  │ (per project)│  │ (per project)│       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                                │
│  Environment Variables:                                       │
│  - DATABASE_URL (platform DB)                                │
│  - PG_META_CRYPTO_KEY (encryption)                           │
│  - DATABASE_ENCRYPTION_KEY (connection strings)              │
│  - SUPABASE_PUBLIC_URL                                       │
│  - NEXT_PUBLIC_IS_PLATFORM=true                              │
└───────────────────────────────────────────────────────────────┘
```

---

## Performance Optimization Strategies

```
┌────────────────────────────────────────────────────────┐
│              Performance Optimization                   │
└────────────────────────────────────────────────────────┘

1. Connection Pooling
   ├── Reuse database connections
   ├── Max 10 connections per database
   ├── Idle timeout: 5 minutes
   └── Automatic cleanup

2. Caching
   ├── Connection metadata (5 min TTL)
   ├── Database lists (1 min TTL)
   ├── Collection/table schemas (10 min TTL)
   └── Server info (30 sec TTL)

3. Query Optimization
   ├── Indexed lookups in platform DB
   ├── Pagination for large result sets
   ├── Projection to limit data transfer
   └── Batch operations where possible

4. API Optimization
   ├── Response compression (gzip)
   ├── Streaming for large responses
   ├── Rate limiting per user
   └── Request deduplication

5. Network Optimization
   ├── HTTP/2 for multiplexing
   ├── Keep-alive connections
   ├── CDN for static assets
   └── WebSocket for real-time features

6. Monitoring
   ├── Response time tracking
   ├── Error rate monitoring
   ├── Connection pool metrics
   └── Resource utilization alerts
```

This comprehensive architecture ensures scalability, security, and performance for the unified database management system.
