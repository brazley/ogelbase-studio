# RLS Migration - Quick Reference Card

**📋 Use this for quick lookups during deployment**

---

## Files at a Glance

| File | Purpose | When to Use |
|------|---------|-------------|
| `006_enable_rls_IMPROVED.sql` | Enable RLS (safe mode) | Phase 1 - Run in production |
| `006_rollback.sql` | Undo Migration 006 | Emergency only |
| `007_session_helpers.sql` | Session variable functions | Before Migration 007 |
| `007_restrictive_rls_policies.sql` | Enable org isolation | Phase 2 - After app code ready |
| `007_rollback.sql` | Undo Migration 007 | Emergency only |
| `test_006_permissive_policies.sql` | Verify Migration 006 | After Phase 1 deployment |
| `test_007_restrictive_policies.sql` | Verify Migration 007 | After Phase 2 deployment |

---

## Phase 1: Deploy RLS (Safe Mode)

**Run in this order:**

```bash
# 1. Backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Deploy Migration 006
psql $DATABASE_URL -f 006_enable_rls_IMPROVED.sql

# 3. Test
psql $DATABASE_URL -f test_006_permissive_policies.sql

# 4. Verify
psql $DATABASE_URL -c "SELECT * FROM platform.verify_rls_enabled();"
```

**Expected Results:**
- ✅ All 24 tables have RLS enabled
- ✅ All tests PASS
- ✅ No permission errors
- ✅ Performance < 5% degradation

**If problems:** Run `006_rollback.sql`

---

## Phase 2: Deploy Restrictive Policies

**⚠️ ONLY after application code sets session variables!**

**Run in this order:**

```bash
# 1. Backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Deploy session helpers
psql $DATABASE_URL -f 007_session_helpers.sql

# 3. Test session helpers
psql $DATABASE_URL -c "SELECT * FROM platform.test_session_helpers();"

# 4. Deploy restrictive policies
psql $DATABASE_URL -f 007_restrictive_rls_policies.sql

# 5. Test IMMEDIATELY
psql $DATABASE_URL -f test_007_restrictive_policies.sql
```

**Expected Results:**
- ✅ Session helpers working
- ✅ All tests PASS
- ✅ Users see only their org data
- ✅ Critical flows working

**If problems:** Run `007_rollback.sql` IMMEDIATELY

---

## Application Code Required (Phase 2)

**TypeScript/Node.js Example:**

```typescript
import { db } from './database';

// Middleware - set context for every request
async function setDatabaseContext(req, res, next) {
  const userId = req.user?.id;  // from your auth system
  const orgId = req.user?.currentOrganization?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Set session variables
  await db.query(
    `SELECT platform.set_user_context($1::uuid, $2::uuid)`,
    [userId, orgId]
  );

  next();

  // Clear after request
  await db.query(`SELECT platform.clear_user_context()`);
}

// System operations (admin, migrations, background jobs)
async function runAsSystem(operation) {
  await db.query(`SELECT platform.set_system_user()`);
  try {
    return await operation();
  } finally {
    await db.query(`SELECT platform.clear_user_context()`);
  }
}
```

---

## Emergency Rollback

### Rollback Phase 2 (Back to Permissive)

```bash
psql $DATABASE_URL -f 007_rollback.sql
```

**Effect:** Org isolation removed, back to "allow all" mode (still safe)

### Rollback Phase 1 (Disable RLS Completely)

```bash
psql $DATABASE_URL -f 006_rollback.sql
```

**Effect:** RLS completely disabled (back to original state)

---

## Verification Queries

**Check RLS status:**
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'platform'
ORDER BY tablename;
```

**Check policies:**
```sql
SELECT tablename, policyname, permissive
FROM pg_policies
WHERE schemaname = 'platform'
ORDER BY tablename, policyname;
```

**Test session variables:**
```sql
-- Set context
SELECT platform.set_user_context(
  '123e4567-e89b-12d3-a456-426614174000'::uuid,
  '987fcdeb-51a2-43c8-b9e5-123456789abc'::uuid
);

-- Check context
SELECT platform.get_session_context();

-- Clear context
SELECT platform.clear_user_context();
```

---

## Common Issues & Fixes

### Issue: "permission denied for table X"

**Cause:** Migration 007 applied but app not setting session variables

**Fix:**
```sql
-- Check if session vars are set
SELECT platform.get_current_user_id();

-- Should NOT be NULL when querying

-- Emergency: Rollback to permissive
\i 007_rollback.sql
```

### Issue: Slow queries after Migration 007

**Cause:** Missing indexes

**Check:**
```sql
-- Find tables without org_id index
SELECT t.tablename
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_name = c.table_name
  AND t.table_schema = c.table_schema
WHERE t.table_schema = 'platform'
AND c.column_name = 'organization_id'
AND NOT EXISTS (
  SELECT 1 FROM pg_indexes i
  WHERE i.tablename = t.table_name
  AND i.schemaname = t.table_schema
  AND i.indexdef LIKE '%organization_id%'
);
```

**Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_<table>_org_id
ON platform.<table>(organization_id);
```

### Issue: System operations failing

**Cause:** Admin operations need system user context

**Fix:**
```typescript
await runAsSystem(async () => {
  // Your admin operation here
  await db.query(`INSERT INTO platform.organizations ...`);
});
```

Or in SQL:
```sql
SELECT platform.set_system_user();
-- Your queries
SELECT platform.clear_user_context();
```

---

## Performance Monitoring

**Check query performance:**
```sql
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%platform.%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Monitor RLS overhead:**
```sql
-- Before and after comparison
EXPLAIN ANALYZE
SELECT * FROM platform.organizations WHERE id = $1;
```

**Expected overhead:**
- Phase 1: 2-3%
- Phase 2: 5-10%

---

## Checklist

### Before Phase 1
- [ ] Database backup created
- [ ] Reviewed implementation guide
- [ ] Maintenance window scheduled
- [ ] On-call team briefed

### After Phase 1
- [ ] Migration 006 deployed
- [ ] All tests passed
- [ ] No permission errors (48 hours)
- [ ] Performance acceptable

### Before Phase 2
- [ ] Application code updated
- [ ] Session variables implemented
- [ ] System user context implemented
- [ ] Staging tests passed
- [ ] Load testing complete

### After Phase 2
- [ ] Session helpers deployed
- [ ] Migration 007 deployed
- [ ] All tests passed
- [ ] Critical flows tested
- [ ] No permission errors (48 hours)
- [ ] Performance acceptable

---

## Support Resources

| Document | Purpose |
|----------|---------|
| `RLS_IMPLEMENTATION_GUIDE.md` | Complete deployment procedures |
| `RLS_MIGRATION_ANALYSIS.md` | Technical deep-dive |
| `RLS_DELIVERY_SUMMARY.md` | What was delivered |

---

## Success Metrics

**Phase 1 Success:**
- RLS enabled on all tables
- Zero permission errors
- Performance degradation < 5%

**Phase 2 Success:**
- Org isolation enforced
- Users see only their data
- Performance degradation < 10%
- All critical flows working

---

**Keep this card handy during deployment!**

Last Updated: 2025-11-21
