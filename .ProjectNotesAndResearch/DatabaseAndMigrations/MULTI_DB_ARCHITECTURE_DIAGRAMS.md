# Multi-Database Architecture - Visual Diagrams

This document provides visual representations of the multi-database architecture for quick reference.

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE STUDIO (Frontend)                          │
│                                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ PostgreSQL │  │   Redis    │  │  MongoDB   │  │  Bun API   │           │
│  │  UI Pages  │  │  UI Pages  │  │  UI Pages  │  │  UI Pages  │           │
│  │            │  │            │  │            │  │            │           │
│  │ • Tables   │  │ • Keys     │  │ • Colls    │  │ • Endpoints│           │
│  │ • Schema   │  │ • Hashes   │  │ • Docs     │  │ • Status   │           │
│  │ • Functions│  │ • Lists    │  │ • Indexes  │  │ • Logs     │           │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘           │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                  │                                          │
│                           React Query Hooks                                 │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   │ HTTP/JSON
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         API ROUTES LAYER (Next.js)                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    /api/platform/databases/*                         │  │
│  │  • GET    /databases              → List all databases               │  │
│  │  • POST   /databases              → Create database                  │  │
│  │  • GET    /databases/[id]         → Get database details            │  │
│  │  • PATCH  /databases/[id]         → Update database                 │  │
│  │  • DELETE /databases/[id]         → Delete database                 │  │
│  │  • POST   /databases/[id]/test    → Test connection                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐      │
│  │ /postgres/*       │  │ /redis/*          │  │ /mongodb/*        │      │
│  │ (Existing)        │  │ (NEW)             │  │ (NEW)             │      │
│  │                   │  │                   │  │                   │      │
│  │ • /tables         │  │ • /keys           │  │ • /collections    │      │
│  │ • /functions      │  │ • /get            │  │ • /documents      │      │
│  │ • /policies       │  │ • /set            │  │ • /stats          │      │
│  │ • /extensions     │  │ • /info           │  │ • /indexes        │      │
│  └────────┬──────────┘  └────────┬──────────┘  └────────┬──────────┘      │
│           │                      │                       │                 │
└───────────┼──────────────────────┼───────────────────────┼─────────────────┘
            │                      │                       │
            │          Connection Manager Layer            │
            ▼                      ▼                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION MANAGER                                     │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ queryPlatform    │  │ RedisHelpers     │  │ MongoHelpers     │         │
│  │ Database()       │  │                  │  │                  │         │
│  │                  │  │ • getKeys()      │  │ • listDatabases()│         │
│  │ Uses pg-meta     │  │ • get()          │  │ • listCollections│         │
│  │ HTTP service     │  │ • set()          │  │ • find()         │         │
│  │                  │  │ • hgetall()      │  │ • stats()        │         │
│  │ Connection via   │  │ • info()         │  │                  │         │
│  │ encrypted string │  │                  │  │ Connection pool  │         │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘         │
│           │                     │                      │                   │
│           │         Connection Pooling & Reuse         │                   │
│           │                     │                      │                   │
└───────────┼─────────────────────┼──────────────────────┼───────────────────┘
            │                     │                      │
            │ Encrypted           │ ioredis              │ mongodb driver
            │ x-connection-       │ TCP connection       │ TCP connection
            │ encrypted           │                      │
            ▼                     ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   pg-meta        │  │   Redis Server   │  │  MongoDB Server  │
│   Service        │  │                  │  │                  │
│   (Railway)      │  │   Port: 6379     │  │   Port: 27017    │
│                  │  │                  │  │                  │
│   Decrypts &     │  │   Data Types:    │  │   Data Types:    │
│   executes SQL   │  │   • Strings      │  │   • Documents    │
│                  │  │   • Hashes       │  │   • Collections  │
│                  │  │   • Lists        │  │   • Databases    │
└────────┬─────────┘  └──────────────────┘  └──────────────────┘
         │
         │ PostgreSQL protocol
         ▼
┌──────────────────┐
│   PostgreSQL     │
│   Database       │
│   (Railway)      │
│                  │
│   Port: 5432     │
│                  │
│   Schemas:       │
│   • platform.*   │
│   • public.*     │
└──────────────────┘


         ┌─────────────────────────────────────┐
         │  Platform Database (PostgreSQL)     │
         │  ================================   │
         │                                     │
         │  Stores ALL database metadata:     │
         │                                     │
         │  ┌────────────────────────────┐    │
         │  │ platform.databases         │    │
         │  │ ─────────────────────────  │    │
         │  │ • id                       │    │
         │  │ • project_id               │    │
         │  │ • name                     │    │
         │  │ • type (enum)              │────┼─→ postgres, redis, mongodb, bun_api
         │  │ • connection_string        │    │   (encrypted)
         │  │ • host, port, db_name      │    │
         │  │ • status                   │    │
         │  │ • config (jsonb)           │    │
         │  └────────────────────────────┘    │
         │                                     │
         └─────────────────────────────────────┘
```

---

## Connection Flow Diagrams

### PostgreSQL Connection Flow (Existing)

```
┌─────────────┐
│ Studio UI   │
└──────┬──────┘
       │
       │ 1. User requests data
       ▼
┌───────────────────────┐
│ API Route             │
│ /api/platform/*/[ref] │
└──────┬────────────────┘
       │
       │ 2. Call queryPlatformDatabase()
       ▼
┌──────────────────────────────┐
│ database.ts                  │
│ • Encrypts DATABASE_URL      │
│ • Constructs HTTP request    │
└──────┬───────────────────────┘
       │
       │ 3. HTTP POST to pg-meta
       │    Headers: x-connection-encrypted
       │    Body: {query, parameters}
       ▼
┌──────────────────────────────┐
│ pg-meta Service              │
│ • Decrypts connection string │
│ • Connects to PostgreSQL     │
│ • Executes SQL query         │
└──────┬───────────────────────┘
       │
       │ 4. PostgreSQL protocol
       ▼
┌──────────────────────────────┐
│ PostgreSQL Database          │
│ • Executes query             │
│ • Returns results            │
└──────┬───────────────────────┘
       │
       │ 5. Results as JSON
       ▼
┌──────────────────────────────┐
│ pg-meta Service              │
│ • Formats response           │
└──────┬───────────────────────┘
       │
       │ 6. HTTP response
       ▼
┌──────────────────────────────┐
│ database.ts                  │
│ • Parses response            │
│ • Returns {data, error}      │
└──────┬───────────────────────┘
       │
       │ 7. Return data to UI
       ▼
┌─────────────┐
│ Studio UI   │
│ • Display   │
└─────────────┘
```

### Redis Connection Flow (NEW)

```
┌─────────────┐
│ Studio UI   │
└──────┬──────┘
       │
       │ 1. User requests Redis data
       ▼
┌───────────────────────────────┐
│ API Route                     │
│ /api/platform/redis/[id]/keys │
└──────┬────────────────────────┘
       │
       │ 2. Get connection string from platform DB
       ▼
┌──────────────────────────────┐
│ queryPlatformDatabase()      │
│ SELECT * FROM databases      │
│ WHERE id = $1 AND type='redis│
└──────┬───────────────────────┘
       │
       │ 3. Call RedisHelpers.getKeys()
       ▼
┌──────────────────────────────┐
│ redis.ts                     │
│ • Get/create Redis client    │
│ • Connection pool lookup     │
└──────┬───────────────────────┘
       │
       │ 4. Reuse or create connection
       ▼
┌──────────────────────────────┐
│ ioredis Client               │
│ • Connected to Redis server  │
│ • Execute KEYS command       │
└──────┬───────────────────────┘
       │
       │ 5. Redis protocol (RESP)
       ▼
┌──────────────────────────────┐
│ Redis Server                 │
│ • Process command            │
│ • Return results             │
└──────┬───────────────────────┘
       │
       │ 6. Results array
       ▼
┌──────────────────────────────┐
│ ioredis Client               │
│ • Parse response             │
└──────┬───────────────────────┘
       │
       │ 7. Return {data, error}
       ▼
┌──────────────────────────────┐
│ API Route                    │
│ • Return JSON response       │
└──────┬───────────────────────┘
       │
       │ 8. Display in UI
       ▼
┌─────────────┐
│ Studio UI   │
│ • Show keys │
└─────────────┘
```

### MongoDB Connection Flow (NEW)

```
┌─────────────┐
│ Studio UI   │
└──────┬──────┘
       │
       │ 1. User requests collections
       ▼
┌─────────────────────────────────────┐
│ API Route                           │
│ /api/platform/mongodb/[id]/collections │
└──────┬──────────────────────────────┘
       │
       │ 2. Get connection string from platform DB
       ▼
┌──────────────────────────────┐
│ queryPlatformDatabase()      │
│ SELECT * FROM databases      │
│ WHERE id=$1 AND type='mongodb│
└──────┬───────────────────────┘
       │
       │ 3. Call MongoHelpers.listCollections()
       ▼
┌──────────────────────────────┐
│ mongodb.ts                   │
│ • Get/create MongoClient     │
│ • Connection pool lookup     │
└──────┬───────────────────────┘
       │
       │ 4. Reuse or create connection
       ▼
┌──────────────────────────────┐
│ MongoDB Client               │
│ • Connected to MongoDB       │
│ • Get database reference     │
└──────┬───────────────────────┘
       │
       │ 5. MongoDB wire protocol
       ▼
┌──────────────────────────────┐
│ MongoDB Server               │
│ • List collections command   │
│ • Return metadata            │
└──────┬───────────────────────┘
       │
       │ 6. BSON response
       ▼
┌──────────────────────────────┐
│ MongoDB Client               │
│ • Parse BSON to JSON         │
└──────┬───────────────────────┘
       │
       │ 7. Return {data, error}
       ▼
┌──────────────────────────────┐
│ API Route                    │
│ • Return JSON response       │
└──────┬───────────────────────┘
       │
       │ 8. Display in UI
       ▼
┌─────────────┐
│ Studio UI   │
│ • Show list │
└─────────────┘
```

---

## Data Flow Diagrams

### Database Registration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ADDS NEW DATABASE                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ 1. Fill form
                           │    • Name: "redis-cache"
                           │    • Type: "redis"
                           │    • Connection: "redis://..."
                           ▼
                  ┌────────────────────┐
                  │ Frontend Form      │
                  │ Validation         │
                  └────────┬───────────┘
                           │
                           │ 2. POST /api/platform/databases
                           │    {name, type, connectionString, ...}
                           ▼
                  ┌────────────────────────────┐
                  │ API Route Handler          │
                  │ • Validate input           │
                  │ • Check required fields    │
                  └────────┬───────────────────┘
                           │
                           │ 3. Test connection
                           ▼
                  ┌────────────────────────────┐
                  │ ConnectionManager          │
                  │ .testConnection(type, url) │
                  └────────┬───────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
    ┌──────────────────┐   ┌──────────────────┐
    │ Test Succeeds    │   │ Test Fails       │
    └────────┬─────────┘   └────────┬─────────┘
             │                      │
             │ 4a. Get project_id   │ 4b. Return error
             ▼                      ▼
    ┌──────────────────┐   ┌──────────────────┐
    │ Query platform   │   │ HTTP 400         │
    │ database for     │   │ "Cannot connect" │
    │ project          │   └──────────────────┘
    └────────┬─────────┘
             │
             │ 5. Insert into platform.databases
             ▼
    ┌──────────────────────────┐
    │ INSERT INTO              │
    │ platform.databases       │
    │ • Encrypt conn string    │
    │ • Set status = 'active'  │
    │ • Record created_at      │
    └────────┬─────────────────┘
             │
             │ 6. Return created database
             ▼
    ┌──────────────────────────┐
    │ HTTP 201 Created         │
    │ {id, name, type, ...}    │
    └────────┬─────────────────┘
             │
             │ 7. Update UI
             ▼
    ┌──────────────────────────┐
    │ Frontend shows success   │
    │ • Refresh database list  │
    │ • Navigate to details    │
    └──────────────────────────┘
```

### Database Query Flow (Redis Example)

```
┌────────────────────────────────────────────────────────────┐
│              USER BROWSES REDIS KEYS                        │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │ 1. Navigate to Redis browser
                           ▼
                  ┌────────────────────┐
                  │ Frontend Page      │
                  │ /databases/[id]    │
                  └────────┬───────────┘
                           │
                           │ 2. useRedisKeys() hook
                           │    GET /api/platform/redis/[id]/keys
                           ▼
                  ┌────────────────────────────┐
                  │ API Route                  │
                  │ redis/[id]/keys/index.ts   │
                  └────────┬───────────────────┘
                           │
                           │ 3. Get database metadata
                           ▼
                  ┌────────────────────────────┐
                  │ queryPlatformDatabase()    │
                  │ SELECT * FROM databases    │
                  │ WHERE id = $1              │
                  └────────┬───────────────────┘
                           │
                           │ 4. Database record
                           │    {connection_string: "...", ...}
                           ▼
                  ┌────────────────────────────┐
                  │ RedisHelpers.getKeys()     │
                  │ • pattern = "*"            │
                  │ • connectionString         │
                  └────────┬───────────────────┘
                           │
                           │ 5. Get/create connection
                           ▼
                  ┌────────────────────────────┐
                  │ Connection Pool Lookup     │
                  │ • Check if exists          │
                  │ • Create if needed         │
                  └────────┬───────────────────┘
                           │
                           │ 6. Execute Redis command
                           ▼
                  ┌────────────────────────────┐
                  │ redis.keys('*')            │
                  │ → Returns: ['key1', 'key2']│
                  └────────┬───────────────────┘
                           │
                           │ 7. Return {data, error}
                           ▼
                  ┌────────────────────────────┐
                  │ API Response               │
                  │ {data: ['key1', 'key2']}   │
                  └────────┬───────────────────┘
                           │
                           │ 8. React Query caches
                           ▼
                  ┌────────────────────────────┐
                  │ Frontend displays keys     │
                  │ • List view                │
                  │ • Search/filter            │
                  └────────────────────────────┘
```

---

## Connection Pool Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   CONNECTION POOL MANAGER                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ PostgreSQL Connections (via pg-meta - external)        │    │
│  │ • Managed by pg-meta service                          │    │
│  │ • No direct pooling in Studio                         │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Redis Connection Pool (ioredis)                        │    │
│  │ ───────────────────────────────────────────────────   │    │
│  │                                                         │    │
│  │  Map<connectionString, RedisClient>                    │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │ "redis://db1" → Client { status: "ready",       │  │    │
│  │  │                          lastUsed: timestamp,    │  │    │
│  │  │                          connections: 1 }        │  │    │
│  │  ├─────────────────────────────────────────────────┤  │    │
│  │  │ "redis://db2" → Client { status: "connecting",  │  │    │
│  │  │                          lastUsed: timestamp,    │  │    │
│  │  │                          connections: 0 }        │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  │  Pool Configuration:                                   │    │
│  │  • maxConnections: 10                                 │    │
│  │  • connectTimeout: 10000ms                            │    │
│  │  • commandTimeout: 5000ms                             │    │
│  │  • retryStrategy: exponential backoff                 │    │
│  │  • keepAlive: true                                    │    │
│  │                                                         │    │
│  │  Eviction Strategy (when pool full):                  │    │
│  │  1. Remove disconnected clients first                 │    │
│  │  2. Remove least recently used (LRU)                  │    │
│  │  3. Remove oldest connection                          │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ MongoDB Connection Pool (mongodb driver)               │    │
│  │ ───────────────────────────────────────────────────   │    │
│  │                                                         │    │
│  │  Map<connectionString, MongoClient>                    │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │ "mongodb://db1" → Client {                      │  │    │
│  │  │                     poolSize: 5/10,              │  │    │
│  │  │                     status: "connected",         │  │    │
│  │  │                     lastUsed: timestamp }        │  │    │
│  │  ├─────────────────────────────────────────────────┤  │    │
│  │  │ "mongodb://db2" → Client {                      │  │    │
│  │  │                     poolSize: 2/10,              │  │    │
│  │  │                     status: "connected",         │  │    │
│  │  │                     lastUsed: timestamp }        │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  │  Pool Configuration:                                   │    │
│  │  • maxPoolSize: 10                                    │    │
│  │  • minPoolSize: 2                                     │    │
│  │  • maxIdleTimeMS: 30000                               │    │
│  │  • waitQueueTimeoutMS: 10000                          │    │
│  │  • retryWrites: true                                  │    │
│  │  • retryReads: true                                   │    │
│  │                                                         │    │
│  │  Health Monitoring:                                    │    │
│  │  • Periodic ping every 30s                            │    │
│  │  • Auto-reconnect on failure                          │    │
│  │  • Remove dead clients from pool                      │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  Pool Statistics (Exposed via /api/stats):                    │
│  • Total connections: 12                                      │
│  • Active connections: 8                                      │
│  • Idle connections: 4                                        │
│  • Failed connections: 0                                      │
│  • Average latency: 23ms                                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Security Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                            │
└────────────────────────────────────────────────────────────────┘

Layer 1: Network Security
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────┐
│ Railway Internal Network                     │
│ • Studio ↔ Redis (internal URL)             │
│ • Studio ↔ MongoDB (internal URL)           │
│ • Studio ↔ PostgreSQL (internal URL)        │
│ • No public internet exposure               │
│ • Automatic SSL/TLS                          │
└──────────────────────────────────────────────┘

Layer 2: Connection String Encryption
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────┐
│ crypto-js AES Encryption                     │
│                                               │
│ Plain:                                       │
│ "redis://user:pass@host:6379"                │
│          ↓                                   │
│ Key: process.env.PG_META_CRYPTO_KEY          │
│          ↓                                   │
│ Encrypted:                                   │
│ "U2FsdGVkX1+Wq3..."                          │
│                                               │
│ Stored in:                                   │
│ • platform.databases.connection_string       │
│ • Sent in HTTP headers                       │
│                                               │
│ Never:                                       │
│ • Logged in plaintext                        │
│ • Stored in browser localStorage             │
│ • Sent in URL parameters                     │
└──────────────────────────────────────────────┘

Layer 3: Database Access Control
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────┐
│ Platform Database (PostgreSQL)               │
│                                               │
│ • Row-level security (future)                │
│ • User-based access control                  │
│ • Audit logging of all queries               │
│                                               │
│ Example:                                     │
│ CREATE POLICY user_databases                 │
│   ON platform.databases                      │
│   FOR SELECT                                 │
│   USING (user_id = current_user_id());       │
└──────────────────────────────────────────────┘

Layer 4: API Authentication
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────┐
│ Next.js API Middleware                       │
│                                               │
│ • JWT verification                           │
│ • Session validation                         │
│ • Rate limiting per IP                       │
│ • CORS headers                               │
│                                               │
│ Example:                                     │
│ if (!isAuthenticated(req)) {                 │
│   return res.status(401)                     │
│ }                                            │
└──────────────────────────────────────────────┘

Layer 5: Input Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────┐
│ Request Validation                           │
│                                               │
│ • Zod schema validation                      │
│ • SQL injection prevention                   │
│ • NoSQL injection prevention                 │
│ • Connection string format validation        │
│                                               │
│ Example:                                     │
│ const schema = z.object({                    │
│   name: z.string().min(1).max(50),          │
│   type: z.enum(['redis', 'mongodb']),       │
│   connectionString: z.string().url()        │
│ })                                           │
└──────────────────────────────────────────────┘

Security Flow for Database Creation:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User → [1. JWT Auth] → [2. Input Validate] →
  [3. Test Connection] → [4. Encrypt String] →
    [5. Store in DB] → [6. Audit Log] → Success
```

---

## Deployment Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT TOPOLOGY                          │
└────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   VERCEL (Frontend + API)                     │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Supabase Studio (Next.js)                            │    │
│  │ • Static pages (SSG)                                 │    │
│  │ • API routes (Serverless Functions)                  │    │
│  │ • Environment variables (secrets)                    │    │
│  │                                                       │    │
│  │ Environment Variables:                               │    │
│  │ • DATABASE_URL (platform DB)                         │    │
│  │ • REDIS_URL (Railway public URL)                     │    │
│  │ • MONGODB_URL (Railway public URL)                   │    │
│  │ • PG_META_CRYPTO_KEY                                 │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  Region: US-East-1                                            │
│  Auto-scaling: Yes                                            │
│  Edge caching: Yes                                            │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ HTTPS (public URLs)
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                   RAILWAY (Backend Services)                  │
│                                                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │
│  │ PostgreSQL    │  │ Redis         │  │ MongoDB       │    │
│  │ • Platform DB │  │ • Cache       │  │ • Documents   │    │
│  │ • Port: 5432  │  │ • Port: 6379  │  │ • Port: 27017 │    │
│  │               │  │               │  │               │    │
│  │ Internal:     │  │ Internal:     │  │ Internal:     │    │
│  │ postgres      │  │ redis         │  │ mongodb       │    │
│  │ .railway      │  │ .railway      │  │ .railway      │    │
│  │ .internal     │  │ .internal     │  │ .internal     │    │
│  │               │  │               │  │               │    │
│  │ Public:       │  │ Public:       │  │ Public:       │    │
│  │ roundhouse    │  │ redis-prod    │  │ mongodb-prod  │    │
│  │ .proxy.rlwy   │  │ .up.railway   │  │ .up.railway   │    │
│  │ .net:12345    │  │ .app:6379     │  │ .app:27017    │    │
│  └───────────────┘  └───────────────┘  └───────────────┘    │
│                                                                │
│  ┌───────────────┐  ┌───────────────┐                        │
│  │ pg-meta       │  │ Bun API       │                        │
│  │ • Port: 3001  │  │ • Port: 3000  │                        │
│  │               │  │               │                        │
│  │ Internal:     │  │ Internal:     │                        │
│  │ postgres-meta │  │ bun-server    │                        │
│  │ .railway      │  │ .railway      │                        │
│  │ .internal     │  │ .internal     │                        │
│  │               │  │               │                        │
│  │ Public:       │  │ Public:       │                        │
│  │ postgres-meta │  │ bun-server    │                        │
│  │ -prod.up      │  │ -prod.up      │                        │
│  │ .railway.app  │  │ .railway.app  │                        │
│  └───────────────┘  └───────────────┘                        │
│                                                                │
│  Region: US-West-2                                            │
│  Private Network: ✓                                           │
│  Automatic SSL: ✓                                             │
└────────────────────────────────────────────────────────────────┘

Connection Strategies:
━━━━━━━━━━━━━━━━━━━━━

Vercel → Railway:
  • Use PUBLIC URLs (roundhouse.proxy.rlwy.net, *.up.railway.app)
  • HTTPS with SSL verification
  • Slower (goes through internet)
  • Metered bandwidth

Railway → Railway:
  • Use INTERNAL URLs (*.railway.internal)
  • Direct private network
  • Faster (same datacenter)
  • Free bandwidth
```

---

## Error Handling Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING STRATEGY                      │
└────────────────────────────────────────────────────────────────┘

API Request
     │
     ▼
┌──────────────────────────────────────┐
│ 1. Input Validation                  │
│    Zod schema check                  │
└────┬─────────────────────────────────┘
     │ ✓ Valid
     ▼
┌──────────────────────────────────────┐
│ 2. Authentication                    │
│    JWT/Session check                 │
└────┬─────────────────────────────────┘
     │ ✓ Authenticated
     ▼
┌──────────────────────────────────────┐
│ 3. Database Connection               │
│    Get from pool or create           │
└────┬─────────────────────────────────┘
     │
     ├─ ❌ Connection Failed ──→ Retry Logic
     │                            │
     │                            ├─ Retry 1 (50ms delay)
     │                            ├─ Retry 2 (100ms delay)
     │                            ├─ Retry 3 (200ms delay)
     │                            │
     │                            └─ ❌ Still Failed
     │                                 │
     │                                 ▼
     │                            ┌──────────────────────┐
     │                            │ Log error            │
     │                            │ Remove from pool     │
     │                            │ Return 503           │
     │                            │ {retryable: true}    │
     │                            └──────────────────────┘
     │
     │ ✓ Connected
     ▼
┌──────────────────────────────────────┐
│ 4. Execute Operation                 │
│    Query/Command                     │
└────┬─────────────────────────────────┘
     │
     ├─ ❌ Timeout ──────────────→ ┌──────────────────────┐
     │                             │ Log timeout          │
     │                             │ Return 504           │
     │                             │ {retryable: true}    │
     │                             └──────────────────────┘
     │
     ├─ ❌ Auth Error ───────────→ ┌──────────────────────┐
     │                             │ Log auth failure     │
     │                             │ Return 401           │
     │                             │ {retryable: false}   │
     │                             └──────────────────────┘
     │
     ├─ ❌ Query Error ──────────→ ┌──────────────────────┐
     │                             │ Parse error          │
     │                             │ Sanitize message     │
     │                             │ Return 400           │
     │                             │ {retryable: false}   │
     │                             └──────────────────────┘
     │
     │ ✓ Success
     ▼
┌──────────────────────────────────────┐
│ 5. Format Response                   │
│    {data: ..., error: null}          │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ 6. Return to Client                  │
│    HTTP 200 OK                       │
└──────────────────────────────────────┘

Error Response Format:
━━━━━━━━━━━━━━━━━━━━━
{
  "error": {
    "code": "DB_CONNECTION_FAILED",
    "message": "Unable to connect to database",
    "details": "ECONNREFUSED",
    "retryable": true,
    "timestamp": "2025-11-20T18:54:45Z",
    "requestId": "uuid-here"
  }
}

Graceful Degradation:
━━━━━━━━━━━━━━━━━━━━━

Platform Database Unavailable
       ↓
Use cached data (if available)
       ↓
Return default/fallback data
       ↓
Show user-friendly error message

Example:
if (!process.env.DATABASE_URL) {
  return defaultProfile
}

const {data, error} = await query()
if (error) {
  return defaultProfile  // Fallback
}
```

---

**Last Updated**: November 20, 2025
**Version**: 1.0
