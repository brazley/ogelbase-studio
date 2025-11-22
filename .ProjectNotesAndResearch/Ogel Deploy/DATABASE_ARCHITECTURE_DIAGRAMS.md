# Database Architecture Visual Diagrams

## Appwrite Multi-Tenancy Model

### Namespace-Based Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                    MariaDB Database Instance                     │
│                        (appwrite schema)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │ Console Namespace│  │ Project Namespace │  │ Project Namespace││
│  │   (_console)     │  │      (_123)       │  │      (_456)    ││
│  ├─────────────────┤  ├──────────────────┤  ├────────────────┤│
│  │ Table Structure: │  │ Table Structure:  │  │ Table Structure:││
│  │                  │  │                   │  │                ││
│  │ • projects       │  │ • databases       │  │ • databases    ││
│  │ • users          │  │ • _123_users      │  │ • _456_users   ││
│  │ • teams          │  │ • _123_database_1 │  │ • _456_database_2││
│  │ • memberships    │  │ • _123_docs       │  │ • _456_docs    ││
│  │ • rules          │  │ • _123_files      │  │ • _456_files   ││
│  │                  │  │                   │  │                ││
│  │ [Platform Data]  │  │  [Tenant Data]    │  │ [Tenant Data]  ││
│  └─────────────────┘  └──────────────────┘  └────────────────┘│
│                                                                  │
│  Query Example for Project 123:                                │
│  SELECT * FROM _123_users WHERE status = 'active'              │
│  → Automatic namespace routing to correct tables               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Access Flow

### Request Processing

```
┌──────────────┐
│ User Request │
│  (Client)    │
└──────┬───────┘
       │
       │ HTTP Request with API Key
       │ x-appwrite-project: project123
       ▼
┌──────────────────┐
│ Appwrite API     │
│  Entry Point     │
└──────┬───────────┘
       │
       │ 1. Validate API Key
       │ 2. Load Project Document
       ▼
┌──────────────────┐
│ Project Context  │
│ Resolution       │
│                  │
│ projectId: "abc" │
│ sequence: 123    │
└──────┬───────────┘
       │
       │ 3. Initialize Database
       ▼
┌──────────────────────────┐
│ Database Object          │
│                          │
│ $db->setTenant(123)      │
│ $db->setNamespace('_123')│
└──────┬───────────────────┘
       │
       │ 4. Execute Query
       ▼
┌─────────────────────────────────┐
│ MariaDB Query Execution          │
│                                  │
│ Physical Query:                  │
│ SELECT * FROM _123_users         │
│ WHERE id = 'user456'             │
│                                  │
│ (Namespace automatically         │
│  prefixed to table name)         │
└─────────┬────────────────────────┘
          │
          │ 5. Return Results
          ▼
┌─────────────────┐
│ JSON Response   │
└─────────────────┘
```

---

## Proposed Integration Architecture

### Two-Database System

```
┌────────────────────────────────────────────────────────────────┐
│                      Railway Platform                           │
│                                                                 │
│  ┌───────────────────────────┐  ┌──────────────────────────┐  │
│  │    PostgreSQL Instance    │  │   MariaDB Instance       │  │
│  │      (Studio Backend)     │  │   (Appwrite Backend)     │  │
│  │                           │  │                          │  │
│  │  Port: 5432               │  │  Port: 3306              │  │
│  │  Network: Private         │  │  Network: Private        │  │
│  ├───────────────────────────┤  ├──────────────────────────┤  │
│  │                           │  │                          │  │
│  │  Schema: public           │  │  Schema: appwrite        │  │
│  │                           │  │                          │  │
│  │  Tables:                  │  │  Namespaces:             │  │
│  │  • users                  │  │  • _console (platform)   │  │
│  │  • organizations          │  │  • _123 (project 1)      │  │
│  │  • projects               │  │  • _456 (project 2)      │  │
│  │  • platform_databases     │  │  • _789 (project 3)      │  │
│  │  • appwrite_projects      │  │                          │  │
│  │    (mapping table)        │  │  Collections per namespace│  │
│  │                           │  │  • databases             │  │
│  │  RLS Policies:            │  │  • _XXX_users            │  │
│  │  • Row-level security     │  │  • _XXX_database_N       │  │
│  │  • Tenant isolation       │  │  • _XXX_documents        │  │
│  │    enforced by DB         │  │                          │  │
│  │                           │  │  Tenant ID:              │  │
│  │  Use Case:                │  │  • App-level filtering   │  │
│  │  - User authentication    │  │                          │  │
│  │  - Org management         │  │  Use Case:               │  │
│  │  - Project metadata       │  │  - App databases         │  │
│  │  - Billing                │  │  - Document storage      │  │
│  │  - Deployment tracking    │  │  - File metadata         │  │
│  └───────────────────────────┘  └──────────────────────────┘  │
│              │                            │                    │
│              └────────────┬───────────────┘                    │
│                           │                                    │
│                  ┌────────▼─────────┐                          │
│                  │  Redis Instance  │                          │
│                  │  (Shared Cache)  │                          │
│                  │                  │                          │
│                  │  Port: 6379      │                          │
│                  │  Network: Private│                          │
│                  ├──────────────────┤                          │
│                  │                  │                          │
│                  │  Usage:          │                          │
│                  │  • Session cache │                          │
│                  │    (both systems)│                          │
│                  │  • API responses │                          │
│                  │  • Rate limiting │                          │
│                  │  • Query cache   │                          │
│                  └──────────────────┘                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Project Deployment

### End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Deploys Project                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  Studio API: Create Project           │
        │  POST /api/platform/projects          │
        └───────────────────┬───────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
    ┌──────────────────┐    ┌─────────────────────┐
    │  PostgreSQL      │    │  Appwrite API       │
    │  (Studio DB)     │    │  (via HTTP)         │
    │                  │    │                     │
    │  INSERT INTO     │    │  POST /v1/projects  │
    │  projects (...)  │    │                     │
    │                  │    │  Request Body:      │
    │  Returns:        │    │  {                  │
    │  project_id,     │    │    projectId,       │
    │  database_ref    │    │    name,            │
    └──────┬───────────┘    │    teamId           │
           │                │  }                  │
           │                └──────────┬──────────┘
           │                           │
           │                           ▼
           │               ┌──────────────────────┐
           │               │  MariaDB             │
           │               │  (Appwrite DB)       │
           │               │                      │
           │               │  1. Assign sequence  │
           │               │     (e.g., 123)      │
           │               │                      │
           │               │  2. Create namespace │
           │               │     (_123)           │
           │               │                      │
           │               │  3. Insert project   │
           │               │     metadata         │
           │               │                      │
           │               │  Returns:            │
           │               │  appwrite_project_id,│
           │               │  api_keys            │
           │               └──────────┬───────────┘
           │                          │
           │                          ▼
           │               ┌──────────────────────┐
           │               │  Studio API          │
           │               │  (Store Mapping)     │
           │               │                      │
           │               │  INSERT INTO         │
           │               │  appwrite_projects   │
           │               │  (                   │
           │               │    platform_db_id,   │
           │               │    appwrite_proj_id, │
           │◄──────────────│    api_key_encrypted │
           │               │  )                   │
           │               └──────────────────────┘
           │
           ▼
┌──────────────────────┐
│  Deployment Manifest │
│  (Railway Config)    │
│                      │
│  Environment Vars:   │
│  • APPWRITE_ENDPOINT │
│  • APPWRITE_PROJECT  │
│  • APPWRITE_API_KEY  │
│                      │
│  App can now use     │
│  Appwrite client SDK │
└──────────────────────┘
```

---

## Security Boundaries

### Multi-Layer Defense

```
┌─────────────────────────────────────────────────────────────────┐
│                       Security Layers                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Network Isolation                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Railway Private Network                                │    │
│  │  • No public database access                            │    │
│  │  • Internal DNS resolution                              │    │
│  │  • TLS between services                                 │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  Layer 2: Authentication                                        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Studio API                     Appwrite API            │    │
│  │  • JWT tokens                   • API Keys              │    │
│  │  • Session cookies              • Session cookies       │    │
│  │  • OAuth                        • OAuth providers       │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  Layer 3: Project Context Validation                            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  • Validate API key belongs to project                 │    │
│  │  • Load project metadata                               │    │
│  │  • Set tenant context (sequence number)                │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  Layer 4: Tenant Isolation                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL (Studio):          MariaDB (Appwrite):     │    │
│  │  • RLS policies               • Namespace routing      │    │
│  │    WHERE tenant_id =            Table: _123_users      │    │
│  │    current_setting(...)       • Tenant ID filter       │    │
│  │                                 WHERE (implicit)        │    │
│  │  ✅ Database enforced          ⚠️ Application enforced │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  Layer 5: Document-Level Permissions (Appwrite Only)            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  • Read permissions: ['role:all', 'user:123']          │    │
│  │  • Write permissions: ['user:123', 'team:456/owner']   │    │
│  │  • Collection vs document security toggle              │    │
│  │  • Role-based access control                           │    │
│  └────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  Layer 6: Audit Logging                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  • All database operations logged                      │    │
│  │  • User actions audited                                │    │
│  │  • Admin access tracked                                │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comparison: Isolation Models

### PostgreSQL RLS (Studio)

```
┌────────────────────────────────────────────────────────┐
│                PostgreSQL Database                      │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Table: users (shared across all tenants)              │
│  ┌──────────────────────────────────────────────────┐ │
│  │ id  │ tenant_id │ email         │ name           │ │
│  ├─────┼───────────┼───────────────┼────────────────┤ │
│  │ 1   │ 100       │ user@org1.com │ Alice          │ │
│  │ 2   │ 100       │ bob@org1.com  │ Bob            │ │
│  │ 3   │ 200       │ eve@org2.com  │ Eve            │ │
│  │ 4   │ 200       │ dave@org2.com │ Dave           │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  RLS Policy:                                           │
│  CREATE POLICY tenant_isolation ON users               │
│    USING (tenant_id =                                  │
│            current_setting('app.current_tenant')::int);│
│                                                         │
│  Set Session Context:                                  │
│  SET LOCAL app.current_tenant = '100';                 │
│                                                         │
│  Query: SELECT * FROM users;                           │
│  → Only returns rows where tenant_id = 100             │
│  → Database enforces (cannot bypass in app code)       │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### Appwrite Namespace Isolation (MariaDB)

```
┌────────────────────────────────────────────────────────┐
│                 MariaDB Database                        │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Namespace: _100 (Tenant 100)                          │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Table: _100_users                                 │ │
│  │ ┌────┬─────────────────┬──────────────────────┐  │ │
│  │ │ id │ email           │ name                 │  │ │
│  │ ├────┼─────────────────┼──────────────────────┤  │ │
│  │ │ 1  │ user@org1.com   │ Alice                │  │ │
│  │ │ 2  │ bob@org1.com    │ Bob                  │  │ │
│  │ └────┴─────────────────┴──────────────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  Namespace: _200 (Tenant 200)                          │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Table: _200_users                                 │ │
│  │ ┌────┬─────────────────┬──────────────────────┐  │ │
│  │ │ id │ email           │ name                 │  │ │
│  │ ├────┼─────────────────┼──────────────────────┤  │ │
│  │ │ 3  │ eve@org2.com    │ Eve                  │  │ │
│  │ │ 4  │ dave@org2.com   │ Dave                 │  │ │
│  │ └────┴─────────────────┴──────────────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  Application Code:                                     │
│  $db->setNamespace('_100');                            │
│  $db->query('SELECT * FROM users');                    │
│  → Translates to: SELECT * FROM _100_users             │
│  → Physical table isolation                            │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### Trade-offs

| Aspect | PostgreSQL RLS | Appwrite Namespace |
|--------|----------------|-------------------|
| **Isolation Method** | Logical (same table) | Physical (separate tables) |
| **Security Level** | Database-enforced | Application-enforced |
| **SQL Injection Risk** | ✅ Protected by RLS | ⚠️ Could leak if query construction bug |
| **Query Performance** | Requires tenant_id filter on every query | Direct table access (slightly faster) |
| **Index Strategy** | Must include tenant_id in all indexes | Per-tenant indexes (optimal) |
| **Metadata Overhead** | ✅ Low (single table) | ⚠️ High (table per tenant) |
| **Backup/Restore** | Single table dump | Per-namespace dumps possible |
| **Scaling** | ✅ Good for many small tenants | ⚠️ MySQL table limit (~4k optimal) |

---

## Connection Architecture

### Studio Backend Connections

```
┌──────────────────────────────────────────────────────┐
│              Studio Next.js App                       │
│              (Running on Railway)                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Connection Pool Manager                             │
│  ┌────────────────────────────────────────────────┐ │
│  │  PostgreSQL Pool (pg-pool)                     │ │
│  │  • Max Connections: 20                         │ │
│  │  • Idle Timeout: 30s                           │ │
│  │  • Connection String:                          │ │
│  │    postgresql://user:pass@postgres.railway... │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │  Redis Client (ioredis)                        │ │
│  │  • Connection: redis://redis.railway...       │ │
│  │  • Use: Session cache, API cache              │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │  Appwrite SDK Client                           │ │
│  │  • Endpoint: http://appwrite.railway...       │ │
│  │  • API Key: Platform-level admin key          │ │
│  │  • Use: Provision projects, manage resources  │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Deployed App Connections

```
┌──────────────────────────────────────────────────────┐
│         User's Deployed App                           │
│         (Running on Railway)                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Environment Variables (injected by Studio):         │
│  • APPWRITE_ENDPOINT=http://appwrite.railway...     │
│  • APPWRITE_PROJECT=abc123 (project ID)             │
│  • APPWRITE_API_KEY=xxx (project-scoped key)        │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │  Appwrite Client SDK                           │ │
│  │  const client = new Client()                   │ │
│  │    .setEndpoint(process.env.APPWRITE_ENDPOINT)│ │
│  │    .setProject(process.env.APPWRITE_PROJECT)  │ │
│  │    .setKey(process.env.APPWRITE_API_KEY);     │ │
│  │                                                │ │
│  │  const databases = new Databases(client);     │ │
│  │  const storage = new Storage(client);         │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ❌ NO direct MariaDB connection                     │
│  ❌ NO direct PostgreSQL connection                  │
│  ✅ All data access via Appwrite API                 │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## Deployment Topology

### Railway Services Layout

```
┌─────────────────────────────────────────────────────────────┐
│                     Railway Project                          │
│                   (Private Network)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ studio-backend │  │   appwrite     │  │  postgres    │ │
│  │  (Next.js)     │  │  (PHP/Swoole)  │  │  (Database)  │ │
│  │                │  │                │  │              │ │
│  │  Port: 3000    │  │  Port: 80      │  │  Port: 5432  │ │
│  │  Public: Yes   │  │  Public: No    │  │  Public: No  │ │
│  └───────┬────────┘  └───────┬────────┘  └───────┬──────┘ │
│          │                   │                    │        │
│          │                   │                    │        │
│  ┌───────▼───────────────────▼────────────────────▼──────┐ │
│  │              Private Network Bridge                    │ │
│  │  DNS Resolution:                                       │ │
│  │  • appwrite.railway.internal                          │ │
│  │  • postgres.railway.internal                          │ │
│  │  • redis.railway.internal                             │ │
│  │  • mariadb.railway.internal                           │ │
│  └────────────────────────────────────────────────────────┘ │
│          │                   │                    │        │
│  ┌───────▼────────┐  ┌───────▼──────────┐  ┌─────▼──────┐│
│  │     redis      │  │     mariadb       │  │ user-app-1 ││
│  │   (Cache)      │  │   (Appwrite DB)   │  │ (Deployed) ││
│  │                │  │                   │  │            ││
│  │  Port: 6379    │  │  Port: 3306       │  │  Port: 8080││
│  │  Public: No    │  │  Public: No       │  │  Public: Yes│
│  └────────────────┘  └───────────────────┘  └────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘

External Access:
• studio-backend.railway.app → studio-backend:3000 (public)
• user-app-1.railway.app → user-app-1:8080 (public)
• All databases ONLY accessible within private network
```

---

**Created by**: Omar Diallo
**Date**: 2025-11-22
**Purpose**: Visual reference for database architecture decisions
