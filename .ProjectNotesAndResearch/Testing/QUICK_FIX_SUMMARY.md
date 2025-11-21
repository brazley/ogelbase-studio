# Platform Mode Toolbar Menu Fix - Quick Summary

## The Problem

Toolbar menus (Organization dropdown, Project dropdown) are stuck showing shimmer loaders forever and never populate with data from your Railway database.

## Root Cause

When `IS_PLATFORM=true`, the app requires **real GoTrue authentication**. Without it:

- `useIsLoggedIn()` returns `false`
- Profile query is disabled
- All other queries (organizations, projects) are disabled because they require `profile !== undefined`
- UI components stuck in loading state forever

## The Solution (5 minutes)

### 1. Edit Profile Query File

**File:** `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/data/profile/profile-query.ts`

**Find the `getProfile` function and replace it with:**

```typescript
export async function getProfile(signal?: AbortSignal) {
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH !== 'false'

  if (IS_PLATFORM && !requireAuth) {
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

### 2. Add Environment Variable

**File:** `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/.env.production`

**Add this line:**

```bash
NEXT_PUBLIC_REQUIRE_AUTH=false
```

**File:** `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/.env`

**Add this line:**

```bash
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres
```

### 3. Restart Dev Server

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/studio
npm run dev
```

### 4. Test

Open http://localhost:8082 and verify:

- ✅ Organization dropdown shows "test-org"
- ✅ Project dropdown shows "test-proj"
- ✅ Can click dropdowns and see full lists
- ✅ Can navigate to /org/test-org
- ✅ Can navigate to /project/test-proj

## What This Does

- Returns a mock profile immediately (bypasses auth)
- Enables all queries to run
- Queries fetch real data from Railway database via platform APIs
- UI components receive data and render properly

## Files Changed

1. `/apps/studio/data/profile/profile-query.ts` - Add mock profile logic
2. `/apps/studio/.env.production` - Add `NEXT_PUBLIC_REQUIRE_AUTH=false`
3. `/apps/studio/.env` - Add `DATABASE_URL`

## More Details

See these files for complete documentation:

- `PLATFORM_DEBUG_REPORT.md` - Full analysis and explanation
- `PLATFORM_FIX_IMPLEMENTATION.md` - Detailed implementation guide
- `PLATFORM_FLOW_DIAGRAM.md` - Visual diagrams of the issue and fix

## Rollback

If something goes wrong:

```bash
git checkout apps/studio/data/profile/profile-query.ts
```

Remove the `NEXT_PUBLIC_REQUIRE_AUTH` line from `.env.production` and restart.

---

**Time to implement:** 5 minutes
**Risk level:** Low (easily reversible)
**Impact:** High (unlocks all platform UI features)
