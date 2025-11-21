# Profile Endpoint Testing Guide

## Quick Start

The profile endpoint now returns real user data based on authenticated sessions with membership-based filtering.

---

## Endpoint Details

**URL**: `GET /api/platform/profile`

**Authentication**: Required - Bearer token in Authorization header

**Response**: User profile with their organizations and accessible projects

---

## Testing Locally

### 1. Prerequisites
```bash
# Ensure DATABASE_URL is configured
export DATABASE_URL="postgresql://user:pass@host:port/dbname"

# Start the development server
cd apps/studio
pnpm dev
```

### 2. Get a Valid Session Token

First, ensure you have a user with an active session in the database:

```sql
-- Check if user exists
SELECT id, email FROM platform.users WHERE email = 'test@example.com';

-- Check if session exists
SELECT token, expires_at
FROM platform.user_sessions
WHERE user_id = '<user-id>'
  AND expires_at > NOW();

-- If no session exists, create one
INSERT INTO platform.user_sessions (user_id, token, expires_at)
VALUES (
  '<user-id>',
  '<your-hashed-token>',  -- SHA-256 hash of your token
  NOW() + INTERVAL '1 day'
);
```

### 3. Test the Endpoint

```bash
# Replace <token> with your actual session token (unhashed)
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/platform/profile
```

---

## Expected Responses

### Success (200 OK)
```json
{
  "id": "user-uuid-123",
  "primary_email": "user@example.com",
  "username": "testuser",
  "first_name": "Test",
  "last_name": "User",
  "organizations": [
    {
      "id": "org-uuid-456",
      "name": "My Organization",
      "slug": "my-org",
      "billing_email": "billing@myorg.com",
      "projects": [
        {
          "id": "proj-uuid-789",
          "ref": "myproject",
          "name": "My Project",
          "status": "active",
          "organization_id": "org-uuid-456",
          "cloud_provider": "railway",
          "region": "us-west",
          "inserted_at": "2024-01-01T00:00:00Z",
          "connectionString": ""
        }
      ]
    }
  ]
}
```

### Unauthorized (401)
```json
{
  "error": "Unauthorized",
  "code": "AUTH_REQUIRED",
  "message": "Authentication required"
}
```

### Invalid Session (401)
```json
{
  "error": "Invalid session",
  "code": "INVALID_SESSION",
  "message": "Session token is invalid or expired"
}
```

### Database Not Configured (503)
```json
{
  "error": "Platform database not configured",
  "code": "DB_NOT_CONFIGURED",
  "message": "DATABASE_URL environment variable is missing. Please configure the platform database."
}
```

---

## Running Tests

### Run All Profile Tests
```bash
cd apps/studio
pnpm test pages/api/platform/profile/__tests__/profile.test.ts
```

### Run Specific Test Suite
```bash
# Authentication tests
pnpm test pages/api/platform/profile/__tests__/profile.test.ts -t "Authentication"

# Membership filtering tests
pnpm test pages/api/platform/profile/__tests__/profile.test.ts -t "Membership-Based Filtering"

# Data isolation tests
pnpm test pages/api/platform/profile/__tests__/profile.test.ts -t "Data Isolation"
```

### Expected Test Output
```
✓ pages/api/platform/profile/__tests__/profile.test.ts (20 tests) 11ms

Test Files  1 passed (1)
     Tests  20 passed (20)
  Duration  1.79s
```

---

## Membership Setup for Testing

### Create Test User
```sql
INSERT INTO platform.users (id, email, username, first_name, last_name)
VALUES (
  'user-test-123',
  'testuser@example.com',
  'testuser',
  'Test',
  'User'
);
```

### Create Test Organization
```sql
INSERT INTO platform.organizations (id, name, slug, billing_email)
VALUES (
  'org-test-456',
  'Test Organization',
  'test-org',
  'billing@testorg.com'
);
```

### Add User to Organization
```sql
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES (
  'org-test-456',
  'user-test-123',
  'owner'
);
```

### Create Test Project
```sql
INSERT INTO platform.projects (
  id, organization_id, name, slug, ref,
  database_host, database_port, database_name,
  database_user, database_password,
  postgres_meta_url, supabase_url, status
)
VALUES (
  'proj-test-789',
  'org-test-456',
  'Test Project',
  'test-project',
  'testproj',
  'localhost',
  5432,
  'testdb',
  'testuser',
  'testpass',
  'http://localhost:8080',
  'http://localhost:54321',
  'active'
);
```

### Create Session Token
```bash
# Generate a session token
TOKEN=$(openssl rand -hex 32)
echo "Your token: $TOKEN"

# Hash the token for database storage
TOKEN_HASH=$(echo -n "$TOKEN" | openssl dgst -sha256 | awk '{print $2}')

# Insert into database
psql "$DATABASE_URL" -c "
INSERT INTO platform.user_sessions (user_id, token, expires_at)
VALUES (
  'user-test-123',
  '$TOKEN_HASH',
  NOW() + INTERVAL '1 day'
);"

# Test the endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/platform/profile | jq
```

---

## Verifying Membership Filtering

### Test 1: User Sees Only Their Organizations
```sql
-- Create another org that user is NOT a member of
INSERT INTO platform.organizations (id, name, slug)
VALUES ('org-other', 'Other Org', 'other-org');

-- User should NOT see 'org-other' in profile response
```

### Test 2: User Sees Only Accessible Projects
```sql
-- Create a project in an org where user is NOT a member
INSERT INTO platform.projects (
  id, organization_id, name, ref, status,
  database_host, database_port, database_name,
  database_user, database_password,
  postgres_meta_url, supabase_url
)
VALUES (
  'proj-private',
  'org-other',
  'Private Project',
  'private',
  'active',
  'localhost', 5432, 'privatedb',
  'user', 'pass',
  'http://localhost:8080',
  'http://localhost:54321'
);

-- User should NOT see 'proj-private' in profile response
```

### Test 3: Direct Project Access
```sql
-- Add user directly to a project (bypassing org membership)
INSERT INTO platform.project_members (project_id, user_id, role)
VALUES ('proj-direct', 'user-test-123', 'developer');

-- User SHOULD see 'proj-direct' in profile response
```

---

## Debugging Common Issues

### Issue: "Invalid session" Error
**Cause**: Token not found or expired
**Solution**: Check session exists and not expired
```sql
SELECT * FROM platform.user_sessions
WHERE user_id = '<user-id>'
  AND expires_at > NOW();
```

### Issue: Empty Organizations Array
**Cause**: User not a member of any organizations
**Solution**: Add user to at least one organization
```sql
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES ('<org-id>', '<user-id>', 'member');
```

### Issue: No Projects Showing
**Cause**: User has no project access
**Solution**: Either add user to org with projects, or add direct project access
```sql
-- Option 1: Organization membership (gives access to all org projects)
INSERT INTO platform.organization_members (organization_id, user_id, role)
VALUES ('<org-id>', '<user-id>', 'member');

-- Option 2: Direct project access
INSERT INTO platform.project_members (project_id, user_id, role)
VALUES ('<project-id>', '<user-id>', 'developer');
```

### Issue: "Platform database not configured"
**Cause**: DATABASE_URL environment variable not set
**Solution**: Export DATABASE_URL
```bash
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
```

---

## Security Verification

### Verify Token Hashing
```bash
# Your original token
TOKEN="my-secret-token"

# How it's hashed in code
echo -n "$TOKEN" | openssl dgst -sha256

# The hash stored in database should match
psql "$DATABASE_URL" -c "SELECT token FROM platform.user_sessions WHERE user_id = '<user-id>';"
```

### Verify Data Isolation
1. Create two users with different organization memberships
2. Get session tokens for both users
3. Call profile endpoint with each token
4. Verify each user only sees their own organizations/projects

```bash
# User A
curl -H "Authorization: Bearer $TOKEN_A" \
  http://localhost:3000/api/platform/profile | jq '.organizations[].id'

# User B
curl -H "Authorization: Bearer $TOKEN_B" \
  http://localhost:3000/api/platform/profile | jq '.organizations[].id'

# Should return different results
```

---

## Performance Testing

### Measure Response Time
```bash
curl -w "\nTime: %{time_total}s\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/platform/profile \
  -o /dev/null -s
```

### Test with Multiple Organizations
```sql
-- Add user to many organizations
DO $$
BEGIN
  FOR i IN 1..50 LOOP
    INSERT INTO platform.organizations (id, name, slug)
    VALUES (
      'org-perf-' || i,
      'Performance Org ' || i,
      'perf-org-' || i
    );

    INSERT INTO platform.organization_members (organization_id, user_id, role)
    VALUES (
      'org-perf-' || i,
      'user-test-123',
      'member'
    );
  END LOOP;
END $$;

-- Test profile response time
curl -w "\nTime: %{time_total}s\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/platform/profile \
  | jq '.organizations | length'
```

---

## API Integration Examples

### JavaScript/TypeScript
```typescript
async function getUserProfile(token: string) {
  const response = await fetch('http://localhost:3000/api/platform/profile', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    throw new Error(`Profile fetch failed: ${response.statusText}`)
  }

  return await response.json()
}

// Usage
const profile = await getUserProfile('your-session-token')
console.log(`Welcome ${profile.first_name}!`)
console.log(`Organizations: ${profile.organizations.length}`)
```

### Python
```python
import requests

def get_user_profile(token: str) -> dict:
    response = requests.get(
        'http://localhost:3000/api/platform/profile',
        headers={'Authorization': f'Bearer {token}'}
    )
    response.raise_for_status()
    return response.json()

# Usage
profile = get_user_profile('your-session-token')
print(f"Welcome {profile['first_name']}!")
print(f"Organizations: {len(profile['organizations'])}")
```

---

## Production Checklist

Before deploying to production:

- [ ] DATABASE_URL is configured in production environment
- [ ] Session tokens are properly hashed before storage
- [ ] All tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Response times are acceptable (<500ms)
- [ ] Rate limiting is configured (if needed)
- [ ] Monitoring/logging is set up
- [ ] Security audit completed
- [ ] Data isolation verified with real users
- [ ] Token rotation policy documented

---

## Need Help?

See `/apps/studio/TICKET-8-COMPLETION-REPORT.md` for detailed implementation information.

**Rafael Santos** 🔐
