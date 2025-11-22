# TICKET WS1: Database Context Middleware

**Status**: 🟡 In Progress
**Assigned To**: Jordan Kim (Full-Stack TypeScript Developer)
**Priority**: High
**Sprint**: Database Context Foundation
**Created**: 2025-11-22

## Objective

Create database context middleware that sets PostgreSQL session variables (`app.current_user_id`, `app.current_org_id`) for RLS policy enforcement while integrating seamlessly with existing Redis-cached session validation.

## Context

**What Exists:**
- ✅ Session validation with Redis caching (`lib/api/auth/session-cache.ts`)
- ✅ `validateSessionWithCache()` returns `SessionWithUser` (3-5ms cached)
- ✅ API routes using `authenticateAndVerifyProjectAccess()` helper
- ✅ PostgreSQL RLS policies expecting session variables (currently not set)

**The Gap:**
- ❌ No `activeOrgId` in session data (users can be in multiple orgs)
- ❌ PostgreSQL session variables never set before queries
- ❌ No middleware wrapper for context propagation

## Requirements

### 1. Create Middleware (`lib/api/middleware/database-context.ts`)

```typescript
// Extend existing request type
export interface AuthenticatedRequest extends NextApiRequest {
  user: SessionWithUser & {
    activeOrgId?: string  // WS2 will add this to session storage
  }
}

export async function withDatabaseContext<T>(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  handler: () => Promise<T>
): Promise<T>
```

**Responsibilities:**
1. Extract `userId` from `req.user` (already authenticated)
2. Determine `activeOrgId` (temporary: infer from project ref; WS2 will improve)
3. Set PostgreSQL session variables using `set_config()`
4. Execute handler within context
5. Handle errors gracefully

### 2. Temporary Organization Context Resolution

Until WS2 adds proper `activeOrgId` to session:

```typescript
async function inferActiveOrgFromRequest(req: AuthenticatedRequest): Promise<string | null> {
  const { ref } = req.query

  if (ref) {
    // Get org from project ref
    const { data } = await queryPlatformDatabase({
      query: 'SELECT organization_id FROM platform.projects WHERE ref = $1',
      parameters: [ref]
    })
    return data?.[0]?.organization_id || null
  }

  return null
}
```

### 3. PostgreSQL Session Variable Setting

Use transaction-scoped session variables:

```sql
SELECT
  set_config('app.current_user_id', $1, true),
  set_config('app.current_org_id', $2, true)
```

**Important**: The `true` flag makes these transaction-scoped (auto-reset after transaction)

### 4. Integration Example

Update existing API routes to wrap handlers:

```typescript
// pages/api/platform/projects/[ref]/index.ts
import { validateSessionWithCache } from '@/lib/api/auth/session-cache'  // EXISTING
import { withDatabaseContext } from '@/lib/api/middleware/database-context'  // NEW

export default async function handler(req, res) {
  // Use EXISTING cached validation
  const user = await validateSessionWithCache(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  req.user = user

  // NEW: Wrap with database context
  return withDatabaseContext(req, res, async () => {
    // Now RLS policies have context!
    const projects = await queryPlatformDatabase({
      query: 'SELECT * FROM platform.projects WHERE ref = $1',
      parameters: [req.query.ref]
    })
    return res.json(projects)
  })
}
```

## Files to Create

- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/middleware/database-context.ts` (new)

## Files to Modify

Integrate with 5 API routes:
1. `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/platform/projects/[ref]/index.ts`
2. `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/platform/projects/[ref]/databases.ts`
3. `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/platform/projects/[ref]/billing/addons.ts`
4. `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/auth/validate.ts`
5. One organization API route (your choice based on relevance)

## Success Criteria

- [ ] Middleware created with proper TypeScript types
- [ ] PostgreSQL session variables set before queries
- [ ] Works with existing Redis session cache (no changes needed)
- [ ] 5 API routes integrated with middleware
- [ ] Total overhead < 10ms per request
- [ ] Error handling for missing context
- [ ] Code documented with clear examples

## Performance Target

- Session validation: 3-5ms (existing Redis cache)
- Context setup: +2ms (setting session variables)
- **Total: < 10ms per request**

## Coordination Notes

**With Marcus (WS2)**: Will add `activeOrgId` to session storage - replace `inferActiveOrgFromRequest` once ready

**With Asha (WS4)**: RLS policies already expect these session variables - just needs them to be set

**With Existing Redis**: Your middleware works with the cached session system - no changes needed to session-cache.ts

## Reference Files

- Session: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/session.ts`
- Cache: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/session-cache.ts`
- Types: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/types.ts`
- Database: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/platform/database.ts`
- Example API: `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/platform/projects/[ref]/index.ts`

## Testing Approach

1. Verify middleware sets session variables correctly
2. Test with existing Redis session caching
3. Confirm RLS policies receive context
4. Measure performance overhead
5. Test error cases (missing user, missing org)

## Implementation Notes

**EXTEND, DON'T REBUILD:**
- Use existing `validateSessionWithCache()` - don't modify it
- Work with existing `queryPlatformDatabase()` helper
- Integrate with existing `authenticateAndVerifyProjectAccess()` pattern
- No changes to Redis caching layer needed

**Philosophy:**
- Make it a thin wrapper - complexity lives elsewhere
- Type safety throughout
- Graceful degradation on errors
- Clear separation between temporary and permanent solutions

## Blockers

None - all dependencies exist and are operational

## Estimated Effort

4-6 hours (middleware creation + 5 route integrations)

---

**Dylan's Note**: Jordan, this is right in your wheelhouse - middleware patterns with type safety across the stack. The existing infrastructure is solid (Redis caching working great), we just need to add the database context layer. Keep it clean and extensible for when WS2 improves the session system.
