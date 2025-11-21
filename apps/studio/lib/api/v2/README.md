# API v2 Layer Documentation

Production-ready API middleware layer with enterprise features for Supabase Studio.

## 🚀 Features

- **RFC 9457 Error Handling**: Standards-compliant error responses
- **API Versioning**: Date-based versioning with deprecation support
- **Rate Limiting**: Token bucket algorithm with per-tier limits
- **Cursor Pagination**: Efficient pagination for large datasets
- **Audit Logging**: Comprehensive request tracking
- **Type Safety**: Full TypeScript support with strict types

## 📦 Installation

The API v2 layer is already installed in this project. Just import and use:

```typescript
import { authenticatedApiV2, NotFoundError } from 'lib/api/v2'
```

## 🎯 Quick Start

### Basic Public Endpoint

```typescript
import type { NextApiResponse } from 'next'
import { publicApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'

export default publicApiV2(
  methodRouter({
    GET: handleGet,
  })
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  res.status(200).json({ message: 'Hello, World!' })
}
```

### Authenticated Endpoint

```typescript
import { authenticatedApiV2, methodRouter, NotFoundError } from 'lib/api/v2'

export default authenticatedApiV2(
  methodRouter({
    GET: handleGet,
  })
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  const userId = req.user?.sub

  if (!userId) {
    throw new NotFoundError('user')
  }

  res.status(200).json({ userId })
}
```

### With Pagination

```typescript
import { authenticatedApiV2, paginateArray } from 'lib/api/v2'

export default authenticatedApiV2(handleGet)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  const { cursor, limit } = req.query
  const items = await fetchItems()

  const result = paginateArray(
    items,
    typeof cursor === 'string' ? cursor : undefined,
    typeof limit === 'string' ? parseInt(limit, 10) : undefined
  )

  res.status(200).json(result)
}
```

## 🛠 API Wrappers

### Available Wrappers

| Wrapper              | Auth | Rate Limit | Audit Log | Use Case          |
| -------------------- | ---- | ---------- | --------- | ----------------- |
| `publicApiV2`        | ❌   | ✅         | ✅        | Public endpoints  |
| `authenticatedApiV2` | ✅   | ✅         | ✅        | User endpoints    |
| `internalApiV2`      | ✅   | ❌         | ✅        | Internal services |
| `webhookApiV2`       | ❌   | ✅         | ✅        | Webhook handlers  |

### Custom Configuration

```typescript
import { apiWrapperV2 } from 'lib/api/v2'

export default apiWrapperV2(handler, {
  withAuth: true,
  withRateLimit: true,
  withAuditLog: true,
  rateLimit: {
    customLimit: {
      requests: 50,
      window: 60,
    },
  },
})
```

## 🚨 Error Handling

### Throwing Errors

```typescript
import { BadRequestError, UnauthorizedError, NotFoundError, ConflictError } from 'lib/api/v2'

// 400 Bad Request with validation errors
throw new BadRequestError('Invalid input', [
  { field: 'email', message: 'Email is required' },
  { field: 'password', message: 'Password too short' },
])

// 404 Not Found
throw new NotFoundError('project')

// 409 Conflict
throw new ConflictError('Project with this name already exists')
```

### Error Response Format (RFC 9457)

```json
{
  "type": "https://api.supabase.com/errors/NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested project was not found",
  "instance": "/api/v2/projects/abc123",
  "errorCode": "NOT_FOUND"
}
```

### Available Error Classes

- `BadRequestError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `UnprocessableEntityError` (422)
- `TooManyRequestsError` (429)
- `InternalServerError` (500)
- `ServiceUnavailableError` (503)

## 📄 Pagination

### Using Cursor Pagination

```typescript
import { paginatePostgres, paginateArray } from 'lib/api/v2'

// For database queries
const result = await paginatePostgres(
  async (afterId, limit) => {
    return await db.query('SELECT * FROM projects WHERE id > $1 ORDER BY id LIMIT $2', [
      afterId || '0',
      limit,
    ])
  },
  req.query.cursor,
  100
)

// For in-memory arrays
const result = paginateArray(items, req.query.cursor, 50)
```

### Pagination Response

```json
{
  "data": [...],
  "cursor": "eyJpZCI6IjEyMyJ9",
  "hasMore": true
}
```

### Client Usage

```bash
# First page
curl -H "API-Version: 2025-11-20" https://api.supabase.com/v2/projects?limit=100

# Next page
curl -H "API-Version: 2025-11-20" https://api.supabase.com/v2/projects?limit=100&cursor=eyJpZCI6IjEyMyJ9
```

## 🔒 Rate Limiting

### Default Limits by Tier

| Tier       | Requests/Minute |
| ---------- | --------------- |
| Free       | 100             |
| Pro        | 1,000           |
| Enterprise | 10,000          |

### Rate Limit Headers

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1732147200
```

### Custom Rate Limits

```typescript
import { createRateLimiter } from 'lib/api/v2'

const strictLimiter = createRateLimiter({
  requests: 10,
  window: 60,
})

export default apiWrapperV2(handler, {
  withRateLimit: true,
  rateLimit: { customLimit: { requests: 10, window: 60 } },
})
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

## 🔄 API Versioning

### Specifying Version

```bash
# Using API-Version header (preferred)
curl -H "API-Version: 2025-11-20" https://api.supabase.com/v2/projects

# Using X-API-Version header (alternative)
curl -H "X-API-Version: 2025-11-20" https://api.supabase.com/v2/projects
```

### Supported Versions

- `2025-11-20` - Initial v2 release (current)

### Default Version

If no version header is provided, defaults to `2025-11-20`.

### Version Format

Versions use date format: `YYYY-MM-DD`

## 📊 Audit Logging

### Automatic Logging

All requests are automatically logged with:

- User ID and organization ID
- Request method and path
- Response status code
- Request duration (ms)
- User agent and IP address
- Error code (for failures)

### Log Format

```json
{
  "timestamp": "2025-11-20T10:30:00.000Z",
  "userId": "user123",
  "orgId": "org456",
  "method": "GET",
  "path": "/api/v2/projects",
  "statusCode": 200,
  "duration": 45,
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1"
}
```

### Querying Logs (Development)

```typescript
import { queryAuditLogs } from 'lib/api/v2'

const logs = queryAuditLogs({ userId: 'user123' })
```

## 🧪 Testing

### Run Test Suite

```bash
cd apps/studio
./test-api-v2.sh
```

### Test Endpoints

- `GET /api/v2/test` - Basic test
- `GET /api/v2/test/error?type=404` - Error handling
- `GET /api/v2/test/pagination?limit=10` - Pagination
- `GET /api/v2/test/rate-limit` - Rate limiting

### Manual Testing

```bash
# Test versioning
curl -H "API-Version: 2025-11-20" http://localhost:3000/api/v2/test

# Test error handling
curl -H "API-Version: 2025-11-20" http://localhost:3000/api/v2/test/error?type=404

# Test pagination
curl -H "API-Version: 2025-11-20" "http://localhost:3000/api/v2/test/pagination?limit=5"

# Test rate limiting (make 6+ requests quickly)
for i in {1..10}; do curl -H "API-Version: 2025-11-20" http://localhost:3000/api/v2/test/rate-limit; done
```

## 🏗 Architecture

### Middleware Chain

```
Request
  ↓
apiWrapperV2
  ↓
Version Middleware (required)
  ↓
Auth Middleware (optional)
  ↓
Rate Limit Middleware (optional)
  ↓
Audit Log Middleware (optional)
  ↓
Handler
  ↓
Response / Error Handler
  ↓
Response
```

### File Structure

```
lib/api/v2/
├── index.ts              # Main exports
├── types.ts              # TypeScript types
├── apiWrapper.ts         # Core wrapper
├── errorHandler.ts       # RFC 9457 errors
├── versionMiddleware.ts  # API versioning
├── rateLimiter.ts        # Rate limiting
├── pagination.ts         # Cursor pagination
├── auditLogger.ts        # Request logging
└── README.md            # This file
```

## 🎨 Best Practices

### 1. Always Use Method Router

```typescript
export default authenticatedApiV2(
  methodRouter({
    GET: handleGet,
    POST: handlePost,
    DELETE: handleDelete,
  })
)
```

### 2. Throw Specific Errors

```typescript
// ❌ Bad
throw new Error('Not found')

// ✅ Good
throw new NotFoundError('project')
```

### 3. Validate Input Early

```typescript
async function handlePost(req: ApiV2Request, res: NextApiResponse) {
  const { name, email } = req.body

  if (!name || !email) {
    throw new BadRequestError('Missing required fields', [
      { field: 'name', message: 'Name is required' },
      { field: 'email', message: 'Email is required' },
    ])
  }

  // Process request...
}
```

### 4. Use Pagination for Lists

```typescript
// ❌ Bad - returns all items
const projects = await db.query('SELECT * FROM projects')

// ✅ Good - uses pagination
const result = await paginatePostgres(queryFn, cursor, limit)
```

### 5. Set Appropriate Rate Limits

```typescript
// Public endpoints
export default publicApiV2(handler) // Uses tier-based limits

// Resource-intensive operations
export default apiWrapperV2(handler, {
  rateLimit: { customLimit: { requests: 10, window: 60 } },
})
```

## 🔐 Security

### Authentication

Authentication is handled by the existing `apiAuthenticate` middleware from the platform layer.

### Rate Limiting

Rate limiting uses token bucket algorithm with:

- Per-user limits (when authenticated)
- Per-IP limits (when anonymous)
- Configurable limits per tier
- Standard headers for client handling

### Input Validation

Always validate input and throw appropriate errors:

```typescript
if (!isValidEmail(email)) {
  throw new BadRequestError('Invalid email format')
}
```

## 🚀 Production Deployment

### Environment Variables

No additional environment variables required. The v2 layer uses existing configuration.

### Redis Setup (Optional)

For production rate limiting, integrate Redis:

```typescript
// rateLimiter.ts - Replace InMemoryRateLimitStore
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)
```

### Database Audit Logs (Optional)

For production audit logging, integrate database:

```typescript
// auditLogger.ts - Replace InMemoryAuditLogStore
const { data, error } = await queryPlatformDatabase({
  query: 'INSERT INTO audit_logs (...) VALUES (...)',
  parameters: [
    /* ... */
  ],
})
```

## 📚 Examples

See the test endpoints for complete examples:

- `/pages/api/v2/test/index.ts` - Basic endpoint
- `/pages/api/v2/test/error.ts` - Error handling
- `/pages/api/v2/test/pagination.ts` - Pagination
- `/pages/api/v2/test/rate-limit.ts` - Rate limiting

## 🐛 Troubleshooting

### Rate Limit Not Working

Clear the in-memory store:

```typescript
import { clearRateLimits } from 'lib/api/v2'
clearRateLimits()
```

### Invalid Cursor Error

Ensure cursor is properly encoded:

```typescript
import { encodeCursor } from 'lib/api/v2'
const cursor = encodeCursor(lastId)
```

### Version Not Recognized

Check supported versions:

```typescript
import { SUPPORTED_API_VERSIONS } from 'lib/api/v2'
console.log(SUPPORTED_API_VERSIONS)
```

## 📖 References

- [RFC 9457 - Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/)
- [API Versioning Best Practices](https://stripe.com/blog/api-versioning)

## 🤝 Contributing

When adding new middleware:

1. Create middleware function in appropriate file
2. Add to the middleware chain in `apiWrapper.ts`
3. Export from `index.ts`
4. Add tests in `/pages/api/v2/test/`
5. Update this README

## 📝 License

Same as Supabase Studio (Apache 2.0)
