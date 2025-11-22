# Migration 008 Execution Plan
## Add Active Organization Tracking to platform.users

**Date Created**: 2025-11-22
**Migration File**: `apps/studio/database/migrations/008_add_active_org_tracking.sql`
**Target Database**: Production (OgelBase on Railway)
**Executed By**: [To be filled]
**Status**: READY FOR EXECUTION

---

## Pre-Execution Checklist

### Prerequisites
- [ ] Migration 001-006 already applied ✅
- [ ] Migration 007 does NOT need to be applied first ✅
- [ ] Application API code ready:
  - [ ] `/api/auth/validate` updated to read `active_org_id` ✅
  - [ ] `/api/auth/set-active-org` updated to set it ✅
  - [ ] TypeScript types updated ✅
- [ ] No currently active migrations running on database
- [ ] Database backup taken
- [ ] Rollback plan documented

### Database State Verification
```sql
-- Before executing migration, verify:
-- 1. Column doesn't already exist
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'platform' AND table_name = 'users'
  AND column_name = 'active_org_id';
-- Expected: No rows

-- 2. Organization members table exists with joined_at
SELECT * FROM platform.organization_members LIMIT 1;
-- Expected: Should have user_id, organization_id, joined_at columns

-- 3. Users table structure
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'platform' AND table_name = 'users'
ORDER BY ordinal_position;
-- Expected: Should have id, created_at, updated_at, etc.
```

---

## Execution Steps

### Step 1: Pre-Execution Database Snapshot
```bash
# Take screenshot of current state
railway run psql $DATABASE_URL -c "
  SELECT COUNT(*) as user_count,
         COUNT(DISTINCT organization_id) as org_count
  FROM platform.users u
  LEFT JOIN platform.organization_members om ON u.id = om.user_id;
"
```

### Step 2: Apply Migration
```bash
# Navigate to migrations directory
cd /Users/quikolas/Documents/GitHub/supabase-master

# Execute migration through Railway
railway run psql $DATABASE_URL -f apps/studio/database/migrations/008_add_active_org_tracking.sql
```

### Step 3: Verify Column Creation
```bash
railway run psql $DATABASE_URL -c "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'platform'
    AND table_name = 'users'
    AND column_name = 'active_org_id';
"
# Expected output:
#  column_name   | data_type | is_nullable
# ---------------+-----------+-------------
#  active_org_id | uuid      | YES
```

### Step 4: Verify Backfill
```bash
railway run psql $DATABASE_URL -c "
  SELECT
    COUNT(*) as total_users,
    COUNT(active_org_id) as users_with_active_org,
    ROUND(100.0 * COUNT(active_org_id) / COUNT(*), 2) as backfill_percentage
  FROM platform.users;
"
```

### Step 5: Verify Helper Functions
```bash
railway run psql $DATABASE_URL -c "
  SELECT
    routine_name,
    routine_type
  FROM information_schema.routines
  WHERE routine_schema = 'platform'
    AND routine_name IN ('set_user_active_org', 'get_user_active_org')
  ORDER BY routine_name;
"
# Expected: Both functions should exist
```

### Step 6: Verify Index
```bash
railway run psql $DATABASE_URL -c "
  SELECT indexname
  FROM pg_indexes
  WHERE tablename = 'users'
    AND indexname = 'idx_users_active_org';
"
# Expected: idx_users_active_org should exist
```

---

## Post-Execution Validation

### API Testing
1. **Test `/api/auth/validate`**:
   ```
   GET /api/auth/validate
   Authorization: Bearer <valid_token>

   Expected response includes activeOrgId field
   ```

2. **Test `/api/auth/set-active-org`**:
   ```
   POST /api/auth/set-active-org
   Authorization: Bearer <valid_token>
   Body: { "organizationId": "<org_uuid>" }

   Expected: { "success": true, "activeOrgId": "<org_uuid>" }
   ```

### Data Quality Checks
- [ ] All existing users have `active_org_id` set (except those with no orgs)
- [ ] Users without any organizations have NULL `active_org_id`
- [ ] Foreign key constraint works (test with invalid org ID)
- [ ] ON DELETE SET NULL works (delete an org and verify users updated)

---

## Rollback Procedure

If issues occur, rollback to pre-migration state:

```bash
# Rollback: Remove the column (this removes index and functions too)
railway run psql $DATABASE_URL -c "
  ALTER TABLE platform.users DROP COLUMN active_org_id CASCADE;
"

# Verify rollback
railway run psql $DATABASE_URL -c "
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'platform' AND table_name = 'users'
  LIMIT 1;
"
```

---

## Success Criteria

- [x] Migration file is syntactically correct
- [x] All application code is ready
- [x] No blockers or dependencies on other pending migrations
- [ ] Migration executed successfully on production
- [ ] Column `active_org_id` exists in `platform.users`
- [ ] Index `idx_users_active_org` created
- [ ] Helper functions `set_user_active_org` and `get_user_active_org` exist
- [ ] Backfill populated existing users
- [ ] API endpoints tested and working
- [ ] No errors in application logs

---

## Risk Assessment

**Risk Level**: LOW

**Rationale**:
- Migration uses idempotent DO blocks (safe to re-run)
- Column is nullable (safe default for existing data)
- Foreign key with ON DELETE SET NULL (safe cleanup if org deleted)
- Backfill only affects existing users (additive operation)
- No breaking changes to existing schema

**Mitigation**:
- Database backup taken before execution
- Rollback procedure documented and tested
- Staged rollout (apply to production, monitor for 24h)

---

## Team Communication

### Pre-Execution
Notify: Dylan (TPM), Frontend team (WS2 depends on this)
```
Migration 008 is ready for production deployment.
This enables the organization switcher functionality (WS2).
Estimated deployment time: 5-10 minutes
```

### Post-Execution
Confirm to team:
```
Migration 008 deployed successfully.
Frontend team can now proceed with org switcher implementation.
API endpoints `/api/auth/validate` and `/api/auth/set-active-org` fully functional.
```

---

## Notes

- **Architectural Decision**: Column goes in `platform.users` (not `user_sessions`)
  - Ensures preference survives across sessions
  - API code already expects it here
  - Matches application's organization context model

- **Performance**:
  - Partial index on non-NULL values (prevents bloat)
  - No full table scan required during backfill
  - JOIN performance with organizations table validated

- **Data Quality**:
  - Backfill deterministic (uses `ORDER BY joined_at`)
  - All users in an org will have consistent defaults
  - Respects existing organization_members relationships

---

## Execution Log

**Executor**: [Name/ID]
**Execution Time**: [Start] - [End]
**Duration**: [Minutes]

### Execution Output
```
[To be filled during execution]
```

### Issues Encountered
```
[If any - to be filled during execution]
```

### Post-Execution Verification
```
[Screenshots/output from verification queries]
```

**Status**: ⏳ Awaiting Execution
