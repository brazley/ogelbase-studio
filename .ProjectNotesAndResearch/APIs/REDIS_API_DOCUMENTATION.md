# Redis Management API v2 Documentation

Complete production-ready API for managing Redis databases and operations.

## 🎯 Overview

The Redis Management API provides comprehensive endpoints for:
- Database connection management
- Key-value operations with cursor pagination
- TTL (Time To Live) management
- Server info and memory statistics
- Batch operations

All endpoints follow RFC 9457 error format and include proper authentication, rate limiting, and audit logging.

## 📁 Files Created

### Core Infrastructure
- `/apps/studio/lib/api/platform/databases.ts` - Database configuration helpers
- `/apps/studio/lib/api/v2/errorHandler.ts` - Updated with ValidationError class

### Database Management API
- `/apps/studio/pages/api/v2/databases/index.ts` - List and create databases
- `/apps/studio/pages/api/v2/databases/[id]/index.ts` - CRUD operations
- `/apps/studio/pages/api/v2/databases/[id]/test.ts` - Connection testing

### Redis Operations API
- `/apps/studio/pages/api/v2/redis/[databaseId]/keys/index.ts` - Key scanning and batch ops
- `/apps/studio/pages/api/v2/redis/[databaseId]/keys/[key]/index.ts` - Single key operations
- `/apps/studio/pages/api/v2/redis/[databaseId]/keys/[key]/ttl.ts` - TTL management
- `/apps/studio/pages/api/v2/redis/[databaseId]/info/index.ts` - Server information
- `/apps/studio/pages/api/v2/redis/[databaseId]/memory/index.ts` - Memory statistics

### Testing
- `/Users/quikolas/Documents/GitHub/supabase-master/test-redis-api.sh` - Comprehensive test suite

---

## 📚 API Endpoints

### Database Management

#### List Databases
```bash
GET /api/v2/databases?projectId={projectId}
```

**Headers:**
- `API-Version: 2025-11-20`
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "data": [
    {
      "id": "db-123",
      "project_id": "proj-456",
      "name": "Production Redis",
      "type": "redis",
      "connection_string": "redis://...",
      "host": "localhost",
      "port": 6379,
      "status": "active",
      "created_at": "2025-01-20T12:00:00Z"
    }
  ],
  "total": 1
}
```

---

#### Create Database
```bash
POST /api/v2/databases
```

**Body:**
```json
{
  "projectId": "proj-456",
  "name": "My Redis DB",
  "type": "redis",
  "connection_string": "redis://localhost:6379",
  "host": "localhost",
  "port": 6379,
  "ssl_enabled": false
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "db-789",
    "name": "My Redis DB",
    "status": "active",
    ...
  }
}
```

---

#### Get Database
```bash
GET /api/v2/databases/{id}
```

**Response:** `200 OK`

---

#### Update Database
```bash
PATCH /api/v2/databases/{id}
```

**Body:**
```json
{
  "name": "Updated Name",
  "status": "active"
}
```

**Response:** `200 OK`

---

#### Delete Database
```bash
DELETE /api/v2/databases/{id}
```

**Response:** `204 No Content`

---

#### Test Connection
```bash
POST /api/v2/databases/{id}/test
```

**Response:**
```json
{
  "data": {
    "databaseId": "db-123",
    "success": true,
    "message": "Redis connection successful",
    "latency": 45
  }
}
```

---

### Redis Key Operations

#### Scan Keys (with cursor pagination)
```bash
GET /api/v2/redis/{databaseId}/keys?pattern=user:*&cursor={cursor}&limit=100
```

**Query Parameters:**
- `pattern` - Redis key pattern (default: `*`)
- `cursor` - Pagination cursor (base64 encoded)
- `limit` - Max keys to return (1-1000, default: 100)

**Response:**
```json
{
  "data": ["user:1", "user:2", "user:3"],
  "cursor": "bmV4dDEyMw==",
  "hasMore": true,
  "total": 3
}
```

---

#### Get Key
```bash
GET /api/v2/redis/{databaseId}/keys/{key}
```

**Response:**
```json
{
  "data": {
    "key": "user:123",
    "value": "John Doe",
    "ttl": 3600
  }
}
```

**Errors:**
- `404 Not Found` - Key doesn't exist

---

#### Set Key
```bash
PUT /api/v2/redis/{databaseId}/keys/{key}
```

**Body:**
```json
{
  "value": "new value",
  "ttl": 3600
}
```

**Response:**
```json
{
  "data": {
    "key": "user:123",
    "value": "new value",
    "ttl": 3600
  }
}
```

---

#### Delete Key
```bash
DELETE /api/v2/redis/{databaseId}/keys/{key}
```

**Response:** `204 No Content`

**Errors:**
- `404 Not Found` - Key doesn't exist

---

#### Batch Operations
```bash
POST /api/v2/redis/{databaseId}/keys
```

**Body:**
```json
{
  "operations": [
    {
      "action": "set",
      "key": "batch:1",
      "value": "value1",
      "ttl": 300
    },
    {
      "action": "delete",
      "key": "batch:2"
    }
  ]
}
```

**Limits:**
- Maximum 100 operations per request

**Response:**
```json
{
  "data": {
    "results": [
      {
        "index": 0,
        "success": true,
        "key": "batch:1"
      },
      {
        "index": 1,
        "success": true,
        "key": "batch:2",
        "deleted": 1
      }
    ],
    "summary": {
      "total": 2,
      "success": 2,
      "failed": 0
    }
  }
}
```

---

### TTL Management

#### Get TTL
```bash
GET /api/v2/redis/{databaseId}/keys/{key}/ttl
```

**Response:**
```json
{
  "data": {
    "key": "user:123",
    "ttl": 3600,
    "hasExpiration": true
  }
}
```

**Note:** `ttl: null` means no expiration set

---

#### Set TTL
```bash
POST /api/v2/redis/{databaseId}/keys/{key}/ttl
```

**Body:**
```json
{
  "ttl": 7200
}
```

**Response:**
```json
{
  "data": {
    "key": "user:123",
    "ttl": 7200,
    "success": true
  }
}
```

---

### Server Info & Stats

#### Get Server Info
```bash
GET /api/v2/redis/{databaseId}/info?section={section}
```

**Query Parameters:**
- `section` (optional) - Specific section: `server`, `clients`, `memory`, `persistence`, `stats`, `replication`, `cpu`, `commandstats`, `cluster`, `keyspace`

**Response:**
```json
{
  "data": {
    "raw": "# Server\r\nredis_version:7.0.0\r\n...",
    "parsed": {
      "server": {
        "redis_version": "7.0.0",
        "redis_mode": "standalone",
        "os": "Linux 5.10.0",
        "uptime_in_seconds": 86400
      },
      "memory": {
        "used_memory": 1048576,
        "used_memory_peak": 2097152
      }
    }
  }
}
```

---

#### Get Memory Stats
```bash
GET /api/v2/redis/{databaseId}/memory
```

**Response:**
```json
{
  "data": {
    "memory": {
      "used": 1048576,
      "usedFormatted": "1.00 MB",
      "rss": 2097152,
      "rssFormatted": "2.00 MB",
      "peak": 3145728,
      "peakFormatted": "3.00 MB",
      "max": 0,
      "maxFormatted": "unlimited",
      "fragmentationRatio": 1.5
    },
    "keys": {
      "total": 1234
    },
    "raw": {
      "used_memory": 1048576,
      "used_memory_rss": 2097152,
      ...
    }
  }
}
```

---

## 🔒 Error Handling

All errors follow RFC 9457 Problem Details format:

```json
{
  "type": "https://api.supabase.com/errors/NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Key 'user:999' not found",
  "errorCode": "NOT_FOUND",
  "instance": "/api/v2/redis/db-123/keys/user:999"
}
```

### Common Error Codes

| Status | Error Code | Description |
|--------|-----------|-------------|
| 400 | `BAD_REQUEST` | Invalid request parameters |
| 400 | `VALIDATION_ERROR` | Validation failed (includes `validationErrors` array) |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests (includes `Retry-After` header) |
| 500 | `INTERNAL_ERROR` | Server error |

**Validation Error Example:**
```json
{
  "type": "https://api.supabase.com/errors/VALIDATION_ERROR",
  "title": "Validation Error",
  "status": 400,
  "detail": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "validationErrors": [
    {
      "field": "port",
      "message": "port must be between 1 and 65535"
    },
    {
      "field": "name",
      "message": "name is required"
    }
  ]
}
```

---

## 🧪 Testing

### Run Test Suite

```bash
# Set environment variables
export BASE_URL="http://localhost:3000"
export SUPABASE_TOKEN="your-token-here"
export PROJECT_ID="your-project-id"

# Run tests
./test-redis-api.sh
```

### Manual Testing Examples

**Create a database:**
```bash
curl -X POST http://localhost:3000/api/v2/databases \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj-123",
    "name": "Test Redis",
    "type": "redis",
    "connection_string": "redis://localhost:6379",
    "host": "localhost",
    "port": 6379
  }'
```

**Set a key:**
```bash
curl -X PUT http://localhost:3000/api/v2/redis/db-123/keys/user:1 \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"John Doe","ttl":3600}'
```

**Scan keys:**
```bash
curl -H "API-Version: 2025-11-20" \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3000/api/v2/redis/db-123/keys?pattern=user:*&limit=10"
```

**Get memory stats:**
```bash
curl -H "API-Version: 2025-11-20" \
     -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3000/api/v2/redis/db-123/memory"
```

---

## 🔐 Security Features

- ✅ **Authentication required** - All endpoints use `authenticatedApiV2` wrapper
- ✅ **Rate limiting** - Built-in protection against abuse
- ✅ **Audit logging** - All operations logged for compliance
- ✅ **Input validation** - Comprehensive validation with detailed error messages
- ✅ **Connection pooling** - Circuit breaker protection for Redis operations
- ✅ **Tier-based limits** - Different limits for free/pro/enterprise tiers

---

## 🚀 Features

### Type Safety
- Full TypeScript implementation
- Type-safe database queries
- Validated request/response schemas

### Pagination
- Cursor-based pagination for key scanning
- Configurable limits (1-1000 per request)
- `hasMore` flag for client-side pagination

### Performance
- Connection pooling with circuit breakers
- Efficient SCAN operations (no blocking KEYS)
- Batch operations support

### Developer Experience
- Self-documenting through types
- Clear error messages
- RFC 9457 compliant errors
- Comprehensive test suite

---

## 📝 Implementation Notes

### Connection Management
- Uses `RedisClientWrapper` from `/apps/studio/lib/api/platform/redis.ts`
- Automatic connection pooling and cleanup
- Circuit breaker protection against failing databases

### Database Configuration
- Stored in `platform.databases` table
- Encrypted connection strings
- Support for SSL/TLS connections

### Cursor Pagination
- Base64 encoded cursors
- Stateless pagination (no server-side state)
- Works with Redis SCAN command

### Batch Operations
- Maximum 100 operations per request
- Partial success support (some operations can fail)
- Detailed result reporting per operation

---

## 🔧 Environment Variables

Required in `.env`:
```bash
DATABASE_URL=postgresql://...        # Platform database
PG_META_URL=http://localhost:8080   # pg-meta service
PG_META_CRYPTO_KEY=your-key-here    # Encryption key
```

---

## 📊 Metrics & Monitoring

All endpoints automatically log:
- Request duration
- User ID and organization
- HTTP method and path
- Response status code
- Error codes (if any)

Use these logs for:
- Performance monitoring
- Usage analytics
- Security auditing
- Debugging

---

## 🎓 Best Practices

### For Clients

1. **Always use cursor pagination** for scanning keys
2. **Set TTLs appropriately** to avoid memory bloat
3. **Use batch operations** for multiple key operations
4. **Handle 404 errors gracefully** when getting keys
5. **Respect rate limits** (check `Retry-After` header)

### For Developers

1. **Close Redis connections** - All endpoints use try/finally blocks
2. **Validate input** - Use ValidationError for detailed feedback
3. **Use appropriate HTTP methods** - GET (read), PUT (update), DELETE (remove)
4. **Return proper status codes** - 200, 201, 204, 400, 404, etc.
5. **Include context in errors** - Help users understand what went wrong

---

## 🐛 Troubleshooting

### Common Issues

**"Database not found"**
- Verify database ID is correct
- Check database hasn't been deleted
- Ensure user has access to the project

**"Connection failed"**
- Verify Redis server is running
- Check connection string format
- Ensure firewall allows connections

**"Rate limit exceeded"**
- Wait for the duration specified in `Retry-After` header
- Consider upgrading tier for higher limits
- Use batch operations to reduce request count

**"Invalid cursor"**
- Cursors are time-limited, start new scan
- Don't modify cursor values manually
- Use cursor from previous response

---

## 📚 Additional Resources

- [Redis SCAN documentation](https://redis.io/commands/scan/)
- [RFC 9457 - Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Cursor Pagination Best Practices](https://www.notion.so/Cursor-Pagination-Guide)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)

---

## ✅ Production Readiness Checklist

- ✅ Full TypeScript type safety
- ✅ RFC 9457 error handling
- ✅ Authentication and authorization
- ✅ Rate limiting
- ✅ Audit logging
- ✅ Input validation
- ✅ Cursor-based pagination
- ✅ Connection pooling
- ✅ Circuit breaker protection
- ✅ Comprehensive test suite
- ✅ Error handling for all edge cases
- ✅ Memory-safe operations (SCAN vs KEYS)
- ✅ Batch operation support
- ✅ TTL management
- ✅ Server info and monitoring
- ✅ Documentation

**Status: Production Ready** 🚀
