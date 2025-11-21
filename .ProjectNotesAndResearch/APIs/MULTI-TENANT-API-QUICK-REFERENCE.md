# Multi-Tenant Authentication API - Quick Reference

## Environment Setup

```bash
# Required environment variables
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
export SUPABASE_JWT_SECRET="your-jwt-secret-here"

# Optional
export RAILWAY_REGION="us-west"
```

## API Endpoints

### 1. Get User Profile
**Endpoint:** `GET /api/platform/profile`

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Response (200):**
```json
{
  "id": "50ae110f-99e5-4d64-badc-87f34d52b12d",
  "primary_email": "test-1763663946@ogelbase.com",
  "username": "test-1763663946",
  "first_name": "User",
  "last_name": "Name",
  "organizations": [
    {
      "id": "73a70e11-c354-4bee-bd86-a0a96a704cbe",
      "name": "test-org",
      "slug": "test-org",
      "billing_email": "billing@ogelbase.com",
      "projects": [
        {
          "id": "project-uuid",
          "ref": "project-ref",
          "name": "My Project",
          "status": "ACTIVE_HEALTHY",
          "organization_id": "73a70e11-c354-4bee-bd86-a0a96a704cbe",
          "cloud_provider": "railway",
          "region": "us-west",
          "inserted_at": "2025-11-20T00:00:00.000Z",
          "connectionString": ""
        }
      ]
    }
  ]
}
```

**Error (401):**
```json
{
  "error": {
    "message": "Unauthorized: Invalid or missing authentication token"
  }
}
```

### 2. Get Organizations
**Endpoint:** `GET /api/platform/organizations`

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Response (200):**
```json
[
  {
    "id": "73a70e11-c354-4bee-bd86-a0a96a704cbe",
    "name": "test-org",
    "slug": "test-org",
    "billing_email": "billing@ogelbase.com",
    "created_at": "2025-11-20T00:00:00.000Z",
    "updated_at": "2025-11-20T00:00:00.000Z"
  }
]
```

**Error (401):**
```json
{
  "error": {
    "message": "Unauthorized: Invalid or missing authentication token"
  }
}
```

### 3. Get Projects
**Endpoint:** `GET /api/platform/projects`

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Response (200):**
```json
[
  {
    "id": "project-uuid",
    "ref": "project-ref",
    "name": "My Project",
    "organization_id": "73a70e11-c354-4bee-bd86-a0a96a704cbe",
    "cloud_provider": "self-hosted",
    "status": "ACTIVE_HEALTHY",
    "region": "local",
    "inserted_at": "2025-11-20T00:00:00.000Z",
    "connectionString": "postgresql://user:pass@host:port/dbname",
    "restUrl": "https://your-project.supabase.co/rest/v1/",
    "kpsVersion": undefined
  }
]
```

**Error (401):**
```json
{
  "error": {
    "message": "Unauthorized: Invalid or missing authentication token"
  }
}
```

## Testing with curl

### Get JWT Token
First, authenticate with GoTrue to get a JWT token:

```bash
# Login to get JWT token
curl -X POST https://kong-production-80c6.up.railway.app/auth/v1/token?grant_type=password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-1763663946@ogelbase.com",
    "password": "your-password"
  }'

# Extract access_token from response
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Test Endpoints

```bash
# Test profile endpoint
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/profile | jq

# Test organizations endpoint
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/organizations | jq

# Test projects endpoint
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/platform/projects | jq

# Test without auth (should return 401)
curl http://localhost:3000/api/platform/profile | jq
```

## Testing with Node.js Script

```bash
# Make test script executable
chmod +x test-jwt-endpoints.js

# Run tests
node test-jwt-endpoints.js $JWT_TOKEN

# Test against different base URL
API_BASE_URL=https://your-domain.com node test-jwt-endpoints.js $JWT_TOKEN
```

## JWT Token Structure

Your JWT token should contain:

```json
{
  "sub": "50ae110f-99e5-4d64-badc-87f34d52b12d",  // User ID (required)
  "email": "test-1763663946@ogelbase.com",        // User email
  "role": "authenticated",                         // Must be 'authenticated'
  "iss": "supabase",                               // Issuer
  "aud": "authenticated",                          // Audience
  "iat": 1234567890,                               // Issued at
  "exp": 1234571490                                // Expires at
}
```

## Common HTTP Status Codes

- **200 OK** - Request successful, data returned
- **401 Unauthorized** - Invalid/missing JWT token
- **500 Internal Server Error** - Database or server error
- **405 Method Not Allowed** - Wrong HTTP method used

## Multi-Tenant Data Access

### What Users Can Access:

✅ **Own Profile** - From auth.users table
✅ **Organizations They Belong To** - Via organization_members JOIN
✅ **Projects in Their Organizations** - Via organization_members JOIN
✅ **No Access to Other Users' Data** - Enforced by SQL queries

### What Users CANNOT Access:

❌ Other users' profiles
❌ Organizations they're not members of
❌ Projects in organizations they don't belong to

## Security Features

1. **JWT Validation:**
   - Signature verified with SUPABASE_JWT_SECRET
   - Token expiration checked
   - Only 'authenticated' role accepted

2. **Multi-Tenant Isolation:**
   - SQL JOINs enforce data isolation
   - No way to access other users' data
   - All queries parameterized (SQL injection safe)

3. **Error Handling:**
   - 401 for authentication failures
   - No sensitive data in error messages
   - Detailed logs for debugging

## Fallback Mode (Testing Only)

When `SUPABASE_JWT_SECRET` is NOT set:

- All endpoints work without authentication
- Returns all organizations and projects
- Logs warning: "SUPABASE_JWT_SECRET not configured, using fallback mode"
- **DO NOT use in production!**

## Troubleshooting

### Error: "Unauthorized: Invalid or missing authentication token"

**Possible causes:**
- JWT token not provided in Authorization header
- Token format incorrect (must be "Bearer <token>")
- Token signature invalid (wrong JWT secret)
- Token expired
- Token role is not 'authenticated'

**Solutions:**
1. Verify Authorization header format: `Authorization: Bearer <token>`
2. Check token hasn't expired (exp claim)
3. Verify SUPABASE_JWT_SECRET matches signing secret
4. Get fresh token from auth endpoint

### Error: "Failed to fetch user profile"

**Possible causes:**
- User ID in token doesn't exist in auth.users
- Database connection failed
- auth.users table missing

**Solutions:**
1. Verify user exists: `SELECT * FROM auth.users WHERE id = '<user-id>'`
2. Check DATABASE_URL connection
3. Ensure GoTrue auth is set up correctly

### Error: No organizations or projects returned

**Possible causes:**
- User not linked in organization_members table
- No projects in user's organizations

**Solutions:**
1. Check organization membership:
   ```sql
   SELECT * FROM platform.organization_members WHERE user_id = '<user-id>'
   ```
2. Link user to organization (from Phase 1 setup)
3. Verify projects exist in organization

### Endpoints return all data (not filtered)

**Cause:** SUPABASE_JWT_SECRET not set (fallback mode active)

**Solution:**
1. Set SUPABASE_JWT_SECRET environment variable
2. Restart the server
3. Check logs for "using fallback mode" warning

## Database Helper Functions (Available)

From Phase 1, these helper functions are available:

```sql
-- Get all organizations for a user
SELECT * FROM platform.get_user_organizations('<user-id>');

-- Check if user has access to organization
SELECT platform.user_has_org_access('<user-id>', '<org-id>');

-- Check if user is organization owner
SELECT platform.user_is_org_owner('<user-id>', '<org-id>');
```

## Test Data (From Phase 1)

```
User ID:    50ae110f-99e5-4d64-badc-87f34d52b12d
Email:      test-1763663946@ogelbase.com
Org ID:     73a70e11-c354-4bee-bd86-a0a96a704cbe
Org Name:   test-org
Role:       owner
```

## Production Checklist

Before deploying to production:

- [ ] SUPABASE_JWT_SECRET is set and secure
- [ ] DATABASE_URL points to production database
- [ ] All test data removed from production
- [ ] SSL/TLS enabled for all connections
- [ ] Rate limiting configured
- [ ] Monitoring and alerting set up
- [ ] Error logging configured
- [ ] Backup strategy in place
- [ ] Fallback mode disabled (JWT secret required)

## Next Steps

After Phase 2 implementation:

1. **Implement Role-Based Access Control (RBAC)**
   - Use organization_members.role for permissions
   - Owners can invite/remove members
   - Admins can manage projects

2. **Add Token Refresh**
   - Implement refresh token endpoint
   - Handle token expiration gracefully

3. **Add Audit Logging**
   - Log all authenticated API calls
   - Track user actions per organization

4. **Implement Rate Limiting**
   - Per-user rate limits
   - Configurable per role

---

**Need Help?** Check `/PHASE-2-IMPLEMENTATION-SUMMARY.md` for detailed implementation notes.
