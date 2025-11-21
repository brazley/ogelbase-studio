# Railway Infrastructure Architecture: Production-Ready Multi-Database Platform
**Infrastructure Architect**: Nikolai Volkov
**Date**: November 20, 2025
**Status**: Design & Implementation Roadmap
**Environment**: Railway.app Platform

---

## Executive Summary

This document provides a **production-ready infrastructure architecture** for deploying Redis, MongoDB, and Bun server alongside the existing PostgreSQL and Supabase services on Railway. The architecture emphasizes:

- **Service Discovery**: Railway's internal networking for zero-latency service communication
- **Security**: End-to-end encryption, connection pooling, and access controls
- **Reliability**: Health checks, auto-healing, circuit breakers, and disaster recovery
- **Performance**: Connection pooling, caching strategies, and query optimization
- **Operational Excellence**: Monitoring, logging, alerting, and deployment automation

---

## Table of Contents

1. [Current Infrastructure State](#current-infrastructure-state)
2. [Proposed Multi-Database Architecture](#proposed-multi-database-architecture)
3. [Railway Service Configuration](#railway-service-configuration)
4. [Network Topology & Service Discovery](#network-topology--service-discovery)
5. [Environment Variable Strategy](#environment-variable-strategy)
6. [Security Architecture](#security-architecture)
7. [Connection Management & Pooling](#connection-management--pooling)
8. [Monitoring & Observability](#monitoring--observability)
9. [Disaster Recovery & Backups](#disaster-recovery--backups)
10. [Deployment Runbook](#deployment-runbook)
11. [Cost Optimization](#cost-optimization)
12. [Appendix: Connection Strings & Examples](#appendix-connection-strings--examples)

---

## Current Infrastructure State

### Existing Railway Services

Based on environment analysis (`/apps/studio/.env.local`):

```
┌─────────────────────────────────────────────────────────────┐
│                  Railway Project: OgelBase                   │
│                  Environment: production                      │
└─────────────────────────────────────────────────────────────┘

Current Services:
┌──────────────────┬────────────────────────────────────────────┐
│ Service          │ Internal URL                               │
├──────────────────┼────────────────────────────────────────────┤
│ PostgreSQL       │ postgres.railway.internal:5432             │
│ Kong (Gateway)   │ kong-production-80c6.up.railway.app        │
│ Postgres Meta    │ postgres-meta-production-6c48...railway.app│
│ Studio (Vercel)  │ ogelbase-studio.vercel.app                 │
└──────────────────┴────────────────────────────────────────────┘

Database: postgres
└── Schema: platform
    ├── organizations (multi-tenant isolation)
    ├── projects (database connections)
    ├── credentials (JWT secrets)
    └── organization_members (access control)
```

### Current Connection Pattern

```typescript
// Existing PostgreSQL Connection Flow (Keep As-Is)
Studio Frontend → API Route → Platform DB Helper → pg-meta Service → PostgreSQL

Encryption: AES-256 (crypto-js)
Key Storage: PG_META_CRYPTO_KEY env variable
Connection: Encrypted string in HTTP header
```

**Key Insight**: Studio **does not use direct database clients**. It proxies all PostgreSQL operations through the `pg-meta` HTTP service. This pattern should be **replicated for Redis and MongoDB** for consistency.

---

## Proposed Multi-Database Architecture

### High-Level Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        Railway Private Network                             │
│                     (*.railway.internal domain)                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    Supabase Studio (Vercel)                          │  │
│  │                    https://ogelbase-studio.vercel.app                │  │
│  │                                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │  │
│  │  │  Postgres   │  │   Redis     │  │  MongoDB    │  │  Bun API  │  │  │
│  │  │  Manager    │  │  Manager    │  │  Manager    │  │  Client   │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │  │
│  └─────────┼────────────────┼────────────────┼────────────────┼────────┘  │
│            │                │                │                │            │
│            │  HTTPS over Railway Internal Network             │            │
│            ▼                ▼                ▼                ▼            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     API Gateway (Kong)                               │  │
│  │            kong-production-80c6.up.railway.app                       │  │
│  │  - Request routing                                                   │  │
│  │  - Rate limiting                                                     │  │
│  │  - Authentication                                                    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│            │                │                │                │            │
│            ▼                ▼                ▼                ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ pg-meta      │  │ Redis        │  │ MongoDB      │  │ Bun Server   │  │
│  │ Service      │  │ Instance     │  │ Instance     │  │ Runtime      │  │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤  │
│  │ Port: 8080   │  │ Port: 6379   │  │ Port: 27017  │  │ Port: 3001   │  │
│  │ Health: /    │  │ Health: PING │  │ Health: ping │  │ Health: /    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │                 │            │
│         ▼                 ▼                 ▼                 ▼            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │              PostgreSQL (Platform Database)                          │  │
│  │              postgres.railway.internal:5432                          │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Schema: platform                                                │  │  │
│  │  │ - organizations (multi-tenant)                                  │  │  │
│  │  │ - projects (project metadata)                                   │  │  │
│  │  │ - credentials (JWT secrets)                                     │  │  │
│  │  │ - databases ★ NEW (multi-DB connections)                        │  │  │
│  │  │ - organization_members (access control)                         │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└───────────────────────────────────────────────────────────────────────────┘
```

### Service Architecture Matrix

| Service | Purpose | Protocol | Internal URL | External URL | Health Check |
|---------|---------|----------|--------------|--------------|--------------|
| **PostgreSQL** | Platform DB | TCP | `postgres.railway.internal:5432` | Public proxy | `SELECT 1` |
| **pg-meta** | PostgreSQL HTTP API | HTTP | `postgres-meta.railway.internal:8080` | Public | `GET /` |
| **Redis** | Cache, Sessions | TCP | `redis.railway.internal:6379` | Public proxy | `PING` |
| **MongoDB** | Document Store | TCP | `mongodb.railway.internal:27017` | Public proxy | `db.admin().ping()` |
| **Bun Server** | Custom API | HTTP | `bun-api.railway.internal:3001` | Public | `GET /health` |
| **Kong Gateway** | API Gateway | HTTP | `kong.railway.internal:8000` | Public | `GET /` |

---

## Railway Service Configuration

### 1. Redis Service Setup

**File**: Railway Dashboard → New Service → Redis

```yaml
# Service Configuration (Railway Dashboard)
Service Name: redis-primary
Type: Redis
Version: 7.2-alpine
Memory: 512 MB (adjustable)
CPU: Shared

# Environment Variables (Railway Variables Tab)
REDIS_PASSWORD: ${RAILWAY_GENERATED_PASSWORD}
REDIS_MAXMEMORY: 256mb
REDIS_MAXMEMORY_POLICY: allkeys-lru
REDIS_APPENDONLY: yes
REDIS_APPENDFSYNC: everysec

# Networking
Internal URL: redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379
Public URL: redis://default:${REDIS_PASSWORD}@redis-production-xyz.up.railway.app:6379
```

**Redis Configuration** (`redis.conf` via Railway Config Files):

```conf
# Memory Management
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Security
requirepass ${REDIS_PASSWORD}
protected-mode yes

# Performance
tcp-backlog 511
timeout 300
tcp-keepalive 300
```

**Deployment Command** (Railway Service Settings):

```bash
# Start Command
redis-server /etc/redis/redis.conf

# Health Check
CMD redis-cli --raw incr ping
```

### 2. MongoDB Service Setup

**File**: Railway Dashboard → New Service → MongoDB

```yaml
# Service Configuration
Service Name: mongodb-primary
Type: MongoDB
Version: 7.0
Memory: 1 GB (minimum recommended)
CPU: Shared

# Environment Variables
MONGO_INITDB_ROOT_USERNAME: admin
MONGO_INITDB_ROOT_PASSWORD: ${RAILWAY_GENERATED_PASSWORD}
MONGO_INITDB_DATABASE: ogelbase

# Networking
Internal URL: mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase?authSource=admin
Public URL: mongodb://admin:${MONGO_PASSWORD}@mongodb-production-xyz.up.railway.app:27017/ogelbase
```

**MongoDB Configuration** (`mongod.conf`):

```yaml
# mongod.conf
storage:
  dbPath: /data/db
  journal:
    enabled: true

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 0.0.0.0

security:
  authorization: enabled

replication:
  replSetName: rs0  # For future replica set support

processManagement:
  timeZoneInfo: /usr/share/zoneinfo
```

**Deployment Command**:

```bash
# Init Replica Set (one-time setup)
mongosh --eval "rs.initiate()"

# Start MongoDB
mongod --config /etc/mongod.conf
```

### 3. Bun Server Setup

**File**: Railway Dashboard → New Service → Bun

```yaml
# Service Configuration
Service Name: bun-api
Type: Bun
Version: 1.0+
Memory: 256 MB
CPU: Shared

# Build Configuration
Build Command: bun install
Start Command: bun run src/index.ts

# Environment Variables
PORT: 3001
NODE_ENV: production
DATABASE_URL: ${PLATFORM_DB_URL}
REDIS_URL: redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379
MONGODB_URL: mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase

# Networking
Internal URL: http://bun-api.railway.internal:3001
Public URL: https://bun-api-production-xyz.up.railway.app
```

**Sample Bun Server** (`src/index.ts`):

```typescript
import { serve } from 'bun'

serve({
  port: process.env.PORT || 3001,

  async fetch(req) {
    const url = new URL(req.url)

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // API endpoints
    if (url.pathname.startsWith('/api/')) {
      // Your custom API logic here
      return new Response('API endpoint')
    }

    return new Response('Not Found', { status: 404 })
  }
})

console.log(`Bun server running on port ${process.env.PORT}`)
```

**Dockerfile** (if using custom build):

```dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Copy source
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Run
EXPOSE 3001
ENTRYPOINT ["bun", "run", "src/index.ts"]
```

---

## Network Topology & Service Discovery

### Railway Internal Networking

Railway provides **private networking** between services via `.railway.internal` domains:

```
Benefits:
✅ Zero-latency (same datacenter)
✅ No bandwidth charges (internal traffic is free)
✅ Automatic SSL/TLS encryption
✅ No public exposure (security)
✅ Service discovery (DNS-based)
```

### Connection String Format

#### PostgreSQL (Existing)

```bash
# Internal (Service-to-Service) - PREFERRED
DATABASE_URL=postgresql://postgres:${PG_PASSWORD}@postgres.railway.internal:5432/postgres

# External (Client Access)
DATABASE_URL=postgresql://postgres:${PG_PASSWORD}@roundhouse.proxy.rlwy.net:12345/postgres
```

#### Redis (New)

```bash
# Internal - PREFERRED for Studio API routes
REDIS_URL=redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379

# External (for debugging)
REDIS_URL=redis://default:${REDIS_PASSWORD}@redis-production-abc123.up.railway.app:6379

# With TLS (if using external)
REDIS_TLS_URL=rediss://default:${REDIS_PASSWORD}@redis-production-abc123.up.railway.app:6380
```

#### MongoDB (New)

```bash
# Internal - PREFERRED
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase?authSource=admin

# External
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb-production-xyz.up.railway.app:27017/ogelbase

# With Replica Set (future)
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongo1.railway.internal:27017,mongo2.railway.internal:27017,mongo3.railway.internal:27017/ogelbase?replicaSet=rs0
```

#### Bun Server (New)

```bash
# Internal - PREFERRED
BUN_API_URL=http://bun-api.railway.internal:3001

# External (HTTPS)
BUN_API_URL=https://bun-api-production-xyz.up.railway.app
```

### Service Discovery Pattern

Railway uses **DNS-based service discovery**:

```bash
# Pattern: <service-name>.railway.internal
ping postgres.railway.internal   # Resolves to PostgreSQL service
ping redis.railway.internal      # Resolves to Redis service
ping mongodb.railway.internal    # Resolves to MongoDB service
```

**Implementation in Studio**:

```typescript
// lib/api/platform/service-discovery.ts
export const RAILWAY_SERVICES = {
  POSTGRES: {
    internal: 'postgres.railway.internal:5432',
    external: process.env.POSTGRES_EXTERNAL_URL || '',
  },
  REDIS: {
    internal: 'redis.railway.internal:6379',
    external: process.env.REDIS_EXTERNAL_URL || '',
  },
  MONGODB: {
    internal: 'mongodb.railway.internal:27017',
    external: process.env.MONGODB_EXTERNAL_URL || '',
  },
  BUN_API: {
    internal: 'bun-api.railway.internal:3001',
    external: process.env.BUN_API_EXTERNAL_URL || '',
  },
  PG_META: {
    internal: 'postgres-meta.railway.internal:8080',
    external: process.env.STUDIO_PG_META_URL || '',
  },
}

/**
 * Determine which URL to use based on environment
 */
export function getServiceUrl(service: keyof typeof RAILWAY_SERVICES): string {
  const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production'

  if (isRailway) {
    return RAILWAY_SERVICES[service].internal
  }

  return RAILWAY_SERVICES[service].external
}
```

---

## Environment Variable Strategy

### Unified Environment Configuration

**File**: `/apps/studio/.env.production` (for Railway deployment)

```bash
# ============================================
# Railway Infrastructure Configuration
# Generated: 2025-11-20
# ============================================

# ============================================
# Core Platform (Existing)
# ============================================
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres
PG_META_CRYPTO_KEY=${ENCRYPTION_KEY}
STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080

# ============================================
# Multi-Database Support (NEW)
# ============================================

# Redis Configuration
REDIS_URL=redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379
REDIS_CRYPTO_KEY=${ENCRYPTION_KEY}
REDIS_MAX_CONNECTIONS=10
REDIS_COMMAND_TIMEOUT=5000
REDIS_CONNECT_TIMEOUT=10000
ENABLE_REDIS_MANAGEMENT=true

# MongoDB Configuration
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase?authSource=admin
MONGODB_CRYPTO_KEY=${ENCRYPTION_KEY}
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=2
MONGODB_CONNECT_TIMEOUT=10000
MONGODB_SOCKET_TIMEOUT=45000
ENABLE_MONGODB_MANAGEMENT=true

# Bun API Server
BUN_API_URL=http://bun-api.railway.internal:3001
BUN_API_KEY=${BUN_API_SECRET}
BUN_API_TIMEOUT=30000
ENABLE_BUN_API_MANAGEMENT=true

# ============================================
# Security & Encryption
# ============================================
ENCRYPTION_KEY=${RAILWAY_GENERATED_ENCRYPTION_KEY}  # 64-char hex string
MULTI_DB_CRYPTO_KEY=${ENCRYPTION_KEY}  # Shared encryption key

# ============================================
# Connection Pool Limits
# ============================================
MAX_TOTAL_CONNECTIONS=40  # Across all database types
MAX_POSTGRES_CONNECTIONS=20
MAX_REDIS_CONNECTIONS=10
MAX_MONGODB_CONNECTIONS=10

# ============================================
# Railway-Specific
# ============================================
RAILWAY_ENVIRONMENT=production
RAILWAY_PROJECT_ID=e0b212f2-b913-4ea6-8b0d-6f54a081db5f
RAILWAY_SERVICE_NAME=studio

# ============================================
# Monitoring & Observability
# ============================================
ENABLE_HEALTH_CHECKS=true
HEALTH_CHECK_INTERVAL=60000  # 60 seconds
ENABLE_CONNECTION_METRICS=true
ENABLE_QUERY_LOGGING=false  # Set to true for debugging

# ============================================
# Frontend (Existing - Keep)
# ============================================
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
```

### Environment Variable Deployment Script

**File**: `/apps/studio/scripts/deploy-railway-env.sh`

```bash
#!/bin/bash
# Deploy environment variables to Railway
# Usage: ./deploy-railway-env.sh

set -e

RAILWAY_PROJECT_ID="e0b212f2-b913-4ea6-8b0d-6f54a081db5f"
RAILWAY_SERVICE="studio"

echo "🚂 Deploying Railway Environment Variables"
echo "============================================"

# Generate encryption keys
ENCRYPTION_KEY=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 16)
MONGO_PASSWORD=$(openssl rand -hex 16)
BUN_API_SECRET=$(openssl rand -hex 32)

echo "📝 Setting database connection URLs..."

# Redis
railway variables set \
  REDIS_URL="redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379" \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE"

railway variables set \
  REDIS_CRYPTO_KEY="$ENCRYPTION_KEY" \
  REDIS_MAX_CONNECTIONS="10" \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE"

# MongoDB
railway variables set \
  MONGODB_URL="mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase?authSource=admin" \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE"

railway variables set \
  MONGODB_CRYPTO_KEY="$ENCRYPTION_KEY" \
  MONGODB_MAX_POOL_SIZE="10" \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE"

# Bun API
railway variables set \
  BUN_API_URL="http://bun-api.railway.internal:3001" \
  BUN_API_KEY="$BUN_API_SECRET" \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE"

# Feature Flags
railway variables set \
  ENABLE_REDIS_MANAGEMENT="true" \
  ENABLE_MONGODB_MANAGEMENT="true" \
  ENABLE_BUN_API_MANAGEMENT="true" \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE"

echo "✅ Environment variables deployed!"
echo ""
echo "🔑 Save these credentials securely:"
echo "REDIS_PASSWORD=$REDIS_PASSWORD"
echo "MONGO_PASSWORD=$MONGO_PASSWORD"
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "BUN_API_SECRET=$BUN_API_SECRET"
```

---

## Security Architecture

### 1. Connection String Encryption

All connection strings are encrypted **at rest** and **in transit**:

```typescript
// lib/api/platform/encryption.ts
import crypto from 'crypto-js'

const ENCRYPTION_KEY = process.env.MULTI_DB_CRYPTO_KEY ||
                       process.env.PG_META_CRYPTO_KEY ||
                       ''

/**
 * Encrypt a connection string for storage or transmission
 */
export function encryptConnectionString(plaintext: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY not configured')
  }

  return crypto.AES.encrypt(plaintext, ENCRYPTION_KEY).toString()
}

/**
 * Decrypt a connection string
 */
export function decryptConnectionString(encrypted: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY not configured')
  }

  const bytes = crypto.AES.decrypt(encrypted, ENCRYPTION_KEY)
  return bytes.toString(crypto.enc.Utf8)
}

/**
 * Validate encryption key strength
 */
export function validateEncryptionKey(): boolean {
  if (!ENCRYPTION_KEY) return false

  // Require at least 32 characters (128-bit equivalent)
  if (ENCRYPTION_KEY.length < 32) {
    console.warn('⚠️  ENCRYPTION_KEY is too short (< 32 chars). Security risk!')
    return false
  }

  return true
}
```

### 2. Network Security & Firewall Rules

**Railway Network Security Matrix**:

| Service | Internal Access | External Access | Encryption |
|---------|----------------|-----------------|------------|
| PostgreSQL | All services | Public proxy (optional) | TLS 1.3 |
| Redis | All services | Blocked (internal only) | TLS 1.3 |
| MongoDB | All services | Blocked (internal only) | TLS 1.3 |
| Bun API | All services | HTTPS only | TLS 1.3 |
| pg-meta | All services | HTTPS only | TLS 1.3 |

**Railway Firewall Configuration** (via Railway Dashboard):

```yaml
# Redis Service → Networking Tab
Private Networking: Enabled
Public Networking: Disabled  # ⚠️ Do NOT expose Redis publicly

# MongoDB Service → Networking Tab
Private Networking: Enabled
Public Networking: Disabled  # ⚠️ Do NOT expose MongoDB publicly

# Bun API → Networking Tab
Private Networking: Enabled
Public Networking: Enabled (HTTPS only)
Custom Domain: api.ogelbase.com (optional)
```

### 3. Authentication & Authorization

**Connection Authentication**:

```typescript
// lib/api/platform/auth-middleware.ts
import { NextApiRequest, NextApiResponse } from 'next'

/**
 * Verify request has valid JWT token (existing auth)
 */
export async function requireAuth(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' })
    return false
  }

  // Verify JWT (using existing JWT validation logic)
  // ...existing code...

  return true
}

/**
 * Verify user has access to specific database
 */
export async function requireDatabaseAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  databaseId: string
): Promise<boolean> {
  // Check if user's organization owns this database
  // Query: platform.databases JOIN platform.projects JOIN platform.organization_members

  // ...implementation...

  return true
}
```

### 4. Secrets Management

**Railway Secrets** (never commit to code):

```bash
# Store in Railway Variables (encrypted at rest)
POSTGRES_PASSWORD=<railway-generated>
REDIS_PASSWORD=<railway-generated>
MONGO_PASSWORD=<railway-generated>
ENCRYPTION_KEY=<railway-generated>
BUN_API_KEY=<railway-generated>

# Secrets are automatically injected as environment variables
# Never log or expose these values
```

**Secret Rotation Policy**:

```bash
# Rotate every 90 days
# 1. Generate new secret: openssl rand -hex 32
# 2. Update Railway variable
# 3. Redeploy service
# 4. Update dependent services
# 5. Verify connectivity
```

---

## Connection Management & Pooling

### PostgreSQL (Existing - via pg-meta)

Connection pooling is handled by the `pg-meta` service. No changes needed.

### Redis Connection Pool

**File**: `/apps/studio/lib/api/platform/redis.ts` (updated from MULTI_DATABASE_ARCHITECTURE.md)

```typescript
import Redis, { RedisOptions } from 'ioredis'
import { encryptConnectionString, decryptConnectionString } from './encryption'

const REDIS_URL = process.env.REDIS_URL || ''
const MAX_CONNECTIONS = parseInt(process.env.REDIS_MAX_CONNECTIONS || '10')
const CONNECT_TIMEOUT = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000')
const COMMAND_TIMEOUT = parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000')

// Connection pool (singleton)
const redisConnections = new Map<string, Redis>()

/**
 * Get or create Redis connection with pooling
 */
export function getRedisConnection(connectionString?: string): Redis {
  const connStr = connectionString || REDIS_URL

  if (!connStr) {
    throw new Error('Redis connection string not configured')
  }

  // Return existing connection if available
  if (redisConnections.has(connStr)) {
    return redisConnections.get(connStr)!
  }

  // Create new connection with production-ready config
  const options: RedisOptions = {
    // Retry logic
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000)
      return delay
    },

    // Reconnection logic
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET']
      if (targetErrors.some(e => err.message.includes(e))) {
        return true
      }
      return false
    },

    // Connection pooling
    enableReadyCheck: true,
    lazyConnect: false,
    enableOfflineQueue: true,

    // Timeouts
    connectTimeout: CONNECT_TIMEOUT,
    commandTimeout: COMMAND_TIMEOUT,

    // Keep-alive
    keepAlive: 30000,
  }

  const client = new Redis(connStr, options)

  // Event handlers
  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message)
    // Optionally send to monitoring service (Sentry, etc.)
  })

  client.on('connect', () => {
    console.log('[Redis] Connected successfully')
  })

  client.on('ready', () => {
    console.log('[Redis] Ready to accept commands')
  })

  client.on('close', () => {
    console.warn('[Redis] Connection closed')
    redisConnections.delete(connStr)
  })

  // Add to pool if under limit
  if (redisConnections.size < MAX_CONNECTIONS) {
    redisConnections.set(connStr, client)
  } else {
    console.warn('[Redis] Connection pool full, using ephemeral connection')
  }

  return client
}

/**
 * Health check for Redis connection
 */
export async function testRedisConnection(connectionString: string): Promise<boolean> {
  try {
    const client = new Redis(connectionString, {
      connectTimeout: 5000,
      lazyConnect: true,
    })

    await client.connect()
    const pong = await client.ping()
    await client.quit()

    return pong === 'PONG'
  } catch (error) {
    console.error('[Redis] Health check failed:', error)
    return false
  }
}

/**
 * Close all Redis connections gracefully
 */
export async function closeRedisConnections(): Promise<void> {
  const promises = Array.from(redisConnections.values()).map(client =>
    client.quit().catch(err => {
      console.error('[Redis] Error closing connection:', err)
    })
  )

  await Promise.all(promises)
  redisConnections.clear()
  console.log('[Redis] All connections closed')
}
```

### MongoDB Connection Pool

**File**: `/apps/studio/lib/api/platform/mongodb.ts`

```typescript
import { MongoClient, MongoClientOptions, Db } from 'mongodb'
import { encryptConnectionString, decryptConnectionString } from './encryption'

const MONGODB_URL = process.env.MONGODB_URL || ''
const MAX_POOL_SIZE = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10')
const MIN_POOL_SIZE = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2')
const CONNECT_TIMEOUT = parseInt(process.env.MONGODB_CONNECT_TIMEOUT || '10000')
const SOCKET_TIMEOUT = parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '45000')

// Connection pool
const mongoClients = new Map<string, MongoClient>()

/**
 * Get or create MongoDB client with connection pooling
 */
export async function getMongoClient(connectionString?: string): Promise<MongoClient> {
  const connStr = connectionString || MONGODB_URL

  if (!connStr) {
    throw new Error('MongoDB connection string not configured')
  }

  // Check if existing connection is still alive
  if (mongoClients.has(connStr)) {
    const client = mongoClients.get(connStr)!
    try {
      await client.db('admin').command({ ping: 1 })
      return client
    } catch (err) {
      console.warn('[MongoDB] Existing connection dead, reconnecting...')
      mongoClients.delete(connStr)
    }
  }

  // Create new client with production-ready config
  const options: MongoClientOptions = {
    // Connection pooling
    maxPoolSize: MAX_POOL_SIZE,
    minPoolSize: MIN_POOL_SIZE,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 10000,

    // Timeouts
    connectTimeoutMS: CONNECT_TIMEOUT,
    socketTimeoutMS: SOCKET_TIMEOUT,
    serverSelectionTimeoutMS: 10000,

    // Retry logic
    retryWrites: true,
    retryReads: true,

    // Monitoring
    monitorCommands: process.env.NODE_ENV === 'development',

    // Compression
    compressors: ['snappy', 'zlib'],
  }

  const client = new MongoClient(connStr, options)

  // Connect
  await client.connect()
  console.log('[MongoDB] Connected successfully')

  // Store in pool
  if (mongoClients.size < MAX_POOL_SIZE) {
    mongoClients.set(connStr, client)
  }

  return client
}

/**
 * Health check for MongoDB connection
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
    console.error('[MongoDB] Health check failed:', error)
    return false
  }
}

/**
 * Close all MongoDB connections gracefully
 */
export async function closeMongoConnections(): Promise<void> {
  const promises = Array.from(mongoClients.values()).map(client =>
    client.close().catch(err => {
      console.error('[MongoDB] Error closing connection:', err)
    })
  )

  await Promise.all(promises)
  mongoClients.clear()
  console.log('[MongoDB] All connections closed')
}
```

### Circuit Breaker Pattern

Prevent cascading failures when a database is down:

```typescript
// lib/api/platform/circuit-breaker.ts
interface CircuitBreakerState {
  failures: number
  lastFailure: number
  state: 'closed' | 'open' | 'half-open'
}

const breakers = new Map<string, CircuitBreakerState>()

const FAILURE_THRESHOLD = 5
const RESET_TIMEOUT = 60000 // 1 minute

/**
 * Check if circuit breaker allows request
 */
export function checkCircuitBreaker(service: string): boolean {
  const breaker = breakers.get(service)

  if (!breaker) {
    breakers.set(service, { failures: 0, lastFailure: 0, state: 'closed' })
    return true
  }

  // If circuit is open, check if timeout has passed
  if (breaker.state === 'open') {
    if (Date.now() - breaker.lastFailure > RESET_TIMEOUT) {
      breaker.state = 'half-open'
      return true
    }
    return false
  }

  return true
}

/**
 * Record a failure
 */
export function recordFailure(service: string): void {
  const breaker = breakers.get(service) || { failures: 0, lastFailure: 0, state: 'closed' }

  breaker.failures++
  breaker.lastFailure = Date.now()

  if (breaker.failures >= FAILURE_THRESHOLD) {
    breaker.state = 'open'
    console.error(`[CircuitBreaker] ${service} circuit opened after ${breaker.failures} failures`)
  }

  breakers.set(service, breaker)
}

/**
 * Record a success
 */
export function recordSuccess(service: string): void {
  const breaker = breakers.get(service)

  if (breaker && breaker.state === 'half-open') {
    breaker.state = 'closed'
    breaker.failures = 0
    console.log(`[CircuitBreaker] ${service} circuit closed`)
  }
}
```

---

## Monitoring & Observability

### Health Check Endpoints

**File**: `/apps/studio/pages/api/platform/health.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { testRedisConnection } from 'lib/api/platform/redis'
import { testMongoConnection } from 'lib/api/platform/mongodb'
import { queryPlatformDatabase } from 'lib/api/platform/database'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {} as Record<string, any>,
  }

  // PostgreSQL check
  try {
    const start = Date.now()
    const { error } = await queryPlatformDatabase({
      query: 'SELECT 1',
      parameters: [],
    })
    checks.services.postgres = {
      status: error ? 'unhealthy' : 'healthy',
      latency: Date.now() - start,
      error: error?.message,
    }
  } catch (err: any) {
    checks.services.postgres = { status: 'unhealthy', error: err.message }
  }

  // Redis check
  if (process.env.REDIS_URL) {
    try {
      const start = Date.now()
      const isHealthy = await testRedisConnection(process.env.REDIS_URL)
      checks.services.redis = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency: Date.now() - start,
      }
    } catch (err: any) {
      checks.services.redis = { status: 'unhealthy', error: err.message }
    }
  }

  // MongoDB check
  if (process.env.MONGODB_URL) {
    try {
      const start = Date.now()
      const isHealthy = await testMongoConnection(process.env.MONGODB_URL)
      checks.services.mongodb = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency: Date.now() - start,
      }
    } catch (err: any) {
      checks.services.mongodb = { status: 'unhealthy', error: err.message }
    }
  }

  // Bun API check
  if (process.env.BUN_API_URL) {
    try {
      const start = Date.now()
      const response = await fetch(`${process.env.BUN_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      checks.services.bun_api = {
        status: response.ok ? 'healthy' : 'unhealthy',
        latency: Date.now() - start,
      }
    } catch (err: any) {
      checks.services.bun_api = { status: 'unhealthy', error: err.message }
    }
  }

  // Determine overall status
  const unhealthyServices = Object.values(checks.services).filter(s => s.status === 'unhealthy')
  if (unhealthyServices.length > 0) {
    checks.status = 'degraded'
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503
  res.status(statusCode).json(checks)
}
```

### Connection Metrics Dashboard

**File**: `/apps/studio/pages/api/platform/metrics.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'

// Track connection pool metrics
export const connectionMetrics = {
  postgres: { active: 0, idle: 0, waiting: 0 },
  redis: { active: 0, idle: 0, waiting: 0 },
  mongodb: { active: 0, idle: 0, waiting: 0 },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: connectionMetrics,
  }

  res.status(200).json(metrics)
}
```

### Logging Strategy

**Structured Logging** (compatible with Railway Logs):

```typescript
// lib/api/platform/logger.ts
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export function log(level: LogLevel, service: string, message: string, metadata?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...metadata,
  }

  // Railway automatically captures stdout/stderr
  console.log(JSON.stringify(logEntry))
}

// Usage examples
log(LogLevel.INFO, 'redis', 'Connection established', { host: 'redis.railway.internal' })
log(LogLevel.ERROR, 'mongodb', 'Connection failed', { error: 'ECONNREFUSED' })
```

---

## Disaster Recovery & Backups

### Backup Strategy

#### PostgreSQL Backups

```bash
# Railway provides automatic daily backups
# Manual backup script
#!/bin/bash
# backup-postgres.sh

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

pg_dump \
  -h postgres.railway.internal \
  -U postgres \
  -d postgres \
  --schema=platform \
  -F c \
  -f "$BACKUP_DIR/platform_$TIMESTAMP.backup"

# Upload to S3
aws s3 cp "$BACKUP_DIR/platform_$TIMESTAMP.backup" \
  s3://ogelbase-backups/postgres/

# Retention: Keep last 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

#### Redis Backups

```bash
# Redis AOF + RDB persistence
# Railway provides automated snapshots

# Manual backup via Redis CLI
redis-cli --rdb /backups/redis/dump_$(date +%Y%m%d_%H%M%S).rdb

# Or use BGSAVE command
echo "BGSAVE" | redis-cli
```

#### MongoDB Backups

```bash
# MongoDB dump script
#!/bin/bash
BACKUP_DIR="/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mongodump \
  --uri="$MONGODB_URL" \
  --out="$BACKUP_DIR/dump_$TIMESTAMP" \
  --gzip

# Upload to S3
tar -czf "$BACKUP_DIR/dump_$TIMESTAMP.tar.gz" "$BACKUP_DIR/dump_$TIMESTAMP"
aws s3 cp "$BACKUP_DIR/dump_$TIMESTAMP.tar.gz" \
  s3://ogelbase-backups/mongodb/

# Cleanup
rm -rf "$BACKUP_DIR/dump_$TIMESTAMP"
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

### Recovery Procedures

**Disaster Recovery Runbook**:

```bash
# 1. Restore PostgreSQL
pg_restore \
  -h postgres.railway.internal \
  -U postgres \
  -d postgres \
  --clean \
  platform_20251120_120000.backup

# 2. Restore Redis (from RDB)
redis-cli --rdb dump.rdb

# 3. Restore MongoDB
mongorestore \
  --uri="$MONGODB_URL" \
  --gzip \
  --drop \
  dump_20251120_120000/

# 4. Verify data integrity
psql -h postgres.railway.internal -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM platform.organizations;"

redis-cli DBSIZE

mongosh "$MONGODB_URL" --eval "db.stats()"
```

### High Availability Planning

**Future Enhancements**:

```yaml
# PostgreSQL: Read Replicas
Primary: postgres-primary.railway.internal:5432
Replica1: postgres-replica-1.railway.internal:5432
Replica2: postgres-replica-2.railway.internal:5432

# Redis: Sentinel for Auto-Failover
Sentinel1: redis-sentinel-1.railway.internal:26379
Sentinel2: redis-sentinel-2.railway.internal:26379
Sentinel3: redis-sentinel-3.railway.internal:26379

# MongoDB: Replica Set
Primary: mongodb-primary.railway.internal:27017
Secondary1: mongodb-secondary-1.railway.internal:27017
Secondary2: mongodb-secondary-2.railway.internal:27017
```

---

## Deployment Runbook

### Pre-Deployment Checklist

```bash
✅ 1. Verify environment variables configured in Railway
✅ 2. Test database connections locally
✅ 3. Run database migrations (if any)
✅ 4. Review security settings (firewall, encryption)
✅ 5. Backup current production data
✅ 6. Notify team of deployment window
✅ 7. Prepare rollback plan
```

### Step-by-Step Deployment

#### Phase 1: Deploy Database Services

**1. Deploy Redis**

```bash
# Via Railway Dashboard
1. Create new service: Redis
2. Set environment variables:
   - REDIS_PASSWORD (auto-generated)
   - REDIS_MAXMEMORY=256mb
   - REDIS_APPENDONLY=yes
3. Deploy
4. Test connection: redis-cli -u $REDIS_URL ping
```

**2. Deploy MongoDB**

```bash
# Via Railway Dashboard
1. Create new service: MongoDB
2. Set environment variables:
   - MONGO_INITDB_ROOT_USERNAME=admin
   - MONGO_INITDB_ROOT_PASSWORD (auto-generated)
3. Deploy
4. Initialize replica set: mongosh --eval "rs.initiate()"
5. Test connection: mongosh $MONGODB_URL --eval "db.adminCommand('ping')"
```

**3. Deploy Bun Server**

```bash
# Via Railway Dashboard
1. Create new service: Bun
2. Connect GitHub repo
3. Set environment variables:
   - PORT=3001
   - DATABASE_URL (from platform DB)
   - REDIS_URL (from Redis service)
   - MONGODB_URL (from MongoDB service)
4. Deploy
5. Test: curl https://bun-api-production.up.railway.app/health
```

#### Phase 2: Configure Studio

**1. Update Studio Environment Variables**

```bash
# Run deployment script
./apps/studio/scripts/deploy-railway-env.sh

# Or manually via Railway Dashboard → studio service → Variables
REDIS_URL=redis://default:xxx@redis.railway.internal:6379
MONGODB_URL=mongodb://admin:xxx@mongodb.railway.internal:27017/ogelbase
BUN_API_URL=http://bun-api.railway.internal:3001
ENABLE_REDIS_MANAGEMENT=true
ENABLE_MONGODB_MANAGEMENT=true
```

**2. Deploy Studio Code Changes**

```bash
# Commit and push changes
git add .
git commit -m "feat: Add multi-database support for Redis, MongoDB, Bun"
git push origin main

# Trigger deployment (automatic via Vercel GitHub integration)
# Or manual: vercel --prod
```

#### Phase 3: Verify Deployment

**1. Health Checks**

```bash
# Check all services
curl https://ogelbase-studio.vercel.app/api/platform/health | jq

# Expected output:
{
  "timestamp": "2025-11-20T12:00:00.000Z",
  "status": "healthy",
  "services": {
    "postgres": { "status": "healthy", "latency": 23 },
    "redis": { "status": "healthy", "latency": 12 },
    "mongodb": { "status": "healthy", "latency": 45 },
    "bun_api": { "status": "healthy", "latency": 67 }
  }
}
```

**2. Functional Tests**

```bash
# Test Redis operations
curl -X POST https://ogelbase-studio.vercel.app/api/platform/redis/test-connection \
  -H "Authorization: Bearer $JWT_TOKEN"

# Test MongoDB operations
curl -X GET https://ogelbase-studio.vercel.app/api/platform/mongodb/databases \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**3. Smoke Tests**

```bash
# Add a Redis database
curl -X POST https://ogelbase-studio.vercel.app/api/platform/databases \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectRef": "test-proj",
    "name": "redis-cache",
    "type": "redis",
    "connectionString": "redis://default:xxx@redis.railway.internal:6379"
  }'

# List databases
curl https://ogelbase-studio.vercel.app/api/platform/databases?projectRef=test-proj \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Rollback Plan

If deployment fails:

```bash
# 1. Revert code changes
git revert HEAD
git push origin main

# 2. Restore previous environment variables
railway variables set ENABLE_REDIS_MANAGEMENT=false
railway variables set ENABLE_MONGODB_MANAGEMENT=false

# 3. Redeploy previous version
vercel --prod

# 4. Verify rollback
curl https://ogelbase-studio.vercel.app/api/platform/health
```

---

## Cost Optimization

### Railway Pricing Estimation

**Current Costs** (based on Railway pricing):

| Service | Plan | Memory | CPU | Cost/Month |
|---------|------|--------|-----|------------|
| PostgreSQL | 1 GB | 1 GB | Shared | $5 |
| Redis | 512 MB | 512 MB | Shared | $3 |
| MongoDB | 1 GB | 1 GB | Shared | $5 |
| Bun Server | 256 MB | 256 MB | Shared | $2 |
| **Total** | | **2.75 GB** | | **$15/month** |

**Optimization Strategies**:

1. **Use Internal Networking**: Free bandwidth (vs $0.10/GB external)
2. **Connection Pooling**: Reduce memory overhead
3. **Shared Services**: Use same Redis for caching + sessions
4. **Auto-Scaling**: Scale down during low traffic
5. **Compression**: Enable GZIP for MongoDB (reduces storage)

### Resource Monitoring

```bash
# Track resource usage
railway logs --tail 100 --service redis
railway logs --tail 100 --service mongodb

# Memory usage alert
if [ $(railway ps -s redis | grep Memory | awk '{print $2}') -gt 400 ]; then
  echo "⚠️  Redis approaching memory limit"
fi
```

---

## Appendix: Connection Strings & Examples

### Connection String Templates

#### PostgreSQL

```bash
# Internal (Railway services)
postgresql://postgres:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres

# External (local development)
postgresql://postgres:${POSTGRES_PASSWORD}@roundhouse.proxy.rlwy.net:12345/postgres

# With SSL
postgresql://postgres:${POSTGRES_PASSWORD}@postgres.railway.internal:5432/postgres?sslmode=require
```

#### Redis

```bash
# Internal (Railway services)
redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379

# External
redis://default:${REDIS_PASSWORD}@redis-production-abc.up.railway.app:6379

# With TLS
rediss://default:${REDIS_PASSWORD}@redis-production-abc.up.railway.app:6380

# With database selection
redis://default:${REDIS_PASSWORD}@redis.railway.internal:6379/0
```

#### MongoDB

```bash
# Internal (Railway services)
mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase?authSource=admin

# External
mongodb://admin:${MONGO_PASSWORD}@mongodb-production-xyz.up.railway.app:27017/ogelbase

# With options
mongodb://admin:${MONGO_PASSWORD}@mongodb.railway.internal:27017/ogelbase?authSource=admin&retryWrites=true&w=majority

# Replica set (future)
mongodb://admin:${MONGO_PASSWORD}@mongo1.railway.internal:27017,mongo2.railway.internal:27017/ogelbase?replicaSet=rs0
```

#### Bun API

```bash
# Internal (Railway services)
http://bun-api.railway.internal:3001

# External (HTTPS)
https://bun-api-production-xyz.up.railway.app

# With custom domain
https://api.ogelbase.com
```

### Sample Requests

#### Test Redis Connection

```bash
curl -X POST https://ogelbase-studio.vercel.app/api/platform/databases \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectRef": "test-proj",
    "name": "redis-primary",
    "type": "redis",
    "connectionString": "redis://default:password@redis.railway.internal:6379",
    "description": "Primary Redis cache instance"
  }'
```

#### Test MongoDB Connection

```bash
curl -X POST https://ogelbase-studio.vercel.app/api/platform/databases \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectRef": "test-proj",
    "name": "mongo-primary",
    "type": "mongodb",
    "connectionString": "mongodb://admin:password@mongodb.railway.internal:27017/ogelbase?authSource=admin",
    "description": "Primary MongoDB instance"
  }'
```

---

## Next Steps

### Immediate Actions (Week 1)

```bash
✅ 1. Deploy Redis service on Railway
✅ 2. Deploy MongoDB service on Railway
✅ 3. Deploy Bun server on Railway
✅ 4. Configure environment variables
✅ 5. Test internal networking connectivity
✅ 6. Run health checks
✅ 7. Update documentation
```

### Short-term (Weeks 2-4)

```bash
⬜ 1. Implement connection managers (Redis, MongoDB)
⬜ 2. Create API routes for database management
⬜ 3. Add frontend UI for database browser
⬜ 4. Implement monitoring dashboard
⬜ 5. Set up automated backups
⬜ 6. Load testing
```

### Long-term (Months 2-3)

```bash
⬜ 1. Add replica sets (MongoDB)
⬜ 2. Implement Redis Sentinel
⬜ 3. Set up read replicas (PostgreSQL)
⬜ 4. Advanced monitoring (Prometheus, Grafana)
⬜ 5. Cost optimization analysis
⬜ 6. Security audit
```

---

## Conclusion

This infrastructure architecture provides a **production-ready foundation** for managing multiple database types on Railway. The design prioritizes:

- **Reliability**: Connection pooling, health checks, circuit breakers
- **Security**: Encryption at rest and in transit, private networking
- **Performance**: Internal Railway networking, optimized connection pools
- **Operational Excellence**: Health checks, monitoring, automated backups
- **Cost Efficiency**: Resource optimization, shared services

**Total Estimated Setup Time**: 2-3 weeks (including testing)
**Monthly Infrastructure Cost**: ~$15 (Railway) + existing Vercel costs

The system is designed to scale horizontally as your user base grows, with clear paths for adding replica sets, read replicas, and high-availability configurations.

---

**Document Status**: Ready for Implementation
**Last Updated**: November 20, 2025
**Maintained By**: DevOps/Infrastructure Team
**Review Cycle**: Monthly
