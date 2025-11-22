# Organization Switcher E2E Test Report

## Executive Summary

**Test File**: `apps/studio/tests/e2e/org-switching.spec.ts`
**Test Count**: 8 infrastructure tests
**Coverage**: Organization context switching, data isolation, session management, cache consistency
**Infrastructure Grade**: Production-ready with explicit failure mode detection

## Test Architecture

This E2E test suite validates **infrastructure-level behavior**, not just UI flows. Each test targets a specific infrastructure concern that can cascade into production incidents if missed.

### Test Strategy: Infrastructure First

Unlike basic UI tests, these tests assume the following infrastructure stack:

```
User Input (UI)
    → Route Handler (Middleware validates org_id from URL)
    → Session Validation (Auth middleware confirms token)
    → Query Filtering (API layer filters by organization_id)
    → Cache Layer (Keys include org_id to prevent poisoning)
    → Response (Data isolation boundary)
```

**Each test validates one layer of this stack.**

---

## Test Coverage Map

### TEST 1: UI State Synchronization
**File**: Lines 130-167
**Infrastructure Concern**: Route middleware and component state management
**What it validates**:
- URL route parameter extracted correctly
- DOM reflects correct organization
- Form control (switcher) maintains selected value

**Failure Mode**:
- Stale DOM state (component not re-rendering)
- Route middleware not executing
- Form state desynchronized from actual org context

**Why It Matters**: Users see wrong org name but requests go to correct org = security issue + confusion

---

### TEST 2: Session Persistence
**File**: Lines 178-208
**Infrastructure Concern**: Auth middleware and token management
**What it validates**:
- Auth token not invalidated on org context change
- Session not corrupted by org switch
- User identity remains consistent

**Failure Mode**:
- Token cleared after org switch → all subsequent API calls get 401
- Session ID changes → loses authentication state
- User context lost → requests sent as unauthenticated

**Why It Matters**: This is a P0 infrastructure bug. After switching orgs, user gets logged out invisibly in the browser but can't interact with API

**Test Data**:
```
Before switch: auth_token = "eyJ0eXAi..."
After switch:  auth_token = "eyJ0eXAi..." (MUST BE IDENTICAL)
```

---

### TEST 3: Data Isolation (CRITICAL)
**File**: Lines 219-277
**Infrastructure Concern**: Query filtering, caching, API contract
**What it validates**:
- API returns only data matching target organization
- No cross-org data leakage
- Response schema includes required fields
- Project counts match expected values

**Failure Mode**:
- Cache poisoning: Acme data cached with key "projects", retrieved as Contoso projects
- Missing query filter: API returns all orgs' projects without filtering
- Stale response: Old Contoso request's response returned after switch to Acme

**Why It Matters**:
- **SECURITY BOUNDARY**: User should not see competitor's data
- Example: User sees Acme's database credentials while viewing Contoso
- This is a P0 security incident

**Infrastructure Requirements**:
1. API must filter at database layer: `WHERE organization_id = $1`
2. Cache keys must include org_id: `projects::contoso-id` not `projects`
3. Route parameters must extract org_id: `/org/contoso` → `org_id = contoso-id`

**Validation Checkpoints**:
```
Before Switch (Acme):
- acmeProjects[0].organization_id = "acme-id"
- acmeProjects.length = 3

After Switch (Contoso):
- contosoProjects[0].organization_id = "contoso-id"
- contosoProjects.length = 5
- No acmeProjects[*].organization_id = "acme-id" (CRITICAL CHECK)
```

---

### TEST 4: Route Parameter Propagation
**File**: Lines 288-305
**Infrastructure Concern**: Request construction and middleware ordering
**What it validates**:
- org_id parameter included in API request URLs
- Route parameters correctly extracted and passed to API layer
- Query string validation

**Failure Mode**:
- org_id parameter missing from API call → API returns all data
- Wrong org_id in parameter → returns wrong org's data
- Parameter extracted from wrong location → middleware bypass

**Why It Matters**: Middleware assumes route parameters are correctly propagated. If this layer fails, query filtering never happens

**Example Valid URLs**:
```
/api/platform/projects?org_id=contoso-id
/api/platform/projects?organization_id=contoso-id
/api/platform/projects/contoso-id/list
```

---

### TEST 5: Cache Invalidation
**File**: Lines 316-337
**Infrastructure Concern**: Cache lifecycle management
**What it validates**:
- Cache entries cleared when switching organizations
- Subsequent data loads are cache misses (fresh from API)
- No stale cache entries served

**Failure Mode**:
- Acme projects cached with key "projects"
- Switch to Contoso
- Retrieves "projects" from cache → gets Acme data
- User sees Acme projects but thinks they're in Contoso

**Why It Matters**: Cache bugs are insidious because they:
1. Pass initial tests (first org load works)
2. Fail silently on switch (wrong data served from cache)
3. Intermittent in production (depends on cache hit rate)

**Cache Validation**:
```
Before: window.__CACHE_STATS__ = { hits: 5, misses: 2 }
After switch: window.__CACHE_STATS__ = { hits: 5, misses: 3 } ← Increment indicates fresh fetch
```

---

### TEST 6: Reload Persistence
**File**: Lines 348-371
**Infrastructure Concern**: State persistence across navigation
**What it validates**:
- Org context persists in storage (localStorage or sessionStorage)
- Route parameters preserved on page reload
- Session not lost on hard refresh

**Failure Mode**:
- User switches to Contoso, reloads page
- App defaults back to Acme (stored state not read)
- User thinks they were logged out but weren't

**Why It Matters**: Deep linking and browser back button reliability depend on this

**Test Sequence**:
```
1. Switch to Contoso → switcher shows "contoso-id"
2. Reload page → waitForURL /org/contoso
3. Assert switcher still shows "contoso-id" after reload
```

---

### TEST 7: Rapid Switching (Race Conditions)
**File**: Lines 382-409
**Infrastructure Concern**: Race condition handling, request cancellation
**What it validates**:
- Rapid org switches don't cause state corruption
- Orphaned requests from previous org don't corrupt current state
- Final state correct even after multiple rapid changes

**Failure Mode**:
- User rapidly switches: Acme → Contoso → Acme → Contoso
- Request 2 (for Acme) responds after Request 3 (for Contoso)
- Old Acme data displayed in Contoso context
- Form shows Contoso selected but displays Acme data

**Why It Matters**:
- Network latency varies; slower requests can overtake faster ones
- This is a classic race condition that manifests as flaky tests in CI

**Test Pattern**:
```
Switch 1: selectOption → /org/contoso (200ms latency)
Switch 2: selectOption → /org/acme (50ms latency) ← Finishes first
Switch 3: selectOption → /org/contoso (200ms latency) ← Finishes last

Must assert final state is contoso, not corrupted by race
```

---

### TEST 8: Error Handling
**File**: Lines 420-440
**Infrastructure Concern**: Graceful degradation and error states
**What it validates**:
- API errors don't crash the switcher
- UI remains functional even if org data fails to load
- Error states are properly handled

**Failure Mode**:
- API call fails with 500
- UI shows "Something went wrong" and freezes
- User can't click switcher to try different org
- Page becomes unresponsive

**Why It Matters**: Production resilience. Network blips shouldn't break the entire org switcher

---

## Infrastructure Requirements Checklist

For these tests to pass, the application must:

### Authentication Layer
- [ ] Session token persists across org context changes
- [ ] User identity not cleared on org switch
- [ ] Auth header includes token in all API requests

### Route Middleware
- [ ] Extract org_id from URL path: `/org/{slug}`
- [ ] Make org_id available to API handlers
- [ ] Validate org_id against user's accessible orgs

### API Layer
- [ ] **CRITICAL**: All queries filter by organization_id at database layer
- [ ] `SELECT * FROM projects WHERE organization_id = $1`
- [ ] Query parameters validated before execution
- [ ] Responses include organization_id field for validation

### Cache Layer
- [ ] Cache keys include organization_id
- [ ] Cache invalidated when org_id changes
- [ ] No shared cache entries between organizations
- [ ] Cache expiration headers set correctly

### State Management (Frontend)
- [ ] Org ID stored in URL (source of truth)
- [ ] Org ID stored in session/local storage (for persistence)
- [ ] State updates atomic (not partial org ID updates)
- [ ] Component re-renders on org change

---

## Failure Mode Library

### 1. Data Isolation Violation
**Error Message**: "Found 3 items from wrong organization"
**Root Causes**:
- Missing WHERE clause in database query
- Cache key doesn't include org_id
- Middleware not extracting org_id from route
- API response includes wrong data

**Debugging Steps**:
1. Check database query in projects API endpoint
2. Inspect network tab for org_id parameter in request
3. Compare response data before/after cache implementation
4. Verify middleware layer is executing

---

### 2. Token Invalidation
**Error Message**: "Token should not change on org switch"
**Root Causes**:
- Auth middleware clearing token on org change
- Session cookie not marked as org-agnostic
- Token validation tied to specific org

**Debugging Steps**:
1. Check if auth middleware calls logout() on org change
2. Inspect token format (should be org-agnostic)
3. Verify session storage keys don't include org_id
4. Check auth provider configuration

---

### 3. Stale Cache
**Error Message**: "Cache should be invalidated on org switch"
**Root Causes**:
- No cache invalidation on org context change
- Cache keys don't include org_id
- Middleware not triggering cache clear

**Debugging Steps**:
1. Search for cache.clear() or cache.invalidate() calls
2. Verify cache is using org_id in keys
3. Check if org switch triggers cache clear event
4. Inspect cache headers in network responses

---

### 4. Route Parameter Loss
**Error Message**: "Switcher shows value but requests go to different org"
**Root Causes**:
- Route param extracted but not passed to API
- Query filtering using different org source (user profile org vs. URL)
- Middleware not making org_id available to handlers

**Debugging Steps**:
1. Log route parameters at middleware layer
2. Verify API receives org_id parameter
3. Check for hardcoded org IDs in API calls
4. Inspect request/response in network tab

---

## Running These Tests

### Prerequisites
- Playwright installed: `npm install --save-dev @playwright/test`
- Test database seeded with org data
- Dev server running: `pnpm dev`
- Test users and orgs created

### Command
```bash
pnpm test:e2e -- org-switching.spec.ts
```

### With Debug Output
```bash
pnpm test:e2e -- org-switching.spec.ts --debug --headed
```

### With Trace (for forensics)
```bash
PLAYWRIGHT_TRACE=on pnpm test:e2e -- org-switching.spec.ts
```

---

## Performance Baselines

Expected latencies (adjust based on your infrastructure):

| Operation | Expected | Warning | Critical |
|-----------|----------|---------|----------|
| UI Click to Route Change | < 100ms | > 300ms | > 1000ms |
| Route Change to Data Load | < 500ms | > 1500ms | > 3000ms |
| Total Org Switch Time | < 600ms | > 2000ms | > 4000ms |

Slow switches indicate:
- Middleware bottlenecks
- Unoptimized queries
- Cache invalidation overhead
- Network latency (use slow network test)

---

## Integration with CI/CD

### Pipeline Configuration
```yaml
- name: Run Org Switching Tests
  run: pnpm test:e2e -- org-switching.spec.ts
  env:
    CI: true  # Forces sequential execution, catches race conditions
    PLAYWRIGHT_BASE_URL: https://staging.app.com

- name: Check Infrastructure Violations
  run: |
    if grep -q "Data isolation violation" test-results/*.txt; then
      echo "SECURITY: Data isolation violation detected"
      exit 1
    fi
```

### Alerting Rules
Alert if:
1. **Data isolation test fails** (P0 - Security)
2. **Session persistence test fails** (P1 - Auth broken)
3. **Any test times out** (indicates middleware slowness)
4. **Cache invalidation test fails** (P1 - Stale data risk)

---

## Test Data Requirements

### Organizations
```sql
INSERT INTO organizations (id, slug, name, created_at)
VALUES
  ('acme-id', 'acme', 'Acme Corp', now()),
  ('contoso-id', 'contoso', 'Contoso Inc', now());
```

### Projects (per org)
```sql
-- Acme: 3 projects
INSERT INTO projects (id, name, organization_id, created_at)
VALUES
  ('acme-proj-1', 'Project A', 'acme-id', now()),
  ('acme-proj-2', 'Project B', 'acme-id', now()),
  ('acme-proj-3', 'Project C', 'acme-id', now());

-- Contoso: 5 projects
INSERT INTO projects (id, name, organization_id, created_at)
VALUES
  ('contoso-proj-1', 'Project 1', 'contoso-id', now()),
  ('contoso-proj-2', 'Project 2', 'contoso-id', now()),
  ('contoso-proj-3', 'Project 3', 'contoso-id', now()),
  ('contoso-proj-4', 'Project 4', 'contoso-id', now()),
  ('contoso-proj-5', 'Project 5', 'contoso-id', now());
```

### User Access
```sql
INSERT INTO organization_members (user_id, organization_id, role, created_at)
VALUES
  ('test-user-id', 'acme-id', 'owner', now()),
  ('test-user-id', 'contoso-id', 'owner', now());
```

---

## Known Limitations

1. **Cache Monitor**: Assumes application exposes `window.__CACHE_STATS__` for monitoring. If not present, cache test will skip validation.

2. **Error Handling**: Test assumes graceful error handling. If API failures crash the app, error handling test will fail correctly.

3. **Network Simulation**: Race condition test uses fast execution but can't perfectly simulate network race conditions. Use Playwright's network throttling in CI for more realistic testing.

---

## Success Criteria

All 8 tests must pass before deploying org switcher changes:

✅ UI State Synchronization
✅ Session Persistence
✅ Data Isolation (CRITICAL)
✅ Route Parameter Propagation
✅ Cache Invalidation
✅ Reload Persistence
✅ Rapid Switching
✅ Error Handling

**Zero tolerance for data isolation violations** (test 3). This is a security boundary.

---

## Future Improvements

1. **Load Testing**: Measure throughput of org switches under load
2. **Chaos Engineering**: Simulate API latency/failures during switch
3. **Audit Logging**: Verify org switches logged for compliance
4. **Permission Validation**: Test that users can only switch to accessible orgs
5. **Analytics**: Measure org switch usage patterns and performance in production

---

## Test Ownership

**Primary Owner**: Infrastructure/QA Team
**Code Owner**: Backend (API layer), Frontend (state management)
**On-Call**: Platform team (monitors for data isolation violations)

Contact: infrastructure-qa@company.com

