# Organization Switcher QA Checklist

**For**: Marcus (UI implementation) + QA Team
**Purpose**: Pre-deployment validation of org switching feature
**Risk Level**: HIGH - Touches auth, data isolation, multi-org architecture

---

## Phase 1: Infrastructure Validation (Before UI Testing)

### Backend API Layer
- [ ] Verify projects API filters by organization_id
  - Run: `SELECT * FROM projects WHERE organization_id = $1`
  - Confirm query filters at database layer (not application layer)

- [ ] Verify route middleware extracts org_id from URL
  - Test URL: `/org/acme/projects`
  - Confirm middleware sets `req.orgId = 'acme'` or similar

- [ ] Verify all API endpoints include organization_id in response
  - Endpoint: GET `/api/platform/projects`
  - Confirm response includes `{ organization_id: "acme-id", ... }`

- [ ] Test API rejects requests without valid org_id
  - Test: Call API without org_id parameter
  - Expected: 400 Bad Request or 403 Forbidden

- [ ] Verify cache keys include organization_id
  - Check cache implementation for `cache_key = f"projects:{org_id}:{user_id}"`
  - Confirm no shared cache across orgs

### Frontend State Layer
- [ ] Verify URL is source of truth for org context
  - Test: Navigate directly to `/org/contoso/projects`
  - Confirm page loads with Contoso data (not default org)

- [ ] Verify org_id stored in session/local storage
  - Open DevTools → Storage → Session/Local
  - Confirm key like `current_org_id` with value `contoso-id`

- [ ] Verify auth token persists on org change
  - Note token value before switch
  - Switch org
  - Confirm token value hasn't changed

- [ ] Verify component re-renders on org change
  - Use React DevTools Profiler
  - Confirm org-dependent components re-render on switch

---

## Phase 2: Manual QA Testing (Before Automation)

### Scenario 1: Basic Org Switch
```
Steps:
1. Login with test user
2. Navigate to org switcher dropdown
3. Select second organization
4. Wait for page to load

Validations:
□ URL changes to /org/contoso
□ Organization name updates in header
□ Projects list refreshes with new org's projects
□ No console errors
□ Network tab shows org_id parameter in API calls
```

### Scenario 2: Deep Link to Org
```
Steps:
1. Open URL directly: /org/contoso/projects
2. Don't navigate via switcher, go directly

Validations:
□ Page loads with correct org
□ Org switcher shows contoso selected
□ Projects list is for Contoso (not default org)
□ Auth still works (no 401)
```

### Scenario 3: Hard Refresh
```
Steps:
1. Switch to org/contoso
2. Press F5 (hard refresh)
3. Wait for page to reload

Validations:
□ Still in /org/contoso after reload
□ Switcher still shows contoso selected
□ No redirect to default org
□ Session still valid
```

### Scenario 4: Browser Back Button
```
Steps:
1. Start: /org/acme/projects
2. Switch to /org/contoso/projects
3. Click browser back button
4. Click browser forward button

Validations:
□ Back button returns to /org/acme
□ Forward button returns to /org/contoso
□ Data loads correctly for each org
□ No 404 or redirect loops
```

### Scenario 5: Rapid Switching
```
Steps:
1. Click org switcher
2. Select org/contoso
3. Immediately click switcher again
4. Select org/acme
5. Immediately click switcher again
6. Select org/contoso
7. Wait for load

Validations:
□ Final state shows contoso selected
□ Projects list shows contoso projects (not acme)
□ No data corruption or mixed data
□ No orphaned requests in network tab
```

### Scenario 6: Switch During Loading
```
Steps:
1. Click org switcher to contoso
2. BEFORE projects load, click to acme
3. Wait for acme projects to load

Validations:
□ Final display shows acme projects
□ No contoso projects displayed
□ Network shows acme request cancelled or ignored
□ No console errors
```

### Scenario 7: Auth Token Expiry
```
Steps:
1. Switch to org/contoso
2. Wait 5 minutes (or trigger token expiry)
3. Try to interact with data
4. Verify re-auth flow

Validations:
□ If token expired: Redirect to login or token refresh
□ If token refreshed: Continue working in contoso context
□ No mixed org context in re-auth
□ Org selection preserved after re-auth
```

### Scenario 8: No Access to Org
```
Prerequisites: User with access to org/acme but NOT org/contoso
Steps:
1. Login with restricted user
2. Try to navigate to /org/contoso
3. Try to select contoso in switcher

Validations:
□ Cannot navigate to forbidden org
□ Switcher doesn't show contoso as option
□ 403 Forbidden error if forced URL access
□ Remains in accessible org (acme)
```

---

## Phase 3: Automated Test Execution

### Run E2E Tests
```bash
# Full test suite
pnpm test:e2e -- org-switching.spec.ts

# Specific test
pnpm test:e2e -- org-switching.spec.ts -g "should switch organizations"

# With debugging
pnpm test:e2e -- org-switching.spec.ts --debug --headed

# With trace for failures
PLAYWRIGHT_TRACE=on pnpm test:e2e -- org-switching.spec.ts
```

### Expected Results
```
✅ should switch organizations and update UI state
✅ should persist authentication session across org switches
✅ should enforce org isolation in API responses  [CRITICAL]
✅ should propagate org context through route parameters
✅ should invalidate cache when switching organizations
✅ should persist org context after page reload
✅ should handle rapid organization switches without data corruption
✅ should handle API failures during org switch gracefully

Total: 8 tests, 0 failures, ~45-60 seconds runtime
```

### Test Failure Response
If any test fails, follow this decision tree:

```
Test: "should enforce org isolation in API responses"
│
├─ FAIL: "Data isolation violation: Found 3 items from wrong organization"
│ └─ Action: CHECK BACKEND
│    - Verify projects query has WHERE organization_id = $1
│    - Verify API response includes organization_id field
│    - Check cache keys include org_id
│    - Priority: P0 (SECURITY)
│
├─ FAIL: "Token should not change on org switch"
│ └─ Action: CHECK AUTH MIDDLEWARE
│    - Verify logout() not called on org change
│    - Verify session tokens org-agnostic
│    - Priority: P1 (AUTH BROKEN)
│
├─ FAIL: "Cache should be invalidated on org switch"
│ └─ Action: CHECK CACHE LAYER
│    - Verify cache.clear() called on org switch
│    - Verify cache keys include org_id
│    - Priority: P1 (STALE DATA)
│
└─ FAIL: "Timeout waiting for URL change"
  └─ Action: CHECK ROUTE MIDDLEWARE
     - Verify route params extracted correctly
     - Add console.log for debugging
     - Priority: P1 (ROUTING)
```

---

## Phase 4: Performance Validation

### Latency Measurements
Target baselines (adjust for your infrastructure):

```
Operation                        Target     Warning    Alert
─────────────────────────────────────────────────────────────
Select org in dropdown          < 50ms      > 200ms    > 500ms
URL route change                < 100ms     > 300ms    > 1000ms
API call + response             < 500ms     > 1500ms   > 3000ms
Projects grid render            < 200ms     > 500ms    > 2000ms
Total org switch time           < 600ms     > 2000ms   > 4000ms
```

### Load Testing
```bash
# If you have load testing setup
siege -f /path/to/org_switch_urls.txt -c 10 -r 5

# Expected: No 500 errors, < 1% failure rate
# Alert: If any 500 errors or > 5% failure
```

### Measure with Chrome DevTools
1. Open DevTools Performance tab
2. Start recording
3. Click org switcher
4. Select new org
5. Wait for projects to load
6. Stop recording
7. Check timeline for:
   - JavaScript execution time (< 100ms)
   - Network requests (< 500ms)
   - Rendering time (< 200ms)

---

## Phase 5: Security Review

### Data Isolation
- [ ] Can user see other org's projects? (Should be NO)
- [ ] Can user see other org's team members? (Should be NO)
- [ ] Can user see other org's billing info? (Should be NO)
- [ ] Can user see other org's API keys? (Should be NO)
- [ ] Can user modify other org's resources? (Should be NO)

### Session Security
- [ ] Token valid after org switch? (Should be YES)
- [ ] Token expires normally (not cleared on org switch)? (Should be YES)
- [ ] Is org_id verified against user's accessible orgs? (Should be YES)
- [ ] Can user force org_id in URL to access forbidden org? (Should be NO - 403)

### CSRF/XSS
- [ ] Are API requests validated (not relying on client org_id)? (Should be YES)
- [ ] Is org_id parameter validated server-side? (Should be YES)
- [ ] Are API responses sanitized? (Should be YES)

---

## Phase 6: Accessibility & Browser Compatibility

### Accessibility
- [ ] Org switcher keyboard accessible (Tab, Enter)?
- [ ] Dropdown announces org change to screen readers?
- [ ] Form labels present and associated?
- [ ] Focus management correct after switch?

### Browser Compatibility
Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Responsive
- [ ] Org switcher responsive on mobile?
- [ ] Touch interactions work?
- [ ] Projects list responsive?

---

## Phase 7: Regression Testing

### Existing Functionality Not Broken
- [ ] Login/logout still works
- [ ] Protected routes still require auth
- [ ] Projects CRUD operations still work
- [ ] Team management still works
- [ ] Settings page still works
- [ ] Billing page still works

### No Console Errors
```bash
# Check browser console for any errors
# Command in DevTools console:
console.log("Filter: ERROR")
```
Expected: No "Uncaught Error", "TypeError", "ReferenceError"

---

## Phase 8: Documentation & Handoff

### For Developers
- [ ] Code comments explain org context propagation
- [ ] API documentation updated with org_id requirements
- [ ] Middleware documentation explains org_id extraction
- [ ] Cache invalidation strategy documented

### For Support/Ops
- [ ] Runbook created for "User sees wrong org data"
- [ ] Metrics dashboard shows org switch latency
- [ ] Alerts configured for data isolation violations
- [ ] Logging includes org_id for debugging

### For Product
- [ ] Feature flag created (org_switcher_enabled)
- [ ] Rollout strategy defined (% based)
- [ ] Usage analytics tracked
- [ ] Support team trained on org switching feature

---

## Sign-Off Checklist

**Feature Ready for Deployment When**:

```
All Phase 1 checks: ✅ PASS
All Phase 2 manual scenarios: ✅ PASS
All Phase 3 E2E tests: ✅ PASS
All Phase 4 performance baselines: ✅ MET
All Phase 5 security reviews: ✅ PASS
All Phase 6 accessibility/browser: ✅ PASS
All Phase 7 regression tests: ✅ PASS
All Phase 8 documentation: ✅ COMPLETE
```

**Sign-Off**:
- [ ] QA: _____________________ Date: ________
- [ ] Backend Lead: _________ Date: ________
- [ ] Frontend Lead (Marcus): _________ Date: ________
- [ ] Product Manager: _____ Date: ________

---

## Post-Deployment Monitoring

### First Week Alerts
- Data isolation violations detected
- Org switch latency > 3000ms
- 401 errors after org switch
- Cache invalidation failures
- User complaints about wrong org data

### Metrics to Track
1. Org switches per day
2. Avg org switch latency (target < 600ms)
3. Errors per org switch attempt
4. User engagement in each org
5. Cache hit rate by org

### Rollback Criteria
Rollback immediately if:
- Data isolation violation detected
- Users seeing other org's data
- Auth broken after org switch (sudden 401s)
- Performance degradation (> 2x baseline)

---

## Contact & Escalation

**Feature Owner**: Marcus (UI Implementation)
**Backend Support**: [Backend team]
**QA Lead**: [QA team]
**On-Call Infrastructure**: [Infrastructure team]

**Critical Issues**:
- Page: infrastructure-team
- Slack: #platform-incidents
- Email: on-call@company.com

---

## Version History

| Date | Version | Status | Notes |
|------|---------|--------|-------|
| 2025-01-15 | 1.0 | Draft | Initial checklist created |
| | | | |

