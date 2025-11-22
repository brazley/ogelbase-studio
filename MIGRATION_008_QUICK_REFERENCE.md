# Migration 008: Quick Reference

## Status
✅ **DEPLOYED TO PRODUCTION** - November 22, 2025

## What It Does
Adds active organization tracking to platform.users table, enabling:
- Organization switcher UI functionality
- RLS context for multi-tenant data isolation
- User preference persistence for active organization

## Database Changes
```sql
-- New column
platform.users.active_org_id (UUID, nullable, FK to organizations)

-- New index
idx_users_active_org (partial index on non-null values)

-- New functions
platform.set_user_active_org(user_id, org_id) → boolean
platform.get_user_active_org(user_id) → table(org details)
```

## Usage Examples

### Set Active Organization (API/Backend)
```sql
SELECT platform.set_user_active_org(
  'user-uuid-here'::UUID,
  'org-uuid-here'::UUID
);
```

### Get Active Organization (Middleware)
```sql
SELECT * FROM platform.get_user_active_org('user-uuid-here'::UUID);
```

### Direct Query (Read-only)
```sql
SELECT u.active_org_id, o.name, o.slug
FROM platform.users u
JOIN platform.organizations o ON u.active_org_id = o.id
WHERE u.id = 'user-uuid-here';
```

## Verification
```bash
# Check column exists
railway ssh "cd /tmp && node verify.mjs"

# Expected output:
# ✅ Column active_org_id exists
# ✅ Index idx_users_active_org exists
# ✅ Functions: get_user_active_org, set_user_active_org
```

## Next Steps for Integration
1. **Middleware:** Read `active_org_id` to set RLS context
2. **API Endpoint:** Create `/api/auth/set-active-org` using helper function
3. **UI Component:** Build organization switcher dropdown
4. **Testing:** E2E tests for org switching flow

## Rollback (If Needed)
```bash
# Execute rollback SQL
railway ssh "cd /tmp && node -e \"import('postgres').then(async p => {
  const sql = p.default(process.env.DATABASE_URL);
  await sql.unsafe('DROP FUNCTION platform.get_user_active_org; DROP FUNCTION platform.set_user_active_org; DROP INDEX platform.idx_users_active_org; ALTER TABLE platform.users DROP COLUMN active_org_id');
  await sql.end();
})\""
```

## Full Documentation
- **Technical Report:** `MIGRATION_008_COMPLETION_REPORT.md`
- **Status Report:** `.SoT/status-reports/MIGRATION_008_DEPLOYED.md`
- **Migration SQL:** `apps/studio/database/migrations/008_add_active_org_tracking.sql`

---
**Last Updated:** November 22, 2025
**Schema Version:** 008
**Production Status:** LIVE
