# Railway Serverless Postgres Architecture
## Simplified Serverless Database Using Railway Native Capabilities + Neon Components

**Document Version**: 1.0
**Date**: November 21, 2025
**Architecture Type**: Hybrid Railway-Native + Adapted Neon Components

---

## Executive Summary

This architecture defines "Railway Serverless Postgres" - a simplified serverless database platform that leverages Railway's managed infrastructure with carefully selected Neon components. Unlike full Neon replication, we focus on **pragmatic serverless features** that deliver 80% of value with 20% of complexity.

**Core Principle**: Use Railway's strengths (managed Postgres, volumes, private networking) and add **only** the serverless layers that matter (connection pooling, scale-to-zero, branching).

---

## 1. Service Topology: What Runs Where

### Railway Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Railway Project Environment              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐      ┌─────────────────────────┐    │
│  │  Proxy Service   │      │  PostgreSQL Service     │    │
│  │  (Neon-inspired) │─────▶│  (Railway Managed)      │    │
│  │  - Connection    │  IPv6 │  - Primary Database     │    │
│  │    Pooling       │ Private│  - Volume-backed       │    │
│  │  - Auth Layer    │Network │  - Auto-snapshots      │    │
│  │  - Scale Control │      │  - Railway replicas     │    │
│  └────────┬─────────┘      └───────────┬─────────────┘    │
│           │                            │                   │
│           │ Public                     │ Backup            │
│           │ Endpoint                   │ Stream            │
│           │                            │                   │
│  ┌────────▼─────────┐      ┌───────────▼─────────────┐    │
│  │  Control Plane   │      │  Backup Service         │    │
│  │  API Service     │      │  (Go + pg_basebackup)   │    │
│  │  - Database CRUD │      │  - Continuous WAL       │    │
│  │  - User Management│     │  - Cloudflare R2 upload │    │
│  │  - Metrics       │      │  - Point-in-time        │    │
│  └──────────────────┘      └─────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Backup Upload
                              ▼
                    ┌──────────────────┐
                    │  Cloudflare R2   │
                    │  - WAL Archives  │
                    │  - Base Backups  │
                    │  - 30-day Policy │
                    └──────────────────┘
```

### Service Breakdown

| Service | Technology | Purpose | Railway Component |
|---------|-----------|---------|-------------------|
| **PostgreSQL Core** | Railway Postgres 17 | Primary database | Managed Service + Volume |
| **Proxy Service** | Neon Proxy (forked) | Connection pooling, scale control | Custom Service |
| **Control Plane API** | Next.js API Routes | User-facing database management | Custom Service |
| **Backup Service** | Go + pg_basebackup | Continuous backup to R2 | Custom Service |
| **Read Replicas** | Railway Replicas (alpha) | Read scaling | Managed Service |

---

## 2. Component Analysis: Fork vs Build

### ✅ Fork from Neon (Adapt & Simplify)

#### A. **Proxy Service** (Priority: HIGH)
- **Source**: `neondatabase/neon/proxy`
- **Why**: Proven connection pooling + scale-to-zero logic
- **Adaptations**:
  - Remove Pageserver integration (not needed)
  - Replace Safekeeper coordination with direct Railway Postgres connection
  - Keep: Authentication, connection pooling, compute wake-up logic
  - Add: Railway private networking integration (`.railway.internal` DNS)

**Simplified Architecture**:
```rust
// Neon Proxy → Railway Proxy Adaptation
// proxy/src/main.rs (simplified)

struct RailwayProxy {
    pool: PgBouncerPool,           // Keep from Neon
    auth: NeonAuth,                // Keep from Neon
    compute_ctl: RailwayComputeCtl, // NEW: Replace Neon compute
    metrics: PrometheusMetrics,    // Keep from Neon
}

impl RailwayComputeCtl {
    // Replace Neon's compute start with Railway API call
    async fn wake_compute(&self, project_id: &str) -> Result<()> {
        // Call Railway API to unpause service
        self.railway_api
            .post(format!("/projects/{}/services/postgres/unpause"))
            .await?;

        // Wait for health check
        self.wait_for_postgres_ready().await
    }
}
```

**Deployment**: Railway service with public endpoint, connects to Postgres via `.railway.internal`

---

#### B. **Compute Control Logic** (Priority: MEDIUM)
- **Source**: Neon's `compute_ctl` (scale-to-zero coordinator)
- **Why**: Handles idle detection and compute lifecycle
- **Adaptations**:
  - Replace Kubernetes orchestration with Railway API calls
  - Use Railway's service pause/unpause instead of pod scaling
  - Keep: Idle timeout logic, graceful shutdown

**Simplified Implementation**:
```go
// compute-controller/main.go
package main

type ComputeController struct {
    railwayAPI  *railway.Client
    idleTimeout time.Duration
    metrics     *prometheus.Registry
}

func (c *ComputeController) MonitorIdleConnections() {
    ticker := time.NewTicker(30 * time.Second)
    for range ticker.C {
        activeConns := c.getActiveConnectionCount()

        if activeConns == 0 {
            c.idleTimer += 30 * time.Second

            // Scale to zero after 5 minutes idle
            if c.idleTimer >= 5*time.Minute {
                c.railwayAPI.PauseService(c.postgresServiceID)
            }
        } else {
            c.idleTimer = 0
        }
    }
}
```

---

### 🏗️ Build Fresh (Railway-Native)

#### A. **Control Plane API** (Priority: HIGH)
- **Technology**: Next.js API routes (already in Studio)
- **Why**: Custom business logic, Railway-specific integrations
- **Features**:
  - Database creation/deletion via Railway API
  - User management (leverages existing auth)
  - Connection string generation
  - Metrics aggregation

**API Design**:
```typescript
// apps/studio/pages/api/serverless/databases/index.ts

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { name, region, plan } = req.body;

    // 1. Create Railway Postgres service
    const dbService = await railway.createPostgresService({
      name: `${name}-db`,
      region: region,
      plan: plan, // hobby, pro, etc.
    });

    // 2. Create proxy service
    const proxyService = await railway.createService({
      name: `${name}-proxy`,
      image: 'ghcr.io/yourorg/railway-proxy:latest',
      env: {
        DATABASE_URL: dbService.privateUrl,
        IDLE_TIMEOUT: '5m',
      },
    });

    // 3. Return connection details
    return res.json({
      id: dbService.id,
      connectionString: proxyService.publicUrl,
      privateUrl: dbService.privateUrl,
      status: 'provisioning',
    });
  }
}
```

---

#### B. **Backup Service** (Priority: HIGH)
- **Technology**: Go + `pg_basebackup` + Cloudflare R2 SDK
- **Why**: Railway doesn't have built-in R2 integration
- **Features**:
  - Continuous WAL archiving
  - Scheduled base backups (daily)
  - Point-in-time recovery metadata
  - 30-day retention policy

**Implementation**:
```go
// backup-service/main.go
package main

import (
    "github.com/aws/aws-sdk-go-v2/service/s3"
    "github.com/jackc/pgx/v5"
)

type BackupService struct {
    r2Client    *s3.Client
    pgConnPool  *pgx.ConnPool
    walArchiver *WALArchiver
}

func (b *BackupService) RunContinuousWALArchive() {
    // Stream WAL segments to R2 in real-time
    walStream := b.pgConnPool.StreamWAL()

    for walSegment := range walStream {
        b.r2Client.PutObject(&s3.PutObjectInput{
            Bucket: "railway-postgres-backups",
            Key:    fmt.Sprintf("wal/%s/%s", b.projectID, walSegment.Name),
            Body:   walSegment.Data,
        })
    }
}

func (b *BackupService) CreateBaseBackup() error {
    // Use pg_basebackup for full database snapshot
    cmd := exec.Command("pg_basebackup",
        "-h", b.postgresHost,
        "-D", "/tmp/backup",
        "-Ft", "-z", "-P",
    )

    output, err := cmd.Output()
    if err != nil {
        return err
    }

    // Upload to R2
    return b.uploadToR2("/tmp/backup")
}
```

---

#### C. **Branching System** (Priority: MEDIUM)
- **Technology**: Railway Templates + Postgres PITR
- **Why**: Neon's Pageserver branching is too complex; use simpler approach
- **Strategy**:
  1. Create new Railway environment
  2. Restore from R2 backup to specific point-in-time
  3. Link to parent database metadata

**Simplified Flow**:
```typescript
// POST /api/serverless/databases/:id/branch
async function createBranch(parentDbId: string, branchName: string) {
  // 1. Find latest backup before branch point
  const backup = await findBackupAtTimestamp(parentDbId, new Date());

  // 2. Create new Railway service from backup
  const branchDb = await railway.createPostgresService({
    name: `${parentDbId}-${branchName}`,
    restoreFrom: {
      r2Bucket: 'railway-postgres-backups',
      backupKey: backup.key,
      walLogs: backup.walSegments,
    },
  });

  // 3. Apply WAL logs up to branch point
  await applyWALUntilTimestamp(branchDb, branchPoint);

  return branchDb;
}
```

---

### ❌ Skip Entirely (Over-Engineering)

1. **Pageserver**: Railway Postgres + R2 backups replace this
2. **Safekeepers**: Railway's managed Postgres handles WAL durability
3. **Storage Broker**: Not needed with Railway's private networking
4. **Custom Storage Engine**: Use standard Postgres storage

---

## 3. Cold Start & Scaling Strategy

### Scale-to-Zero Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Client connects to proxy.railway.app                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  Proxy Service  │ (Always running, minimal cost)
         └────────┬────────┘
                  │
                  │ Check: Is Postgres running?
                  ▼
            ┌─────────┐
            │  No?    │
            └────┬────┘
                 │
                 │ 1. Call Railway API: Unpause Service
                 │ 2. Wait for health check (5-10s)
                 │ 3. Establish connection pool
                 ▼
         ┌──────────────┐
         │  PostgreSQL  │ (Wakes from paused state)
         └──────────────┘
```

### Scaling Dimensions

| Scenario | Strategy | Railway Component | Cost Impact |
|----------|----------|-------------------|-------------|
| **Zero Load** | Pause Postgres after 5min idle | Service pause | $0/month |
| **Low Load** | Keep Postgres running, pool connections | Proxy pooling | ~$5/month |
| **Read-Heavy** | Add read replicas | Railway replicas (alpha) | +$5/replica |
| **Write-Heavy** | Vertical scaling | Increase service plan | Pro: $20/month |

### Cold Start Performance

| Component | Cold Start Time | Warm State |
|-----------|----------------|------------|
| Proxy Service | 0ms (always warm) | Always running |
| Postgres Wake | 5-10 seconds | Railway service unpause |
| Connection Pool | 1-2 seconds | PgBouncer pool init |
| **Total Cold Start** | **6-12 seconds** | First query after idle |

**Optimization**: Pre-warm connections during proxy health checks to reduce perceived latency.

---

## 4. User-Facing API Design

### REST API Endpoints

```typescript
// Base URL: https://studio.railway.app/api/serverless

// Database Management
POST   /databases                    // Create new serverless database
GET    /databases                    // List user's databases
GET    /databases/:id                // Get database details
PATCH  /databases/:id                // Update config (scale, region)
DELETE /databases/:id                // Delete database

// Branching
POST   /databases/:id/branches       // Create branch from parent
GET    /databases/:id/branches       // List branches
DELETE /databases/:id/branches/:name // Delete branch

// Connection Management
GET    /databases/:id/connection     // Get connection strings
POST   /databases/:id/connection/rotate // Rotate credentials

// Backups
GET    /databases/:id/backups        // List available backups
POST   /databases/:id/backups/restore // Restore from backup

// Metrics
GET    /databases/:id/metrics        // Get usage stats
GET    /databases/:id/usage          // Get cost breakdown
```

### Example API Response

```json
{
  "id": "db_abc123",
  "name": "production-api",
  "status": "active",
  "region": "us-west-2",
  "plan": "pro",
  "connection": {
    "host": "production-api-proxy.railway.app",
    "port": 5432,
    "database": "postgres",
    "pooled": "postgresql://user:pass@production-api-proxy.railway.app:5432/postgres",
    "direct": "postgresql://user:pass@production-api-db.railway.internal:5432/postgres"
  },
  "compute": {
    "status": "running",
    "lastActivity": "2025-11-21T00:20:00Z",
    "scaleToZero": true,
    "idleTimeout": "5m"
  },
  "storage": {
    "size": "10GB",
    "backups": {
      "enabled": true,
      "provider": "cloudflare-r2",
      "retention": "30d",
      "lastBackup": "2025-11-21T00:00:00Z"
    }
  },
  "branches": [
    {
      "name": "staging",
      "createdAt": "2025-11-20T12:00:00Z",
      "size": "8GB"
    }
  ]
}
```

---

## 5. Cost Model

### Component Costs (Monthly)

| Component | Idle State | Active State | Notes |
|-----------|-----------|--------------|-------|
| **Proxy Service** | $5 | $5 | Always running (512MB RAM) |
| **PostgreSQL** | $0 | $5-20 | Scales with usage |
| **Backup Service** | $2 | $2 | 256MB RAM |
| **R2 Storage** | $0.015/GB | $0.015/GB | Cloudflare pricing |
| **Read Replicas** | $0 | +$5/replica | Optional |

### User Pricing Tiers

```typescript
const pricingTiers = {
  hobby: {
    basePrice: 0,        // Free tier
    compute: 'paused',    // Auto-pause after 5min
    storage: '1GB',
    backups: 'none',
    branches: 0,
  },
  pro: {
    basePrice: 20,       // $20/month
    compute: 'always-on', // No auto-pause
    storage: '10GB',
    backups: '30-day PITR',
    branches: 3,
    replicas: 1,
  },
  team: {
    basePrice: 50,       // $50/month
    compute: 'auto-scale', // Horizontal scaling
    storage: '50GB',
    backups: '90-day PITR',
    branches: 10,
    replicas: 3,
  },
};
```

### Cost Comparison (vs Competitors)

| Provider | Hobby | Pro | Team |
|----------|-------|-----|------|
| **Railway Serverless** | $0 | $20 | $50 |
| Neon | $0 | $19 | $69 |
| PlanetScale | $0 | $29 | $99 |
| Supabase | $0 | $25 | $599 |

**Competitive Advantage**: Railway's managed infrastructure reduces our operational costs, allowing aggressive pricing.

---

## 6. Implementation Phases

### Phase 1: MVP (4 weeks)
**Goal**: Basic serverless Postgres with connection pooling

- [ ] Fork Neon proxy, remove Pageserver dependencies
- [ ] Integrate Railway API for compute control
- [ ] Build Control Plane API (create/delete databases)
- [ ] Setup R2 backup service (base backups only)
- [ ] Deploy to Railway staging environment

**Deliverable**: Users can create databases that scale-to-zero

---

### Phase 2: Production Features (6 weeks)
**Goal**: Enterprise-ready with backups and monitoring

- [ ] Continuous WAL archiving to R2
- [ ] Point-in-time recovery UI
- [ ] Connection pooling optimizations
- [ ] Metrics dashboard (Prometheus + Grafana)
- [ ] Read replica support
- [ ] Public beta launch

**Deliverable**: Production-grade serverless Postgres

---

### Phase 3: Advanced Features (8 weeks)
**Goal**: Differentiation with branching and dev workflows

- [ ] Database branching (create from backup)
- [ ] Branch-to-production promotion
- [ ] GitHub Actions integration
- [ ] Cost analytics dashboard
- [ ] Multi-region support
- [ ] General availability

**Deliverable**: Full-featured serverless database platform

---

## 7. Technical Trade-offs

### What We Gain
✅ **Simplicity**: 75% less code than full Neon replication
✅ **Railway Integration**: Native platform features (volumes, private networking, replicas)
✅ **Fast Time-to-Market**: Leverage existing Railway managed Postgres
✅ **Cost Efficiency**: No custom storage engine = lower operational cost
✅ **Standard Postgres**: 100% compatibility, no custom extensions

### What We Lose
❌ **Custom Storage Layer**: Can't optimize storage independently from compute
❌ **Instant Branching**: Branches take 30-60s to restore (vs Neon's instant COW)
❌ **Fine-grained Control**: Limited by Railway's managed Postgres constraints
❌ **Multi-tenant Optimization**: Neon's shared storage model is more efficient at scale

### Why This Trade-off Works
For 95% of users, **cold start speed** and **connection pooling** deliver the serverless experience. Instant branching is "nice-to-have" but not mission-critical for most workflows.

---

## 8. Success Metrics

### Technical KPIs
- Cold start time: < 10 seconds (p95)
- Connection pooling efficiency: > 100 connections per Postgres backend
- Backup reliability: 99.9% successful backups
- Recovery time: < 5 minutes for PITR
- Proxy overhead: < 5ms latency added

### Business KPIs
- Free tier → Paid conversion: > 5%
- Monthly active databases: > 1,000 by month 3
- Average database cost: < $15/month
- Customer acquisition cost: < $50
- Net Promoter Score: > 40

---

## 9. Security Architecture

### Data Protection
- **Encryption at Rest**: Railway volumes are encrypted by default
- **Encryption in Transit**: TLS 1.3 for all connections
- **Backup Encryption**: AES-256 before R2 upload
- **Key Management**: Railway secrets + optional customer KMS

### Access Control
- **Proxy Authentication**: JWT-based (existing Studio auth)
- **Database Credentials**: Rotated on creation, stored in Railway secrets
- **API Authorization**: OAuth2 + API keys
- **Network Isolation**: Private networking for DB ↔ Proxy

---

## 10. Observability Stack

### Metrics Collection
```yaml
# Prometheus metrics from each component
Proxy Service:
  - connection_pool_size
  - active_connections
  - idle_timeout_triggers
  - cold_start_duration

PostgreSQL:
  - query_duration_p95
  - transaction_rate
  - cache_hit_ratio
  - replication_lag (if replicas enabled)

Backup Service:
  - backup_duration
  - backup_size
  - r2_upload_success_rate
  - wal_segment_lag
```

### Alerting Rules
- Cold start > 15 seconds
- Backup failures
- Connection pool exhaustion
- Disk usage > 80%

---

## 11. Migration Path (Existing Users)

For users currently on Railway Postgres, provide one-click migration:

```typescript
async function migrateToServerless(existingDbId: string) {
  // 1. Create backup of existing database
  const backup = await createBackup(existingDbId);

  // 2. Create new serverless database
  const serverlessDb = await createServerlessDatabase({
    name: `${existingDbId}-serverless`,
    restoreFrom: backup,
  });

  // 3. Run dual-write period (24 hours)
  await enableDualWrite(existingDbId, serverlessDb.id);

  // 4. Switch connection string
  await updateConnectionString(serverlessDb.connectionString);

  // 5. Delete old database after verification
  setTimeout(() => deleteDatabase(existingDbId), 7 * 24 * 60 * 60 * 1000);
}
```

---

## 12. FAQ for Stakeholders

**Q: Why not just use Neon's full stack?**
A: Neon's Pageserver adds complexity we don't need. Railway's managed Postgres + R2 backups achieve 90% of serverless benefits with 25% of the code.

**Q: What's our moat against Neon?**
A: Railway platform integration (private networking, unified billing, template ecosystem), aggressive pricing, and faster time-to-market.

**Q: Can we scale to enterprise customers?**
A: Yes - Railway's infrastructure supports it. We'll add read replicas, multi-region, and dedicated proxy pools for Team+ plans.

**Q: What's the lock-in risk?**
A: Low - users can export standard `pg_dump` backups. No custom storage format to migrate off.

---

## Conclusion

This architecture delivers **pragmatic serverless Postgres** by combining Railway's strengths with carefully selected Neon components. We skip over-engineering (Pageserver, Safekeepers) in favor of battle-tested solutions (Railway Postgres, R2 backups, PgBouncer).

**Next Steps**:
1. Review this proposal with engineering team
2. Prototype Phase 1 in Railway staging environment
3. Validate cold start performance benchmarks
4. Build Control Plane API for database CRUD
5. Alpha launch with 10 early customers

**Estimated Timeline**: 18 weeks from approval to general availability
**Estimated Cost**: 1 senior engineer + 1 backend engineer + design/PM support

---

**Document Metadata**:
- Author: Dylan Torres (TPM)
- Stakeholders: Engineering, Product, Finance
- Status: Proposal / Awaiting Review
- Next Review: [Schedule stakeholder review]
