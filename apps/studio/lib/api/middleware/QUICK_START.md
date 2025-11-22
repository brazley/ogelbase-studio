# Database Context Middleware - Quick Start

**Status**: ✅ Ready for Integration
**Performance**: <10ms overhead
**Migration Dependency**: Migration 008 (adds `active_org_id`)

---

## 30-Second Overview

This middleware sets PostgreSQL session variables (`app.current_user_id`, `app.current_org_id`) before database queries, enabling Row-Level Security (RLS) to enforce multi-tenant isolation at the database layer.

**Why**: Prevents cross-tenant data leaks even if application code has bugs.

---

## Installation (Already Done ✅)

```
apps/studio/lib/api/middleware/
├── database-context.ts           ← Core middleware
├── README.md                      ← Full documentation
├── INTEGRATION_EXAMPLE.md        ← Before/after examples
└── WS1_DELIVERY_REPORT.md        ← Delivery report

apps/studio/tests/middleware/
└── database-context.test.ts      ← 11 test cases
```

---

## Usage in 3 Steps

### Step 1: Import

```typescript
import { validateSessionWithCache } from '@/lib/api/auth/session-cache'
import { withDatabaseContext, RequestWithUser } from '@/lib/api/middleware/database-context'
```

### Step 2: Validate & Attach User Context

```typescript
export default async function handler(req: RequestWithUser, res: NextApiResponse) {
  // Validate session (Redis cached, 3-5ms)
  const user = await validateSessionWithCache(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  // Attach user context
  req.user = {
    userId: user.userId,
    activeOrgId: user.activeOrgId // From Migration 008
  }

  // Step 3...
}
```

### Step 3: Wrap Database Queries

```typescript
  return withDatabaseContext(req, res, async () => {
    // All queries here have RLS context!
    const { data } = await queryPlatformDatabase({
      query: 'SELECT * FROM platform.projects'
      // RLS automatically filters by current_org_id
    })

    return res.json(data)
  })
}
```

---

## What It Does

```sql
-- Sets these PostgreSQL session variables (transaction-scoped)
SET app.current_user_id = '123e4567-e89b-12d3-a456-426614174000';
SET app.current_org_id = '987fcdeb-51a2-43f1-b123-456789abcdef';

-- RLS policies use them
CREATE POLICY select_projects ON platform.projects
FOR SELECT USING (
  organization_id = get_current_org_id()::uuid
);

-- Variables auto-cleared when transaction ends
```

**Result**: Database enforces `WHERE organization_id = current_org_id` automatically!

---

## Integration with Existing Code

### Pattern A: With `authenticateAndVerifyProjectAccess`

```typescript
// Before
const result = await authenticateAndVerifyProjectAccess(req, res)
if (!result) return

const { data } = await queryPlatformDatabase({ ... })
return res.json(data)

// After - Add 3 lines
const result = await authenticateAndVerifyProjectAccess(req, res)
if (!result) return

req.user = { userId: result.user.userId, activeOrgId: result.user.activeOrgId } // +1

return withDatabaseContext(req, res, async () => {                               // +2
  const { data } = await queryPlatformDatabase({ ... })
  return res.json(data)
})                                                                                // +3
```

### Pattern B: Direct Session Validation

```typescript
// Before
const user = await validateSessionWithCache(req)
if (!user) return res.status(401).json({ error: 'Unauthorized' })

const { data } = await queryPlatformDatabase({ ... })
return res.json(data)

// After - Add 3 lines
const user = await validateSessionWithCache(req)
if (!user) return res.status(401).json({ error: 'Unauthorized' })

req.user = { userId: user.userId, activeOrgId: user.activeOrgId }               // +1

return withDatabaseContext(req, res, async () => {                              // +2
  const { data } = await queryPlatformDatabase({ ... })
  return res.json(data)
})                                                                               // +3
```

---

## 5 Routes to Update

1. `/api/platform/projects/[ref]/index.ts` (GET, PATCH, DELETE)
2. `/api/platform/projects/[ref]/databases.ts` (GET)
3. `/api/platform/projects/[ref]/billing/addons.ts` (GET)
4. `/api/platform/organizations/[slug]/index.ts` (GET, PATCH)
5. `/api/platform/organizations/[slug]/projects.ts` (GET)

**Total Effort**: 4-5 hours

---

## Error Handling

```typescript
try {
  return withDatabaseContext(req, res, async () => {
    // ... queries
  })
} catch (error) {
  if (error.code === 'MISSING_USER') {
    // User not authenticated
  } else if (error.code === 'MISSING_ORG') {
    // User hasn't selected an organization
  } else if (error.code === 'SET_CONTEXT_FAILED') {
    // Database error setting session variables
  }
}
```

---

## Testing

```bash
# Run tests
cd apps/studio
pnpm test tests/middleware/database-context.test.ts

# Expected: 11 tests passing
# Performance: <10ms average
```

---

## Dependencies

### Required Before Production Use
- ✅ Migration 008 applied (adds `active_org_id` to users)
- ✅ Session cache returns `activeOrgId` (WS2)
- ✅ Migration 007 ready (restrictive RLS policies)

### Optional for Testing
```sql
-- Temporary test setup if Migration 008 not yet applied
ALTER TABLE platform.users ADD COLUMN active_org_id UUID;
UPDATE platform.users SET active_org_id = (
  SELECT organization_id FROM platform.organization_members
  WHERE user_id = users.id LIMIT 1
);
```

---

## Performance

**Overhead**:
- Session validation (Redis): 3-5ms (existing)
- DB context setup: 2-5ms (new)
- **Total**: ~10ms per request

**Acceptable because**:
- Security benefit outweighs minor latency
- Most routes already have 20-50ms DB query time
- 10ms is <20% overhead

---

## What's Different from Session Cache?

| Feature | Session Cache | Database Context |
|---------|--------------|------------------|
| **What** | Caches user data in Redis | Sets PostgreSQL session variables |
| **When** | During authentication | Before database queries |
| **Why** | Performance (3-5ms vs 20-50ms) | Security (RLS enforcement) |
| **Where** | `session-cache.ts` | `database-context.ts` |
| **Changes Needed** | None! Works as-is | Add `activeOrgId` to cache (WS2) |

They work **together**:
1. Session cache provides fast user lookup (3-5ms)
2. Database context uses cached data to set PG vars (<5ms)
3. RLS policies enforce using PG vars (no overhead)

---

## Common Questions

**Q: Do I need to clear session variables?**
A: No! They're transaction-scoped and auto-cleared.

**Q: What if activeOrgId is null?**
A: Middleware throws `DatabaseContextError` with code `MISSING_ORG`. User must select an org.

**Q: Does this slow down my API?**
A: ~10ms overhead (2-5ms average). Negligible compared to security benefit.

**Q: Can I use this before Migration 008?**
A: For testing only. Production requires Migration 008 (adds `active_org_id`).

**Q: What happens if I forget to wrap queries?**
A: After Migration 007, RLS policies will fail with "current_org_id not set" error.

---

## Full Documentation

- **README.md**: Complete documentation, architecture, FAQ
- **INTEGRATION_EXAMPLE.md**: 4 before/after examples
- **WS1_DELIVERY_REPORT.md**: Technical delivery report

---

**Built by**: Jordan Kim (Full-Stack TypeScript Developer)
**Ready for**: API route integration (Days 3-4)
**Questions**: Ask Dylan Torres (TPM)
