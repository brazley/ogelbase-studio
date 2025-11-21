# Railway Serverless Postgres: Implementation Plan
## Technical Deep-Dive for Engineering Team

**Document Version**: 1.0
**Date**: November 21, 2025
**Target Audience**: Backend Engineers, DevOps
**Related**: [RAILWAY_SERVERLESS_POSTGRES_ARCHITECTURE.md](./RAILWAY_SERVERLESS_POSTGRES_ARCHITECTURE.md)

---

## Quick Start: What You're Building

You're building a **simplified serverless Postgres** that:
1. Uses Railway's managed Postgres (skip custom storage)
2. Adds Neon's proxy for connection pooling
3. Implements scale-to-zero via Railway API
4. Backs up to Cloudflare R2 (skip Pageserver)

**Core Philosophy**: Simple > Perfect. Ship fast, iterate based on user feedback.

---

## Phase 1: MVP Implementation (4 Weeks)

### Week 1: Proxy Service Setup

#### Task 1.1: Fork Neon Proxy
```bash
# Clone Neon's repository
git clone https://github.com/neondatabase/neon.git
cd neon/proxy

# Create our simplified fork
mkdir -p ~/railway-proxy
cp -r src ~/railway-proxy/
cd ~/railway-proxy

# Remove unnecessary components
rm -rf src/scram      # Keep if you want SCRAM auth
rm -rf src/console    # We'll use Railway API
rm -rf src/cache      # Simplify first iteration

# Core files to keep:
# - src/proxy.rs         (main proxy logic)
# - src/stream.rs        (connection handling)
# - src/config.rs        (configuration)
# - src/auth/            (authentication)
```

#### Task 1.2: Railway API Integration
Create new module: `src/railway.rs`

```rust
// railway-proxy/src/railway.rs
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct RailwayConfig {
    api_token: String,
    api_base: String,
}

#[derive(Debug, Deserialize)]
struct ServiceStatus {
    id: String,
    name: String,
    status: String, // "active" | "paused" | "starting"
}

pub struct RailwayClient {
    client: Client,
    config: RailwayConfig,
}

impl RailwayClient {
    pub fn new(config: RailwayConfig) -> Self {
        Self {
            client: Client::new(),
            config,
        }
    }

    pub async fn unpause_service(&self, service_id: &str) -> Result<()> {
        let url = format!(
            "{}/services/{}/unpause",
            self.config.api_base,
            service_id
        );

        self.client
            .post(&url)
            .bearer_auth(&self.config.api_token)
            .send()
            .await?;

        // Wait for service to be ready
        self.wait_for_ready(service_id).await
    }

    async fn wait_for_ready(&self, service_id: &str) -> Result<()> {
        let max_attempts = 30; // 30 seconds timeout
        let mut attempts = 0;

        while attempts < max_attempts {
            let status = self.get_service_status(service_id).await?;

            if status.status == "active" {
                // Additional health check: try to connect to Postgres
                if self.check_postgres_health(service_id).await.is_ok() {
                    return Ok(());
                }
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
            attempts += 1;
        }

        Err(anyhow!("Service failed to become ready in time"))
    }

    async fn check_postgres_health(&self, service_id: &str) -> Result<()> {
        // Get private URL from Railway API
        let private_url = self.get_service_url(service_id).await?;

        // Try to connect
        let (client, conn) = tokio_postgres::connect(&private_url, NoTls).await?;

        // Spawn connection
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                eprintln!("connection error: {}", e);
            }
        });

        // Simple health query
        client.execute("SELECT 1", &[]).await?;

        Ok(())
    }

    pub async fn pause_service(&self, service_id: &str) -> Result<()> {
        let url = format!(
            "{}/services/{}/pause",
            self.config.api_base,
            service_id
        );

        self.client
            .post(&url)
            .bearer_auth(&self.config.api_token)
            .send()
            .await?;

        Ok(())
    }
}
```

#### Task 1.3: Modified Proxy Main Loop
Update `src/proxy.rs`:

```rust
// railway-proxy/src/proxy.rs
use crate::railway::RailwayClient;
use tokio::net::TcpListener;

pub struct RailwayProxy {
    listener: TcpListener,
    railway: RailwayClient,
    config: ProxyConfig,
    pool: ConnectionPool,
}

impl RailwayProxy {
    pub async fn run(self) -> Result<()> {
        loop {
            let (stream, addr) = self.listener.accept().await?;

            let railway = self.railway.clone();
            let pool = self.pool.clone();
            let config = self.config.clone();

            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, railway, pool, config).await {
                    error!("Connection error from {}: {}", addr, e);
                }
            });
        }
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    railway: RailwayClient,
    pool: ConnectionPool,
    config: ProxyConfig,
) -> Result<()> {
    // 1. Parse Postgres startup message
    let startup = parse_startup_message(&mut stream).await?;

    // 2. Authenticate user
    let auth_result = authenticate_user(&startup, &config).await?;

    if !auth_result.authorized {
        send_auth_error(&mut stream).await?;
        return Ok(());
    }

    // 3. Check if compute is running
    let service_id = auth_result.service_id;
    if !is_service_active(&railway, &service_id).await? {
        info!("Compute is paused, waking up: {}", service_id);

        // Send "warming up" notice to client
        send_notice(&mut stream, "Database is starting...").await?;

        // Wake up the service
        railway.unpause_service(&service_id).await?;

        info!("Compute is now active: {}", service_id);
    }

    // 4. Get connection from pool
    let backend_conn = pool.get_connection(&service_id).await?;

    // 5. Proxy traffic between client and backend
    proxy_traffic(stream, backend_conn).await?;

    Ok(())
}

async fn proxy_traffic(
    mut client: TcpStream,
    mut backend: TcpStream,
) -> Result<()> {
    let (mut client_read, mut client_write) = client.split();
    let (mut backend_read, mut backend_write) = backend.split();

    // Bidirectional streaming
    tokio::select! {
        result = tokio::io::copy(&mut client_read, &mut backend_write) => {
            result?;
        }
        result = tokio::io::copy(&mut backend_read, &mut client_write) => {
            result?;
        }
    }

    Ok(())
}
```

#### Task 1.4: Connection Pooling
Use PgBouncer-style pooling:

```rust
// railway-proxy/src/pool.rs
use std::collections::HashMap;
use tokio::sync::Semaphore;

pub struct ConnectionPool {
    pools: HashMap<String, ServicePool>,
    config: PoolConfig,
}

struct ServicePool {
    service_id: String,
    private_url: String,
    connections: Vec<PgConnection>,
    semaphore: Semaphore,
}

impl ConnectionPool {
    pub async fn get_connection(&self, service_id: &str) -> Result<PgConnection> {
        let pool = self.pools.get(service_id)
            .ok_or_else(|| anyhow!("Service not found"))?;

        // Acquire permit (blocks if pool is full)
        let _permit = pool.semaphore.acquire().await?;

        // Try to get existing idle connection
        if let Some(conn) = pool.connections.iter().find(|c| c.is_idle()) {
            return Ok(conn.clone());
        }

        // Create new connection
        let (client, connection) = tokio_postgres::connect(&pool.private_url, NoTls).await?;

        // Spawn connection driver
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });

        Ok(PgConnection { client })
    }
}
```

#### Task 1.5: Dockerfile for Proxy
```dockerfile
# railway-proxy/Dockerfile
FROM rust:1.75 as builder

WORKDIR /app
COPY . .

# Build release binary
RUN cargo build --release

FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary
COPY --from=builder /app/target/release/railway-proxy /usr/local/bin/

# Expose Postgres port
EXPOSE 5432

CMD ["railway-proxy"]
```

#### Task 1.6: Deploy to Railway
```bash
# Create Railway service
railway service create railway-proxy

# Set environment variables
railway variables set \
  RAILWAY_API_TOKEN=$RAILWAY_TOKEN \
  RAILWAY_API_BASE=https://backboard.railway.app/graphql/v2 \
  PROXY_PORT=5432 \
  LOG_LEVEL=info

# Deploy
railway up
```

---

### Week 2: Control Plane API

#### Task 2.1: Database CRUD Endpoints
Create API routes in Next.js Studio:

```typescript
// apps/studio/pages/api/serverless/databases/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { RailwayAPI } from '@/lib/api/railway';
import { getUserFromSession } from '@/lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, region = 'us-west-2', plan = 'hobby' } = req.body;

  // Validate inputs
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid database name' });
  }

  const railway = new RailwayAPI(process.env.RAILWAY_API_TOKEN!);

  try {
    // 1. Create Railway Postgres service
    const dbService = await railway.createService({
      projectId: user.railwayProjectId,
      name: `${name}-db`,
      source: {
        image: 'postgres:17-alpine',
      },
      region: region,
      variables: {
        POSTGRES_PASSWORD: generateSecurePassword(),
        POSTGRES_USER: 'postgres',
        POSTGRES_DB: 'postgres',
      },
      volumes: [
        {
          name: 'pgdata',
          mountPath: '/var/lib/postgresql/data',
        },
      ],
    });

    // 2. Create proxy service
    const proxyService = await railway.createService({
      projectId: user.railwayProjectId,
      name: `${name}-proxy`,
      source: {
        image: 'ghcr.io/yourorg/railway-proxy:latest',
      },
      region: region,
      variables: {
        POSTGRES_SERVICE_ID: dbService.id,
        DATABASE_URL: `postgresql://postgres:${dbService.password}@${dbService.privateUrl}:5432/postgres`,
        IDLE_TIMEOUT: plan === 'hobby' ? '300' : '0', // 5 min for hobby, always-on for pro
        RAILWAY_API_TOKEN: process.env.RAILWAY_API_TOKEN,
      },
      domains: [
        {
          subdomain: `${name}-${user.id.slice(0, 8)}`,
        },
      ],
    });

    // 3. Wait for services to be ready
    await railway.waitForServiceReady(dbService.id);
    await railway.waitForServiceReady(proxyService.id);

    // 4. Store metadata in our database
    const database = await prisma.serverlessDatabase.create({
      data: {
        userId: user.id,
        name: name,
        region: region,
        plan: plan,
        railwayProjectId: user.railwayProjectId,
        railwayDbServiceId: dbService.id,
        railwayProxyServiceId: proxyService.id,
        connectionString: `postgresql://postgres:${dbService.password}@${proxyService.domain}:5432/postgres`,
        privateUrl: dbService.privateUrl,
      },
    });

    // 5. Create initial backup
    await scheduleBackup(database.id);

    return res.status(201).json({
      id: database.id,
      name: database.name,
      status: 'ready',
      connectionString: database.connectionString,
      region: database.region,
      plan: database.plan,
      createdAt: database.createdAt,
    });
  } catch (error) {
    console.error('Failed to create database:', error);

    // Cleanup partial resources
    // ... cleanup logic ...

    return res.status(500).json({
      error: 'Failed to create database',
      details: error.message,
    });
  }
}

function generateSecurePassword(): string {
  return crypto.randomBytes(32).toString('base64url');
}
```

#### Task 2.2: Railway API Client
```typescript
// apps/studio/lib/api/railway.ts
import axios, { AxiosInstance } from 'axios';

export class RailwayAPI {
  private client: AxiosInstance;

  constructor(apiToken: string) {
    this.client = axios.create({
      baseURL: 'https://backboard.railway.app/graphql/v2',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createService(params: CreateServiceParams) {
    const mutation = `
      mutation CreateService($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
          privateUrl: serviceInstancePrivateUrl
          createdAt
        }
      }
    `;

    const response = await this.client.post('', {
      query: mutation,
      variables: {
        input: {
          projectId: params.projectId,
          name: params.name,
          source: params.source,
          variables: params.variables,
          volumes: params.volumes,
          region: params.region,
        },
      },
    });

    return response.data.data.serviceCreate;
  }

  async pauseService(serviceId: string) {
    const mutation = `
      mutation PauseService($serviceId: String!) {
        serviceInstancePause(serviceId: $serviceId)
      }
    `;

    await this.client.post('', {
      query: mutation,
      variables: { serviceId },
    });
  }

  async unpauseService(serviceId: string) {
    const mutation = `
      mutation UnpauseService($serviceId: String!) {
        serviceInstanceUnpause(serviceId: $serviceId)
      }
    `;

    await this.client.post('', {
      query: mutation,
      variables: { serviceId },
    });
  }

  async waitForServiceReady(serviceId: string, timeoutMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getServiceStatus(serviceId);

      if (status === 'ACTIVE') {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Service ${serviceId} did not become ready in time`);
  }

  async getServiceStatus(serviceId: string): Promise<string> {
    const query = `
      query GetServiceStatus($serviceId: String!) {
        service(id: $serviceId) {
          serviceInstances {
            status
          }
        }
      }
    `;

    const response = await this.client.post('', {
      query,
      variables: { serviceId },
    });

    return response.data.data.service.serviceInstances[0]?.status || 'UNKNOWN';
  }
}
```

---

### Week 3: Backup Service

#### Task 3.1: Continuous WAL Archiving
```go
// backup-service/wal_archiver.go
package main

import (
    "context"
    "fmt"
    "io"
    "os"
    "path/filepath"
    "time"

    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/service/s3"
    "github.com/jackc/pglogrepl"
    "github.com/jackc/pgx/v5/pgconn"
)

type WALArchiver struct {
    r2Client   *s3.Client
    pgConn     *pgconn.PgConn
    bucketName string
    projectID  string
}

func NewWALArchiver(cfg Config) (*WALArchiver, error) {
    // Connect to Postgres replication slot
    conn, err := pgconn.Connect(context.Background(), cfg.DatabaseURL)
    if err != nil {
        return nil, fmt.Errorf("failed to connect: %w", err)
    }

    // Create replication slot if it doesn't exist
    _, err = pglogrepl.CreateReplicationSlot(
        context.Background(),
        conn,
        "railway_wal_archiver",
        "pgoutput",
        pglogrepl.CreateReplicationSlotOptions{},
    )
    if err != nil {
        // Slot may already exist, that's OK
        log.Printf("Replication slot may already exist: %v", err)
    }

    return &WALArchiver{
        r2Client:   cfg.R2Client,
        pgConn:     conn,
        bucketName: cfg.R2Bucket,
        projectID:  cfg.ProjectID,
    }, nil
}

func (w *WALArchiver) Start(ctx context.Context) error {
    // Start streaming WAL
    err := pglogrepl.StartReplication(
        ctx,
        w.pgConn,
        "railway_wal_archiver",
        pglogrepl.LSN(0),
        pglogrepl.StartReplicationOptions{},
    )
    if err != nil {
        return fmt.Errorf("failed to start replication: %w", err)
    }

    log.Println("WAL archiver started")

    var currentSegment *WALSegment

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
        }

        // Receive WAL message
        msg, err := w.pgConn.ReceiveMessage(ctx)
        if err != nil {
            return fmt.Errorf("failed to receive message: %w", err)
        }

        switch msg := msg.(type) {
        case *pgconn.CopyData:
            // Parse WAL data
            walData, err := pglogrepl.Parse(msg.Data[1:])
            if err != nil {
                log.Printf("Failed to parse WAL: %v", err)
                continue
            }

            // Determine if we need a new segment
            if currentSegment == nil || walData.WALStart/WALSegmentSize > currentSegment.Number {
                // Upload previous segment
                if currentSegment != nil {
                    if err := w.uploadSegment(ctx, currentSegment); err != nil {
                        log.Printf("Failed to upload segment: %v", err)
                    }
                }

                // Start new segment
                currentSegment = &WALSegment{
                    Number: walData.WALStart / WALSegmentSize,
                    Data:   new(bytes.Buffer),
                }
            }

            // Append to current segment
            currentSegment.Data.Write(walData.WALData)
        }
    }
}

func (w *WALArchiver) uploadSegment(ctx context.Context, segment *WALSegment) error {
    key := fmt.Sprintf("wal/%s/%016X", w.projectID, segment.Number)

    _, err := w.r2Client.PutObject(ctx, &s3.PutObjectInput{
        Bucket: aws.String(w.bucketName),
        Key:    aws.String(key),
        Body:   bytes.NewReader(segment.Data.Bytes()),
    })

    if err != nil {
        return fmt.Errorf("failed to upload to R2: %w", err)
    }

    log.Printf("Uploaded WAL segment: %s", key)
    return nil
}

const WALSegmentSize = 16 * 1024 * 1024 // 16MB

type WALSegment struct {
    Number uint64
    Data   *bytes.Buffer
}
```

#### Task 3.2: Base Backup Service
```go
// backup-service/base_backup.go
package main

import (
    "context"
    "fmt"
    "os/exec"
    "path/filepath"
    "time"

    "github.com/aws/aws-sdk-go-v2/service/s3"
)

type BackupService struct {
    r2Client   *s3.Client
    bucketName string
    projectID  string
    dbURL      string
}

func (b *BackupService) CreateBaseBackup(ctx context.Context) error {
    backupID := fmt.Sprintf("%s-%d", b.projectID, time.Now().Unix())
    backupDir := filepath.Join("/tmp", backupID)

    log.Printf("Creating base backup: %s", backupID)

    // Run pg_basebackup
    cmd := exec.CommandContext(ctx,
        "pg_basebackup",
        "-D", backupDir,
        "-Ft",           // tar format
        "-z",            // gzip compression
        "-P",            // progress
        "-d", b.dbURL,
    )

    output, err := cmd.CombinedOutput()
    if err != nil {
        return fmt.Errorf("pg_basebackup failed: %w\nOutput: %s", err, output)
    }

    log.Printf("Base backup created, uploading to R2...")

    // Upload backup directory to R2
    if err := b.uploadDirectory(ctx, backupDir, backupID); err != nil {
        return fmt.Errorf("failed to upload backup: %w", err)
    }

    // Create metadata file
    metadata := BackupMetadata{
        ID:        backupID,
        ProjectID: b.projectID,
        Timestamp: time.Now(),
        Size:      getDirSize(backupDir),
        Type:      "base",
    }

    if err := b.uploadMetadata(ctx, metadata); err != nil {
        return fmt.Errorf("failed to upload metadata: %w", err)
    }

    log.Printf("Base backup complete: %s", backupID)

    // Cleanup local files
    os.RemoveAll(backupDir)

    return nil
}

func (b *BackupService) uploadDirectory(ctx context.Context, dir, backupID string) error {
    return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
        if err != nil || info.IsDir() {
            return err
        }

        relPath, _ := filepath.Rel(dir, path)
        key := fmt.Sprintf("backups/%s/%s", backupID, relPath)

        file, err := os.Open(path)
        if err != nil {
            return err
        }
        defer file.Close()

        _, err = b.r2Client.PutObject(ctx, &s3.PutObjectInput{
            Bucket: aws.String(b.bucketName),
            Key:    aws.String(key),
            Body:   file,
        })

        return err
    })
}

func (b *BackupService) ScheduleBackups(ctx context.Context) {
    ticker := time.NewTicker(24 * time.Hour) // Daily backups
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            if err := b.CreateBaseBackup(ctx); err != nil {
                log.Printf("Scheduled backup failed: %v", err)
            }
        }
    }
}

type BackupMetadata struct {
    ID        string    `json:"id"`
    ProjectID string    `json:"project_id"`
    Timestamp time.Time `json:"timestamp"`
    Size      int64     `json:"size"`
    Type      string    `json:"type"` // "base" or "incremental"
}
```

---

### Week 4: Testing & Integration

#### Task 4.1: End-to-End Test
```typescript
// tests/e2e/serverless-database.test.ts
import { test, expect } from '@playwright/test';

test.describe('Serverless Database Creation', () => {
  test('should create and connect to database', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 2. Navigate to databases
    await page.goto('/serverless/databases');

    // 3. Create new database
    await page.click('text=Create Database');
    await page.fill('[name="name"]', 'test-db');
    await page.selectOption('[name="region"]', 'us-west-2');
    await page.click('button:has-text("Create")');

    // 4. Wait for provisioning
    await page.waitForSelector('text=ready', { timeout: 60000 });

    // 5. Get connection string
    const connectionString = await page
      .locator('[data-testid="connection-string"]')
      .textContent();

    expect(connectionString).toContain('postgresql://');

    // 6. Test cold start
    await page.click('text=Test Connection');

    // Should take 6-12 seconds first time
    const start = Date.now();
    await page.waitForSelector('text=Connection successful', {
      timeout: 15000,
    });
    const coldStartTime = Date.now() - start;

    expect(coldStartTime).toBeLessThan(12000);
    console.log(`Cold start time: ${coldStartTime}ms`);
  });
});
```

#### Task 4.2: Load Testing
```typescript
// tests/load/connection-pool.test.ts
import { Pool } from 'pg';
import { performance } from 'perf_hooks';

async function loadTest() {
  const connectionString = process.env.TEST_DATABASE_URL!;

  console.log('Starting connection pool load test...');

  // Create 500 concurrent connections
  const pools: Pool[] = [];
  for (let i = 0; i < 500; i++) {
    pools.push(
      new Pool({
        connectionString,
        max: 1, // 1 connection per pool
      })
    );
  }

  // Execute queries concurrently
  const start = performance.now();

  const queries = pools.map((pool) =>
    pool.query('SELECT pg_sleep(0.1), $1 as id', [Math.random()])
  );

  const results = await Promise.all(queries);

  const duration = performance.now() - start;

  console.log(`Completed ${results.length} queries in ${duration.toFixed(2)}ms`);
  console.log(`Average latency: ${(duration / results.length).toFixed(2)}ms`);

  // Cleanup
  await Promise.all(pools.map((p) => p.end()));

  // Assert performance
  expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
}

loadTest();
```

---

## Phase 2: Production Features (Weeks 5-10)

### Week 5-6: Point-in-Time Recovery

#### Implementation
```typescript
// apps/studio/pages/api/serverless/databases/[id]/restore.ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const { targetTime, targetDbName } = req.body;

  // 1. Find base backup before target time
  const baseBackup = await findBackupBeforeTime(id, targetTime);

  // 2. Find all WAL segments between backup and target
  const walSegments = await findWALSegments(
    id,
    baseBackup.timestamp,
    targetTime
  );

  // 3. Create new Railway service
  const newDb = await railway.createPostgresService({
    name: targetDbName,
    region: baseBackup.region,
  });

  // 4. Download and restore base backup
  await restoreBaseBackup(newDb.id, baseBackup);

  // 5. Apply WAL segments
  for (const segment of walSegments) {
    await applyWALSegment(newDb.id, segment);
  }

  // 6. Recovery target
  await configureRecoveryTarget(newDb.id, targetTime);

  // 7. Start database
  await railway.unpauseService(newDb.id);

  return res.json({
    id: newDb.id,
    status: 'restoring',
    targetTime,
  });
}
```

---

### Week 7-8: Read Replicas

Use Railway's native replica support:

```typescript
// apps/studio/pages/api/serverless/databases/[id]/replicas.ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  const database = await prisma.serverlessDatabase.findUnique({
    where: { id: id as string },
  });

  // Create read replica using Railway API
  const replica = await railway.createReplica({
    primaryServiceId: database.railwayDbServiceId,
    name: `${database.name}-replica-${Date.now()}`,
    region: database.region, // Same region for low latency
  });

  // Store replica metadata
  await prisma.databaseReplica.create({
    data: {
      databaseId: database.id,
      railwayServiceId: replica.id,
      role: 'reader',
      connectionString: replica.connectionString,
    },
  });

  return res.json({
    id: replica.id,
    connectionString: replica.connectionString,
    lag: 0,
  });
}
```

---

### Week 9-10: Monitoring Dashboard

```typescript
// apps/studio/components/ServerlessMetrics.tsx

export function ServerlessMetrics({ databaseId }: Props) {
  const { data: metrics } = useSWR(
    `/api/serverless/databases/${databaseId}/metrics`,
    fetcher,
    { refreshInterval: 10000 }
  );

  return (
    <div className="grid grid-cols-2 gap-4">
      <MetricCard
        title="Active Connections"
        value={metrics?.activeConnections || 0}
        max={metrics?.maxConnections || 100}
      />

      <MetricCard
        title="Cold Starts (24h)"
        value={metrics?.coldStarts24h || 0}
        trend={metrics?.coldStartTrend}
      />

      <MetricCard
        title="Query Latency (p95)"
        value={`${metrics?.queryLatencyP95 || 0}ms`}
        trend={metrics?.latencyTrend}
      />

      <MetricCard
        title="Storage Used"
        value={formatBytes(metrics?.storageUsed || 0)}
        max={formatBytes(metrics?.storageLimit || 10737418240)}
      />

      <Chart
        title="Connection Pool Usage"
        data={metrics?.connectionPoolHistory}
        type="line"
      />

      <Chart
        title="Compute Uptime"
        data={metrics?.uptimeHistory}
        type="bar"
      />
    </div>
  );
}
```

---

## Phase 3: Advanced Features (Weeks 11-18)

### Database Branching

```typescript
// apps/studio/pages/api/serverless/databases/[id]/branches.ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const { name, fromBackup } = req.body;

  const parent = await prisma.serverlessDatabase.findUnique({
    where: { id: id as string },
  });

  // 1. Create backup if not specified
  const backup = fromBackup || (await createBackup(parent.id));

  // 2. Create new Railway environment for branch
  const branchEnv = await railway.createEnvironment({
    projectId: parent.railwayProjectId,
    name: `branch-${name}`,
  });

  // 3. Create database in branch environment
  const branchDb = await createDatabaseFromBackup({
    name: `${parent.name}-${name}`,
    backup: backup,
    environmentId: branchEnv.id,
  });

  // 4. Link branch to parent
  await prisma.serverlessDatabase.update({
    where: { id: branchDb.id },
    data: {
      parentDatabaseId: parent.id,
      branchName: name,
    },
  });

  return res.json({
    id: branchDb.id,
    name: name,
    connectionString: branchDb.connectionString,
    createdAt: new Date(),
  });
}
```

---

## Deployment Checklist

### Pre-Launch
- [ ] Security audit of proxy service
- [ ] Load test with 1000+ concurrent connections
- [ ] Backup/restore dry-run test
- [ ] Cost calculation for 100 users
- [ ] Documentation for end-users
- [ ] Railway platform integration approval

### Launch Day
- [ ] Deploy proxy service to Railway production
- [ ] Enable API endpoints in Studio
- [ ] Configure monitoring alerts
- [ ] Set up support channels
- [ ] Announce beta program

### Post-Launch (Week 1)
- [ ] Monitor cold start times
- [ ] Track backup success rates
- [ ] Collect user feedback
- [ ] Fix critical bugs
- [ ] Optimize connection pooling

---

## Troubleshooting Guide

### Common Issues

#### Issue: Cold start takes > 15 seconds
**Diagnosis**:
```bash
# Check Railway service status
railway service logs railway-proxy --tail 100

# Look for slow unpause operations
```

**Fix**:
- Increase Railway service memory allocation
- Pre-warm connection pool during health checks
- Add Redis cache for service status

---

#### Issue: Connection pool exhaustion
**Diagnosis**:
```rust
// Add logging to proxy
log::warn!("Pool exhausted: {} active, {} idle", active, idle);
```

**Fix**:
- Increase `max_connections` in Postgres config
- Adjust pool size in proxy config
- Implement connection queuing

---

#### Issue: Backup failures
**Diagnosis**:
```go
// Check backup service logs
log.Printf("Backup failed: %v", err)
log.Printf("Last successful backup: %v", lastSuccess)
```

**Fix**:
- Verify R2 credentials
- Check disk space on backup service
- Increase backup timeout

---

## Success Metrics Tracking

```typescript
// analytics/serverless-metrics.ts

export async function trackServerlessMetrics() {
  const metrics = {
    // Technical KPIs
    coldStartTimeP95: await getColdStartTimeP95(),
    connectionPoolEfficiency: await getPoolEfficiency(),
    backupSuccessRate: await getBackupSuccessRate(),
    recoveryTimeP95: await getRecoveryTimeP95(),

    // Business KPIs
    activeDatabases: await getActiveDatabaseCount(),
    freeToProConversion: await getConversionRate(),
    avgDatabaseCost: await getAverageCost(),
    customerSatisfaction: await getNPS(),
  };

  await sendMetricsToDatadog(metrics);
  await alertIfThresholdsExceeded(metrics);
}
```

---

## Next Steps

1. **Week 1**: Start with Task 1.1 (Fork Neon Proxy)
2. **Week 2**: Build Control Plane API for database CRUD
3. **Week 3**: Implement backup service
4. **Week 4**: End-to-end testing and optimization

**Questions?** Reach out to Dylan (TPM) or the platform team in #serverless-postgres Slack channel.

---

**Document Metadata**:
- Author: Dylan Torres (TPM)
- Target: Backend Engineering Team
- Status: Implementation Guide / Ready for Development
- Related: [RAILWAY_SERVERLESS_POSTGRES_ARCHITECTURE.md](./RAILWAY_SERVERLESS_POSTGRES_ARCHITECTURE.md)
