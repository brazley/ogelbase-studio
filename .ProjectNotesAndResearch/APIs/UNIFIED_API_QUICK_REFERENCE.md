# Unified Database API - Quick Reference

## Current API Architecture

### File Structure

```
apps/studio/
├── lib/api/
│   ├── apiWrapper.ts              # Auth wrapper
│   ├── apiAuthenticate.ts         # JWT validation
│   └── platform/
│       ├── database.ts            # Platform DB queries (Lines 27-72: queryPlatformDatabase)
│       ├── jwt.ts                 # JWT generation
│       └── project-utils.ts       # Project helpers
│
└── pages/api/platform/
    ├── pg-meta/[ref]/query/       # Postgres proxy endpoint
    ├── storage/[ref]/buckets/     # Storage API
    └── projects/[ref]/databases.ts # Database info
```

### Authentication Pattern

```typescript
// Every protected endpoint uses:
export default (req, res) => apiWrapper(req, res, handler, { withAuth: true })

// apiWrapper checks:
1. IS_PLATFORM flag
2. JWT token from Authorization header
3. Calls apiAuthenticate(req, res)
4. Returns user claims or 401
```

### Database Query Pattern

```typescript
// File: lib/api/platform/database.ts (Lines 27-72)
import { queryPlatformDatabase } from 'lib/api/platform/database'

const { data, error } = await queryPlatformDatabase<YourType>({
  query: 'SELECT * FROM platform.projects WHERE ref = $1',
  parameters: [ref],
})

// Returns: WrappedResult<T[]>
// - { data: T[], error: undefined } on success
// - { data: undefined, error: Error } on failure
```

### Platform Database Schema

```sql
-- Schema: platform.*

platform.organizations
  - id (uuid, pk)
  - name, slug
  - billing_email

platform.projects
  - id (uuid, pk)
  - organization_id (fk)
  - ref (unique)
  - database_host, database_port
  - database_name, database_user, database_password
  - postgres_meta_url, supabase_url
  - status

platform.credentials
  - id (uuid, pk)
  - project_id (fk, unique)
  - anon_key, service_role_key, jwt_secret
```

---

## Proposed Extensions

### New Database Schema

```sql
-- Add: platform.database_connections

CREATE TYPE platform.database_type AS ENUM ('postgres', 'redis', 'mongodb');

CREATE TABLE platform.database_connections (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES platform.projects(id),
  database_type platform.database_type,
  identifier TEXT,  -- e.g., "primary-postgres", "cache-redis"

  -- Connection details
  host TEXT,
  port INTEGER,
  database_name TEXT,
  username TEXT,
  password TEXT,

  -- Options (JSON)
  options JSONB DEFAULT '{}'::jsonb,

  is_primary BOOLEAN DEFAULT false,
  status TEXT,

  UNIQUE(project_id, identifier)
);
```

### TypeScript Types

```typescript
// lib/api/platform/database-types.ts

export type DatabaseType = 'postgres' | 'redis' | 'mongodb'

export interface DatabaseConnection {
  id: string
  project_id: string
  database_type: DatabaseType
  identifier: string
  host: string
  port: number
  database_name?: string
  username?: string
  password?: string
  options: Record<string, unknown>
  is_primary: boolean
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'CONNECTING'
}

export interface RedisConnection extends DatabaseConnection {
  database_type: 'redis'
  options: {
    db?: number
    tls?: boolean
    cluster?: boolean
  }
}

export interface MongoDBConnection extends DatabaseConnection {
  database_type: 'mongodb'
  database_name: string
  options: {
    replica_set?: string
    auth_source?: string
    tls?: boolean
  }
}
```

---

## Redis API Endpoints

### Connection Management

```
GET    /api/platform/redis/[ref]/connections
POST   /api/platform/redis/[ref]/connections
PUT    /api/platform/redis/[ref]/connections/[id]
DELETE /api/platform/redis/[ref]/connections/[id]
POST   /api/platform/redis/[ref]/connections/[id]/test
```

### Key Operations

```
GET    /api/platform/redis/[ref]/keys
       ?pattern=user:*&cursor=0&count=100

GET    /api/platform/redis/[ref]/keys/[key]
       Returns: { key, type, value, ttl, size }

POST   /api/platform/redis/[ref]/keys/[key]
       Body: { value, ttl?, nx?, xx? }

PUT    /api/platform/redis/[ref]/keys/[key]
DELETE /api/platform/redis/[ref]/keys/[key]
POST   /api/platform/redis/[ref]/keys/[key]/expire
       Body: { ttl: number }
```

### Pub/Sub

```
GET    /api/platform/redis/[ref]/pubsub/channels
POST   /api/platform/redis/[ref]/pubsub/publish
       Body: { channel, message }

WS     /api/platform/redis/[ref]/pubsub/subscribe
       ?channels=ch1,ch2
```

### Server Info

```
GET    /api/platform/redis/[ref]/info
       Returns: { server, memory, stats, clients, persistence, replication }

GET    /api/platform/redis/[ref]/stats
       Returns: Real-time statistics
```

---

## MongoDB API Endpoints

### Connection Management

```
GET    /api/platform/mongodb/[ref]/connections
POST   /api/platform/mongodb/[ref]/connections
PUT    /api/platform/mongodb/[ref]/connections/[id]
DELETE /api/platform/mongodb/[ref]/connections/[id]
POST   /api/platform/mongodb/[ref]/connections/[id]/test
```

### Database Operations

```
GET    /api/platform/mongodb/[ref]/databases
       Returns: [{ name, size_on_disk, empty, collections }]

GET    /api/platform/mongodb/[ref]/databases/[db]/stats
       Returns: { collections, objects, data_size, storage_size, indexes }
```

### Collection Operations

```
GET    /api/platform/mongodb/[ref]/databases/[db]/collections
POST   /api/platform/mongodb/[ref]/databases/[db]/collections
       Body: { name, options?: { capped, size, max, validator } }

DELETE /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]
```

### Document Operations

```
GET    /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents
       ?filter={"age":{"$gte":18}}&limit=50&skip=0

POST   /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents
       Body: { document?: {}, documents?: [] }

GET    /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]
PUT    /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]
       Body: { update: { $set: { ... } }, upsert?: boolean }

DELETE /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]

POST   /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/aggregate
       Body: { pipeline: [...], options?: { allowDiskUse, maxTimeMS } }
```

### Index Management

```
GET    /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes
POST   /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes
       Body: { key: { field: 1 }, options?: { unique, sparse, expireAfterSeconds } }

DELETE /api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/[name]
```

---

## Implementation Files to Create

### 1. Database Client Abstraction

```
lib/api/database/
├── client.ts           # RedisClient, MongoDBClient, PostgresClient
├── pool-manager.ts     # Connection pooling
├── helpers.ts          # withDatabaseClient, getDatabaseConnection
└── errors.ts           # DatabaseError, ConnectionError, QueryError
```

### 2. Redis API Routes

```
pages/api/platform/redis/[ref]/
├── connections/
│   ├── index.ts        # GET, POST
│   └── [id]/
│       ├── index.ts    # PUT, DELETE
│       └── test.ts     # POST
├── keys/
│   ├── index.ts        # GET (list)
│   └── [key]/
│       ├── index.ts    # GET, POST, PUT, DELETE
│       └── expire.ts   # POST
├── pubsub/
│   ├── channels.ts     # GET
│   ├── publish.ts      # POST
│   └── subscribe.ts    # WebSocket
├── info.ts             # GET
└── stats.ts            # GET
```

### 3. MongoDB API Routes

```
pages/api/platform/mongodb/[ref]/
├── connections/
│   ├── index.ts
│   └── [id]/
│       ├── index.ts
│       └── test.ts
├── databases/
│   ├── index.ts        # GET
│   └── [db]/
│       ├── stats.ts    # GET
│       └── collections/
│           ├── index.ts  # GET, POST
│           └── [coll]/
│               ├── index.ts      # DELETE
│               ├── documents/
│               │   ├── index.ts  # GET, POST
│               │   └── [id]/
│               │       └── index.ts  # GET, PUT, DELETE
│               ├── aggregate.ts
│               └── indexes/
│                   ├── index.ts  # GET, POST
│                   └── [name]/
│                       └── index.ts  # DELETE
```

### 4. Shared Types

```
lib/api/platform/
└── database-types.ts   # DatabaseType, DatabaseConnection, etc.
```

---

## Example Implementations

### Redis Key Listing

```typescript
// pages/api/platform/redis/[ref]/keys/index.ts

import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { withDatabaseClient } from 'lib/api/database/helpers'
import { RedisClient } from 'lib/api/database/client'

export default (req, res) => apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { ref } = req.query
  const { pattern = '*', cursor = '0', count = '100' } = req.query

  const { data, error } = await withDatabaseClient(
    ref as string,
    'redis',
    async (client: RedisClient) => {
      const [nextCursor, keys] = await client.scan(
        parseInt(cursor as string),
        pattern as string,
        parseInt(count as string)
      )

      const keysWithMetadata = await Promise.all(
        keys.map(async (key) => ({
          key,
          type: await client.type(key),
          ttl: await client.ttl(key),
          size: await client.memoryUsage(key),
        }))
      )

      return {
        keys: keysWithMetadata,
        cursor: nextCursor,
        total_scanned: keys.length,
      }
    }
  )

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json({ data })
}
```

### MongoDB Document Query

```typescript
// pages/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/index.ts

import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { withDatabaseClient } from 'lib/api/database/helpers'
import { MongoDBClient } from 'lib/api/database/client'
import { sanitizeQueryParams } from 'lib/api/database/helpers'

export default (req, res) => apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { ref, db, coll } = req.query

  if (req.method === 'GET') {
    return handleGet(req, res)
  } else if (req.method === 'POST') {
    return handlePost(req, res)
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref, db, coll } = req.query
  const { filter, projection, sort, limit, skip } = sanitizeQueryParams(req)

  const { data, error } = await withDatabaseClient(
    ref as string,
    'mongodb',
    async (client: MongoDBClient) => {
      const database = client.getDb(db as string)
      const collection = database.collection(coll as string)

      const documents = await collection
        .find(filter || {}, { projection })
        .sort(sort || {})
        .limit(limit)
        .skip(skip)
        .toArray()

      const total = await collection.countDocuments(filter || {})

      return {
        documents,
        total,
        page: Math.floor(skip / limit),
        page_size: limit,
        has_more: skip + limit < total,
      }
    }
  )

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json({ data })
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref, db, coll } = req.query
  const { document, documents } = req.body

  const { data, error } = await withDatabaseClient(
    ref as string,
    'mongodb',
    async (client: MongoDBClient) => {
      const database = client.getDb(db as string)
      const collection = database.collection(coll as string)

      if (document) {
        const result = await collection.insertOne(document)
        return {
          inserted_ids: [result.insertedId],
          inserted_count: 1,
        }
      } else if (documents) {
        const result = await collection.insertMany(documents)
        return {
          inserted_ids: Object.values(result.insertedIds),
          inserted_count: result.insertedCount,
        }
      }

      throw new Error('Either document or documents must be provided')
    }
  )

  if (error) {
    return res.status(400).json({ error: { message: error.message } })
  }

  return res.status(201).json({ data })
}
```

---

## Usage Examples

### Frontend: Listing Redis Keys

```typescript
// React component
const RedisKeysList = ({ projectRef }: { projectRef: string }) => {
  const [keys, setKeys] = useState([])
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    async function fetchKeys() {
      const response = await fetch(
        `/api/platform/redis/${projectRef}/keys?pattern=*&cursor=${cursor}&count=100`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        }
      )

      const { data } = await response.json()
      setKeys(data.keys)
      setCursor(data.cursor)
    }

    fetchKeys()
  }, [projectRef, cursor])

  return (
    <div>
      {keys.map((key) => (
        <div key={key.key}>
          <span>{key.key}</span>
          <span>{key.type}</span>
          <span>{key.ttl === -1 ? 'No expiry' : `${key.ttl}s`}</span>
        </div>
      ))}
    </div>
  )
}
```

### Frontend: Querying MongoDB Documents

```typescript
const MongoDocuments = ({ projectRef, database, collection }: Props) => {
  const [documents, setDocuments] = useState([])

  const fetchDocuments = async (filter = {}) => {
    const filterString = JSON.stringify(filter)
    const response = await fetch(
      `/api/platform/mongodb/${projectRef}/databases/${database}/collections/${collection}/documents?filter=${encodeURIComponent(filterString)}&limit=50`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      }
    )

    const { data } = await response.json()
    setDocuments(data.documents)
  }

  return (
    <div>
      <input
        type="text"
        placeholder='Filter: {"age": {"$gte": 18}}'
        onBlur={(e) => {
          try {
            const filter = JSON.parse(e.target.value)
            fetchDocuments(filter)
          } catch (err) {
            // Invalid JSON
          }
        }}
      />

      <table>
        {documents.map((doc) => (
          <tr key={doc._id}>
            <td>{doc._id}</td>
            <td>{JSON.stringify(doc)}</td>
          </tr>
        ))}
      </table>
    </div>
  )
}
```

---

## Migration Checklist

- [ ] Create database migration: `002_add_multi_database_support.sql`
- [ ] Add TypeScript types: `lib/api/platform/database-types.ts`
- [ ] Implement database clients: `lib/api/database/client.ts`
- [ ] Create connection pool manager: `lib/api/database/pool-manager.ts`
- [ ] Add shared helpers: `lib/api/database/helpers.ts`
- [ ] Implement error handling: `lib/api/database/errors.ts`
- [ ] Create Redis API routes (15+ files)
- [ ] Create MongoDB API routes (20+ files)
- [ ] Add frontend components
- [ ] Write tests (unit, integration, e2e)
- [ ] Update documentation
- [ ] Security review
- [ ] Performance testing
- [ ] Deploy to Railway

---

## Testing Commands

```bash
# Test Redis connection
curl -X POST http://localhost:3000/api/platform/redis/default/connections/test-id/test \
  -H "Authorization: Bearer $TOKEN"

# List Redis keys
curl http://localhost:3000/api/platform/redis/default/keys?pattern=user:* \
  -H "Authorization: Bearer $TOKEN"

# Query MongoDB documents
curl "http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents?filter=%7B%22age%22%3A%7B%22%24gte%22%3A18%7D%7D" \
  -H "Authorization: Bearer $TOKEN"

# Create MongoDB document
curl -X POST http://localhost:3000/api/platform/mongodb/default/databases/myapp/collections/users/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"document": {"name": "John", "age": 30}}'
```
