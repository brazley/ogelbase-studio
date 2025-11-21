# Migration 003 Requirements - Quick Reference

**Status**: ❌ MISSING - Blocking Migration 004
**Priority**: 🔴 CRITICAL
**Estimated Time**: 2-3 hours to implement and test

---

## Why Migration 003 is Critical

1. **Migration 004 FAILS** without `platform.organization_members` table
2. **3 API endpoints broken** - returning mock data only
3. **Security gaps** - no user management or access control
4. **Foreign keys broken** - user_id references non-existent tables

---

## Required Tables (Minimum Viable)

### 1. platform.users
```sql
-- Foundation for all user_id foreign keys
-- Currently profile returns: {id: 1, email: 'admin@ogelbase.com'}
```
**Why**: All user_id columns reference this

### 2. platform.organization_members ⚠️ **BLOCKS 004**
```sql
-- organization_id, user_id, role
```
**Why**: Referenced in migration 004, lines 40-47, 60
**Impact**: Migration 004 cannot INSERT without this table

### 3. platform.project_members
```sql
-- project_id, user_id, role
```
**Why**: Project-level access control

### 4. platform.billing_plans
```sql
-- id, name, price, interval, features
```
**Why**: subscriptions.plan_id references this (currently not enforced)

### 5. platform.project_addons
```sql
-- project_id, addon_id, quantity, status
```
**Why**: API at `/api/platform/projects/[ref]/billing/addons` queries this
**Current Issue**: Queries fail, returns mock data

### 6. platform.project_metrics
```sql
-- project_id, timestamp, cpu_usage, memory_usage, disk_io_budget
```
**Why**: API at `/api/platform/projects/[ref]/infra-monitoring` queries this
**Current Issue**: Queries fail, returns mock data

---

## Optional but Recommended

7. **platform.user_sessions** - Session management
8. **platform.organization_invitations** - Invite workflow
9. **platform.api_keys** - Programmatic access
10. **platform.audit_logs** - Compliance/security
11. **platform.feature_flags** - Feature management

---

## Migration 003 Structure

```sql
-- ============================================
-- Migration 003: Critical Missing Tables
-- ============================================
-- Purpose: Add user management, membership, and metrics tables
-- Blocks: Migration 004 cannot run without this
-- Fixes: 3 broken API endpoints
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users (foundation)
CREATE TABLE platform.users (...);

-- 2. Organization Members (CRITICAL - blocks migration 004)
CREATE TABLE platform.organization_members (...);

-- 3. Project Members
CREATE TABLE platform.project_members (...);

-- 4. Billing Plans (enforces foreign keys)
CREATE TABLE platform.billing_plans (...);

-- 5. Fix Addons confusion
ALTER TABLE platform.addons RENAME TO addon_catalog;
CREATE TABLE platform.project_addons (...);

-- 6. Project Metrics (infrastructure monitoring)
CREATE TABLE platform.project_metrics (...);

-- 7. User Sessions
CREATE TABLE platform.user_sessions (...);

-- 8. Organization Invitations
CREATE TABLE platform.organization_invitations (...);

-- 9. API Keys
CREATE TABLE platform.api_keys (...);

-- 10. Audit Logs
CREATE TABLE platform.audit_logs (...);

-- 11. Feature Flags
CREATE TABLE platform.feature_flags (...);
CREATE TABLE platform.organization_feature_flags (...);

-- Triggers and functions
CREATE TRIGGER update_users_updated_at ...;
CREATE TRIGGER update_organization_members_updated_at ...;
-- etc.
```

---

## Testing After Migration 003

```bash
# 1. Verify table exists
psql $DATABASE_URL -c "\dt platform.organization_members"

# 2. Try migration 004 again
psql $DATABASE_URL -f apps/studio/database/migrations/004_create_lancio_org.sql

# Should now succeed with output:
# INSERT 0 1  (organization created)
# INSERT 0 1  (project created)
# INSERT 0 1  (member created) ← This was failing before

# 3. Test broken API endpoints
curl http://localhost:3000/api/platform/organizations/lancio/usage
# Should return real data instead of defaults

curl http://localhost:3000/api/platform/projects/default/billing/addons
# Should query database instead of returning mock

curl http://localhost:3000/api/platform/projects/default/infra-monitoring
# Should query database instead of generating random data
```

---

## Quick Win: Minimal Migration 003

If time is constrained, create Migration 003 with **only these 3 tables**:

1. ✅ **platform.organization_members** - Unblocks migration 004
2. ✅ **platform.project_addons** - Fixes add-ons API
3. ✅ **platform.project_metrics** - Fixes monitoring API

Then add users/sessions/billing_plans in a follow-up migration.

However, this leaves foreign key constraints unfulfilled (user_id columns reference nothing).

**Recommendation**: Do the full migration with all 11 tables - it's only ~3 hours of work for a complete foundation.

---

## Impact if Not Fixed

**Without Migration 003**:
- ❌ Cannot create Lancio organization (migration 004 fails)
- ❌ Organization usage endpoint returns zeros
- ❌ Add-ons management broken
- ❌ Infrastructure monitoring fake data only
- ❌ No user management possible
- ❌ No access control possible
- ❌ Cannot enforce billing plan limits
- ❌ Security vulnerability (no audit trail)

**With Migration 003**:
- ✅ Migration 004 succeeds
- ✅ All API endpoints work correctly
- ✅ Real data instead of mocks
- ✅ User management foundation
- ✅ Access control framework
- ✅ Audit trail for compliance
- ✅ Production-ready multi-tenant platform

---

## Files to Review

1. `/apps/studio/database/migrations/004_create_lancio_org.sql` - See what it expects
2. `/apps/studio/pages/api/platform/organizations/[slug]/usage.ts` - Queries organization_members
3. `/apps/studio/pages/api/platform/projects/[ref]/billing/addons.ts` - Queries project_addons
4. `/apps/studio/pages/api/platform/projects/[ref]/infra-monitoring.ts` - Queries project_metrics
5. `/apps/studio/pages/api/platform/PLATFORM_ENDPOINTS_COMPLETE.md` - Schema documentation

---

## Next Action

**Create** `/apps/studio/database/migrations/003_critical_tables.sql` with the 11 tables listed above.

See `DATABASE_SCHEMA_ANALYSIS.md` for complete table schemas with all columns, indexes, and constraints.
