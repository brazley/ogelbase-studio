# Unified Database Management API Design

## Executive Summary

This document outlines the API architecture for managing Redis, MongoDB, and PostgreSQL through Supabase Studio's unified interface. The design extends the existing platform API patterns to support multi-database management while maintaining consistency, type safety, and security.

---

## 1. Current API Architecture Map

### 1.1 Core Authentication & Authorization

**File:** `/apps/studio/lib/api/apiWrapper.ts` (Lines 1-51)

- **Pattern:** Wrapper function that handles authentication via `apiAuthenticate()`
- **Auth Flow:** JWT token from `Authorization: Bearer <token>` header
- **Platform Check:** `IS_PLATFORM` flag determines if auth is required
- **Usage:** `apiWrapper(req, res, handler, { withAuth: true })`

**File:** `/apps/studio/lib/api/apiAuthenticate.ts` (Lines 1-52)

- **Method:** `apiAuthenticate()` - validates JWT token
- **Token Extraction:** Reads from `req.headers.authorization`
- **User Claims:** Returns user claims via `getUserClaims(token)`
- **Error Handling:** Returns 401 with error message on failure

### 1.2 Platform Database Layer

**File:** `/apps/studio/lib/api/platform/database.ts` (Lines 1-111)

**Key Function:** `queryPlatformDatabase<T>()` (Lines 27-72)

- Executes SQL against platform database
- Encrypts connection string with `crypto.AES.encrypt()`
- Routes to pg-meta service: `${PG_META_URL}/query`
- Returns `WrappedResult<T[]>` type

**Type Definitions:**

- `PlatformOrganization` (Lines 77-84): Organization metadata
- `PlatformProject` (Lines 86-102): Project with database connection details
- `PlatformCredentials` (Lines 104-110): JWT keys per project

**Database Schema:** `/apps/studio/database/migrations/001_create_platform_schema.sql`

- Schema: `platform.*`
- Tables: `organizations`, `projects`, `credentials`
- Views: `projects_with_credentials`, `organizations_with_stats`

### 1.3 Existing API Endpoint Patterns

#### Pattern 1: Project-Scoped Endpoints

**File:** `/apps/studio/pages/api/platform/pg-meta/[ref]/query/index.ts` (Lines 1-80)

```typescript
// Route: /api/platform/pg-meta/[ref]/query
// Method: POST
// Auth: Required (withAuth: true)
// Flow:
//   1. Extract ref from req.query
//   2. Query platform DB for project's postgres_meta_url
//   3. Proxy request to project's pg-meta service
//   4. Return results
```

**Pattern Elements:**

- Dynamic route parameter: `[ref]` = project reference
- Platform DB lookup to get service URLs
- Proxy pattern to underlying service
- Error handling with status codes

#### Pattern 2: Storage API

**File:** `/apps/studio/pages/api/platform/storage/[ref]/buckets/index.ts` (Lines 1-52)

```typescript
// Route: /api/platform/storage/[ref]/buckets
// Methods: GET, POST
// Pattern: Direct Supabase client usage
// Uses: createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

#### Pattern 3: Database Info

**File:** `/apps/studio/pages/api/platform/projects/[ref]/databases.ts` (Lines 1-43)

```typescript
// Route: /api/platform/projects/[ref]/databases
// Method: GET
// Returns: Array of database connection info
// Pattern: Static response for self-hosted mode
```

### 1.4 Error Handling Pattern

**File:** `/apps/studio/lib/api/self-hosted/types.ts` (Lines 1-24)

```typescript
// Wrapped Result Pattern
export type WrappedSuccessResult<T> = { data: T; error: undefined }
export type WrappedErrorResult = { data: undefined; error: Error }
export type WrappedResult<R> = WrappedSuccessResult<R> | WrappedErrorResult

// Custom Error Class
export class PgMetaDatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public formattedError: string
  )
}
```

---

## 2. Proposed Unified API Architecture

### 2.1 Database Type Abstraction

#### Extended Platform Schema

Add to migration: `002_add_multi_database_support.sql`

```sql
-- Enum for database types
CREATE TYPE platform.database_type AS ENUM ('postgres', 'redis', 'mongodb');

-- Table: platform.database_connections
CREATE TABLE platform.database_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Database identification
    database_type platform.database_type NOT NULL,
    identifier TEXT NOT NULL, -- e.g., "primary-postgres", "cache-redis", "main-mongo"

    -- Connection details (encrypted at application level)
    connection_string TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    database_name TEXT,
    username TEXT,
    password TEXT,

    -- Additional options (JSONB for flexibility)
    options JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    is_primary BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(project_id, identifier),
    CHECK (port > 0 AND port < 65536),
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ERROR', 'CONNECTING'))
);

-- Index for lookups
CREATE INDEX idx_database_connections_project_id ON platform.database_connections(project_id);
CREATE INDEX idx_database_connections_type ON platform.database_connections(database_type);
CREATE INDEX idx_database_connections_project_type ON platform.database_connections(project_id, database_type);

-- View: All connections with project info
CREATE VIEW platform.project_databases AS
SELECT
    dc.id,
    dc.project_id,
    dc.database_type,
    dc.identifier,
    dc.host,
    dc.port,
    dc.database_name,
    dc.status,
    dc.is_primary,
    dc.created_at,
    p.ref as project_ref,
    p.name as project_name,
    p.organization_id
FROM platform.database_connections dc
JOIN platform.projects p ON dc.project_id = p.id;
```

### 2.2 TypeScript Type Definitions

**File:** `/apps/studio/lib/api/platform/database-types.ts` (NEW)

```typescript
// Database type enum
export type DatabaseType = 'postgres' | 'redis' | 'mongodb'

// Base connection interface
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
  created_at: string
  updated_at: string
}

// Postgres-specific
export interface PostgresConnection extends DatabaseConnection {
  database_type: 'postgres'
  database_name: string
  options: {
    ssl?: boolean
    pool_size?: number
    statement_timeout?: number
  }
}

// Redis-specific
export interface RedisConnection extends DatabaseConnection {
  database_type: 'redis'
  options: {
    db?: number
    tls?: boolean
    cluster?: boolean
    sentinel?: {
      master: string
      sentinels: Array<{ host: string; port: number }>
    }
  }
}

// MongoDB-specific
export interface MongoDBConnection extends DatabaseConnection {
  database_type: 'mongodb'
  database_name: string
  options: {
    replica_set?: string
    auth_source?: string
    tls?: boolean
    server_selection_timeout?: number
  }
}

// Union type for all connections
export type AnyDatabaseConnection = PostgresConnection | RedisConnection | MongoDBConnection

// Connection request/response types
export interface CreateConnectionRequest {
  project_id: string
  database_type: DatabaseType
  identifier: string
  host: string
  port: number
  database_name?: string
  username?: string
  password?: string
  options?: Record<string, unknown>
  is_primary?: boolean
}

export interface UpdateConnectionRequest {
  identifier?: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  password?: string
  options?: Record<string, unknown>
  is_primary?: boolean
  status?: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'CONNECTING'
}

export interface ConnectionTestResult {
  success: boolean
  latency_ms?: number
  version?: string
  error?: string
}
```

---

## 3. Redis Management API

### 3.1 Connection Management

#### GET /api/platform/redis/[ref]/connections

**Purpose:** List all Redis connections for a project

**Request:**

```typescript
// Query params
ref: string // project reference

// Headers
Authorization: Bearer<token>
```

**Response:**

```typescript
{
  data: RedisConnection[]
  error?: string
}
```

**Implementation:** `/apps/studio/pages/api/platform/redis/[ref]/connections/index.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase } from 'lib/api/platform/database'
import { RedisConnection } from 'lib/api/platform/database-types'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  const { data, error } = await queryPlatformDatabase<RedisConnection>({
    query: `
      SELECT dc.*
      FROM platform.database_connections dc
      JOIN platform.projects p ON dc.project_id = p.id
      WHERE p.ref = $1 AND dc.database_type = 'redis'
      ORDER BY dc.is_primary DESC, dc.created_at ASC
    `,
    parameters: [ref],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json({ data: data || [] })
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  // Implementation for creating new Redis connection
  // See section 3.1.2
}
```

#### POST /api/platform/redis/[ref]/connections

**Purpose:** Create new Redis connection

**Request:**

```typescript
{
  identifier: string       // e.g., "cache-primary"
  host: string
  port: number
  password?: string
  options?: {
    db?: number           // Redis database number (0-15)
    tls?: boolean
    cluster?: boolean
  }
}
```

**Response:**

```typescript
{
  data: RedisConnection
  error?: string
}
```

#### PUT /api/platform/redis/[ref]/connections/[id]

**Purpose:** Update Redis connection

#### DELETE /api/platform/redis/[ref]/connections/[id]

**Purpose:** Delete Redis connection

#### POST /api/platform/redis/[ref]/connections/[id]/test

**Purpose:** Test connection validity

**Response:**

```typescript
{
  success: boolean
  latency_ms: number
  version: string        // Redis version
  mode: 'standalone' | 'cluster' | 'sentinel'
  memory_used: string
  error?: string
}
```

### 3.2 Key-Value Operations

#### GET /api/platform/redis/[ref]/keys

**Purpose:** List keys with pattern matching

**Query Params:**

```typescript
{
  connection_id?: string  // Optional: specific connection
  pattern?: string        // Default: "*"
  cursor?: number        // For SCAN pagination
  count?: number         // Keys per page (default: 100)
}
```

**Response:**

```typescript
{
  data: {
    keys: Array<{
      key: string
      type: 'string' | 'list' | 'set' | 'zset' | 'hash' | 'stream'
      ttl: number        // -1 = no expiry, -2 = expired
      size: number       // Memory usage in bytes
    }>
    cursor: number       // Next cursor (0 = end)
    total_scanned: number
  }
  error?: string
}
```

**Implementation:** `/apps/studio/pages/api/platform/redis/[ref]/keys/index.ts`

```typescript
// Pseudocode
const handleGet = async (req, res) => {
  // 1. Get connection details from platform DB
  // 2. Connect to Redis using ioredis
  // 3. Execute SCAN with cursor and pattern
  // 4. For each key, get TYPE and TTL
  // 5. Return paginated results
}
```

#### GET /api/platform/redis/[ref]/keys/[key]

**Purpose:** Get key value and metadata

**Response (varies by type):**

```typescript
// String type
{
  data: {
    key: string
    type: 'string'
    value: string
    ttl: number
    encoding: string
    size: number
  }
}

// Hash type
{
  data: {
    key: string
    type: 'hash'
    fields: Record<string, string>
    ttl: number
    size: number
  }
}

// List type
{
  data: {
    key: string
    type: 'list'
    values: string[]
    length: number
    ttl: number
    size: number
  }
}
```

#### POST /api/platform/redis/[ref]/keys/[key]

**Purpose:** Set key value

**Request:**

```typescript
{
  value: string | object  // For strings, hashes, etc.
  ttl?: number           // Seconds
  nx?: boolean          // Only set if not exists
  xx?: boolean          // Only set if exists
}
```

#### PUT /api/platform/redis/[ref]/keys/[key]

**Purpose:** Update key value or TTL

#### DELETE /api/platform/redis/[ref]/keys/[key]

**Purpose:** Delete key

#### POST /api/platform/redis/[ref]/keys/[key]/expire

**Purpose:** Set/update TTL

**Request:**

```typescript
{
  ttl: number // Seconds (-1 = remove expiry)
}
```

### 3.3 Pub/Sub Operations

#### GET /api/platform/redis/[ref]/pubsub/channels

**Purpose:** List active channels

**Response:**

```typescript
{
  data: Array<{
    channel: string
    subscribers: number
    pattern: boolean
  }>
}
```

#### POST /api/platform/redis/[ref]/pubsub/publish

**Purpose:** Publish message to channel

**Request:**

```typescript
{
  channel: string
  message: string | object
}
```

**Response:**

```typescript
{
  data: {
    subscribers_reached: number
  }
}
```

#### WebSocket: /api/platform/redis/[ref]/pubsub/subscribe

**Purpose:** Subscribe to channels (real-time)

**Connection:**

```
ws://localhost:3000/api/platform/redis/[ref]/pubsub/subscribe?channels=channel1,channel2
```

**Messages:**

```typescript
// Incoming
{
  type: 'message'
  channel: string
  pattern?: string
  data: string
}

// Outgoing (client -> server)
{
  type: 'subscribe' | 'unsubscribe' | 'psubscribe' | 'punsubscribe'
  channels: string[]
}
```

### 3.4 Server Info & Stats

#### GET /api/platform/redis/[ref]/info

**Purpose:** Get Redis server information

**Response:**

```typescript
{
  data: {
    server: {
      version: string
      mode: 'standalone' | 'cluster' | 'sentinel'
      uptime_seconds: number
    }
    memory: {
      used_memory: number
      used_memory_human: string
      max_memory: number
      eviction_policy: string
    }
    stats: {
      total_commands_processed: number
      ops_per_sec: number
      keyspace_hits: number
      keyspace_misses: number
      hit_rate: number
    }
    clients: {
      connected_clients: number
      blocked_clients: number
    }
    persistence: {
      rdb_last_save_time: number
      aof_enabled: boolean
    }
    replication: {
      role: 'master' | 'slave'
      connected_slaves?: number
    }
  }
}
```

#### GET /api/platform/redis/[ref]/stats

**Purpose:** Get real-time statistics

**Query Params:**

```typescript
{
  interval?: number  // Polling interval in seconds
}
```

---

## 4. MongoDB Management API

### 4.1 Connection Management

#### GET /api/platform/mongodb/[ref]/connections

**Purpose:** List all MongoDB connections for a project

**Response:**

```typescript
{
  data: MongoDBConnection[]
  error?: string
}
```

#### POST /api/platform/mongodb/[ref]/connections

**Purpose:** Create new MongoDB connection

**Request:**

```typescript
{
  identifier: string
  host: string
  port: number
  database_name: string
  username?: string
  password?: string
  options?: {
    replica_set?: string
    auth_source?: string
    tls?: boolean
    server_selection_timeout?: number
  }
}
```

#### POST /api/platform/mongodb/[ref]/connections/[id]/test

**Purpose:** Test MongoDB connection

**Response:**

```typescript
{
  success: boolean
  latency_ms: number
  version: string
  topology: 'standalone' | 'replica_set' | 'sharded'
  databases: string[]
  error?: string
}
```

### 4.2 Database Operations

#### GET /api/platform/mongodb/[ref]/databases

**Purpose:** List databases

**Response:**

```typescript
{
  data: Array<{
    name: string
    size_on_disk: number
    empty: boolean
    collections: number
  }>
}
```

#### POST /api/platform/mongodb/[ref]/databases

**Purpose:** Create database (implicitly created with first collection)

#### GET /api/platform/mongodb/[ref]/databases/[database]/stats

**Purpose:** Get database statistics

**Response:**

```typescript
{
  data: {
    db: string
    collections: number
    views: number
    objects: number
    avg_obj_size: number
    data_size: number
    storage_size: number
    indexes: number
    index_size: number
  }
}
```

### 4.3 Collection Operations

#### GET /api/platform/mongodb/[ref]/databases/[database]/collections

**Purpose:** List collections in database

**Response:**

```typescript
{
  data: Array<{
    name: string
    type: 'collection' | 'view'
    options: object
    info: {
      count: number
      size: number
      avg_obj_size: number
      storage_size: number
      indexes: number
    }
  }>
}
```

#### POST /api/platform/mongodb/[ref]/databases/[database]/collections

**Purpose:** Create collection

**Request:**

```typescript
{
  name: string
  options?: {
    capped?: boolean
    size?: number
    max?: number
    validator?: object
    validationLevel?: 'off' | 'strict' | 'moderate'
    validationAction?: 'error' | 'warn'
  }
}
```

#### DELETE /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]

**Purpose:** Drop collection

### 4.4 Document Operations

#### GET /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/documents

**Purpose:** Query documents

**Query Params:**

```typescript
{
  filter?: string        // JSON query filter
  projection?: string    // JSON projection
  sort?: string         // JSON sort order
  limit?: number        // Default: 20
  skip?: number         // Default: 0
}
```

**Response:**

```typescript
{
  data: {
    documents: Array<any>
    total: number
    page: number
    page_size: number
    has_more: boolean
  }
}
```

**Example:**

```
GET /api/platform/mongodb/default/databases/myapp/collections/users/documents?filter={"age":{"$gte":18}}&limit=50
```

#### POST /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/documents

**Purpose:** Insert document(s)

**Request:**

```typescript
{
  document?: object      // Single document
  documents?: object[]   // Multiple documents
}
```

**Response:**

```typescript
{
  data: {
    inserted_ids: Array<string>
    inserted_count: number
  }
}
```

#### GET /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/documents/[id]

**Purpose:** Get single document by \_id

**Response:**

```typescript
{
  data: object | null
}
```

#### PUT /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/documents/[id]

**Purpose:** Update document

**Request:**

```typescript
{
  update: object         // Update operators ($set, $inc, etc.)
  upsert?: boolean      // Create if not exists
}
```

#### DELETE /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/documents/[id]

**Purpose:** Delete document

#### POST /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/aggregate

**Purpose:** Run aggregation pipeline

**Request:**

```typescript
{
  pipeline: Array<object>
  options?: {
    allowDiskUse?: boolean
    maxTimeMS?: number
  }
}
```

**Response:**

```typescript
{
  data: Array<any>
}
```

### 4.5 Index Management

#### GET /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/indexes

**Purpose:** List indexes

**Response:**

```typescript
{
  data: Array<{
    name: string
    key: Record<string, 1 | -1>
    unique?: boolean
    sparse?: boolean
    ttl?: number
    partial_filter?: object
    size: number
  }>
}
```

#### POST /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/indexes

**Purpose:** Create index

**Request:**

```typescript
{
  key: Record<string, 1 | -1>
  options?: {
    name?: string
    unique?: boolean
    sparse?: boolean
    expireAfterSeconds?: number
    partialFilterExpression?: object
    background?: boolean
  }
}
```

#### DELETE /api/platform/mongodb/[ref]/databases/[database]/collections/[collection]/indexes/[name]

**Purpose:** Drop index

---

## 5. Unified Database Client Library

### 5.1 Abstract Database Client

**File:** `/apps/studio/lib/api/database/client.ts` (NEW)

```typescript
import { createClient as createRedisClient } from 'redis'
import { MongoClient } from 'mongodb'
import { Pool } from 'pg'
import { DatabaseConnection, DatabaseType } from '../platform/database-types'

export interface DatabaseClientConfig {
  connection: DatabaseConnection
  timeout?: number
  retry?: {
    attempts: number
    delay: number
  }
}

export interface DatabaseClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  ping(): Promise<number> // Returns latency in ms
  getInfo(): Promise<any>
}

// Redis Client
export class RedisClient implements DatabaseClient {
  private client: any
  private config: DatabaseClientConfig

  constructor(config: DatabaseClientConfig) {
    this.config = config
    const conn = config.connection

    this.client = createRedisClient({
      socket: {
        host: conn.host,
        port: conn.port,
        tls: conn.options.tls,
      },
      password: conn.password,
      database: conn.options.db || 0,
      commandsQueueMaxLength: 1000,
    })

    this.client.on('error', (err: Error) => {
      console.error('Redis Client Error:', err)
    })
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect()
  }

  async ping(): Promise<number> {
    const start = Date.now()
    await this.client.ping()
    return Date.now() - start
  }

  async getInfo(): Promise<any> {
    const info = await this.client.info()
    return parseRedisInfo(info)
  }

  // Redis-specific methods
  async get(key: string): Promise<string | null> {
    return await this.client.get(key)
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value)
    } else {
      await this.client.set(key, value)
    }
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key)
  }

  async scan(cursor: number = 0, pattern: string = '*', count: number = 100) {
    return await this.client.scan(cursor, {
      MATCH: pattern,
      COUNT: count,
    })
  }

  async keys(pattern: string = '*'): Promise<string[]> {
    return await this.client.keys(pattern)
  }

  async type(key: string): Promise<string> {
    return await this.client.type(key)
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key)
  }
}

// MongoDB Client
export class MongoDBClient implements DatabaseClient {
  private client: MongoClient
  private config: DatabaseClientConfig
  private db: any

  constructor(config: DatabaseClientConfig) {
    this.config = config
    const conn = config.connection

    const connectionString = this.buildConnectionString(conn)
    this.client = new MongoClient(connectionString, {
      serverSelectionTimeoutMS: conn.options.server_selection_timeout || 5000,
      retryWrites: true,
    })
  }

  private buildConnectionString(conn: DatabaseConnection): string {
    const auth = conn.username && conn.password ? `${conn.username}:${conn.password}@` : ''

    return `mongodb://${auth}${conn.host}:${conn.port}/${conn.database_name || ''}`
  }

  async connect(): Promise<void> {
    await this.client.connect()
    if (this.config.connection.database_name) {
      this.db = this.client.db(this.config.connection.database_name)
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close()
  }

  async ping(): Promise<number> {
    const start = Date.now()
    await this.client.db('admin').command({ ping: 1 })
    return Date.now() - start
  }

  async getInfo(): Promise<any> {
    const adminDb = this.client.db('admin')
    const serverStatus = await adminDb.command({ serverStatus: 1 })
    const buildInfo = await adminDb.command({ buildInfo: 1 })

    return {
      version: buildInfo.version,
      uptime: serverStatus.uptime,
      connections: serverStatus.connections,
      memory: serverStatus.mem,
    }
  }

  // MongoDB-specific methods
  getDb(dbName?: string) {
    return dbName ? this.client.db(dbName) : this.db
  }

  async listDatabases() {
    const adminDb = this.client.db('admin')
    const result = await adminDb.command({ listDatabases: 1 })
    return result.databases
  }

  async listCollections(dbName?: string) {
    const db = this.getDb(dbName)
    return await db.listCollections().toArray()
  }
}

// Postgres Client (extends existing)
export class PostgresClient implements DatabaseClient {
  private pool: Pool
  private config: DatabaseClientConfig

  constructor(config: DatabaseClientConfig) {
    this.config = config
    const conn = config.connection

    this.pool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database_name,
      user: conn.username,
      password: conn.password,
      max: conn.options.pool_size || 10,
      connectionTimeoutMillis: config.timeout || 5000,
    })
  }

  async connect(): Promise<void> {
    // Test connection
    const client = await this.pool.connect()
    client.release()
  }

  async disconnect(): Promise<void> {
    await this.pool.end()
  }

  async ping(): Promise<number> {
    const start = Date.now()
    await this.pool.query('SELECT 1')
    return Date.now() - start
  }

  async getInfo(): Promise<any> {
    const result = await this.pool.query('SELECT version()')
    return { version: result.rows[0].version }
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(sql, params)
    return result.rows
  }
}

// Factory function
export function createDatabaseClient(config: DatabaseClientConfig): DatabaseClient {
  switch (config.connection.database_type) {
    case 'redis':
      return new RedisClient(config)
    case 'mongodb':
      return new MongoDBClient(config)
    case 'postgres':
      return new PostgresClient(config)
    default:
      throw new Error(`Unsupported database type: ${config.connection.database_type}`)
  }
}

// Helper to parse Redis INFO command output
function parseRedisInfo(info: string): Record<string, any> {
  const result: Record<string, any> = {}
  const lines = info.split('\r\n')
  let section = 'default'

  for (const line of lines) {
    if (line.startsWith('#')) {
      section = line.substring(2).toLowerCase()
      result[section] = {}
    } else if (line.includes(':')) {
      const [key, value] = line.split(':')
      result[section][key] = value
    }
  }

  return result
}
```

### 5.2 Connection Pool Manager

**File:** `/apps/studio/lib/api/database/pool-manager.ts` (NEW)

```typescript
import { DatabaseClient, createDatabaseClient } from './client'
import { DatabaseConnection } from '../platform/database-types'
import { queryPlatformDatabase } from '../platform/database'

interface PoolEntry {
  client: DatabaseClient
  lastUsed: number
  inUse: boolean
}

class ConnectionPoolManager {
  private pools: Map<string, PoolEntry> = new Map()
  private readonly maxIdleTime = 5 * 60 * 1000 // 5 minutes
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Cleanup idle connections every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections()
    }, 60 * 1000)
  }

  private getPoolKey(connection: DatabaseConnection): string {
    return `${connection.project_id}:${connection.database_type}:${connection.id}`
  }

  async getClient(connectionId: string, projectRef: string): Promise<DatabaseClient> {
    // Look up connection from platform DB
    const { data, error } = await queryPlatformDatabase<DatabaseConnection>({
      query: `
        SELECT dc.*
        FROM platform.database_connections dc
        JOIN platform.projects p ON dc.project_id = p.id
        WHERE dc.id = $1 AND p.ref = $2
      `,
      parameters: [connectionId, projectRef],
    })

    if (error || !data || data.length === 0) {
      throw new Error('Connection not found')
    }

    const connection = data[0]
    const poolKey = this.getPoolKey(connection)

    let entry = this.pools.get(poolKey)

    if (!entry) {
      // Create new client
      const client = createDatabaseClient({ connection })
      await client.connect()

      entry = {
        client,
        lastUsed: Date.now(),
        inUse: true,
      }

      this.pools.set(poolKey, entry)
    } else {
      entry.inUse = true
      entry.lastUsed = Date.now()
    }

    return entry.client
  }

  async releaseClient(
    connectionId: string,
    projectId: string,
    databaseType: string
  ): Promise<void> {
    const poolKey = `${projectId}:${databaseType}:${connectionId}`
    const entry = this.pools.get(poolKey)

    if (entry) {
      entry.inUse = false
      entry.lastUsed = Date.now()
    }
  }

  private async cleanupIdleConnections(): Promise<void> {
    const now = Date.now()

    for (const [key, entry] of this.pools.entries()) {
      if (!entry.inUse && now - entry.lastUsed > this.maxIdleTime) {
        try {
          await entry.client.disconnect()
          this.pools.delete(key)
        } catch (error) {
          console.error(`Error disconnecting idle client ${key}:`, error)
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.cleanupInterval)

    for (const [key, entry] of this.pools.entries()) {
      try {
        await entry.client.disconnect()
      } catch (error) {
        console.error(`Error disconnecting client ${key}:`, error)
      }
    }

    this.pools.clear()
  }
}

// Singleton instance
export const poolManager = new ConnectionPoolManager()
```

---

## 6. Shared Utilities & Middleware

### 6.1 Database-Agnostic Helpers

**File:** `/apps/studio/lib/api/database/helpers.ts` (NEW)

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { poolManager } from './pool-manager'
import { DatabaseConnection, DatabaseType } from '../platform/database-types'
import { queryPlatformDatabase } from '../platform/database'

/**
 * Get database connection by project ref and optional identifier
 */
export async function getDatabaseConnection(
  projectRef: string,
  databaseType: DatabaseType,
  identifier?: string
): Promise<DatabaseConnection | null> {
  let query = `
    SELECT dc.*
    FROM platform.database_connections dc
    JOIN platform.projects p ON dc.project_id = p.id
    WHERE p.ref = $1 AND dc.database_type = $2
  `

  const parameters: any[] = [projectRef, databaseType]

  if (identifier) {
    query += ` AND dc.identifier = $3`
    parameters.push(identifier)
  } else {
    query += ` AND dc.is_primary = true`
  }

  const { data, error } = await queryPlatformDatabase<DatabaseConnection>({
    query,
    parameters,
  })

  if (error || !data || data.length === 0) {
    return null
  }

  return data[0]
}

/**
 * Execute operation with database client
 */
export async function withDatabaseClient<T>(
  projectRef: string,
  databaseType: DatabaseType,
  operation: (client: any) => Promise<T>,
  identifier?: string
): Promise<{ data?: T; error?: Error }> {
  try {
    const connection = await getDatabaseConnection(projectRef, databaseType, identifier)

    if (!connection) {
      return { error: new Error('Database connection not found') }
    }

    const client = await poolManager.getClient(connection.id, projectRef)
    const result = await operation(client)

    await poolManager.releaseClient(connection.id, connection.project_id, databaseType)

    return { data: result }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Validate connection parameters
 */
export function validateConnectionParams(params: {
  host: string
  port: number
  database_type: DatabaseType
}): { isValid: boolean; error?: string } {
  if (!params.host || params.host.trim().length === 0) {
    return { isValid: false, error: 'Host is required' }
  }

  if (params.port <= 0 || params.port >= 65536) {
    return { isValid: false, error: 'Port must be between 1 and 65535' }
  }

  if (!['postgres', 'redis', 'mongodb'].includes(params.database_type)) {
    return { isValid: false, error: 'Invalid database type' }
  }

  return { isValid: true }
}

/**
 * Sanitize query parameters for safe usage
 */
export function sanitizeQueryParams(req: NextApiRequest): {
  filter?: object
  projection?: object
  sort?: object
  limit: number
  skip: number
} {
  const { filter, projection, sort, limit, skip } = req.query

  return {
    filter: filter ? JSON.parse(filter as string) : undefined,
    projection: projection ? JSON.parse(projection as string) : undefined,
    sort: sort ? JSON.parse(sort as string) : undefined,
    limit: Math.min(parseInt(limit as string) || 20, 1000),
    skip: parseInt(skip as string) || 0,
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
```

### 6.2 Error Handling

**File:** `/apps/studio/lib/api/database/errors.ts` (NEW)

```typescript
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', 503, details)
    this.name = 'ConnectionError'
  }
}

export class QueryError extends DatabaseError {
  constructor(message: string, details?: any) {
    super(message, 'QUERY_ERROR', 400, details)
    this.name = 'QueryError'
  }
}

export class AuthenticationError extends DatabaseError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details)
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends DatabaseError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export function handleDatabaseError(error: unknown, res: any): void {
  if (error instanceof DatabaseError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    })
  } else if (error instanceof Error) {
    res.status(500).json({
      error: {
        message: error.message,
        code: 'INTERNAL_ERROR',
      },
    })
  } else {
    res.status(500).json({
      error: {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      },
    })
  }
}
```

---

## 7. Authentication & Authorization Strategy

### 7.1 Current Auth Flow

1. **Token Validation:** Extract JWT from `Authorization: Bearer <token>` header
2. **User Claims:** Validate token via `getUserClaims(token)`
3. **Project Access:** Check if user has access to requested project
4. **API Wrapper:** `apiWrapper(req, res, handler, { withAuth: true })`

### 7.2 Extended Auth for Multi-Database

**Enhanced Permission Model:**

```typescript
// User -> Organization -> Projects -> Database Connections
// Permission levels:
// - Organization Owner: Full access to all projects and databases
// - Project Admin: Full access to specific project's databases
// - Project Developer: Read/write to databases
// - Project Viewer: Read-only access
```

**Implementation:** `/apps/studio/lib/api/authorization.ts` (NEW)

```typescript
import { NextApiRequest } from 'next'
import { fetchUserClaims } from './apiAuthenticate'
import { queryPlatformDatabase, PlatformProject } from './platform/database'

export type PermissionLevel = 'owner' | 'admin' | 'developer' | 'viewer'

export interface ProjectPermissions {
  canRead: boolean
  canWrite: boolean
  canAdmin: boolean
  level: PermissionLevel
}

/**
 * Check if user has access to a project
 */
export async function checkProjectAccess(
  req: NextApiRequest,
  projectRef: string
): Promise<{ hasAccess: boolean; permissions?: ProjectPermissions; error?: Error }> {
  try {
    const claims = await fetchUserClaims(req)

    if (!claims) {
      return { hasAccess: false, error: new Error('Unauthorized') }
    }

    // For self-hosted mode, grant full access
    // In production, this would check organization memberships
    const permissions: ProjectPermissions = {
      canRead: true,
      canWrite: true,
      canAdmin: true,
      level: 'owner',
    }

    return { hasAccess: true, permissions }
  } catch (error) {
    return { hasAccess: false, error: error as Error }
  }
}

/**
 * Require specific permission level
 */
export async function requirePermission(
  req: NextApiRequest,
  projectRef: string,
  requiredPermission: 'read' | 'write' | 'admin'
): Promise<{ authorized: boolean; error?: Error }> {
  const { hasAccess, permissions, error } = await checkProjectAccess(req, projectRef)

  if (!hasAccess || error) {
    return { authorized: false, error: error || new Error('Access denied') }
  }

  switch (requiredPermission) {
    case 'read':
      return { authorized: permissions!.canRead }
    case 'write':
      return { authorized: permissions!.canWrite }
    case 'admin':
      return { authorized: permissions!.canAdmin }
    default:
      return { authorized: false, error: new Error('Invalid permission level') }
  }
}
```

---

## 8. Complete API Endpoint Summary

### 8.1 Redis Endpoints

| Method | Endpoint                                          | Purpose                 | Auth     |
| ------ | ------------------------------------------------- | ----------------------- | -------- |
| GET    | `/api/platform/redis/[ref]/connections`           | List Redis connections  | Required |
| POST   | `/api/platform/redis/[ref]/connections`           | Create Redis connection | Required |
| PUT    | `/api/platform/redis/[ref]/connections/[id]`      | Update connection       | Required |
| DELETE | `/api/platform/redis/[ref]/connections/[id]`      | Delete connection       | Required |
| POST   | `/api/platform/redis/[ref]/connections/[id]/test` | Test connection         | Required |
| GET    | `/api/platform/redis/[ref]/keys`                  | List keys (paginated)   | Required |
| GET    | `/api/platform/redis/[ref]/keys/[key]`            | Get key value           | Required |
| POST   | `/api/platform/redis/[ref]/keys/[key]`            | Set key value           | Required |
| PUT    | `/api/platform/redis/[ref]/keys/[key]`            | Update key              | Required |
| DELETE | `/api/platform/redis/[ref]/keys/[key]`            | Delete key              | Required |
| POST   | `/api/platform/redis/[ref]/keys/[key]/expire`     | Set TTL                 | Required |
| GET    | `/api/platform/redis/[ref]/pubsub/channels`       | List channels           | Required |
| POST   | `/api/platform/redis/[ref]/pubsub/publish`        | Publish message         | Required |
| WS     | `/api/platform/redis/[ref]/pubsub/subscribe`      | Subscribe to channels   | Required |
| GET    | `/api/platform/redis/[ref]/info`                  | Server info             | Required |
| GET    | `/api/platform/redis/[ref]/stats`                 | Real-time stats         | Required |

### 8.2 MongoDB Endpoints

| Method | Endpoint                                                                       | Purpose                  | Auth     |
| ------ | ------------------------------------------------------------------------------ | ------------------------ | -------- |
| GET    | `/api/platform/mongodb/[ref]/connections`                                      | List MongoDB connections | Required |
| POST   | `/api/platform/mongodb/[ref]/connections`                                      | Create connection        | Required |
| PUT    | `/api/platform/mongodb/[ref]/connections/[id]`                                 | Update connection        | Required |
| DELETE | `/api/platform/mongodb/[ref]/connections/[id]`                                 | Delete connection        | Required |
| POST   | `/api/platform/mongodb/[ref]/connections/[id]/test`                            | Test connection          | Required |
| GET    | `/api/platform/mongodb/[ref]/databases`                                        | List databases           | Required |
| GET    | `/api/platform/mongodb/[ref]/databases/[db]/stats`                             | Database stats           | Required |
| GET    | `/api/platform/mongodb/[ref]/databases/[db]/collections`                       | List collections         | Required |
| POST   | `/api/platform/mongodb/[ref]/databases/[db]/collections`                       | Create collection        | Required |
| DELETE | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]`                | Drop collection          | Required |
| GET    | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents`      | Query documents          | Required |
| POST   | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents`      | Insert documents         | Required |
| GET    | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]` | Get document             | Required |
| PUT    | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]` | Update document          | Required |
| DELETE | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/documents/[id]` | Delete document          | Required |
| POST   | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/aggregate`      | Run aggregation          | Required |
| GET    | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes`        | List indexes             | Required |
| POST   | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes`        | Create index             | Required |
| DELETE | `/api/platform/mongodb/[ref]/databases/[db]/collections/[coll]/indexes/[name]` | Drop index               | Required |

### 8.3 Postgres Endpoints (Existing + New)

| Method | Endpoint                                 | Purpose           | Auth     |
| ------ | ---------------------------------------- | ----------------- | -------- |
| POST   | `/api/platform/pg-meta/[ref]/query`      | Execute SQL query | Required |
| GET    | `/api/platform/pg-meta/[ref]/tables`     | List tables       | Required |
| GET    | `/api/platform/pg-meta/[ref]/views`      | List views        | Required |
| GET    | `/api/platform/projects/[ref]/databases` | Get database info | Required |

---

## 9. Implementation Priority & Phases

### Phase 1: Foundation (Week 1)

1. Database schema migration (multi-database support)
2. TypeScript type definitions
3. Database client abstractions
4. Connection pool manager
5. Shared utilities and error handling

### Phase 2: Redis API (Week 2)

1. Connection management endpoints
2. Key-value operations
3. Server info endpoint
4. Basic testing and validation

### Phase 3: MongoDB API (Week 3)

1. Connection management endpoints
2. Database and collection operations
3. Document CRUD operations
4. Index management

### Phase 4: Advanced Features (Week 4)

1. Redis Pub/Sub (WebSocket)
2. MongoDB aggregation pipelines
3. Real-time statistics
4. Performance optimizations

### Phase 5: Frontend Integration (Week 5)

1. UI components for Redis management
2. UI components for MongoDB management
3. Unified database switcher
4. Testing and bug fixes

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// Example: /apps/studio/lib/api/database/__tests__/client.test.ts

describe('RedisClient', () => {
  it('should connect to Redis server', async () => {
    const connection: RedisConnection = {
      id: 'test-id',
      project_id: 'test-project',
      database_type: 'redis',
      identifier: 'test-redis',
      host: 'localhost',
      port: 6379,
      password: undefined,
      options: {},
      is_primary: true,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const client = new RedisClient({ connection })
    await client.connect()
    const latency = await client.ping()

    expect(latency).toBeGreaterThan(0)

    await client.disconnect()
  })

  it('should set and get key', async () => {
    // Test implementation
  })
})
```

### 10.2 Integration Tests

```typescript
// Example: /apps/studio/pages/api/platform/redis/__tests__/keys.test.ts

describe('Redis Keys API', () => {
  it('GET /api/platform/redis/[ref]/keys should list keys', async () => {
    const response = await fetch('/api/platform/redis/default/keys?pattern=test:*', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.data.keys).toBeArray()
  })
})
```

### 10.3 End-to-End Tests

Using Playwright:

```typescript
test('Redis key management flow', async ({ page }) => {
  await page.goto('/project/default/databases/redis')

  // Create key
  await page.click('button:has-text("New Key")')
  await page.fill('input[name="key"]', 'test:key')
  await page.fill('input[name="value"]', 'test value')
  await page.click('button:has-text("Create")')

  // Verify key appears
  await expect(page.locator('text=test:key')).toBeVisible()

  // Delete key
  await page.click('[data-key="test:key"] button:has-text("Delete")')
  await page.click('button:has-text("Confirm")')

  // Verify key is gone
  await expect(page.locator('text=test:key')).not.toBeVisible()
})
```

---

## 11. Security Considerations

### 11.1 Connection String Encryption

All connection strings and passwords stored in the database must be encrypted at the application level:

```typescript
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY!
const ALGORITHM = 'aes-256-gcm'

export function encryptConnectionString(connectionString: string): {
  encrypted: string
  iv: string
  authTag: string
} {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)

  let encrypted = cipher.update(connectionString, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  }
}

export function decryptConnectionString(encrypted: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(iv, 'hex')
  )

  decipher.setAuthTag(Buffer.from(authTag, 'hex'))

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
```

### 11.2 Rate Limiting

Implement rate limiting for database operations:

```typescript
// /apps/studio/lib/api/middleware/rate-limit.ts

import { NextApiRequest, NextApiResponse } from 'next'

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function rateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  maxRequests: number = 100,
  windowMs: number = 60000
): boolean {
  const key = req.headers.authorization || req.socket.remoteAddress || 'anonymous'
  const now = Date.now()

  const record = rateLimitMap.get(key)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= maxRequests) {
    res.status(429).json({
      error: {
        message: 'Too many requests',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      },
    })
    return false
  }

  record.count++
  return true
}
```

### 11.3 Query Sanitization

For MongoDB queries, validate and sanitize user input:

```typescript
export function sanitizeMongoQuery(query: any): any {
  // Prevent NoSQL injection
  const dangerousOperators = ['$where', '$function', '$accumulator']

  function sanitize(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    for (const key in obj) {
      if (dangerousOperators.includes(key)) {
        throw new QueryError(`Operator ${key} is not allowed`)
      }

      obj[key] = sanitize(obj[key])
    }

    return obj
  }

  return sanitize(query)
}
```

---

## 12. Performance Optimizations

### 12.1 Connection Pooling

- Redis: Use connection pooling with max 10 connections per project
- MongoDB: Limit connection pool to 10-20 connections
- Postgres: Already has pooling via `pg.Pool`

### 12.2 Caching

```typescript
// Cache database connection metadata
const connectionCache = new Map<string, { data: DatabaseConnection; expiresAt: number }>()

export async function getCachedConnection(
  projectRef: string,
  databaseType: DatabaseType
): Promise<DatabaseConnection | null> {
  const cacheKey = `${projectRef}:${databaseType}`
  const cached = connectionCache.get(cacheKey)

  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const connection = await getDatabaseConnection(projectRef, databaseType)

  if (connection) {
    connectionCache.set(cacheKey, {
      data: connection,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    })
  }

  return connection
}
```

### 12.3 Query Optimization

- Use indexes in platform database for lookups
- Implement pagination for all list endpoints
- Use projection to limit data transfer
- Cache frequently accessed data

---

## 13. Monitoring & Logging

### 13.1 Structured Logging

```typescript
import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label }
    },
  },
})

export function logDatabaseOperation(
  operation: string,
  projectRef: string,
  databaseType: DatabaseType,
  duration: number,
  error?: Error
): void {
  const logData = {
    operation,
    projectRef,
    databaseType,
    duration,
    timestamp: new Date().toISOString(),
  }

  if (error) {
    logger.error({ ...logData, error: error.message }, 'Database operation failed')
  } else {
    logger.info(logData, 'Database operation completed')
  }
}
```

### 13.2 Metrics Collection

Track key metrics:

- Request latency per database type
- Error rates
- Connection pool utilization
- Cache hit rates

---

## Conclusion

This unified database management API design provides:

1. **Consistent Patterns:** All database types follow similar REST API patterns
2. **Type Safety:** Full TypeScript coverage with strong typing
3. **Extensibility:** Easy to add new database types in the future
4. **Security:** Multi-layered authentication, authorization, and encryption
5. **Performance:** Connection pooling, caching, and optimization strategies
6. **Maintainability:** Clear separation of concerns with modular architecture

The implementation follows Supabase Studio's existing patterns while extending them to support Redis and MongoDB alongside PostgreSQL in a unified, developer-friendly interface.
