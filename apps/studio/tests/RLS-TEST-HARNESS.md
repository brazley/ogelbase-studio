# RLS Test Harness - Migration 007 Validation

**Status**: Ready for deployment
**Created**: 2025-11-22
**Purpose**: Validate restrictive RLS policies from Migration 007 work correctly in isolation and under load

## Overview

This test harness provides comprehensive validation of PostgreSQL row-level security (RLS) policies that enforce multi-tenant isolation at the database layer. It covers:

- **Policy Enforcement**: Verify that RLS policies correctly block unauthorized access
- **Session Context Management**: Validate session variable setting and clearing
- **Role-Based Access Control**: Test permission hierarchies (owner/admin/member)
- **Multi-Tenant Isolation**: Ensure users can only see data from their organizations
- **Performance Impact**: Measure overhead and ensure < 2x slowdown
- **System User Context**: Validate admin/migration bypass mechanism

## Files

### Test Helper: `rls-test-helper.ts`

Provides utilities for managing RLS session context. Functions:

```typescript
// Set both user and org context
await setRLSContext(userId, orgId)

// Set user context only
await setUserIdContext(userId)

// Set org context only
await setOrgIdContext(orgId)

// Clear all context
await clearRLSContext()

// Get current context
const context = await getRLSContext()

// Set system user (for admin/migration operations)
await setSystemUserContext()

// Check if system user
const isSystem = await isSystemUserContext()

// Execute query with context (auto-cleanup)
const results = await queryWithContext(userId, orgId, { query: '...' })

// Execute query without context (validate blocking)
const results = await queryWithoutContext({ query: '...' })

// Get session context as JSON (debugging)
const info = await getSessionContextInfo()

// Callback-based context management
await withRLSContext(userId, orgId, async () => {
  // Code here runs within RLS context
})

// Validate context is set (throws if not)
await requireRLSContext()
```

**Key Design**: Helper functions automatically manage context cleanup to prevent test pollution.

### Policy Tests: `rls-policies.test.ts`

Comprehensive test suite with 30+ test cases covering:

#### 1. Session Context Management
- ✅ Clear context when none is set
- ✅ Set and retrieve user/org context
- ✅ Get session context as JSON
- ✅ Clear context when requested
- ✅ Support system user context

#### 2. Organization Policies
- ✅ Org owners see their organizations
- ✅ Block users from seeing other organizations
- ✅ Block queries without RLS context (no data leak)
- ✅ Allow org owners to update organization
- ✅ Block members from updating organization

#### 3. Project Policies
- ✅ Users see projects in their organizations
- ✅ Block users from seeing projects in other organizations
- ✅ Block cross-org project queries
- ✅ Allow org admins to create projects
- ✅ Block members from creating projects

#### 4. Role-Based Access Control
- ✅ Grant admin privileges to admins
- ✅ Deny insufficient roles
- ✅ Allow users to see organization memberships
- ✅ Role hierarchy enforcement (owner > admin > member)

#### 5. Multi-Tenant Isolation
- ✅ Users are isolated by organization context
- ✅ Context switching maintains isolation
- ✅ Block cross-tenant data access via different contexts

#### 6. Session Variable Requirements
- ✅ Empty result without user context
- ✅ Require context for user-scoped queries
- ✅ System user bypasses RLS

#### 7. Helper Functions
- ✅ Check org membership correctly
- ✅ Deny membership for non-members
- ✅ Check org roles correctly

### Performance Benchmarks: `rls-performance.bench.ts`

Measures performance impact of RLS policies:

#### SELECT Query Performance
- Simple SELECT without RLS
- Simple SELECT with RLS context
- JOIN queries (multiple tables)
- Indexed queries (with WHERE clause)
- COUNT aggregations

#### Policy Evaluation Overhead
- Baseline vs RLS overhead comparison
- Helper function call costs
- Role checking (with hierarchy logic)

#### Complex Queries
- Deep JOINs (3+ tables)
- Subqueries with RLS
- Multi-condition WHERE clauses

#### Write Operations
- INSERT with policy evaluation
- UPDATE with policy evaluation

#### Context Switching
- User context switch cost
- Clearing context cost

#### Load Testing
- Sustained query load (10 second test)
- Success rate monitoring
- QPS calculation

**Target Metrics**:
- RLS overhead: < 2x baseline
- Mean query time: < 100ms
- Helper function calls: < 50ms
- Indexed queries: < 50ms

## Running the Tests

### Prerequisites

1. Migration 007 session helpers applied:
```sql
-- Check if helpers exist
SELECT EXISTS (
  SELECT 1 FROM pg_proc
  WHERE proname = 'get_current_user_id'
    AND pronamespace = 'platform'::regnamespace
);
```

2. Environment variables set:
```bash
DATABASE_URL=postgres://user:pass@host/db
PG_META_URL=http://localhost:3000/pg-meta
```

### Run All Tests

```bash
npm test -- tests/rls-*.test.ts
```

### Run Specific Test Suite

```bash
# Organization policies only
npm test -- tests/rls-policies.test.ts -t "Organization Policies"

# Role-based access control
npm test -- tests/rls-policies.test.ts -t "Role-Based Access Control"

# Multi-tenant isolation
npm test -- tests/rls-policies.test.ts -t "Multi-Tenant Isolation"
```

### Run Performance Benchmarks

```bash
# All benchmarks
npm test -- tests/rls-performance.bench.ts

# Specific benchmark
npm test -- tests/rls-performance.bench.ts -t "SELECT Query Performance"

# Load test
npm test -- tests/rls-performance.bench.ts -t "Load Testing"
```

### Run with Verbose Output

```bash
npm test -- tests/rls-policies.test.ts --verbose
```

## Test Architecture

### Test Data Setup

Each test creates deterministic test data:

```
Organizations:
  org1 (id: 10000000-...-0001)
  org2 (id: 20000000-...-0002)
  org3 (id: 30000000-...-0003)

Users:
  user1 → owner of org1
  user2 → member of org1
  user3 → owner of org2
  user4 → admin of org2, member of org3

Projects:
  project1_org1 → in org1
  project2_org1 → in org1
  project1_org2 → in org2
  project1_org3 → in org3
```

### Context Isolation

All tests use `afterEach()` to clear RLS context, preventing cross-test pollution:

```typescript
afterEach(async () => {
  await clearRLSContext()
})
```

### Error Handling

Tests expect RLS violations to either:
1. Return empty result set (no rows visible)
2. Throw permission error (depending on policy implementation)

Example:
```typescript
const result = await queryWithContext(user1, org1, {
  query: 'SELECT * FROM organizations WHERE id = $1',
  parameters: [org2_id] // org2_id not accessible to user1
})

expect(result).toHaveLength(0) // RLS blocks access
```

## Integration with Application Code

### Middleware Integration

The application middleware must call `setRLSContext()` on every request:

```typescript
// In middleware (e.g., `/pages/api/...`)
export async function withRLSContext(userId: string, orgId: string, fn: Function) {
  await setRLSContext(userId, orgId)
  try {
    return await fn()
  } finally {
    await clearRLSContext()
  }
}

// Usage in API route
export default async function handler(req, res) {
  const user = await getAuthenticatedUser(req)
  const org = await getActiveOrg(user.id)

  await withRLSContext(user.id, org.id, async () => {
    // All database queries here use RLS
    const projects = await queryPlatformDatabase({
      query: 'SELECT * FROM platform.projects',
    })
    res.json(projects)
  })
}
```

### System User Operations

For migrations and background jobs that need full database access:

```typescript
// Migration (needs to create records in all orgs)
async function runMigration() {
  await setSystemUserContext()
  try {
    // This query bypasses RLS and can access all data
    await queryPlatformDatabase({
      query: 'INSERT INTO platform.audit_logs ...',
    })
  } finally {
    await clearRLSContext()
  }
}
```

### Query Execution

All database queries automatically use the session context:

```typescript
// User queries (with RLS context set by middleware)
async function getUserProjects() {
  const result = await queryPlatformDatabase({
    query: 'SELECT * FROM platform.projects',
  })
  // RLS automatically filters to user's organization projects
  return result.data
}
```

## Security Validation

### What RLS Enforces

✅ **Organization Isolation**: Users see only their org's data
✅ **Role Hierarchy**: Enforce owner > admin > member permissions
✅ **Credential Protection**: Only admins+ can view sensitive credentials
✅ **Audit Trail**: Admin-only access to audit logs
✅ **User Privacy**: Users can only see their own profile

### What RLS Does NOT Enforce

❌ **Input Validation**: Application must validate user input
❌ **Authentication**: Application must authenticate users
❌ **API Rate Limiting**: Not database's responsibility
❌ **Encryption**: Use transparent data encryption (TDE) for that

**Critical**: RLS is Layer 3 security (database), not Layer 1 (API). Application must still:
- Authenticate users correctly
- Validate input before queries
- Implement rate limiting
- Log security events

## Troubleshooting

### Issue: "RLS context not set" Error

**Cause**: Query ran without calling `setRLSContext()`

**Solution**: Check middleware is running before database queries:
```typescript
// Wrong
export default async function handler(req, res) {
  const projects = await queryPlatformDatabase({ ... })
}

// Right
export default async function handler(req, res) {
  const user = await getAuthenticatedUser(req)
  await setRLSContext(user.id, user.active_org_id)
  const projects = await queryPlatformDatabase({ ... })
}
```

### Issue: "Permission Denied" Errors

**Cause**: User lacks required role for operation

**Solution**: Check role hierarchy is correct:
```typescript
// Role hierarchy (lower number = higher privilege)
// 1. owner (can do everything)
// 2. admin (manage org, except delete)
// 3. billing_admin (manage billing only)
// 4. developer (manage projects)
// 5. member (read-only)
```

### Issue: Tests Fail with "Context Already Set"

**Cause**: Previous test didn't clear context

**Solution**: Verify `afterEach()` is running:
```typescript
afterEach(async () => {
  await clearRLSContext()
})
```

### Issue: Performance Tests Show 5x+ Overhead

**Cause**: Policies with inefficient subqueries or missing indexes

**Solution**: Check for N+1 queries:
```sql
-- Bad: subquery in policy for every row
CREATE POLICY "check_membership" ON orgs
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_id = id
    AND user_id = current_user_id()
))

-- Good: use indexed helper function
CREATE POLICY "check_membership" ON orgs
USING (user_is_org_member(id))
```

## Success Criteria

All test cases must pass:

- [ ] Session context management tests (5 tests)
- [ ] Organization policy tests (5 tests)
- [ ] Project policy tests (5 tests)
- [ ] Role-based access control tests (3 tests)
- [ ] Multi-tenant isolation tests (2 tests)
- [ ] Session variable requirement tests (2 tests)
- [ ] System user context tests (2 tests)
- [ ] Helper function tests (3 tests)
- [ ] Performance overhead < 2x (critical)
- [ ] No cross-tenant data leaks

## Next Steps

1. **Apply Session Helpers**: Ensure Migration 007 session helpers are applied
2. **Run Test Suite**: Execute all tests to baseline current behavior
3. **Integration Test**: Add RLS context to one API endpoint, verify tests still pass
4. **Load Test**: Run performance benchmarks on staging
5. **Gradual Rollout**: Enable RLS context on endpoints incrementally
6. **Monitor Production**: Track RLS policy evaluation metrics post-deployment

## References

- Migration 007: `/apps/studio/database/migrations/007_restrictive_rls_policies.sql`
- Session Helpers: `/apps/studio/database/migrations/007_session_helpers.sql`
- PostgreSQL RLS Docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Platform Database API: `/apps/studio/lib/api/platform/database.ts`

## Questions?

Contact Sergei Ivanov (PostgreSQL internals specialist) for RLS policy tuning or performance questions.
