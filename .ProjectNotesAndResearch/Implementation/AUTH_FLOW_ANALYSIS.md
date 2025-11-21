# Complete Authentication Flow Analysis - UI/UX Perspective

## Executive Summary

**THE GOOD NEWS**: Stripe is **NOT blocking login**. The app is designed to work without Stripe when `IS_PLATFORM=false`. However, Stripe elements are loaded **conditionally** when creating paid organizations.

**KEY FINDING**: Stripe `loadStripe()` is only called in these scenarios:
1. Creating a new PRO/TEAM organization (not FREE tier)
2. Accessing billing/payment pages within an organization
3. Never during the actual authentication flow

---

## Part 1: Sign Up Flow

### 1.1 Sign Up Page Component
**File**: `/apps/studio/pages/sign-up.tsx`

```
User Journey:
┌─────────────────────────────────────┐
│ User lands on /sign-up              │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ SignUpForm Component                │
│ - Email input (required, validated) │
│ - Password input (8+ chars, rules)  │
│ - HCaptcha (invisible)              │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ User clicks "Sign Up"               │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Submit to: useSignUpMutation()      │
│ Endpoint: GoTrue Auth API           │
│ - Creates user account              │
│ - Sends email verification          │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ SUCCESS: Email confirmation sent    │
│ Redirect: /sign-in                  │
│ (User must verify email first)      │
└─────────────────────────────────────┘
```

**Form Fields Required**:
- Email (validated format)
- Password (minimum 8 chars, uppercase, lowercase, number, symbol)

**API Call**:
```typescript
// From SignUpForm.tsx line 110
signup({
  email,
  password,
  hcaptchaToken: token ?? null,
  redirectTo, // Either /authorize or /sign-in
})
```

**Post-Signup Behavior**:
- User sees success message: "Check your email to confirm"
- Confirmation link expires in 10 minutes
- User redirected to `/sign-in` after clicking email link

**NO STRIPE INVOLVEMENT** ✅

---

## Part 2: Login Flow

### 2.1 Sign In Page Component
**File**: `/apps/studio/pages/sign-in.tsx`

```
User Journey:
┌─────────────────────────────────────┐
│ User lands on /sign-in              │
│ (or /sign-in?returnTo=<path>)       │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ SignInForm Component                │
│ - Email input                       │
│ - Password input                    │
│ - HCaptcha (invisible)              │
│ - "Forgot Password?" link           │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ User clicks "Sign In"               │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Submit to: auth.signInWithPassword()│
│ Endpoint: GoTrue Auth API           │
│ - Validates credentials             │
│ - Returns session token             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Check MFA requirement               │
│ getMfaAuthenticatorAssuranceLevel() │
└────────────┬────────────────────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
   [MFA REQ]   [NO MFA]
        │         │
        │         ▼
        │    ┌─────────────────────────┐
        │    │ SUCCESS: Signed in      │
        │    │ - Reset query cache     │
        │    │ - Store session token   │
        │    └────────┬────────────────┘
        │             │
        ▼             ▼
   /sign-in-mfa   REDIRECT TO:
                  - returnTo param if exists
                  - OR /organizations
```

**Form Fields Required**:
- Email
- Password

**API Call**:
```typescript
// From SignInForm.tsx line 76
const { error } = await auth.signInWithPassword({
  email,
  password,
  options: { captchaToken: token ?? undefined },
})
```

**Session Storage**:
- Handled by `@supabase/auth-js` client
- Token stored in browser (localStorage or cookies depending on config)
- Session managed by `AuthProvider` in `_app.tsx`

**Redirect Logic**:
```typescript
// From SignInForm.tsx line 104-108
let redirectPath = '/organizations'
if (returnTo && returnTo !== '/sign-in') {
  redirectPath = returnTo
}
router.push(redirectPath)
```

**NO STRIPE INVOLVEMENT** ✅

---

## Part 3: Auth State Management

### 3.1 Authentication Provider
**File**: `/apps/studio/lib/auth.tsx`

```
Auth Architecture:
┌──────────────────────────────────────────┐
│ _app.tsx                                 │
│ ├─ QueryClientProvider                  │
│ ├─ AuthProvider ← SESSION MGMT          │
│ │  └─ useAuth() hook                    │
│ ├─ ProfileProvider ← USER PROFILE       │
│ │  └─ useProfile() hook                 │
│ └─ RouteValidationWrapper ← AUTH GUARDS │
└──────────────────────────────────────────┘
```

**Auth Context**:
```typescript
// Session check
const { isLoading, session } = useAuth()
const isLoggedIn = Boolean(session)
```

**Session Token Storage**:
- Managed by Supabase Auth SDK
- Default: localStorage
- Can be configured for cookies (SSR)

### 3.2 Route Protection
**File**: `/apps/studio/hooks/misc/withAuth.tsx`

Protected pages use `withAuth()` HOC:
```typescript
export default withAuth(SomePage)
```

**Auth Check Flow**:
1. Check if session exists
2. Verify MFA level if required
3. If not authenticated: redirect to `/sign-in?returnTo=<current-path>`
4. If session timeout: show SessionTimeoutModal

**Session Timeout**: 10 seconds max before showing timeout modal

---

## Part 4: Post-Auth Navigation & Dashboard Landing

### 4.1 Redirect After Login
**File**: `/apps/studio/components/interfaces/SignIn/SignInForm.tsx`

```
Login Success Flow:
┌───────────────────────────────────┐
│ Login successful                  │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ queryClient.resetQueries()        │
│ (Clear all cached data)           │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ Determine redirect path:          │
│ - returnTo param exists?          │
│   YES → router.push(returnTo)     │
│   NO → router.push('/organizations')│
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ Page loads with auth context      │
└───────────────────────────────────┘
```

**Default Landing**: `/organizations`

### 4.2 Organizations Page
**File**: `/apps/studio/pages/organizations.tsx`

```
Organizations Page Load:
┌───────────────────────────────────┐
│ /organizations page loads         │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ useOrganizationsQuery()           │
│ GET /platform/organizations       │
└────────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
   [HAS ORGS] [NO ORGS]
        │         │
        │         ▼
        │    Force redirect to /new
        │    (Must create org)
        │
        ▼
┌───────────────────────────────────┐
│ Display organization cards        │
│ - Org name                        │
│ - Plan tier (FREE/PRO/TEAM)       │
│ - Project count                   │
│ - MFA status                      │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ User clicks org card              │
│ → Navigate to /org/{slug}         │
└───────────────────────────────────┘
```

**API Call**:
```typescript
// From organizations-query.ts line 39
const { data, error } = await get('/platform/organizations', { signal, headers })
```

**Organization Data**:
```typescript
{
  id: string
  slug: string
  name: string
  plan: { name: string } // FREE, PRO, TEAM
  billing_email: string
  organization_requires_mfa: boolean
}
```

**NO STRIPE INVOLVEMENT** ✅

### 4.3 Auto-Select First Organization
**File**: `/apps/studio/components/interfaces/App/RouteValidationWrapper.tsx`

```
Root Path Auto-Redirect (lines 119-147):
┌───────────────────────────────────┐
│ User lands on / (root)            │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ Wait for:                         │
│ - isLoggedIn = true               │
│ - orgsInitialized = true          │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ Check localStorage for            │
│ LAST_VISITED_ORGANIZATION         │
└────────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
   [FOUND]   [NOT FOUND]
        │         │
        │         └─ Use first org
        │
        ▼
┌───────────────────────────────────┐
│ router.push(/org/{slug})          │
└───────────────────────────────────┘
```

### 4.4 Organization Dashboard
**File**: `/apps/studio/pages/org/[slug]/index.tsx`

```
Org Dashboard Load:
┌───────────────────────────────────┐
│ /org/{slug} page loads            │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ withAuth() HOC validates session  │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ OrganizationLayout loads          │
│ - Check partner management        │
│ - Show banner if Vercel/AWS       │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ Check MFA requirement             │
│ - org.organization_requires_mfa?  │
│ - user has MFA enabled?           │
└────────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
   [MFA REQ]  [NORMAL ACCESS]
        │         │
        │         ▼
        │    ┌─────────────────────┐
        │    │ ProjectList loads   │
        │    │ - Show all projects │
        │    │ - Create new button │
        │    └─────────────────────┘
        │
        ▼
   Show warning:
   "Set up MFA to access"
```

**NO STRIPE INVOLVEMENT** ✅

---

## Part 5: Critical Stripe Integration Points

### 5.1 Where Stripe IS Called

#### Location 1: New Organization Creation (ONLY FOR PAID PLANS)
**File**: `/apps/studio/pages/new/index.tsx`

```typescript
// Line 96: Stripe loaded conditionally
const stripePromise = loadStripe(STRIPE_PUBLIC_KEY)

// Stripe ONLY initialized when:
selectedPlan === 'PRO' || selectedPlan === 'TEAM'
// FREE plan skips all Stripe setup
```

**Trigger**: User selects PRO or TEAM plan in org creation wizard

**Flow**:
```
New Org Page Load:
┌───────────────────────────────────┐
│ User on /new (create org)         │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ NewOrgForm component              │
│ - Select plan: FREE/PRO/TEAM      │
└────────────┬──────────────────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
   [FREE]    [PRO/TEAM]
        │         │
        │         ▼
        │    ┌─────────────────────────┐
        │    │ loadPaymentForm()       │
        │    │ - Execute HCaptcha      │
        │    │ - Call setupIntent()    │
        │    │ - Load Stripe Elements  │
        │    └────────┬────────────────┘
        │             │
        │             ▼
        │    ┌─────────────────────────┐
        │    │ Stripe payment form     │
        │    │ (credit card input)     │
        │    └─────────────────────────┘
        │
        ▼
   Skip payment setup
   Create FREE org
```

**Setup Intent API**:
```typescript
// From setup-intent-mutation.ts
setupIntent({ hcaptchaToken })
// POST /platform/stripe/setup-intent

// Backend response:
{
  client_secret: string,
  id: string,
  status: 'requires_payment_method'
}
```

#### Location 2: Billing Pages
**Files**:
- `/apps/studio/pages/org/[slug]/billing.tsx`
- `/apps/studio/components/interfaces/Billing/*`

**Only loaded when user navigates to billing section**

#### Location 3: Subscription Changes
**Files**:
- `/apps/studio/components/interfaces/Organization/BillingSettings/Subscription/SubscriptionPlanUpdateDialog.tsx`
- `/apps/studio/components/interfaces/Organization/BillingSettings/PaymentMethodSelection.tsx`

**Only loaded when upgrading/downgrading plans**

### 5.2 Where Stripe is NOT Called

✅ **Sign Up Page** - No Stripe
✅ **Sign In Page** - No Stripe
✅ **Profile Loading** - No Stripe
✅ **Organizations List** - No Stripe
✅ **Organization Dashboard** - No Stripe
✅ **Project Pages** - No Stripe
✅ **FREE Org Creation** - No Stripe

---

## Part 6: Mock/Bypass Capabilities

### 6.1 IS_PLATFORM Flag
**File**: `/apps/studio/lib/constants/index.ts`

```typescript
export const IS_PLATFORM = process.env.NEXT_PUBLIC_IS_PLATFORM === 'true'
```

**When `IS_PLATFORM = false`** (Self-Hosted Mode):
- All auth flows bypass platform checks
- No Stripe elements loaded
- Mock auth can be enabled
- Directly redirect to `/project/default`

### 6.2 Mock Auth Mode
**File**: `/apps/studio/lib/auth.tsx` (line 37)

```typescript
const enableMockAuth = IS_PLATFORM && process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true'
const shouldBypassAuth = !IS_PLATFORM || enableMockAuth
```

**Mock Auth Environment Variables**:
```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```

### 6.3 Payment API Graceful Degradation
**File**: `/apps/studio/pages/api/platform/organizations/[slug]/payments.ts`

```typescript
// Lines 57-59, 92-98, 117-124, 158-160, 196-198
if (!process.env.DATABASE_URL) {
  return res.status(200).json([])  // Empty payment methods
}
```

**Fallback Behavior**:
- No DATABASE_URL → Returns empty array or mock data
- No Stripe error → User can still access features
- Payment pages gracefully degrade

---

## Part 7: Loading States & Data Fetching

### 7.1 Critical Data Loads After Login

```
Post-Login Data Cascade:
┌───────────────────────────────────┐
│ 1. Profile Load                   │
│    useProfileQuery()              │
│    GET /platform/profile          │
│    ⏱ Required before ANY page    │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ 2. Permissions Load               │
│    usePermissionsQuery()          │
│    GET /platform/permissions      │
│    ⏱ Required before ANY page    │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ 3. Organizations Load             │
│    useOrganizationsQuery()        │
│    GET /platform/organizations    │
│    ⏱ Blocks /organizations page   │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ 4. Organization Detail            │
│    (When entering org page)       │
│    useSelectedOrganizationQuery() │
└────────────┬──────────────────────┘
             │
             ▼
┌───────────────────────────────────┐
│ 5. Projects Load (Optional)       │
│    useOrgProjectsInfiniteQuery()  │
│    ⏱ Only on project list pages   │
└───────────────────────────────────┘
```

**CRITICAL**: Profile + Permissions must load before app is usable

**Billing Data** (Optional, NOT blocking):
- `useOrganizationCustomerProfileQuery()` - Only called on billing pages
- `useOrganizationPaymentMethodsQuery()` - Only called when editing payment
- Both have `enabled: IS_PLATFORM && canReadCustomerProfile` gates

### 7.2 Loading Indicators

**Sign In Form**: Spinner on button during submission
**Organizations Page**: Skeleton loaders for org cards
**withAuth HOC**: 10-second timeout before showing SessionTimeoutModal

---

## Part 8: Error Scenarios & Edge Cases

### 8.1 Common Error Points

**1. Email Not Confirmed**
```typescript
// SignInForm.tsx line 117
if (error.message.toLowerCase() === 'email not confirmed') {
  toast.error('Account has not been verified, check your email')
}
```

**2. Invalid Credentials**
```typescript
// Auth returns error from GoTrue
toast.error(error.message)
```

**3. MFA Required But Not Set Up**
```
User can log in → Redirect to /sign-in-mfa
```

**4. Session Expired**
```
withAuth() detects expired token → Sign out → Redirect to /sign-in
```

**5. Organization Not Found**
```
RouteValidationWrapper detects invalid slug
→ Toast: "We couldn't find that organization"
→ Redirect: /organizations?error=org_not_found&org={slug}
```

**6. No Organizations**
```
organizations.length === 0
→ Auto redirect to /new (force org creation)
```

### 8.2 Stripe-Related Errors

**Setup Intent Fails**:
```typescript
// Returns mock data if backend unavailable
client_secret: 'seti_mock_client_secret_' + Date.now()
```

**Stripe Elements Load Fails**:
- Only affects paid org creation
- User can still create FREE orgs
- Doesn't block login/existing org access

---

## Part 9: Complete User Journeys

### Journey 1: New User Sign Up → First Login → Dashboard

```
1. User visits /sign-up
   ↓
2. Enters email + password
   ↓
3. Clicks "Sign Up"
   ↓
4. GoTrue creates account
   ↓
5. Email verification sent
   ↓
6. User clicks email link
   ↓
7. Redirected to /sign-in
   ↓
8. Enters credentials
   ↓
9. SignInForm submits to auth.signInWithPassword()
   ↓
10. Session token stored
    ↓
11. queryClient.resetQueries()
    ↓
12. Redirect to /organizations
    ↓
13. useOrganizationsQuery() → returns []
    ↓
14. Auto redirect to /new
    ↓
15. User creates FREE org (no Stripe)
    ↓
16. Redirect to /org/{slug}
    ↓
17. ProjectList shows empty state
    ↓
18. User creates first project
```

**STRIPE CALLED**: Never (FREE org path)

### Journey 2: Existing User Login → Access Org

```
1. User visits /sign-in
   ↓
2. Enters credentials
   ↓
3. SignInForm submits
   ↓
4. Session token stored
   ↓
5. Redirect to /organizations
   ↓
6. useOrganizationsQuery() → returns existing orgs
   ↓
7. RouteValidationWrapper auto-selects last visited org
   ↓
8. Redirect to /org/{slug}
   ↓
9. OrganizationLayout loads
   ↓
10. ProjectList shows user's projects
```

**STRIPE CALLED**: Never (accessing existing org)

### Journey 3: User Creates Paid Organization

```
1. User on /organizations
   ↓
2. Clicks "New organization"
   ↓
3. Navigate to /new
   ↓
4. NewOrgForm loads
   ↓
5. User selects PRO plan
   ↓
6. selectedPlan changes → triggers loadPaymentForm()
   ↓
7. HCaptcha executes
   ↓
8. POST /platform/stripe/setup-intent
   ↓
9. loadStripe(STRIPE_PUBLIC_KEY) ← **STRIPE LOADED HERE**
   ↓
10. Stripe Elements render payment form
    ↓
11. User enters card details
    ↓
12. Submit → Create org + attach payment method
    ↓
13. Redirect to /org/{slug}
```

**STRIPE CALLED**: Yes, but ONLY during paid org creation

---

## Part 10: Solutions & Recommendations

### 10.1 Why User Can't Log In (Hypothesis)

Based on the code analysis:

**MOST LIKELY ISSUE**: Browser extension or network blocking Stripe CDN

**Evidence**:
1. Stripe is never called during login flow
2. Login uses only GoTrue auth API
3. Organizations page doesn't load Stripe
4. Only `/new` page with PRO/TEAM plan loads Stripe

**Potential Culprits**:
- Ad blocker blocking `loadStripe()` import
- CSP (Content Security Policy) blocking Stripe
- Network firewall blocking stripe.com
- Browser privacy settings blocking third-party scripts

### 10.2 Immediate Fixes

#### Fix 1: Disable IS_PLATFORM for Local Dev
```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=false
```

**Result**: Bypasses all Stripe, goes straight to `/project/default`

#### Fix 2: Enable Mock Auth
```bash
# .env.local
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```

**Result**: Can use platform features without real auth

#### Fix 3: Check Console for Stripe Errors
```
Open browser DevTools
Filter console for "stripe" or "loadStripe"
```

If you see errors like:
- `Failed to load Stripe.js`
- `Blocked by CSP`
- `Network error loading stripe.com`

Then Stripe loading is being blocked by browser/network.

#### Fix 4: Lazy Load Stripe Only When Needed
**Already implemented** - Stripe only loads on demand when:
- User selects PRO/TEAM plan in `/new`
- User visits billing pages

This prevents Stripe from ever blocking the main auth flow.

### 10.3 Verification Steps

To confirm login works without Stripe:

```bash
# 1. Set environment to non-platform mode
echo "NEXT_PUBLIC_IS_PLATFORM=false" >> .env.local

# 2. Restart dev server
npm run dev

# 3. Navigate to /sign-in
# Should redirect to /project/default immediately

# 4. Test with platform mode but no Stripe
echo "NEXT_PUBLIC_IS_PLATFORM=true" >> .env.local
# Remove STRIPE_PUBLIC_KEY from .env

# 5. Login should work, org creation for FREE orgs should work
# Only PRO/TEAM org creation will fail (expected)
```

---

## Part 11: Architectural Insights

### 11.1 Stripe Integration Design Patterns

**Pattern 1: Conditional Loading**
```typescript
// Only load when plan requires payment
if (selectedPlan === 'PRO' || selectedPlan === 'TEAM') {
  const stripePromise = loadStripe(STRIPE_PUBLIC_KEY)
}
```

**Pattern 2: Graceful Degradation**
```typescript
// Backend returns mock data if Stripe unavailable
if (!process.env.DATABASE_URL) {
  return res.status(200).json([])
}
```

**Pattern 3: Permission-Based Queries**
```typescript
// Only fetch billing data if user has permission
enabled: IS_PLATFORM && enabled && canReadCustomerProfile
```

### 11.2 Auth Architecture Strengths

✅ **Separation of Concerns**: Auth (GoTrue) separate from Billing (Stripe)
✅ **Progressive Enhancement**: FREE tier works without payment setup
✅ **Lazy Loading**: Stripe only loaded when actually needed
✅ **Fallback Modes**: Mock auth for development, self-hosted mode
✅ **Clear State Management**: React Query handles all async state

### 11.3 Potential Improvements

**Recommendation 1**: Add Stripe error boundary
```typescript
<ErrorBoundary fallback={<StripeUnavailableNotice />}>
  <StripeElements>
    <PaymentForm />
  </StripeElements>
</ErrorBoundary>
```

**Recommendation 2**: Add offline detection
```typescript
if (!navigator.onLine) {
  toast.warning('Offline mode: Payment features unavailable')
}
```

**Recommendation 3**: Add CSP meta tag for Stripe
```html
<meta
  http-equiv="Content-Security-Policy"
  content="script-src 'self' https://js.stripe.com"
/>
```

---

## Conclusion

**USER'S LOGIN ISSUE IS NOT CAUSED BY STRIPE IN THE AUTH FLOW**

The codebase is well-architected to keep Stripe completely separate from authentication. Stripe is only loaded on-demand for paid features.

**Most Likely Causes of Login Issue**:
1. Network/firewall blocking auth API endpoints
2. Browser blocking cookies/localStorage
3. Incorrect environment variables
4. Database connection issues (platform API unreachable)
5. CORS issues with auth endpoints

**Next Steps**:
1. Check browser console for network errors during login
2. Verify auth API endpoint is reachable
3. Check if cookies/localStorage are enabled
4. Review environment variable configuration
5. Test with `IS_PLATFORM=false` to bypass platform checks

The Stripe integration is a red herring - the actual auth flow is clean and doesn't touch billing at all.
