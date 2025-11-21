# Multi-Database Architecture for Supabase Studio
**Date**: November 20, 2025
**Author**: Rafael Santos (Database Architect)
**Status**: Design Phase

## Executive Summary

This document outlines the architecture for unifying Redis, MongoDB, and PostgreSQL database management under a single Supabase Studio frontend interface. The goal is to provide seamless management of all three database types through the existing Studio UI while maintaining separation of concerns and optimal performance.

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Proposed Multi-Database Architecture](#proposed-multi-database-architecture)
3. [Connection Layer Design](#connection-layer-design)
4. [Data Model Extensions](#data-model-extensions)
5. [API Route Structure](#api-route-structure)
6. [Client Library Recommendations](#client-library-recommendations)
7. [Environment Configuration](#environment-configuration)
8. [Security Considerations](#security-considerations)
9. [Performance & Scaling](#performance--scaling)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Current Architecture Analysis

### Existing Database Connection Flow

#### 1. PostgreSQL Connection Architecture

**File**: `/apps/studio/lib/api/platform/database.ts`

```typescript
// Current connection pattern
const PLATFORM_DATABASE_URL = process.env.DATABASE_URL || ''
const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY || 'SAMPLE_KEY'

// Connection via pg-meta service
async function queryPlatformDatabase({query, parameters}) {
  const connectionStringEncrypted = encryptString(PLATFORM_DATABASE_URL)

  const response = await fetch(`${PG_META_URL}/query`, {
    method: 'POST',
    headers: {
      'x-connection-encrypted': connectionStringEncrypted,
    },
    body: JSON.stringify({query, parameters})
  })
}
```

**Key Characteristics**:
- Uses **pg-meta** service as intermediary (not direct PostgreSQL client)
- Connection strings are encrypted in transit using `crypto-js`
- Supports both internal Railway URLs and public URLs
- Connection metadata stored in platform database

**Connection Flow**:
```
┌─────────────────────────────────────────┐
│  Studio Frontend (Next.js/React)       │
│  - UI Components                        │
│  - React Query hooks                    │
└─────────────────┬───────────────────────┘
                  │ HTTP Request
                  ▼
┌─────────────────────────────────────────┐
│  API Routes (/api/platform/*)           │
│  - NextApiRequest/NextApiResponse       │
│  - Business logic & validation          │
└─────────────────┬───────────────────────┘
                  │ queryPlatformDatabase()
                  ▼
┌─────────────────────────────────────────┐
│  Platform Database Helper               │
│  - Encrypts connection string           │
│  - Constructs pg-meta request           │
└─────────────────┬───────────────────────┘
                  │ HTTP POST to pg-meta
                  ▼
┌─────────────────────────────────────────┐
│  PG-Meta Service (Railway)              │
│  - Decrypts connection string           │
│  - Executes SQL query                   │
│  - Returns JSON response                │
└─────────────────┬───────────────────────┘
                  │ PostgreSQL Protocol
                  ▼
┌─────────────────────────────────────────┐
│  PostgreSQL Database (Railway)          │
│  - platform.organizations               │
│  - platform.projects                    │
│  - platform.credentials                 │
└─────────────────────────────────────────┘
```

#### 2. Current Platform Database Schema

**File**: `/apps/studio/database/README.md`

Current schema (PostgreSQL only):
```sql
-- platform.organizations
CREATE TABLE platform.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  billing_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- platform.projects
CREATE TABLE platform.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  ref TEXT UNIQUE NOT NULL,
  database_host TEXT NOT NULL,
  database_port INTEGER DEFAULT 5432,
  database_name TEXT NOT NULL,
  database_user TEXT NOT NULL,
  database_password TEXT NOT NULL,
  postgres_meta_url TEXT,
  supabase_url TEXT,
  status TEXT DEFAULT 'ACTIVE_HEALTHY',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- platform.credentials
CREATE TABLE platform.credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID UNIQUE REFERENCES platform.projects(id) ON DELETE CASCADE,
  anon_key TEXT NOT NULL,
  service_role_key TEXT NOT NULL,
  jwt_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. Environment Variables Architecture

**File**: `/apps/studio/.env.production`

```bash
# Platform Database (Single PostgreSQL instance)
DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/postgres
PG_META_CRYPTO_KEY=3b34c406cca1217f7762867a75bf89e8a14bf8adbd29bea4ff874990131b7521

# Services
STUDIO_PG_META_URL=https://postgres-meta-production-6c48.up.railway.app
SUPABASE_URL=https://kong-production-80c6.up.railway.app

# Platform Mode
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api
```

#### 4. API Route Pattern

**File**: `/apps/studio/pages/api/platform/profile/index.ts`

```typescript
// Typical API route structure
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({error: {message: `Method ${method} Not Allowed`}})
  }
}

const handleGetAll = async (req, res) => {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse)
  }

  // Query platform database
  const {data, error} = await queryPlatformDatabase({
    query: 'SELECT * FROM platform.organizations',
    parameters: []
  })

  // Handle errors with fallback
  if (error) {
    return res.status(200).json(defaultResponse)
  }

  return res.status(200).json(data)
}
```

### Key Insights from Current Architecture

1. **Abstraction Pattern**: Studio doesn't use direct database clients - it proxies through pg-meta
2. **Security**: Connection strings are encrypted in transit
3. **Fallback Strategy**: Default responses when database is unavailable
4. **Railway Integration**: Uses internal Railway URLs for service-to-service communication
5. **Single Database Type**: Current implementation assumes PostgreSQL only

---

## Proposed Multi-Database Architecture

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Supabase Studio Frontend (Next.js)                │
│                                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Postgres   │  │   Redis     │  │  MongoDB    │  │   Bun API   │ │
│  │  Manager    │  │  Manager    │  │  Manager    │  │  Manager    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │         │
└─────────┼────────────────┼────────────────┼────────────────┼─────────┘
          │                │                │                │
          │ /api/platform/* endpoints       │                │
          ▼                ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       API Route Layer (Next.js API)                   │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  /postgres/*     │  │  /redis/*        │  │  /mongodb/*      │   │
│  │  - Tables        │  │  - Keys          │  │  - Collections   │   │
│  │  - Functions     │  │  - Hashes        │  │  - Documents     │   │
│  │  - Policies      │  │  - Lists         │  │  - Indexes       │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│           │                     │                      │             │
└───────────┼─────────────────────┼──────────────────────┼─────────────┘
            │                     │                      │
            ▼                     ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Database Connection Manager                        │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  PostgreSQL      │  │  Redis Client    │  │  MongoDB Client  │   │
│  │  Client Pool     │  │  Pool            │  │  Connection Pool │   │
│  │  (via pg-meta)   │  │  (ioredis)       │  │  (mongodb)       │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│           │                     │                      │             │
└───────────┼─────────────────────┼──────────────────────┼─────────────┘
            │                     │                      │
            ▼                     ▼                      ▼
┌───────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│  PostgreSQL       │  │  Redis Instance  │  │  MongoDB Instance  │
│  (Railway)        │  │  (Railway)       │  │  (Railway)         │
│  - Platform DB    │  │  - Cache         │  │  - Document Store  │
│  - App DB         │  │  - Sessions      │  │  - User Data       │
└───────────────────┘  └──────────────────┘  └────────────────────┘

                              ▲
                              │
                              │ All metadata stored here
                              ▼
                    ┌──────────────────┐
                    │  Platform DB     │
                    │  (PostgreSQL)    │
                    │  =============== │
                    │  - organizations │
                    │  - projects      │
                    │  - credentials   │
                    │  - databases  ★  │
                    └──────────────────┘
```

### Connection Strategy by Database Type

#### PostgreSQL (Existing Pattern - Keep As-Is)
- **Client**: None (uses pg-meta HTTP service)
- **Connection**: Via encrypted connection string to pg-meta
- **Pooling**: Handled by pg-meta service
- **Use Case**: Platform metadata, Supabase project databases

#### Redis (New - Direct Client)
- **Client**: `ioredis` (industry standard, battle-tested)
- **Connection**: Direct TCP connection with connection pooling
- **Pooling**: Built-in connection pool with configurable limits
- **Use Case**: Caching, sessions, real-time data, pub/sub

#### MongoDB (New - Direct Client)
- **Client**: Official `mongodb` driver
- **Connection**: MongoDB connection string with replica set support
- **Pooling**: Built-in connection pool with automatic failover
- **Use Case**: Document storage, flexible schemas, aggregations

#### Bun Server (New - HTTP Client)
- **Client**: Standard `fetch` API
- **Connection**: HTTP/HTTPS requests to Bun server endpoints
- **Pooling**: HTTP/2 connection reuse via fetch
- **Use Case**: Custom business logic, API aggregation

---

## Connection Layer Design

### File Structure

```
apps/studio/
├── lib/
│   ├── api/
│   │   ├── platform/
│   │   │   ├── database.ts              # Existing PostgreSQL
│   │   │   ├── redis.ts                 # NEW: Redis connection
│   │   │   ├── mongodb.ts               # NEW: MongoDB connection
│   │   │   ├── bun-api.ts               # NEW: Bun server client
│   │   │   └── connection-manager.ts    # NEW: Unified manager
│   │   └── self-hosted/
│   │       └── types.ts                 # Add multi-DB types
│   └── constants/
│       ├── database-types.ts            # NEW: DB type enums
│       └── connection-strings.ts        # NEW: URL builders
└── pages/
    └── api/
        └── platform/
            ├── postgres/                # Existing, reorganized
            ├── redis/                   # NEW: Redis endpoints
            │   ├── keys/
            │   ├── hashes/
            │   └── lists/
            ├── mongodb/                 # NEW: MongoDB endpoints
            │   ├── collections/
            │   ├── documents/
            │   └── indexes/
            └── databases/               # NEW: Multi-DB management
                ├── index.ts             # List all databases
                ├── create.ts            # Add new database
                └── [id]/
                    ├── index.ts         # Get database details
                    ├── test.ts          # Test connection
                    └── delete.ts        # Remove database
```

### Redis Connection Manager

**File**: `/apps/studio/lib/api/platform/redis.ts`

```typescript
import Redis, { RedisOptions } from 'ioredis'
import crypto from 'crypto-js'

// Environment variables
const REDIS_URL = process.env.REDIS_URL || ''
const REDIS_CRYPTO_KEY = process.env.REDIS_CRYPTO_KEY || process.env.PG_META_CRYPTO_KEY
const MAX_CONNECTIONS = parseInt(process.env.REDIS_MAX_CONNECTIONS || '10')

// Connection pool (singleton pattern)
let redisClient: Redis | null = null
const redisConnections = new Map<string, Redis>()

/**
 * Encrypts a Redis connection string
 */
function encryptRedisUrl(url: string): string {
  return crypto.AES.encrypt(url, REDIS_CRYPTO_KEY).toString()
}

/**
 * Decrypts a Redis connection string
 */
function decryptRedisUrl(encrypted: string): string {
  const bytes = crypto.AES.decrypt(encrypted, REDIS_CRYPTO_KEY)
  return bytes.toString(crypto.enc.Utf8)
}

/**
 * Get or create Redis connection for a specific database
 */
export function getRedisConnection(connectionString?: string): Redis {
  const connStr = connectionString || REDIS_URL

  // Return existing connection if available
  if (redisConnections.has(connStr)) {
    return redisConnections.get(connStr)!
  }

  // Parse connection string
  const options: RedisOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
    reconnectOnError(err) {
      const targetError = 'READONLY'
      if (err.message.includes(targetError)) {
        return true // Reconnect on read-only errors
      }
      return false
    },
    // Connection pooling
    enableReadyCheck: true,
    lazyConnect: false,
    // Performance optimizations
    enableOfflineQueue: true,
    // Connection timeouts
    connectTimeout: 10000,
    commandTimeout: 5000,
  }

  // Create new connection
  const client = new Redis(connStr, options)

  // Error handling
  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err)
  })

  client.on('connect', () => {
    console.log('[Redis] Connected successfully')
  })

  client.on('ready', () => {
    console.log('[Redis] Ready to accept commands')
  })

  // Store in pool
  if (redisConnections.size < MAX_CONNECTIONS) {
    redisConnections.set(connStr, client)
  }

  return client
}

/**
 * Close all Redis connections
 */
export async function closeRedisConnections() {
  const promises = Array.from(redisConnections.values()).map(client =>
    client.quit()
  )
  await Promise.all(promises)
  redisConnections.clear()
}

/**
 * Execute Redis command with connection from encrypted string
 */
export async function executeRedisCommand<T = any>({
  encryptedConnection,
  command,
  args = [],
}: {
  encryptedConnection?: string
  command: string
  args?: any[]
}): Promise<{ data?: T; error?: Error }> {
  try {
    const connStr = encryptedConnection
      ? decryptRedisUrl(encryptedConnection)
      : REDIS_URL

    if (!connStr) {
      return { error: new Error('Redis connection string not configured') }
    }

    const client = getRedisConnection(connStr)

    // Execute command
    const result = await client.call(command, ...args)

    return { data: result as T }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(connectionString: string): Promise<boolean> {
  try {
    const client = new Redis(connectionString, {
      connectTimeout: 5000,
      lazyConnect: true,
    })

    await client.connect()
    await client.ping()
    await client.quit()

    return true
  } catch (error) {
    console.error('[Redis] Connection test failed:', error)
    return false
  }
}

/**
 * Redis-specific helper functions
 */
export const RedisHelpers = {
  // Get all keys matching pattern
  async getKeys(pattern: string = '*', connectionString?: string) {
    return executeRedisCommand({
      encryptedConnection: connectionString ? encryptString(connectionString) : undefined,
      command: 'KEYS',
      args: [pattern],
    })
  },

  // Get value by key
  async get(key: string, connectionString?: string) {
    return executeRedisCommand({
      encryptedConnection: connectionString ? encryptString(connectionString) : undefined,
      command: 'GET',
      args: [key],
    })
  },

  // Set value
  async set(key: string, value: string, connectionString?: string) {
    return executeRedisCommand({
      encryptedConnection: connectionString ? encryptString(connectionString) : undefined,
      command: 'SET',
      args: [key, value],
    })
  },

  // Get hash fields
  async hgetall(key: string, connectionString?: string) {
    return executeRedisCommand({
      encryptedConnection: connectionString ? encryptString(connectionString) : undefined,
      command: 'HGETALL',
      args: [key],
    })
  },

  // Database info
  async info(section?: string, connectionString?: string) {
    return executeRedisCommand({
      encryptedConnection: connectionString ? encryptString(connectionString) : undefined,
      command: 'INFO',
      args: section ? [section] : [],
    })
  },
}

// Export helper to encrypt connection strings (for consistency with PostgreSQL)
function encryptString(str: string): string {
  return crypto.AES.encrypt(str, REDIS_CRYPTO_KEY).toString()
}
```

### MongoDB Connection Manager

**File**: `/apps/studio/lib/api/platform/mongodb.ts`

```typescript
import { MongoClient, MongoClientOptions, Db } from 'mongodb'
import crypto from 'crypto-js'

// Environment variables
const MONGODB_URL = process.env.MONGODB_URL || ''
const MONGODB_CRYPTO_KEY = process.env.MONGODB_CRYPTO_KEY || process.env.PG_META_CRYPTO_KEY
const MAX_POOL_SIZE = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10')

// Connection pool
const mongoClients = new Map<string, MongoClient>()

/**
 * Encrypts a MongoDB connection string
 */
function encryptMongoUrl(url: string): string {
  return crypto.AES.encrypt(url, MONGODB_CRYPTO_KEY).toString()
}

/**
 * Decrypts a MongoDB connection string
 */
function decryptMongoUrl(encrypted: string): string {
  const bytes = crypto.AES.decrypt(encrypted, MONGODB_CRYPTO_KEY)
  return bytes.toString(crypto.enc.Utf8)
}

/**
 * Get or create MongoDB client for a specific connection
 */
export async function getMongoClient(connectionString?: string): Promise<MongoClient> {
  const connStr = connectionString || MONGODB_URL

  // Return existing client if available and connected
  if (mongoClients.has(connStr)) {
    const client = mongoClients.get(connStr)!
    try {
      // Test if connection is alive
      await client.db('admin').command({ ping: 1 })
      return client
    } catch (err) {
      // Connection is dead, remove from pool
      mongoClients.delete(connStr)
    }
  }

  // Create new client
  const options: MongoClientOptions = {
    maxPoolSize: MAX_POOL_SIZE,
    minPoolSize: 2,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
    // Retry logic
    retryWrites: true,
    retryReads: true,
    // Connection monitoring
    monitorCommands: true,
  }

  const client = new MongoClient(connStr, options)

  // Connect
  await client.connect()

  // Store in pool
  if (mongoClients.size < MAX_POOL_SIZE) {
    mongoClients.set(connStr, client)
  }

  return client
}

/**
 * Close all MongoDB connections
 */
export async function closeMongoConnections() {
  const promises = Array.from(mongoClients.values()).map(client =>
    client.close()
  )
  await Promise.all(promises)
  mongoClients.clear()
}

/**
 * Execute MongoDB operation with connection from encrypted string
 */
export async function executeMongoOperation<T = any>({
  encryptedConnection,
  database,
  operation,
}: {
  encryptedConnection?: string
  database: string
  operation: (db: Db) => Promise<T>
}): Promise<{ data?: T; error?: Error }> {
  try {
    const connStr = encryptedConnection
      ? decryptMongoUrl(encryptedConnection)
      : MONGODB_URL

    if (!connStr) {
      return { error: new Error('MongoDB connection string not configured') }
    }

    const client = await getMongoClient(connStr)
    const db = client.db(database)

    const result = await operation(db)

    return { data: result }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Test MongoDB connection
 */
export async function testMongoConnection(connectionString: string): Promise<boolean> {
  try {
    const client = new MongoClient(connectionString, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    })

    await client.connect()
    await client.db('admin').command({ ping: 1 })
    await client.close()

    return true
  } catch (error) {
    console.error('[MongoDB] Connection test failed:', error)
    return false
  }
}

/**
 * MongoDB-specific helper functions
 */
export const MongoHelpers = {
  // List databases
  async listDatabases(connectionString?: string) {
    return executeMongoOperation({
      encryptedConnection: connectionString ? encryptMongoUrl(connectionString) : undefined,
      database: 'admin',
      operation: async (db) => {
        const adminDb = db.admin()
        const result = await adminDb.listDatabases()
        return result.databases
      },
    })
  },

  // List collections in a database
  async listCollections(database: string, connectionString?: string) {
    return executeMongoOperation({
      encryptedConnection: connectionString ? encryptMongoUrl(connectionString) : undefined,
      database,
      operation: async (db) => {
        const collections = await db.listCollections().toArray()
        return collections
      },
    })
  },

  // Count documents in collection
  async countDocuments(database: string, collection: string, filter = {}, connectionString?: string) {
    return executeMongoOperation({
      encryptedConnection: connectionString ? encryptMongoUrl(connectionString) : undefined,
      database,
      operation: async (db) => {
        const count = await db.collection(collection).countDocuments(filter)
        return count
      },
    })
  },

  // Find documents
  async find(database: string, collection: string, filter = {}, options = {}, connectionString?: string) {
    return executeMongoOperation({
      encryptedConnection: connectionString ? encryptMongoUrl(connectionString) : undefined,
      database,
      operation: async (db) => {
        const docs = await db.collection(collection).find(filter, options).toArray()
        return docs
      },
    })
  },

  // Get database stats
  async stats(database: string, connectionString?: string) {
    return executeMongoOperation({
      encryptedConnection: connectionString ? encryptMongoUrl(connectionString) : undefined,
      database,
      operation: async (db) => {
        const stats = await db.stats()
        return stats
      },
    })
  },
}
```

### Unified Connection Manager

**File**: `/apps/studio/lib/api/platform/connection-manager.ts`

```typescript
import { queryPlatformDatabase } from './database'
import { executeRedisCommand, RedisHelpers, closeRedisConnections } from './redis'
import { executeMongoOperation, MongoHelpers, closeMongoConnections } from './mongodb'

export enum DatabaseType {
  POSTGRES = 'postgres',
  REDIS = 'redis',
  MONGODB = 'mongodb',
  BUN_API = 'bun_api',
}

export interface DatabaseConnection {
  id: string
  type: DatabaseType
  name: string
  connectionString: string
  metadata?: Record<string, any>
}

/**
 * Unified interface for all database operations
 */
export class ConnectionManager {
  /**
   * Test connection to any database type
   */
  static async testConnection(type: DatabaseType, connectionString: string): Promise<boolean> {
    switch (type) {
      case DatabaseType.POSTGRES:
        // Use pg-meta to test connection
        const { error } = await queryPlatformDatabase({
          query: 'SELECT 1',
          parameters: [],
        })
        return !error

      case DatabaseType.REDIS:
        const { testRedisConnection } = await import('./redis')
        return testRedisConnection(connectionString)

      case DatabaseType.MONGODB:
        const { testMongoConnection } = await import('./mongodb')
        return testMongoConnection(connectionString)

      case DatabaseType.BUN_API:
        // Test HTTP endpoint
        try {
          const response = await fetch(`${connectionString}/health`)
          return response.ok
        } catch {
          return false
        }

      default:
        return false
    }
  }

  /**
   * Get database info
   */
  static async getDatabaseInfo(type: DatabaseType, connectionString: string) {
    switch (type) {
      case DatabaseType.POSTGRES:
        return queryPlatformDatabase({
          query: 'SELECT version()',
          parameters: [],
        })

      case DatabaseType.REDIS:
        return RedisHelpers.info('server', connectionString)

      case DatabaseType.MONGODB:
        return MongoHelpers.listDatabases(connectionString)

      case DatabaseType.BUN_API:
        const response = await fetch(`${connectionString}/info`)
        return response.json()

      default:
        throw new Error(`Unsupported database type: ${type}`)
    }
  }

  /**
   * Close all connections
   */
  static async closeAll() {
    await Promise.all([
      closeRedisConnections(),
      closeMongoConnections(),
    ])
  }
}

/**
 * Export helpers for each database type
 */
export const Database = {
  Postgres: { query: queryPlatformDatabase },
  Redis: RedisHelpers,
  Mongo: MongoHelpers,
}
```

---

## Data Model Extensions

### Enhanced Platform Database Schema

**File**: `/apps/studio/database/migrations/002_add_multi_database_support.sql`

```sql
-- Add database_type enum
CREATE TYPE platform.database_type AS ENUM (
  'postgres',
  'redis',
  'mongodb',
  'bun_api'
);

-- New table: platform.databases
-- Stores connection information for all database types
CREATE TABLE platform.databases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES platform.projects(id) ON DELETE CASCADE,

  -- Database identification
  name TEXT NOT NULL,
  type platform.database_type NOT NULL,
  description TEXT,

  -- Connection details
  connection_string TEXT NOT NULL, -- Encrypted in application layer
  host TEXT,
  port INTEGER,
  database_name TEXT,
  username TEXT,

  -- Additional configuration (JSON for flexibility)
  config JSONB DEFAULT '{}',

  -- Metadata
  status TEXT DEFAULT 'active', -- active, inactive, error
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (project_id, name),
  CHECK (name ~ '^[a-z0-9-]+$') -- URL-safe names
);

-- Indexes
CREATE INDEX idx_databases_project_id ON platform.databases(project_id);
CREATE INDEX idx_databases_type ON platform.databases(type);
CREATE INDEX idx_databases_status ON platform.databases(status);

-- Add triggers for updated_at
CREATE TRIGGER update_databases_updated_at
  BEFORE UPDATE ON platform.databases
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- View: All databases with project info
CREATE VIEW platform.databases_with_projects AS
SELECT
  d.*,
  p.name AS project_name,
  p.ref AS project_ref,
  o.name AS organization_name,
  o.slug AS organization_slug
FROM platform.databases d
JOIN platform.projects p ON d.project_id = p.id
JOIN platform.organizations o ON p.organization_id = o.id;

-- Function: Get databases by project
CREATE FUNCTION platform.get_databases_by_project(project_ref TEXT)
RETURNS SETOF platform.databases AS $$
  SELECT d.*
  FROM platform.databases d
  JOIN platform.projects p ON d.project_id = p.id
  WHERE p.ref = project_ref
  ORDER BY d.created_at DESC;
$$ LANGUAGE SQL STABLE;

-- Function: Get database by name
CREATE FUNCTION platform.get_database_by_name(
  project_ref TEXT,
  database_name TEXT
)
RETURNS platform.databases AS $$
  SELECT d.*
  FROM platform.databases d
  JOIN platform.projects p ON d.project_id = p.id
  WHERE p.ref = project_ref AND d.name = database_name
  LIMIT 1;
$$ LANGUAGE SQL STABLE;
```

### TypeScript Types

**File**: `/apps/studio/lib/api/platform/database.ts` (additions)

```typescript
// Add to existing types
export enum DatabaseType {
  POSTGRES = 'postgres',
  REDIS = 'redis',
  MONGODB = 'mongodb',
  BUN_API = 'bun_api',
}

export type PlatformDatabase = {
  id: string
  project_id: string
  name: string
  type: DatabaseType
  description?: string
  connection_string: string // Encrypted
  host?: string
  port?: number
  database_name?: string
  username?: string
  config?: Record<string, any>
  status: 'active' | 'inactive' | 'error'
  last_connected_at?: string
  created_at?: string
  updated_at?: string
}

export type PlatformDatabaseWithProject = PlatformDatabase & {
  project_name: string
  project_ref: string
  organization_name: string
  organization_slug: string
}
```

---

## API Route Structure

### Database Management Endpoints

**File**: `/apps/studio/pages/api/platform/databases/index.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformDatabase } from 'lib/api/platform/database'
import { ConnectionManager, DatabaseType } from 'lib/api/platform/connection-manager'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    case 'POST':
      return handleCreate(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

/**
 * GET /api/platform/databases
 * Get all databases across all projects (or filtered by project)
 */
const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  const { projectRef } = req.query

  let query = 'SELECT * FROM platform.databases_with_projects'
  const parameters: any[] = []

  if (projectRef) {
    query += ' WHERE project_ref = $1'
    parameters.push(projectRef)
  }

  query += ' ORDER BY created_at DESC'

  const { data, error } = await queryPlatformDatabase<PlatformDatabase>({
    query,
    parameters,
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}

/**
 * POST /api/platform/databases
 * Create a new database connection
 */
const handleCreate = async (req: NextApiRequest, res: NextApiResponse) => {
  const {
    projectRef,
    name,
    type,
    description,
    connectionString,
    host,
    port,
    databaseName,
    username,
    config,
  } = req.body

  // Validate required fields
  if (!projectRef || !name || !type || !connectionString) {
    return res.status(400).json({
      error: { message: 'Missing required fields: projectRef, name, type, connectionString' }
    })
  }

  // Validate database type
  if (!Object.values(DatabaseType).includes(type)) {
    return res.status(400).json({
      error: { message: `Invalid database type. Must be one of: ${Object.values(DatabaseType).join(', ')}` }
    })
  }

  // Test connection before saving
  const isValid = await ConnectionManager.testConnection(type, connectionString)
  if (!isValid) {
    return res.status(400).json({
      error: { message: 'Unable to connect to database. Please check connection string.' }
    })
  }

  // Get project ID
  const { data: projects } = await queryPlatformDatabase({
    query: 'SELECT id FROM platform.projects WHERE ref = $1',
    parameters: [projectRef],
  })

  if (!projects || projects.length === 0) {
    return res.status(404).json({ error: { message: 'Project not found' } })
  }

  const projectId = projects[0].id

  // Insert database
  const { data, error } = await queryPlatformDatabase<PlatformDatabase>({
    query: `
      INSERT INTO platform.databases (
        project_id, name, type, description, connection_string,
        host, port, database_name, username, config, last_connected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `,
    parameters: [
      projectId,
      name,
      type,
      description || null,
      connectionString, // Should be encrypted in production
      host || null,
      port || null,
      databaseName || null,
      username || null,
      config ? JSON.stringify(config) : '{}',
    ],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(201).json(data[0])
}
```

**File**: `/apps/studio/pages/api/platform/databases/[id]/index.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformDatabase } from 'lib/api/platform/database'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'PATCH':
      return handleUpdate(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query

  const { data, error } = await queryPlatformDatabase<PlatformDatabase>({
    query: 'SELECT * FROM platform.databases_with_projects WHERE id = $1',
    parameters: [id],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: { message: 'Database not found' } })
  }

  return res.status(200).json(data[0])
}

const handleUpdate = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query
  const updates = req.body

  // Build dynamic UPDATE query
  const fields = Object.keys(updates).filter(k => k !== 'id')
  if (fields.length === 0) {
    return res.status(400).json({ error: { message: 'No fields to update' } })
  }

  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
  const query = `
    UPDATE platform.databases
    SET ${setClause}, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `

  const { data, error } = await queryPlatformDatabase<PlatformDatabase>({
    query,
    parameters: [id, ...fields.map(f => updates[f])],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json(data[0])
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query

  const { error } = await queryPlatformDatabase({
    query: 'DELETE FROM platform.databases WHERE id = $1',
    parameters: [id],
  })

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(204).end()
}
```

### Redis-Specific Endpoints

**File**: `/apps/studio/pages/api/platform/redis/[databaseId]/keys/index.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformDatabase } from 'lib/api/platform/database'
import { RedisHelpers } from 'lib/api/platform/redis'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetKeys(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetKeys = async (req: NextApiRequest, res: NextApiResponse) => {
  const { databaseId } = req.query
  const { pattern = '*' } = req.query

  // Get database connection string
  const { data: databases } = await queryPlatformDatabase<PlatformDatabase>({
    query: 'SELECT * FROM platform.databases WHERE id = $1 AND type = $2',
    parameters: [databaseId, 'redis'],
  })

  if (!databases || databases.length === 0) {
    return res.status(404).json({ error: { message: 'Redis database not found' } })
  }

  const database = databases[0]

  // Get keys
  const { data, error } = await RedisHelpers.getKeys(
    pattern as string,
    database.connection_string
  )

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}
```

### MongoDB-Specific Endpoints

**File**: `/apps/studio/pages/api/platform/mongodb/[databaseId]/collections/index.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'
import { queryPlatformDatabase, PlatformDatabase } from 'lib/api/platform/database'
import { MongoHelpers } from 'lib/api/platform/mongodb'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetCollections(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetCollections = async (req: NextApiRequest, res: NextApiResponse) => {
  const { databaseId } = req.query
  const { databaseName } = req.query

  // Get database connection string
  const { data: databases } = await queryPlatformDatabase<PlatformDatabase>({
    query: 'SELECT * FROM platform.databases WHERE id = $1 AND type = $2',
    parameters: [databaseId, 'mongodb'],
  })

  if (!databases || databases.length === 0) {
    return res.status(404).json({ error: { message: 'MongoDB database not found' } })
  }

  const database = databases[0]

  // List collections
  const { data, error } = await MongoHelpers.listCollections(
    databaseName as string || database.database_name || 'admin',
    database.connection_string
  )

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  return res.status(200).json(data)
}
```

---

## Client Library Recommendations

### PostgreSQL
**Current**: pg-meta HTTP service (keep as-is)
**Reason**: Already integrated, provides REST API abstraction

### Redis
**Recommended**: `ioredis@5.x`
```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

**Why ioredis**:
- Industry standard (used by Vercel, Cloudflare, etc.)
- Full TypeScript support
- Built-in connection pooling
- Cluster support
- Promise-based API
- Excellent error handling
- Active maintenance

**Alternatives considered**:
- `redis@4.x` (official client) - Less features than ioredis
- `node-redis` - Deprecated in favor of `redis`

### MongoDB
**Recommended**: `mongodb@6.x` (official driver)
```bash
npm install mongodb
npm install --save-dev @types/mongodb
```

**Why official driver**:
- Direct from MongoDB team
- Best compatibility with MongoDB features
- Built-in connection pooling
- TypeScript support
- Handles replica sets and sharding
- Well-documented

**Alternatives considered**:
- `mongoose` - Too heavy, ORM overhead not needed for Studio
- `monk` - Less actively maintained

### Bun API
**Recommended**: Native `fetch` API (already in Node.js 18+)

**Why native fetch**:
- No additional dependencies
- HTTP/2 support
- Promise-based
- Standard Web API

---

## Environment Configuration

### Required Environment Variables

**File**: `/apps/studio/.env.production` (additions)

```bash
# ============================================
# Multi-Database Configuration
# ============================================

# Redis Connection
REDIS_URL=redis://default:password@redis.railway.internal:6379
REDIS_CRYPTO_KEY=your-redis-encryption-key-32-chars
REDIS_MAX_CONNECTIONS=10

# MongoDB Connection
MONGODB_URL=mongodb://username:password@mongodb.railway.internal:27017/database
MONGODB_CRYPTO_KEY=your-mongo-encryption-key-32-chars
MONGODB_MAX_POOL_SIZE=10

# Bun API Server
BUN_API_URL=https://bun-server-production.up.railway.app
BUN_API_KEY=your-bun-api-secret-key

# ============================================
# Feature Flags
# ============================================
ENABLE_REDIS_MANAGEMENT=true
ENABLE_MONGODB_MANAGEMENT=true
ENABLE_BUN_API_MANAGEMENT=true

# ============================================
# Connection Pool Limits
# ============================================
# Total max connections per database type
MAX_POSTGRES_CONNECTIONS=20
MAX_REDIS_CONNECTIONS=10
MAX_MONGODB_CONNECTIONS=10
```

### Railway Environment Setup Script

**File**: `/apps/studio/scripts/setup-multi-db-env.sh`

```bash
#!/bin/bash
# Setup multi-database environment variables in Railway

PROJECT_ID="your-railway-project-id"

echo "Setting up Redis environment variables..."
railway variables set REDIS_URL="redis://default:password@redis.railway.internal:6379" --project "$PROJECT_ID"
railway variables set REDIS_CRYPTO_KEY="$(openssl rand -hex 32)" --project "$PROJECT_ID"
railway variables set REDIS_MAX_CONNECTIONS="10" --project "$PROJECT_ID"

echo "Setting up MongoDB environment variables..."
railway variables set MONGODB_URL="mongodb://username:password@mongodb.railway.internal:27017/database" --project "$PROJECT_ID"
railway variables set MONGODB_CRYPTO_KEY="$(openssl rand -hex 32)" --project "$PROJECT_ID"
railway variables set MONGODB_MAX_POOL_SIZE="10" --project "$PROJECT_ID"

echo "Setting up Bun API environment variables..."
railway variables set BUN_API_URL="https://bun-server-production.up.railway.app" --project "$PROJECT_ID"
railway variables set BUN_API_KEY="$(openssl rand -hex 32)" --project "$PROJECT_ID"

echo "Enabling feature flags..."
railway variables set ENABLE_REDIS_MANAGEMENT="true" --project "$PROJECT_ID"
railway variables set ENABLE_MONGODB_MANAGEMENT="true" --project "$PROJECT_ID"
railway variables set ENABLE_BUN_API_MANAGEMENT="true" --project "$PROJECT_ID"

echo "Done! Redeploy your Studio service to apply changes."
```

---

## Security Considerations

### 1. Connection String Encryption

**Current Pattern (PostgreSQL)**: Encrypt with `crypto-js` AES before sending to pg-meta

**Apply to All Databases**:
```typescript
// Shared encryption key from environment
const ENCRYPTION_KEY = process.env.MULTI_DB_CRYPTO_KEY || process.env.PG_META_CRYPTO_KEY

// Encrypt all connection strings before storage
function encryptConnectionString(connStr: string): string {
  return crypto.AES.encrypt(connStr, ENCRYPTION_KEY).toString()
}

// Decrypt when needed
function decryptConnectionString(encrypted: string): string {
  const bytes = crypto.AES.decrypt(encrypted, ENCRYPTION_KEY)
  return bytes.toString(crypto.enc.Utf8)
}
```

### 2. Connection String Storage

**Options**:

**Option A**: Store in platform database (current pattern)
```sql
-- Store encrypted in platform.databases table
INSERT INTO platform.databases (connection_string, ...)
VALUES (encrypt_connection_string('redis://...'), ...)
```

**Option B**: Use environment variables only
```bash
# Reference by name, actual connection string in env
REDIS_PRIMARY=redis://...
MONGO_PRIMARY=mongodb://...
```

**Recommendation**: Option A with additional encryption layer
- Connection strings encrypted at application layer before DB storage
- Encryption key stored in environment variables only
- Never log decrypted connection strings

### 3. Role-Based Access Control (Future Enhancement)

```sql
-- Add to platform database schema
CREATE TABLE platform.database_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_id UUID REFERENCES platform.databases(id),
  user_id UUID, -- Future: reference to users table
  role TEXT CHECK (role IN ('admin', 'read', 'write')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Connection Limits & Rate Limiting

```typescript
// Per-database connection limits
const CONNECTION_LIMITS = {
  postgres: 20,
  redis: 10,
  mongodb: 10,
}

// Rate limiting for API calls
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
})
```

### 5. Network Security

**Railway Internal URLs (Recommended)**:
```bash
# Use .railway.internal for service-to-service communication
REDIS_URL=redis://redis.railway.internal:6379
MONGODB_URL=mongodb://mongodb.railway.internal:27017
```

**Benefits**:
- No exposure to public internet
- Faster (same network)
- No bandwidth charges
- Automatic SSL/TLS

### 6. Audit Logging

```sql
-- Track all database operations
CREATE TABLE platform.database_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_id UUID REFERENCES platform.databases(id),
  operation TEXT, -- 'read', 'write', 'delete', 'connect'
  user_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_database_id ON platform.database_audit_log(database_id);
CREATE INDEX idx_audit_log_created_at ON platform.database_audit_log(created_at DESC);
```

---

## Performance & Scaling

### 1. Connection Pooling Strategy

#### PostgreSQL (via pg-meta)
- Handled by pg-meta service
- Default pool size: Configured in pg-meta deployment
- No changes needed in Studio

#### Redis
```typescript
// ioredis connection pool config
const redisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  // Connection reuse
  lazyConnect: false,
}

// Pool management
const MAX_REDIS_CONNECTIONS = 10
const redisConnections = new Map<string, Redis>()

// Implement LRU eviction when pool is full
```

#### MongoDB
```typescript
// MongoDB native connection pool
const mongoOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  waitQueueTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
}
```

### 2. Caching Strategy

**Use Redis for caching**:
```typescript
// Cache database metadata
const CACHE_TTL = 60 // 1 minute

async function getCachedDatabaseList(projectRef: string) {
  const cacheKey = `db:list:${projectRef}`

  // Try Redis cache first
  const cached = await RedisHelpers.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // Fetch from platform database
  const { data } = await queryPlatformDatabase({
    query: 'SELECT * FROM platform.databases WHERE project_ref = $1',
    parameters: [projectRef],
  })

  // Store in cache
  await RedisHelpers.set(cacheKey, JSON.stringify(data))
  await RedisHelpers.expire(cacheKey, CACHE_TTL)

  return data
}
```

### 3. Query Optimization

**PostgreSQL Platform Database**:
```sql
-- Add indexes for common queries
CREATE INDEX idx_databases_project_type ON platform.databases(project_id, type);
CREATE INDEX idx_databases_status_active ON platform.databases(status) WHERE status = 'active';

-- Materialized view for dashboard stats
CREATE MATERIALIZED VIEW platform.database_stats AS
SELECT
  type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'active') AS active,
  COUNT(*) FILTER (WHERE last_connected_at > NOW() - INTERVAL '1 hour') AS recently_connected
FROM platform.databases
GROUP BY type;

-- Refresh periodically
CREATE INDEX ON platform.database_stats(type);
```

### 4. Monitoring & Observability

```typescript
// Track connection health
interface ConnectionHealth {
  databaseId: string
  type: DatabaseType
  status: 'healthy' | 'degraded' | 'down'
  latency: number
  lastCheck: Date
  errorCount: number
}

// Periodic health checks
async function checkDatabaseHealth(database: PlatformDatabase): Promise<ConnectionHealth> {
  const startTime = Date.now()

  try {
    const isHealthy = await ConnectionManager.testConnection(
      database.type as DatabaseType,
      database.connection_string
    )

    return {
      databaseId: database.id,
      type: database.type as DatabaseType,
      status: isHealthy ? 'healthy' : 'down',
      latency: Date.now() - startTime,
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
    }
  } catch (error) {
    return {
      databaseId: database.id,
      type: database.type as DatabaseType,
      status: 'down',
      latency: Date.now() - startTime,
      lastCheck: new Date(),
      errorCount: 1,
    }
  }
}
```

### 5. Scaling Considerations

**Horizontal Scaling**:
- Deploy multiple Studio instances behind load balancer
- Each instance maintains its own connection pools
- Use Redis for shared session storage

**Vertical Scaling**:
- Increase connection pool sizes
- More memory for Node.js (set via `NODE_OPTIONS=--max-old-space-size=4096`)

**Database Scaling**:
- PostgreSQL: Read replicas for platform database
- Redis: Cluster mode for high availability
- MongoDB: Replica sets for redundancy

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal**: Set up basic multi-database infrastructure

**Tasks**:
1. ✅ Install dependencies
   ```bash
   npm install ioredis mongodb
   npm install --save-dev @types/ioredis @types/mongodb
   ```

2. ✅ Create connection managers
   - `/lib/api/platform/redis.ts`
   - `/lib/api/platform/mongodb.ts`
   - `/lib/api/platform/connection-manager.ts`

3. ✅ Add platform database schema
   - Migration: `002_add_multi_database_support.sql`
   - Test migration locally
   - Deploy to Railway platform database

4. ✅ Update environment variables
   - Add to `.env.production`
   - Deploy to Railway
   - Deploy to Vercel

**Success Criteria**:
- Can connect to Redis from Studio
- Can connect to MongoDB from Studio
- Platform database has `databases` table
- Environment variables configured

### Phase 2: API Development (Week 3-4)

**Goal**: Build API routes for database management

**Tasks**:
1. ✅ Create base API routes
   - `/api/platform/databases` (CRUD)
   - `/api/platform/databases/[id]` (single database)
   - `/api/platform/databases/[id]/test` (connection test)

2. ✅ Create Redis-specific routes
   - `/api/platform/redis/[databaseId]/keys`
   - `/api/platform/redis/[databaseId]/get`
   - `/api/platform/redis/[databaseId]/set`
   - `/api/platform/redis/[databaseId]/info`

3. ✅ Create MongoDB-specific routes
   - `/api/platform/mongodb/[databaseId]/databases`
   - `/api/platform/mongodb/[databaseId]/collections`
   - `/api/platform/mongodb/[databaseId]/documents`
   - `/api/platform/mongodb/[databaseId]/stats`

4. ✅ Error handling & validation
   - Standardize error responses
   - Add input validation
   - Add connection timeouts

**Success Criteria**:
- All API routes functional
- Error handling works
- Can perform CRUD operations on databases

### Phase 3: Frontend Integration (Week 5-6)

**Goal**: Add UI for multi-database management

**Tasks**:
1. ⬜ Create database management pages
   - `/project/[ref]/databases` (list view)
   - `/project/[ref]/databases/new` (add database)
   - `/project/[ref]/databases/[id]` (database details)

2. ⬜ Create database-specific views
   - Redis browser (keys, values)
   - MongoDB explorer (collections, documents)
   - Connection status indicators

3. ⬜ Add React Query hooks
   - `useDatabases()` - List databases
   - `useDatabase(id)` - Get single database
   - `useCreateDatabase()` - Add database
   - `useRedisKeys()` - Browse Redis keys

4. ⬜ UI Components
   - Database type selector
   - Connection string input (with validation)
   - Connection test button
   - Status badges

**Success Criteria**:
- Can add databases via UI
- Can view database details
- Can browse Redis keys
- Can explore MongoDB collections

### Phase 4: Advanced Features (Week 7-8)

**Goal**: Add advanced functionality

**Tasks**:
1. ⬜ Connection pooling optimization
   - Implement LRU cache for connections
   - Add connection metrics
   - Auto-close idle connections

2. ⬜ Caching layer
   - Use Redis to cache database metadata
   - Cache query results (with TTL)
   - Implement cache invalidation

3. ⬜ Security enhancements
   - Encrypt connection strings at rest
   - Add role-based access control
   - Implement audit logging

4. ⬜ Monitoring & observability
   - Health check endpoint
   - Connection metrics dashboard
   - Error tracking

**Success Criteria**:
- Connection pools optimized
- Caching reduces database load
- Security audit passes
- Monitoring dashboard shows metrics

### Phase 5: Testing & Documentation (Week 9-10)

**Goal**: Ensure production readiness

**Tasks**:
1. ⬜ Integration tests
   - Test all database types
   - Test connection pooling
   - Test error handling

2. ⬜ Performance testing
   - Load test API endpoints
   - Test connection limits
   - Benchmark query performance

3. ⬜ Documentation
   - User guide for adding databases
   - API documentation
   - Architecture diagrams
   - Troubleshooting guide

4. ⬜ Deployment
   - Deploy to staging
   - Run smoke tests
   - Deploy to production
   - Monitor for issues

**Success Criteria**:
- All tests passing
- Performance meets benchmarks
- Documentation complete
- Successfully deployed to production

---

## Appendix

### A. Example Connection Strings

**PostgreSQL**:
```bash
# Railway Internal
postgresql://postgres:password@postgres.railway.internal:5432/database

# Railway Public
postgresql://postgres:password@roundhouse.proxy.rlwy.net:12345/database

# Supabase
postgresql://postgres:password@db.project.supabase.co:5432/postgres
```

**Redis**:
```bash
# Railway Internal
redis://default:password@redis.railway.internal:6379

# Railway Public
redis://default:password@redis-production.up.railway.app:6379

# Redis Cloud
redis://:password@redis-12345.rediscloud.com:12345

# Redis with TLS
rediss://:password@redis-12345.rediscloud.com:12345
```

**MongoDB**:
```bash
# Railway Internal
mongodb://username:password@mongodb.railway.internal:27017/database

# Railway Public
mongodb://username:password@mongodb-production.up.railway.app:27017/database

# MongoDB Atlas
mongodb+srv://username:password@cluster.mongodb.net/database

# Replica Set
mongodb://user:pass@host1:27017,host2:27017,host3:27017/db?replicaSet=rs0
```

### B. Sample Database Configurations

**Redis Configuration**:
```json
{
  "name": "redis-cache",
  "type": "redis",
  "description": "Primary cache instance",
  "config": {
    "maxmemory": "256mb",
    "maxmemory_policy": "allkeys-lru",
    "databases": 16
  }
}
```

**MongoDB Configuration**:
```json
{
  "name": "mongo-primary",
  "type": "mongodb",
  "description": "Primary document store",
  "config": {
    "authSource": "admin",
    "retryWrites": true,
    "w": "majority",
    "readPreference": "primaryPreferred"
  }
}
```

### C. Performance Benchmarks (Target)

| Operation | Target Latency | Max Throughput |
|-----------|----------------|----------------|
| List databases | < 50ms | 1000 req/s |
| Get database | < 30ms | 2000 req/s |
| Redis GET | < 10ms | 5000 req/s |
| Redis SET | < 15ms | 3000 req/s |
| MongoDB find (simple) | < 50ms | 1000 req/s |
| MongoDB aggregate | < 200ms | 200 req/s |
| Connection test | < 500ms | 100 req/s |

### D. Error Handling Patterns

```typescript
// Standardized error response
interface DatabaseError {
  code: string
  message: string
  details?: any
  retryable: boolean
}

// Error codes
const ERROR_CODES = {
  CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  TIMEOUT: 'DB_TIMEOUT',
  INVALID_CREDENTIALS: 'DB_INVALID_CREDENTIALS',
  NOT_FOUND: 'DB_NOT_FOUND',
  QUERY_ERROR: 'DB_QUERY_ERROR',
}

// Error handler
function handleDatabaseError(error: Error, type: DatabaseType): DatabaseError {
  // Determine error type and retryability
  if (error.message.includes('ECONNREFUSED')) {
    return {
      code: ERROR_CODES.CONNECTION_FAILED,
      message: 'Unable to connect to database. Please check host and port.',
      details: error.message,
      retryable: true,
    }
  }

  if (error.message.includes('auth')) {
    return {
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: 'Authentication failed. Please check username and password.',
      details: error.message,
      retryable: false,
    }
  }

  // Default error
  return {
    code: ERROR_CODES.QUERY_ERROR,
    message: `Database operation failed: ${error.message}`,
    details: error,
    retryable: false,
  }
}
```

---

## Conclusion

This architecture provides a scalable, secure, and maintainable approach to managing multiple database types through Supabase Studio. Key benefits:

1. **Unified Interface**: Manage all databases from one UI
2. **Secure**: Encrypted connections, role-based access
3. **Performant**: Connection pooling, caching, optimized queries
4. **Extensible**: Easy to add new database types
5. **Railway Native**: Optimized for Railway's internal networking

Next steps: Begin Phase 1 implementation by installing dependencies and creating connection managers.
