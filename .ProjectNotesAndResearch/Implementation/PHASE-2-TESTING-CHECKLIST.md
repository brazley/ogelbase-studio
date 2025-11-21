# Phase 2: Multi-Tenant Authentication - Testing Checklist

## Pre-Testing Setup

### 1. Environment Configuration
- [ ] `DATABASE_URL` is set and points to Railway Postgres
- [ ] `SUPABASE_JWT_SECRET` is configured (matches GoTrue auth)
- [ ] Server is running on http://localhost:3000
- [ ] GoTrue auth is accessible at https://kong-production-80c6.up.railway.app/auth/v1

### 2. Database Verification
```sql
-- Verify test user exists
SELECT id, email FROM auth.users WHERE id = '50ae110f-99e5-4d64-badc-87f34d52b12d';

-- Verify organization exists
SELECT id, name, slug FROM platform.organizations WHERE id = '73a70e11-c354-4bee-bd86-a0a96a704cbe';

-- Verify user is linked to organization
SELECT * FROM platform.organization_members WHERE user_id = '50ae110f-99e5-4d64-badc-87f34d52b12d';

-- Verify projects exist
SELECT id, name, organization_id FROM platform.projects WHERE organization_id = '73a70e11-c354-4bee-bd86-a0a96a704cbe';
```

### 3. Get Valid JWT Token
```bash
# Login to get JWT token
curl -X POST https://kong-production-80c6.up.railway.app/auth/v1/token?grant_type=password \
  -H "Content-Type: application/json" \
  -H "apikey: <anon-key>" \
  -d '{
    "email": "test-1763663946@ogelbase.com",
    "password": "Test123!@#"
  }' | jq

# Save the access_token
export JWT_TOKEN="<access_token_from_response>"
```

## Functional Testing

### Test 1: Profile Endpoint - With Valid JWT

**Test Case:** User can access their own profile
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/profile | jq
```

**Expected Result:**
- [ ] HTTP Status: 200 OK
- [ ] Response contains user ID: `50ae110f-99e5-4d64-badc-87f34d52b12d`
- [ ] Response contains email: `test-1763663946@ogelbase.com`
- [ ] Response contains organizations array
- [ ] Organizations array contains only user's orgs
- [ ] Each organization has projects array
- [ ] No other users' data visible

**Success Criteria:**
```json
{
  "id": "50ae110f-99e5-4d64-badc-87f34d52b12d",
  "primary_email": "test-1763663946@ogelbase.com",
  "username": "test-1763663946",
  "first_name": "User",
  "last_name": "Name",
  "organizations": [...]
}
```

### Test 2: Profile Endpoint - Without JWT

**Test Case:** Unauthenticated request should fail
```bash
curl http://localhost:3000/api/platform/profile | jq
```

**Expected Result:**
- [ ] HTTP Status: 401 Unauthorized
- [ ] Response contains error message
- [ ] Error message: "Unauthorized: Invalid or missing authentication token"

**Success Criteria:**
```json
{
  "error": {
    "message": "Unauthorized: Invalid or missing authentication token"
  }
}
```

### Test 3: Profile Endpoint - Invalid JWT

**Test Case:** Invalid token should be rejected
```bash
curl -H "Authorization: Bearer invalid-token-here" \
  http://localhost:3000/api/platform/profile | jq
```

**Expected Result:**
- [ ] HTTP Status: 401 Unauthorized
- [ ] Response contains error message

### Test 4: Organizations Endpoint - With Valid JWT

**Test Case:** User can see only their organizations
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/organizations | jq
```

**Expected Result:**
- [ ] HTTP Status: 200 OK
- [ ] Response is an array
- [ ] Array contains only user's organizations
- [ ] test-org (73a70e11-c354-4bee-bd86-a0a96a704cbe) is present
- [ ] No other organizations visible

**Success Criteria:**
```json
[
  {
    "id": "73a70e11-c354-4bee-bd86-a0a96a704cbe",
    "name": "test-org",
    "slug": "test-org",
    "billing_email": "...",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### Test 5: Organizations Endpoint - Without JWT

**Test Case:** Unauthenticated request should fail
```bash
curl http://localhost:3000/api/platform/organizations | jq
```

**Expected Result:**
- [ ] HTTP Status: 401 Unauthorized
- [ ] Response contains error message

### Test 6: Projects Endpoint - With Valid JWT

**Test Case:** User can see only projects in their organizations
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/projects | jq
```

**Expected Result:**
- [ ] HTTP Status: 200 OK
- [ ] Response is an array
- [ ] Array contains only projects from user's organizations
- [ ] Each project has correct organization_id
- [ ] connectionString is properly formatted
- [ ] restUrl is present

### Test 7: Projects Endpoint - Without JWT

**Test Case:** Unauthenticated request should fail
```bash
curl http://localhost:3000/api/platform/projects | jq
```

**Expected Result:**
- [ ] HTTP Status: 401 Unauthorized
- [ ] Response contains error message

### Test 8: Expired Token

**Test Case:** Expired token should be rejected
```bash
# Use an expired JWT token
export EXPIRED_TOKEN="<expired-jwt-token>"
curl -H "Authorization: Bearer $EXPIRED_TOKEN" \
  http://localhost:3000/api/platform/profile | jq
```

**Expected Result:**
- [ ] HTTP Status: 401 Unauthorized
- [ ] Response contains error message

### Test 9: Wrong Token Format

**Test Case:** Malformed Authorization header should fail
```bash
# Missing "Bearer" prefix
curl -H "Authorization: $JWT_TOKEN" \
  http://localhost:3000/api/platform/profile | jq
```

**Expected Result:**
- [ ] HTTP Status: 401 Unauthorized
- [ ] Response contains error message

## Automated Testing

### Test 10: Automated Test Script

**Test Case:** Run automated test suite
```bash
node test-jwt-endpoints.js $JWT_TOKEN
```

**Expected Result:**
- [ ] Profile endpoint test passes (✅ SUCCESS)
- [ ] Organizations endpoint test passes (✅ SUCCESS)
- [ ] Projects endpoint test passes (✅ SUCCESS)
- [ ] No-auth test returns 401 (✅ SUCCESS)
- [ ] All tests completed without errors

## Security Testing

### Test 11: SQL Injection Attempt

**Test Case:** Malicious user_id should be rejected
```bash
# Try to inject SQL via JWT token (create a malicious token)
# This should fail at JWT validation stage
```

**Expected Result:**
- [ ] JWT validation rejects malicious tokens
- [ ] No SQL injection possible
- [ ] Database remains secure

### Test 12: Cross-User Data Access

**Test Case:** User A cannot access User B's data

**Steps:**
1. Create second test user
2. Get JWT token for User B
3. Try to access User A's organizations

**Expected Result:**
- [ ] User B only sees their own organizations
- [ ] User B only sees projects in their organizations
- [ ] No cross-user data leakage

### Test 13: Token Replay Attack

**Test Case:** Old/revoked tokens should not work
```bash
# Use a token from previous session
curl -H "Authorization: Bearer $OLD_TOKEN" \
  http://localhost:3000/api/platform/profile | jq
```

**Expected Result:**
- [ ] If token is expired, returns 401
- [ ] If token is valid, follows normal flow

### Test 14: Missing User_ID in Token

**Test Case:** Token without 'sub' claim should be rejected

**Expected Result:**
- [ ] JWT validation fails
- [ ] Returns 401 Unauthorized
- [ ] Error logged

### Test 15: Wrong Role in Token

**Test Case:** Token with role='anon' should be rejected

**Expected Result:**
- [ ] getUserIdFromJWT returns null
- [ ] Endpoint returns 401
- [ ] Only 'authenticated' role accepted

## Performance Testing

### Test 16: Response Time

**Test Case:** Endpoints should respond quickly
```bash
# Time the request
time curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/profile
```

**Expected Result:**
- [ ] Profile endpoint < 500ms
- [ ] Organizations endpoint < 300ms
- [ ] Projects endpoint < 500ms
- [ ] No N+1 query problems

### Test 17: Concurrent Requests

**Test Case:** Multiple simultaneous requests
```bash
# Run 10 concurrent requests
for i in {1..10}; do
  curl -H "Authorization: Bearer $JWT_TOKEN" \
    http://localhost:3000/api/platform/profile &
done
wait
```

**Expected Result:**
- [ ] All requests succeed
- [ ] No race conditions
- [ ] No data corruption
- [ ] Consistent results

### Test 18: Large Dataset

**Test Case:** User with many organizations/projects

**Steps:**
1. Create user with 50 organizations
2. Add 100 projects across organizations
3. Test all endpoints

**Expected Result:**
- [ ] All data returned correctly
- [ ] Response time acceptable
- [ ] No pagination issues (if applicable)

## Edge Cases

### Test 19: User with No Organizations

**Test Case:** User exists but has no organization memberships

**Steps:**
1. Create user in auth.users
2. Don't add to organization_members
3. Test endpoints

**Expected Result:**
- [ ] Profile returns user with empty organizations array
- [ ] Organizations endpoint returns empty array
- [ ] Projects endpoint returns empty array
- [ ] No errors

### Test 20: User with Organization but No Projects

**Test Case:** User in organization with no projects

**Expected Result:**
- [ ] Profile returns organization with empty projects array
- [ ] Organizations endpoint returns the organization
- [ ] Projects endpoint returns empty array

### Test 21: Deleted User

**Test Case:** JWT token for deleted user

**Steps:**
1. Get valid JWT token
2. Delete user from auth.users
3. Try to access endpoints

**Expected Result:**
- [ ] JWT still validates (token doesn't know user is deleted)
- [ ] Database query returns no user
- [ ] Returns 500 error with appropriate message

### Test 22: Very Long JWT Token

**Test Case:** Token with large payload

**Expected Result:**
- [ ] Token validates correctly if signature valid
- [ ] No buffer overflow issues
- [ ] Proper error handling

## Fallback Mode Testing

### Test 23: No JWT Secret Configured

**Test Case:** Test fallback mode (SUPABASE_JWT_SECRET not set)

**Steps:**
1. Unset SUPABASE_JWT_SECRET
2. Restart server
3. Test endpoints without JWT

**Expected Result:**
- [ ] Endpoints work without authentication
- [ ] Returns all organizations/projects
- [ ] Logs warning: "SUPABASE_JWT_SECRET not configured, using fallback mode"
- [ ] Should only be used for testing

### Test 24: No DATABASE_URL

**Test Case:** Test with no database connection

**Steps:**
1. Unset DATABASE_URL
2. Restart server
3. Test endpoints

**Expected Result:**
- [ ] Returns default/mock data
- [ ] No crashes
- [ ] Graceful fallback

## Integration Testing

### Test 25: Full User Flow

**Test Case:** Complete user journey

**Steps:**
1. User signs up via GoTrue
2. User gets JWT token
3. User accesses profile
4. User creates organization (Phase 3)
5. User creates project (Phase 3)
6. User accesses updated data

**Expected Result:**
- [ ] All steps work seamlessly
- [ ] Data properly isolated
- [ ] No authorization issues

### Test 26: Multi-User Scenario

**Test Case:** Multiple users in same organization

**Steps:**
1. Create 3 users
2. Add all to same organization with different roles
3. Each user accesses endpoints

**Expected Result:**
- [ ] All users see the same organization
- [ ] All users see same projects
- [ ] Each user sees their own profile
- [ ] Role-based permissions (Phase 3)

## Regression Testing

### Test 27: Existing Functionality

**Test Case:** Ensure no breaking changes

- [ ] Non-authenticated endpoints still work
- [ ] Other API routes unaffected
- [ ] Frontend can still access API
- [ ] Backward compatibility maintained

## Documentation Testing

### Test 28: Quick Reference Guide

**Test Case:** Follow quick reference guide

- [ ] All curl commands work as documented
- [ ] All examples produce expected results
- [ ] No typos or errors in documentation

### Test 29: Test Script Works

**Test Case:** Test script runs successfully

- [ ] Script is executable
- [ ] All test cases pass
- [ ] Output is clear and helpful

## Test Results Summary

Date: _______________
Tester: _______________

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Profile with JWT | ⬜ Pass / ⬜ Fail | |
| 2 | Profile without JWT | ⬜ Pass / ⬜ Fail | |
| 3 | Profile invalid JWT | ⬜ Pass / ⬜ Fail | |
| 4 | Organizations with JWT | ⬜ Pass / ⬜ Fail | |
| 5 | Organizations without JWT | ⬜ Pass / ⬜ Fail | |
| 6 | Projects with JWT | ⬜ Pass / ⬜ Fail | |
| 7 | Projects without JWT | ⬜ Pass / ⬜ Fail | |
| 8 | Expired token | ⬜ Pass / ⬜ Fail | |
| 9 | Wrong token format | ⬜ Pass / ⬜ Fail | |
| 10 | Automated tests | ⬜ Pass / ⬜ Fail | |
| 11 | SQL injection | ⬜ Pass / ⬜ Fail | |
| 12 | Cross-user access | ⬜ Pass / ⬜ Fail | |
| 13 | Token replay | ⬜ Pass / ⬜ Fail | |
| 14 | Missing user_id | ⬜ Pass / ⬜ Fail | |
| 15 | Wrong role | ⬜ Pass / ⬜ Fail | |
| 16 | Response time | ⬜ Pass / ⬜ Fail | |
| 17 | Concurrent requests | ⬜ Pass / ⬜ Fail | |
| 18 | Large dataset | ⬜ Pass / ⬜ Fail | |
| 19 | No organizations | ⬜ Pass / ⬜ Fail | |
| 20 | No projects | ⬜ Pass / ⬜ Fail | |
| 21 | Deleted user | ⬜ Pass / ⬜ Fail | |
| 22 | Long JWT | ⬜ Pass / ⬜ Fail | |
| 23 | Fallback mode | ⬜ Pass / ⬜ Fail | |
| 24 | No database | ⬜ Pass / ⬜ Fail | |
| 25 | Full user flow | ⬜ Pass / ⬜ Fail | |
| 26 | Multi-user | ⬜ Pass / ⬜ Fail | |
| 27 | No breaking changes | ⬜ Pass / ⬜ Fail | |
| 28 | Documentation | ⬜ Pass / ⬜ Fail | |
| 29 | Test script | ⬜ Pass / ⬜ Fail | |

**Overall Result:** ⬜ All Pass / ⬜ Some Failures

**Issues Found:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Recommendations:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

**Sign-off:**

Developer: _________________ Date: _______
QA: _______________________ Date: _______
PM: _______________________ Date: _______
