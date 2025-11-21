# Phase 3 & 4 Testing Guide

## Quick Test Commands

### Check Browser Console
After login, watch for:
```
[RouteValidation] Auto-selecting organization: {actual-slug}
```

### Check localStorage
```javascript
// In browser console
localStorage.getItem('supabase.dashboard.LAST_VISITED_ORGANIZATION')
// Should show actual org slug, not 'org-1'
```

### Check Current URL
After login, URL should be:
```
http://localhost:3000/org/{actual-slug}
// NOT http://localhost:3000/org/org-1
```

---

## Visual Test Checklist

### 1. Login Flow Test
- [ ] Clear browser cache and localStorage
- [ ] Login to application
- [ ] **Expected:** Redirects to `/org/{real-slug}` (e.g., `/org/ogelbase`)
- [ ] **Expected:** Organization name displays as "OgelBase" (not "Org 1")
- [ ] **Expected:** URL bar shows real slug

### 2. Organization Selector Test
- [ ] Click organization selector in sidebar
- [ ] **Expected:** Shows real organization name
- [ ] **Expected:** Organization icon/avatar correct
- [ ] **Expected:** Clicking org navigates to `/org/{real-slug}`

### 3. Last Visited Persistence Test
- [ ] Login and land on org A
- [ ] Switch to org B
- [ ] Logout
- [ ] Login again
- [ ] **Expected:** Lands on org B (last visited)
- [ ] Check localStorage
- [ ] **Expected:** `LAST_VISITED_ORGANIZATION` = org B slug

### 4. Direct Navigation Test
- [ ] Navigate to `/org/{slug}/billing`
- [ ] **Expected:** Page loads without redirect
- [ ] Refresh page
- [ ] **Expected:** Stays on billing page
- [ ] **Expected:** No console errors

### 5. Invalid Org Test
- [ ] Navigate to `/org/nonexistent-slug`
- [ ] **Expected:** Error toast: "We couldn't find that organization"
- [ ] **Expected:** Redirects to valid org
- [ ] **Expected:** URL updates to valid slug

### 6. Empty Org Test (New User)
- [ ] Test with account that has no orgs
- [ ] **Expected:** Redirects to `/organizations`
- [ ] **Expected:** Shows "Create Organization" screen

### 7. Multiple Orgs Test
- [ ] Account with 3+ organizations
- [ ] Login
- [ ] **Expected:** Lands on last visited OR first in list
- [ ] Switch between orgs
- [ ] **Expected:** URL updates correctly
- [ ] Refresh
- [ ] **Expected:** Stays on current org

### 8. Browser Refresh Test
- [ ] Navigate to any page: `/org/{slug}/settings`
- [ ] Press F5 (refresh)
- [ ] **Expected:** Page reloads, no redirect
- [ ] **Expected:** Organization context maintained
- [ ] **Expected:** No duplicate API calls

---

## Console Debugging Commands

### Check Current Organizations
```javascript
// In browser console
JSON.parse(localStorage.getItem('REACT_QUERY_OFFLINE_CACHE'))
```

### Monitor Router State
```javascript
// Add to RouteValidationWrapper temporarily
console.log({
  pathname: router.pathname,
  slug,
  isLoggedIn,
  orgsInitialized,
  organizationsCount: organizations?.length,
  firstOrgSlug: organizations?.[0]?.slug,
  lastVisited: lastVisitedOrganization
})
```

### Force Redirect Test
```javascript
// In browser console
window.location.href = 'http://localhost:3000/'
// Watch for auto-redirect to org
```

---

## Expected Behavior Summary

| Scenario | Before (Broken) | After (Fixed) |
|----------|-----------------|---------------|
| Login | Redirects to `/org/org-1` | Redirects to `/org/{real-slug}` |
| Org Name | Shows "Org 1" | Shows "OgelBase" (real name) |
| URL | Hardcoded `org-1` | Dynamic `{actual-slug}` |
| Last Visited | Not remembered | Persists in localStorage |
| No Orgs | Crashes | Redirects to `/organizations` |
| Invalid Slug | No error | Toast + redirect |

---

## Red Flags to Watch For

❌ **URL still shows `/org/org-1`**
- Check: Is `IS_PLATFORM` true?
- Check: Are organizations loading?
- Check: Console logs for errors

❌ **Infinite redirect loop**
- Check: `router.pathname === '/'` condition
- Check: `slug` is being set correctly
- Watch console for repeated redirects

❌ **"Org 1" still displays**
- Check: Organization query data
- Check: Database has correct org name
- Verify: Selector component using right data

❌ **localStorage not updating**
- Check: `setLastVisitedOrganization` being called
- Check: Browser allows localStorage
- Verify: localStorage key is correct

---

## Performance Checks

### React DevTools
- [ ] No unnecessary re-renders
- [ ] Organizations query cached properly
- [ ] useEffect dependencies correct

### Network Tab
- [ ] Organizations API called once on login
- [ ] No duplicate organization queries
- [ ] Proper cache headers

### Console
- [ ] No React warnings
- [ ] No useEffect dependency warnings
- [ ] Auto-selection log appears once

---

## Success Criteria

✅ **All URLs use real organization slugs**
✅ **No hardcoded `org-1` anywhere**
✅ **Last visited org remembered**
✅ **Auto-selection works on login**
✅ **Edge cases handled gracefully**
✅ **No navigation loops**
✅ **Performance remains good**

---

## Manual Test Script

Copy-paste this in browser console after each test:

```javascript
// Test Result Logger
const testResults = {
  loginFlow: false,
  orgSelector: false,
  lastVisited: false,
  directNav: false,
  invalidOrg: false,
  emptyOrg: false,
  multipleOrgs: false,
  refresh: false
};

// Check current state
console.log('=== PHASE 3/4 TEST STATUS ===');
console.log('Current URL:', window.location.href);
console.log('Last Visited Org:', localStorage.getItem('supabase.dashboard.LAST_VISITED_ORGANIZATION'));
console.log('Has org-1 in URL:', window.location.href.includes('org-1') ? '❌ FAIL' : '✅ PASS');
console.log('================');
```

---

## Rollback Testing

If you need to rollback:

```typescript
// Emergency rollback to safe state
const DEFAULT_HOME = IS_PLATFORM
  ? '/organizations'  // Safe: forces manual selection
  : '/project/default'

// Comment out Phase 4 useEffect
// Remove auto-selection logic
```

Test rollback works by:
1. Applying changes
2. Logging in
3. Verifying lands on `/organizations`
4. Manual org selection works

---

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Each should:
- ✅ localStorage works
- ✅ Redirects correctly
- ✅ No console errors

---

## Production Monitoring

After deployment, monitor:

1. **Analytics**
   - Time to first org selection
   - Org switching frequency
   - Failed org lookups

2. **Error Tracking**
   - Invalid slug attempts
   - localStorage failures
   - Redirect loops

3. **Performance**
   - Organization query timing
   - Page load impact
   - Client-side routing speed

---

## Quick Smoke Test (30 seconds)

1. Clear localStorage
2. Login
3. Check URL has real slug ✅
4. Check org name is correct ✅
5. Refresh page ✅
6. Switch orgs ✅
7. Logout and login ✅
8. Lands on last visited ✅

If all pass: **SHIP IT** 🚀
