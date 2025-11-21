# Multi-Database Quick Start Guide
**For rapid implementation of Redis + MongoDB + Bun API support in Supabase Studio**

---

## TL;DR - What You Need to Know

You're adding Redis, MongoDB, and Bun API management to Supabase Studio. Here's the current state and what needs to happen:

### Current Architecture (PostgreSQL Only)
```
Studio → API Routes → queryPlatformDatabase() → pg-meta Service → PostgreSQL
```

### Target Architecture (Multi-Database)
```
Studio → API Routes → Connection Manager → {
  PostgreSQL (via pg-meta - existing)
  Redis (via ioredis - NEW)
  MongoDB (via mongodb driver - NEW)
  Bun API (via fetch - NEW)
}
```

---

## Quick Implementation Checklist

### Step 1: Install Dependencies (5 minutes)
```bash
cd apps/studio
npm install ioredis mongodb
npm install --save-dev @types/ioredis @types/mongodb
```

### Step 2: Add Connection Managers (Copy from architecture doc)
Create these files:
- `/apps/studio/lib/api/platform/redis.ts` (Redis connection manager)
- `/apps/studio/lib/api/platform/mongodb.ts` (MongoDB connection manager)
- `/apps/studio/lib/api/platform/connection-manager.ts` (Unified manager)

### Step 3: Update Platform Database Schema
Run this migration on your Railway PostgreSQL:
```bash
psql "$DATABASE_URL" -f apps/studio/database/migrations/002_add_multi_database_support.sql
```

Creates:
- `platform.databases` table (stores all database connections)
- `platform.database_type` enum
- Helper functions and views

### Step 4: Add Environment Variables
Add to Railway Studio service:
```bash
# Redis
REDIS_URL=redis://default:password@redis.railway.internal:6379
REDIS_CRYPTO_KEY=your-32-char-encryption-key
REDIS_MAX_CONNECTIONS=10

# MongoDB
MONGODB_URL=mongodb://user:pass@mongodb.railway.internal:27017/db
MONGODB_CRYPTO_KEY=your-32-char-encryption-key
MONGODB_MAX_POOL_SIZE=10

# Bun API
BUN_API_URL=https://bun-server-production.up.railway.app
BUN_API_KEY=your-api-secret-key

# Feature flags
ENABLE_REDIS_MANAGEMENT=true
ENABLE_MONGODB_MANAGEMENT=true
ENABLE_BUN_API_MANAGEMENT=true
```

### Step 5: Create API Routes
Start with database management:
- `/apps/studio/pages/api/platform/databases/index.ts` (list/create)
- `/apps/studio/pages/api/platform/databases/[id]/index.ts` (get/update/delete)

Then add database-specific routes:
- Redis: `/api/platform/redis/[databaseId]/keys/index.ts`
- MongoDB: `/api/platform/mongodb/[databaseId]/collections/index.ts`

### Step 6: Test Connections
```bash
# Test Redis
curl http://localhost:3000/api/platform/databases/test \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"redis","connectionString":"redis://localhost:6379"}'

# Test MongoDB
curl http://localhost:3000/api/platform/databases/test \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"mongodb","connectionString":"mongodb://localhost:27017"}'
```

---

## Key Patterns from Existing Code

### 1. Database Connection Pattern (PostgreSQL)
```typescript
// Current: /apps/studio/lib/api/platform/database.ts
const PLATFORM_DATABASE_URL = process.env.DATABASE_URL
const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY

async function queryPlatformDatabase({query, parameters}) {
  const encrypted = encryptString(PLATFORM_DATABASE_URL)

  const response = await fetch(`${PG_META_URL}/query`, {
    headers: {'x-connection-encrypted': encrypted},
    body: JSON.stringify({query, parameters})
  })

  return response.json()
}
```

**Apply to Redis/MongoDB**: Same encryption pattern, different client

### 2. API Route Pattern
```typescript
// Pattern: /apps/studio/pages/api/platform/profile/index.ts
export default (req, res) => apiWrapper(req, res, handler)

async function handler(req, res) {
  switch (req.method) {
    case 'GET': return handleGet(req, res)
    case 'POST': return handleCreate(req, res)
    default: return res.status(405).json({error: 'Method not allowed'})
  }
}

const handleGet = async (req, res) => {
  // Check if DATABASE_URL configured
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse)
  }

  // Query platform database
  const {data, error} = await queryPlatformDatabase({query, parameters})

  // Handle error with fallback
  if (error) return res.status(200).json(defaultResponse)

  return res.status(200).json(data)
}
```

**Apply to Redis/MongoDB**: Same pattern, different database client

### 3. TypeScript Types Pattern
```typescript
// Current: /apps/studio/lib/api/platform/database.ts
export type PlatformOrganization = {
  id: string
  name: string
  slug: string
  billing_email?: string
  created_at?: string
  updated_at?: string
}

export type PlatformProject = {
  id: string
  organization_id: string
  name: string
  ref: string
  database_host: string
  database_port: number
  // ... more fields
}
```

**Add**: `PlatformDatabase` type for new databases table

---

## Critical Files to Understand

### 1. Platform Database Helper
**File**: `/apps/studio/lib/api/platform/database.ts`
- Current PostgreSQL connection logic
- Encryption pattern to replicate
- Error handling pattern to follow

### 2. Environment Configuration
**File**: `/apps/studio/.env.production`
- Current environment variables
- Connection string format
- Encryption keys

### 3. API Constants
**File**: `/apps/studio/lib/constants/index.ts`
- `IS_PLATFORM` check
- `PG_META_URL` configuration
- Pattern for new database URLs

### 4. Example API Route
**File**: `/apps/studio/pages/api/platform/profile/index.ts`
- Clean example of API route structure
- Error handling with fallback
- TypeScript patterns

### 5. Platform Database Schema
**File**: `/apps/studio/database/README.md`
- Current schema documentation
- Migration pattern
- Helper functions pattern

---

## Connection String Formats

### PostgreSQL (Existing)
```bash
# Railway Internal
postgresql://postgres:password@postgres.railway.internal:5432/postgres

# Railway Public
postgresql://postgres:password@roundhouse.proxy.rlwy.net:12345/postgres
```

### Redis (NEW)
```bash
# Railway Internal (recommended)
redis://default:password@redis.railway.internal:6379

# Railway Public
redis://default:password@redis-production.up.railway.app:6379

# With database number
redis://default:password@redis.railway.internal:6379/0
```

### MongoDB (NEW)
```bash
# Railway Internal (recommended)
mongodb://username:password@mongodb.railway.internal:27017/database

# Railway Public
mongodb://username:password@mongodb-production.up.railway.app:27017/database

# With auth database
mongodb://username:password@mongodb.railway.internal:27017/database?authSource=admin
```

---

## Database Connection Clients

### PostgreSQL: pg-meta HTTP Service (Existing)
```typescript
// No direct client - uses HTTP proxy
await fetch(`${PG_META_URL}/query`, {
  method: 'POST',
  headers: {'x-connection-encrypted': encrypted},
  body: JSON.stringify({query, parameters})
})
```

### Redis: ioredis (NEW)
```typescript
import Redis from 'ioredis'

const redis = new Redis(connectionString, {
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  commandTimeout: 5000,
})

// Usage
await redis.get('key')
await redis.set('key', 'value')
await redis.keys('pattern*')
```

### MongoDB: Official Driver (NEW)
```typescript
import { MongoClient } from 'mongodb'

const client = new MongoClient(connectionString, {
  maxPoolSize: 10,
  minPoolSize: 2,
})

await client.connect()
const db = client.db('database')

// Usage
const collections = await db.listCollections().toArray()
const docs = await db.collection('users').find({}).toArray()
```

---

## Security Notes

### 1. Connection String Encryption
**Critical**: All connection strings must be encrypted before storage

```typescript
import crypto from 'crypto-js'

const CRYPTO_KEY = process.env.PG_META_CRYPTO_KEY

// Always encrypt before storing
function encryptConnectionString(str: string): string {
  return crypto.AES.encrypt(str, CRYPTO_KEY).toString()
}

// Only decrypt when needed
function decryptConnectionString(encrypted: string): string {
  const bytes = crypto.AES.decrypt(encrypted, CRYPTO_KEY)
  return bytes.toString(crypto.enc.Utf8)
}
```

### 2. Use Railway Internal URLs
**Always prefer internal URLs for Railway-to-Railway communication**:

✅ Good:
```bash
redis://redis.railway.internal:6379
mongodb://mongodb.railway.internal:27017
```

❌ Bad (slower, exposed):
```bash
redis://redis-production.up.railway.app:6379
mongodb://mongodb-production.up.railway.app:27017
```

### 3. Never Log Decrypted Credentials
```typescript
// ❌ NEVER DO THIS
console.log('Connection string:', decryptedConnectionString)

// ✅ DO THIS
console.log('Connecting to:', new URL(connectionString).hostname)
```

---

## Testing Strategy

### 1. Connection Tests
```typescript
// Test each database type
const tests = [
  {
    type: 'redis',
    url: 'redis://localhost:6379',
    test: async () => {
      const client = new Redis(url)
      await client.ping()
      await client.quit()
    }
  },
  {
    type: 'mongodb',
    url: 'mongodb://localhost:27017',
    test: async () => {
      const client = new MongoClient(url)
      await client.connect()
      await client.db('admin').command({ping: 1})
      await client.close()
    }
  }
]
```

### 2. API Route Tests
```bash
# Create database
curl -X POST http://localhost:3000/api/platform/databases \
  -H "Content-Type: application/json" \
  -d '{
    "projectRef": "default",
    "name": "redis-cache",
    "type": "redis",
    "connectionString": "redis://localhost:6379"
  }'

# List databases
curl http://localhost:3000/api/platform/databases?projectRef=default

# Test connection
curl -X POST http://localhost:3000/api/platform/databases/[id]/test
```

---

## Common Pitfalls & Solutions

### 1. Connection Pool Exhaustion
**Problem**: Too many connections, database refuses new ones

**Solution**: Implement connection pooling with limits
```typescript
const MAX_CONNECTIONS = 10
const connections = new Map<string, Client>()

function getConnection(connStr: string) {
  if (connections.has(connStr)) {
    return connections.get(connStr)
  }

  if (connections.size >= MAX_CONNECTIONS) {
    // Implement LRU eviction
    const oldestKey = connections.keys().next().value
    connections.delete(oldestKey)
  }

  const client = createClient(connStr)
  connections.set(connStr, client)
  return client
}
```

### 2. Connection String Special Characters
**Problem**: Passwords with `@`, `:`, `#` break parsing

**Solution**: URL encode passwords
```typescript
function buildConnectionString(host, port, user, password, db) {
  const encodedPassword = encodeURIComponent(password)
  return `mongodb://${user}:${encodedPassword}@${host}:${port}/${db}`
}
```

### 3. Railway Internal URLs Not Working
**Problem**: Cannot reach `*.railway.internal` from Vercel

**Solution**: Use public URLs for Vercel, internal for Railway
```typescript
const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined
const redisUrl = isRailway
  ? 'redis://redis.railway.internal:6379'
  : process.env.REDIS_PUBLIC_URL
```

---

## Performance Optimization

### 1. Connection Reuse
```typescript
// ❌ Bad: Create new connection every time
async function getData() {
  const client = new Redis(url)
  const data = await client.get('key')
  await client.quit()
  return data
}

// ✅ Good: Reuse connection
const client = new Redis(url)
async function getData() {
  return client.get('key')
}
```

### 2. Use Redis for Caching
```typescript
// Cache database metadata
async function getCachedDatabases(projectRef: string) {
  const cacheKey = `databases:${projectRef}`

  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // Fetch from platform database
  const {data} = await queryPlatformDatabase({
    query: 'SELECT * FROM platform.databases WHERE project_ref = $1',
    parameters: [projectRef]
  })

  // Cache for 1 minute
  await redis.setex(cacheKey, 60, JSON.stringify(data))

  return data
}
```

### 3. Parallel Queries
```typescript
// ❌ Bad: Sequential
const orgs = await getOrganizations()
const projects = await getProjects()
const databases = await getDatabases()

// ✅ Good: Parallel
const [orgs, projects, databases] = await Promise.all([
  getOrganizations(),
  getProjects(),
  getDatabases()
])
```

---

## File Creation Order

Create files in this order to minimize dependencies:

1. **Database schema** (can test immediately)
   - `apps/studio/database/migrations/002_add_multi_database_support.sql`

2. **Type definitions** (no dependencies)
   - Update `apps/studio/lib/api/platform/database.ts` with new types

3. **Connection managers** (use types)
   - `apps/studio/lib/api/platform/redis.ts`
   - `apps/studio/lib/api/platform/mongodb.ts`
   - `apps/studio/lib/api/platform/connection-manager.ts`

4. **API routes** (use connection managers)
   - `apps/studio/pages/api/platform/databases/index.ts`
   - `apps/studio/pages/api/platform/databases/[id]/index.ts`
   - `apps/studio/pages/api/platform/redis/[databaseId]/keys/index.ts`
   - `apps/studio/pages/api/platform/mongodb/[databaseId]/collections/index.ts`

5. **Frontend components** (use API routes)
   - Database list page
   - Database detail page
   - Redis browser
   - MongoDB explorer

---

## Next Steps

1. **Read the full architecture document**: `/MULTI_DATABASE_ARCHITECTURE.md`
2. **Set up local development environment**:
   ```bash
   # Start local Redis
   docker run -d -p 6379:6379 redis:alpine

   # Start local MongoDB
   docker run -d -p 27017:27017 mongo:latest
   ```

3. **Install dependencies**: `npm install ioredis mongodb`
4. **Create database schema**: Run migration on Railway
5. **Build connection managers**: Copy from architecture doc
6. **Create API routes**: Start with `/databases` endpoints
7. **Test locally**: Use curl/Postman to test endpoints

---

## Support & Resources

- **Architecture Doc**: `/MULTI_DATABASE_ARCHITECTURE.md` (comprehensive design)
- **Current Code**: Look at `/apps/studio/lib/api/platform/database.ts` for patterns
- **Database Schema**: `/apps/studio/database/README.md`
- **Environment Setup**: `/apps/studio/.env.production`

**Key contacts**:
- Database Architecture: Rafael Santos (this document author)
- Platform APIs: Check existing `/api/platform/*` routes
- Railway Setup: See Railway environment variables documentation

---

## FAQ

**Q: Why not use a single connection string for all database types?**
A: Different database types have different protocols and connection formats. Each needs its own client library.

**Q: Can I use the same encryption key for all database types?**
A: Yes, `PG_META_CRYPTO_KEY` can be reused for Redis and MongoDB encryption.

**Q: Should I store connection strings in the platform database or environment variables?**
A: Both. Environment variables for default connections, platform database for user-added connections (encrypted).

**Q: How do I handle connection failures?**
A: Implement retry logic with exponential backoff. See connection manager examples in architecture doc.

**Q: What about authentication?**
A: Connection strings include credentials. For additional security, implement role-based access control (Phase 4 of roadmap).

---

**Last Updated**: November 20, 2025
**Version**: 1.0
