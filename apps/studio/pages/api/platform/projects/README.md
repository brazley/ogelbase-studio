# Platform Projects API Implementation

Complete implementation of project creation flow for self-hosted Supabase Studio platform database.

## Overview

This implementation provides a complete project creation system that handles:

- Project metadata creation in the platform database
- Automatic generation of unique project references (refs)
- JWT credential generation (anon_key, service_role_key, jwt_secret)
- Database credential storage
- Comprehensive validation and error handling

## Files Created

### 1. API Endpoint
**`/pages/api/platform/projects/create.ts`**
- Main POST endpoint for creating projects
- Handles validation, database insertion, and credential generation
- Implements transaction safety (rollback on failure)
- Returns complete project and credential data

### 2. JWT Utilities
**`/lib/api/platform/jwt.ts`**
- `generateJWTSecret()` - Generates cryptographically secure JWT secrets
- `generateSupabaseJWT()` - Creates signed JWT tokens for Supabase
- `generateProjectCredentials()` - One-stop function for all credentials
- `verifySupabaseJWT()` - Validates JWT tokens

### 3. Project Utilities
**`/lib/api/platform/project-utils.ts`**
- `generateProjectRef()` - Creates unique project references
- `generateSlug()` - Converts names to URL-friendly slugs
- `isValidProjectRef()` - Validates project ref format
- `validateDatabaseConnection()` - Validates database connection details
- `validateURL()` - Validates URL formats

### 4. Documentation
**`/pages/api/platform/projects/CREATE_PROJECT_API.md`**
- Complete API documentation
- Request/response examples
- Error codes and messages
- Usage examples in multiple languages
- Security considerations

## Quick Start

### 1. Prerequisites

Ensure you have:
- Platform database set up with migrations applied
- At least one organization in `platform.organizations`
- jsonwebtoken package installed (`pnpm add jsonwebtoken @types/jsonwebtoken`)

### 2. Create a Project

```bash
curl -X POST http://localhost:8082/api/platform/projects/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Project",
    "organization_id": "YOUR_ORG_ID_HERE",
    "database_host": "localhost",
    "database_port": 5432,
    "database_name": "my_database",
    "database_user": "postgres",
    "database_password": "postgres",
    "postgres_meta_url": "http://localhost:8085",
    "supabase_url": "http://localhost:8000"
  }'
```

### 3. Response Structure

```json
{
  "project": {
    "id": "uuid",
    "ref": "abcdefghijklmnop",
    "name": "My First Project",
    "slug": "my-first-project",
    ...
  },
  "credentials": {
    "anon_key": "eyJhbGc...",
    "service_role_key": "eyJhbGc...",
    "jwt_secret": "base64-encoded-secret",
    ...
  }
}
```

## Architecture

### Data Flow

```
1. API Request
   └─> Validate input data
       └─> Check organization exists
           └─> Generate or validate project ref
               └─> Check ref uniqueness
                   └─> Generate JWT credentials
                       └─> Insert project
                           └─> Insert credentials
                               └─> Return response
                                   └─> (On error: rollback project)
```

### Database Schema

Projects are stored across two tables:

**platform.projects**
- Project metadata
- Database connection details
- Service URLs
- Status information

**platform.credentials**
- JWT secret
- Anon key
- Service role key
- Linked to project via foreign key

### Security Features

1. **Cryptographically Secure Secrets**
   - Uses Node.js `crypto` module
   - 64-byte random JWT secrets
   - Base64-encoded for storage

2. **Input Validation**
   - Required field checking
   - Format validation (refs, URLs, ports)
   - Organization existence verification
   - Project ref uniqueness check

3. **Transaction Safety**
   - Automatic rollback on credential creation failure
   - Prevents orphaned projects

4. **Error Handling**
   - Detailed error messages
   - Appropriate HTTP status codes
   - Database error wrapping

## Usage Examples

### TypeScript / React

```typescript
import { useState } from 'react'

interface ProjectData {
  name: string
  organization_id: string
  database_host: string
  database_name: string
  database_user: string
  database_password: string
  postgres_meta_url: string
  supabase_url: string
}

function CreateProjectForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createProject(data: ProjectData) {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/platform/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error.message)
      }

      const result = await response.json()
      console.log('Project created:', result.project.ref)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // ... rest of component
}
```

### Node.js Script

```javascript
const axios = require('axios')

async function main() {
  try {
    const { data } = await axios.post(
      'http://localhost:8082/api/platform/projects/create',
      {
        name: 'Automated Project',
        organization_id: process.env.ORG_ID,
        database_host: process.env.DB_HOST,
        database_port: parseInt(process.env.DB_PORT || '5432'),
        database_name: process.env.DB_NAME,
        database_user: process.env.DB_USER,
        database_password: process.env.DB_PASSWORD,
        postgres_meta_url: process.env.PGMETA_URL,
        supabase_url: process.env.SUPABASE_URL,
      }
    )

    console.log('Project ID:', data.project.id)
    console.log('Project Ref:', data.project.ref)
    console.log('Anon Key:', data.credentials.anon_key)
    console.log('Service Role Key:', data.credentials.service_role_key)
  } catch (error) {
    console.error('Error:', error.response?.data?.error || error.message)
    process.exit(1)
  }
}

main()
```

## Testing

### Unit Tests (Recommended)

Create tests for:

```typescript
// Test JWT generation
import { generateProjectCredentials, verifySupabaseJWT } from '@/lib/api/platform/jwt'

test('generates valid JWT credentials', () => {
  const creds = generateProjectCredentials()

  expect(creds.jwt_secret).toBeDefined()
  expect(creds.anon_key).toBeDefined()
  expect(creds.service_role_key).toBeDefined()

  // Verify tokens are valid
  const anonPayload = verifySupabaseJWT(creds.anon_key, creds.jwt_secret)
  expect(anonPayload?.role).toBe('anon')

  const servicePayload = verifySupabaseJWT(
    creds.service_role_key,
    creds.jwt_secret
  )
  expect(servicePayload?.role).toBe('service_role')
})

// Test project ref generation
import { generateProjectRef, isValidProjectRef } from '@/lib/api/platform/project-utils'

test('generates valid project refs', () => {
  const ref = generateProjectRef()
  expect(ref).toHaveLength(16)
  expect(isValidProjectRef(ref)).toBe(true)
})
```

### Integration Tests

```bash
# Test creating a project
./test-create-project.sh

# Test error cases
./test-create-project-errors.sh
```

### Manual Testing Checklist

- [ ] Create project with minimal required fields
- [ ] Create project with custom ref
- [ ] Create project with all optional fields
- [ ] Test validation errors (missing fields, invalid formats)
- [ ] Test organization not found error
- [ ] Test duplicate ref error
- [ ] Verify credentials are generated correctly
- [ ] Verify database entries are created
- [ ] Test rollback on credential creation failure

## Common Issues & Solutions

### Issue: "Organization with ID X not found"

**Solution**: Ensure you're using a valid organization UUID from `platform.organizations` table.

```sql
-- Get your organization ID
SELECT id, name, slug FROM platform.organizations;
```

### Issue: "Project with ref 'X' already exists"

**Solution**: Either:
1. Don't provide a custom `ref` (let it auto-generate)
2. Choose a different unique ref
3. Delete the existing project if it's no longer needed

```sql
-- Check existing refs
SELECT ref, name FROM platform.projects;
```

### Issue: "Invalid URL format"

**Solution**: Ensure URLs include protocol (http:// or https://)

```javascript
// ❌ Wrong
postgres_meta_url: 'localhost:8085'

// ✅ Correct
postgres_meta_url: 'http://localhost:8085'
```

### Issue: JWT tokens not working

**Solution**: Verify the JWT secret matches between your Supabase services and the platform database.

```sql
-- Get JWT secret for a project
SELECT jwt_secret FROM platform.credentials
WHERE project_id = (
  SELECT id FROM platform.projects WHERE ref = 'your-project-ref'
);
```

## Extending the Implementation

### Add Custom Fields

To add custom fields to projects:

1. Update database schema:
```sql
ALTER TABLE platform.projects ADD COLUMN custom_field TEXT;
```

2. Update TypeScript types in `/lib/api/platform/database.ts`:
```typescript
export type PlatformProject = {
  // ... existing fields
  custom_field?: string
}
```

3. Update API endpoint to accept and insert the field

### Add Validation Rules

Add custom validation in `/lib/api/platform/project-utils.ts`:

```typescript
export function validateCustomField(value: string): {
  isValid: boolean
  error?: string
} {
  if (!value.match(/your-pattern/)) {
    return { isValid: false, error: 'Invalid format' }
  }
  return { isValid: true }
}
```

### Add Webhooks/Notifications

Add webhook calls after successful project creation:

```typescript
// In handleCreate function, after successful creation
await notifyProjectCreated({
  project_id: project.id,
  project_ref: project.ref,
  organization_id: project.organization_id,
})
```

## Performance Considerations

### Database Queries

The endpoint makes several database queries:
1. Check organization exists (1 query)
2. Check ref uniqueness (1 query)
3. Insert project (1 query)
4. Insert credentials (1 query)
5. Optional rollback (1 query if needed)

**Optimization opportunities**:
- Combine organization check and ref uniqueness check
- Use database transactions for atomicity
- Add database indexes (already present in migration)

### Caching

Consider caching organization existence checks:

```typescript
// Simple in-memory cache
const orgCache = new Map<string, boolean>()

async function checkOrgExists(orgId: string): Promise<boolean> {
  if (orgCache.has(orgId)) {
    return orgCache.get(orgId)!
  }

  const exists = await queryDatabase(...)
  orgCache.set(orgId, exists)
  return exists
}
```

## Security Best Practices

1. **Always use HTTPS in production**
2. **Implement authentication** on the API endpoint
3. **Rate limit** project creation requests
4. **Encrypt sensitive data** at rest
5. **Audit log** all project creations
6. **Validate organization ownership** in multi-tenant scenarios
7. **Sanitize error messages** (don't leak database details)

## Monitoring & Logging

Add logging for production:

```typescript
// Log project creation events
console.log('[PROJECT_CREATION]', {
  project_id: project.id,
  project_ref: project.ref,
  organization_id: project.organization_id,
  timestamp: new Date().toISOString(),
})

// Monitor for errors
try {
  // ... project creation logic
} catch (error) {
  console.error('[PROJECT_CREATION_ERROR]', {
    error: error.message,
    organization_id: req.body.organization_id,
    timestamp: new Date().toISOString(),
  })
  throw error
}
```

## Related Documentation

- [Platform Database Setup](/database/README.md)
- [Platform Database Schema](/database/migrations/001_create_platform_schema.sql)
- [Platform Database Helper](/lib/api/platform/database.ts)
- [Create Project API Docs](./CREATE_PROJECT_API.md)

## License

Part of the Supabase Studio platform. See main repository for license information.
