# Appwrite Deployment Infrastructure Analysis
**Platform Engineer Report: Maya Patel**
**Date: November 22, 2025**

## Executive Summary

Appwrite has built a sophisticated deployment platform that rivals Vercel/Netlify, offering both **static sites** and **server-side rendering (SSR)** through their "Sites" feature. This analysis breaks down their architecture to inform how we can build our own deployment platform on Railway.

---

## 1. Architecture Overview

### High-Level Flow

```
GitHub Push → Webhook → VCS Controller → Queue → Build Worker → Executor → Deploy
```

### Core Components

1. **VCS Controller** (`app/controllers/api/vcs.php`)
   - Handles GitHub webhooks
   - Creates deployment records
   - Manages preview URLs (branch previews, commit previews, PR previews)
   - Updates GitHub commit statuses

2. **Queue System**
   - Uses message queues (Redis-backed) for job processing
   - Separates API layer from long-running build processes
   - Allows horizontal scaling of workers

3. **Build Worker** (`src/Appwrite/Platform/Modules/Functions/Workers/Builds.php`)
   - Clones repositories
   - Executes build commands
   - Packages built assets
   - Handles both functions and sites

4. **Executor Service**
   - Isolated Docker-based build environment
   - Manages runtime containers
   - Resource limits (CPU, memory, timeout)

5. **Storage Layer**
   - Supports multiple backends (S3, local, DigitalOcean Spaces, etc.)
   - Separate storage for functions and sites
   - Tar.gz packaging for deployments

6. **Routing Layer** (Traefik)
   - Dynamic routing based on domains
   - SSL/TLS certificate management
   - Load balancing

---

## 2. Framework Support & Detection

### Supported Frameworks

Appwrite has **first-class support** for modern frameworks:

**SSR Frameworks:**
- Next.js
- Nuxt
- SvelteKit
- Remix
- Astro (SSR mode)
- Analog (Angular SSR)

**Static Site Generators:**
- Vite
- React (CRA/Vite)
- Vue
- Angular
- Astro (static mode)
- Flutter Web
- Lynx (cross-platform framework)

### Framework Configuration

Each framework has a template configuration (`app/config/templates/site.php`):

```php
'NEXTJS' => [
    'key' => 'nextjs',
    'name' => 'Next.js',
    'installCommand' => 'npm install',
    'buildCommand' => 'npm run build',
    'outputDirectory' => './.next',
    'buildRuntime' => 'node-22',
    'adapter' => 'ssr',  // 'static' or 'ssr'
    'fallbackFile' => '',
],
```

**Key Fields:**
- `adapter`: Determines if it's static or SSR
- `buildRuntime`: Docker image to use for builds
- `outputDirectory`: Where build artifacts are located
- `fallbackFile`: For SPA routing (e.g., `index.html`)

### Auto-Detection

Appwrite uses the **Utopia Detector** library:
- Detects framework from `package.json`
- Identifies runtime requirements
- Determines package manager (npm, pnpm, yarn, bun)

---

## 3. Build Pipeline Deep Dive

### Build Process Flow

```
1. Webhook received → Create deployment record
2. Clone repository (with subpath support)
3. Merge template (if using template)
4. Execute build in isolated container
5. Package output directory
6. Upload to storage
7. Update routing rules
8. Generate preview URLs
9. Update GitHub status
```

### Container Strategy

**Build Containers:**
```php
// Build with resource limits
$cpus = $spec['cpus'] ?? 1;
$memory = max($spec['memory'] ?? 512, $minMemory);
$timeout = System::getEnv('_APP_COMPUTE_BUILD_TIMEOUT', 900); // 15 minutes
```

**Key Features:**
- Isolated build environment per deployment
- Resource limits prevent runaway builds
- Support for build-time environment variables
- Automatic cleanup after build

### Environment Variables at Build Time

Appwrite injects comprehensive build context:

```php
$vars = [
    // Version control info
    'APPWRITE_VCS_REPOSITORY_ID' => $deployment->getAttribute('providerRepositoryId'),
    'APPWRITE_VCS_REPOSITORY_NAME' => $deployment->getAttribute('providerRepositoryName'),
    'APPWRITE_VCS_REPOSITORY_BRANCH' => $deployment->getAttribute('providerBranch'),
    'APPWRITE_VCS_COMMIT_HASH' => $deployment->getAttribute('providerCommitHash'),
    'APPWRITE_VCS_COMMIT_MESSAGE' => $deployment->getAttribute('providerCommitMessage'),
    'APPWRITE_VCS_ROOT_DIRECTORY' => $deployment->getAttribute('providerRootDirectory'),

    // Site-specific
    'APPWRITE_SITE_API_ENDPOINT' => $endpoint,
    'APPWRITE_SITE_API_KEY' => $apiKey,
    'APPWRITE_SITE_ID' => $resource->getId(),
    'APPWRITE_SITE_NAME' => $resource->getAttribute('name'),
    'APPWRITE_SITE_PROJECT_ID' => $project->getId(),
];
```

### Build Command Execution

**Static Sites:**
```bash
# Clone repo
git clone --depth 1 --branch $branch $repo /tmp/build

# Run install and build
cd /tmp/build/$rootDirectory
$installCommand  # e.g., npm install
$buildCommand    # e.g., npm run build

# Package output
tar -czf /tmp/code.tar.gz -C $outputDirectory .
```

**SSR Sites:**
- Similar flow but entire built directory is packaged
- Server runtime (Node.js) is bundled
- Startup script is configured

---

## 4. Deployment & Routing

### Preview URL Strategy

Appwrite creates **three types of preview URLs**:

1. **Deployment Preview** (unique per deployment):
   ```
   https://{unique-id}.sites.example.com
   ```

2. **Branch Preview** (stable per branch):
   ```
   https://branch-{branch-name}-{hash}.sites.example.com
   ```

3. **Commit Preview** (unique per commit):
   ```
   https://commit-{commit-hash}.sites.example.com
   ```

### Domain Management

**Database Schema (Rules table):**
```php
[
    'domain' => 'branch-main-abc123.sites.example.com',
    'type' => 'deployment',
    'trigger' => 'deployment',
    'deploymentId' => $deploymentId,
    'deploymentResourceType' => 'site',
    'deploymentResourceId' => $siteId,
    'deploymentVcsProviderBranch' => 'main',
    'status' => 'verified',
    'certificateId' => '',
]
```

**Traefik Dynamic Configuration:**
- Rules are synced from database to Traefik config
- SSL certificates managed via Let's Encrypt
- Automatic HTTPS redirection

### Production Deployments

When deploying to production branch:
```php
if ($providerBranch == $productionBranch && $external === false) {
    $activate = true; // Automatically activate
}
```

Production deployments get:
- Custom domain support
- Atomic deployments (zero downtime)
- Instant rollback capability

---

## 5. GitHub Integration

### Webhook Processing

**Events Handled:**
- `push` - New commits
- `pull_request` - PR opened/updated
- `deployment_status` - External deployment updates

### PR Comment Updates

Appwrite posts **real-time status comments** on PRs:

```markdown
## Deployments

| Name | Status | Preview |
|------|--------|---------|
| My Site (Project A) | ✅ Building | [View](https://preview-url) |
```

**Locking Mechanism:**
- Uses database locks to prevent concurrent comment updates
- Retries up to 9 times with exponential backoff
- Ensures comments don't get mangled by parallel builds

### Commit Status Updates

Updates GitHub commit status checks:
```php
$github->updateCommitStatus(
    $repositoryName,
    $commitHash,
    $owner,
    'pending',  // or 'success', 'failure'
    'Building...',
    $consoleUrl,
    $siteName
);
```

---

## 6. Container Orchestration

### Docker Architecture

**Base Images:**
- `appwrite/base:0.10.4` - PHP-based runtime
- Framework-specific build images (Node, Python, Flutter, etc.)

**Volume Strategy:**
```yaml
volumes:
  - appwrite-uploads:/storage/uploads
  - appwrite-functions:/storage/functions
  - appwrite-sites:/storage/sites
  - appwrite-builds:/storage/builds
  - appwrite-cache:/storage/cache
  - appwrite-certificates:/storage/certificates
```

**Network Segmentation:**
```yaml
networks:
  - gateway      # Public-facing (Traefik)
  - appwrite     # Internal services
  - runtimes     # Isolated execution environments
```

### Worker Scaling

**Worker Types:**
- `worker-builds` - Build processing
- `worker-functions` - Function execution
- `worker-databases` - Database operations
- `worker-deletes` - Cleanup tasks
- `worker-webhooks` - Webhook delivery
- `worker-mails` - Email sending

Each worker can scale independently based on queue depth.

---

## 7. Key Learnings for Railway Integration

### What We Should Adopt

1. **Atomic Deployments**
   - Store each deployment separately
   - Switch routing atomically
   - Enable instant rollback

2. **Preview URL System**
   - Branch previews for testing
   - Commit previews for verification
   - Unique deployment URLs

3. **Build Queue Architecture**
   - Separate API from build processing
   - Scale workers independently
   - Timeout protection

4. **Framework Detection**
   - Auto-detect from package.json
   - Provide sensible defaults
   - Allow manual override

5. **Environment Variable Injection**
   - Provide VCS context at build time
   - Support build-time secrets
   - Namespace variables properly

### What We Can Simplify for Railway

1. **Use Railway's Native Features**
   - Railway handles container orchestration
   - Railway manages networking
   - Railway provides volumes

2. **Simplified Storage**
   - Use Railway volumes for build artifacts
   - Consider Railway's built-in S3 compatibility
   - Leverage Railway's CDN for static assets

3. **Database Schema**
   - Use existing Postgres instead of MariaDB
   - Leverage Railway's database features
   - Simpler schema focused on deployments

4. **Authentication**
   - Integrate with existing Ogel auth
   - Use Railway's service tokens
   - Leverage Railway API for operations

---

## 8. Recommended Architecture for Ogel Deploy on Railway

### Service Breakdown

```
┌─────────────────────────────────────────────────┐
│              Railway Project                     │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────┐      ┌──────────────┐        │
│  │  API Service │──────│  Postgres    │        │
│  │  (Next.js)   │      │  (Metadata)  │        │
│  └──────┬───────┘      └──────────────┘        │
│         │                                        │
│         │              ┌──────────────┐        │
│         ├──────────────│  Redis       │        │
│         │              │  (Queue)     │        │
│         │              └──────────────┘        │
│         │                                        │
│  ┌──────▼───────┐      ┌──────────────┐        │
│  │Build Worker  │──────│  MongoDB     │        │
│  │(Background)  │      │  (Logs)      │        │
│  └──────┬───────┘      └──────────────┘        │
│         │                                        │
│         │              ┌──────────────┐        │
│         └──────────────│  Volume      │        │
│                        │  (Artifacts) │        │
│                        └──────────────┘        │
└─────────────────────────────────────────────────┘
```

### Core Services

1. **API Service** (Next.js)
   - Handles GitHub webhooks
   - Serves deployment dashboard
   - Manages deployment metadata
   - Enqueues build jobs

2. **Build Worker** (Node.js + Docker)
   - Consumes build queue
   - Clones repositories
   - Executes builds in Docker
   - Uploads artifacts
   - Updates deployment status

3. **Storage Strategy**
   - **Railway Volume**: Build artifacts
   - **Railway CDN**: Static asset delivery
   - **Postgres**: Deployment metadata
   - **Redis**: Job queue + cache
   - **MongoDB**: Build logs

4. **Routing Strategy**
   - Railway's custom domains for production
   - Subdomain pattern for previews: `{branch}.{project}.ogel.dev`
   - Railway's built-in SSL

### Build Worker Implementation

```typescript
// Example build worker
import { Queue, Worker } from 'bullmq';
import Docker from 'dockerode';
import { uploadToRailway } from './storage';

const docker = new Docker();
const connection = { host: 'redis', port: 6379 };

const worker = new Worker('builds', async (job) => {
  const { deploymentId, repo, branch, buildCommand } = job.data;

  // Clone repository
  await exec(`git clone --depth 1 -b ${branch} ${repo} /tmp/${deploymentId}`);

  // Run build in Docker container
  const container = await docker.createContainer({
    Image: 'node:22-alpine',
    WorkingDir: '/app',
    Cmd: ['sh', '-c', `npm install && ${buildCommand}`],
    HostConfig: {
      Binds: [`/tmp/${deploymentId}:/app`],
      Memory: 2048 * 1024 * 1024, // 2GB
      CpuQuota: 100000, // 1 CPU
    },
  });

  await container.start();
  await container.wait();

  // Upload to Railway volume
  await uploadToRailway(`/tmp/${deploymentId}/dist`, deploymentId);

  // Update deployment status
  await updateDeployment(deploymentId, { status: 'ready' });
}, { connection });
```

### Database Schema

```sql
-- Deployments table
CREATE TABLE deployments (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  site_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL, -- pending, building, ready, failed
  commit_hash VARCHAR(40),
  branch VARCHAR(255),
  build_output JSONB,
  build_logs TEXT,
  preview_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Sites table
CREATE TABLE sites (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  project_id UUID NOT NULL,
  repo_url TEXT NOT NULL,
  branch VARCHAR(255) DEFAULT 'main',
  root_directory VARCHAR(255),
  install_command TEXT,
  build_command TEXT,
  output_directory VARCHAR(255),
  framework VARCHAR(50), -- nextjs, vite, etc.
  adapter VARCHAR(20), -- static, ssr
  production_domain TEXT,
  active_deployment_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Domains table
CREATE TABLE domains (
  id UUID PRIMARY KEY,
  site_id UUID NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  deployment_id UUID,
  type VARCHAR(50), -- production, preview, branch, commit
  status VARCHAR(50), -- pending, active, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Build Queue with BullMQ

```typescript
import { Queue } from 'bullmq';

const buildQueue = new Queue('builds', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    timeout: 900000, // 15 minutes
  },
});

// Enqueue build
await buildQueue.add('build-deployment', {
  deploymentId: deployment.id,
  siteId: site.id,
  repo: site.repoUrl,
  branch: deployment.branch,
  commitHash: deployment.commitHash,
  buildCommand: site.buildCommand,
  installCommand: site.installCommand,
  outputDirectory: site.outputDirectory,
});
```

---

## 9. Implementation Roadmap

### Phase 1: MVP (Week 1-2)
- [ ] Basic deployment API (create, list, get)
- [ ] GitHub webhook receiver
- [ ] Simple build worker (no Docker yet)
- [ ] Railway volume storage
- [ ] Static site deployment only
- [ ] Manual domain mapping

### Phase 2: Core Features (Week 3-4)
- [ ] Docker-based builds
- [ ] Framework detection
- [ ] Preview URLs (branch-based)
- [ ] Build logs streaming
- [ ] Automatic SSL

### Phase 3: Advanced (Week 5-6)
- [ ] SSR support (Next.js)
- [ ] PR comment integration
- [ ] Commit status checks
- [ ] Instant rollback
- [ ] Build caching

### Phase 4: Polish (Week 7-8)
- [ ] Dashboard UI
- [ ] Environment variables
- [ ] Custom domains
- [ ] Analytics
- [ ] Monitoring

---

## 10. Cost Considerations

### Railway Pricing Model

**Estimated Monthly Cost (per project):**
- API Service: $5-20 (minimal usage)
- Build Worker: $10-50 (spikes during builds)
- Postgres: $5-10 (metadata only)
- Redis: $5-10 (queue + cache)
- MongoDB: $10-20 (logs)
- Volume: $0.25/GB/month
- Bandwidth: $0.10/GB

**Total Estimate:** $40-120/month per active project

### Optimization Strategies

1. **Build Worker Scaling**
   - Auto-scale based on queue depth
   - Scale to zero when idle
   - Use Railway's sleep mode

2. **Storage Optimization**
   - Compress artifacts (tar.gz)
   - Clean up old deployments
   - Use CDN caching

3. **Database Optimization**
   - Index properly
   - Archive old logs to S3
   - Use connection pooling

---

## 11. Security Considerations

### Build Isolation

**Required Security Measures:**
- Docker container isolation
- Network isolation between builds
- Resource limits (CPU, memory, disk)
- Timeout enforcement
- No access to other deployments

### Secret Management

**Strategy:**
- Store secrets in Postgres (encrypted)
- Inject at build time as env vars
- Never log secrets
- Rotate API keys regularly

### GitHub Integration

**Security:**
- Validate webhook signatures
- Use GitHub App for better permissions
- Store tokens encrypted
- Minimal required scopes

---

## 12. Monitoring & Observability

### Key Metrics

**Build Metrics:**
- Build duration (p50, p95, p99)
- Build success rate
- Queue depth
- Worker utilization

**Deployment Metrics:**
- Deployments per hour
- Failed deployments
- Rollback frequency
- Preview URL usage

**Infrastructure Metrics:**
- CPU/Memory usage
- Storage usage
- Network bandwidth
- Database query performance

### Logging Strategy

**Structured Logging:**
```typescript
{
  timestamp: "2025-11-22T10:30:00Z",
  level: "info",
  service: "build-worker",
  deploymentId: "dep_123",
  siteId: "site_456",
  message: "Build started",
  metadata: {
    framework: "nextjs",
    branch: "main",
    commit: "abc123"
  }
}
```

**Log Storage:**
- Build logs → MongoDB (searchable)
- Application logs → Railway logs
- Metrics → Railway dashboard

---

## Conclusion

Appwrite has built an impressive deployment platform that demonstrates the complexity and sophistication needed for a Vercel/Netlify competitor. Their architecture shows that a production-ready deployment platform requires:

1. **Robust build isolation** via containerization
2. **Queue-based architecture** for scalability
3. **Comprehensive preview URLs** for testing
4. **Deep GitHub integration** for developer experience
5. **Flexible framework support** for broad adoption

For Ogel Deploy on Railway, we can leverage Railway's platform features to simplify much of the infrastructure while maintaining the core developer experience. The key is starting with a solid MVP (static sites + GitHub integration) and iterating based on user feedback.

**Next Steps:**
1. Prototype basic deployment API
2. Set up build worker with Docker
3. Implement GitHub webhook handling
4. Create preview URL system
5. Build minimal dashboard UI

This is an ambitious but achievable project that will significantly differentiate Ogel in the market.
