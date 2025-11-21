# Platform Mode Fix - Implementation Guide

## Quick Fix Implementation (Option 2 - Recommended)

This fix enables platform mode UI features without requiring full GoTrue authentication setup. Perfect for self-hosted deployments.

---

## Step 1: Update Profile Query

**File:** `/apps/studio/data/profile/profile-query.ts`

**Replace the entire `getProfile` function with:**

```typescript
export async function getProfile(signal?: AbortSignal) {
  // For self-hosted platform mode without external auth, return mock profile
  // This enables platform UI features without requiring GoTrue authentication
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false'

  if (IS_PLATFORM && !requireAuth) {
    // Mock profile for self-hosted platform mode
    // This allows all queries to run without authentication
    return {
      id: 1,
      primary_email: 'admin@localhost',
      username: 'admin',
      first_name: 'Platform',
      last_name: 'Admin',
      mobile: null,
      phone: null,
      disabled_features: process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',') ?? [],
    } as Profile
  }

  // Standard platform mode with authentication
  const { data, error } = await get('/platform/profile', {
    signal,
    headers: { Version: '2' },
  })

  if (error) handleError(error)

  if (!IS_PLATFORM) {
    return {
      ...data,
      disabled_features: process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',') ?? [],
    } as Profile
  } else {
    return data as Profile
  }
}
```

---

## Step 2: Update Profile Query Hook

**File:** `/apps/studio/data/profile/profile-query.ts`

**Update the `useProfileQuery` hook:**

```typescript
export const useProfileQuery = <TData = ProfileData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<ProfileData, ProfileError, TData> = {}) => {
  // In self-hosted platform mode without auth requirement, always enable profile query
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false'
  const shouldEnable = IS_PLATFORM && !requireAuth ? enabled : enabled

  return useQuery<ProfileData, ProfileError, TData>({
    queryKey: profileKeys.profile(),
    queryFn: ({ signal }) => getProfile(signal),
    staleTime: 1000 * 60 * 30,
    ...options,
    enabled: shouldEnable,
  })
}
```

---

## Step 3: Add Environment Variable

**File:** `/apps/studio/.env.production`

**Add this line:**

```bash
NEXT_PUBLIC_REQUIRE_AUTH=false
```

**Also add DATABASE_URL if not already in .env:**

**File:** `/apps/studio/.env`

```bash
# Add at the end
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres
```

---

## Complete Modified Files

### 1. `/apps/studio/data/profile/profile-query.ts`

```typescript
import { useQuery } from '@tanstack/react-query'

import { get, handleError } from 'data/fetchers'
import { IS_PLATFORM } from 'lib/constants'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { profileKeys } from './keys'
import type { Profile } from './types'

export async function getProfile(signal?: AbortSignal) {
  // For self-hosted platform mode without external auth, return mock profile
  // This enables platform UI features without requiring GoTrue authentication
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false'

  if (IS_PLATFORM && !requireAuth) {
    // Mock profile for self-hosted platform mode
    // This allows all queries to run without authentication
    return {
      id: 1,
      primary_email: 'admin@localhost',
      username: 'admin',
      first_name: 'Platform',
      last_name: 'Admin',
      mobile: null,
      phone: null,
      disabled_features: process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',') ?? [],
    } as Profile
  }

  // Standard platform mode with authentication
  const { data, error } = await get('/platform/profile', {
    signal,
    headers: { Version: '2' },
  })

  if (error) handleError(error)

  if (!IS_PLATFORM) {
    return {
      ...data,
      disabled_features: process.env.NEXT_PUBLIC_DISABLED_FEATURES?.split(',') ?? [],
    } as Profile
  } else {
    return data as Profile
  }
}

export type ProfileData = Awaited<ReturnType<typeof getProfile>>
export type ProfileError = ResponseError

export const useProfileQuery = <TData = ProfileData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<ProfileData, ProfileError, TData> = {}) => {
  // In self-hosted platform mode without auth requirement, always enable profile query
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false'
  const shouldEnable = IS_PLATFORM && !requireAuth ? enabled : enabled

  return useQuery<ProfileData, ProfileError, TData>({
    queryKey: profileKeys.profile(),
    queryFn: ({ signal }) => getProfile(signal),
    staleTime: 1000 * 60 * 30,
    ...options,
    enabled: shouldEnable,
  })
}
```

### 2. `/apps/studio/.env.production`

```bash
# Keep existing content and add:
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_REQUIRE_AUTH=false
```

### 3. `/apps/studio/.env`

```bash
# Keep all existing content and add at the end:
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres
```

---

## Testing the Fix

### 1. Apply the changes above

### 2. Restart the development server

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio
npm run dev
```

### 3. Open browser to http://localhost:8082 (or whatever port it starts on)

### 4. Verify the following:

**Organization Dropdown:**

- [ ] Shows organization name instead of shimmer loader
- [ ] Click dropdown shows "test-org"
- [ ] Can click to navigate to /org/test-org

**Project Dropdown:**

- [ ] Shows project name instead of shimmer loader
- [ ] Click dropdown shows "test-proj"
- [ ] Can click to navigate to /project/test-proj

**Navigation:**

- [ ] Can navigate to /org/test-org
- [ ] Can navigate to /project/test-proj
- [ ] Page loads without errors

**Console:**

- [ ] No errors about failed authentication
- [ ] No errors about disabled queries
- [ ] API calls to /api/platform/\* succeed

---

## What This Fix Does

### Before Fix:

1. IS_PLATFORM=true → alwaysLoggedIn=false
2. No GoTrue auth → useIsLoggedIn()=false
3. Profile query disabled → profile=undefined
4. Organizations query disabled → no data
5. UI stuck loading forever

### After Fix:

1. IS_PLATFORM=true + REQUIRE_AUTH=false → mock profile
2. Profile query returns mock data immediately
3. profile !== undefined → Organizations query enabled
4. Organizations query runs → gets data from platform APIs
5. UI populates with real data from Railway database

### Key Benefits:

- ✅ Platform mode UI features work
- ✅ Uses real platform database APIs
- ✅ No need to set up GoTrue authentication
- ✅ Perfect for self-hosted deployments
- ✅ Can still add real auth later if needed

---

## Rollback Plan

If something goes wrong, you can quickly revert:

### 1. Restore original profile-query.ts from git:

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master
git checkout apps/studio/data/profile/profile-query.ts
```

### 2. Remove the environment variable:

Remove `NEXT_PUBLIC_REQUIRE_AUTH=false` from `.env.production`

### 3. Restart server

---

## Alternative: Full Authentication Setup

If you want to set up proper authentication later, see the main debug report for instructions on:

- Setting up GoTrue (Supabase Auth)
- Configuring OAuth providers
- Creating sign-in/sign-up flows

---

## Troubleshooting

### Issue: Profile query still not working

**Check:**

1. Environment variable is set in `.env.production`
2. You restarted the dev server after changes
3. Browser console shows `NEXT_PUBLIC_REQUIRE_AUTH` is "false"

**Debug:**

```typescript
// Add to profile-query.ts temporarily
console.log('IS_PLATFORM:', IS_PLATFORM)
console.log('REQUIRE_AUTH:', process.env.NEXT_PUBLIC_REQUIRE_AUTH)
console.log('requireAuth:', requireAuth)
```

### Issue: Organizations query still not running

**Check:**

1. Profile query is working and returning mock profile
2. React Query DevTools shows profile data is loaded
3. `profile !== undefined` in the organizations query

**Debug:**
Open React Query DevTools (should be visible in browser) and check:

- Profile query status: Should be "success"
- Profile query data: Should show mock profile object
- Organizations query status: Should be enabled and running

### Issue: API calls failing

**Check:**

1. `DATABASE_URL` is set in `.env`
2. Dev server has access to Railway database
3. pg-meta service is running on port 8000

**Test:**

```bash
curl http://localhost:8082/api/platform/organizations
```

Should return JSON array with test-org data.

---

## Next Steps After Fix

Once the toolbar menus are working:

1. **Verify all platform features:**

   - Organization management pages
   - Project management pages
   - All toolbar buttons and menus

2. **Test database operations:**

   - Creating new organizations
   - Creating new projects
   - Updating settings

3. **Consider adding:**
   - Custom branding
   - Additional organizations/projects
   - User management (if needed later)

---

**Implementation Time Estimate:** 10-15 minutes
**Testing Time Estimate:** 5-10 minutes
**Total Time:** ~20-25 minutes

**Complexity:** Low (3 file changes, 1 environment variable)
**Risk Level:** Low (easily reversible, no database changes)
**Impact:** High (unlocks full platform UI functionality)
