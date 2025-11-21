# Create Project API Documentation

## Overview

The Create Project API endpoint allows you to programmatically create new Supabase projects in the self-hosted platform database. It handles project creation, credential generation, and database insertions in a single atomic operation.

## Endpoint

```
POST /api/platform/projects/create
```

## Request Headers

```http
Content-Type: application/json
```

## Request Body

| Field               | Type          | Required | Default          | Description                                                                  |
| ------------------- | ------------- | -------- | ---------------- | ---------------------------------------------------------------------------- |
| `name`              | string        | Yes      | -                | Human-readable project name                                                  |
| `organization_id`   | string (UUID) | Yes      | -                | ID of the organization this project belongs to                               |
| `database_host`     | string        | Yes      | -                | PostgreSQL database host (e.g., "postgres.railway.internal")                 |
| `database_port`     | number        | No       | 5432             | PostgreSQL database port                                                     |
| `database_name`     | string        | Yes      | -                | PostgreSQL database name                                                     |
| `database_user`     | string        | Yes      | -                | PostgreSQL database user                                                     |
| `database_password` | string        | Yes      | -                | PostgreSQL database password                                                 |
| `postgres_meta_url` | string (URL)  | Yes      | -                | Postgres Meta service URL                                                    |
| `supabase_url`      | string (URL)  | Yes      | -                | Supabase Kong/API Gateway URL                                                |
| `ref`               | string        | No       | auto-generated   | Custom project reference (slug). Must be lowercase alphanumeric with hyphens |
| `status`            | string        | No       | "ACTIVE_HEALTHY" | Initial project status                                                       |

### Valid Status Values

- `ACTIVE_HEALTHY` - Project is running normally
- `ACTIVE_UNHEALTHY` - Project is running but has issues
- `COMING_UP` - Project is starting up
- `GOING_DOWN` - Project is shutting down
- `INACTIVE` - Project is not running
- `PAUSED` - Project is paused
- `RESTORING` - Project is being restored from backup
- `UPGRADING` - Project is being upgraded

## Example Request

```bash
curl -X POST https://your-studio-domain.com/api/platform/projects/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API",
    "organization_id": "550e8400-e29b-41d4-a716-446655440000",
    "database_host": "postgres.railway.internal",
    "database_port": 5432,
    "database_name": "production_db",
    "database_user": "postgres",
    "database_password": "your-secure-password",
    "postgres_meta_url": "https://postgres-meta-production.up.railway.app",
    "supabase_url": "https://kong-production.up.railway.app"
  }'
```

### With Custom Ref

```bash
curl -X POST https://your-studio-domain.com/api/platform/projects/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Staging Environment",
    "organization_id": "550e8400-e29b-41d4-a716-446655440000",
    "ref": "staging-env-2024",
    "database_host": "localhost",
    "database_port": 5433,
    "database_name": "staging_db",
    "database_user": "postgres",
    "database_password": "staging-password",
    "postgres_meta_url": "http://localhost:8085",
    "supabase_url": "http://localhost:8000",
    "status": "ACTIVE_HEALTHY"
  }'
```

## Response (Success - 200 OK)

```json
{
  "project": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "organization_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Production API",
    "slug": "production-api",
    "ref": "abcdefghijklmnop",
    "database_host": "postgres.railway.internal",
    "database_port": 5432,
    "database_name": "production_db",
    "database_user": "postgres",
    "database_password": "your-secure-password",
    "postgres_meta_url": "https://postgres-meta-production.up.railway.app",
    "supabase_url": "https://kong-production.up.railway.app",
    "status": "ACTIVE_HEALTHY",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  },
  "credentials": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "service_role_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "jwt_secret": "your-generated-base64-secret-string",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

## Error Responses

### 400 Bad Request - Missing Required Field

```json
{
  "data": null,
  "error": {
    "message": "Project name is required"
  }
}
```

### 400 Bad Request - Invalid Database Configuration

```json
{
  "data": null,
  "error": {
    "message": "Database port must be between 1 and 65535"
  }
}
```

### 400 Bad Request - Invalid URL Format

```json
{
  "data": null,
  "error": {
    "message": "Postgres Meta URL: Invalid URL format"
  }
}
```

### 400 Bad Request - Organization Not Found

```json
{
  "data": null,
  "error": {
    "message": "Organization with ID 550e8400-e29b-41d4-a716-446655440000 not found"
  }
}
```

### 400 Bad Request - Duplicate Project Ref

```json
{
  "data": null,
  "error": {
    "message": "Project with ref 'staging-env-2024' already exists"
  }
}
```

### 400 Bad Request - Invalid Project Ref Format

```json
{
  "data": null,
  "error": {
    "message": "Invalid project ref format. Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric characters"
  }
}
```

### 500 Internal Server Error

```json
{
  "data": null,
  "error": {
    "message": "Failed to create project: [error details]"
  }
}
```

## Implementation Details

### Auto-Generated Fields

The API automatically generates the following fields if not provided:

1. **Project Ref**: A 16-character lowercase alphanumeric string (e.g., "abcdefghijklmnop")
2. **Project Slug**: Generated from the project name (e.g., "Production API" becomes "production-api")
3. **JWT Secret**: A cryptographically secure 64-byte base64-encoded string
4. **Anon Key**: A JWT token signed with the generated secret, with role "anon", valid for 10 years
5. **Service Role Key**: A JWT token signed with the generated secret, with role "service_role", valid for 10 years

### JWT Token Structure

Generated JWT tokens have the following structure:

```json
{
  "role": "anon",
  "iss": "supabase",
  "iat": 1705315800,
  "exp": 2020675800
}
```

### Transaction Safety

The API implements basic transaction safety:

- If credential creation fails after project creation, the project is automatically deleted
- Organization existence is verified before creating the project
- Project ref uniqueness is checked before insertion

### Validation Rules

#### Project Name

- Cannot be empty
- Whitespace is trimmed

#### Project Ref (if provided)

- Must be lowercase
- Can contain alphanumeric characters and hyphens
- Must start and end with alphanumeric characters
- Minimum length: 2 characters
- Pattern: `^[a-z0-9][a-z0-9-]*[a-z0-9]$`

#### Database Port

- Must be between 1 and 65535
- Default: 5432

#### URLs (postgres_meta_url, supabase_url)

- Must be valid URLs
- Must use HTTP or HTTPS protocol

## Usage Examples

### Node.js / TypeScript

```typescript
import axios from 'axios'

interface CreateProjectResponse {
  project: {
    id: string
    ref: string
    name: string
    // ... other fields
  }
  credentials: {
    anon_key: string
    service_role_key: string
    jwt_secret: string
    // ... other fields
  }
}

async function createProject(data: any): Promise<CreateProjectResponse> {
  const response = await axios.post<CreateProjectResponse>(
    'https://your-studio-domain.com/api/platform/projects/create',
    data,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  return response.data
}

// Usage
const newProject = await createProject({
  name: 'My New Project',
  organization_id: '550e8400-e29b-41d4-a716-446655440000',
  database_host: 'localhost',
  database_name: 'my_db',
  database_user: 'postgres',
  database_password: 'password',
  postgres_meta_url: 'http://localhost:8085',
  supabase_url: 'http://localhost:8000',
})

console.log('Project created:', newProject.project.ref)
console.log('Anon key:', newProject.credentials.anon_key)
```

### Python

```python
import requests
import json

def create_project(data):
    url = 'https://your-studio-domain.com/api/platform/projects/create'
    headers = {'Content-Type': 'application/json'}

    response = requests.post(url, headers=headers, data=json.dumps(data))
    response.raise_for_status()

    return response.json()

# Usage
project_data = {
    'name': 'My New Project',
    'organization_id': '550e8400-e29b-41d4-a716-446655440000',
    'database_host': 'localhost',
    'database_name': 'my_db',
    'database_user': 'postgres',
    'database_password': 'password',
    'postgres_meta_url': 'http://localhost:8085',
    'supabase_url': 'http://localhost:8000'
}

result = create_project(project_data)
print(f"Project created: {result['project']['ref']}")
print(f"Anon key: {result['credentials']['anon_key']}")
```

### cURL with Environment Variables

```bash
#!/bin/bash

# Set your configuration
export ORG_ID="550e8400-e29b-41d4-a716-446655440000"
export PROJECT_NAME="My Project"
export DB_HOST="postgres.railway.internal"
export DB_NAME="my_database"
export DB_USER="postgres"
export DB_PASSWORD="my-secure-password"
export PGMETA_URL="https://postgres-meta.up.railway.app"
export SUPABASE_URL="https://kong.up.railway.app"

# Create project
curl -X POST https://your-studio-domain.com/api/platform/projects/create \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PROJECT_NAME\",
    \"organization_id\": \"$ORG_ID\",
    \"database_host\": \"$DB_HOST\",
    \"database_name\": \"$DB_NAME\",
    \"database_user\": \"$DB_USER\",
    \"database_password\": \"$DB_PASSWORD\",
    \"postgres_meta_url\": \"$PGMETA_URL\",
    \"supabase_url\": \"$SUPABASE_URL\"
  }" | jq '.'
```

## Security Considerations

1. **Sensitive Data**: The response includes sensitive information (database passwords, JWT secrets). Ensure:

   - API endpoint is only accessible over HTTPS in production
   - Proper authentication/authorization is implemented
   - Response data is stored securely
   - Credentials are not logged or exposed

2. **Input Validation**: All inputs are validated, but additional application-level validation may be needed

3. **JWT Secrets**: Generated JWT secrets are cryptographically secure and 64 bytes long (base64-encoded)

4. **Database Credentials**: Database passwords are stored in plain text in the platform database. Consider:
   - Using encrypted storage
   - Implementing encryption at rest
   - Regular password rotation

## Related Files

- `/lib/api/platform/database.ts` - Platform database query helper
- `/lib/api/platform/jwt.ts` - JWT generation utilities
- `/lib/api/platform/project-utils.ts` - Project validation and utility functions
- `/database/migrations/001_create_platform_schema.sql` - Database schema

## Testing

### Test with a Local Supabase Instance

```bash
# Assuming you have a local Supabase instance running
curl -X POST http://localhost:8082/api/platform/projects/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "organization_id": "YOUR_ORG_ID",
    "database_host": "localhost",
    "database_port": 54322,
    "database_name": "postgres",
    "database_user": "postgres",
    "database_password": "postgres",
    "postgres_meta_url": "http://localhost:8085",
    "supabase_url": "http://localhost:8000"
  }'
```

### Verify Project Creation

```sql
-- Check created project
SELECT * FROM platform.projects WHERE name = 'Test Project';

-- Check credentials
SELECT
  p.name,
  p.ref,
  c.anon_key,
  c.service_role_key
FROM platform.projects p
JOIN platform.credentials c ON p.id = c.project_id
WHERE p.name = 'Test Project';
```

## Changelog

- **v1.0.0** (2024-01-15): Initial implementation with full project and credential creation
