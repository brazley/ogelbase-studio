# Appwrite Architecture Overview

**Date**: November 22, 2025
**Analyzed by**: Jordan Kim (Full-Stack TypeScript Architect)
**Purpose**: Understand Appwrite's unified backend + frontend deployment platform architecture

---

## Executive Summary

Appwrite is a **monolithic microservices platform** that orchestrates backend services (Auth, Database, Storage, Functions) alongside frontend deployment (Sites) through a unified API layer. The architecture leverages **PHP + Swoole** for high-performance async HTTP handling, **Docker containerization** for all services, and a **message queue system** for background processing.

**Key Innovation**: Sites is treated as a **first-class citizen** alongside backend services - not an afterthought. Deployments go through the same build worker infrastructure as Functions.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Applications                           │
│  Web │ Flutter │ iOS │ Android │ Server SDKs │ GraphQL │ REST       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Traefik Load Balancer                             │
│  - SSL Termination (Let's Encrypt auto-provisioning)                │
│  - Routing (API, Console, Sites, Custom Domains)                    │
│  - Load balancing across Swoole workers                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Appwrite Core (PHP + Swoole)                    │
│  ┌─────────────────┬─────────────────┬─────────────────┐            │
│  │  REST API       │  GraphQL API    │  Realtime API   │            │
│  │  (80% traffic)  │  (flexible)     │  (WebSocket)    │            │
│  └─────────────────┴─────────────────┴─────────────────┘            │
│                                                                       │
│  ┌───────────────────────────────────────────────────────┐          │
│  │              Module Layer (Utopia Platform)            │          │
│  │  - Console (admin UI)                                  │          │
│  │  - Databases                                           │          │
│  │  - Functions                                           │          │
│  │  - Sites ★★★ (frontend hosting)                        │          │
│  │  - Projects                                            │          │
│  │  - Proxy (custom domains)                              │          │
│  │  - Tokens                                              │          │
│  └───────────────────────────────────────────────────────┘          │
│                                                                       │
│  ┌───────────────────────────────────────────────────────┐          │
│  │              Security & Request Layer                  │          │
│  │  - Authorization (ACL + RLS-like permissions)          │          │
│  │  - Rate limiting                                       │          │
│  │  - Request validation                                  │          │
│  │  - Audit logging                                       │          │
│  └───────────────────────────────────────────────────────┘          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────────────┐
          │               │                       │
          ▼               ▼                       ▼
    ┌─────────┐     ┌─────────┐         ┌───────────────┐
    │ MariaDB │     │  Redis  │         │ Message Queue │
    │ (Meta)  │     │ (Cache) │         │   (Redis)     │
    └─────────┘     └─────────┘         └───────┬───────┘
                                                 │
          ┌──────────────────────────────────────┼───────────────┐
          │                                      │               │
          ▼                                      ▼               ▼
    ┌──────────┐                          ┌──────────┐    ┌──────────┐
    │  Builds  │                          │Functions │    │  Deletes │
    │  Worker  │                          │  Worker  │    │  Worker  │
    └────┬─────┘                          └────┬─────┘    └──────────┘
         │                                     │
         ▼                                     ▼
    ┌──────────────────────┐          ┌──────────────────┐
    │ Executor (Docker/K8S)│          │   Executor       │
    │ - Functions builds   │          │ - Runtime exec   │
    │ - Sites builds       │          │ - Function runs  │
    └──────────────────────┘          └──────────────────┘

Additional Workers:
- Audits, Mails, Messaging, Migrations, Stats, Usage, Webhooks, Certificates
```

---

## 2. Core Architecture Principles

### 2.1 Monolithic Microservices Hybrid

**Philosophy**: Deployed as single unit, architected as microservices

```php
// Appwrite Platform Registration
class Appwrite extends Platform
{
    public function __construct()
    {
        parent::__construct(new Core());
        $this->addModule(new Databases\Module());
        $this->addModule(new Functions\Module());
        $this->addModule(new Sites\Module());      // ★ Sites = first-class
        $this->addModule(new Projects\Module());
        $this->addModule(new Console\Module());
        $this->addModule(new Proxy\Module());
    }
}
```

**Benefits**:
- ✅ Easy local development (single `docker compose up`)
- ✅ Simple deployment (single container image)
- ✅ Clear service boundaries (but no network overhead)
- ✅ Easy to scale individual workers independently

### 2.2 PHP + Swoole for Performance

**Why PHP?**
- Mature ecosystem for web APIs
- Strong typing with PHP 8.3+
- Synchronous programming model (easier to reason about)

**Why Swoole?**
- Async I/O without callback hell
- Persistent connection pooling (DB, Redis)
- Built-in WebSocket support for Realtime
- Worker-based request distribution

```php
// HTTP server with intelligent worker routing
$http = new Server(
    host: "0.0.0.0",
    port: System::getEnv('PORT', 80),
    mode: SWOOLE_PROCESS,
);

// Risky vs Safe worker distribution
// Execution requests → dedicated "risky" workers
// CRUD requests → any available worker
function dispatch(Server $server, int $fd, int $type, $data = null): int {
    // Smart routing based on request pattern
    if (str_starts_with($request, 'POST') && str_contains($request, '/executions')) {
        $risky = true; // Route to dedicated worker pool
    }
}
```

**Performance Characteristics**:
- 80% of workers handle "safe" requests (CRUD, reads)
- 20% of workers handle "risky" requests (function executions, builds)
- Idle workers are preferred for new requests
- Connection pooling reduces DB overhead

---

## 3. Sites Module Deep Dive

### 3.1 Sites as First-Class Module

**Location**: `src/Appwrite/Platform/Modules/Sites/`

**Architecture**:
```
Sites/
├── Module.php                    # Module registration
├── Services/
│   └── Http.php                  # HTTP route registration
└── Http/                         # REST API endpoints
    ├── Sites/
    │   ├── Create.php            # POST /v1/sites
    │   ├── Get.php               # GET /v1/sites/{siteId}
    │   ├── Update.php            # PATCH /v1/sites/{siteId}
    │   ├── Delete.php            # DELETE /v1/sites/{siteId}
    │   └── XList.php             # GET /v1/sites
    ├── Deployments/
    │   ├── Create.php            # Manual deployment
    │   ├── Vcs/Create.php        # Git-triggered deployment
    │   ├── Template/Create.php   # Template deployment
    │   └── Download/Get.php      # Download deployment artifacts
    ├── Variables/                # Environment variables
    ├── Logs/                     # Deployment logs
    ├── Frameworks/               # Supported frameworks
    └── Templates/                # Pre-built templates
```

### 3.2 Site Creation Flow

```typescript
// Equivalent TypeScript types (generated from PHP models)
interface Site {
  $id: string;
  name: string;
  framework: Framework;           // 'nextjs' | 'react' | 'vue' | ...
  enabled: boolean;
  logging: boolean;
  timeout: number;                // Request timeout in seconds

  // Build configuration
  installCommand: string;         // 'npm install'
  buildCommand: string;           // 'npm run build'
  outputDirectory: string;        // 'dist/' or '.next/'
  buildRuntime: string;           // 'node-18' | 'node-20'

  // Rendering strategy
  adapter: 'static' | 'ssr';      // Static site or SSR
  fallbackFile: string;           // 'index.html' for SPAs

  // VCS integration (GitHub, GitLab, etc.)
  installationId: string;         // GitHub App installation
  providerRepositoryId: string;   // Repo ID
  providerBranch: string;         // 'main' or 'production'
  providerRootDirectory: string;  // Monorepo path
  providerSilentMode: boolean;    // Skip commit comments

  // Deployment state
  deploymentId: string;           // Active deployment
  specification: string;          // Compute resources
}
```

**Database Schema** (MariaDB):
```sql
CREATE TABLE sites (
  _id INT AUTO_INCREMENT PRIMARY KEY,
  _uid VARCHAR(255) UNIQUE,          -- User-facing ID
  enabled BOOLEAN,
  name VARCHAR(255),
  framework VARCHAR(64),
  deploymentId VARCHAR(255),         -- Active deployment reference
  timeout INT,
  installCommand TEXT,
  buildCommand TEXT,
  outputDirectory VARCHAR(255),
  buildRuntime VARCHAR(64),
  adapter VARCHAR(16),
  installationId VARCHAR(255),       -- VCS installation
  providerRepositoryId VARCHAR(255),
  providerBranch VARCHAR(128),
  repositoryId VARCHAR(255),         -- Internal repository document
  specification VARCHAR(64),         -- Compute spec
  INDEX (projectId),
  INDEX (enabled),
  INDEX (deploymentId)
);
```

### 3.3 Build & Deployment Flow

**1. Deployment Trigger**:
```
User triggers deployment →
  POST /v1/sites/{siteId}/deployments
    ↓
  Create deployment document in DB
    ↓
  Enqueue build message to Redis queue
```

**2. Builds Worker** (`src/Appwrite/Platform/Modules/Functions/Workers/Builds.php`):

**Key Insight**: Functions and Sites **share the same build worker**!

```php
class Builds extends Action
{
    public function action(
        Message $message,
        Device $deviceForFunctions,   // Storage for Functions
        Device $deviceForSites,       // Storage for Sites ★
        Executor $executor,           // Build runner
    ): void {
        $type = $payload['type'];

        switch ($type) {
            case BUILD_TYPE_DEPLOYMENT:  // Functions OR Sites
                $this->buildDeployment(
                    $deviceForFunctions,
                    $deviceForSites,      // ★ Same worker handles both
                    $executor,
                    $resource,            // Function or Site document
                    $deployment
                );
                break;
        }
    }
}
```

**3. Build Execution**:
```
Builds Worker →
  Fetch source code (Git clone OR uploaded tarball) →
  Detect framework (if not specified) →
  Create Docker container with build runtime →
  Execute: installCommand → buildCommand →
  Package output directory →
  Upload to storage (deviceForSites) →
  Update deployment status →
  Trigger webhooks & realtime events
```

**4. Static Site Serving**:
```
Request: https://myapp-abc123.appwrite.site/about
  ↓
Traefik routes to Appwrite core
  ↓
Proxy module reads site document
  ↓
Fetch deployment from storage
  ↓
Serve file from deployment package
  ↓
Return with correct Content-Type headers
```

**5. SSR Site Serving**:
```
Request: https://myapp-abc123.appwrite.site/blog/post-1
  ↓
Traefik routes to Appwrite core
  ↓
Proxy module identifies SSR adapter
  ↓
Forward request to Executor runtime (Node.js process)
  ↓
Runtime executes SSR handler (Next.js, Nuxt, etc.)
  ↓
Return rendered HTML + headers
```

---

## 4. API Layer Design

### 4.1 Multiple API Protocols

**REST API** (Primary):
```
POST   /v1/sites
GET    /v1/sites/{siteId}
PATCH  /v1/sites/{siteId}
DELETE /v1/sites/{siteId}
GET    /v1/sites

POST   /v1/sites/{siteId}/deployments
GET    /v1/sites/{siteId}/deployments/{deploymentId}
PATCH  /v1/sites/{siteId}/deployments/{deploymentId}/activate
```

**GraphQL API**:
```graphql
mutation CreateSite($name: String!, $framework: String!) {
  sitesCreate(name: $name, framework: $framework) {
    id
    name
    framework
    enabled
  }
}

query GetSite($siteId: String!) {
  sitesGet(siteId: $siteId) {
    id
    deployments {
      edges {
        node {
          id
          status
          buildOutput
        }
      }
    }
  }
}
```

**Realtime API** (WebSocket):
```javascript
// Subscribe to deployment updates
client.subscribe('sites.123.deployments.456', response => {
  console.log('Build status:', response.data.status);
  console.log('Build output:', response.data.buildOutput);
});
```

### 4.2 Type-Safe API Architecture

**Utopia Platform Pattern**:

Every endpoint is a **separate PHP class** implementing `Action`:

```php
namespace Appwrite\Platform\Modules\Sites\Http\Sites;

class Create extends Base
{
    public function __construct()
    {
        $this
            ->setHttpMethod(Action::HTTP_REQUEST_METHOD_POST)
            ->setHttpPath('/v1/sites')
            ->desc('Create site')
            ->label('scope', 'sites.write')
            ->label('sdk', new Method(
                namespace: 'sites',
                group: 'sites',
                name: 'create',
                auth: [AuthType::KEY],
            ))
            ->param('siteId', '', new CustomId())
            ->param('name', '', new Text(128))
            ->param('framework', '', new WhiteList(['nextjs', 'react']))
            ->param('enabled', true, new Boolean())
            // ... more params
            ->inject('response')
            ->inject('dbForProject')
            ->callback($this->action(...));
    }

    public function action(
        string $siteId,
        string $name,
        string $framework,
        bool $enabled,
        Response $response,
        Database $dbForProject
    ) {
        // Implementation
    }
}
```

**Benefits**:
- ✅ Each endpoint is self-documenting
- ✅ Auto-generates SDK code for all client languages
- ✅ Compile-time parameter validation
- ✅ OpenAPI/Swagger spec generation
- ✅ Clear dependency injection

---

## 5. Service Communication Patterns

### 5.1 Synchronous Communication

**Direct Database Access**:
```php
// All services access shared MariaDB
$site = $dbForProject->getDocument('sites', $siteId);
$deployment = $dbForProject->getDocument('deployments', $deploymentId);

// Atomic updates with optimistic locking
$site->setAttribute('deploymentId', $deployment->getId());
$dbForProject->updateDocument('sites', $site->getId(), $site);
```

**Shared Cache Layer**:
```php
// Redis caching for hot paths
$cache->get("site:{$siteId}");
$cache->set("site:{$siteId}", $site, 300); // 5 min TTL
```

### 5.2 Asynchronous Communication

**Message Queue Pattern**:

```php
// API endpoint enqueues work
$queueForEvents->setParam('siteId', $site->getId());
$queueForEvents->trigger();

// Builds worker processes queue
class Builds extends Action {
    public function action(Message $message) {
        $payload = $message->getPayload();
        // Process build
    }
}
```

**Queue Infrastructure**:
- **Transport**: Redis Lists (LPUSH/BRPOP)
- **Retry Logic**: Failed jobs → retry queue
- **Dead Letter Queue**: Max retries → DLQ
- **Monitoring**: Queue depth tracking

**Available Queues**:
```
- queueForBuilds      # Functions + Sites builds
- queueForFunctions   # Function executions
- queueForWebhooks    # Outbound webhook delivery
- queueForEvents      # Internal event bus
- queueForMails       # Email sending
- queueForDeletes     # Resource cleanup
- queueForAudits      # Audit log writes
- queueForStatsUsage  # Usage metrics
- queueForRealtime    # WebSocket events
```

---

## 6. Storage Architecture

### 6.1 File Storage Abstraction

**Device Layer** (`Utopia\Storage\Device`):

```php
interface Device
{
    public function write(string $path, string $data): bool;
    public function read(string $path): string;
    public function delete(string $path): bool;
    public function exists(string $path): bool;
}
```

**Implementations**:
- `Local` - Filesystem storage (dev)
- `S3` - AWS S3 / MinIO (prod)
- `DigitalOcean Spaces` - Object storage
- `Backblaze B2` - Cost-effective storage

**Storage Separation**:
```
/storage/
├── uploads/      # User uploads (images, files)
├── functions/    # Function code + builds
├── sites/        # Site deployments + builds
├── builds/       # Temporary build artifacts
├── cache/        # Cached responses
└── certificates/ # SSL certificates
```

### 6.2 Sites Storage Layout

```
/storage/sites/
├── {projectId}/
│   ├── {siteId}/
│   │   ├── deployments/
│   │   │   ├── {deploymentId}/
│   │   │   │   ├── source.tar.gz     # Original source
│   │   │   │   ├── build.tar.gz      # Built output
│   │   │   │   └── build.log         # Build logs
│   │   │   └── active -> {deploymentId}/  # Symlink
```

**Key Design Decision**: Deployments are **immutable**. New deployment = new directory. Rollback = update symlink.

---

## 7. Database Schema Patterns

### 7.1 Multi-Tenancy via Project Isolation

**Two Database Levels**:

1. **Platform Database** (`dbForPlatform`):
   - Organizations, Teams, Projects
   - VCS installations
   - Global repositories
   - Billing, subscriptions

2. **Project Database** (`dbForProject`):
   - Sites, Deployments
   - Functions, Executions
   - User data, Auth
   - Files metadata

**Pattern**:
```php
// Platform-level data
$installation = $dbForPlatform->getDocument('installations', $installationId);

// Project-scoped data
$site = $dbForProject->getDocument('sites', $siteId);
```

### 7.2 Authorization Model

**Document-Level Permissions**:

```php
$site = $dbForProject->createDocument('sites', new Document([
    '$id' => $siteId,
    '$permissions' => [
        Permission::read(Role::team($teamId)),
        Permission::update(Role::team($teamId, 'owner')),
        Permission::update(Role::team($teamId, 'developer')),
        Permission::delete(Role::team($teamId, 'owner')),
    ],
    'name' => $name,
    // ...
]));
```

**Built-in Roles**:
- `Role::any()` - Public access
- `Role::users()` - All authenticated users
- `Role::team($teamId)` - Team members
- `Role::team($teamId, 'owner')` - Team owners
- `Role::user($userId)` - Specific user

**Query Enforcement**:
```php
// Authorization automatically filters results
$sites = $dbForProject->find('sites', [
    Query::equal('enabled', true)
]);
// Only returns sites user has read permission for
```

---

## 8. TypeScript Integration Points

### 8.1 SDK Generation

**Auto-Generated SDKs** from PHP annotations:

```typescript
// Generated TypeScript SDK
import { Client, Sites } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('my-project-id');

const sites = new Sites(client);

// Type-safe API calls
const site = await sites.create(
  'unique()',           // siteId
  'My Next.js Site',    // name
  'nextjs',             // framework
  true,                 // enabled
  true,                 // logging
  30,                   // timeout
  'npm install',        // installCommand
  'npm run build',      // buildCommand
  '.next/',             // outputDirectory
  'node-20',            // buildRuntime
  'ssr'                 // adapter
);

// TypeScript knows the return type
console.log(site.$id, site.framework);
```

### 8.2 Shared Type Patterns

**Database Models → TypeScript Types**:

```typescript
// Server-side types
export interface Site {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  name: string;
  framework: Framework;
  enabled: boolean;
  deploymentId: string;
  // ...
}

export interface Deployment {
  $id: string;
  siteId: string;
  status: 'pending' | 'building' | 'ready' | 'failed';
  buildOutput: string;
  buildTime: number;
  size: number;
  // ...
}

// Client-side state
interface DeploymentState {
  site: Site;
  currentDeployment: Deployment | null;
  deployments: Deployment[];
  isBuilding: boolean;
  buildLogs: string[];
}
```

### 8.3 Realtime Type Safety

```typescript
import { Client, RealtimeChannel } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('project-id');

// Subscribe to deployment updates
const channel = `sites.${siteId}.deployments.${deploymentId}`;

const unsubscribe = client.subscribe<Deployment>(
  channel,
  (response) => {
    // TypeScript knows response.payload is Deployment
    console.log('Status:', response.payload.status);
    console.log('Build output:', response.payload.buildOutput);
  }
);
```

---

## 9. Custom Domains & Proxy Module

### 9.1 Custom Domain Architecture

**Traefik Dynamic Configuration**:

```yaml
# Auto-generated Traefik routing rules
http:
  routers:
    site-custom-domain:
      rule: "Host(`myapp.com`)"
      service: appwrite-proxy
      tls:
        certResolver: letsencrypt

  services:
    appwrite-proxy:
      loadBalancer:
        servers:
          - url: "http://appwrite:80"
```

**Domain Verification Flow**:
```
User adds custom domain →
  DNS verification (TXT record) →
  SSL certificate request (Let's Encrypt) →
  Traefik rule creation →
  Domain active
```

### 9.2 SSL Certificate Automation

**Certificates Worker**:
```php
class Certificates extends Action
{
    public function action() {
        // Check for domains needing certificates
        $domains = $dbForPlatform->find('domains', [
            Query::equal('certificateId', ''),
            Query::equal('verification', true)
        ]);

        foreach ($domains as $domain) {
            // Request certificate from Let's Encrypt
            $certificate = $this->letsEncrypt->createCertificate(
                $domain->getAttribute('domain')
            );

            // Store certificate
            $deviceForCertificates->write(
                "certificates/{$certificate->getId()}.crt",
                $certificate->getCertificate()
            );

            // Update domain
            $domain->setAttribute('certificateId', $certificate->getId());
            $dbForPlatform->updateDocument('domains', $domain->getId(), $domain);

            // Reload Traefik
            $this->reloadTraefik();
        }
    }
}
```

---

## 10. Lessons for Supabase Studio Fork

### 10.1 Architectural Patterns to Adopt

#### ✅ Module-Based Organization
```typescript
// Apply to our codebase
platform/
├── modules/
│   ├── auth/
│   ├── database/
│   ├── storage/
│   ├── functions/
│   └── sites/        // NEW: Unified deployment module
│       ├── api/      // REST endpoints
│       ├── workers/  // Build workers
│       └── proxy/    // Serving logic
```

#### ✅ Unified Build Infrastructure
**Key Insight**: Don't create separate build systems for Functions vs. Sites. Single worker = consistent builds.

```typescript
// Shared build worker
interface BuildRequest {
  type: 'function' | 'site';
  runtime: string;
  buildCommand: string;
  installCommand: string;
  outputDirectory: string;
}

class BuildsWorker {
  async processBuild(request: BuildRequest) {
    // Same logic for Functions AND Sites
    switch (request.type) {
      case 'function':
        return this.buildFunction(request);
      case 'site':
        return this.buildSite(request);
    }
  }
}
```

#### ✅ Storage Abstraction Layer
```typescript
// Don't hardcode S3 - use abstraction
interface StorageDevice {
  write(path: string, data: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

class S3Device implements StorageDevice { /* ... */ }
class LocalDevice implements StorageDevice { /* ... */ }
class R2Device implements StorageDevice { /* ... */ }
```

#### ✅ Immutable Deployments
```typescript
// Never mutate deployments - always create new
interface Deployment {
  id: string;
  siteId: string;
  version: number;
  status: 'building' | 'ready' | 'failed';
  artifacts: {
    sourceUrl: string;      // Immutable
    buildUrl: string;       // Immutable
    buildLog: string;       // Immutable
  };
  createdAt: string;
}

// Rollback = update site.activeDeploymentId
// No data loss, instant rollbacks
```

#### ✅ Message Queue for Background Work
```typescript
// Use Redis + BullMQ or similar
import { Queue, Worker } from 'bullmq';

const buildsQueue = new Queue('builds', {
  connection: redis
});

// API enqueues work
await buildsQueue.add('build-site', {
  siteId: site.id,
  deploymentId: deployment.id,
  source: 'git'
});

// Worker processes jobs
const buildsWorker = new Worker('builds', async (job) => {
  const { siteId, deploymentId } = job.data;
  await buildSite(siteId, deploymentId);
}, { connection: redis });
```

### 10.2 What NOT to Copy

#### ❌ PHP + Swoole Stack
**Why**: Our codebase is TypeScript/Node.js. Don't rewrite.

**Alternative**: Use Node.js with clustering + Redis for similar concurrency.

#### ❌ Monolithic Deployment
**Why**: Supabase Studio is already split into services (studio, auth, realtime, storage). Keep that separation.

**Apply**: Modular architecture **within** services, not monolithic deployment.

#### ❌ Traefik for Everything
**Why**: Supabase likely uses different ingress (Nginx, Envoy, cloud LB).

**Apply**: Understand the routing pattern, adapt to our stack.

### 10.3 Key Takeaways

1. **Sites = First-Class Module**: Don't bolt on frontend hosting as afterthought. Design it alongside backend services.

2. **Shared Build Infrastructure**: Functions and Sites should use same build workers, same Docker executors, same storage patterns.

3. **Immutable Deployments**: Never edit in place. Create new deployment, swap pointer. Instant rollbacks, no data loss.

4. **Type Safety Everywhere**: Generate types from database schema. Use TypeScript end-to-end.

5. **Message Queues for Heavy Work**: Don't block API requests. Enqueue builds, process async, stream logs via WebSocket.

6. **Storage Abstraction**: Don't hardcode S3. Support multiple providers (S3, R2, local, etc.).

7. **Authorization at DB Layer**: Enforce permissions in database queries, not application logic.

8. **One Worker Type per Concern**: Builds worker, Functions worker, Deletes worker. Don't make god workers.

9. **Realtime Event Bus**: All state changes → event bus → WebSocket → client updates.

10. **Auto-Generated SDKs**: API annotations → TypeScript SDK → type-safe client code.

---

## 11. Implementation Roadmap

### Phase 1: Architecture Foundation
- [ ] Create modular structure: `platform/modules/sites/`
- [ ] Set up message queue infrastructure (BullMQ + Redis)
- [ ] Implement storage abstraction layer
- [ ] Design database schema for sites + deployments

### Phase 2: Core Build System
- [ ] Shared build worker (Functions + Sites)
- [ ] Docker executor integration
- [ ] Build log streaming (WebSocket)
- [ ] Artifact storage

### Phase 3: API Layer
- [ ] REST API endpoints (CRUD for sites)
- [ ] Deployment endpoints (create, list, rollback)
- [ ] GraphQL schema (if applicable)
- [ ] TypeScript SDK generation

### Phase 4: Serving & Proxy
- [ ] Static site serving
- [ ] SSR adapter integration
- [ ] Custom domain support
- [ ] SSL certificate automation

### Phase 5: Developer Experience
- [ ] CLI tool for local development
- [ ] Deployment previews
- [ ] Environment variables
- [ ] Build caching

---

## 12. Conclusion

Appwrite's architecture demonstrates that **backend + frontend deployment** can be unified without compromise. The key insights:

1. **Treat Sites as a first-class module** alongside Auth, Database, Storage
2. **Share infrastructure** (build workers, storage, permissions) between Functions and Sites
3. **Use immutable deployments** with pointer swapping for instant rollbacks
4. **Leverage message queues** to make builds non-blocking
5. **Generate type-safe SDKs** from API definitions
6. **Abstract storage** to support multiple providers

For our Supabase Studio fork, we should adopt these patterns within our existing Node.js/TypeScript stack, not blindly copy PHP-specific implementations.

**Next Steps**:
1. Design our Sites module structure
2. Prototype shared build worker
3. Validate storage abstraction with Railway volumes
4. Build proof-of-concept deployment

---

**Analyzed by**: Jordan Kim
**Date**: November 22, 2025
**Appwrite Version**: 1.8.0 (from README)
