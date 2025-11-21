# Unified Database API - Implementation Checklist

This is a practical, step-by-step guide for implementing the unified database management API. Follow these steps in order.

---

## Phase 1: Foundation Setup

### Step 1.1: Database Migration

**File:** `/apps/studio/database/migrations/002_add_multi_database_support.sql`

```sql
-- Run this migration on your platform database
-- Test command: psql $DATABASE_URL -f database/migrations/002_add_multi_database_support.sql

-- [ ] Enum created successfully
-- [ ] Table created successfully
-- [ ] Indexes created successfully
-- [ ] Foreign keys working correctly
```

**Verification:**

```sql
-- Run these queries to verify:
\dt platform.*
\d platform.database_connections
SELECT * FROM platform.database_connections LIMIT 1;
```

### Step 1.2: TypeScript Types

**File:** `/apps/studio/lib/api/platform/database-types.ts`

**Tasks:**

- [ ] Copy type definitions from design document
- [ ] Add to TypeScript build path
- [ ] Verify compilation: `npm run type-check`
- [ ] Import in at least one test file to verify exports

**Test:**

```typescript
import { DatabaseConnection, RedisConnection } from 'lib/api/platform/database-types'

const testConnection: RedisConnection = {
  id: '123',
  project_id: '456',
  database_type: 'redis',
  // ... should autocomplete properly
}
```

### Step 1.3: Database Client Implementation

**File:** `/apps/studio/lib/api/database/client.ts`

**Dependencies to install:**

```bash
npm install ioredis mongodb pg
npm install --save-dev @types/ioredis @types/pg
```

**Implementation checklist:**

- [ ] DatabaseClient interface defined
- [ ] RedisClient class implemented
- [ ] MongoDBClient class implemented
- [ ] PostgresClient class implemented
- [ ] createDatabaseClient factory function
- [ ] parseRedisInfo helper function

**Unit test:**

```typescript
// Create: /apps/studio/lib/api/database/__tests__/client.test.ts

import { RedisClient } from '../client'

describe('RedisClient', () => {
  it('connects to Redis', async () => {
    const client = new RedisClient({
      connection: {
        // Use test connection details
      },
    })
    await client.connect()
    await client.disconnect()
  })
})
```

**Run tests:**

```bash
npm test -- client.test.ts
```

### Step 1.4: Connection Pool Manager

**File:** `/apps/studio/lib/api/database/pool-manager.ts`

**Implementation checklist:**

- [ ] PoolEntry interface defined
- [ ] ConnectionPoolManager class created
- [ ] getClient method implemented
- [ ] releaseClient method implemented
- [ ] cleanupIdleConnections method implemented
- [ ] Singleton instance exported
- [ ] Cleanup interval set to 60 seconds

**Manual test:**

```typescript
// Create test script: test-pool-manager.ts

import { poolManager } from './pool-manager'

async function test() {
  const client1 = await poolManager.getClient('conn-id', 'project-ref')
  console.log('Got client 1')

  const client2 = await poolManager.getClient('conn-id', 'project-ref')
  console.log('Got client 2 - should be same instance')

  await poolManager.releaseClient('conn-id', 'project-id', 'redis')
  console.log('Released client')
}

test()
```

### Step 1.5: Helper Functions

**File:** `/apps/studio/lib/api/database/helpers.ts`

**Implementation checklist:**

- [ ] getDatabaseConnection function
- [ ] withDatabaseClient function
- [ ] validateConnectionParams function
- [ ] sanitizeQueryParams function
- [ ] formatBytes function

**Test each helper:**

```typescript
// Test getDatabaseConnection
const conn = await getDatabaseConnection('default', 'redis')
console.log('Connection:', conn)

// Test withDatabaseClient
const { data, error } = await withDatabaseClient('default', 'redis', async (client) => {
  return await client.ping()
})
console.log('Ping latency:', data, 'ms')
```

### Step 1.6: Error Handling

**File:** `/apps/studio/lib/api/database/errors.ts`

**Implementation checklist:**

- [ ] DatabaseError base class
- [ ] ConnectionError class
- [ ] QueryError class
- [ ] AuthenticationError class
- [ ] NotFoundError class
- [ ] handleDatabaseError function

**Test error handling:**

```typescript
try {
  throw new ConnectionError('Failed to connect to Redis')
} catch (error) {
  handleDatabaseError(error, res)
  // Should return 503 with proper error message
}
```

**Phase 1 Completion Criteria:**

- [ ] All TypeScript files compile without errors
- [ ] Can create and connect to RedisClient
- [ ] Can create and connect to MongoDBClient
- [ ] Connection pool manager works
- [ ] Helper functions tested
- [ ] Error classes work correctly

---

## Phase 2: Redis API Implementation

### Step 2.1: Create Directory Structure

```bash
mkdir -p pages/api/platform/redis/[ref]/connections/[id]
mkdir -p pages/api/platform/redis/[ref]/keys/[key]
mkdir -p pages/api/platform/redis/[ref]/pubsub
```

### Step 2.2: Connection Management

**File:** `/pages/api/platform/redis/[ref]/connections/index.ts`

**Implementation:**

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { RedisConnection } from 'lib/api/platform/database-types'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res)
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  // TODO: Implement GET logic
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  // TODO: Implement POST logic
}
```

**Checklist:**

- [ ] GET endpoint lists all Redis connections for project
- [ ] POST endpoint creates new Redis connection
- [ ] Authentication required
- [ ] Proper error handling
- [ ] Returns typed responses

**Test:**

```bash
# Test GET
curl http://localhost:3000/api/platform/redis/default/connections \
  -H "Authorization: Bearer $TOKEN"

# Test POST
curl -X POST http://localhost:3000/api/platform/redis/default/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "cache-primary",
    "host": "localhost",
    "port": 6379,
    "password": "secret"
  }'
```

### Step 2.3: Connection Update/Delete

**File:** `/pages/api/platform/redis/[ref]/connections/[id]/index.ts`

**Checklist:**

- [ ] PUT endpoint updates connection
- [ ] DELETE endpoint removes connection
- [ ] Validates connection exists
- [ ] Validates user has permission
- [ ] Cleans up from connection pool

**Test:**

```bash
# Test PUT
curl -X PUT http://localhost:3000/api/platform/redis/default/connections/conn-123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"host": "new-host.com"}'

# Test DELETE
curl -X DELETE http://localhost:3000/api/platform/redis/default/connections/conn-123 \
  -H "Authorization: Bearer $TOKEN"
```

### Step 2.4: Connection Testing

**File:** `/pages/api/platform/redis/[ref]/connections/[id]/test.ts`

**Implementation:**

```typescript
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref, id } = req.query

  const { data, error } = await withDatabaseClient(
    ref as string,
    'redis',
    async (client: RedisClient) => {
      const start = Date.now()
      await client.ping()
      const latency = Date.now() - start

      const info = await client.getInfo()

      return {
        success: true,
        latency_ms: latency,
        version: info.server.redis_version,
        mode: info.server.redis_mode,
        memory_used: info.memory.used_memory_human,
      }
    },
    id as string
  )

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }

  return res.status(200).json(data)
}
```

**Test:**

```bash
curl -X POST http://localhost:3000/api/platform/redis/default/connections/conn-123/test \
  -H "Authorization: Bearer $TOKEN"
```

### Step 2.5: Key Listing

**File:** `/pages/api/platform/redis/[ref]/keys/index.ts`

**Implementation reference:** See UNIFIED_API_QUICK_REFERENCE.md

**Checklist:**

- [ ] Supports pattern matching with SCAN
- [ ] Cursor-based pagination
- [ ] Returns key type, TTL, and size
- [ ] Handles empty results
- [ ] Proper error handling

**Test:**

```bash
# List all keys
curl "http://localhost:3000/api/platform/redis/default/keys?pattern=*&count=100" \
  -H "Authorization: Bearer $TOKEN"

# List with pattern
curl "http://localhost:3000/api/platform/redis/default/keys?pattern=user:*" \
  -H "Authorization: Bearer $TOKEN"
```

### Step 2.6: Key Operations

**Files to create:**

- `/pages/api/platform/redis/[ref]/keys/[key]/index.ts` (GET, POST, PUT, DELETE)
- `/pages/api/platform/redis/[ref]/keys/[key]/expire.ts` (POST)

**GET implementation:**

```typescript
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref, key } = req.query

  const { data, error } = await withDatabaseClient(
    ref as string,
    'redis',
    async (client: RedisClient) => {
      const type = await client.type(key as string)
      const ttl = await client.ttl(key as string)

      let value
      switch (type) {
        case 'string':
          value = await client.get(key as string)
          break
        case 'hash':
          value = await client.hGetAll(key as string)
          break
        case 'list':
          value = await client.lRange(key as string, 0, -1)
          break
        // ... handle other types
      }

      return {
        key: key as string,
        type,
        value,
        ttl,
        size: await client.memoryUsage(key as string),
      }
    }
  )

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json({ data })
}
```

**Checklist:**

- [ ] GET returns key value based on type
- [ ] POST sets key with optional TTL
- [ ] PUT updates key value
- [ ] DELETE removes key
- [ ] expire endpoint sets TTL

**Test each operation:**

```bash
# Set key
curl -X POST http://localhost:3000/api/platform/redis/default/keys/test:key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": "hello world", "ttl": 3600}'

# Get key
curl http://localhost:3000/api/platform/redis/default/keys/test:key \
  -H "Authorization: Bearer $TOKEN"

# Set TTL
curl -X POST http://localhost:3000/api/platform/redis/default/keys/test:key/expire \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttl": 7200}'

# Delete key
curl -X DELETE http://localhost:3000/api/platform/redis/default/keys/test:key \
  -H "Authorization: Bearer $TOKEN"
```

### Step 2.7: Server Info

**File:** `/pages/api/platform/redis/[ref]/info.ts`

**Checklist:**

- [ ] Returns server version
- [ ] Returns memory usage
- [ ] Returns statistics
- [ ] Returns replication info
- [ ] Proper formatting

**Test:**

```bash
curl http://localhost:3000/api/platform/redis/default/info \
  -H "Authorization: Bearer $TOKEN"
```

**Phase 2 Completion Criteria:**

- [ ] All Redis connection endpoints working
- [ ] Can list, get, set, delete Redis keys
- [ ] Server info endpoint returns valid data
- [ ] All endpoints authenticated
- [ ] Error handling works correctly
- [ ] Manual testing completed

---

## Phase 3: MongoDB API Implementation

### Step 3.1: Create Directory Structure

```bash
mkdir -p pages/api/platform/mongodb/[ref]/connections/[id]
mkdir -p pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]
mkdir -p pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/[name]
```

### Step 3.2: Connection Management

**Similar to Redis, create:**

- `/pages/api/platform/mongodb/[ref]/connections/index.ts`
- `/pages/api/platform/mongodb/[ref]/connections/[id]/index.ts`
- `/pages/api/platform/mongodb/[ref]/connections/[id]/test.ts`

**Checklist:**

- [ ] GET lists MongoDB connections
- [ ] POST creates new connection
- [ ] PUT updates connection
- [ ] DELETE removes connection
- [ ] Test endpoint verifies connectivity

### Step 3.3: Database Operations

**File:** `/pages/api/platform/mongodb/[ref]/databases/index.ts`

```typescript
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  const { data, error } = await withDatabaseClient(
    ref as string,
    'mongodb',
    async (client: MongoDBClient) => {
      const databases = await client.listDatabases()

      return databases.map((db: any) => ({
        name: db.name,
        size_on_disk: db.sizeOnDisk,
        empty: db.empty,
      }))
    }
  )

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json({ data })
}
```

**Checklist:**

- [ ] Lists all databases
- [ ] Returns size information
- [ ] Handles empty databases

**Test:**

```bash
curl http://localhost:3000/api/platform/mongodb/default/databases \
  -H "Authorization: Bearer $TOKEN"
```

### Step 3.4: Collection Operations

**Files:**

- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/index.ts`

**Checklist:**

- [ ] GET lists collections in database
- [ ] POST creates new collection
- [ ] DELETE drops collection
- [ ] Returns collection stats

**Test:**

```bash
# List collections
curl http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections \
  -H "Authorization: Bearer $TOKEN"

# Create collection
curl -X POST http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "users", "options": {}}'
```

### Step 3.5: Document Operations

**File:** `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/index.ts`

**Implementation:** See UNIFIED_API_QUICK_REFERENCE.md for detailed example

**Checklist:**

- [ ] GET queries documents with filter
- [ ] Supports projection
- [ ] Supports sorting
- [ ] Pagination with limit/skip
- [ ] POST inserts documents
- [ ] Proper error handling
- [ ] Query sanitization

**Test:**

```bash
# Query documents
curl "http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents?filter=%7B%7D&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Insert document
curl -X POST http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"document": {"name": "John Doe", "age": 30, "email": "john@example.com"}}'
```

### Step 3.6: Document CRUD by ID

**File:** `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]/index.ts`

**Checklist:**

- [ ] GET retrieves single document
- [ ] PUT updates document with $set
- [ ] DELETE removes document
- [ ] Validates ObjectId format

**Test:**

```bash
# Get by ID
curl http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer $TOKEN"

# Update
curl -X PUT http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"update": {"$set": {"age": 31}}}'

# Delete
curl -X DELETE http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer $TOKEN"
```

### Step 3.7: Aggregation

**File:** `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/aggregate.ts`

**Implementation:**

```typescript
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref, db, coll } = req.query
  const { pipeline, options } = req.body

  const { data, error } = await withDatabaseClient(
    ref as string,
    'mongodb',
    async (client: MongoDBClient) => {
      const database = client.getDb(db as string)
      const collection = database.collection(coll as string)

      const results = await collection.aggregate(pipeline, options).toArray()

      return results
    }
  )

  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(200).json({ data })
}
```

**Test:**

```bash
curl -X POST http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/aggregate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline": [
      {"$match": {"age": {"$gte": 18}}},
      {"$group": {"_id": "$country", "count": {"$sum": 1}}}
    ]
  }'
```

### Step 3.8: Index Management

**Files:**

- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/index.ts`
- `/pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/[name]/index.ts`

**Checklist:**

- [ ] GET lists indexes
- [ ] POST creates index
- [ ] DELETE drops index
- [ ] Validates index options

**Test:**

```bash
# List indexes
curl http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/indexes \
  -H "Authorization: Bearer $TOKEN"

# Create index
curl -X POST http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/indexes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": {"email": 1}, "options": {"unique": true}}'

# Drop index
curl -X DELETE http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/indexes/email_1 \
  -H "Authorization: Bearer $TOKEN"
```

**Phase 3 Completion Criteria:**

- [ ] All MongoDB connection endpoints working
- [ ] Can list databases and collections
- [ ] Can query, insert, update, delete documents
- [ ] Aggregation pipeline works
- [ ] Index management works
- [ ] Query sanitization prevents NoSQL injection
- [ ] All endpoints authenticated

---

## Phase 4: Advanced Features

### Step 4.1: Redis Pub/Sub (WebSocket)

**File:** `/pages/api/platform/redis/[ref]/pubsub/subscribe.ts`

**Implementation:**

```typescript
import { WebSocketServer } from 'ws'

// Setup WebSocket server for pub/sub
// Handle subscribe, unsubscribe, psubscribe, punsubscribe
// Forward messages to clients
```

**Checklist:**

- [ ] WebSocket connection established
- [ ] Can subscribe to channels
- [ ] Receives published messages
- [ ] Can unsubscribe
- [ ] Pattern subscriptions work
- [ ] Connection cleanup on disconnect

### Step 4.2: Caching Layer

**File:** `/lib/api/middleware/cache.ts`

**Implementation:**

```typescript
const cache = new Map<string, { data: any; expiresAt: number }>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data
  }
  cache.delete(key)
  return null
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  })
}
```

**Apply to endpoints:**

```typescript
// Example: Cache database list for 1 minute
const cacheKey = `mongodb:${ref}:databases`
let databases = getCached<any[]>(cacheKey)

if (!databases) {
  databases = await fetchDatabases()
  setCache(cacheKey, databases, 60000)
}
```

### Step 4.3: Rate Limiting

**File:** `/lib/api/middleware/rate-limit.ts`

**Implementation:** See API_DESIGN_SUMMARY.md

**Apply to all endpoints:**

```typescript
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!rateLimit(req, res, 100, 60000)) {
    return // Rate limit response already sent
  }

  // Continue with normal handler
}
```

**Phase 4 Completion Criteria:**

- [ ] Redis Pub/Sub working via WebSocket
- [ ] Caching reduces database load
- [ ] Rate limiting prevents abuse
- [ ] Metrics collection working

---

## Phase 5: Frontend Integration

### Step 5.1: Redis Connection Manager UI

**File:** `/components/interfaces/Database/Redis/ConnectionsList.tsx`

**Features:**

- List all Redis connections
- Create new connection form
- Edit connection
- Delete connection
- Test connection button

**Checklist:**

- [ ] Component renders connection list
- [ ] Can create new connection
- [ ] Can edit existing connection
- [ ] Can delete connection
- [ ] Shows connection status
- [ ] Test button works

### Step 5.2: Redis Keys Explorer

**File:** `/components/interfaces/Database/Redis/KeysExplorer.tsx`

**Features:**

- List keys with pattern search
- View key details
- Edit key value
- Set TTL
- Delete key

**Checklist:**

- [ ] Lists keys with pagination
- [ ] Pattern search works
- [ ] Can view key details by type
- [ ] Can edit key value
- [ ] Can set/update TTL
- [ ] Can delete key

### Step 5.3: MongoDB Database Explorer

**File:** `/components/interfaces/Database/MongoDB/DatabaseExplorer.tsx`

**Features:**

- Tree view of databases and collections
- Collection stats
- Create collection
- Drop collection

**Checklist:**

- [ ] Shows database tree
- [ ] Expands to show collections
- [ ] Shows collection stats
- [ ] Can create collection
- [ ] Can drop collection

### Step 5.4: MongoDB Document Editor

**File:** `/components/interfaces/Database/MongoDB/DocumentEditor.tsx`

**Features:**

- Query builder UI
- Document list view
- JSON editor for documents
- Insert/update/delete operations

**Checklist:**

- [ ] Query builder generates valid filters
- [ ] Document list shows results
- [ ] JSON editor validates syntax
- [ ] Can insert new document
- [ ] Can update existing document
- [ ] Can delete document

### Step 5.5: Database Switcher

**File:** `/components/interfaces/Database/DatabaseSwitcher.tsx`

**Features:**

- Dropdown to switch between Postgres, Redis, MongoDB
- Shows active database type
- Routes to correct management interface

**Checklist:**

- [ ] Shows all available database types
- [ ] Switches views correctly
- [ ] Persists selection
- [ ] Shows connection status

**Phase 5 Completion Criteria:**

- [ ] All UI components render correctly
- [ ] Can manage Redis from UI
- [ ] Can manage MongoDB from UI
- [ ] Database switcher works
- [ ] UI is responsive
- [ ] Error states handled

---

## Testing Checklist

### Unit Tests

- [ ] Database client tests pass
- [ ] Helper function tests pass
- [ ] Error handling tests pass
- [ ] Type validation tests pass

### Integration Tests

- [ ] Redis API endpoint tests pass
- [ ] MongoDB API endpoint tests pass
- [ ] Authentication tests pass
- [ ] Authorization tests pass

### End-to-End Tests

- [ ] Can create Redis connection via UI
- [ ] Can manage Redis keys via UI
- [ ] Can create MongoDB connection via UI
- [ ] Can manage MongoDB documents via UI
- [ ] Database switcher works in UI

### Performance Tests

- [ ] Connection pooling reduces latency
- [ ] Caching improves response times
- [ ] Rate limiting works under load
- [ ] No memory leaks detected

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Environment variables configured
- [ ] Database migration tested on staging
- [ ] Security audit completed

### Deployment

- [ ] Migration run on production database
- [ ] Environment variables set in Railway
- [ ] Application deployed
- [ ] Health checks passing

### Post-Deployment

- [ ] Smoke tests completed
- [ ] Monitoring configured
- [ ] Error tracking working
- [ ] Performance metrics collected
- [ ] No critical errors

---

## Troubleshooting Guide

### Connection Issues

**Problem:** Cannot connect to Redis
**Solution:**

1. Check connection details in database_connections table
2. Verify Redis server is accessible
3. Check firewall rules
4. Verify password is correct
5. Check connection pool logs

**Problem:** Cannot connect to MongoDB
**Solution:**

1. Verify connection string format
2. Check authentication credentials
3. Verify database name exists
4. Check network connectivity
5. Review MongoDB server logs

### Authentication Issues

**Problem:** Getting 401 Unauthorized
**Solution:**

1. Verify JWT token is valid
2. Check Authorization header format
3. Verify token hasn't expired
4. Check IS_PLATFORM flag
5. Review apiAuthenticate logs

### Query Issues

**Problem:** MongoDB query returns no results
**Solution:**

1. Verify filter syntax is correct
2. Check collection actually has documents
3. Verify field names match
4. Check query sanitization isn't blocking query
5. Review MongoDB query logs

**Problem:** Redis SCAN not returning all keys
**Solution:**

1. Remember SCAN is cursor-based
2. Continue scanning until cursor is 0
3. Increase COUNT parameter
4. Check pattern syntax

---

## Success Metrics

### Performance

- [ ] API response time < 100ms (p95)
- [ ] Database query time < 50ms (p95)
- [ ] Connection pool hit rate > 80%
- [ ] Cache hit rate > 60%

### Reliability

- [ ] API error rate < 1%
- [ ] Database connection success rate > 99%
- [ ] Zero critical bugs
- [ ] Uptime > 99.9%

### Usability

- [ ] Can create database connection in < 30 seconds
- [ ] Can find and edit data in < 1 minute
- [ ] All UI actions have feedback
- [ ] Error messages are helpful

---

## Next Steps After Completion

1. **Gather User Feedback**

   - Beta test with select users
   - Collect feature requests
   - Track usage patterns

2. **Performance Optimization**

   - Profile slow queries
   - Optimize connection pooling
   - Add more caching

3. **Feature Enhancements**

   - Add Redis Cluster support
   - Add MongoDB Sharding support
   - Build query builder UI
   - Add backup/restore features

4. **Documentation**
   - Write user guides
   - Create video tutorials
   - Update API documentation
   - Add troubleshooting guides

---

## Support Resources

- **Technical Documentation:** See UNIFIED_DATABASE_API_DESIGN.md
- **Quick Reference:** See UNIFIED_API_QUICK_REFERENCE.md
- **Architecture:** See API_ARCHITECTURE_DIAGRAM.md
- **Issues:** GitHub Issues or internal tracker
- **Questions:** Team Slack channel

---

## Final Notes

This implementation will take approximately 5 weeks with 1-2 developers working full-time. Break tasks into smaller chunks and test frequently. Prioritize getting each phase working completely before moving to the next phase.

Good luck with the implementation!
