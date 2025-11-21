# Quick Start Testing Guide
## Run Final Integration Tests

### Prerequisites

1. **Node.js 18+** (for native fetch support)
2. **Railway deployment running** OR **local dev server**
3. **Database migrations applied**

### Quick Test Execution

#### Option 1: Test Against Local Development Server

```bash
# 1. Start dev server (in one terminal)
cd apps/studio
pnpm dev

# 2. Run tests (in another terminal)
node apps/studio/test-final-integration.js http://localhost:3000
```

#### Option 2: Test Against Railway Production

```bash
# Run tests directly against Railway
node apps/studio/test-final-integration.js https://studio-production-cfcd.up.railway.app
```

### What Gets Tested

The comprehensive test suite validates:

**✅ Authentication Flow (10 tests)**
- User signup (3 users: Alice, Bob, Carol)
- User signin with credentials
- Token refresh mechanics
- Invalid credential rejection
- Protected route enforcement

**✅ Organization Management (7 tests)**
- Create organizations for User A and User B
- View organization details
- List organizations (filtered by membership)
- Cross-user access denial (User B cannot see User A's org)
- Update organization settings

**✅ Project Management (10 tests)**
- Create projects within organizations
- Multi-project support
- View project details
- Update compute configuration
- Update disk configuration
- List projects (filtered by membership)
- Cross-user project isolation

**✅ Team Management (9 tests)**
- Invite members to organization
- Role-based access control (developer, admin, owner)
- Role escalation testing
- Member listing
- Self-removal prevention
- Self-role-change prevention

**✅ Audit Logging (8 tests)**
- Verify all critical actions logged
- Filter logs by action type
- Cross-user log isolation
- Log visibility enforcement

**✅ Profile Integration (9 tests)**
- Profile data accuracy
- Organization membership display
- Role display
- Membership-based filtering

**✅ Permission Edge Cases (5 tests)**
- Read-only member restrictions
- Access revocation after removal

**✅ Session Cleanup (4 tests)**
- Signout functionality
- Token invalidation
- Post-signout access denial

### Expected Output

```
╔════════════════════════════════════════════════════════════════════╗
║                  FINAL INTEGRATION TEST SUITE                      ║
║                  TICKET-20: Complete E2E                          ║
╚════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUITE 1: Authentication Flow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ User A signup successful
  ✓ User B signup successful
  ✓ User C signup successful
  ✓ User A signin successful
  ✓ User B signin successful
  ✓ User C signin successful
  ✓ Token refresh successful
  ✓ Invalid credentials correctly rejected
  ✓ Protected route requires authentication
  ✓ Protected route accessible with valid token

[... continues for all 8 suites ...]

═══════════════════════════════════════════════════════════════════════
FINAL TEST SUMMARY
═══════════════════════════════════════════════════════════════════════

Overall Results:
  Total Tests:   62
  Passed:        62
  Failed:        0
  Coverage:      100%

Production Readiness Assessment:
  ✓ READY FOR PRODUCTION
  ✓ All critical flows validated
  ✓ Multi-tenancy enforced
  ✓ Permissions working correctly
  ✓ Audit logging operational

═══════════════════════════════════════════════════════════════════════
```

### Individual Test Suites

You can also run individual test components:

```bash
# Auth flow only
node apps/studio/test-auth-flow.js http://localhost:3000

# Project access control only
node apps/studio/test-project-access-control.js

# Platform API diagnostics
node apps/studio/test-platform-apis.js
```

### Troubleshooting

#### Server Not Running
```bash
Error: Server not responding

Solution:
1. Check dev server is running on port 3000
2. Or use Railway URL instead
```

#### Database Connection Issues
```bash
Error: DATABASE_ERROR

Solution:
1. Check DATABASE_URL in .env.local
2. Verify database migrations applied
3. Check pg-meta service is running
```

#### Authentication Failures
```bash
Error: 401 Unauthorized

Solution:
1. Check SUPABASE_JWT_SECRET matches
2. Verify auth endpoints exist
3. Check session table exists
```

### Test Data Cleanup

After testing, you may want to clean up test data:

```sql
-- Connect to your database
psql $DATABASE_URL

-- Clean up test users (be careful in production!)
DELETE FROM platform.users WHERE email LIKE '%@example.com';

-- Clean up test sessions
DELETE FROM platform.sessions WHERE expires_at < NOW();

-- Clean up test audit logs (optional - keep for historical record)
-- DELETE FROM platform.audit_logs WHERE created_at > '2025-11-21' AND created_at < '2025-11-22';
```

### Continuous Integration

To run tests in CI/CD:

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run integration tests
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          node apps/studio/test-final-integration.js http://localhost:3000
```

### Performance Benchmarking

To capture performance metrics:

```bash
# Run tests with timing
time node apps/studio/test-final-integration.js http://localhost:3000

# Or use hyperfine for detailed benchmarks
hyperfine --warmup 1 'node apps/studio/test-final-integration.js http://localhost:3000'
```

### Next Steps

After successful testing:

1. ✅ Review test report: `FINAL-INTEGRATION-TEST-REPORT.md`
2. ✅ Address any issues found
3. ✅ Run load tests (100+ concurrent users)
4. ✅ Perform security audit
5. ✅ Deploy to production

---

**Need Help?**

- Check test logs for detailed error messages
- Review API endpoint implementations
- Verify database schema matches expected structure
- Consult `FINAL-INTEGRATION-TEST-REPORT.md` for detailed test results
