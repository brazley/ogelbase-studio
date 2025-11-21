# Mock Authentication - Code Changes Summary

## Overview

This document shows the exact code changes made to implement mock authentication bypass for platform mode.

---

## File 1: `/apps/studio/lib/auth.tsx`

### Change: Added conditional mock auth logic

**Location**: Lines 35-50

**Before:**

```typescript
export const AuthProvider = ({ children }: PropsWithChildren) => {
  return (
    <AuthProviderInternal alwaysLoggedIn={!IS_PLATFORM}>
      <AuthErrorToaster>{children}</AuthErrorToaster>
    </AuthProviderInternal>
  )
}
```

**After:**

```typescript
export const AuthProvider = ({ children }: PropsWithChildren) => {
  // Check if mock auth is enabled for platform mode
  const enableMockAuth =
    IS_PLATFORM &&
    process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true'

  // For platform mode with mock auth enabled, use alwaysLoggedIn to bypass real auth
  // The AuthProviderInternal will use its DEFAULT_SESSION when alwaysLoggedIn is true
  const shouldBypassAuth = !IS_PLATFORM || enableMockAuth

  return (
    <AuthProviderInternal alwaysLoggedIn={shouldBypassAuth}>
      <AuthErrorToaster>{children}</AuthErrorToaster>
    </AuthProviderInternal>
  )
}
```

**Impact**:

- Preserves original behavior: `!IS_PLATFORM` still bypasses auth (self-hosted mode)
- New behavior: `IS_PLATFORM && NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` also bypasses auth
- Platform mode without mock auth flag requires real authentication

---

## File 2: `/packages/common/auth.tsx`

### Change: Updated DEFAULT_SESSION with proper mock values

**Location**: Lines 18-39

**Before:**

```typescript
const DEFAULT_SESSION: any = {
  access_token: undefined,
  expires_at: 0,
  expires_in: 0,
  refresh_token: '',
  token_type: '',
  user: {
    aud: '',
    app_metadata: {},
    confirmed_at: '',
    created_at: '',
    email: '',
    email_confirmed_at: '',
    id: '',
    identities: [],
    last_signed_in_at: '',
    phone: '',
    role: '',
    updated_at: '',
    user_metadata: {},
  },
} as unknown as Session
```

**After:**

```typescript
const DEFAULT_SESSION: any = {
  access_token: 'mock-access-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  refresh_token: 'mock-refresh-token',
  token_type: 'bearer',
  user: {
    aud: 'authenticated',
    app_metadata: {},
    confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    email: 'admin@ogelbase.com',
    email_confirmed_at: new Date().toISOString(),
    id: 'mock-user-id',
    identities: [],
    last_signed_in_at: new Date().toISOString(),
    phone: '',
    role: 'authenticated',
    updated_at: new Date().toISOString(),
    user_metadata: {},
  },
} as unknown as Session
```

**Impact**:

- Provides realistic mock session data
- Prevents undefined errors in components expecting session values
- Includes recognizable admin email for debugging

---

## File 3: `/apps/studio/.env.local`

### Change: Added mock auth feature flag

**Location**: After line 39

**Addition:**

```bash
# Enable mock authentication for platform mode (bypasses GoTrue auth)
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```

**Impact**:

- Enables mock authentication when combined with `IS_PLATFORM=true`
- Can be toggled without code changes
- Documented clearly for other developers

---

## Logic Flow Comparison

### Original Logic

```
IS_PLATFORM?
├─ false → alwaysLoggedIn=true (bypass auth)
└─ true  → alwaysLoggedIn=false (require auth)
```

### New Logic

```
IS_PLATFORM?
├─ false → alwaysLoggedIn=true (bypass auth)
└─ true  → NEXT_PUBLIC_ENABLE_MOCK_AUTH?
           ├─ true  → alwaysLoggedIn=true (bypass auth)
           └─ false → alwaysLoggedIn=false (require auth)
```

---

## Mock Session Values Reference

| Field           | Value                  | Purpose                     |
| --------------- | ---------------------- | --------------------------- |
| `access_token`  | `'mock-access-token'`  | Identifiable in Network tab |
| `refresh_token` | `'mock-refresh-token'` | Prevents undefined errors   |
| `expires_at`    | `now + 3600s`          | Valid for 1 hour            |
| `expires_in`    | `3600`                 | 1 hour in seconds           |
| `token_type`    | `'bearer'`             | Standard auth type          |
| `user.email`    | `'admin@ogelbase.com'` | Recognizable admin user     |
| `user.id`       | `'mock-user-id'`       | Consistent user ID          |
| `user.role`     | `'authenticated'`      | Standard auth role          |
| `user.aud`      | `'authenticated'`      | Supabase audience           |

---

## Environment Variable Logic

### Truth Table

| IS_PLATFORM | ENABLE_MOCK_AUTH | alwaysLoggedIn | Auth Required |
| ----------- | ---------------- | -------------- | ------------- |
| `false`     | any              | `true`         | ❌ No         |
| `true`      | `true`           | `true`         | ❌ No         |
| `true`      | `false`          | `false`        | ✅ Yes        |
| `true`      | undefined        | `false`        | ✅ Yes        |

---

## Code Comments Rationale

### In auth.tsx

```typescript
// Check if mock auth is enabled for platform mode
const enableMockAuth = IS_PLATFORM && process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true'
```

**Why**: Clear intent - mock auth is platform-specific feature

```typescript
// For platform mode with mock auth enabled, use alwaysLoggedIn to bypass real auth
// The AuthProviderInternal will use its DEFAULT_SESSION when alwaysLoggedIn is true
const shouldBypassAuth = !IS_PLATFORM || enableMockAuth
```

**Why**: Explains the mechanism - how mock auth is achieved

---

## Testing Impact

### What Changed

- **Before**: Platform mode always required real GoTrue authentication
- **After**: Platform mode can optionally use mock authentication

### What Stayed The Same

- Self-hosted mode behavior unchanged
- Real auth flows unchanged when mock disabled
- Session hook interfaces unchanged
- Component auth checks unchanged

---

## Breaking Changes

**None** - This is purely additive functionality controlled by environment variable.

---

## Rollback Procedure

If issues arise:

1. **Quick rollback** (no code changes):

   ```bash
   # In .env.local
   NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
   ```

2. **Full rollback** (git revert):
   ```bash
   git diff HEAD~1 apps/studio/lib/auth.tsx
   git diff HEAD~1 packages/common/auth.tsx
   git diff HEAD~1 apps/studio/.env.local
   # Review changes, then revert if needed
   ```

---

## Performance Impact

**Negligible**:

- Single environment variable check on mount
- No additional API calls
- No render performance impact

---

## Security Considerations

### Safe Because:

- Only works with explicit environment variable
- Disabled by default in production
- Clear visual indication (admin@ogelbase.com email)
- No production credentials exposed

### Dangerous If:

- ❌ Enabled in production environment
- ❌ Used with real user data
- ❌ Deployed to public URL

---

## Maintenance Notes

### When Modifying:

- Keep mock auth logic in `AuthProvider` component
- Don't scatter mock auth checks across codebase
- Maintain DEFAULT_SESSION in single location
- Update documentation when changing behavior

### When Upgrading:

- Check if Supabase changes Session interface
- Verify DEFAULT_SESSION matches latest types
- Test that alwaysLoggedIn prop still works
- Update mock email domain if rebranding

---

## Related Documentation

- Full implementation: `MOCK_AUTH_IMPLEMENTATION.md`
- Quick reference: `../MOCK_AUTH_QUICK_REFERENCE.md`
- Test script: `test-mock-auth.js`
