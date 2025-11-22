# Migration Status - Source of Truth

**Last Updated**: 2025-11-22
**Updated By**: Dylan Torres (TPM)

---

## Migration Timeline

| Migration | Status | Applied Date | Notes |
|-----------|--------|--------------|-------|
| 001 | ✅ APPLIED | Unknown | Platform schema creation |
| 002 | ✅ APPLIED | Unknown | Billing schema |
| 003 | ✅ APPLIED | Unknown | User management & permissions |
| 004 | ✅ APPLIED | Unknown | Lancio org creation |
| 005 | ✅ APPLIED | Unknown | Audit logs |
| 006 | ✅ APPLIED | 2025-11-21 | Platform databases table + Railway integration |
| 007 | ❌ NOT APPLIED | N/A | Restrictive RLS policies - BLOCKED waiting for session context |
| 008 | ❌ NOT APPLIED | N/A | Active org tracking - DRAFT exists, not applied |

---

## Migration 006 Status

**Status**: ✅ COMPLETE & APPLIED

**What Was Applied**:
- `006_add_platform_databases_table.sql` - Core table structure
- `006_register_railway_databases_production.sql` - MongoDB & Redis registration
- Permissive RLS policies enabled (allow all - security via app layer)

**Evidence**:
- Completion file exists: `MIGRATION_006_COMPLETE.txt`
- Dated: 2025-11-21
- Deliverables: ~68KB SQL + documentation

**Current State**:
```sql
platform.databases table:
- 15 columns (id, project_id, name, type, connection_string_encrypted, etc.)
- 8 performance indexes
- 4 helper functions (encrypt/decrypt/get/update)
- 2 views (safe + with_connection_strings)
- 2 triggers (auto-encrypt + updated_at)
- RLS: ENABLED but PERMISSIVE (allows all access)
```

**Registered Databases**:
- Railway MongoDB (mongodb.railway.internal:27017)
- Railway Redis (redis.railway.internal:6379)

---

## Migration 007 Status

**Status**: ❌ NOT APPLIED (Ready but blocked)

**Why Blocked**:
- Requires PostgreSQL session variables (`app.current_user_id`, `app.current_org_id`)
- Session variables are NEVER SET in current codebase
- Applying 007 now would BREAK all database access

**What 007 Contains**:
1. `007_restrictive_rls_policies.sql`:
   - Switches from permissive to restrictive RLS
   - Policies check `get_current_user_id()` and `get_current_org_id()`
   - Enforces multi-tenant isolation at database layer

2. `007_session_helpers.sql`:
   - Helper functions: `get_current_user_id()`, `get_current_org_id()`
   - Session variable readers using `current_setting()`

3. `007_rollback.sql`:
   - Reverts to permissive policies
   - Safe rollback if 007 causes issues

**Prerequisites for 007**:
- [ ] WS1: Database context middleware (sets session variables)
- [ ] WS2: Active org tracking (provides activeOrgId)
- [ ] WS3: Service role (bypass RLS for migrations/jobs)
- [ ] WS4: RLS testing framework (validate policies work)

**Target Application Date**: Sprint 3 (Week 5) after all infrastructure ready

---

## Migration 008 Status

**Status**: ❌ NOT APPLIED (Ready for deployment)

**File Location**: `apps/studio/database/migrations/008_add_active_org_tracking.sql`

**What It Contains**:
```sql
-- Add active_org_id to platform.users (not user_sessions)
-- This tracks the user's currently active organization context
ALTER TABLE platform.users
ADD COLUMN active_org_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_users_active_org
ON platform.users(active_org_id)
WHERE active_org_id IS NOT NULL;

-- Helper function: set_user_active_org()
-- Validates user membership before updating

-- Helper function: get_user_active_org()
-- Returns full organization context with user's role

-- Backfill with user's first organization (by joined_at)
UPDATE platform.users u
SET active_org_id = (
  SELECT om.organization_id
  FROM platform.organization_members om
  WHERE om.user_id = u.id
  ORDER BY om.joined_at ASC
  LIMIT 1
)
WHERE active_org_id IS NULL
  AND EXISTS (
    SELECT 1 FROM platform.organization_members om
    WHERE om.user_id = u.id
  );
```

**Architectural Decision - users vs user_sessions**:
- ✅ Column added to `platform.users` (correct choice)
- Rationale: `active_org_id` is a user preference that persists across sessions
- The API code already expects it here (see `apps/studio/pages/api/auth/validate.ts` line 62-64)
- Survives browser refreshes and session expiry
- Alternative (user_sessions) would lose the preference on each new session

**Application Readiness**:
- ✅ `/api/auth/validate` - Already reads `active_org_id` from users table
- ✅ `/api/auth/set-active-org` - Already updates it with membership validation
- ✅ TypeScript types - `AuthenticatedUser.activeOrgId` already defined
- ✅ Error handling - Proper validation and exceptions

**Dependencies**:
- Migration 007 does NOT depend on this
- WS2 (Frontend org switcher) depends on this
- No blocker for applying this migration immediately

**Target Application Date**: Sprint 1 (Week 1-2) - READY NOW

---

## Current Database State (Inferred)

**Schema**: `platform`

**Tables** (from migrations 001-006):
- `users` - User accounts
- `organizations` - Multi-tenant orgs
- `organization_members` - User-to-org relationships with roles
- `projects` - Projects belong to organizations
- `databases` - Platform databases table (NEW in 006)
- `user_sessions` - Session storage
- `audit_logs` - Audit trail
- `billing_plans` - Billing schema
- `subscriptions` - Billing schema
- `invoices` - Billing schema
- `payment_methods` - Billing schema
- `addons_catalog` - Billing schema
- `subscription_addons` - Billing schema

**RLS Status**:
- ✅ ENABLED on all tables
- ⚠️ PERMISSIVE mode (allows all, app-layer filtering)
- ❌ Session variables NOT SET (RLS can't enforce isolation)

**Session Table Structure** (Migration 003):
```sql
platform.user_sessions:
- id (UUID, PK)
- user_id (UUID, FK to users)
- token_hash (TEXT) - hashed session token
- ip_address (TEXT, nullable)
- user_agent (TEXT, nullable)
- created_at (TIMESTAMPTZ)
- expires_at (TIMESTAMPTZ)
- last_activity_at (TIMESTAMPTZ)
-- active_org_id DOES NOT EXIST YET (Migration 008)
```

---

## Security Architecture

**Current (Post-006, Pre-007)**:
```
Layer 1: API Authentication ✅
Layer 2: Application Filtering ✅
Layer 3: Database RLS = PERMISSIVE (❌ no isolation)
```

**Target (Post-007)**:
```
Layer 1: API Authentication ✅
Layer 2: Application Filtering ✅
Layer 3: Database RLS = RESTRICTIVE (✅ enforces isolation)
```

**Risk**: Currently one application bug could leak cross-tenant data

---

## Blocker Resolution Plan

**Sprint 1 (Weeks 1-2)**: Build Prerequisites
- WS1: Database context middleware
- WS2: Active org tracking (Migration 008)
- WS3: Service role for migrations
- WS4: RLS test harness

**Sprint 2 (Weeks 3-4)**: Integration Testing
- Test all infrastructure together
- Shadow mode RLS testing (log violations, don't enforce)
- Performance validation

**Sprint 3 (Week 5)**: Apply Migration 007
- Deploy to staging
- Monitor for policy violations
- Production rollout
- Migration 007 APPLIED ✅

---

## Files Reference

**Applied Migrations**:
- `001_create_platform_schema.sql`
- `002_platform_billing_schema.sql`
- `003_user_management_and_permissions.sql`
- `004_create_lancio_org.sql`
- `005_create_audit_logs.sql`
- `006_add_platform_databases_table.sql`
- `006_register_railway_databases_production.sql`

**Pending Migrations**:
- `007_session_helpers.sql` - Ready
- `007_restrictive_rls_policies.sql` - Ready but blocked
- `008_add_active_org_tracking.sql` - Draft, needs review

**Support Files**:
- `006_rollback.sql` - Rollback for 006
- `007_rollback.sql` - Rollback for 007
- `test_006_permissive_policies.sql` - Test permissive RLS
- `test_007_restrictive_policies.sql` - Test restrictive RLS
- `test_database_health.sql` - General health checks

---

## Next Actions

1. **Asha** - Review Migration 008 draft, apply after WS2 frontend complete
2. **All teams** - Complete Sprint 1 infrastructure prerequisites
3. **Sergei** - Build RLS test framework using 007 test files as reference
4. **Dylan (TPM)** - Gate Migration 007 application until all prerequisites complete

---

**CRITICAL**: Do NOT apply Migration 007 until:
- ✅ Session context middleware deployed (WS1)
- ✅ Active org tracking deployed (WS2 + Migration 008)
- ✅ Service role created (WS3)
- ✅ RLS tests passing (WS4)
