# Organization Switcher E2E Tests - Quick Start

**TL;DR**: 8 infrastructure tests for org switching. Run them locally before deploying Marcus's UI changes.

---

## One-Minute Setup

```bash
# 1. Make sure test DB has org data (see below)
# 2. Start dev server
pnpm dev

# 3. In another terminal, run tests
pnpm test:e2e -- org-switching.spec.ts
```

Expected: All 8 tests pass in ~15-20 seconds.

---

## Test Data (One-Time Setup)

```sql
-- Paste into your test database

INSERT INTO organizations (id, slug, name, created_at) VALUES
  ('acme-id', 'acme', 'Acme Corp', now()),
  ('contoso-id', 'contoso', 'Contoso Inc', now());

INSERT INTO projects (id, name, organization_id, created_at) VALUES
  ('acme-proj-1', 'Project A', 'acme-id', now()),
  ('acme-proj-2', 'Project B', 'acme-id', now()),
  ('acme-proj-3', 'Project C', 'acme-id', now()),
  ('contoso-proj-1', 'Project 1', 'contoso-id', now()),
  ('contoso-proj-2', 'Project 2', 'contoso-id', now()),
  ('contoso-proj-3', 'Project 3', 'contoso-id', now()),
  ('contoso-proj-4', 'Project 4', 'contoso-id', now()),
  ('contoso-proj-5', 'Project 5', 'contoso-id', now());

INSERT INTO organization_members (user_id, organization_id, role, created_at) VALUES
  ('test-user-id', 'acme-id', 'owner', now()),
  ('test-user-id', 'contoso-id', 'owner', now());
```

---

## UI Implementation Checklist (For Marcus)

Your org switcher needs these elements:

```html
<!-- Dropdown control -->
<select class="org-switcher" data-testid="org-switcher">
  <option value="acme-id">Acme Corp</option>
  <option value="contoso-id">Contoso Inc</option>
</select>

<!-- Organization name display -->
<div data-testid="org-name">Acme Corp</div>

<!-- Projects list -->
<div data-testid="projects-tab">Projects</div>
<div data-testid="project-item">Project A</div>
```

When user selects org:
1. URL should change to `/org/{slug}` (e.g., `/org/contoso`)
2. Projects list should update with new org's projects
3. Org name should update

---

## Tests at a Glance

| # | Test Name | What It Validates | Fails If |
|---|-----------|-------------------|----------|
| 1 | UI State | Org switcher updates correctly | DOM doesn't re-render |
| 2 | Session | Auth token doesn't change | Token cleared on switch |
| **3** | **Data Isolation** | **No cross-org data leak** | **User sees competitor data** |
| 4 | Route Params | org_id in API calls | org_id parameter missing |
| 5 | Cache | Cache cleared on switch | Stale data served |
| 6 | Reload | Org persists after refresh | Reset to default org |
| 7 | Rapid Switches | No data corruption | Race conditions |
| 8 | Errors | Graceful error handling | App crashes on API error |

**Test 3 is CRITICAL** (P0 security). Zero tolerance for failures.

---

## Running Tests Locally

### All Tests
```bash
pnpm test:e2e -- org-switching.spec.ts
```

### One Specific Test
```bash
pnpm test:e2e -- org-switching.spec.ts -g "data isolation"
```

### With Browser Open (Debugging)
```bash
pnpm test:e2e -- org-switching.spec.ts --headed
```

### With Full Debug
```bash
pnpm test:e2e -- org-switching.spec.ts --debug --headed
```

### With Network Trace (for failures)
```bash
PLAYWRIGHT_TRACE=on pnpm test:e2e -- org-switching.spec.ts
```

---

## Test Failures - Quick Fixes

### "Data isolation violation"
**Problem**: User can see other org's data
**Check**: Does backend query filter by organization_id?
```sql
-- Correct:
SELECT * FROM projects WHERE organization_id = $1

-- Wrong:
SELECT * FROM projects
```

### "Token should not change"
**Problem**: Auth token cleared when switching orgs
**Check**: Auth middleware not calling logout() on org change

### "Cache should be invalidated"
**Problem**: Stale cache returned after org switch
**Check**: Cache keys include org_id?
```javascript
// Correct: cache.get("projects:contoso-id")
// Wrong:  cache.get("projects")
```

### "URL should contain correct org slug"
**Problem**: Route doesn't change when selecting org
**Check**: Org switcher click triggers navigation to `/org/{slug}`

---

## Before Deploying

1. Run tests locally: `pnpm test:e2e -- org-switching.spec.ts`
2. All 8 should pass
3. No console errors
4. Try these manual scenarios:
   - Switch org, projects update
   - Reload page, still in same org
   - Browser back button works
   - Can't see other org's data (data isolation check)

---

## File Locations

- **Tests**: `/apps/studio/tests/e2e/org-switching.spec.ts`
- **Test Helpers**: `/apps/studio/tests/e2e/fixtures/org-test-helpers.ts`
- **Technical Docs**: `/apps/studio/tests/e2e/ORG-SWITCHING-TEST-REPORT.md`
- **QA Checklist**: `/apps/studio/tests/e2e/ORG-SWITCHING-QA-CHECKLIST.md`
- **Delivery Summary**: `/ORG-SWITCHER-E2E-DELIVERY.md`

---

## Infrastructure Requirements

For tests to pass, you need:

### Backend
- [ ] org_id parameter in API requests
- [ ] WHERE organization_id = $1 in all queries
- [ ] organization_id field in API responses
- [ ] Cache keys include org_id

### Frontend
- [ ] URL route: /org/{slug}
- [ ] Org switcher updates route on select
- [ ] Session/local storage persists org_id
- [ ] Components re-render on org change

### Database
- [ ] organizations table with test data
- [ ] projects table with org_id foreign key
- [ ] organization_members for user access

---

## Success Criteria

All 8 tests pass:
```
✅ should switch organizations and update UI state
✅ should persist authentication session across org switches
✅ should enforce org isolation in API responses
✅ should propagate org context through route parameters
✅ should invalidate cache when switching organizations
✅ should persist org context after page reload
✅ should handle rapid organization switches without data corruption
✅ should handle API failures during org switch gracefully
```

---

## Q&A

**Q: How long do tests take?**
A: ~15-20 seconds total for all 8 tests

**Q: Do I need to be online?**
A: No, runs locally. Just needs dev server running on localhost:3000

**Q: What if a test times out?**
A: Indicates route change or API response too slow. Check middleware/query performance.

**Q: Why so many tests for org switching?**
A: Org switching touches auth, routing, caching, queries - all critical infrastructure layers.

**Q: Can I run tests in parallel?**
A: Yes, they're isolated. Playwright runs them in parallel by default.

**Q: What do I do if Test 3 (Data Isolation) fails?**
A: STOP. This is a security issue. Check if backend filters by organization_id in queries.

---

## Need Help?

- **Test Details**: Read `/ORG-SWITCHING-TEST-REPORT.md`
- **Full Checklist**: See `/ORG-SWITCHING-QA-CHECKLIST.md`
- **Delivery Summary**: Check `/ORG-SWITCHER-E2E-DELIVERY.md`
- **Code Questions**: Look at test file comments (476 lines, well-commented)

---

**Created**: 2025-01-15
**For**: Marcus (UI) + QA Team
**Status**: Ready to use
