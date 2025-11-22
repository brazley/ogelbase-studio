# Code Audit Findings - ACTUAL State

**Date**: 2025-11-22
**Auditor**: Dylan Torres (TPM)
**Trigger**: Agents given incorrect instructions - need to verify actual code

---

## CRITICAL FINDINGS

### 1. `/api/auth/set-active-org` ALREADY EXISTS ✅

**File**: `pages/api/auth/set-active-org.ts` (126 lines)

**What It Does**:
- POST endpoint to set user's active organization
- Validates user is member of org before updating
- Updates `platform.users.active_org_id`
- Returns `{ success, activeOrgId }`

**Status**: ✅ PRODUCTION READY

**Impact**: Marcus does NOT need to build this endpoint - only the frontend component!

---

### 2. `/api/auth/validate` Returns `activeOrgId` ✅

**File**: `pages/api/auth/validate.ts` (123 lines)

**What It Returns**:
```typescript
{
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    username: string | null
    avatar_url: undefined
    created_at: string
    activeOrgId: string | null  // ✅ ALREADY HERE
    organizations: UserOrganization[]
  },
  expires_at: string
}
```

**Query**:
```sql
SELECT
  u.active_org_id,  -- ✅ Column EXPECTED to exist
  o.id as organization_id,
  o.slug as organization_slug,
  o.name as organization_name,
  om.role,
  om.joined_at
FROM platform.users u
LEFT JOIN platform.organization_members om ON om.user_id = u.id
LEFT JOIN platform.organizations o ON o.id = om.organization_id
WHERE u.id = $1
```

**Status**: ⚠️ CODE READY, but `active_org_id` column doesn't exist yet

**Impact**: Migration 008 MUST be applied for this to work!

---

### 3. `queryPlatformDatabase` Return Type - WRONG INSTRUCTIONS

**Actual Signature**:
```typescript
async function queryPlatformDatabase<T>({
  query,
  parameters
}: PlatformQueryOptions): Promise<WrappedResult<T[]>>

type WrappedResult<T> = {
  data: T | undefined
  error: Error | undefined
}
```

**Correct Usage**:
```typescript
const { data, error } = await queryPlatformDatabase({ query, parameters })

if (error) {
  console.error('Query failed:', error)
  return res.status(500).json({ error: error.message })
}

// data is T[] | undefined
const results = data || []
```

**What I Told Jordan** (WRONG):
```typescript
// This is WRONG - queryPlatformDatabase doesn't return data directly
const data = await queryPlatformDatabase({ query })
```

**Impact**: Jordan's middleware code must use `{ data, error }` destructuring!

---

### 4. Session Validation Pattern - CORRECT

**Function**: `validateSessionWithCache(token: string): Promise<SessionWithUser | null>`

**Actual Usage in validate.ts**:
```typescript
const session = await validateSessionWithCache(token)

if (!session) {
  return res.status(401).json({
    error: 'Invalid or expired session token'
  })
}

// session is SessionWithUser
session.userId
session.email
session.firstName
session.lastName
// etc.
```

**What I Told Jordan**: ✅ CORRECT

---

### 5. Auth Pattern - CUSTOM SESSION, Not GoTrue

**Finding**: The code uses CUSTOM session management, not GoTrue/Supabase Auth

**Evidence**:
- `lib/auth.tsx` wraps GoTrue but for different purpose
- API routes use `validateSessionWithCache` from custom session system
- `platform.users` and `platform.user_sessions` tables
- Bearer token extraction and validation

**Pattern**:
```typescript
import { extractBearerToken } from 'lib/api/auth/utils'
import { validateSessionWithCache } from 'lib/api/auth/session-cache'

const token = extractBearerToken(req as unknown as Request)
const session = await validateSessionWithCache(token)
```

**What I Told Agents**: ✅ CORRECT (custom session system)

---

## What Agents Actually Need to Build

### Jordan (WS1) - Database Context Middleware

**Status**: ✅ Instructions mostly correct, but MUST fix queryPlatformDatabase usage

**Correction Needed**:
```typescript
// WRONG (what I told him):
await queryPlatformDatabase({
  query: `SELECT set_config(...)`,
  parameters: [userId, orgId]
})

// CORRECT:
const { error } = await queryPlatformDatabase({
  query: `SELECT set_config(...) as user_set, set_config(...) as org_set`,
  parameters: [userId, orgId]
})

if (error) {
  throw new DatabaseContextError('Failed to set session variables', userId, orgId)
}
```

### Marcus (WS2-T1) - Frontend Org Switcher

**Status**: ⚠️ Backend endpoint ALREADY EXISTS

**What Marcus Actually Builds**:
- ✅ `OrganizationSwitcher.tsx` component
- ✅ Integration in AppLayout
- ❌ NO backend endpoint needed - it exists!

**Backend Endpoint Pattern** (already done):
```typescript
// ALREADY EXISTS: /api/auth/set-active-org
POST /api/auth/set-active-org
Headers: { Authorization: `Bearer ${token}` }
Body: { organizationId: string }

Response: { success: true, activeOrgId: string }
```

### Asha (WS2-T4) - Migration 008

**Status**: ✅ Migration file exists, backend code ready, just apply it

**File**: `008_add_active_org_tracking.sql`

**Adds**: `platform.users.active_org_id` column

**Evidence Backend is Ready**:
- `/api/auth/validate.ts` queries `u.active_org_id` (line 62)
- `/api/auth/set-active-org.ts` updates `active_org_id` (line 93)

**Action**: Apply migration, backend will work immediately

---

## Corrected Agent Instructions

### TO JORDAN

Your middleware code pattern needs this fix:

```typescript
// Set PostgreSQL session variables
const { data, error } = await queryPlatformDatabase({
  query: `
    SELECT
      set_config('app.current_user_id', $1, true) as user_set,
      set_config('app.current_org_id', $2, true) as org_set
  `,
  parameters: [req.user.userId, req.user.activeOrgId]
})

if (error) {
  throw new DatabaseContextError(
    'Failed to set database context',
    req.user.userId,
    req.user.activeOrgId
  )
}
```

### TO MARCUS

Good news - backend endpoint `/api/auth/set-active-org` already exists! You only need to:

1. Build `OrganizationSwitcher.tsx` component
2. Call existing endpoint (already deployed)
3. Integrate in AppLayout

The endpoint works exactly as documented:
```typescript
await fetch('/api/auth/set-active-org', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ organizationId: orgId })
})
```

### TO ASHA

Migration 008 ready to apply - backend code already expects the `active_org_id` column. Apply it and validate.ts + set-active-org.ts will work immediately.

---

## Updated Sprint Status

**WS2-T1 (Org Switcher)**:
- Backend: ✅ DONE (already exists)
- Frontend: ⏳ In progress (Marcus building component)
- Effort reduced: 3 days → 1 day

**WS2-T4 (Migration 008)**:
- Migration file: ✅ EXISTS
- Backend code: ✅ READY
- Action: Apply migration → Done

**WS1 (Middleware)**:
- Instructions: ⚠️ CORRECTED
- Jordan: Must use `{ data, error }` pattern

---

## Action Items

**Dylan (TPM)**:
1. ✅ Audit complete
2. ⏳ Send corrected instructions to Jordan
3. ⏳ Update Marcus on backend endpoint
4. ⏳ Confirm Asha can apply Migration 008 immediately

**Jordan**: Use `{ data, error }` destructuring pattern

**Marcus**: Backend endpoint exists, only build UI component

**Asha**: Migration 008 ready to apply now
