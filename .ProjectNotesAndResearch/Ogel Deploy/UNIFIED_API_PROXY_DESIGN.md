# Unified API Proxy Design for Ogel Deploy Integration

**Date**: 2025-11-22
**Status**: Design Phase
**Pattern**: API Gateway with Service Proxying

---

## Overview

The unified API will act as a **single entry point** for all platform operations, intelligently routing requests to the appropriate backend service (Studio backend, Ogel Ghost, etc.) while maintaining a consistent interface.

---

## Architecture Pattern

```
Client (Studio UI, CLI, SDK)
         ↓
    Unified API
    (api.ogel.com)
         ↓
    ┌────┴────┐
    ↓         ↓
PostgreSQL   Ogel Ghost
(Studio)     (Deployments)
```

---

## API Structure

### Namespace Design

```
/api/v2/
├── auth/*              → Studio backend (PostgreSQL)
├── organizations/*     → Studio backend (PostgreSQL)
├── projects/*          → Studio backend (PostgreSQL)
├── users/*             → Studio backend (PostgreSQL)
├── billing/*           → Studio backend (PostgreSQL)
│
├── deployments/*       → Proxy to Ogel Ghost
├── sites/*             → Proxy to Ogel Ghost
├── builds/*            → Proxy to Ogel Ghost
├── domains/*           → Proxy to Ogel Ghost
│
└── databases/*         → Hybrid (metadata from Studio, operations via Ogel Ghost)
```

### Routing Logic

```typescript
// apps/studio/pages/api/v2/[...path].ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = req.query.path as string[];
  const resource = path[0]; // First segment

  // Route based on resource type
  switch (resource) {
    case 'auth':
    case 'organizations':
    case 'projects':
    case 'users':
    case 'billing':
      // Handle directly with Studio backend
      return handleStudioBackend(req, res);

    case 'deployments':
    case 'sites':
    case 'builds':
    case 'domains':
      // Proxy to Ogel Ghost
      return proxyToOgelGhost(req, res);

    case 'databases':
      // Hybrid: Check if project uses Ogel Ghost
      return handleHybrid(req, res);

    default:
      return res.status(404).json({ error: 'Resource not found' });
  }
}
```

---

## Proxy Implementation

### HTTP Client Setup

```typescript
// lib/api/ogel-ghost-client.ts

import { createClient } from '@hey-api/client-fetch';

export const ogelGhostClient = createClient({
  baseUrl: process.env.OGEL_GHOST_API_URL || 'http://ogel-ghost.railway.internal',
  headers: {
    'X-Appwrite-Project': 'console', // System project
    'X-Appwrite-Key': process.env.OGEL_GHOST_API_KEY,
  },
});

export async function proxyRequest(req: NextApiRequest, targetPath: string) {
  const { method, body, headers } = req;

  // Forward request to Ogel Ghost
  const response = await ogelGhostClient.request({
    method,
    url: targetPath,
    headers: {
      ...headers,
      // Add authentication from Studio session
      'X-Appwrite-JWT': await getOgelGhostJWT(req),
    },
    body: method !== 'GET' ? body : undefined,
  });

  return response;
}
```

### Authentication Bridge

```typescript
// lib/api/auth-bridge.ts

/**
 * Converts Studio session to Ogel Ghost JWT
 */
export async function getOgelGhostJWT(req: NextApiRequest): Promise<string> {
  // 1. Get Studio session
  const session = await getServerSession(req, authOptions);
  if (!session) throw new Error('Unauthorized');

  // 2. Check if user has Ogel Ghost account
  let ogelUserId = await getOgelGhostUserId(session.user.id);

  if (!ogelUserId) {
    // 3. Auto-create Ogel Ghost account if needed
    ogelUserId = await createOgelGhostUser({
      email: session.user.email,
      name: session.user.name,
      studioUserId: session.user.id,
    });
  }

  // 4. Generate JWT for Ogel Ghost
  const jwt = await ogelGhostClient.request({
    method: 'POST',
    url: '/v1/account/sessions/jwt',
    body: {
      userId: ogelUserId,
    },
  });

  return jwt.jwt;
}
```

---

## API Endpoints

### Deployments

```typescript
// POST /api/v2/deployments
{
  projectId: "proj_123",
  repoUrl: "https://github.com/user/my-app",
  branch: "main",
  framework: "nextjs" // optional, auto-detected
}

// Implementation
async function createDeployment(req, res) {
  // 1. Validate user owns project (Studio DB)
  const project = await db.projects.findUnique({
    where: { id: req.body.projectId, userId: req.session.user.id }
  });

  if (!project) return res.status(404).json({ error: 'Project not found' });

  // 2. Get or create Ogel Ghost project
  let ogelProject = project.ogelGhostProjectId;

  if (!ogelProject) {
    // Create project in Ogel Ghost
    const response = await ogelGhostClient.request({
      method: 'POST',
      url: '/v1/projects',
      body: {
        projectId: project.id,
        name: project.name,
        region: 'default',
      },
    });

    ogelProject = response.$id;

    // Store mapping in Studio DB
    await db.projects.update({
      where: { id: project.id },
      data: { ogelGhostProjectId: ogelProject },
    });
  }

  // 3. Create deployment in Ogel Ghost
  const deployment = await ogelGhostClient.request({
    method: 'POST',
    url: `/v1/projects/${ogelProject}/deployments`,
    body: {
      repoUrl: req.body.repoUrl,
      branch: req.body.branch,
      framework: req.body.framework,
    },
  });

  // 4. Store deployment record in Studio DB
  await db.deployments.create({
    data: {
      projectId: project.id,
      ogelDeploymentId: deployment.$id,
      repoUrl: req.body.repoUrl,
      branch: req.body.branch,
      status: 'pending',
    },
  });

  return res.json(deployment);
}
```

### Build Status (WebSocket Proxy)

```typescript
// GET /api/v2/builds/:id/logs (WebSocket upgrade)

import { WebSocketServer } from 'ws';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET' && req.headers.upgrade === 'websocket') {
    // Upgrade to WebSocket
    const ws = upgradeToWebSocket(req, res);

    // Connect to Ogel Ghost WebSocket
    const ogelWs = new WebSocket(`ws://ogel-ghost.railway.internal/v1/realtime`);

    // Subscribe to build events
    ogelWs.send(JSON.stringify({
      type: 'subscribe',
      channels: [`builds.${req.query.id}.logs`],
    }));

    // Forward messages
    ogelWs.on('message', (data) => {
      ws.send(data);
    });

    ws.on('close', () => {
      ogelWs.close();
    });
  }
}
```

### List Deployments (Hybrid Query)

```typescript
// GET /api/v2/projects/:id/deployments

async function listDeployments(req, res) {
  const { id: projectId } = req.query;

  // 1. Get project from Studio DB (verify ownership)
  const project = await db.projects.findUnique({
    where: { id: projectId, userId: req.session.user.id }
  });

  if (!project?.ogelGhostProjectId) {
    return res.json({ deployments: [] });
  }

  // 2. Fetch deployments from Ogel Ghost
  const deployments = await ogelGhostClient.request({
    method: 'GET',
    url: `/v1/projects/${project.ogelGhostProjectId}/deployments`,
  });

  // 3. Enrich with Studio metadata
  const enriched = await Promise.all(
    deployments.documents.map(async (deployment) => {
      const metadata = await db.deployments.findUnique({
        where: { ogelDeploymentId: deployment.$id },
      });

      return {
        ...deployment,
        createdBy: metadata?.createdBy,
        tags: metadata?.tags,
      };
    })
  );

  return res.json({ deployments: enriched });
}
```

---

## Database Schema

### Studio PostgreSQL

```sql
-- New table: Ogel Ghost project mapping
CREATE TABLE platform.ogel_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  ogel_project_id VARCHAR(255) NOT NULL, -- Appwrite project ID
  ogel_api_key TEXT NOT NULL,             -- Encrypted API key
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(project_id),
  UNIQUE(ogel_project_id)
);

-- New table: Deployment tracking
CREATE TABLE platform.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  ogel_deployment_id VARCHAR(255) NOT NULL, -- Appwrite deployment ID
  repo_url TEXT NOT NULL,
  branch VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(40),
  status VARCHAR(50) NOT NULL, -- pending, building, success, failed
  preview_url TEXT,
  created_by UUID REFERENCES platform.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(ogel_deployment_id)
);

CREATE INDEX idx_deployments_project ON platform.deployments(project_id);
CREATE INDEX idx_deployments_status ON platform.deployments(status);
```

---

## Error Handling

### Proxy Error Translation

```typescript
// lib/api/error-handler.ts

export function translateOgelGhostError(error: OgelGhostError) {
  // Map Appwrite errors to Studio error format
  const errorMap = {
    'user_unauthorized': { code: 'UNAUTHORIZED', status: 401 },
    'project_not_found': { code: 'NOT_FOUND', status: 404 },
    'deployment_failed': { code: 'DEPLOYMENT_FAILED', status: 500 },
  };

  const mapped = errorMap[error.type] || { code: 'INTERNAL_ERROR', status: 500 };

  return {
    error: {
      code: mapped.code,
      message: error.message,
      details: error.details,
    },
  };
}
```

### Retry Logic

```typescript
// lib/api/retry.ts

export async function proxyWithRetry(
  request: () => Promise<Response>,
  maxRetries = 3
) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await request();
    } catch (error) {
      lastError = error;

      // Don't retry client errors
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 2 ** i * 1000));
    }
  }

  throw lastError;
}
```

---

## Caching Strategy

### Cache Layer

```typescript
// lib/api/cache.ts

import Redis from 'ioredis';

const cacheRedis = new Redis({
  host: 'redis.railway.internal',
  db: 4, // API cache
});

export async function cachedProxyRequest(
  key: string,
  request: () => Promise<any>,
  ttl = 60
) {
  // Check cache
  const cached = await cacheRedis.get(key);
  if (cached) return JSON.parse(cached);

  // Make request
  const result = await request();

  // Cache result
  await cacheRedis.setex(key, ttl, JSON.stringify(result));

  return result;
}
```

### Cache Invalidation

```typescript
// Webhook handler for Ogel Ghost events
export async function handleOgelGhostWebhook(req, res) {
  const event = req.body;

  switch (event.type) {
    case 'deployment.created':
    case 'deployment.updated':
      // Invalidate deployment cache
      await cacheRedis.del(`deployments:${event.projectId}`);
      break;

    case 'build.completed':
      // Invalidate build cache
      await cacheRedis.del(`builds:${event.deploymentId}`);
      break;
  }

  res.json({ received: true });
}
```

---

## Rate Limiting

### Per-User Limits

```typescript
// middleware/rate-limit.ts

import { Ratelimit } from '@upstash/ratelimit';
import Redis from 'ioredis';

const rateLimitRedis = new Redis({
  host: 'redis.railway.internal',
  db: 5, // Rate limiting
});

const ratelimit = new Ratelimit({
  redis: rateLimitRedis,
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
});

export async function rateLimitMiddleware(req, res, next) {
  const userId = req.session?.user?.id;
  if (!userId) return next();

  const { success, remaining } = await ratelimit.limit(userId);

  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!success) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}
```

---

## Monitoring & Observability

### Request Tracing

```typescript
// lib/api/tracing.ts

export function createProxyTrace(req: NextApiRequest) {
  const traceId = crypto.randomUUID();

  return {
    traceId,
    timestamp: Date.now(),
    method: req.method,
    path: req.url,
    userId: req.session?.user?.id,

    log(message: string, data?: any) {
      console.log(JSON.stringify({
        traceId: this.traceId,
        timestamp: Date.now(),
        message,
        data,
      }));
    },

    logError(error: Error) {
      console.error(JSON.stringify({
        traceId: this.traceId,
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack,
      }));
    },
  };
}
```

### Metrics Collection

```typescript
// lib/api/metrics.ts

export class ProxyMetrics {
  private static redis = new Redis({
    host: 'redis.railway.internal',
    db: 6, // Metrics
  });

  static async recordRequest(resource: string, duration: number, status: number) {
    const key = `metrics:proxy:${resource}:${new Date().toISOString().split('T')[0]}`;

    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrby(key, `status_${status}`, 1);
    await this.redis.hincrbyfloat(key, 'total_duration', duration);

    // Expire after 30 days
    await this.redis.expire(key, 60 * 60 * 24 * 30);
  }

  static async getMetrics(resource: string, date: string) {
    const key = `metrics:proxy:${resource}:${date}`;
    return await this.redis.hgetall(key);
  }
}
```

---

## API Client SDK (Future)

### TypeScript SDK

```typescript
// @ogel/sdk

import { OgelClient } from '@ogel/sdk';

const ogel = new OgelClient({
  apiKey: process.env.OGEL_API_KEY,
  endpoint: 'https://api.ogel.com',
});

// Deployments
const deployment = await ogel.deployments.create({
  projectId: 'proj_123',
  repoUrl: 'https://github.com/user/app',
  branch: 'main',
});

// Stream build logs
const stream = ogel.builds.streamLogs(deployment.buildId);
stream.on('log', (line) => console.log(line));

// List deployments
const deployments = await ogel.deployments.list({
  projectId: 'proj_123',
  limit: 10,
});
```

---

## Migration Path

### Phase 1: Direct Backend Calls (Current)
```
Studio UI → Studio Backend → PostgreSQL
```

### Phase 2: Unified API (Next)
```
Studio UI → Unified API → Studio Backend → PostgreSQL
```

### Phase 3: With Ogel Ghost (Future)
```
Studio UI → Unified API → ┬→ Studio Backend → PostgreSQL
                          └→ Ogel Ghost → MariaDB
```

### Phase 4: External Clients (Future)
```
CLI/SDK → Unified API → ┬→ Studio Backend
                        └→ Ogel Ghost
```

---

## Benefits

### For Users
✅ **Single endpoint** - One API for everything
✅ **Consistent auth** - One login, all services
✅ **Unified errors** - Consistent error format
✅ **Better DX** - No service juggling

### For Development
✅ **Service abstraction** - Swap backends without breaking clients
✅ **Gradual migration** - Add features without rewriting everything
✅ **Version control** - API versioning (/v2, /v3)
✅ **Feature flags** - Enable/disable features per user

### For Operations
✅ **Centralized monitoring** - One place to track all requests
✅ **Rate limiting** - Protect all services equally
✅ **Caching** - Reduce load on backends
✅ **A/B testing** - Route different users to different backends

---

## Next Steps

1. **Implement base proxy handler** (this week)
2. **Add authentication bridge** (next week)
3. **Create deployment endpoints** (when Ogel Ghost deploys)
4. **Build WebSocket proxy** (for real-time logs)
5. **Generate TypeScript SDK** (future)

---

**Status**: Design complete, ready for implementation
**Blocker**: None (can implement base proxy now)
**Risk**: Low (backwards compatible with existing API)

---

**Document maintained by**: Dylan Torres (TPM)
**Last updated**: 2025-11-22
