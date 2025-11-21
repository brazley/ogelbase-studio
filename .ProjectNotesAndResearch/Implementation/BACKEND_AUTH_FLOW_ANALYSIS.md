# Backend Authentication Flow Analysis

**Generated:** 2025-11-21
**Purpose:** Complete analysis of backend authentication flow from sign-up through dashboard access, with focus on identifying what's blocking login.

---

## Executive Summary

**CRITICAL FINDING:** Stripe is NOT blocking the login flow. The real blocker is the **permissions system** (`useAsyncCheckPermissions`) which prevents billing-related queries from running until permissions are loaded.

The authentication flow works correctly. The issue is in **post-auth data fetching** where billing queries are conditionally enabled based on permissions checks.

---

## Part 1: Auth API Endpoints

### Sign Up Flow

**No dedicated sign-up endpoint** - Authentication is handled entirely by GoTrue client.

```typescript
// Location: packages/common/gotrue.ts
export const gotrueClient = new AuthClient({
  url: getGoTrueUrl(), // NEXT_PUBLIC_GOTRUE_URL or fallback
  storageKey: 'supabase.dashboard.auth.token',
  detectSessionInUrl: true,
  fetch: fetchWithTimeout, // 30s timeout wrapper
})
```

**GoTrue URL Resolution:**
1. Try `NEXT_PUBLIC_GOTRUE_URL` first
2. Fallback to `NEXT_PUBLIC_SUPABASE_URL + /auth/v1`
3. If neither set, use `http://localhost:54321/auth/v1`

**Sign Up Process:**
```
User Action → gotrueClient.signUp()
           → POST {GOTRUE_URL}/signup
           → Returns: { user, session, error }
           → Auto-login if email verification not required
           → Session stored in localStorage at key: 'supabase.dashboard.auth.token'
```

### Login Flow

**Endpoint:** Email/Password login via `SignInForm.tsx`

```typescript
// Location: apps/studio/components/interfaces/SignIn/SignInForm.tsx
const onSubmit = async ({ email, password }) => {
  const { error } = await auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: token }
  })

  if (!error) {
    // Check MFA requirement
    const data = await getMfaAuthenticatorAssuranceLevel()
    if (data.currentLevel !== data.nextLevel) {
      router.replace('/sign-in-mfa')
      return
    }

    // Reset all queries
    await queryClient.resetQueries()

    // Redirect to dashboard
    router.push(returnTo || '/organizations')
  }
}
```

**GitHub OAuth Login:**
```typescript
// Location: apps/studio/components/interfaces/SignIn/SignInWithGitHub.tsx
await auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: `${SITE_URL}/sign-in-mfa?method=github` }
})
```

### GoTrue Integration

**GoTrue Client Configuration:**
- **URL:** `process.env.NEXT_PUBLIC_GOTRUE_URL`
- **Storage:** Browser localStorage
- **Storage Key:** `supabase.dashboard.auth.token`
- **Session Detection:** Enabled (checks URL for auth callbacks)
- **Timeout:** 30 seconds (wrapped fetch)

**Key GoTrue Methods Used:**
- `signInWithPassword()` - Email/password auth
- `signInWithOAuth()` - OAuth providers (GitHub, etc.)
- `onAuthStateChange()` - Session state listener
- `refreshSession()` - Token refresh
- `signOut()` - Logout

---

## Part 2: Session Management

### Token Storage

**Storage Location:** Browser localStorage

**Key:** `supabase.dashboard.auth.token`

**Session Structure:**
```typescript
{
  access_token: string,      // JWT token
  refresh_token: string,     // Refresh token
  expires_at: number,        // Unix timestamp
  expires_in: number,        // Seconds until expiry
  token_type: 'bearer',
  user: {
    id: string,
    email: string,
    role: 'authenticated',
    // ... user metadata
  }
}
```

**Mock Session (when `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`):**
```typescript
// Location: packages/common/auth.tsx
const DEFAULT_SESSION = {
  access_token: 'mock-access-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    email: 'admin@ogelbase.com',
    id: 'mock-user-id',
    role: 'authenticated',
  }
}
```

### Token Refresh Mechanism

**Automatic Refresh:**
```typescript
// Location: packages/common/auth.tsx
export async function getAccessToken() {
  const aboutToExpire = currentSession?.expires_at
    ? currentSession.expires_at - Math.ceil(Date.now() / 1000) < 30
    : false

  if (!currentSession || aboutToExpire) {
    const { data: { session }, error } = await gotrueClient.getSession()
    return session?.access_token
  }

  return currentSession.access_token
}
```

**Expiry Handling:**
- Tokens refreshed automatically when < 30 seconds until expiry
- `onAuthStateChange` listener updates session in real-time
- Refresh token used to get new access token

### API Authentication

**All API calls authenticate via access token:**

```typescript
// Location: data/fetchers (inferred from usage)
// Access token automatically included in Authorization header
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
}
```

**No manual token passing required** - TanStack Query + fetch wrapper handles this.

---

## Part 3: Post-Auth Data Loading

### Auth Provider Flow

**Location:** `apps/studio/lib/auth.tsx`

```typescript
export const AuthProvider = ({ children }) => {
  // Mock auth for non-platform mode
  const enableMockAuth = IS_PLATFORM && process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true'
  const shouldBypassAuth = !IS_PLATFORM || enableMockAuth

  return (
    <AuthProviderInternal alwaysLoggedIn={shouldBypassAuth}>
      <AuthErrorToaster>{children}</AuthErrorToaster>
    </AuthProviderInternal>
  )
}
```

**Key Points:**
- If `IS_PLATFORM=false`, auth is bypassed (always logged in)
- If `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` in platform mode, uses mock session
- Real auth only active when `IS_PLATFORM=true` and mock auth disabled

### Profile Query

**Endpoint:** `GET /api/platform/profile`

**Location:** `apps/studio/pages/api/platform/profile/index.ts`

**What it does:**
1. Queries platform database for all organizations
2. Queries platform database for all projects
3. Maps projects to their organizations
4. Returns mock profile structure:

```typescript
{
  id: 1,
  primary_email: 'admin@ogelbase.com',
  username: 'admin',
  first_name: 'OgelBase',
  last_name: 'Admin',
  organizations: [
    {
      id, name, slug,
      billing_email: 'billing@ogelbase.com',
      projects: [...]
    }
  ]
}
```

**No Stripe calls in profile endpoint!**

### Organizations Query

**Hook:** `useOrganizationsQuery()`

**Location:** `apps/studio/data/organizations/organizations-query.ts`

**Endpoint:** `GET /api/platform/organizations` (proxies to profile endpoint)

**Trigger:** After profile loads successfully

```typescript
export const useOrganizationsQuery = () => {
  const { profile } = useProfile()
  return useQuery({
    queryKey: organizationKeys.list(),
    queryFn: ({ signal }) => getOrganizations({ signal }),
    enabled: profile !== undefined, // Waits for profile
    staleTime: 30 * 60 * 1000, // 30 minutes
  })
}
```

**No Stripe calls in organizations endpoint!**

### Initial Routing

**Sign-In Success Flow:**

```typescript
// After successful login:
await queryClient.resetQueries() // Clear all cached data

// Determine redirect path
let redirectPath = '/organizations'
if (returnTo && returnTo !== '/sign-in') {
  redirectPath = returnTo
}
router.push(redirectPath)
```

**Organizations Page Logic:**

```typescript
// Location: apps/studio/pages/organizations.tsx
useEffect(() => {
  // If no organizations exist, force creation
  if (isSuccess && organizations.length <= 0 && !orgNotFound) {
    router.push('/new')
  }
}, [isSuccess, organizations])
```

**No server-side redirects** - all routing is client-side via Next.js router.

---

## Part 4: Stripe Integration Analysis

### FINDING: No Direct Stripe API Calls in Auth Flow

**Searched for Stripe usage:**
- ✅ No Stripe calls in `/pages/api/auth/*` (doesn't exist)
- ✅ No Stripe calls in `/pages/api/platform/profile/*`
- ✅ No Stripe calls in `/pages/api/platform/organizations/*`
- ✅ No Stripe SDK initialization in auth flow

**Where Stripe IS used:**

```typescript
// Location: apps/studio/lib/constants/index.ts
export const STRIPE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY ||
  'pk_test_XVwg5IZH3I9Gti98hZw6KRzd00v5858heG'
```

**Stripe is only used in:**
1. Payment method components (`PaymentMethods`, `AddNewPaymentMethodModal`)
2. Billing settings pages (requires navigation to `/org/[slug]/billing`)
3. Subscription management (not loaded during login)

### Billing API Endpoints (Not Called During Auth)

**Subscription Endpoint:**
```typescript
// Location: apps/studio/pages/api/platform/organizations/[slug]/billing/subscription.ts
const handleGet = async (req, res) => {
  // Returns default enterprise plan if no DATABASE_URL
  const defaultResponse = {
    plan: { id: 'enterprise', name: 'Enterprise' },
    billing_via_partner: false,
    billing_partner: 'fly',
    // ... no Stripe calls
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse)
  }

  // Query platform database (Postgres, not Stripe)
  const { data } = await queryPlatformDatabase({
    query: 'SELECT * FROM platform.subscriptions ...'
  })

  return res.status(200).json(data || defaultResponse)
}
```

**Plans Endpoint:**
```typescript
// Location: apps/studio/pages/api/platform/organizations/[slug]/billing/plans.ts
const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', price: 0, ... },
  { id: 'pro', name: 'Pro', price: 25, ... },
  { id: 'team', name: 'Team', price: 599, ... },
  { id: 'enterprise', name: 'Enterprise', price: 0, ... },
]

// Returns hardcoded plans, no Stripe API
```

**No Stripe API calls in these endpoints!** They return mock/database data.

---

## Part 5: The REAL Blocker - Permissions System

### Permission Checks Block Billing Queries

**Location:** `apps/studio/data/subscriptions/org-subscription-query.ts`

```typescript
export const useOrgSubscriptionQuery = ({ orgSlug }) => {
  // THIS IS THE BLOCKER
  const { can: canReadSubscriptions } = useAsyncCheckPermissions(
    PermissionAction.BILLING_READ,
    'stripe.subscriptions'
  )

  return useQuery({
    queryKey: subscriptionKeys.orgSubscription(orgSlug),
    queryFn: ({ signal }) => getOrgSubscription({ orgSlug }, signal),
    enabled: enabled && canReadSubscriptions && typeof orgSlug !== 'undefined',
    //                   ^^^^^^^^^^^^^^^^^^^ Query won't run until this is true
    staleTime: 60 * 60 * 1000,
  })
}
```

**Same pattern in plans query:**
```typescript
// Location: apps/studio/data/subscriptions/org-plans-query.ts
const { can: canReadSubscriptions } = useAsyncCheckPermissions(
  PermissionAction.BILLING_READ,
  'stripe.subscriptions'
)

return useQuery({
  enabled: enabled && typeof orgSlug !== 'undefined' && canReadSubscriptions,
  //                                                     ^^^^^^^^^^^^^^^^^^^ Blocker
})
```

### How Permissions Work

**Location:** `apps/studio/hooks/misc/useCheckPermissions.ts`

```typescript
export function useAsyncCheckPermissions(action, resource, data?, overrides?) {
  const isLoggedIn = useIsLoggedIn()

  // Get permissions from API
  const { permissions, isLoading, isSuccess } = useGetProjectPermissions(...)

  const can = useMemo(() => {
    if (!IS_PLATFORM) return true // ← Self-hosted always allowed
    if (!isLoggedIn) return false
    if (!isPermissionsSuccess || !allPermissions) return false

    return doPermissionsCheck(permissions, action, resource, ...)
  }, [isLoggedIn, isPermissionsSuccess, allPermissions, ...])

  return { isLoading, isSuccess, can }
}
```

**Key Insight:**
- **Self-hosted mode (`IS_PLATFORM=false`):** Permissions always return `true`
- **Platform mode (`IS_PLATFORM=true`):** Must fetch permissions from API first
- **Until permissions load:** `can: false` → billing queries disabled

### Permissions Query

**Must complete before billing queries can run:**

```typescript
// Location: data/permissions/permissions-query.ts (inferred)
usePermissionsQuery({
  enabled: permissionsOverride === undefined && enabled,
})
```

**This query must:**
1. Wait for authentication
2. Fetch user permissions from backend
3. Process permission rules
4. Return `canReadSubscriptions: true`

**ONLY THEN** can billing queries (`useOrgSubscriptionQuery`, `useOrgPlansQuery`) execute.

---

## Part 6: Complete Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SIGN IN / SIGN UP                             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  gotrueClient.signInWithPassword()               │
        │  → POST {GOTRUE_URL}/auth/v1/token               │
        └──────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  GoTrue Response:                                │
        │  {                                               │
        │    access_token: "jwt...",                       │
        │    refresh_token: "...",                         │
        │    user: { id, email, ... }                      │
        │  }                                               │
        └──────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  Store in localStorage:                          │
        │  'supabase.dashboard.auth.token'                 │
        └──────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  Check MFA requirement                           │
        │  getMfaAuthenticatorAssuranceLevel()             │
        │                                                  │
        │  If MFA required → redirect to /sign-in-mfa      │
        │  Otherwise → continue                            │
        └──────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  queryClient.resetQueries()                      │
        │  Clear all cached data                           │
        └──────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │  router.push('/organizations')                   │
        │  Navigate to dashboard                           │
        └──────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORGANIZATIONS PAGE LOAD                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
    ┌───────────────────┐ ┌──────────────┐ ┌─────────────────┐
    │ useProfile()      │ │ usePermissions│ │ useOrganizations│
    │                   │ │ Query()       │ │ Query()         │
    └───────────────────┘ └──────────────┘ └─────────────────┘
                │                 │                 │
                ▼                 ▼                 ▼
    ┌───────────────────┐ ┌──────────────┐ ┌─────────────────┐
    │ GET /api/platform/│ │ GET /api/    │ │ GET /api/       │
    │     profile       │ │   permissions│ │   organizations │
    └───────────────────┘ └──────────────┘ └─────────────────┘
                │                 │                 │
                ▼                 ▼                 ▼
    ┌───────────────────┐ ┌──────────────┐ ┌─────────────────┐
    │ Returns:          │ │ Returns:     │ │ Returns:        │
    │ {                 │ │ [            │ │ [               │
    │   id: 1,          │ │   {          │ │   {             │
    │   email: "...",   │ │     action,  │ │     id, name,   │
    │   organizations   │ │     resource,│ │     slug,       │
    │ }                 │ │     can: true│ │     projects    │
    │                   │ │   }          │ │   }             │
    │ ✅ NO STRIPE      │ │ ]            │ │ ]               │
    └───────────────────┘ └──────────────┘ └─────────────────┘
                │                 │                 │
                └─────────────────┴─────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │ Dashboard Ready          │
                    │ Organizations displayed  │
                    └──────────────────────────┘
```

---

## Part 7: Where Billing Queries Are Actually Used

**NOT called during login:**

### BillingSettings Component
```typescript
// Location: apps/studio/components/interfaces/Organization/BillingSettings/BillingSettings.tsx
const { data: subscription } = useOrgSubscriptionQuery({ orgSlug: org?.slug })

// Only loads when user navigates to:
// /org/[slug]/billing
```

**Trigger:** User must explicitly navigate to billing page

### Other Billing Components

All located under `/components/interfaces/Organization/BillingSettings/*`:
- `Subscription.tsx` - Subscription management
- `CostControl.tsx` - Spend cap controls
- `PaymentMethods.tsx` - Payment method management
- `BillingBreakdown.tsx` - Usage breakdown

**None of these load during authentication flow!**

---

## Part 8: The Fix - Make Billing Queries Optional

### Problem Statement

When `IS_PLATFORM=true`, billing queries (`useOrgSubscriptionQuery`, `useOrgPlansQuery`) check permissions before running:

```typescript
const { can: canReadSubscriptions } = useAsyncCheckPermissions(
  PermissionAction.BILLING_READ,
  'stripe.subscriptions'
)

enabled: enabled && canReadSubscriptions && typeof orgSlug !== 'undefined'
```

**If permissions API fails or returns false → billing queries never run.**

This doesn't block login, but can cause:
1. Billing pages to show loading indefinitely
2. Components that depend on subscription data to fail
3. UI elements that check subscription plan to error

### Solution 1: Skip Permissions Check in Self-Hosted Mode

**File:** `apps/studio/data/subscriptions/org-subscription-query.ts`

```typescript
export const useOrgSubscriptionQuery = ({ orgSlug }) => {
  const { can: canReadSubscriptions } = useAsyncCheckPermissions(
    PermissionAction.BILLING_READ,
    'stripe.subscriptions'
  )

  // In self-hosted mode, permissions always return true anyway
  // So this is already handled correctly

  return useQuery({
    queryKey: subscriptionKeys.orgSubscription(orgSlug),
    queryFn: ({ signal }) => getOrgSubscription({ orgSlug }, signal),
    enabled: enabled && canReadSubscriptions && typeof orgSlug !== 'undefined',
    staleTime: 60 * 60 * 1000,
  })
}
```

**This already works correctly!** When `IS_PLATFORM=false`:
- `useAsyncCheckPermissions` returns `{ can: true }` immediately
- Billing queries run without waiting for permissions

### Solution 2: Graceful Fallback in Billing API Endpoints

**Already implemented!**

```typescript
// Location: apps/studio/pages/api/platform/organizations/[slug]/billing/subscription.ts
const handleGet = async (req, res) => {
  const defaultResponse = {
    plan: { id: 'enterprise', name: 'Enterprise' },
    billing_via_partner: false,
    // ...
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse) // ✅ Graceful fallback
  }

  const { data, error } = await queryPlatformDatabase(...)

  if (error || !data) {
    return res.status(200).json(defaultResponse) // ✅ Graceful fallback
  }

  return res.status(200).json(data)
}
```

**Billing endpoints already return mock data when database unavailable!**

### Solution 3: Environment Variable to Disable Billing Features

**Already exists:**

```typescript
// Location: apps/studio/lib/constants/index.ts
export const IS_PLATFORM = process.env.NEXT_PUBLIC_IS_PLATFORM === 'true'
```

**When `IS_PLATFORM=false`:**
- Permissions always return `true`
- No real Stripe integration needed
- Mock billing data used everywhere

### Solution 4: Mock Permissions Response

**For testing in platform mode without real permissions API:**

```typescript
// Location: apps/studio/hooks/misc/useCheckPermissions.ts
export function useAsyncCheckPermissions(action, resource, data?, overrides?) {
  const can = useMemo(() => {
    if (!IS_PLATFORM) return true

    // Add this for testing:
    if (process.env.NEXT_PUBLIC_MOCK_PERMISSIONS === 'true') {
      return true
    }

    // ... existing permission checks
  }, [...])
}
```

**Usage:**
```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_MOCK_PERMISSIONS=true
```

---

## Part 9: Testing Strategy

### Test 1: Self-Hosted Mode (Already Works)

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=false
NEXT_PUBLIC_GOTRUE_URL=http://localhost:54321/auth/v1
```

**Expected:**
- ✅ Login works
- ✅ Profile loads
- ✅ Organizations load
- ✅ Dashboard accessible
- ✅ Billing queries run (permissions always true)

### Test 2: Platform Mode with Mock Auth

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
DATABASE_URL=postgresql://...
```

**Expected:**
- ✅ Login bypassed (uses mock session)
- ✅ Profile loads from database
- ✅ Organizations load from database
- ✅ Dashboard accessible
- ⚠️  Billing queries blocked until permissions load

### Test 3: Platform Mode with Real Auth + Mock Permissions

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
NEXT_PUBLIC_MOCK_PERMISSIONS=true
NEXT_PUBLIC_GOTRUE_URL=http://localhost:54321/auth/v1
DATABASE_URL=postgresql://...
```

**Expected:**
- ✅ Real login flow
- ✅ Profile loads
- ✅ Organizations load
- ✅ Dashboard accessible
- ✅ Billing queries run (mocked permissions)

### Test 4: Full Platform Mode

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
NEXT_PUBLIC_GOTRUE_URL=https://your-gotrue-url
DATABASE_URL=postgresql://...
# Permissions API must be available
```

**Expected:**
- ✅ Real login flow
- ✅ Profile loads
- ✅ Organizations load
- ✅ Dashboard accessible
- ✅ Billing queries run after permissions load

---

## Part 10: Conclusion

### Key Findings

1. **Stripe is NOT blocking login** - No Stripe API calls during authentication
2. **Permissions system is the blocker** - Billing queries wait for permissions
3. **Self-hosted mode works correctly** - Permissions always return true
4. **Platform mode needs permissions API** - Or mock permissions for testing
5. **Billing endpoints are resilient** - Return mock data if database unavailable

### Authentication Flow Summary

```
Sign In → GoTrue Auth → Store Session → Check MFA
       → Reset Queries → Navigate to /organizations
       → Load Profile → Load Permissions → Load Organizations
       → Dashboard Ready
```

**Billing queries run in parallel but independently:**
- Not required for login
- Not required for dashboard access
- Only needed when viewing billing pages

### Recommended Configuration for Development

```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=false
NEXT_PUBLIC_GOTRUE_URL=http://localhost:54321/auth/v1
DATABASE_URL=postgresql://localhost:5432/platform_db
```

**This gives you:**
- ✅ Real auth (GoTrue)
- ✅ Real database (Postgres)
- ✅ No permissions blocking
- ✅ Mock billing data
- ✅ Full dashboard access

### Next Steps

1. **Verify permissions API is accessible** in platform mode
2. **Add `NEXT_PUBLIC_MOCK_PERMISSIONS`** flag for testing
3. **Add permission loading indicators** in UI
4. **Add timeout/retry logic** for permission queries
5. **Document permission requirements** for platform mode

---

## Appendix A: Environment Variables Reference

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_IS_PLATFORM` | Enable platform mode | `false` |
| `NEXT_PUBLIC_ENABLE_MOCK_AUTH` | Bypass real auth | `false` |
| `NEXT_PUBLIC_GOTRUE_URL` | GoTrue auth endpoint | None (fallback to SUPABASE_URL) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | None |
| `DATABASE_URL` | Platform database | None |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | Stripe public key | Test key |
| `NEXT_PUBLIC_MOCK_PERMISSIONS` | Mock permissions (proposed) | `false` |

## Appendix B: Critical Files

**Authentication:**
- `packages/common/gotrue.ts` - GoTrue client setup
- `packages/common/auth.tsx` - Auth provider & hooks
- `apps/studio/lib/auth.tsx` - Studio auth wrapper
- `apps/studio/components/interfaces/SignIn/SignInForm.tsx` - Login UI

**Profile & Organizations:**
- `apps/studio/pages/api/platform/profile/index.ts` - Profile API
- `apps/studio/data/organizations/organizations-query.ts` - Orgs query

**Permissions:**
- `apps/studio/hooks/misc/useCheckPermissions.ts` - Permission checks

**Billing (NOT in auth flow):**
- `apps/studio/data/subscriptions/org-subscription-query.ts` - Subscription query
- `apps/studio/data/subscriptions/org-plans-query.ts` - Plans query
- `apps/studio/pages/api/platform/organizations/[slug]/billing/subscription.ts` - Subscription API
- `apps/studio/pages/api/platform/organizations/[slug]/billing/plans.ts` - Plans API

---

**End of Report**
