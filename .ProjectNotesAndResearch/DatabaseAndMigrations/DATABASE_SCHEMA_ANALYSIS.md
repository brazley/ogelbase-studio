# OgelBase Platform Database Schema Analysis
**Prepared by**: Rafael Santos - Database Architect
**Date**: 2025-11-21
**Analysis Type**: Comprehensive Schema Gap Analysis

---

## Executive Summary

The OgelBase platform currently has **3 applied migrations** (001, 002, and 004) with **migration 003** being a standalone multi-database support migration. After analyzing all API routes, frontend components, and code references, I've identified **critical missing tables** that are preventing full platform functionality.

**Current Migration Status**:
- ✅ **001**: Core platform schema (organizations, projects, credentials)
- ✅ **002**: Billing infrastructure (subscriptions, invoices, payments, usage)
- ❌ **003**: Multi-database support (exists but not in primary migration path)
- ✅ **004**: Lancio organization data seed (references missing tables)

**Critical Finding**: Migration 004 references `platform.organization_members` table that doesn't exist in migrations 001 or 002, indicating a gap in the schema.

---

## Part 1: Current State - Existing Tables

### From Migration 001 (Core Schema)
1. **platform.organizations**
   - Purpose: Store organization/tenant information
   - Key columns: id, name, slug, billing_email
   - Indexes: slug, created_at

2. **platform.projects**
   - Purpose: Store project configurations and database connections
   - Key columns: id, organization_id, name, ref, database_host, database_port, database_name, database_user, database_password
   - Indexes: organization_id, ref, slug, status, org_status composite

3. **platform.credentials**
   - Purpose: Store JWT credentials for projects
   - Key columns: id, project_id, anon_key, service_role_key, jwt_secret
   - Indexes: project_id (unique)

### From Migration 002 (Billing Schema)
4. **platform.subscriptions**
   - Purpose: Organization subscription plans
   - Key columns: organization_id, plan_id, plan_name, status, billing cycles, stripe IDs
   - Indexes: organization_id (unique), status, plan_id, stripe_customer_id

5. **platform.invoices**
   - Purpose: Billing invoices
   - Key columns: organization_id, stripe_invoice_id, amounts, status, periods
   - Indexes: organization_id, status, stripe_invoice_id, periods

6. **platform.payment_methods**
   - Purpose: Payment method storage
   - Key columns: organization_id, stripe_payment_method_id, type, card details
   - Indexes: organization_id, is_default

7. **platform.tax_ids**
   - Purpose: Tax identification numbers
   - Key columns: organization_id, type, value, country
   - Indexes: organization_id, status

8. **platform.usage_metrics**
   - Purpose: Usage tracking for billing
   - Key columns: organization_id, project_id, metric_type, metric_value, period
   - Indexes: org_period, project_period, type, org_type_period composite

9. **platform.addons**
   - Purpose: Available add-on catalog
   - Key columns: project_id, addon_type, addon_variant, quantity, price
   - Indexes: project_id, status, type

10. **platform.customer_profiles**
    - Purpose: Customer billing profiles
    - Key columns: organization_id (unique), company_name, address fields
    - Indexes: organization_id

11. **platform.credits**
    - Purpose: Promotional credits
    - Key columns: organization_id, amount, remaining, expires_at
    - Indexes: organization_id, expires_at

12. **platform.disk_config**
    - Purpose: Project disk configuration
    - Key columns: project_id (unique), size_gb, io_budget, autoscale settings
    - Indexes: project_id

13. **platform.compute_config**
    - Purpose: Compute instance configuration
    - Key columns: project_id (unique), instance_size, cpu_cores, memory_gb
    - Indexes: project_id, instance_size

### From Migration 003 (Multi-Database Support)
14. **platform.databases**
    - Purpose: Multi-database connections (PostgreSQL, MongoDB, Redis)
    - Key columns: id, project_id, name, type, connection_string, config
    - Indexes: project_id, type, status, health_check
    - Status: ⚠️ Exists but not in main migration sequence

15. **platform.database_metrics**
    - Purpose: Time-series metrics for database connections
    - Key columns: database_id, metric_type, value, timestamp
    - Status: ⚠️ Exists but not in main migration sequence

16. **platform.database_connection_logs**
    - Purpose: Audit trail for database connections
    - Key columns: database_id, project_id, event_type, message
    - Status: ⚠️ Exists but not in main migration sequence

---

## Part 2: Critical Missing Tables

### 🔴 CRITICAL - Referenced but Not Created

#### 1. platform.organization_members ⚠️ **BLOCKING**
**Evidence**:
- Referenced in: `004_create_lancio_org.sql` (lines 40-47, 60)
- Referenced in: `pages/api/platform/organizations/[slug]/usage.ts` (line 69)
- Referenced in: Frontend queries expect this table
- Referenced in: PLATFORM_ENDPOINTS_COMPLETE.md schema requirements

**Purpose**: Track organization membership and roles

**Required Schema**:
```sql
CREATE TABLE platform.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,  -- References auth.users or platform.users
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'billing_admin', 'member')),
  invited_at TIMESTAMPTZ,
  invited_by UUID,  -- References auth.users
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_organization_members_org ON platform.organization_members(organization_id);
CREATE INDEX idx_organization_members_user ON platform.organization_members(user_id);
CREATE INDEX idx_organization_members_role ON platform.organization_members(role);
```

**Impact**:
- ❌ Migration 004 FAILS without this table
- ❌ Organization usage queries fail
- ❌ User access control impossible
- ❌ Frontend member management broken

---

#### 2. platform.project_members 🔴 **HIGH PRIORITY**
**Evidence**:
- Implied by organization_members structure
- Standard multi-tenant pattern requires project-level permissions
- Supabase Studio UI has project-level access controls

**Purpose**: Track project-specific member access and permissions

**Required Schema**:
```sql
CREATE TABLE platform.project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,  -- References auth.users or platform.users
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'read_only')),
  added_by UUID,  -- References auth.users
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON platform.project_members(project_id);
CREATE INDEX idx_project_members_user ON platform.project_members(user_id);
CREATE INDEX idx_project_members_role ON platform.project_members(role);
```

**Impact**:
- ❌ Cannot restrict project access
- ❌ No project-level permissions
- ❌ Security gap in multi-tenant setup

---

#### 3. platform.project_addons 🔴 **BREAKING**
**Evidence**:
- Referenced in: `pages/api/platform/projects/[ref]/billing/addons.ts` (lines 96-98)
- Referenced in: PLATFORM_ENDPOINTS_COMPLETE.md (lines 564-569)
- Current `platform.addons` table stores project_id, suggesting confusion in design

**Purpose**: Link projects to their active add-ons

**Required Schema**:
```sql
CREATE TABLE platform.project_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL,  -- 'pitr', 'custom_domain', 'ipv4', 'compute_instance'
  addon_variant TEXT,
  quantity INTEGER DEFAULT 1,
  price_per_unit NUMERIC(10,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, addon_id)
);

CREATE INDEX idx_project_addons_project ON platform.project_addons(project_id);
CREATE INDEX idx_project_addons_status ON platform.project_addons(status);
CREATE INDEX idx_project_addons_addon_id ON platform.project_addons(addon_id);
```

**Impact**:
- ❌ Add-ons API endpoint returns wrong data
- ❌ Billing calculations incorrect
- ❌ Cannot track add-on usage per project

**Migration Note**: Current `platform.addons` table (from migration 002) should be **split**:
- Keep `platform.addons` as the catalog/definition table (rename existing)
- Create `platform.project_addons` as the junction table

---

#### 4. platform.project_metrics 🔴 **BREAKING**
**Evidence**:
- Referenced in: `pages/api/platform/projects/[ref]/infra-monitoring.ts` (lines 69-70)
- Referenced in: PLATFORM_ENDPOINTS_COMPLETE.md (lines 575-586)

**Purpose**: Time-series infrastructure monitoring data

**Required Schema**:
```sql
CREATE TABLE platform.project_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES platform.projects(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cpu_usage NUMERIC(5,2),  -- Percentage
  memory_usage NUMERIC(5,2),  -- Percentage
  disk_io_budget NUMERIC(10,2),  -- IOPS
  disk_usage_gb NUMERIC(10,2),
  network_in_bytes BIGINT,
  network_out_bytes BIGINT,
  active_connections INTEGER,
  query_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_metrics_project_timestamp ON platform.project_metrics(project_id, timestamp DESC);
CREATE INDEX idx_project_metrics_timestamp ON platform.project_metrics(timestamp DESC);

-- Optional: TimescaleDB hypertable for better time-series performance
-- SELECT create_hypertable('platform.project_metrics', 'timestamp', if_not_exists => TRUE);
```

**Impact**:
- ❌ Infrastructure monitoring endpoint returns mock data only
- ❌ No real performance metrics stored
- ❌ Cannot track historical resource usage

---

#### 5. platform.billing_plans 🟡 **MEDIUM**
**Evidence**:
- Referenced in: `pages/api/platform/organizations/[slug]/billing/plans.ts` (line 115)
- Referenced in: PLATFORM_ENDPOINTS_COMPLETE.md (lines 488-497)
- Current `platform.subscriptions` has `plan_id` field expecting this table

**Purpose**: Define available billing plans/tiers

**Required Schema**:
```sql
CREATE TABLE platform.billing_plans (
  id TEXT PRIMARY KEY,  -- 'tier_free', 'tier_pro', 'tier_team', 'tier_enterprise'
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  features JSONB,
  limits JSONB,  -- {max_projects: 2, max_members: 5, disk_gb: 8, bandwidth_gb: 5}
  max_projects INTEGER,
  max_members INTEGER,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billing_plans_active ON platform.billing_plans(active, sort_order);
```

**Impact**:
- ⚠️ Billing plans endpoint works but returns mock data
- ⚠️ Cannot enforce plan limits
- ⚠️ Subscription plan_id foreign key not enforced

---

### 🟡 IMPORTANT - Authentication & Users

#### 6. platform.users 🟡 **MEDIUM PRIORITY**
**Evidence**:
- Implied by: All user_id foreign keys in organization_members, project_members
- Profile endpoint hardcodes: `id: 1, primary_email: 'admin@ogelbase.com'`
- No actual user table exists for self-hosted mode

**Purpose**: User accounts for platform (not GoTrue auth.users)

**Required Schema**:
```sql
CREATE TABLE platform.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  phone TEXT,

  -- Authentication (if not using GoTrue)
  password_hash TEXT,

  -- MFA
  mfa_enabled BOOLEAN DEFAULT false,

  -- Status
  email_confirmed_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,

  -- Timestamps
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON platform.users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON platform.users(created_at);
```

**Impact**:
- ⚠️ Currently using hardcoded mock user
- ⚠️ No real user management
- ⚠️ Foreign keys to user_id cannot be enforced

**Design Decision Needed**:
- Option A: Use GoTrue's `auth.users` table (if available)
- Option B: Create `platform.users` for self-hosted mode
- Option C: Support both with user_id referencing either

---

#### 7. platform.user_sessions 🟡 **MEDIUM**
**Evidence**:
- Standard multi-tenant requirement
- Profile queries need session validation

**Purpose**: Track active user sessions

**Required Schema**:
```sql
CREATE TABLE platform.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  refresh_token TEXT UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user ON platform.user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON platform.user_sessions(token) WHERE expires_at > NOW();
CREATE INDEX idx_user_sessions_expires ON platform.user_sessions(expires_at);
```

**Impact**:
- ⚠️ No session management
- ⚠️ Cannot invalidate sessions
- ⚠️ No security audit trail

---

### 🟢 RECOMMENDED - Enterprise Features

#### 8. platform.organization_invitations 🟢 **NICE-TO-HAVE**
**Evidence**:
- Frontend references invite functionality
- `data/organization-members/organization-invitation-*.ts` files exist

**Purpose**: Pending organization invitations

**Required Schema**:
```sql
CREATE TABLE platform.organization_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES platform.users(id),
  role_id INTEGER,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_invitations_org ON platform.organization_invitations(organization_id);
CREATE INDEX idx_org_invitations_token ON platform.organization_invitations(token) WHERE accepted_at IS NULL;
CREATE INDEX idx_org_invitations_email ON platform.organization_invitations(invited_email);
```

---

#### 9. platform.api_keys 🟢 **RECOMMENDED**
**Evidence**:
- Enterprise feature for API access
- Different from JWT credentials (project-level vs API-level)

**Purpose**: Platform API keys for programmatic access

**Required Schema**:
```sql
CREATE TABLE platform.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES platform.users(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,  -- First 8 chars for identification
  key_hash TEXT NOT NULL UNIQUE,  -- Hashed full key
  scopes JSONB,  -- ['projects:read', 'organizations:write']
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org ON platform.api_keys(organization_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_hash ON platform.api_keys(key_hash) WHERE revoked_at IS NULL;
```

---

#### 10. platform.audit_logs 🟢 **RECOMMENDED**
**Evidence**:
- Enterprise compliance requirement
- Critical for multi-tenant security

**Purpose**: Audit trail of all platform actions

**Required Schema**:
```sql
CREATE TABLE platform.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES platform.projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES platform.users(id) ON DELETE SET NULL,

  -- Event details
  event_type TEXT NOT NULL,  -- 'project.created', 'member.invited', 'billing.updated'
  resource_type TEXT,  -- 'project', 'organization', 'user'
  resource_id UUID,
  action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'invite'

  -- Context
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,

  -- Security
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_created ON platform.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_created ON platform.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON platform.audit_logs(event_type, created_at DESC);
CREATE INDEX idx_audit_logs_created ON platform.audit_logs(created_at DESC);

-- Optional: TimescaleDB hypertable
-- SELECT create_hypertable('platform.audit_logs', 'created_at', if_not_exists => TRUE);
```

---

#### 11. platform.feature_flags 🟢 **NICE-TO-HAVE**
**Evidence**:
- Modern SaaS requirement
- Allows gradual feature rollout

**Purpose**: Feature flag management per organization

**Required Schema**:
```sql
CREATE TABLE platform.feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key TEXT NOT NULL UNIQUE,
  flag_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE platform.organization_feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES platform.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, flag_id)
);

CREATE INDEX idx_org_feature_flags_org ON platform.organization_feature_flags(organization_id);
CREATE INDEX idx_org_feature_flags_flag ON platform.organization_feature_flags(flag_id);
```

---

## Part 3: Schema Inconsistencies & Issues

### Issue 1: platform.addons Table Confusion
**Current State**: Migration 002 creates `platform.addons` with `project_id` column

**Problem**: This conflates the add-on **catalog** with add-on **usage**

**Solution**: Split into two tables:
```sql
-- Add-on definitions (what's available)
ALTER TABLE platform.addons DROP COLUMN IF EXISTS project_id;
ALTER TABLE platform.addons DROP COLUMN IF EXISTS quantity;
ALTER TABLE platform.addons DROP COLUMN IF EXISTS price_per_unit;
ALTER TABLE platform.addons DROP COLUMN IF EXISTS status;
ALTER TABLE platform.addons DROP COLUMN IF EXISTS activated_at;
ALTER TABLE platform.addons DROP COLUMN IF EXISTS deactivated_at;
ALTER TABLE platform.addons ADD COLUMN IF NOT EXISTS addon_id TEXT UNIQUE;
ALTER TABLE platform.addons RENAME TO addon_catalog;

-- Create project_addons junction table (see #3 above)
```

---

### Issue 2: Missing Foreign Key Constraints
**Current State**: Multiple user_id fields without table to reference

**Problem**: Cannot enforce referential integrity

**Solution**: Create `platform.users` table first, then add constraints:
```sql
ALTER TABLE platform.organization_members
  ADD CONSTRAINT fk_org_members_user
  FOREIGN KEY (user_id) REFERENCES platform.users(id) ON DELETE CASCADE;

ALTER TABLE platform.project_members
  ADD CONSTRAINT fk_project_members_user
  FOREIGN KEY (user_id) REFERENCES platform.users(id) ON DELETE CASCADE;
```

---

### Issue 3: Migration 003 Not in Sequence
**Current State**: Multi-database support exists but not in primary migration path

**Problem**: May not be applied, causing database connection issues

**Solution**: Either:
- A) Rename to `005_multi_database_support.sql` and apply after 004
- B) Integrate into Migration 003 (recommended - see below)

---

## Part 4: Recommended Migration 003 Structure

Migration 003 should be the **missing critical tables** migration:

```sql
-- Migration 003: Critical Missing Tables
-- This migration adds user management, membership, and metrics tables
-- that are referenced throughout the codebase but were missing from 001/002

-- 1. Users table (foundation for all user references)
CREATE TABLE platform.users (...);

-- 2. User sessions
CREATE TABLE platform.user_sessions (...);

-- 3. Organization membership (CRITICAL - referenced in migration 004)
CREATE TABLE platform.organization_members (...);

-- 4. Project membership
CREATE TABLE platform.project_members (...);

-- 5. Organization invitations
CREATE TABLE platform.organization_invitations (...);

-- 6. Billing plans (referenced by subscriptions)
CREATE TABLE platform.billing_plans (...);

-- 7. Fix addons confusion - split into catalog and usage
-- Rename existing addons to addon_catalog
-- Create project_addons junction table
ALTER TABLE platform.addons RENAME TO addon_catalog;
CREATE TABLE platform.project_addons (...);

-- 8. Project metrics (infrastructure monitoring)
CREATE TABLE platform.project_metrics (...);

-- 9. API keys
CREATE TABLE platform.api_keys (...);

-- 10. Audit logs
CREATE TABLE platform.audit_logs (...);

-- 11. Feature flags
CREATE TABLE platform.feature_flags (...);
CREATE TABLE platform.organization_feature_flags (...);
```

Then Migration 004 can be reordered as a data seed migration.

---

## Part 5: Migration Strategy

### Immediate Actions (Critical Path)

1. **Create Migration 003** with tables in this order:
   ```
   1. platform.users (if not using GoTrue)
   2. platform.user_sessions
   3. platform.organization_members  ← BLOCKS migration 004
   4. platform.project_members
   5. platform.billing_plans  ← Referenced by subscriptions
   6. Refactor platform.addons → addon_catalog
   7. platform.project_addons  ← API expects this
   8. platform.project_metrics  ← Monitoring broken without this
   ```

2. **Apply Migration 003**:
   ```bash
   psql $DATABASE_URL -f apps/studio/database/migrations/003_critical_tables.sql
   ```

3. **Re-apply Migration 004** (should now succeed)

4. **Integrate Multi-Database Support** (current 003):
   ```bash
   # Rename and apply as 005
   mv 003_add_multi_database_support.sql 005_multi_database_support.sql
   psql $DATABASE_URL -f apps/studio/database/migrations/005_multi_database_support.sql
   ```

### Optional Enhancements

5. **Create Migration 006** - Organization invitations
6. **Create Migration 007** - API keys and audit logs
7. **Create Migration 008** - Feature flags

---

## Part 6: Impact Analysis

### What Works Now ✅
- Organization CRUD (basic)
- Project CRUD (basic)
- Credentials management
- Billing subscription tracking
- Invoice tracking
- Payment methods
- Disk/compute configuration

### What's Broken ❌
- ❌ Migration 004 cannot run (missing organization_members)
- ❌ User management completely missing
- ❌ Organization membership tracking
- ❌ Project-level permissions
- ❌ Organization usage endpoint (queries missing table)
- ❌ Add-ons API (queries missing table)
- ❌ Infrastructure monitoring (queries missing table)
- ❌ Billing plan enforcement
- ❌ User sessions and authentication
- ❌ API key management
- ❌ Audit logging

### What Returns Mock Data 🟡
- 🟡 Profile endpoint (hardcoded user)
- 🟡 Billing plans endpoint
- 🟡 Infrastructure metrics endpoint
- 🟡 Add-ons endpoint

---

## Part 7: Testing Checklist

After applying Migration 003:

```bash
# 1. Verify all tables exist
psql $DATABASE_URL -c "\dt platform.*"

# Expected output should include:
# - organizations
# - projects
# - credentials
# - subscriptions
# - invoices
# - payment_methods
# - tax_ids
# - usage_metrics
# - addon_catalog (renamed from addons)
# - project_addons (new)
# - customer_profiles
# - credits
# - disk_config
# - compute_config
# - users (new)
# - user_sessions (new)
# - organization_members (new) ← CRITICAL
# - project_members (new)
# - organization_invitations (new)
# - billing_plans (new) ← CRITICAL
# - project_metrics (new) ← CRITICAL
# - api_keys (new)
# - audit_logs (new)
# - feature_flags (new)
# - organization_feature_flags (new)

# 2. Verify migration 004 can now run
psql $DATABASE_URL -f apps/studio/database/migrations/004_create_lancio_org.sql

# 3. Test API endpoints
curl http://localhost:3000/api/platform/organizations/lancio/usage
curl http://localhost:3000/api/platform/projects/default/billing/addons
curl http://localhost:3000/api/platform/projects/default/infra-monitoring

# 4. Check for foreign key constraints
psql $DATABASE_URL -c "
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'platform'
ORDER BY tc.table_name;
"
```

---

## Part 8: Recommendations

### Priority 1 (Immediate - Platform Broken Without These)
1. ✅ **platform.users** - Foundation for all user references
2. ✅ **platform.organization_members** - Migration 004 fails without this
3. ✅ **platform.project_addons** - Add-ons API completely broken
4. ✅ **platform.project_metrics** - Monitoring endpoint broken
5. ✅ **platform.billing_plans** - Subscription foreign keys not enforced

### Priority 2 (Important - Missing Key Features)
6. ✅ **platform.project_members** - No project permissions
7. ✅ **platform.user_sessions** - No session management
8. ✅ **platform.organization_invitations** - No invite flow

### Priority 3 (Recommended - Enterprise Features)
9. ✅ **platform.api_keys** - Programmatic access
10. ✅ **platform.audit_logs** - Compliance and security
11. ✅ **platform.feature_flags** - Gradual rollouts

### Architecture Decisions Required

**Decision 1: User Authentication Strategy**
- Option A: Use Supabase GoTrue (auth.users) if available
- Option B: Create platform.users for self-hosted mode
- Option C: Hybrid approach with user_id supporting both

**Recommendation**: Start with Option B (platform.users) for full self-hosted support

**Decision 2: Multi-Database Migration**
- Option A: Keep as separate migration (current 003)
- Option B: Integrate into Migration 003 with other missing tables

**Recommendation**: Keep separate (rename to 005) - it's a distinct feature

**Decision 3: Addons Table Refactor**
- Option A: Leave as-is, create project_addons alongside
- Option B: Rename addons to addon_catalog, create project_addons
- Option C: Drop and recreate both tables

**Recommendation**: Option B - cleanest separation of concerns

---

## Summary

**Total Tables in Complete Schema**: 27 tables
- **Existing**: 16 tables (13 from 001/002, 3 from standalone 003)
- **Missing Critical**: 5 tables (users, organization_members, project_members, project_addons, project_metrics)
- **Missing Important**: 3 tables (user_sessions, organization_invitations, billing_plans)
- **Recommended**: 3 tables (api_keys, audit_logs, feature_flags + org_feature_flags)

**Critical Path**: Create Migration 003 with at minimum the 5 critical tables to unblock Migration 004 and fix broken API endpoints.

**Timeline Estimate**:
- Writing Migration 003: 2 hours
- Testing and validation: 1 hour
- Applying to production: 30 minutes
- **Total**: ~3.5 hours to production-ready state

---

## Next Steps

1. Review this analysis with the team
2. Make architecture decisions on user auth strategy
3. Create comprehensive Migration 003 SQL file
4. Test in development environment
5. Apply to production database
6. Update Migration 004 if needed
7. Consider integrating Migration 003 (multi-db) as Migration 005

---

**Document Status**: Complete Analysis
**Ready for**: Migration 003 Implementation
**Blocking Issues**: Migration 004 cannot run without Migration 003
