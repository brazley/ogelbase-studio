# Authentication Fix Implementation

**Status:** ✅ Working as designed - No Stripe blocking issue found

**Finding:** The login flow works correctly. Billing queries are intentionally conditional on permissions. This is not a bug - it's by design.

---

## TL;DR

**You said:** "User can't log in because Stripe API is blocking the flow"

**Reality:**
- ✅ Login works fine
- ✅ No Stripe calls during login
- ⚠️  Billing features require permissions (expected behavior)

**The "blocker" is the permissions system, not Stripe, and it's working correctly.**

---

## What Actually Happens During Login

### Sign In Flow (No Stripe Involved)

```
1. User enters email/password
2. GoTrue authenticates user
3. Session stored in localStorage
4. User redirected to /organizations
5. Profile + Organizations load from database
6. Dashboard displays ✅
```

**Stripe is never called during this flow.**

### What Happens to Billing Queries

```
1. Login completes successfully
2. Permissions API queried in parallel
3. While permissions loading:
   - useOrgSubscriptionQuery() → disabled (waiting for permissions)
   - useOrgPlansQuery() → disabled (waiting for permissions)
4. Once permissions loaded:
   - If user has BILLING_READ permission → queries run
   - If user lacks permission → queries stay disabled (correct behavior)
```

**This is intentional!** Users without billing permissions shouldn't see billing data.

---

## Current Configuration Analysis

### Self-Hosted Mode (IS_PLATFORM=false)

**Current Setup:**
```bash
NEXT_PUBLIC_IS_PLATFORM=false
```

**Behavior:**
- ✅ Login works
- ✅ Permissions always return `true`
- ✅ Billing queries run immediately
- ✅ No issues

**Recommendation:** Keep this for local development.

### Platform Mode (IS_PLATFORM=true)

**Current Setup:**
```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true  # Optional
```

**Behavior:**
- ✅ Login works (real or mock)
- ⚠️  Permissions must be fetched from API
- ⚠️  Billing queries wait for permissions
- ⚠️  If permissions API fails → billing pages won't load

**This is expected behavior.** If you don't have a permissions API, use self-hosted mode.

---

## "Fix" Options (If You Want Different Behavior)

### Option 1: Mock Permissions for Development

**Why:** Test platform mode without real permissions API

**Implementation:**

**File:** `apps/studio/hooks/misc/useCheckPermissions.ts`

```typescript
export function useAsyncCheckPermissions(action, resource, data?, overrides?) {
  const isLoggedIn = useIsLoggedIn()

  const can = useMemo(() => {
    if (!IS_PLATFORM) return true

    // ADD THIS:
    if (process.env.NEXT_PUBLIC_MOCK_PERMISSIONS === 'true') {
      console.log(`[Mock Permissions] Allowing ${action} on ${resource}`)
      return true
    }

    if (!isLoggedIn) return false
    // ... rest of existing code
  }, [...])

  return { isLoading, isSuccess, can }
}
```

**Environment:**
```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_MOCK_PERMISSIONS=true
```

**Result:** All permissions return `true`, billing queries run immediately.

---

### Option 2: Make Billing Queries Optional (UI Enhancement)

**Why:** Show placeholder UI when permissions loading/failed

**Implementation:**

**File:** `apps/studio/components/interfaces/Organization/BillingSettings/BillingSettings.tsx`

```typescript
const { data: subscription, isLoading, isError } = useOrgSubscriptionQuery({
  orgSlug: org?.slug
})

// ADD THIS:
if (isLoading) {
  return <div>Loading billing information...</div>
}

if (isError) {
  return (
    <div>
      Billing information unavailable.
      This may be due to insufficient permissions.
    </div>
  )
}

// Rest of component
```

**Result:** Better UX when permissions block billing data.

---

### Option 3: Bypass Permission Checks for Billing (Not Recommended)

**Why:** Allow billing queries without permission checks

**Implementation:**

**File:** `apps/studio/data/subscriptions/org-subscription-query.ts`

```typescript
export const useOrgSubscriptionQuery = ({ orgSlug }) => {
  const { can: canReadSubscriptions } = useAsyncCheckPermissions(
    PermissionAction.BILLING_READ,
    'stripe.subscriptions'
  )

  return useQuery({
    queryKey: subscriptionKeys.orgSubscription(orgSlug),
    queryFn: ({ signal }) => getOrgSubscription({ orgSlug }, signal),
    // CHANGE THIS:
    // enabled: enabled && canReadSubscriptions && typeof orgSlug !== 'undefined',
    enabled: enabled && typeof orgSlug !== 'undefined', // Ignore permissions
    staleTime: 60 * 60 * 1000,
  })
}
```

**⚠️ Warning:** This bypasses security checks. Only do this in development.

---

### Option 4: Default Permissions API Response

**Why:** Provide mock permissions from API when real system unavailable

**Implementation:**

**File:** `apps/studio/pages/api/platform/permissions/index.ts` (create this)

```typescript
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Return default permissions allowing everything
  const defaultPermissions = [
    {
      id: 1,
      organization_slug: 'org-1',
      actions: ['%'], // Wildcard - allow all actions
      resources: ['%'], // Wildcard - allow all resources
      restrictive: false,
      condition: null,
      project_refs: [],
    },
  ]

  return res.status(200).json(defaultPermissions)
}
```

**Result:** Permissions API always succeeds, returns permissive defaults.

---

## Recommended Setup by Environment

### Local Development

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=false
NEXT_PUBLIC_GOTRUE_URL=http://localhost:54321/auth/v1
DATABASE_URL=postgresql://localhost:5432/platform_db
```

**Why:** Simplest setup, no permission complexity.

### Testing Platform Mode

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_MOCK_PERMISSIONS=true
NEXT_PUBLIC_GOTRUE_URL=http://localhost:54321/auth/v1
DATABASE_URL=postgresql://localhost:5432/platform_db
```

**Why:** Test platform behavior without real permissions API.

### Staging/Production

```bash
# .env
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_GOTRUE_URL=https://your-gotrue-instance/auth/v1
DATABASE_URL=postgresql://production-db:5432/platform_db
# Permissions API must be available at /api/platform/permissions
```

**Why:** Full platform features with real permissions.

---

## Testing the Fix

### Test 1: Verify Login Works

```bash
1. Start local dev server: pnpm dev
2. Navigate to: http://localhost:8082/sign-in
3. Sign in with test credentials
4. Verify redirect to /organizations
5. Check dashboard loads
```

**Expected:** ✅ Login succeeds, dashboard accessible

### Test 2: Check Billing Permissions

```bash
1. After login, open browser console
2. Navigate to: /org/[slug]/billing
3. Check network tab for these requests:
   - GET /api/platform/permissions
   - GET /api/platform/organizations/[slug]/billing/subscription
4. Check console for permission logs
```

**Expected:**
- If `IS_PLATFORM=false`: Billing loads immediately
- If `IS_PLATFORM=true`: Billing waits for permissions

### Test 3: Verify No Stripe Calls During Login

```bash
1. Open browser DevTools → Network tab
2. Filter by "stripe.com"
3. Clear network log
4. Sign in
5. Wait for dashboard to load
6. Check network log
```

**Expected:** ✅ Zero requests to stripe.com during login flow

---

## Common Issues & Solutions

### Issue 1: "Billing page stuck loading"

**Cause:** Permissions API not responding or returning empty

**Solution:**
```bash
# Option A: Use self-hosted mode
NEXT_PUBLIC_IS_PLATFORM=false

# Option B: Enable mock permissions
NEXT_PUBLIC_MOCK_PERMISSIONS=true

# Option C: Create mock permissions API (see Option 4 above)
```

### Issue 2: "Can't see billing settings"

**Cause:** User lacks `BILLING_READ` permission

**Solution:** This is correct behavior! Either:
1. Grant permission in your permissions system
2. Use self-hosted mode (all permissions allowed)
3. Enable mock permissions for testing

### Issue 3: "Login works but organizations page blank"

**Cause:** No organizations in database

**Solution:**
```sql
-- Add test organization
INSERT INTO platform.organizations (id, name, slug, billing_email)
VALUES (1, 'Test Org', 'org-1', 'billing@test.com');
```

### Issue 4: "GoTrue URL not configured"

**Cause:** Missing `NEXT_PUBLIC_GOTRUE_URL`

**Solution:**
```bash
# For local Supabase:
NEXT_PUBLIC_GOTRUE_URL=http://localhost:54321/auth/v1

# For hosted Supabase:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# (GoTrue URL auto-derived as ${SUPABASE_URL}/auth/v1)
```

---

## What NOT to Do

### ❌ Don't Add Stripe to Auth Flow

```typescript
// DON'T DO THIS:
const onLogin = async () => {
  await auth.signIn(...)
  await stripe.customers.retrieve(...) // ❌ No!
  router.push('/organizations')
}
```

**Why:** Stripe is for billing pages only, not authentication.

### ❌ Don't Bypass Permissions in Production

```typescript
// DON'T DO THIS:
if (!IS_PLATFORM || true) { // ❌ Defeats permission system
  return true
}
```

**Why:** Security risk - exposes billing data to unauthorized users.

### ❌ Don't Make Permissions Synchronous

```typescript
// DON'T DO THIS:
const permissions = fetchPermissionsSync() // ❌ Blocks rendering
```

**Why:** Permissions must load async to avoid blocking page render.

---

## Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Login Flow | ✅ Working | No Stripe involvement |
| Authentication | ✅ Working | GoTrue handles it |
| Profile Loading | ✅ Working | Database query |
| Organizations | ✅ Working | Database query |
| Dashboard Access | ✅ Working | No blockers |
| Billing Queries | ⚠️ Conditional | Requires permissions |
| Stripe Integration | ℹ️ Billing Pages Only | Not in auth flow |

**Conclusion:** There is no Stripe blocking issue in the authentication flow. The system is working as designed. If you want billing features to work without a permissions system, use self-hosted mode (`IS_PLATFORM=false`).

---

## Quick Command Reference

```bash
# Self-hosted mode (recommended for development)
NEXT_PUBLIC_IS_PLATFORM=false pnpm dev

# Platform mode with mock permissions
NEXT_PUBLIC_IS_PLATFORM=true \
NEXT_PUBLIC_MOCK_PERMISSIONS=true \
pnpm dev

# Platform mode with mock auth
NEXT_PUBLIC_IS_PLATFORM=true \
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true \
pnpm dev

# Check what mode is active
echo $NEXT_PUBLIC_IS_PLATFORM

# Test login flow
curl -X POST http://localhost:8082/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

---

**Need More Help?**

See: `BACKEND_AUTH_FLOW_ANALYSIS.md` for complete technical deep-dive.
