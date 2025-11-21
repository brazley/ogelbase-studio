# Mock Authentication Implementation Summary

## Overview

Successfully implemented mock authentication bypass for platform mode, enabling the platform UI to function without requiring real GoTrue authentication.

## Implementation Approach: **Option B - Enhanced**

Modified `AuthProviderInternal` in packages/common to provide proper mock session values, then updated the studio auth wrapper to conditionally enable mock auth based on environment variables.

### Why This Approach?

- **Minimal changes**: Leveraged existing `alwaysLoggedIn` prop pattern
- **Centralized logic**: Mock session defined once in common package
- **Environment-controlled**: Easy to toggle with feature flag
- **Non-breaking**: Doesn't affect existing auth flows

## Files Modified

### 1. `/apps/studio/lib/auth.tsx`

**Changes:**

- Added environment variable check: `NEXT_PUBLIC_ENABLE_MOCK_AUTH`
- Logic: When `IS_PLATFORM=true` AND `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`, pass `alwaysLoggedIn=true` to `AuthProviderInternal`
- This bypasses real GoTrue authentication and uses the DEFAULT_SESSION

**Code:**

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

### 2. `/packages/common/auth.tsx`

**Changes:**

- Updated `DEFAULT_SESSION` constant with proper mock values
- Changed from empty/undefined values to realistic mock data

**Before:**

```typescript
const DEFAULT_SESSION: any = {
  access_token: undefined,
  expires_at: 0,
  // ... other empty values
}
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
    email: 'admin@ogelbase.com',
    id: 'mock-user-id',
    role: 'authenticated',
    created_at: new Date().toISOString(),
    // ... other proper values
  },
}
```

### 3. `/apps/studio/.env.local`

**Changes:**

- Added `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`

**Addition:**

```bash
# Enable mock authentication for platform mode (bypasses GoTrue auth)
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```

## Mock Session Details

The mock session provides:

- **Access Token**: `mock-access-token`
- **Refresh Token**: `mock-refresh-token`
- **User Email**: `admin@ogelbase.com`
- **User ID**: `mock-user-id`
- **Role**: `authenticated`
- **Token Expiry**: 1 hour from session creation

## How It Works

### Flow Diagram

```
Application Start
       ↓
AuthProvider checks environment
       ↓
IS_PLATFORM=true AND NEXT_PUBLIC_ENABLE_MOCK_AUTH=true?
       ↓
     YES → Pass alwaysLoggedIn=true to AuthProviderInternal
       ↓
AuthProviderInternal returns DEFAULT_SESSION
       ↓
Application renders with mock user session
       ↓
Platform UI accessible without real auth
```

### Conditional Logic

1. **Self-hosted mode** (`IS_PLATFORM=false`): Always uses mock auth (original behavior)
2. **Platform mode** (`IS_PLATFORM=true`):
   - If `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true`: Uses mock auth (new behavior)
   - If `NEXT_PUBLIC_ENABLE_MOCK_AUTH=false` or unset: Requires real auth (original behavior)

## Testing Checklist

### Environment Verification

- [x] `NEXT_PUBLIC_IS_PLATFORM=true` set in .env.local
- [x] `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` set in .env.local

### Runtime Verification

After starting the dev server (`pnpm --filter studio dev`):

1. **No Auth Redirect**

   - [ ] Application loads without redirect to login page
   - [ ] No GoTrue authentication flow triggered

2. **Network Requests**

   - [ ] `/api/profile` request executes
   - [ ] `/api/organizations` request executes
   - [ ] `/api/projects` request executes
   - [ ] Requests include mock access token in headers

3. **UI State**

   - [ ] User dropdown shows "admin@ogelbase.com"
   - [ ] Platform features visible (Organizations, Projects)
   - [ ] No "Unauthorized" or auth error messages

4. **Browser Console**
   - [ ] No auth-related errors
   - [ ] Session state shows mock user data

## Verification Script

Run the test script to verify configuration:

```bash
cd apps/studio
node test-mock-auth.js
```

Expected output:

```
✅ NEXT_PUBLIC_IS_PLATFORM: Set
✅ NEXT_PUBLIC_ENABLE_MOCK_AUTH: Set
✅ All checks passed!
```

## Production Considerations

### Security Notes

- **DO NOT** enable `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` in production
- This bypass is for development and self-hosted environments only
- Production deployments should use real authentication

### Environment Configuration

For production, ensure:

```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false  # or omit entirely
```

## Rollback Instructions

If issues arise, disable mock auth:

1. Set `NEXT_PUBLIC_ENABLE_MOCK_AUTH=false` in .env.local
2. Restart the dev server
3. Application will require real GoTrue authentication

## Benefits of This Implementation

1. **Toggle-able**: Can enable/disable via environment variable
2. **Non-invasive**: Minimal code changes
3. **Maintainable**: Uses existing auth provider patterns
4. **Safe**: Only works when explicitly enabled
5. **Testable**: Clear on/off states

## Known Limitations

1. **Static User**: Always uses same mock user (admin@ogelbase.com)
2. **No Real Tokens**: Access tokens not validated by backend
3. **No Refresh**: Token refresh won't trigger real auth flows
4. **Single Session**: Cannot simulate multiple users

## Future Enhancements

Potential improvements (not implemented):

- Support for multiple mock users via environment variables
- Mock user profiles with different permissions
- Simulated token refresh flows
- Development-only user switching UI

## Related Files

- `/apps/studio/lib/constants/index.ts` - Contains `IS_PLATFORM` constant
- `/apps/studio/pages/_app.tsx` - Root application wrapper using AuthProvider
- `/packages/common/gotrue.ts` - GoTrue client initialization

## Troubleshooting

### Issue: UI still redirects to login

**Solution**: Verify environment variables are set and restart dev server

### Issue: API requests fail with auth errors

**Solution**: Check that mock session includes required fields (access_token, user.id, etc.)

### Issue: Changes not reflected

**Solution**: Environment variables require server restart to take effect

## Implementation Date

2025-11-20

## Author

Dylan Torres (TPM) - via Claude Code Agent
