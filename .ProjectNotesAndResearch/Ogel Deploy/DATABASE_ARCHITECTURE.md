# Appwrite Database Architecture Analysis

**Author**: Omar Diallo, Data Migration Specialist
**Date**: 2025-11-22
**Purpose**: Understand Appwrite's database architecture for Ogel Deploy integration

---

## Executive Summary

Appwrite uses a **shared database with table-level multi-tenancy** approach, where each project (tenant) is isolated using:
1. **Tenant ID** (project sequence number) embedded in queries
2. **Namespace prefixing** for table names (`_projectSequence_tableName`)
3. **Single MariaDB/MySQL database** with logical isolation
4. **Document-level permissions** through custom permission system

This differs significantly from our current PostgreSQL RLS approach but provides similar isolation guarantees.

---

## 1. Database Architecture Overview

### Primary Components

```
┌─────────────────────────────────────────────────────────┐
│                  MariaDB/MySQL Instance                 │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │  Console   │  │ Project 1  │  │ Project 2  │      │
│  │ Namespace  │  │ Namespace  │  │ Namespace  │      │
│  │  (_console)│  │   (_123)   │  │   (_456)   │      │
│  └────────────┘  └────────────┘  └────────────┘      │
│       │                │                │             │
│       v                v                v             │
│  Platform Tables  Tenant Tables   Tenant Tables      │
│  - users          - database_123  - database_456     │
│  - projects       - _123_users    - _456_users       │
│  - teams          - _123_docs     - _456_docs        │
└─────────────────────────────────────────────────────────┘
```

### Key Architecture Patterns

**1. Namespace-Based Table Isolation**
- Console (platform): `_console` namespace
- Projects (tenants): `_<projectSequence>` namespace
- Example: Project with sequence `123` → Tables prefixed `_123_`

**2. Tenant ID in Database Object**
```php
$database->setTenant((int) $project->getSequence())
```
- Embedded in WHERE clauses automatically
- Enforced at database adapter level
- Not RLS - application-level filtering

**3. Shared Tables Mode**
```php
if (in_array($dsn->getHost(), $sharedTables)) {
    $database
        ->setSharedTables(true)
        ->setTenant((int) $project->getSequence())
        ->setNamespace($dsn->getParam('namespace'));
} else {
    $database
        ->setSharedTables(false)
        ->setTenant(null)
        ->setNamespace('_' . $project->getSequence());
}
```

**Shared Mode**: Single table, tenant ID column filtering
**Isolated Mode**: Separate tables per tenant with namespace prefix

---

## 2. Multi-Tenancy Strategy

### Isolation Mechanism

**NOT PostgreSQL RLS** - Appwrite uses application-level tenant isolation:

1. **Tenant ID Filter**: Every query automatically includes tenant ID
2. **Namespace Routing**: Table names dynamically prefixed with namespace
3. **Document Permissions**: Separate permission layer on top of tenant isolation

### Data Flow

```
User Request → Project Context → Database Init
                     ↓
         Set Tenant ID (project.sequence)
                     ↓
         Set Namespace (_<sequence>)
                     ↓
       All Queries Include Tenant Filter
                     ↓
         Tables: _<sequence>_<collection>
```

### Project Creation

When a new project is created:

```php
// From: app/controllers/api/projects.php
$dbForProject->createDocument('databases', new Document([
    '$id' => $databaseId,
    'name' => $name,
    'enabled' => $enabled,
]));

// Creates collection with namespace prefix
$dbForProject->createCollection(
    'database_' . $database->getSequence(),
    $attributes,
    $indexes
);
```

**Result**:
- Metadata in `_console.databases` table
- Physical collection: `_<projectSeq>_database_<dbSeq>` table

---

## 3. Database Provisioning for Deployed Apps

### Current Appwrite Flow

**Step 1: Project Registration**
```
POST /v1/projects
→ Creates project in _console.projects
→ Assigns sequence number (e.g., 789)
→ Sets database DSN (connection string)
```

**Step 2: Database Creation**
```
POST /v1/databases
→ Creates database within project namespace
→ Table: _789_databases
→ Generates internal database ID
```

**Step 3: Collection Creation**
```
POST /v1/databases/{databaseId}/collections
→ Creates collection metadata
→ Physical table: _789_database_<dbSeq>_<collectionId>
```

**Step 4: Document Operations**
```
POST /v1/databases/{databaseId}/collections/{collectionId}/documents
→ Automatically filtered by tenant ID (789)
→ Permission checked on document level
```

### Connection Information

Projects don't get direct database credentials. Access is:
1. **Through Appwrite API**: Client SDK with API keys
2. **No Direct DB Access**: Applications never connect to MariaDB directly
3. **RESTful Interface**: All operations via HTTP API

---

## 4. Security and Isolation Patterns

### Multi-Layer Security

**Layer 1: Project Isolation (Tenant Level)**
```php
// Automatic tenant filtering
$database->setTenant((int) $project->getSequence())
```
- Every query includes: `WHERE tenant_id = 123`
- Prevents cross-project data access
- Enforced at adapter level (cannot be bypassed in application code)

**Layer 2: Document Permissions**
```php
// From collections/databases.php
[
    '$id' => ID::custom('documentSecurity'),
    'type' => Database::VAR_BOOLEAN,
]
```

Permissions system supports:
- User-level permissions
- Team-level permissions
- Role-based access (`role:all`, `role:guest`, `role:member`)
- Document-level security toggle

**Layer 3: API Key/Session Auth**
- API keys scoped to project
- Session cookies scoped to project: `a_session_<projectId>`
- OAuth tokens linked to project context

### Permission Model

```php
// Example document permissions
[
    'read' => ['role:all'],
    'write' => ['user:userId', 'team:teamId/owner'],
    'update' => ['user:userId'],
    'delete' => ['user:userId'],
]
```

**Permission Inheritance**:
- Collection-level: `documentSecurity = false` → Collection permissions apply
- Document-level: `documentSecurity = true` → Per-document permissions

---

## 5. Integration with Railway Databases

### Our Current Setup

**PostgreSQL** (Railway)
- Multi-tenant with RLS policies
- `platform_databases` table for routing
- Connection pooling via internal network

**Redis** (Railway)
- Session caching
- Query result caching
- Shared across all projects

**MongoDB** (Railway)
- Currently minimal usage
- Private network access

### Integration Strategy

#### Option A: Replace Appwrite's MariaDB with PostgreSQL

**Pros**:
- Leverage our existing PostgreSQL infrastructure
- RLS provides database-level isolation (stronger than app-level)
- Consistent with our Studio backend

**Cons**:
- Appwrite's database adapter expects MySQL/MariaDB
- Would require significant Appwrite fork/modification
- Utopia Database library compatibility unknown

**Verdict**: ❌ **Not Recommended** - Too invasive

---

#### Option B: Parallel Database Architecture (Recommended)

```
┌──────────────────────────────────────────────────┐
│              Railway Platform                     │
│                                                   │
│  ┌────────────────┐      ┌──────────────────┐   │
│  │   PostgreSQL   │      │   MariaDB/MySQL  │   │
│  │   (Studio)     │      │   (Appwrite)     │   │
│  ├────────────────┤      ├──────────────────┤   │
│  │ - Studio data  │      │ - Project data   │   │
│  │ - User mgmt    │      │ - App databases  │   │
│  │ - Projects     │      │ - Collections    │   │
│  │ - Orgs         │      │ - Documents      │   │
│  └────────────────┘      └──────────────────┘   │
│         │                         │              │
│         └─────────┬───────────────┘              │
│                   │                              │
│          ┌────────▼─────────┐                    │
│          │   Redis Cache    │                    │
│          │  (Shared Layer)  │                    │
│          └──────────────────┘                    │
└──────────────────────────────────────────────────┘
```

**PostgreSQL (Studio Backend)**:
- User authentication
- Organization management
- Project metadata
- Deployment tracking
- Billing/subscriptions

**MariaDB/MySQL (Appwrite)**:
- Deployed app data
- Collections and documents
- File metadata
- Function execution logs

**Redis (Shared)**:
- Session caching (both systems)
- API response caching
- Rate limiting data

**Advantages**:
✅ No Appwrite modifications needed
✅ Clear separation of concerns
✅ Each system uses optimal database
✅ Independent scaling
✅ Railway-native deployment

**Implementation**:
1. Deploy MariaDB as Railway service
2. Configure Appwrite to use MariaDB via private network
3. Keep PostgreSQL for Studio backend
4. Redis shared between both (already implemented)

---

#### Option C: Appwrite as External Service Only

Use Appwrite Cloud or separate infrastructure, Studio orchestrates:

**Pros**:
- No database infrastructure burden
- Appwrite handles scaling
- Official support

**Cons**:
- Data residency concerns
- Cost per project
- Less control over isolation

**Verdict**: 🔶 **Fallback Option** - Use if Railway hosting proves complex

---

## 6. Migration Considerations

### If Implementing Parallel Architecture (Option B)

#### Phase 1: Infrastructure Setup
- [ ] Deploy MariaDB 10.11+ on Railway
- [ ] Configure private network access
- [ ] Set up connection pooling
- [ ] Configure backup strategy

#### Phase 2: Appwrite Integration
- [ ] Update Appwrite `.env`:
  ```bash
  _APP_DB_HOST=mariadb.railway.internal
  _APP_DB_PORT=3306
  _APP_DB_SCHEMA=appwrite
  _APP_DB_USER=appwrite_user
  _APP_DB_PASS=<secure_password>
  ```
- [ ] Initialize Appwrite database schema
- [ ] Test project creation flow
- [ ] Validate tenant isolation

#### Phase 3: Studio-Appwrite Bridge
- [ ] API endpoint: Create Appwrite project when Studio project deployed
- [ ] Store Appwrite project ID in `platform_databases` table
- [ ] Generate and securely store Appwrite API keys
- [ ] Expose API keys to deployed apps via env vars

#### Phase 4: Data Flow Testing
- [ ] Create test project in Studio
- [ ] Deploy app to Railway
- [ ] Verify Appwrite database provisioning
- [ ] Test CRUD operations from deployed app
- [ ] Validate isolation (cannot access other projects' data)
- [ ] Test permission system
- [ ] Verify session handling across both databases

---

### Data Migration Strategy

**Not Applicable Initially** - No existing data to migrate since Appwrite integration is new.

**Future Migrations** (if moving between Appwrite instances):

```sql
-- Tenant data is namespace-isolated
-- Example: Export project 123 data
SELECT * FROM _123_database_456_users;
SELECT * FROM _123_database_456_posts;

-- Import to new instance with same/different namespace
-- Namespace can change, tenant ID regenerated
```

**Key Insight**: Appwrite's namespace isolation makes per-project extraction straightforward.

---

## 7. Security & Compliance

### Data Isolation Guarantees

**Application-Level Isolation** (Appwrite):
- Tenant ID filter on every query
- Namespace routing prevents cross-contamination
- BUT: Database credentials have access to all tenant data

**Database-Level Isolation** (Our PostgreSQL):
- RLS policies enforced by PostgreSQL
- Even with credentials, users cannot bypass RLS
- Stronger isolation guarantee

### Threat Model Comparison

| Attack Vector | Appwrite (MariaDB) | Our Studio (PostgreSQL RLS) |
|--------------|-------------------|----------------------------|
| SQL Injection | ⚠️ Could access other tenants if query construction bypassed | ✅ RLS enforced regardless |
| Application Bug | ⚠️ Tenant filter omission = cross-tenant leak | ✅ RLS prevents even if app bugs out |
| Compromised DB Creds | ⚠️ All tenant data accessible | ✅ Still enforces RLS policies |
| Insider Threat | ⚠️ DBA can access all tenant data | ⚠️ DBA can access (but audit logged) |

**Recommendation**: For **Studio's own data** (auth, orgs, projects), keep PostgreSQL RLS. For **deployed app data**, Appwrite's isolation is industry-standard for application-layer multi-tenancy.

---

## 8. Performance Considerations

### Appwrite's Approach

**Namespace Tables**:
- Each project gets own tables: `_123_database_456_collection_789`
- No cross-tenant query overhead
- Indexes per-project (good for large projects)
- BUT: Many projects = many tables (MySQL metadata overhead)

**Alternative Shared Tables Mode**:
- Single table with `tenant_id` column
- Better for many small projects
- Index on `tenant_id` required
- Query planner must filter tenant

### Query Performance

**Appwrite Namespace Strategy**:
```sql
-- Automatic routing to tenant table
SELECT * FROM _123_users WHERE status = 'active';
-- No tenant_id filter needed - table IS the isolation
```

**Shared Table Strategy**:
```sql
-- Tenant filter on every query
SELECT * FROM users WHERE tenant_id = 123 AND status = 'active';
-- Requires composite index: (tenant_id, status)
```

**Our PostgreSQL RLS**:
```sql
-- RLS policy applied invisibly
SELECT * FROM users WHERE status = 'active';
-- Behind the scenes: WHERE status = 'active' AND tenant_id = current_setting('app.current_tenant')::int
```

### Scaling Implications

**MariaDB Connection Pooling**:
- Appwrite uses Utopia Database connection pools
- Multiple pools for different regions/shards
- Each pool shares connections

**Integration with Railway**:
- Railway's private network = low latency
- Connection pooling crucial (MariaDB connection limit ~500)
- Consider PgBouncer equivalent for MariaDB if needed

---

## 9. Recommended Integration Plan

### Architecture Decision: **Option B - Parallel Databases**

**Why**:
1. ✅ **Non-invasive**: No Appwrite fork required
2. ✅ **Best of both**: PostgreSQL RLS for Studio, Appwrite's proven multi-tenancy for apps
3. ✅ **Railway-native**: Both databases on Railway private network
4. ✅ **Separation of concerns**: Clear boundary between platform and app data
5. ✅ **Scalability**: Each database scales independently

### Implementation Phases

#### Phase 1: MariaDB Setup (Week 1)
1. Provision MariaDB on Railway
2. Configure Appwrite environment variables
3. Run Appwrite migrations to initialize schema
4. Test basic Appwrite functionality

#### Phase 2: Studio Integration (Week 2)
1. Create `appwrite_projects` table in Studio PostgreSQL:
   ```sql
   CREATE TABLE appwrite_projects (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     platform_database_id UUID REFERENCES platform_databases(id),
     appwrite_project_id TEXT NOT NULL UNIQUE,
     appwrite_api_key TEXT NOT NULL, -- Encrypted
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. Build Studio API endpoints:
   - `POST /api/platform/projects/:ref/appwrite/init` - Create Appwrite project
   - `GET /api/platform/projects/:ref/appwrite/credentials` - Get API keys
   - `DELETE /api/platform/projects/:ref/appwrite/destroy` - Clean up project

3. Update deployment flow to provision Appwrite project

#### Phase 3: Testing & Validation (Week 3)
1. End-to-end testing: Studio → Railway → Appwrite → MariaDB
2. Isolation testing: Ensure tenant separation
3. Performance testing: Query latency, connection pooling
4. Security audit: Credential handling, network isolation

#### Phase 4: Production Rollout (Week 4)
1. Deploy to production Railway environment
2. Monitor database performance metrics
3. Gradual rollout to new projects
4. Documentation for developers

---

## 10. Open Questions & Next Steps

### Questions for Team

1. **Database Engine Choice**:
   - MariaDB (Appwrite default) vs MySQL 8.0?
   - Railway has both - which performs better?

2. **Backup Strategy**:
   - How do we backup MariaDB on Railway?
   - Point-in-time recovery needed?
   - Retention policy?

3. **Connection Limits**:
   - Railway MariaDB connection limits?
   - Connection pooling strategy?
   - Do we need ProxySQL or equivalent?

4. **Cost Implications**:
   - Railway MariaDB pricing tier?
   - Storage growth projections?
   - Network transfer costs?

5. **Monitoring**:
   - Database metrics to track?
   - Alerting on connection exhaustion?
   - Query performance monitoring?

### Next Steps

**Immediate Actions**:
1. ✅ **Done**: Understand Appwrite database architecture
2. ⏭️ **Next**: Review Railway MariaDB/MySQL options and pricing
3. ⏭️ **Next**: Design Studio↔Appwrite integration API
4. ⏭️ **Next**: Create database provisioning workflow diagram
5. ⏭️ **Next**: Spike: Deploy test MariaDB + Appwrite on Railway

**Blocked On**:
- Decision on MariaDB vs MySQL
- Railway infrastructure cost approval
- Appwrite version/deployment strategy finalization

---

## 11. Conclusion

Appwrite uses **application-level multi-tenancy with namespace-based table isolation**, a proven pattern that differs from our PostgreSQL RLS approach but provides effective tenant separation.

**Recommended Path**: Deploy MariaDB on Railway alongside our existing PostgreSQL, creating a **two-database architecture** where:
- **PostgreSQL**: Platform data (Studio backend)
- **MariaDB**: Application data (Appwrite/deployed apps)
- **Redis**: Shared caching layer

This approach is:
- ✅ **Low-risk**: No Appwrite modifications
- ✅ **Scalable**: Each database optimized for its use case
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Railway-native**: Leverages private networking

The tenant isolation model is different but not inferior - it's the industry-standard approach used by platforms like Firebase, Supabase (ironically, for their Functions!), and Parse.

**Migration complexity**: Low (new infrastructure, no data migration)
**Integration complexity**: Medium (API bridging between Studio and Appwrite)
**Operational complexity**: Medium (two databases to monitor)
**Risk level**: Low (well-understood patterns)

---

**Prepared by**: Omar Diallo
**Role**: Data Migration Specialist
**Date**: 2025-11-22
**Status**: Initial Analysis Complete - Awaiting Architectural Decision
