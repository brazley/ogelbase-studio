# Ogel Deploy Infrastructure Strategy
**Adapting Appwrite's Architecture for Railway Deployment**

**Date:** 2025-11-22
**Analyst:** Hassan Malik, Multi-Cloud Infrastructure Architect
**Based on:** Appwrite v1.6.x architecture analysis

---

## Executive Summary

After analyzing Appwrite's production infrastructure, I've identified key architectural patterns that can be adapted for Railway deployment. Appwrite uses a sophisticated microservices architecture with 20+ specialized worker services, centralized storage volumes, and event-driven communication via Redis queues. This strategy outlines how to pragmatically adapt these patterns for Railway while leveraging our existing Supabase Studio fork and Railway's private networking.

**Key Finding:** Appwrite's worker-based architecture is **highly Railway-compatible** but requires strategic simplification to avoid cost explosion.

---

## 1. Infrastructure Architecture Analysis

### 1.1 Appwrite's Core Components

#### Service Layer (Appwrite)
```yaml
Component                Purpose                      Railway Equivalent
─────────────────────────────────────────────────────────────────────────
Main API Server         HTTP/WebSocket endpoints     Studio (Next.js + Bun)
Realtime Server         WebSocket connections        Bun WebSocket server
Console                 Admin UI                     Studio frontend
Traefik                 Reverse proxy/routing        Railway public domains
```

#### Worker Layer (15+ specialized workers)
```
Worker Type             Purpose                      Adaptation Strategy
─────────────────────────────────────────────────────────────────────────
worker-databases        DB operations/migrations     Railway Postgres direct
worker-deletes          Cleanup operations          Bun cron job
worker-webhooks         Webhook delivery            Bun queue worker
worker-audits           Audit log processing        Studio API endpoint
worker-mails            Email sending               Studio + Resend API
worker-messaging        SMS/Push notifications      Future phase
worker-builds           Function compilation        Not needed (Phase 1)
worker-certificates     SSL management              Railway handles
worker-functions        Serverless execution        Future phase
worker-migrations       Data migrations             Studio migrations
```

#### Data Layer
```
Component               Technology                   Railway Strategy
─────────────────────────────────────────────────────────────────────────
Primary DB              MariaDB 10.11               ✅ Railway Postgres
Cache Layer             Redis 7.2                   ✅ Railway Redis
Queue System            Redis Queue                 ✅ Railway Redis
Object Storage          S3-compatible               Railway Volumes
```

### 1.2 Current Railway Infrastructure

```
Service                 Status                       Purpose
─────────────────────────────────────────────────────────────────────────
Studio                  ✅ Deployed                  Next.js dashboard
Postgres                ✅ Deployed (maglev)         Primary database
Redis                   ✅ Deployed                  Session cache
MongoDB                 ✅ Deployed                  Not yet utilized
Kong                    🔄 Needs evaluation          API Gateway
Auth (GoTrue)           🔄 Needs evaluation          Authentication
Postgres Meta           🔄 Needs evaluation          DB metadata API
MinIO                   🔄 Needs evaluation          Object storage
```

**Private Network Status:** Available but not fully utilized (see RAILWAY-PRIVATE-NETWORK-SUMMARY.md)

---

## 2. Service Discovery & Networking

### 2.1 Appwrite's Approach

**Docker Compose Networking:**
```yaml
networks:
  gateway:      # Public-facing (Traefik)
  appwrite:     # Internal services
  runtimes:     # Function execution

# Services use DNS names
environment:
  _APP_REDIS_HOST: redis           # Container name = DNS
  _APP_DB_HOST: mariadb            # Automatic service discovery
  _APP_EXECUTOR_HOST: http://exc1  # Direct container reference
```

**Pattern:** Container name-based service discovery within networks

### 2.2 Railway Adaptation

**Private Network DNS:**
```bash
# Railway provides automatic DNS
postgres.railway.internal:5432
redis.railway.internal:6379
studio.railway.internal:3000
mongodb.railway.internal:27017

# Public endpoints (browser only)
studio-production-cfcd.up.railway.app
kong-production-80c6.up.railway.app
```

**Implementation Strategy:**

```typescript
// lib/config/services.ts
export const SERVICE_URLS = {
  // Private network (server-side only)
  postgres: {
    host: process.env.POSTGRES_INTERNAL_HOST || 'postgres.railway.internal',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DATABASE || 'railway',
  },
  redis: {
    url: process.env.REDIS_INTERNAL_URL || 'redis://redis.railway.internal:6379',
  },
  mongodb: {
    url: process.env.MONGODB_INTERNAL_URL || 'mongodb://mongodb.railway.internal:27017',
  },

  // Public URLs (client-side + SSR)
  api: process.env.NEXT_PUBLIC_API_URL,
  studio: process.env.NEXT_PUBLIC_SITE_URL,
}
```

**Cost Optimization:**
- **Current:** ~$11/month in egress (all traffic over public internet)
- **After optimization:** ~$2/month (84% reduction)
- **Annual savings:** $111/year

### 2.3 Service Discovery Pattern

**Appwrite Pattern:**
```php
// app/init.php
$redis = new Redis();
$redis->connect($_ENV['_APP_REDIS_HOST'], $_ENV['_APP_REDIS_PORT']);

$db = new PDO("mysql:host={$_ENV['_APP_DB_HOST']};port={$_ENV['_APP_DB_PORT']}");
```

**Railway Pattern (TypeScript):**
```typescript
// lib/database/connections.ts
import { Pool } from 'pg';
import { createClient } from 'redis';

// Singleton pattern for connection pooling
export const pgPool = new Pool({
  host: SERVICE_URLS.postgres.host,
  port: SERVICE_URLS.postgres.port,
  database: SERVICE_URLS.postgres.database,
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const redisClient = createClient({
  url: SERVICE_URLS.redis.url,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

await redisClient.connect();
```

---

## 3. Resource Allocation & Scaling

### 3.1 Appwrite Resource Requirements

**From Dockerfile Analysis:**
```dockerfile
# Appwrite base image requirements
- PHP 8.3 + FPM
- Composer dependencies (~200MB)
- System packages (libwebp, boost)
- Storage volumes (multiple directories)
- Worker executables (32 binaries)

# Runtime configuration
ENV _APP_WORKER_PER_CORE=6
ENV _APP_COMPUTE_CPUS=8
ENV _APP_COMPUTE_MEMORY=8192
```

**Worker Resource Profile:**
```yaml
# Per-worker configuration
worker-databases:
  cpu: 0.5 core
  memory: 512MB
  instances: 2-4 (based on load)

worker-deletes:
  cpu: 0.25 core
  memory: 256MB
  instances: 1

worker-webhooks:
  cpu: 0.25 core
  memory: 256MB
  instances: 1-3 (burst capacity)
```

### 3.2 Railway Resource Strategy

**Current Allocation:**
```
Service         vCPU    Memory    Instances   Cost/Month
─────────────────────────────────────────────────────────
Studio          1.0     2GB       1           ~$20
Postgres        0.5     1GB       1           ~$5
Redis           0.25    512MB     1           ~$2
MongoDB         0.5     1GB       1           ~$5
Total                             4           ~$32/month
```

**Optimized Allocation (Phase 1):**
```
Service              vCPU    Memory    Instances   Cost/Month
──────────────────────────────────────────────────────────────
Studio (Monolith)    2.0     4GB       1-2         ~$40
  - API Server       1.0     2GB
  - Worker Pool      1.0     2GB

Database Layer       1.0     2GB       3           ~$15
  - Postgres         0.5     1GB
  - Redis            0.25    512MB
  - MongoDB          0.25    512MB

Total                3.0     6GB       4-5         ~$55/month
```

**Scaling Strategy:**

```typescript
// Railway.toml (future: when available)
[deploy]
startCommand = "node apps/studio/server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[deploy.healthcheck]
path = "/api/health"
timeout = 10
interval = 30

[resources]
cpu = 2.0
memory = 4096
replicas = 1
autoscaling = false  # Manual scaling initially
```

### 3.3 Horizontal Scaling Pattern

**Appwrite's Approach:**
```yaml
# docker-compose.yml - multiple instances of same image
appwrite:
  image: appwrite-dev
  entrypoint: php app/http.php

appwrite-realtime:
  image: appwrite-dev
  entrypoint: realtime

appwrite-worker-databases:
  image: appwrite-dev
  entrypoint: worker-databases
```

**Pattern:** Single Docker image, multiple entrypoints

**Railway Adaptation:**

```bash
# Phase 1: Monolithic
SERVICE=studio
WORKERS=embedded  # Run workers in same process

# Phase 2: Separated workers (when needed)
SERVICE=studio-api
SERVICE=studio-workers
SERVICE=studio-realtime

# Phase 3: Specialized workers
SERVICE=worker-webhooks
SERVICE=worker-audit
SERVICE=worker-cleanup
```

---

## 4. Database Integration Patterns

### 4.1 Appwrite's Database Strategy

**Connection Pooling (PHP):**
```php
// Uses PDO with persistent connections
use Utopia\Database\Adapter\Pool as DatabasePool;
use Utopia\Cache\Adapter\Pool as CachePool;

$dbPool = new DatabasePool([
    'connections' => 10,
    'max_idle_time' => 60,
]);
```

**Migration System:**
```bash
# bin/migrate
php /usr/src/code/app/cli.php migrate

# Migration structure
/app/config/collections/*.php     # Schema definitions
/app/controllers/api/*.php        # API endpoints
```

### 4.2 Railway Postgres Strategy

**Current Setup:**
```bash
# Postgres (Maglev Proxy)
Host: maglev.proxy.rlwy.net
Port: 20105  # Public proxy port

# Private Network (optimized)
Host: postgres.railway.internal
Port: 5432   # Direct connection
```

**Connection Pool Configuration:**

```typescript
// lib/database/pool.ts
import { Pool, PoolConfig } from 'pg';

const poolConfig: PoolConfig = {
  // Railway private network
  host: 'postgres.railway.internal',
  port: 5432,
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,

  // Pool configuration
  max: 20,                    // Max connections (Appwrite uses 10-20)
  min: 5,                     // Keep minimum connections warm
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 2000,

  // Reliability
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // SSL for production
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
};

export const pool = new Pool(poolConfig);

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rows[0]['?column?'] === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
```

**Migration Strategy:**

```typescript
// database/migrations/schema.sql
-- Platform databases (already implemented)
CREATE TABLE IF NOT EXISTS platform_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs (Appwrite pattern)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Queue system (Appwrite pattern via Redis)
CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_queue_status ON job_queue(status, scheduled_at);
CREATE INDEX idx_job_queue_name ON job_queue(queue_name);
```

### 4.3 Redis Integration

**Appwrite's Redis Usage:**
```php
// Cache layer
$cache = new Cache(new Redis($_ENV['_APP_REDIS_HOST']));

// Queue system
$queue = new Queue(new Redis($_ENV['_APP_REDIS_HOST']));

// Realtime subscriptions
$realtime = new Realtime(new Redis($_ENV['_APP_REDIS_HOST']));
```

**Railway Redis Strategy:**

```typescript
// lib/cache/redis.ts
import { createClient, RedisClientType } from 'redis';

class RedisService {
  private client: RedisClientType;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;

  async initialize() {
    const redisUrl = 'redis://redis.railway.internal:6379';

    // Main client (cache + queues)
    this.client = createClient({ url: redisUrl });

    // Pub/sub clients (realtime)
    this.pubClient = createClient({ url: redisUrl });
    this.subClient = this.pubClient.duplicate();

    await Promise.all([
      this.client.connect(),
      this.pubClient.connect(),
      this.subClient.connect(),
    ]);
  }

  // Cache operations
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  // Queue operations (Appwrite pattern)
  async enqueue(queue: string, job: any): Promise<void> {
    await this.client.rPush(
      `queue:${queue}`,
      JSON.stringify({ ...job, timestamp: Date.now() })
    );
  }

  async dequeue(queue: string): Promise<any | null> {
    const result = await this.client.blPop(`queue:${queue}`, 1);
    return result ? JSON.parse(result.element) : null;
  }

  // Realtime pub/sub
  async publish(channel: string, message: any): Promise<void> {
    await this.pubClient.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: (message: any) => void): Promise<void> {
    await this.subClient.subscribe(channel, (message) => {
      handler(JSON.parse(message));
    });
  }
}

export const redis = new RedisService();
```

**Redis Configuration for Railway:**

```bash
# Railway Redis Environment Variables
REDIS_INTERNAL_URL=redis://redis.railway.internal:6379
REDIS_MAX_MEMORY=512mb
REDIS_EVICTION_POLICY=allkeys-lru
REDIS_MAX_MEMORY_SAMPLES=5
```

### 4.4 MongoDB Integration

**Current Status:** Deployed but not yet utilized

**Proposed Usage (from Appwrite insights):**

```typescript
// lib/database/mongodb.ts
import { MongoClient, Db } from 'mongodb';

class MongoService {
  private client: MongoClient;
  private db: Db;

  async connect() {
    const mongoUrl = 'mongodb://mongodb.railway.internal:27017';
    this.client = new MongoClient(mongoUrl, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    });

    await this.client.connect();
    this.db = this.client.db(process.env.MONGODB_DATABASE || 'ogel');
  }

  // Use cases (based on Appwrite's patterns):

  // 1. Document-based storage (unstructured data)
  async saveDocument(collection: string, doc: any) {
    return this.db.collection(collection).insertOne({
      ...doc,
      _created_at: new Date(),
      _updated_at: new Date(),
    });
  }

  // 2. Realtime data (high-write scenarios)
  async logEvent(event: any) {
    return this.db.collection('events').insertOne({
      ...event,
      timestamp: new Date(),
    });
  }

  // 3. Analytics/metrics (time-series data)
  async recordMetric(metric: any) {
    return this.db.collection('metrics').insertOne(metric);
  }
}

export const mongo = new MongoService();
```

**When to use MongoDB vs Postgres:**

| Use Case | Database | Reason |
|----------|----------|--------|
| User data, auth | Postgres | ACID, relations |
| Project metadata | Postgres | Schema validation |
| Audit logs | Postgres | Queryability, indexes |
| Unstructured docs | MongoDB | Flexible schema |
| High-write events | MongoDB | Write performance |
| Analytics data | MongoDB | Time-series optimization |
| Session data | Redis | Speed, TTL |

---

## 5. Storage & Volume Management

### 5.1 Appwrite's Storage Architecture

**Volume Structure:**
```yaml
volumes:
  appwrite-uploads:       # User file uploads
  appwrite-imports:       # Data import temp storage
  appwrite-cache:         # Compiled assets, thumbnails
  appwrite-config:        # Traefik configs, SSL certs
  appwrite-certificates:  # Let's Encrypt certificates
  appwrite-functions:     # Serverless function code
  appwrite-sites:         # Static site builds
  appwrite-builds:        # Build artifacts
```

**Volume Mount Pattern:**
```yaml
volumes:
  - appwrite-uploads:/storage/uploads:rw
  - appwrite-cache:/storage/cache:rw
  - appwrite-functions:/storage/functions:rw
```

**Storage Devices (configurable):**
```env
_APP_STORAGE_DEVICE=Local          # or s3, do-spaces, backblaze
_APP_STORAGE_S3_ACCESS_KEY=...
_APP_STORAGE_S3_SECRET=...
_APP_STORAGE_S3_BUCKET=...
```

### 5.2 Railway Storage Strategy

**Railway Volume Limits:**
- Max size: 50GB per volume
- Persistence: Tied to service lifecycle
- Shared access: Not available between services

**Recommended Approach:**

```typescript
// lib/storage/strategy.ts

export enum StorageBackend {
  LOCAL = 'local',         // Railway volumes (dev/staging)
  S3 = 's3',              // AWS S3 (production)
  R2 = 'r2',              // Cloudflare R2 (cost-effective)
}

interface StorageConfig {
  backend: StorageBackend;
  local?: {
    basePath: string;
    maxSize: number;
  };
  s3?: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
    endpoint?: string;
  };
}

class StorageService {
  private config: StorageConfig;

  constructor() {
    this.config = {
      backend: (process.env.STORAGE_BACKEND as StorageBackend) || StorageBackend.LOCAL,
      local: {
        basePath: '/app/storage',
        maxSize: 50 * 1024 * 1024 * 1024, // 50GB
      },
      s3: {
        accessKey: process.env.S3_ACCESS_KEY || '',
        secretKey: process.env.S3_SECRET_KEY || '',
        bucket: process.env.S3_BUCKET || '',
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT, // For R2/MinIO
      },
    };
  }

  async saveFile(path: string, data: Buffer): Promise<string> {
    switch (this.config.backend) {
      case StorageBackend.LOCAL:
        return this.saveLocal(path, data);
      case StorageBackend.S3:
      case StorageBackend.R2:
        return this.saveS3(path, data);
    }
  }

  private async saveLocal(path: string, data: Buffer): Promise<string> {
    const fs = require('fs').promises;
    const fullPath = `${this.config.local!.basePath}/${path}`;
    await fs.writeFile(fullPath, data);
    return fullPath;
  }

  private async saveS3(path: string, data: Buffer): Promise<string> {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      region: this.config.s3!.region,
      credentials: {
        accessKeyId: this.config.s3!.accessKey,
        secretAccessKey: this.config.s3!.secretKey,
      },
      endpoint: this.config.s3!.endpoint,
    });

    await client.send(new PutObjectCommand({
      Bucket: this.config.s3!.bucket,
      Key: path,
      Body: data,
    }));

    return `s3://${this.config.s3!.bucket}/${path}`;
  }
}

export const storage = new StorageService();
```

**Storage Cost Comparison:**

| Option | Storage Cost | Egress Cost | Total (100GB storage, 500GB/mo egress) |
|--------|-------------|-------------|----------------------------------------|
| Railway Volumes | $0.25/GB/mo | $0.10/GB | $75/month |
| AWS S3 Standard | $0.023/GB/mo | $0.09/GB | $47.30/month |
| Cloudflare R2 | $0.015/GB/mo | $0 | $1.50/month ⭐ |
| Backblaze B2 | $0.005/GB/mo | $0.01/GB (free 3x storage) | $5.50/month |

**Recommendation:** Use Cloudflare R2 for production (97% cost savings)

### 5.3 File Upload Pattern (from Appwrite)

```typescript
// pages/api/storage/upload.ts
import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { storage } from '@/lib/storage/strategy';

export const config = {
  api: {
    bodyParser: false, // Disable Next.js body parser
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB (Appwrite default: 30MB)
    keepExtensions: true,
  });

  try {
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save to storage backend
    const path = `uploads/${Date.now()}-${file.originalFilename}`;
    const savedPath = await storage.saveFile(path,
      await require('fs').promises.readFile(file.filepath)
    );

    // Save metadata to database
    const { pool } = await import('@/lib/database/pool');
    const result = await pool.query(
      `INSERT INTO storage_files (path, filename, mimetype, size, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [savedPath, file.originalFilename, file.mimetype, file.size]
    );

    res.status(200).json({
      id: result.rows[0].id,
      filename: file.originalFilename,
      path: savedPath,
      size: file.size,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}
```

---

## 6. Worker Architecture & Job Queues

### 6.1 Appwrite's Worker Pattern

**Worker Types (from docker-compose.yml):**

```yaml
# Background workers (Redis queue based)
appwrite-worker-databases:    # DB migrations, schema changes
appwrite-worker-deletes:      # Cleanup old data, files
appwrite-worker-webhooks:     # HTTP webhook delivery
appwrite-worker-audits:       # Audit log processing
appwrite-worker-mails:        # Email sending
appwrite-worker-messaging:    # SMS/Push notifications
appwrite-worker-builds:       # Function/site compilation
appwrite-worker-certificates: # SSL cert management
appwrite-worker-functions:    # Execute serverless functions
appwrite-worker-migrations:   # Data migrations

# Scheduled workers (cron-like)
appwrite-task-maintenance:         # Daily cleanup
appwrite-task-scheduler-functions: # Function scheduling
appwrite-task-stats-resources:     # Resource metrics
```

**Worker Implementation (PHP):**
```php
// bin/worker-webhooks
#!/bin/sh
php /usr/src/code/app/worker.php webhooks $@

// app/worker.php
$queue = new Queue($redis);
$queue->consume('webhooks', function($job) {
    // Process webhook delivery
    $http->post($job['url'], $job['payload']);
});
```

### 6.2 Railway Worker Strategy

**Phase 1: Embedded Workers (Monolithic)**

```typescript
// lib/workers/manager.ts
import { redis } from '@/lib/cache/redis';

export class WorkerManager {
  private workers: Map<string, Worker> = new Map();

  async start() {
    // Critical workers only (Phase 1)
    this.startWorker('webhooks', handleWebhookJob);
    this.startWorker('audit', handleAuditJob);
    this.startWorker('cleanup', handleCleanupJob);
  }

  private async startWorker(
    queue: string,
    handler: (job: any) => Promise<void>
  ) {
    const worker = async () => {
      while (true) {
        try {
          const job = await redis.dequeue(queue);
          if (job) {
            await handler(job);
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Worker ${queue} error:`, error);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    };

    this.workers.set(queue, worker);
    worker(); // Start in background
  }
}

// Start workers with main app
// apps/studio/server.js
import { WorkerManager } from '@/lib/workers/manager';

const workerManager = new WorkerManager();
await workerManager.start();
```

**Phase 2: Separate Worker Services**

```bash
# Railway services (when worker load increases)

studio-api:           # Main HTTP server
  replicas: 2
  cpu: 1.0
  memory: 2GB

studio-workers:       # Background workers
  replicas: 1
  cpu: 1.0
  memory: 2GB
  env:
    WORKER_MODE=true
    WORKER_QUEUES=webhooks,audit,cleanup
```

**Worker Service Entry Point:**

```typescript
// apps/studio/worker.ts
import { WorkerManager } from '@/lib/workers/manager';

if (process.env.WORKER_MODE === 'true') {
  const queues = (process.env.WORKER_QUEUES || 'webhooks').split(',');
  const manager = new WorkerManager();

  queues.forEach(queue => {
    manager.startWorker(queue, getHandlerForQueue(queue));
  });

  console.log(`Workers started: ${queues.join(', ')}`);
} else {
  console.error('WORKER_MODE not set');
  process.exit(1);
}
```

### 6.3 Job Queue Implementation

**Queue Job Structure (Appwrite-inspired):**

```typescript
// lib/queue/types.ts
export interface QueueJob {
  id: string;
  queue: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  createdAt: Date;
}

// lib/queue/publisher.ts
export class QueuePublisher {
  async enqueue(queue: string, payload: any, options?: {
    delay?: number;
    maxAttempts?: number;
  }): Promise<void> {
    const job: QueueJob = {
      id: crypto.randomUUID(),
      queue,
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts || 3,
      scheduledAt: options?.delay
        ? new Date(Date.now() + options.delay)
        : undefined,
      createdAt: new Date(),
    };

    if (job.scheduledAt) {
      // Delayed job - store in Postgres
      await pool.query(
        `INSERT INTO job_queue (id, queue_name, payload, scheduled_at)
         VALUES ($1, $2, $3, $4)`,
        [job.id, queue, job.payload, job.scheduledAt]
      );
    } else {
      // Immediate job - push to Redis
      await redis.enqueue(queue, job);
    }
  }
}

export const publisher = new QueuePublisher();
```

**Job Handlers:**

```typescript
// lib/workers/handlers/webhooks.ts
export async function handleWebhookJob(job: QueueJob) {
  const { url, payload, headers } = job.payload;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Ogel-Webhook/1.0',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Log success
    await logWebhookDelivery(job.id, 'success', response.status);

  } catch (error) {
    console.error('Webhook delivery failed:', error);

    // Retry logic
    if (job.attempts < job.maxAttempts) {
      await publisher.enqueue('webhooks', job.payload, {
        delay: Math.pow(2, job.attempts) * 1000, // Exponential backoff
      });
    } else {
      await logWebhookDelivery(job.id, 'failed', 0, error.message);
    }
  }
}

// lib/workers/handlers/audit.ts
export async function handleAuditJob(job: QueueJob) {
  const { userId, action, resourceType, resourceId, metadata } = job.payload;

  await pool.query(
    `INSERT INTO audit_logs
     (user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, action, resourceType, resourceId, metadata,
     job.payload.ipAddress, job.payload.userAgent]
  );
}

// lib/workers/handlers/cleanup.ts
export async function handleCleanupJob(job: QueueJob) {
  const { type, olderThan } = job.payload;

  switch (type) {
    case 'sessions':
      await pool.query(
        `DELETE FROM sessions WHERE expires_at < $1`,
        [olderThan]
      );
      break;

    case 'audit_logs':
      await pool.query(
        `DELETE FROM audit_logs WHERE created_at < $1`,
        [olderThan]
      );
      break;

    case 'temp_files':
      // Clean up temporary files from storage
      const files = await storage.listFiles('temp/');
      for (const file of files) {
        if (file.createdAt < olderThan) {
          await storage.deleteFile(file.path);
        }
      }
      break;
  }
}
```

### 6.4 Scheduled Jobs (Cron Pattern)

**Appwrite's Scheduled Tasks:**
```yaml
appwrite-task-maintenance:
  entrypoint: maintenance
  environment:
    _APP_MAINTENANCE_INTERVAL: 86400  # Daily
    _APP_MAINTENANCE_START_TIME: 12:00

appwrite-task-stats-resources:
  entrypoint: stats-resources
  environment:
    _APP_STATS_RESOURCES_INTERVAL: 30  # Every 30 seconds
```

**Railway Implementation:**

```typescript
// lib/workers/scheduler.ts
import cron from 'node-cron';
import { publisher } from '@/lib/queue/publisher';

export class JobScheduler {
  start() {
    // Daily maintenance (2 AM UTC)
    cron.schedule('0 2 * * *', async () => {
      await publisher.enqueue('cleanup', {
        type: 'sessions',
        olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      await publisher.enqueue('cleanup', {
        type: 'audit_logs',
        olderThan: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
      });
    });

    // Metrics collection (every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
      await collectMetrics();
    });

    // Health checks (every minute)
    cron.schedule('* * * * *', async () => {
      await checkServiceHealth();
    });
  }
}

// Start scheduler with app
const scheduler = new JobScheduler();
scheduler.start();
```

---

## 7. Migration Path from Current Setup

### 7.1 Current State Assessment

```
Service          Status    Issues                     Action Required
─────────────────────────────────────────────────────────────────────────
Studio           ✅        Using public URLs          Migrate to private
Postgres         ✅        Public proxy (maglev)      Switch to private
Redis            ✅        Session cache only         Expand to queues
MongoDB          ⚠️        Deployed but unused        Define use cases
Kong             ⚠️        Unclear purpose           Audit + decision
Auth (GoTrue)    ⚠️        Separate service          Consider integration
Postgres Meta    ⚠️        May be redundant          Audit + decision
MinIO            ⚠️        Object storage            Evaluate vs R2/S3
```

### 7.2 Phase 1: Network Optimization (Week 1)

**Goal:** Switch to private network, reduce egress costs by 84%

**Tasks:**
1. ✅ Document current architecture (DONE)
2. ⏱️ Update Studio to use `postgres.railway.internal`
3. ⏱️ Update Studio to use `redis.railway.internal`
4. ⏱️ Test connectivity and performance
5. ⏱️ Monitor egress metrics

**Environment Variable Changes:**
```bash
# Studio service
# Before:
POSTGRES_HOST=maglev.proxy.rlwy.net
POSTGRES_PORT=20105
REDIS_URL=redis://redis-production-xxx.up.railway.app:6379

# After:
POSTGRES_HOST=postgres.railway.internal
POSTGRES_PORT=5432
REDIS_INTERNAL_URL=redis://redis.railway.internal:6379
```

**Verification:**
```bash
# Check private network connectivity
railway run --service studio node -e "
  const { Pool } = require('pg');
  const pool = new Pool({
    host: 'postgres.railway.internal',
    port: 5432,
  });
  pool.query('SELECT 1').then(() => console.log('✅ Connected'));
"
```

**Rollback Plan:**
```bash
# If issues arise, revert to public URLs
railway variables set POSTGRES_HOST=maglev.proxy.rlwy.net --service studio
railway variables set POSTGRES_PORT=20105 --service studio
railway up --service studio
```

### 7.3 Phase 2: Worker Implementation (Week 2-3)

**Goal:** Add background job processing without new services

**Tasks:**
1. ⏱️ Implement queue system (Redis-based)
2. ⏱️ Create webhook worker
3. ⏱️ Create audit log worker
4. ⏱️ Create cleanup worker (scheduled)
5. ⏱️ Add monitoring/alerting

**Implementation Steps:**

```bash
# 1. Create worker infrastructure
mkdir -p lib/workers/{handlers,types}
touch lib/workers/manager.ts
touch lib/workers/handlers/{webhooks,audit,cleanup}.ts

# 2. Add worker startup to server
# Edit apps/studio/server.js to include workers

# 3. Deploy
railway up --service studio

# 4. Test workers
curl -X POST https://studio-production-cfcd.up.railway.app/api/test-webhook
railway logs --service studio --filter "worker"
```

**Monitoring:**
```typescript
// lib/workers/monitoring.ts
export async function reportWorkerMetrics() {
  const metrics = {
    queues: {
      webhooks: await redis.lLen('queue:webhooks'),
      audit: await redis.lLen('queue:audit'),
      cleanup: await redis.lLen('queue:cleanup'),
    },
    workers: {
      active: workers.size,
      uptime: process.uptime(),
    },
  };

  // Store in MongoDB for analysis
  await mongo.recordMetric({
    type: 'worker_health',
    ...metrics,
    timestamp: new Date(),
  });
}
```

### 7.4 Phase 3: Service Consolidation (Week 4)

**Goal:** Evaluate and consolidate redundant services

**Services to Audit:**

**Kong:**
- **Purpose:** API gateway, rate limiting, routing
- **Question:** Can Next.js middleware replace this?
- **Decision criteria:**
  - If only used for routing → Next.js can handle
  - If used for rate limiting/auth → Keep or replace with Cloudflare
  - If not in critical path → Remove

**Auth (GoTrue):**
- **Purpose:** Authentication service (Supabase component)
- **Question:** Can we use Studio's built-in auth?
- **Decision criteria:**
  - If external clients need OAuth → Keep
  - If only Studio uses it → Integrate into Studio
  - Evaluate Clerk/Auth0 as alternatives

**Postgres Meta:**
- **Purpose:** Database metadata API
- **Question:** Does Studio use this?
- **Decision criteria:**
  - Search Studio codebase for `postgres-meta` references
  - If heavily used → Keep
  - If rarely used → Implement minimal equivalent in Studio

**MinIO:**
- **Purpose:** S3-compatible object storage
- **Question:** Is this needed or can we use external S3/R2?
- **Decision criteria:**
  - Current usage: Check volumes, API calls
  - Cost: MinIO on Railway vs Cloudflare R2
  - Recommendation: Migrate to R2 (97% cost savings)

**Audit Plan:**

```bash
# 1. Check service dependencies
railway logs --service kong | grep -i error
railway logs --service auth | grep -i error
railway logs --service postgres-meta | grep -i error

# 2. Check cross-service calls
railway logs --service studio | grep -E "kong|auth|postgres-meta"

# 3. Check environment variables
railway variables --service studio --json | jq '.[] | select(.name | contains("KONG") or contains("AUTH"))'

# 4. Database connection check
psql $DATABASE_URL -c "
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE '%kong%'
    OR tablename LIKE '%auth%'
"
```

### 7.5 Phase 4: Horizontal Scaling Preparation (Month 2)

**Goal:** Prepare for multi-instance deployment

**Pre-requisites:**
- ✅ Stateless application (session in Redis, no local storage)
- ✅ Database connection pooling
- ✅ Shared cache (Redis)
- ⏱️ Health check endpoint
- ⏱️ Graceful shutdown handling

**Health Check Implementation:**

```typescript
// pages/api/health.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkDatabaseHealth } from '@/lib/database/pool';
import { redis } from '@/lib/cache/redis';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const checks = {
    postgres: false,
    redis: false,
    timestamp: new Date().toISOString(),
  };

  try {
    checks.postgres = await checkDatabaseHealth();
    checks.redis = await redis.ping() === 'PONG';

    if (checks.postgres && checks.redis) {
      return res.status(200).json({ status: 'healthy', checks });
    } else {
      return res.status(503).json({ status: 'degraded', checks });
    }
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      checks,
      error: error.message
    });
  }
}
```

**Graceful Shutdown:**

```typescript
// apps/studio/server.js
import { createServer } from 'http';
import next from 'next';

const app = next({ dev: false });
const handle = app.getRequestHandler();

let server: ReturnType<typeof createServer>;

async function start() {
  await app.prepare();

  server = createServer((req, res) => {
    handle(req, res);
  });

  server.listen(3000, () => {
    console.log('Server listening on port 3000');
  });
}

async function shutdown() {
  console.log('Received shutdown signal, closing server...');

  // Stop accepting new connections
  server.close(() => {
    console.log('Server closed');
  });

  // Wait for existing connections to finish (max 30s)
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Close database connections
  await pool.end();
  await redis.quit();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
```

**Load Balancing (Railway):**

```bash
# Railway handles load balancing automatically
# when multiple replicas are deployed

# Enable via Railway UI or railway.toml
replicas = 2

# Or via CLI (when available)
railway scale --service studio --replicas 2
```

---

## 8. Cost Optimization Strategies

### 8.1 Current Cost Breakdown (Estimated)

```
Component                Current     Optimized    Savings
──────────────────────────────────────────────────────────
Compute (Studio 1x)      $20/mo      $20/mo       $0
Compute (Workers)        $0          $20/mo*      -$20
Databases (3x)           $15/mo      $15/mo       $0
Network Egress           $11/mo      $2/mo        $9/mo
Storage (Local)          $0          $0           $0
Storage (External)       $0          $2/mo**      -$2/mo
──────────────────────────────────────────────────────────
Total                    $46/mo      $59/mo       -$13/mo

* Phase 2+ only (separate worker service)
** Cloudflare R2 for user uploads
```

### 8.2 Cost Optimization Opportunities

**1. Network Egress (Phase 1 - Immediate)**

**Current:** $11/month in egress
**Optimized:** $2/month in egress
**Savings:** $9/month (82%)

**Action:** Use private network for all internal communication
**Effort:** 2-4 hours
**Risk:** Low

---

**2. Compute Consolidation**

**Current:**
```
Studio: 1 vCPU, 2GB RAM = $20/mo
Kong: 0.5 vCPU, 1GB RAM = $10/mo
Auth: 0.5 vCPU, 1GB RAM = $10/mo
Postgres Meta: 0.25 vCPU, 512MB = $5/mo
Total: 2.25 vCPU, 4.5GB = $45/mo
```

**Option A: Full Consolidation (Aggressive)**
```
Studio Monolith: 2 vCPU, 4GB RAM = $30/mo
Savings: $15/mo
Risk: Medium (single point of failure)
```

**Option B: Partial Consolidation (Recommended)**
```
Studio (API + Workers): 1.5 vCPU, 3GB = $25/mo
Kong (if needed): 0.5 vCPU, 1GB = $10/mo
Total: 2 vCPU, 4GB = $35/mo
Savings: $10/mo
Risk: Low
```

**Option C: Cloudflare Workers (Advanced)**
```
Studio (static): Free (Cloudflare Pages)
API (serverless): $5/mo (Workers + D1)
Background jobs: $5/mo (Queues + Durable Objects)
Total: $10/mo
Savings: $35/mo
Risk: High (major rewrite required)
```

---

**3. Storage Strategy**

**Current:** Railway volumes (limited to 50GB)

**Optimized:** Hybrid approach

| Use Case | Storage | Cost (100GB + 500GB egress) |
|----------|---------|------------------------------|
| User uploads | Cloudflare R2 | $1.50/mo |
| Temporary files | Railway volumes | $0 (small) |
| Database backups | Backblaze B2 | $5.50/mo |
| **Total** | | **$7/mo vs $75/mo on Railway** |

**Savings:** $68/month (91%)

---

**4. Database Optimization**

**Current:**
```
Postgres: $5/mo (Railway managed)
Redis: $2/mo (Railway managed)
MongoDB: $5/mo (Railway managed)
Total: $12/mo
```

**Questions to answer:**
- Is MongoDB actually being used? (If no → -$5/mo)
- Can we use Postgres for everything? (Possibly -$7/mo)
- Is Redis sufficient for queues? (If yes → no MongoDB needed)

**Potential Optimization:**
```
Postgres: $5/mo (keep)
Redis: $2/mo (keep, expand usage)
MongoDB: $0/mo (remove if unused)
Total: $7/mo
Savings: $5/mo
```

---

**5. Database Connection Pooling**

**Problem:** Each Railway service maintains separate connections

**Current:**
```
Studio → Postgres: 10 connections
Kong → Postgres: 5 connections
Auth → Postgres: 5 connections
Workers → Postgres: 5 connections
Total: 25 connections
```

**Optimized:** Shared connection pool (PgBouncer pattern)

```typescript
// lib/database/pool.ts
export const pool = new Pool({
  max: 20,  // Down from 25
  min: 5,   // Keep warm connections
  idleTimeoutMillis: 30000,
});
```

**Benefit:** Reduces connection overhead, improves performance

---

### 8.3 Cost Projection

**Phase 1: Network Optimization (Month 1)**
```
Current: $46/mo
After:   $37/mo
Savings: $9/mo
```

**Phase 2: Service Consolidation (Month 2-3)**
```
Current: $37/mo
After:   $27/mo
Savings: $10/mo (cumulative $19/mo)
```

**Phase 3: Storage Migration (Month 3-4)**
```
Current: $27/mo
After:   $20/mo (if storage usage grows)
Savings: Variable, scales with usage
```

**Long-term Optimized State:**
```
Compute:        $25/mo (Studio monolith, 2 vCPU)
Databases:      $7/mo  (Postgres + Redis)
Network:        $2/mo  (minimal egress)
Storage:        $2/mo  (Cloudflare R2)
────────────────────────────────────────
Total:          $36/mo
Savings:        $10/mo vs current
                22% reduction
```

---

## 9. Monitoring & Observability

### 9.1 Appwrite's Monitoring Stack

**Built-in Monitoring:**
```php
// Usage statistics
_APP_USAGE_STATS=enabled
_APP_USAGE_AGGREGATION_INTERVAL=30

// Resource monitoring
_APP_STATS_RESOURCES_INTERVAL=30

// Logging
_APP_LOGGING_CONFIG=         # Optional external logging
_APP_LOGGING_PROVIDER=       # Sentry, LogTail, etc.
```

**Metrics Collected:**
- Request counts per endpoint
- Response times
- Database query performance
- Worker queue lengths
- Storage usage
- Function execution times

### 9.2 Railway Monitoring Strategy

**Built-in Metrics (Railway Dashboard):**
- CPU usage
- Memory usage
- Network egress
- Deployment status
- Build times

**Custom Metrics (Application-level):**

```typescript
// lib/monitoring/metrics.ts
export class MetricsCollector {
  async collectSystemMetrics() {
    return {
      cpu: process.cpuUsage(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }

  async collectDatabaseMetrics() {
    const result = await pool.query(`
      SELECT
        (SELECT count(*) FROM pg_stat_activity) as connections,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_queries,
        pg_database_size(current_database()) as database_size
    `);
    return result.rows[0];
  }

  async collectRedisMetrics() {
    const info = await redis.info();
    return {
      connected_clients: parseInt(info.match(/connected_clients:(\d+)/)?.[1] || '0'),
      used_memory: parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0'),
      total_commands: parseInt(info.match(/total_commands_processed:(\d+)/)?.[1] || '0'),
    };
  }

  async collectQueueMetrics() {
    const queues = ['webhooks', 'audit', 'cleanup'];
    const metrics = {};

    for (const queue of queues) {
      metrics[queue] = {
        pending: await redis.lLen(`queue:${queue}`),
        processing: await redis.lLen(`queue:${queue}:processing`),
        failed: await redis.lLen(`queue:${queue}:failed`),
      };
    }

    return metrics;
  }
}

// Export metrics endpoint
// pages/api/metrics.ts
export default async function handler(req, res) {
  const collector = new MetricsCollector();

  const metrics = {
    system: await collector.collectSystemMetrics(),
    database: await collector.collectDatabaseMetrics(),
    redis: await collector.collectRedisMetrics(),
    queues: await collector.collectQueueMetrics(),
  };

  res.status(200).json(metrics);
}
```

**External Monitoring (Recommended):**

```typescript
// lib/monitoring/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME,
  tracesSampleRate: 0.1, // 10% of requests

  integrations: [
    new Sentry.Integrations.Postgres(),
    new Sentry.Integrations.Redis(),
  ],
});

// Custom error tracking
export function trackError(error: Error, context?: any) {
  Sentry.captureException(error, {
    extra: context,
  });
}

// Performance monitoring
export function trackPerformance(operation: string, duration: number) {
  Sentry.captureMessage(`Performance: ${operation}`, {
    level: 'info',
    extra: { duration },
  });
}
```

**Logging Strategy:**

```typescript
// lib/logging/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
    }),
    err: pino.stdSerializers.err,
  },
});

// Usage
logger.info({ userId: 123 }, 'User logged in');
logger.error({ err: error }, 'Database connection failed');
logger.debug({ query: sql }, 'Executing query');
```

**Alerting (Railway + External):**

```bash
# Railway: Built-in alerts
# - Deployment failures
# - High CPU/memory usage
# - Service crashes

# Custom alerts (via external service)
# pages/api/alerts/check.ts
export default async function handler(req, res) {
  const health = await checkSystemHealth();

  if (!health.postgres) {
    await sendAlert('Database connection lost', 'critical');
  }

  if (health.queueBacklog > 1000) {
    await sendAlert('Queue backlog too high', 'warning');
  }

  res.status(200).json({ status: 'checked' });
}

// Call this endpoint via Railway cron (when available)
// or external service (UptimeRobot, Cronitor)
```

---

## 10. Security Considerations

### 10.1 Appwrite's Security Model

**Network Security:**
```yaml
# Isolated networks
networks:
  gateway:      # Only Traefik exposed
  appwrite:     # Internal services
  runtimes:     # Function isolation

# Environment-based secrets
environment:
  _APP_OPENSSL_KEY_V1:         # Encryption key
  _APP_EXECUTOR_SECRET:        # Worker authentication
  _APP_REDIS_PASS:             # Redis password (optional)
  _APP_DB_PASS:                # Database password
```

**Security Features:**
- Rate limiting (built into Traefik)
- CORS configuration
- API key management
- User permissions (RBAC)
- Encryption at rest (database)
- TLS termination (Traefik)

### 10.2 Railway Security Implementation

**1. Private Network (Priority 1)**

Already covered in Phase 1 - switches internal traffic from public to private network.

**Benefit:**
- ✅ Services unreachable from internet
- ✅ No need for service-level authentication
- ✅ Reduced attack surface

---

**2. Environment Secrets Management**

```bash
# Railway secrets (encrypted at rest)
railway variables set DATABASE_URL="postgres://..." --service studio
railway variables set REDIS_PASSWORD="..." --service studio
railway variables set SESSION_SECRET="..." --service studio
railway variables set NEXTAUTH_SECRET="..." --service studio

# Access in code
const dbUrl = process.env.DATABASE_URL;
```

**Best Practices:**
- ✅ Use Railway's secret management (not .env files)
- ✅ Rotate secrets regularly
- ✅ Use different secrets per environment
- ❌ Never commit secrets to git
- ❌ Never log secret values

---

**3. API Authentication**

```typescript
// lib/auth/middleware.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { verify } from 'jsonwebtoken';

export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verify(token, process.env.NEXTAUTH_SECRET!);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// pages/api/protected.ts
export default async function handler(req, res) {
  await requireAuth(req, res, async () => {
    // Protected logic
    res.json({ data: 'sensitive' });
  });
}
```

---

**4. Rate Limiting**

```typescript
// lib/ratelimit/limiter.ts
import { redis } from '@/lib/cache/redis';

export class RateLimiter {
  async checkLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<boolean> {
    const current = await redis.incr(`ratelimit:${key}`);

    if (current === 1) {
      await redis.expire(`ratelimit:${key}`, windowSeconds);
    }

    return current <= maxRequests;
  }
}

// Middleware
export async function rateLimit(req, res, next) {
  const limiter = new RateLimiter();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const allowed = await limiter.checkLimit(
    `api:${ip}`,
    100,  // 100 requests
    60    // per minute
  );

  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}
```

---

**5. Input Validation**

```typescript
// lib/validation/schemas.ts
import { z } from 'zod';

export const CreateDatabaseSchema = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
});

// pages/api/databases.ts
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const body = CreateDatabaseSchema.parse(req.body);
      // Body is now type-safe and validated

      const result = await createDatabase(body);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }
  }
}
```

---

**6. SQL Injection Prevention**

```typescript
// ❌ NEVER do this
const userId = req.query.id;
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ ALWAYS use parameterized queries
const userId = req.query.id;
const query = 'SELECT * FROM users WHERE id = $1';
const result = await pool.query(query, [userId]);

// ✅ Or use an ORM
import { eq } from 'drizzle-orm';
const user = await db.select().from(users).where(eq(users.id, userId));
```

---

**7. CORS Configuration**

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGINS || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};
```

---

**8. Security Headers**

```typescript
// middleware.ts
import { NextResponse } from 'next/server';

export function middleware(request: Request) {
  const response = NextResponse.next();

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );

  return response;
}
```

---

**9. Audit Logging**

```typescript
// lib/audit/logger.ts
export async function logAuditEvent(event: {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  await pool.query(
    `INSERT INTO audit_logs
     (user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.userId,
      event.action,
      event.resourceType,
      event.resourceId,
      JSON.stringify(event.metadata),
      event.ipAddress,
      event.userAgent,
    ]
  );
}

// Usage in API endpoints
await logAuditEvent({
  userId: req.user.id,
  action: 'database.delete',
  resourceType: 'database',
  resourceId: databaseId,
  ipAddress: req.headers['x-forwarded-for'],
  userAgent: req.headers['user-agent'],
});
```

---

## 11. Deployment Strategy

### 11.1 Current Deployment Flow

```bash
# Current (manual)
git push origin main
# Railway auto-deploys from GitHub

# Issues:
# - No pre-deployment checks
# - No rollback strategy
# - No staging environment
```

### 11.2 Recommended Deployment Flow

**GitHub Actions CI/CD:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: pnpm install

      - name: Run type check
        run: pnpm type-check

      - name: Run linter
        run: pnpm lint

      - name: Run tests
        run: pnpm test

      - name: Build
        run: pnpm build

  deploy-staging:
    needs: test
    if: github.ref != 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to staging
        run: railway up --service studio --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to production
        run: railway up --service studio --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Run smoke tests
        run: |
          sleep 30  # Wait for deployment
          curl -f https://studio-production-cfcd.up.railway.app/api/health
```

**Rollback Strategy:**

```bash
# View recent deployments
railway deployments --service studio

# Rollback to previous deployment
railway rollback --deployment <deployment-id>

# Or redeploy from specific commit
git revert HEAD
git push origin main  # Railway auto-deploys
```

---

## 12. Success Metrics & KPIs

### 12.1 Performance Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| API Response Time (p95) | Unknown | < 200ms | `/api/metrics` |
| Database Query Time (p95) | Unknown | < 50ms | Postgres logs |
| Worker Queue Processing | N/A | < 10s | Queue metrics |
| Uptime | Unknown | > 99.9% | Railway metrics |
| Error Rate | Unknown | < 0.1% | Sentry |

### 12.2 Cost Metrics

| Metric | Current | Target | Savings |
|--------|---------|--------|---------|
| Network Egress | $11/mo | $2/mo | $9/mo (82%) |
| Compute Costs | $45/mo | $30/mo | $15/mo (33%) |
| Storage Costs | $0 | $2/mo | -$2/mo |
| **Total** | **$46/mo** | **$32/mo** | **$14/mo (30%)** |

### 12.3 Operational Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Deployment Frequency | Manual | Daily (automated) |
| Mean Time to Recovery | Unknown | < 15 minutes |
| Change Failure Rate | Unknown | < 5% |
| Lead Time for Changes | Unknown | < 1 hour |

---

## 13. Risks & Mitigation

### 13.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Private network DNS issues | High | Low | Test thoroughly, keep public URLs as fallback |
| Worker memory leaks | Medium | Medium | Implement memory monitoring, auto-restart |
| Database connection exhaustion | High | Low | Connection pooling, monitoring |
| Redis queue overflow | Medium | Low | Queue size limits, dead letter queue |
| Service dependency failure | High | Low | Circuit breakers, retries, fallbacks |

### 13.2 Operational Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Deployment failure | High | Medium | Automated rollback, staging environment |
| Data loss during migration | High | Low | Backups before changes, dry runs |
| Cost overrun | Medium | Low | Budget alerts, usage monitoring |
| Knowledge loss | Medium | Medium | Documentation (this guide) |

---

## 14. Next Steps & Action Items

### Immediate (Week 1)
- [ ] Implement private network migration (Phase 1)
- [ ] Update Studio to use `postgres.railway.internal`
- [ ] Update Studio to use `redis.railway.internal`
- [ ] Test and monitor for 48 hours
- [ ] Verify egress cost reduction

### Short-term (Weeks 2-4)
- [ ] Implement worker infrastructure (Phase 2)
- [ ] Add webhook delivery worker
- [ ] Add audit logging worker
- [ ] Add scheduled cleanup jobs
- [ ] Deploy monitoring/metrics endpoints

### Medium-term (Month 2)
- [ ] Audit Kong, Auth, Postgres Meta services
- [ ] Decide on service consolidation strategy
- [ ] Implement graceful shutdown handling
- [ ] Add health check endpoints
- [ ] Set up external monitoring (Sentry)

### Long-term (Month 3+)
- [ ] Evaluate storage migration to Cloudflare R2
- [ ] Implement horizontal scaling preparation
- [ ] Set up CI/CD pipeline
- [ ] Create staging environment
- [ ] Document runbooks for common operations

---

## 15. Conclusion

Appwrite's architecture provides a solid blueprint for building a scalable, production-ready backend platform. Key takeaways for Ogel Deploy:

**✅ What we can adopt:**
1. **Worker-based background processing** - Highly Railway-compatible via Redis queues
2. **Centralized configuration** - Environment-based service discovery
3. **Volume-based storage** - But migrate to external S3-compatible storage (R2)
4. **Multiple entrypoints pattern** - Single codebase, different execution modes
5. **Redis for everything** - Cache, queues, pub/sub, rate limiting

**🔄 What we need to adapt:**
1. **Network model** - Docker Compose networks → Railway private network
2. **Service discovery** - Container names → `*.railway.internal` DNS
3. **Worker deployment** - Separate containers → Embedded or separate Railway services
4. **Storage strategy** - Local volumes → Cloudflare R2 for cost
5. **Scaling approach** - Docker replicas → Railway service replicas

**❌ What we should avoid:**
1. **Over-provisioning workers** - Start with embedded workers, scale only when needed
2. **Local storage for production** - Use external S3-compatible storage
3. **Public URLs for internal traffic** - Use private network (saves $9/month)
4. **Complex orchestration** - Keep it simple until scale demands complexity

**📊 Expected Outcomes:**
- **Cost:** $32-36/month optimized (30% reduction)
- **Performance:** < 200ms API response times (p95)
- **Reliability:** > 99.9% uptime
- **Scalability:** Ready for horizontal scaling when needed

**🎯 Success Criteria:**
- ✅ All services communicate via private network
- ✅ Background jobs processing (webhooks, audit, cleanup)
- ✅ Monitoring and alerting in place
- ✅ Cost reduced by 30%+
- ✅ Deployment automated via CI/CD
- ✅ Documentation complete (you're reading it!)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-22
**Author:** Hassan Malik, Multi-Cloud Infrastructure Architect
**Based on:** Appwrite v1.6.x architecture analysis
**Status:** Ready for Phase 1 implementation

---

## Appendix A: Useful Commands

```bash
# Railway CLI
railway login
railway link
railway status
railway variables --service studio
railway logs --service studio --follow
railway up --service studio

# Database
psql $DATABASE_URL -c "SELECT version();"
psql $DATABASE_URL -f database/migrations/schema.sql

# Redis
redis-cli -h redis.railway.internal -p 6379 PING
redis-cli -h redis.railway.internal -p 6379 INFO

# Monitoring
curl https://studio-production-cfcd.up.railway.app/api/health
curl https://studio-production-cfcd.up.railway.app/api/metrics

# Testing private network
railway run --service studio node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ host: 'postgres.railway.internal', port: 5432 });
  pool.query('SELECT 1').then(() => console.log('✅ Connected'));
"
```

## Appendix B: Environment Variables Reference

```bash
# Postgres (Private Network)
POSTGRES_HOST=postgres.railway.internal
POSTGRES_PORT=5432
POSTGRES_DATABASE=railway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<secret>

# Redis (Private Network)
REDIS_INTERNAL_URL=redis://redis.railway.internal:6379
REDIS_PASSWORD=<optional>

# MongoDB (Private Network)
MONGODB_INTERNAL_URL=mongodb://mongodb.railway.internal:27017
MONGODB_DATABASE=ogel

# Application
NODE_ENV=production
PORT=3000
SESSION_SECRET=<secret>
NEXTAUTH_SECRET=<secret>

# Public URLs (Browser)
NEXT_PUBLIC_API_URL=https://studio-production-cfcd.up.railway.app
NEXT_PUBLIC_SITE_URL=https://studio-production-cfcd.up.railway.app

# Storage
STORAGE_BACKEND=r2
S3_ACCESS_KEY=<secret>
S3_SECRET_KEY=<secret>
S3_BUCKET=ogel-storage
S3_REGION=auto
S3_ENDPOINT=https://xxxx.r2.cloudflarestorage.com

# Monitoring
SENTRY_DSN=<secret>
LOG_LEVEL=info
```

## Appendix C: Related Documentation

- **RAILWAY-PRIVATE-NETWORK-QUICK-START.md** - Step-by-step migration guide
- **RAILWAY-PRIVATE-NETWORK-OPTIMIZATION.md** - Detailed network optimization
- **RAILWAY-PRIVATE-NETWORK-SUMMARY.md** - Executive summary of network changes
- **PLATFORM_ENDPOINTS_COMPLETE.md** - Current API endpoints
- **RAILWAY_CONFIG_COMPLETE.md** - Railway configuration status

---

**End of Infrastructure Strategy Document**
