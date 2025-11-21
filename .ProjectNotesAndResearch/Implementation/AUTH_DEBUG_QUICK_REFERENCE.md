# Auth Debug Quick Reference Card

## 🚨 Emergency Debugging Commands

### Test 1: Is Auth API Reachable?
```bash
curl -I $NEXT_PUBLIC_GOTRUE_URL/health
# Expected: 200 OK
# If fails: Auth endpoint is blocked, not Stripe
```

### Test 2: Self-Hosted Mode (Bypass Everything)
```bash
echo "NEXT_PUBLIC_IS_PLATFORM=false" >> .env.local
npm run dev
# Navigate to /sign-in → Should redirect to /project/default
# If works: Issue is with platform APIs, not auth
```

### Test 3: Mock Auth Mode
```bash
echo "NEXT_PUBLIC_IS_PLATFORM=true" >> .env.local
echo "NEXT_PUBLIC_ENABLE_MOCK_AUTH=true" >> .env.local
npm run dev
# Should allow login without real auth
# If works: GoTrue connection is broken
```

### Test 4: Check Session Token
```javascript
// Browser console after login attempt
localStorage.getItem('supabase.auth.token')
// null = auth failed
// {...} = auth worked, redirect issue
```

### Test 5: Stripe Isolation Test
```bash
# Open browser
# Go to /sign-up (no Stripe)
# Go to /sign-in (no Stripe)
# Go to /organizations (no Stripe)
# Go to /new → Select FREE (no Stripe)
# Go to /new → Select PRO (Stripe loads)
```

---

## 🔍 What to Check in Browser Console

### During Login Attempt

**✅ EXPECTED** (No Stripe):
```
POST https://your-gotrue.com/auth/v1/token
GET https://your-api.com/platform/profile
GET https://your-api.com/platform/permissions
GET https://your-api.com/platform/organizations
```

**❌ UNEXPECTED** (Should NOT see):
```
GET https://js.stripe.com/v3/
POST /platform/stripe/setup-intent
```

If you see Stripe during login, you're actually on:
- `/new` page with PRO plan selected
- Billing page
- Not the login page

---

## 🎯 Where Stripe IS Called (Reference)

| Page | Plan | Stripe? |
|------|------|---------|
| `/sign-up` | - | ❌ Never |
| `/sign-in` | - | ❌ Never |
| `/organizations` | - | ❌ Never |
| `/org/{slug}` | Any | ❌ Never |
| `/new` | FREE | ❌ No |
| `/new` | PRO | ✅ YES |
| `/new` | TEAM | ✅ YES |
| `/org/{slug}/billing` | Any | ✅ YES |

---

## 📋 Environment Variable Checklist

### Minimum for Login (No Stripe)
```bash
✅ NEXT_PUBLIC_GOTRUE_URL=...
✅ NEXT_PUBLIC_API_URL=...
✅ NEXT_PUBLIC_IS_PLATFORM=true
✅ DATABASE_URL=...
✅ NEXT_PUBLIC_HCAPTCHA_SITE_KEY=...
```

### Optional (Paid Features Only)
```bash
⚪ NEXT_PUBLIC_STRIPE_PUBLIC_KEY=...
```

**If Stripe key is missing**:
- Login still works ✅
- FREE orgs work ✅
- PRO/TEAM orgs fail ❌

---

## 🐛 Common Error Messages & Meaning

### "Email not confirmed"
```
Cause: User didn't click verification email
Solution: Check email, resend verification
NOT RELATED TO STRIPE
```

### "Invalid credentials"
```
Cause: Wrong email/password
Solution: Reset password
NOT RELATED TO STRIPE
```

### "Failed to load organizations"
```
Cause: Platform API error or no DATABASE_URL
Solution: Check DATABASE_URL env var
NOT RELATED TO STRIPE
```

### "Failed to load Stripe.js"
```
Cause: Ad blocker or CSP blocking Stripe
Solution: Disable ad blocker OR just use FREE orgs
ONLY AFFECTS PAID ORG CREATION
```

### "Session timeout"
```
Cause: Auth taking too long (>10s)
Solution: Check network, auth API performance
NOT RELATED TO STRIPE
```

---

## 🔧 Quick Fixes

### Fix 1: Can't Login at All
```typescript
// Check in browser console:
console.log('Auth URL:', process.env.NEXT_PUBLIC_GOTRUE_URL)
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL)

// Both should be valid URLs
// If undefined: .env.local not loaded correctly
```

### Fix 2: Login Works, But Immediate Logout
```typescript
// Check session storage:
console.log('Session:', localStorage.getItem('supabase.auth.token'))

// If null after login: Token not persisting
// Possible causes:
// - Browser private mode
// - Cookie settings
// - localStorage disabled
```

### Fix 3: Login Works, But Can't See Orgs
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# If not set:
export DATABASE_URL="postgresql://..."

# Restart server
```

### Fix 4: Can't Create Any Organization
```bash
# Try creating FREE org first
# If FREE fails: Backend issue, not Stripe
# If FREE works but PRO fails: Stripe issue (expected if no key)
```

---

## 📊 Auth Flow State Machine

```
┌──────────┐    Submit     ┌──────────┐    Success    ┌──────────┐
│ /sign-in │ ──────────────> │ Loading  │ ──────────────> │ Logged In│
└──────────┘                └──────────┘                └──────────┘
      ▲                           │                           │
      │                           │ Fail                      │
      │                           ▼                           │
      │                     ┌──────────┐                      │
      └─────────────────────│  Error   │                      │
           Retry            └──────────┘                      │
                                                              │
                                                              │ Load Data
                                                              ▼
                                                        ┌──────────┐
                                                        │ Profile  │
                                                        │ Perms    │
                                                        │ Orgs     │
                                                        └──────────┘
                                                              │
                                                              │ Success
                                                              ▼
                                                        ┌──────────┐
                                                        │ Dashboard│
                                                        └──────────┘
```

**Stripe never appears in this flow** ✅

---

## 🎭 Mock Data for Testing

### Test User (Mock Auth Mode)
```typescript
{
  id: 'test-user-123',
  email: 'test@example.com',
  // No password needed in mock mode
}
```

### Test Organization (Self-Hosted Mode)
```typescript
{
  slug: 'default',
  name: 'Default Organization',
  plan: { name: 'FREE' }
}
```

### Test Project (Self-Hosted Mode)
```typescript
{
  ref: 'default',
  name: 'Default Project'
}
```

---

## 🚦 Health Check Endpoints

```bash
# Auth Service
curl $NEXT_PUBLIC_GOTRUE_URL/health

# Platform API
curl $NEXT_PUBLIC_API_URL/health

# Stripe (only needed for paid features)
curl https://js.stripe.com/v3/
```

---

## 📞 When to Suspect Stripe vs Auth

### Suspect Stripe If:
- ✅ Can login successfully
- ✅ Can see organizations
- ✅ Can create FREE org
- ❌ Can't create PRO/TEAM org
- ❌ Can't access billing pages

### Suspect Auth If:
- ❌ Can't submit login form
- ❌ Form submits but no redirect
- ❌ Login appears to work but immediately logged out
- ❌ Can't access any pages after login

### Suspect Platform API If:
- ✅ Can login
- ❌ Can't see organizations
- ❌ Can't see projects
- ❌ Empty state everywhere

---

## 🔬 Advanced Debugging

### Enable React Query DevTools
```typescript
// Already enabled in _app.tsx
// Open browser, look for floating React Query icon (bottom-right)
// Shows all API calls, loading states, errors
```

### Check Network Waterfall
```
1. Open DevTools → Network tab
2. Start login flow
3. Watch request order:

Expected sequence:
POST /auth/v1/token           ← Auth (no Stripe)
GET  /platform/profile        ← Profile (no Stripe)
GET  /platform/permissions    ← Perms (no Stripe)
GET  /platform/organizations  ← Orgs (no Stripe)

Unexpected (during login):
GET  https://js.stripe.com    ← Should NOT see
POST /platform/stripe/*       ← Should NOT see
```

### Trace with Console Logs
```typescript
// Add to SignInForm.tsx (line 67)
const onSubmit = async ({ email, password }) => {
  console.log('[1] Submit started')

  const { error } = await auth.signInWithPassword({...})
  console.log('[2] Auth response:', { error })

  if (!error) {
    console.log('[3] Login successful')
    const data = await getMfaAuthenticatorAssuranceLevel()
    console.log('[4] MFA check:', data)

    await queryClient.resetQueries()
    console.log('[5] Cache cleared')

    router.push(redirectPath)
    console.log('[6] Redirecting to:', redirectPath)
  }
}
```

---

## 📝 Logging Best Practices

### Add Logs Without Breaking Flow
```typescript
// Good: Non-blocking logs
console.log('[AUTH]', 'Starting login')

// Bad: Blocking logs
await console.log('[AUTH]', 'Starting login') // ❌ Don't await console
```

### Log Levels
```typescript
console.log('[AUTH]', 'Info message')
console.warn('[AUTH]', 'Warning message')
console.error('[AUTH]', 'Error message')
console.debug('[AUTH]', 'Debug message')
```

### Filter Console
```
Chrome DevTools → Console → Filter:
[AUTH]    - See only auth logs
[STRIPE]  - See only Stripe logs (should be empty during login)
```

---

## 🎓 Key Takeaways

1. **Stripe ≠ Auth**: Completely separate systems
2. **Login = GoTrue**: Uses only Supabase Auth, no Stripe
3. **Stripe = Billing**: Only for PRO/TEAM org creation
4. **FREE orgs work**: No payment, no Stripe
5. **Graceful degradation**: App works without Stripe key

**If user can't login, it's NOT Stripe's fault.** Period.

Check:
- GoTrue endpoint reachable?
- Environment variables correct?
- Browser blocking cookies?
- Network/firewall issues?
- Platform API accessible?

That's where the problem is. Not Stripe.
