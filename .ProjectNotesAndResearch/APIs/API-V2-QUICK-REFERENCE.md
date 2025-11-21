# API v2 Quick Reference

## 🚀 One-Page Cheat Sheet

### Quick Import

```typescript
import {
  // Wrappers
  publicApiV2,
  authenticatedApiV2,
  internalApiV2,
  methodRouter,

  // Errors
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,

  // Pagination
  paginateArray,
  paginatePostgres,
  encodeCursor,
  decodeCursor,

  // Types
  type ApiV2Request,
  type ApiV2Handler,
  type PaginatedResponse,
} from 'lib/api/v2'
```

---

## 📝 Common Patterns

### 1. Basic GET Endpoint

```typescript
import { publicApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'

export default publicApiV2(
  methodRouter({
    GET: handleGet,
  })
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  res.status(200).json({ message: 'Success' })
}
```

### 2. Authenticated CRUD

```typescript
import { authenticatedApiV2, methodRouter, NotFoundError } from 'lib/api/v2'

export default authenticatedApiV2(
  methodRouter({
    GET: handleGet,
    POST: handlePost,
    DELETE: handleDelete,
  })
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  const { id } = req.query
  const item = await db.findById(id)

  if (!item) throw new NotFoundError('item')

  res.json(item)
}

async function handlePost(req: ApiV2Request, res: NextApiResponse) {
  const { name } = req.body

  if (!name) {
    throw new BadRequestError('Name is required', [{ field: 'name', message: 'Required field' }])
  }

  const item = await db.create({ name })
  res.status(201).json(item)
}

async function handleDelete(req: ApiV2Request, res: NextApiResponse) {
  const { id } = req.query
  await db.delete(id)
  res.status(204).end()
}
```

### 3. Paginated List

```typescript
import { authenticatedApiV2, paginatePostgres } from 'lib/api/v2'

export default authenticatedApiV2(handleGet)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  const { cursor, limit } = req.query

  const result = await paginatePostgres(
    async (afterId, fetchLimit) => {
      return await db.query('SELECT * FROM items WHERE id > $1 ORDER BY id LIMIT $2', [
        afterId || '0',
        fetchLimit,
      ])
    },
    typeof cursor === 'string' ? cursor : undefined,
    typeof limit === 'string' ? parseInt(limit, 10) : 100
  )

  res.json(result)
}
```

### 4. Custom Rate Limit

```typescript
import { apiWrapperV2 } from 'lib/api/v2'

export default apiWrapperV2(handler, {
  withAuth: true,
  withRateLimit: true,
  rateLimit: {
    customLimit: {
      requests: 10,
      window: 60, // 10 requests per minute
    },
  },
})
```

---

## 🚨 Error Reference

| Error Class                | Status | When to Use                              |
| -------------------------- | ------ | ---------------------------------------- |
| `BadRequestError`          | 400    | Invalid input, validation errors         |
| `UnauthorizedError`        | 401    | Missing/invalid auth                     |
| `ForbiddenError`           | 403    | Valid auth, insufficient permissions     |
| `NotFoundError`            | 404    | Resource doesn't exist                   |
| `ConflictError`            | 409    | Duplicate resource, constraint violation |
| `UnprocessableEntityError` | 422    | Valid syntax, semantic errors            |
| `TooManyRequestsError`     | 429    | Rate limit exceeded                      |
| `InternalServerError`      | 500    | Unexpected server error                  |
| `ServiceUnavailableError`  | 503    | Temporary unavailability                 |

### Error Usage

```typescript
// Simple error
throw new NotFoundError('project')

// Error with detail
throw new ConflictError('Project name already exists')

// Error with validation details
throw new BadRequestError('Invalid input', [
  { field: 'email', message: 'Invalid email format' },
  { field: 'age', message: 'Must be positive' },
])
```

### Error Response Format

```json
{
  "type": "https://api.supabase.com/errors/NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested project was not found",
  "instance": "/api/v2/projects/123",
  "errorCode": "NOT_FOUND"
}
```

---

## 📄 Pagination Reference

### Request

```bash
GET /api/v2/items?limit=100
GET /api/v2/items?limit=50&cursor=eyJpZCI6IjEyMyJ9
```

### Response

```json
{
  "data": [...],
  "cursor": "eyJpZCI6IjIyMyJ9",
  "hasMore": true
}
```

### Functions

```typescript
// Array pagination
const result = paginateArray(items, cursor, limit)

// PostgreSQL pagination
const result = await paginatePostgres(queryFn, cursor, limit)

// Cursor encoding
const cursor = encodeCursor('123')
const id = decodeCursor(cursor)
```

---

## 🔒 Rate Limiting

### Default Limits

| Tier       | Requests/Minute |
| ---------- | --------------- |
| Free       | 100             |
| Pro        | 1,000           |
| Enterprise | 10,000          |

### Response Headers

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1732147200
```

### 429 Response

```json
{
  "type": "https://api.supabase.com/errors/RATE_LIMIT_EXCEEDED",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. You can make 100 requests per 60 seconds.",
  "errorCode": "RATE_LIMIT_EXCEEDED"
}
```

---

## 🔄 API Versioning

### Request Headers

```bash
# Preferred
curl -H "API-Version: 2025-11-20" /api/v2/test

# Alternative
curl -H "X-API-Version: 2025-11-20" /api/v2/test
```

### Supported Versions

- `2025-11-20` - Initial v2 release (default)

### Response Headers

```
API-Version: 2025-11-20
X-API-Version: 2025-11-20
```

---

## 🎯 Wrapper Comparison

| Wrapper              | Auth | Rate Limit | Audit Log |
| -------------------- | ---- | ---------- | --------- |
| `publicApiV2`        | ❌   | ✅         | ✅        |
| `authenticatedApiV2` | ✅   | ✅         | ✅        |
| `internalApiV2`      | ✅   | ❌         | ✅        |
| `webhookApiV2`       | ❌   | ✅         | ✅        |

---

## 📊 Request Flow

```
Client Request
     ↓
Version Check (required)
     ↓
Authentication (optional)
     ↓
Rate Limit Check (optional)
     ↓
Audit Log Start (optional)
     ↓
Handler Execution
     ↓
Error Handling (automatic)
     ↓
Audit Log Complete (optional)
     ↓
Client Response
```

---

## 🧪 Testing Commands

```bash
# Basic test
curl -H "API-Version: 2025-11-20" http://localhost:8082/api/v2/test

# Error test
curl -H "API-Version: 2025-11-20" \
  http://localhost:8082/api/v2/test/error?type=404

# Pagination test
curl -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/pagination?limit=10"

# Rate limit test
for i in {1..10}; do
  curl -H "API-Version: 2025-11-20" \
    http://localhost:8082/api/v2/test/rate-limit
done
```

---

## 📁 File Locations

```
lib/api/v2/
├── index.ts              # Import from here
├── types.ts              # TypeScript types
├── errorHandler.ts       # Error classes
├── versionMiddleware.ts  # Versioning
├── pagination.ts         # Pagination utils
├── rateLimiter.ts        # Rate limiting
├── auditLogger.ts        # Audit logging
└── apiWrapper.ts         # Core wrapper

pages/api/v2/test/
├── index.ts              # Basic example
├── error.ts              # Error examples
├── pagination.ts         # Pagination example
└── rate-limit.ts         # Rate limit example
```

---

## 💡 Pro Tips

### 1. Always Use Method Router

```typescript
// ✅ Good
export default publicApiV2(
  methodRouter({
    GET: handleGet,
    POST: handlePost,
  })
)

// ❌ Avoid
export default publicApiV2(async (req, res) => {
  if (req.method === 'GET') {
  }
})
```

### 2. Throw Specific Errors

```typescript
// ✅ Good
throw new NotFoundError('project')

// ❌ Avoid
throw new Error('Project not found')
```

### 3. Validate Early

```typescript
async function handlePost(req: ApiV2Request, res: NextApiResponse) {
  // Validate at the top
  const { name, email } = req.body

  if (!name || !email) {
    throw new BadRequestError('Missing required fields')
  }

  // Process request...
}
```

### 4. Use Pagination for Lists

```typescript
// ✅ Good - paginated
const result = await paginatePostgres(queryFn, cursor, limit)

// ❌ Avoid - returns all
const items = await db.query('SELECT * FROM items')
```

### 5. Set Appropriate Rate Limits

```typescript
// Public endpoints - use default
export default publicApiV2(handler)

// Resource-intensive - use custom
export default apiWrapperV2(handler, {
  rateLimit: { customLimit: { requests: 10, window: 60 } },
})
```

---

## 🔧 Troubleshooting

### Rate Limit Not Working?

```typescript
import { clearRateLimits } from 'lib/api/v2'
clearRateLimits()
```

### Invalid Cursor Error?

```typescript
// Ensure proper encoding
const cursor = encodeCursor(lastId.toString())
```

### Version Not Recognized?

```typescript
import { SUPPORTED_API_VERSIONS } from 'lib/api/v2'
console.log(SUPPORTED_API_VERSIONS)
```

---

## 📖 Full Documentation

See `/apps/studio/lib/api/v2/README.md` for:

- Detailed examples
- Architecture diagrams
- Production deployment guide
- Security considerations
- Contributing guidelines

---

## 🚀 Quick Start Checklist

- [ ] Import from `lib/api/v2`
- [ ] Choose appropriate wrapper (`publicApiV2`, `authenticatedApiV2`, etc.)
- [ ] Use `methodRouter` for clean routing
- [ ] Throw specific error classes
- [ ] Use pagination for list endpoints
- [ ] Set API version header in requests
- [ ] Handle rate limit responses (429)
- [ ] Test with `/api/v2/test` endpoints

**Ship it!** 🎉
