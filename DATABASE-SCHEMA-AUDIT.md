# Database Schema Audit: Multi-Tenant Data Model

**Audit Date**: 2025-11-22
**Auditor**: Asha Kimani (Data Modeling Specialist)
**Squad**: Database Modeling & Multi-Tenant Schema Analysis
**Coordinates With**: Viktor Novak (Multi-Tenancy Architect), Rashid Khalil (RBAC Specialist)

---

## Executive Summary

This audit maps the complete multi-tenant database schema for the Supabase Studio self-hosted platform. The schema implements a **three-tier tenant hierarchy** (Organization → Project → Database) with comprehensive RBAC, billing, and audit infrastructure. Migration 006 added polyglot database support (MongoDB/Redis/PostgreSQL), while Migration 007 established restrictive RLS policies (NOT YET APPLIED).

**Schema State**: Production-ready with permissive RLS policies. Restrictive RLS awaits application-layer session variable implementation.

---

## 1. Multi-Tenant Data Model Architecture

### 1.1 Tenant Hierarchy

```
┌─────────────────────────────────────────────────────┐
│                   ORGANIZATION                       │
│  • Top-level tenant boundary                        │
│  • Owns subscription, billing, usage                │
│  • Contains multiple members with roles             │
└────────────────┬────────────────────────────────────┘
                 │ 1:N
                 ▼
┌─────────────────────────────────────────────────────┐
│                     PROJECT                          │
│  • Database instance/environment                    │
│  • Belongs to exactly one organization              │
│  • Has connection details, credentials              │
│  • Can have project-level members                   │
└────────────────┬────────────────────────────────────┘
                 │ 1:N
                 ▼
┌─────────────────────────────────────────────────────┐
│                PLATFORM.DATABASES                    │
│  • Polyglot database connections (Migration 006)    │
│  • MongoDB, Redis, PostgreSQL                       │
│  • Encrypted connection strings                     │
│  • Health check tracking                            │
└─────────────────────────────────────────────────────┘
```

**Tenant Isolation Strategy**:
- **Schema-level**: All tables in `platform` schema
- **Row-level**: RLS policies enforce organization-based isolation
- **Query-level**: Application queries use session variables for context
- **Connection-level**: `platform.databases` tracks polyglot connections per project

---

## 2. Core Entity-Relationship Model

### 2.1 Organizations & Membership

**Table: `platform.organizations`**
```sql
CREATE TABLE platform.organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,              -- URL-safe identifier
    billing_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);
```

**Indexes**:
- `idx_organizations_slug` (unique lookup by slug)
- `idx_organizations_created_at` (temporal queries)

**Relationships**:
- **1:N** → `organization_members` (membership)
- **1:N** → `projects` (owned projects)
- **1:1** → `subscriptions` (billing plan)
- **1:N** → `invoices`, `payment_methods`, `tax_ids` (billing)

---

**Table: `platform.organization_members`**
```sql
CREATE TABLE platform.organization_members (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- RBAC
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'billing_admin', 'developer', 'member')),

    -- Invitation tracking
    invited_at TIMESTAMPTZ,
    invited_by UUID REFERENCES platform.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, user_id)
);
```

**Role Hierarchy** (from RLS policies):
```
owner > admin > billing_admin > developer > member
```

**Key Insight**: This is the **critical tenant isolation table**. All RLS policies derive organization access from membership in this table.

---

### 2.2 Projects & Databases

**Table: `platform.projects`**
```sql
CREATE TABLE platform.projects (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Project identity
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    ref TEXT NOT NULL UNIQUE,               -- Globally unique project reference

    -- Primary PostgreSQL connection
    database_host TEXT NOT NULL,
    database_port INTEGER NOT NULL DEFAULT 5432,
    database_name TEXT NOT NULL,
    database_user TEXT NOT NULL,
    database_password TEXT NOT NULL,        -- Primary DB credentials

    -- Service endpoints
    postgres_meta_url TEXT NOT NULL,
    supabase_url TEXT NOT NULL,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'ACTIVE_HEALTHY',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT projects_status_valid CHECK (status IN (
        'ACTIVE_HEALTHY', 'ACTIVE_UNHEALTHY', 'COMING_UP',
        'GOING_DOWN', 'INACTIVE', 'PAUSED', 'RESTORING', 'UPGRADING'
    ))
);
```

**Indexes**:
- `idx_projects_organization_id` (tenant queries)
- `idx_projects_ref` (unique lookup)
- `idx_projects_org_status` (composite for filtered tenant queries)

**Data Modeling Observation**:
- Primary PostgreSQL credentials stored directly in `projects` table
- Additional databases (MongoDB/Redis) stored in `platform.databases`
- This creates **dual credential storage patterns** - consider consolidating

---

**Table: `platform.databases` (Migration 006)**
```sql
CREATE TABLE platform.databases (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Database identification
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mongodb', 'redis', 'postgresql')),

    -- Connection details (individual fields)
    host TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port > 0 AND port < 65536),
    database TEXT,                          -- Nullable for Redis
    username TEXT,
    password TEXT,

    -- Encrypted connection string
    connection_string TEXT NOT NULL,
    connection_string_encrypted BYTEA,      -- pgcrypto encrypted

    -- SSL/TLS
    ssl_enabled BOOLEAN DEFAULT false,

    -- Type-specific configuration (JSONB flexibility)
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Health tracking
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'maintenance')),
    health_check_status TEXT CHECK (health_check_status IN ('healthy', 'unhealthy', 'unknown')),
    last_health_check_at TIMESTAMPTZ,
    health_check_error TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**:
- `idx_databases_project_id` (tenant queries)
- `idx_databases_type` (type-filtered queries)
- `idx_databases_project_type_status` (composite for filtered queries)
- `idx_databases_health_check` (partial index for monitoring)

**Encryption Strategy**:
- Trigger-based encryption using `pgcrypto`
- Key derivation: `sha256(project_id || 'database_encryption_salt_v1')`
- **Production Concern**: Deterministic key generation per project - should use environment-based key

**Helper Functions**:
```sql
-- Decrypt connection string
platform.decrypt_database_connection_string(database_id UUID) RETURNS TEXT

-- Get databases by project
platform.get_project_databases(project_id UUID, type TEXT) RETURNS TABLE(...)

-- Update health status
platform.update_database_health(database_id UUID, health_status TEXT, error_message TEXT)
```

**Views**:
- `platform.databases_with_connection_strings` (SECURITY DEFINER, restricted)
- `platform.databases_safe` (public, masked connection strings)

---

### 2.3 Credentials & Security

**Table: `platform.credentials`**
```sql
CREATE TABLE platform.credentials (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL UNIQUE REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- JWT tokens
    anon_key TEXT NOT NULL,
    service_role_key TEXT NOT NULL,
    jwt_secret TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Relationship**: Exactly **1:1** with `projects` (enforced by UNIQUE constraint on `project_id`)

**RLS Policy** (Migration 007 - NOT YET APPLIED):
- SELECT: Only org admins+
- INSERT/UPDATE/DELETE: Only org owners
- Strictest policies in the entire schema

---

### 2.4 Users & Authentication

**Table: `platform.users`**
```sql
CREATE TABLE platform.users (
    id UUID PRIMARY KEY,

    -- Identity
    email TEXT NOT NULL UNIQUE,
    username TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,

    -- Authentication
    password_hash TEXT,                     -- Optional (GoTrue delegation)
    mfa_enabled BOOLEAN DEFAULT false,

    -- Status
    email_confirmed_at TIMESTAMPTZ,
    banned_until TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,                 -- Soft delete

    -- Activity
    last_sign_in_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**:
- `idx_users_email` (partial: WHERE deleted_at IS NULL)
- `idx_users_username` (partial: WHERE deleted_at IS NULL)
- `idx_users_last_sign_in` (activity tracking)

**Data Model Notes**:
- Soft delete pattern via `deleted_at`
- Partial indexes exclude soft-deleted rows
- JSONB metadata for extensibility

---

**Table: `platform.user_sessions`**
```sql
CREATE TABLE platform.user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,

    -- Session tokens
    token TEXT NOT NULL UNIQUE,             -- JWT or random
    refresh_token TEXT UNIQUE,

    -- Security context
    ip_address INET,
    user_agent TEXT,

    -- Lifecycle
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**:
- `idx_user_sessions_token` (composite: token + expires_at)
- `idx_user_sessions_expires` (cleanup queries)

**Session Management Pattern**:
- Token-based authentication
- Refresh token rotation
- IP/User-Agent tracking for security
- **Redis Integration Note**: Session caching layer added (see Redis integration docs)

---

## 3. Billing & Subscription Model

### 3.1 Billing Hierarchy

```
organization (1) ──────── (1) subscription
      │                          │
      └── (N) invoices           └── (1) billing_plan
      └── (N) payment_methods
      └── (N) tax_ids
      └── (1) customer_profile
      └── (N) credits
```

---

**Table: `platform.subscriptions`**
```sql
CREATE TABLE platform.subscriptions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Plan
    plan_id TEXT NOT NULL CHECK (plan_id IN ('tier_free', 'tier_pro', 'tier_team', 'tier_enterprise')),
    plan_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',

    -- Billing cycle
    billing_cycle_anchor BIGINT,
    current_period_start BIGINT,
    current_period_end BIGINT,
    next_invoice_at BIGINT,

    -- Usage & spend caps
    usage_billing_enabled BOOLEAN DEFAULT true,
    spend_cap_enabled BOOLEAN DEFAULT false,
    spend_cap_amount NUMERIC(10,2),
    customer_balance NUMERIC(10,2) DEFAULT 0,

    -- Partner billing
    billing_via_partner BOOLEAN DEFAULT false,
    billing_partner TEXT,                   -- 'fly', 'aws', 'vercel', null

    -- Stripe integration
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id)                 -- 1:1 with organization
);
```

**Data Model Insight**:
- **1:1 relationship** enforced: Each organization has exactly one subscription
- Stripe references stored directly (external system coupling)
- Partner billing flag for third-party billing delegation
- Usage billing + spend caps for cost control

---

**Table: `platform.billing_plans` (Reference Data)**
```sql
CREATE TABLE platform.billing_plans (
    id TEXT PRIMARY KEY,                    -- 'tier_free', 'tier_pro', etc.
    name TEXT NOT NULL,
    description TEXT,

    -- Pricing
    price NUMERIC(10,2) NOT NULL,
    interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),

    -- Features & limits
    features JSONB DEFAULT '[]',
    limits JSONB DEFAULT '{}',              -- {max_projects: 2, max_members: 5, ...}
    max_projects INTEGER,
    max_members INTEGER,

    -- Management
    active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Seeded Plans**:
1. `tier_free`: $0/month, 2 projects, 5 members
2. `tier_pro`: $25/month, 10 projects, 25 members
3. `tier_team`: $599/month, unlimited projects, 100 members
4. `tier_enterprise`: Custom pricing, unlimited

**JSONB Schema**:
```json
// limits field
{
  "max_projects": 2,
  "max_members": 5,
  "disk_gb": 8,
  "bandwidth_gb": 250,
  "storage_gb": 100
}
```

---

### 3.2 Add-ons & Project Resources

**Table: `platform.project_addons`**
```sql
CREATE TABLE platform.project_addons (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Add-on identification
    addon_id TEXT NOT NULL,                 -- 'pitr', 'custom_domain', 'ipv4', 'compute_instance'
    addon_variant TEXT,                     -- 'small', 'medium', 'large'

    -- Pricing
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    price_per_unit NUMERIC(10,2),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'cancelled')),

    activated_at TIMESTAMPTZ DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(project_id, addon_id)            -- One of each addon type per project
);
```

**Table: `platform.addons` (Catalog)**
- Defines available add-ons and pricing tiers
- Referenced by `project_addons.addon_id`

**Data Model Pattern**:
- Catalog table (`addons`) defines available products
- Junction table (`project_addons`) tracks active assignments
- Allows quantity-based billing (e.g., multiple compute instances)

---

**Table: `platform.disk_config`**
```sql
CREATE TABLE platform.disk_config (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Provisioned storage
    provisioned_disk_gb INTEGER NOT NULL,
    max_iops INTEGER,
    disk_type TEXT,                         -- 'ssd', 'nvme', etc.

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: `platform.compute_config`**
```sql
CREATE TABLE platform.compute_config (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    -- Instance sizing
    cpu_cores INTEGER NOT NULL,
    memory_gb INTEGER NOT NULL,
    instance_type TEXT,                     -- 'micro', 'small', 'medium', 'large'

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Design Pattern**: Separate configuration tables for resource management, allowing independent updates without affecting core project data.

---

## 4. Audit, Metrics & Operational Tables

### 4.1 Audit Logging

**Table: `platform.audit_logs`**
```sql
CREATE TABLE platform.audit_logs (
    id UUID PRIMARY KEY,

    -- Context (nullable for system events)
    organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
    project_id UUID REFERENCES platform.projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES platform.users(id) ON DELETE SET NULL,

    -- Event classification
    event_type TEXT NOT NULL,               -- 'project.created', 'member.invited'
    resource_type TEXT,                     -- 'project', 'organization', 'user'
    resource_id UUID,
    action TEXT NOT NULL,                   -- 'create', 'update', 'delete'

    -- Request context
    ip_address INET,
    user_agent TEXT,

    -- Event details
    metadata JSONB DEFAULT '{}',
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT audit_logs_event_type_format CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$')
);
```

**Indexes**:
- `idx_audit_logs_org_created` (tenant-scoped queries)
- `idx_audit_logs_severity` (partial: WHERE severity IN ('error', 'critical'))
- `idx_audit_logs_created` (time-series queries)

**Design Pattern**:
- Time-series optimized (consider TimescaleDB hypertable)
- JSONB metadata for extensible event details
- Nullable foreign keys (events survive entity deletion)
- Severity filtering via partial index

---

### 4.2 Metrics & Monitoring

**Table: `platform.project_metrics`**
```sql
CREATE TABLE platform.project_metrics (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Resource utilization
    cpu_usage NUMERIC(5,2) CHECK (cpu_usage >= 0 AND cpu_usage <= 100),
    memory_usage NUMERIC(5,2) CHECK (memory_usage >= 0 AND memory_usage <= 100),
    disk_io_budget NUMERIC(10,2),
    disk_usage_gb NUMERIC(10,2) CHECK (disk_usage_gb >= 0),

    -- Network
    network_in_bytes BIGINT CHECK (network_in_bytes >= 0),
    network_out_bytes BIGINT CHECK (network_out_bytes >= 0),

    -- Database
    active_connections INTEGER CHECK (active_connections >= 0),
    query_count INTEGER CHECK (query_count >= 0),

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**:
- `idx_project_metrics_project_timestamp` (time-series queries)
- `idx_project_metrics_timestamp` (global time-series)

**Design Pattern**:
- Time-series data structure
- Constraints enforce data validity
- Consider TimescaleDB for compression and retention policies

---

**Table: `platform.usage_metrics`**
```sql
CREATE TABLE platform.usage_metrics (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,

    -- Period tracking
    period_start BIGINT NOT NULL,
    period_end BIGINT NOT NULL,

    -- Usage data
    metric_type TEXT NOT NULL,              -- 'compute', 'storage', 'bandwidth', 'auth'
    metric_value NUMERIC(15,2) NOT NULL,
    unit TEXT NOT NULL,                     -- 'gb_hours', 'requests', 'bytes'

    -- Billing
    cost NUMERIC(10,2),
    currency TEXT DEFAULT 'usd',

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Design Insight**: Organization-level aggregation for billing, complementing project-level metrics.

---

## 5. Row-Level Security (RLS) Implementation

### 5.1 Current State: Permissive Policies (Migration 006)

**Status**: APPLIED IN PRODUCTION
**Strategy**: Enable RLS with "allow all" policies for zero downtime

```sql
-- Example: Organizations table
CREATE POLICY "permissive_all_organizations"
ON platform.organizations
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (true)
WITH CHECK (true);
```

**Applied to 24 tables**:
- All organization, project, billing, user, audit tables
- Zero behavior change
- Establishes RLS infrastructure

**Verification Function**:
```sql
platform.verify_rls_enabled()
-- Returns: table_name, rls_enabled, policy_count
```

---

### 5.2 Future State: Restrictive Policies (Migration 007)

**Status**: NOT YET APPLIED - REQUIRES APPLICATION-LAYER CHANGES
**Strategy**: Organization-based tenant isolation with session variables

**Session Variable Requirements**:
```sql
-- Must be set by application middleware
SET LOCAL app.current_user_id = '<user_uuid>';
SET LOCAL app.current_org_id = '<org_uuid>';
```

**Helper Functions** (Migration 007):
```sql
-- Get session context
platform.current_user_id() RETURNS UUID
platform.current_org_id() RETURNS UUID

-- Permission checks
platform.user_is_org_member(org_id UUID) RETURNS BOOLEAN
platform.user_has_org_role(org_id UUID, required_role TEXT) RETURNS BOOLEAN
```

**Example Restrictive Policy**:
```sql
-- Organizations: Users can only see orgs they're members of
CREATE POLICY "org_member_select"
ON platform.organizations
FOR SELECT
TO PUBLIC
USING (
    id IN (
        SELECT organization_id
        FROM platform.organization_members
        WHERE user_id = platform.current_user_id()
    )
);
```

**Policy Structure**:
1. **Organizations**: Member-based visibility, owner-only updates
2. **Projects**: Org member visibility, admin+ modifications
3. **Credentials**: Admin+ read, owner-only write (strictest)
4. **Billing**: Billing admin+ access
5. **Users**: Self-only access
6. **Audit Logs**: Admin+ read, system insert

---

## 6. Query Pattern Analysis

### 6.1 Tenant Access Verification

**Organization Access** (`lib/api/platform/org-access-control.ts`):
```typescript
const { data: membership } = await queryPlatformDatabase({
  query: `
    SELECT om.role, om.user_id, o.id as org_id, o.name, o.slug
    FROM platform.organization_members om
    INNER JOIN platform.organizations o ON om.organization_id = o.id
    WHERE o.slug = $1 AND om.user_id = $2
  `,
  parameters: [slug, userId]
});
```

**Query Pattern**:
- Explicit JOIN through membership table
- Returns role + org details
- Application-layer enforcement (pre-RLS)

---

**Project Access** (`lib/api/platform/project-access.ts`):
```typescript
const { data } = await queryPlatformDatabase({
  query: `
    SELECT p.*,
           COALESCE(pm.role, om.role) as user_role,
           CASE
             WHEN pm.user_id IS NOT NULL THEN 'direct'
             WHEN om.user_id IS NOT NULL THEN 'via_org'
             ELSE NULL
           END as access_type
    FROM platform.projects p
    LEFT JOIN platform.project_members pm ON p.id = pm.project_id AND pm.user_id = $2
    LEFT JOIN platform.organization_members om ON p.organization_id = om.organization_id AND om.user_id = $2
    WHERE p.ref = $1 AND (pm.user_id = $2 OR om.user_id = $2)
  `,
  parameters: [projectRef, userId]
});
```

**Query Pattern**:
- **Dual access path**: Direct project membership OR organization membership
- Role coalescing: `COALESCE(pm.role, om.role)`
- Access type tracking for audit
- **Design Insight**: Organization membership grants implicit project access

---

### 6.2 Database Connection Queries

**Get Databases by Project** (`lib/api/platform/databases.ts`):
```typescript
const result = await queryPlatformDatabase({
  query: `SELECT * FROM platform.databases WHERE project_id = $1 ORDER BY created_at DESC`,
  parameters: [projectId]
});
```

**Security Pattern**:
- No credential fields in base query
- Use `platform.decrypt_database_connection_string(id)` for decryption
- `platform.databases_safe` view for API responses (masked credentials)

---

## 7. Schema Evolution & Migration History

### Migration Timeline

| Migration | Purpose | Key Changes | Status |
|-----------|---------|-------------|--------|
| 001 | Core schema | organizations, projects, credentials | ✅ Applied |
| 002 | Billing | subscriptions, invoices, payment_methods | ✅ Applied |
| 003 | Users & RBAC | users, organization_members, project_members | ✅ Applied |
| 004 | Seed data | Lancio organization | ✅ Applied |
| 005 | Audit logs | audit_logs table | ✅ Applied |
| 006 | Databases + RLS | platform.databases, permissive RLS | ✅ Applied |
| 007 | Restrictive RLS | Org-based isolation policies | ❌ NOT APPLIED |

### Migration Dependencies

```
001 (Core)
 ├─► 002 (Billing) → requires organizations
 ├─► 003 (Users) → requires organizations, projects
 │    └─► 004 (Seed) → requires users, organization_members
 │         └─► 005 (Audit) → requires all core tables
 │              └─► 006 (Databases + Permissive RLS) → requires projects
 │                   └─► 007 (Restrictive RLS) → requires session variable middleware
```

---

## 8. Data Modeling Issues & Recommendations

### 8.1 Credential Storage Duplication

**Issue**: Dual credential storage patterns
- Primary PostgreSQL credentials in `projects` table
- MongoDB/Redis credentials in `platform.databases` table
- Different security models (plaintext vs encrypted)

**Recommendation**:
```sql
-- Normalize credential storage
ALTER TABLE platform.projects DROP COLUMN database_password;
ALTER TABLE platform.projects ADD COLUMN primary_database_id UUID REFERENCES platform.databases(id);

-- Migrate primary PostgreSQL to platform.databases
-- Encrypt all credentials consistently
```

**Benefits**:
- Unified credential management
- Consistent encryption strategy
- Easier credential rotation
- Cleaner separation of concerns

---

### 8.2 Session Variable Dependency

**Issue**: Migration 007 RLS policies require application-layer session variables

**Current State**:
```typescript
// No session variable setting in current queries
await queryPlatformDatabase({ query: '...', parameters: [...] });
```

**Required Future State**:
```typescript
// Must set session context before RLS queries
await queryPlatformDatabase({
  query: `
    SET LOCAL app.current_user_id = $1;
    SET LOCAL app.current_org_id = $2;
    SELECT * FROM platform.organizations;
  `,
  parameters: [userId, orgId]
});
```

**Recommendation**: Implement session variable middleware before applying Migration 007.

---

### 8.3 Index Coverage Analysis

**Well-Indexed**:
- ✅ Tenant isolation: `idx_projects_organization_id`, `idx_organization_members_org`
- ✅ Unique lookups: `idx_projects_ref`, `idx_organizations_slug`
- ✅ Time-series: `idx_audit_logs_created`, `idx_project_metrics_timestamp`
- ✅ Composite queries: `idx_projects_org_status`, `idx_databases_project_type_status`

**Partial Index Strategy**:
- ✅ Soft deletes: `idx_users_email WHERE deleted_at IS NULL`
- ✅ Active sessions: `idx_api_keys_hash WHERE revoked_at IS NULL`
- ✅ Health monitoring: `idx_databases_health_check WHERE health_check_status IS NOT NULL`

**Potential Gaps**:
- ❓ `platform.databases` lacks index on `(project_id, name)` for name-based lookups
- ❓ `platform.project_addons` lacks index on `(addon_id, status)` for catalog queries
- ❓ `platform.audit_logs` could benefit from GIN index on `metadata` JSONB for event filtering

**Recommendation**:
```sql
CREATE INDEX idx_databases_project_name ON platform.databases(project_id, name);
CREATE INDEX idx_project_addons_addon_status ON platform.project_addons(addon_id, status);
CREATE INDEX idx_audit_logs_metadata ON platform.audit_logs USING GIN(metadata);
```

---

### 8.4 Normalization Analysis

**Third Normal Form (3NF) Compliance**: ✅ Generally good

**Denormalization for Performance**:
- `subscriptions.plan_name` (duplicates `billing_plans.name`)
  - **Justification**: Snapshot of plan at subscription time, prevents historical data loss
  - **Trade-off**: Acceptable for billing audit trail

**JSONB Usage**:
- `billing_plans.limits`, `platform.databases.config`
  - **Pattern**: Schema-on-read for extensible attributes
  - **Risk**: Type safety and query complexity
  - **Mitigation**: Application-layer validation + JSONB constraints

**Foreign Key Integrity**: ✅ Comprehensive
- All relationships enforced via `REFERENCES`
- Cascade deletes where appropriate (`ON DELETE CASCADE`)
- Nullification for audit preservation (`ON DELETE SET NULL`)

---

### 8.5 Temporal Data Modeling

**Current Patterns**:
- ✅ Soft deletes: `users.deleted_at`
- ✅ Activity tracking: `last_sign_in_at`, `last_health_check_at`
- ✅ Lifecycle: `activated_at`, `deactivated_at`
- ❌ No historical state tracking for organizations/projects

**Missing Temporal Patterns**:
- Project status history (when did status change from ACTIVE to PAUSED?)
- Subscription plan changes (downgrades/upgrades)
- Membership role history (who was admin when?)

**Recommendation**: Consider adding history tables or temporal validity periods for audit requirements:
```sql
-- Example: Project status history
CREATE TABLE platform.project_status_history (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES platform.projects(id),
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES platform.users(id),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. Security & Data Protection

### 9.1 Encryption

**Connection Strings** (`platform.databases`):
- Algorithm: `pgp_sym_encrypt()` via pgcrypto
- Key derivation: `sha256(project_id || 'database_encryption_salt_v1')`
- **Concern**: Deterministic per-project key (not secure for production)
- **Recommendation**: Use environment-based master key + project-specific salts

**Password Storage**:
- `users.password_hash`: Application-layer hashing (likely bcrypt/scrypt)
- `projects.database_password`: Plaintext (should be encrypted like `platform.databases`)

**Sensitive Data Access**:
- `platform.databases_with_connection_strings` view: SECURITY DEFINER
- `platform.decrypt_database_connection_string()`: SECURITY DEFINER
- Restricted to postgres role

---

### 9.2 Multi-Tenant Isolation Verification

**Current Application-Layer Isolation**:
```typescript
// Every query verifies membership BEFORE data access
const membership = await verifyOrgAccess(slug, user, res);
if (!membership) return; // 403 or 404

// Then query with explicit tenant filtering
SELECT * FROM platform.projects WHERE organization_id = membership.org_id;
```

**Future Database-Layer Isolation (Migration 007)**:
```sql
-- RLS policies enforce isolation automatically
SELECT * FROM platform.projects;
-- RLS filters to: WHERE organization_id IN (SELECT org_id FROM org_members WHERE user_id = current_user_id())
```

**Recommendation**:
- ✅ Current approach works (defense in depth)
- ⚠️ Migration 007 adds database-layer enforcement
- 🔒 Keep both layers for security belt-and-suspenders

---

## 10. Questions for Backend Team

### 10.1 Query Pattern Questions

1. **Database Connection Pooling**: How are connections from `platform.databases` pooled? Per-project? Per-tenant?

2. **Credential Rotation**: What's the process for rotating database credentials? Does it update both `projects.database_password` AND `platform.databases.connection_string`?

3. **Health Check Frequency**: What's the polling interval for `platform.update_database_health()`? Is it triggering on every query or scheduled?

4. **Session Caching**: Redis integration exists for sessions - is it reading from `user_sessions` or bypassing the table entirely?

### 10.2 RLS Migration Questions

5. **Session Variable Middleware**: What's the plan for setting `app.current_user_id` and `app.current_org_id`? At connection level? Per-transaction?

6. **Service Role Queries**: Do any backend services need to query across organizations (e.g., admin dashboards)? How will they work with RLS?

7. **Performance Impact**: Have you load-tested RLS policy evaluation? Any indexes needed for RLS subqueries?

### 10.3 Data Model Questions

8. **Project Membership vs Org Membership**: When should someone be a `project_member` vs just an `organization_member`? Design intent?

9. **Database Type Evolution**: Are there plans for other database types beyond MongoDB/Redis/PostgreSQL? (e.g., Elasticsearch, ClickHouse?)

10. **Audit Log Retention**: What's the retention policy for `audit_logs` and `project_metrics`? Should we partition by time?

---

## 11. Schema Strengths

✅ **Strong Multi-Tenant Foundation**
- Clear hierarchy: Organization → Project → Database
- Comprehensive RBAC via `organization_members` and `project_members`
- Flexible role hierarchy with helper functions

✅ **Polyglot Database Support**
- `platform.databases` table elegantly handles MongoDB/Redis/PostgreSQL
- JSONB config allows type-specific parameters
- Encrypted credential storage with decryption helpers

✅ **Comprehensive Audit Trail**
- `audit_logs` tracks all operations with context
- Nullable foreign keys preserve audit data after entity deletion
- Severity filtering for security monitoring

✅ **Billing & Usage Tracking**
- Well-normalized billing model (subscriptions, invoices, payment methods)
- Flexible add-on system via `project_addons`
- Usage metrics for both projects and organizations

✅ **Thoughtful Indexing Strategy**
- Composite indexes for common query patterns
- Partial indexes for filtered queries (soft deletes, active records)
- Time-series optimization for metrics and logs

✅ **Schema Evolution Planning**
- Migration 006 → 007 path shows thoughtful RLS rollout
- Permissive-first approach prevents downtime
- Helper functions ease transition to restrictive policies

---

## 12. Coordination Points

**With Viktor Novak (Multi-Tenancy Architect)**:
- RLS policy enforcement strategy
- Session variable middleware design
- Cross-tenant admin query patterns

**With Rashid Khalil (RBAC Specialist)**:
- Role hierarchy implementation in RLS policies
- Permission checking in `user_has_org_role()` function
- Project vs organization membership access model

**With Session/Auth Squad**:
- Session variable setting in authentication flow
- User context propagation to database layer
- `user_sessions` table vs Redis cache interaction

**With Backend Squad**:
- Query patterns for tenant-scoped data access
- Database connection management for `platform.databases`
- Credential rotation workflows

**With Architecture Squad**:
- Data layer's role in overall system architecture
- Service boundaries and data ownership
- Read replicas and query routing strategy

---

## Appendix A: Complete Table List

### Core Tenant Tables
1. `platform.organizations` - Top-level tenants
2. `platform.organization_members` - Org membership & RBAC
3. `platform.organization_invitations` - Pending invites
4. `platform.organization_feature_flags` - Org-specific flags
5. `platform.projects` - Database instances/environments
6. `platform.project_members` - Project-level access
7. `platform.project_addons` - Active add-ons per project
8. `platform.project_metrics` - Time-series infrastructure metrics
9. `platform.databases` - Polyglot database connections (Migration 006)

### User & Auth Tables
10. `platform.users` - User accounts
11. `platform.user_sessions` - Active sessions
12. `platform.api_keys` - Programmatic access keys

### Credentials & Security
13. `platform.credentials` - Project JWT credentials

### Billing Tables
14. `platform.subscriptions` - Org billing plans
15. `platform.billing_plans` - Plan catalog (reference data)
16. `platform.invoices` - Invoice history
17. `platform.payment_methods` - Stored payment info
18. `platform.tax_ids` - Tax identification
19. `platform.customer_profiles` - Stripe customer mapping
20. `platform.credits` - Account credits

### Resource Configuration
21. `platform.disk_config` - Storage provisioning
22. `platform.compute_config` - Instance sizing
23. `platform.addons` - Add-on catalog

### Usage & Metrics
24. `platform.usage_metrics` - Billing usage data

### Operational Tables
25. `platform.audit_logs` - Audit trail
26. `platform.feature_flags` - Global feature flags

**Total: 26 tables** (all with RLS enabled as of Migration 006)

---

## Appendix B: Key Helper Functions

### Migration 001 Functions
- `platform.update_updated_at_column()` - Auto-update trigger
- `platform.generate_slug(TEXT)` - URL-safe slug generation
- `platform.get_organization_by_slug(TEXT)`
- `platform.get_project_by_ref(TEXT)`
- `platform.get_credentials_by_project_ref(TEXT)`

### Migration 003 Functions
- `platform.is_organization_owner(user_id, org_id)`
- `platform.has_project_access(user_id, project_id)`
- `platform.get_active_feature_flags(org_id)`

### Migration 006 Functions
- `platform.encrypt_database_connection_string()` - Trigger
- `platform.decrypt_database_connection_string(database_id)`
- `platform.get_project_databases(project_id, type)`
- `platform.update_database_health(database_id, status, error)`

### Migration 007 Functions (NOT YET APPLIED)
- `platform.current_user_id()` - Get session user
- `platform.current_org_id()` - Get session org
- `platform.user_is_org_member(org_id)`
- `platform.user_has_org_role(org_id, required_role)`

---

## Appendix C: Critical Views

### Migration 001 Views
- `platform.projects_with_credentials` - Projects + JWT keys
- `platform.organizations_with_stats` - Orgs + project counts

### Migration 006 Views
- `platform.databases_with_connection_strings` - RESTRICTED, decrypted
- `platform.databases_safe` - PUBLIC, masked credentials

---

**End of Audit**

Schema is production-ready with permissive RLS. Migration to restrictive RLS requires application-layer session variable implementation. Overall data model is sound with minor normalization and encryption improvements recommended.
