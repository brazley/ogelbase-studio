# Appwrite Architecture Quick Reference

**Last Updated**: November 22, 2025

---

## Core Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Language** | PHP 8.3+ | Backend API |
| **HTTP Server** | Swoole | Async I/O, WebSocket |
| **API Framework** | Utopia Platform | Modular routing |
| **Database** | MariaDB | Metadata storage |
| **Cache** | Redis | Session + cache |
| **Queue** | Redis Lists | Background jobs |
| **Storage** | S3-compatible | File storage |
| **Proxy** | Traefik | Load balancer + SSL |
| **Container Runtime** | Docker | Function + build execution |

---

## Key Files to Study

```
├── app/http.php                          # HTTP server bootstrap
├── src/Appwrite/Platform/
│   ├── Appwrite.php                      # Module registration
│   ├── Modules/
│   │   └── Sites/
│   │       ├── Module.php                # Sites module
│   │       └── Services/Http.php         # Route registration
│   └── Workers/
│       └── Builds.php                    # Shared build worker
├── docker-compose.yml                    # Service orchestration
└── app/config/
    ├── frameworks.php                    # Supported frameworks
    └── specifications.php                # Compute specs
```

---

## Sites Architecture at a Glance

```
┌─────────────┐
│   REST API  │  POST /v1/sites/{siteId}/deployments
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Redis Queue │  Enqueue build job
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Builds Worker│  Fetch source → Build → Upload
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  S3 Storage │  Store build artifacts
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Traefik Proxy│  Serve static/SSR requests
└─────────────┘
```

---

## API Endpoint Patterns

### Sites
- `POST /v1/sites` - Create site
- `GET /v1/sites/{siteId}` - Get site
- `PATCH /v1/sites/{siteId}` - Update site
- `DELETE /v1/sites/{siteId}` - Delete site
- `GET /v1/sites` - List sites

### Deployments
- `POST /v1/sites/{siteId}/deployments` - Create deployment
- `GET /v1/sites/{siteId}/deployments/{deploymentId}` - Get deployment
- `PATCH /v1/sites/{siteId}/deployments/{deploymentId}/activate` - Activate
- `DELETE /v1/sites/{siteId}/deployments/{deploymentId}` - Delete

### Variables
- `POST /v1/sites/{siteId}/variables` - Create env var
- `GET /v1/sites/{siteId}/variables/{variableId}` - Get variable
- `PATCH /v1/sites/{siteId}/variables/{variableId}` - Update variable
- `DELETE /v1/sites/{siteId}/variables/{variableId}` - Delete variable

---

## Database Schema Patterns

### Sites Table
```sql
sites:
  _id (INT, auto_increment)
  _uid (VARCHAR, user-facing ID)
  projectId (VARCHAR)
  name (VARCHAR)
  framework (VARCHAR: 'nextjs', 'react', 'vue', ...)
  enabled (BOOLEAN)
  deploymentId (VARCHAR, active deployment)
  timeout (INT)
  installCommand (TEXT)
  buildCommand (TEXT)
  outputDirectory (VARCHAR)
  buildRuntime (VARCHAR: 'node-18', 'node-20', ...)
  adapter (VARCHAR: 'static', 'ssr')
  installationId (VARCHAR, GitHub App)
  providerRepositoryId (VARCHAR)
  providerBranch (VARCHAR)
  specification (VARCHAR, compute spec)
```

### Deployments Table
```sql
deployments:
  _id (INT, auto_increment)
  _uid (VARCHAR, user-facing ID)
  siteId (VARCHAR)
  status (VARCHAR: 'pending', 'building', 'ready', 'failed')
  buildTime (INT, seconds)
  size (INT, bytes)
  buildOutput (TEXT, logs)
  sourceType (VARCHAR: 'git', 'upload')
  sourceUrl (VARCHAR)
  buildUrl (VARCHAR, S3 path)
```

---

## Storage Layout

```
/storage/
├── sites/{projectId}/{siteId}/deployments/{deploymentId}/
│   ├── source.tar.gz       # Original source code
│   ├── build.tar.gz        # Built output
│   └── build.log           # Build logs
├── functions/{projectId}/{functionId}/
│   └── ...
└── certificates/
    └── {domain}.crt
```

---

## Worker Types

| Worker | Purpose | Trigger |
|--------|---------|---------|
| **Builds** | Compile Functions + Sites | Queue message |
| **Functions** | Execute function code | HTTP request / event |
| **Deletes** | Cleanup resources | Scheduled |
| **Audits** | Write audit logs | Event |
| **Mails** | Send emails | Queue message |
| **Webhooks** | Deliver webhooks | Event |
| **Certificates** | SSL cert management | Scheduled |
| **Stats/Usage** | Analytics | Scheduled |

---

## Configuration Files

### Frameworks (`app/config/frameworks.php`)
```php
return [
    'nextjs' => [
        'name' => 'Next.js',
        'defaultBuildCommand' => 'npm run build',
        'defaultInstallCommand' => 'npm install',
        'defaultOutputDirectory' => '.next/',
        'adapters' => [
            'static' => ['name' => 'Static Export'],
            'ssr' => ['name' => 'Server-Side Rendering']
        ]
    ],
    // ... more frameworks
];
```

### Specifications (`app/config/specifications.php`)
```php
return [
    'small' => [
        'cpu' => 0.5,
        'memory' => 512,
        'price' => 0.05
    ],
    'medium' => [
        'cpu' => 1.0,
        'memory' => 1024,
        'price' => 0.10
    ],
    // ... more specs
];
```

---

## Authorization Patterns

```php
// Document-level permissions
$site = new Document([
    '$id' => 'site-123',
    '$permissions' => [
        Permission::read(Role::team('team-abc')),
        Permission::update(Role::team('team-abc', 'owner')),
        Permission::delete(Role::team('team-abc', 'owner')),
    ],
    'name' => 'My Site'
]);
```

**Built-in Roles**:
- `Role::any()` - Public
- `Role::users()` - All authenticated
- `Role::team($teamId)` - Team members
- `Role::team($teamId, 'owner')` - Team owners
- `Role::user($userId)` - Specific user

---

## Build Flow Sequence

1. **Trigger**: API creates deployment document
2. **Enqueue**: Add message to `builds` queue
3. **Worker**: Builds worker picks up message
4. **Clone**: Fetch source from Git or storage
5. **Detect**: Auto-detect framework if not specified
6. **Container**: Create Docker container with runtime
7. **Install**: Run `installCommand` (npm install)
8. **Build**: Run `buildCommand` (npm run build)
9. **Package**: Tar the `outputDirectory`
10. **Upload**: Store build artifact to S3
11. **Update**: Mark deployment as `ready`
12. **Notify**: Trigger webhooks + realtime events

---

## TypeScript Patterns

### Generated SDK
```typescript
import { Client, Sites } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('project-id');

const sites = new Sites(client);

// All methods are type-safe
const site = await sites.create(
  'unique()',
  'My Site',
  'nextjs'
);
```

### Realtime Subscriptions
```typescript
// Subscribe to deployment updates
client.subscribe(
  `sites.${siteId}.deployments.${deploymentId}`,
  (response) => {
    console.log('Build status:', response.payload.status);
  }
);
```

---

## Performance Characteristics

### Worker Distribution
- **80%** "Safe" workers (CRUD, reads)
- **20%** "Risky" workers (executions, builds)

### Request Routing
- Execution requests → Risky workers
- Everything else → Safe workers
- Idle workers preferred

### Caching Strategy
- Redis cache for hot paths
- 5-minute TTL for site documents
- Invalidate on updates

### Database Pooling
- Persistent connections via Swoole
- Connection pool per worker
- No connection overhead per request

---

## Critical Design Decisions

1. ✅ **Immutable Deployments**: Never edit in place
2. ✅ **Shared Build Workers**: Functions + Sites use same infrastructure
3. ✅ **Storage Abstraction**: Support multiple providers
4. ✅ **DB-Level Authorization**: Enforce in queries, not code
5. ✅ **Message Queues**: Non-blocking builds
6. ✅ **Auto-Generated SDKs**: Type safety end-to-end

---

## What to Adopt for Our Fork

### ✅ DO Adopt
- Modular architecture (separate modules)
- Shared build infrastructure
- Immutable deployments
- Message queue pattern
- Storage abstraction
- Type generation

### ❌ DON'T Copy
- PHP + Swoole (use Node.js)
- Monolithic deployment (keep services separated)
- Traefik specifics (adapt to our ingress)

---

## Questions to Answer

When implementing in our fork:

1. **Build Runtime**: Docker containers or serverless?
2. **Queue System**: BullMQ, Inngest, or custom?
3. **Storage**: S3, R2, Railway volumes, or hybrid?
4. **Deployment Model**: Monolith or microservices?
5. **Framework Support**: Start with which frameworks?
6. **SSR Strategy**: Node.js runtime or edge functions?

---

## Resources

- **Codebase**: `/Users/quikolas/Documents/Open Source Repos/appwrite-main`
- **Main Docs**: `README.md`, `CONTRIBUTING.md`
- **Architecture Diagram**: `docs/specs/overview.drawio.svg`
- **Module Pattern**: `src/Appwrite/Platform/Modules/Sites/`
- **Build Worker**: `src/Appwrite/Platform/Modules/Functions/Workers/Builds.php`

---

**Next**: Design our Sites module structure based on these patterns.
