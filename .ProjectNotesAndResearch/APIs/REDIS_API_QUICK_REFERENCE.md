# Redis API v2 - Quick Reference

## 🚀 Quick Start

```bash
# Set your token
export TOKEN="your-supabase-token"
export BASE_URL="http://localhost:3000"
```

## 📋 All Endpoints

### Database Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/databases?projectId={id}` | List databases |
| `POST` | `/api/v2/databases` | Create database |
| `GET` | `/api/v2/databases/{id}` | Get database |
| `PATCH` | `/api/v2/databases/{id}` | Update database |
| `DELETE` | `/api/v2/databases/{id}` | Delete database |
| `POST` | `/api/v2/databases/{id}/test` | Test connection |

### Redis Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/redis/{dbId}/keys?pattern=*&limit=100` | Scan keys |
| `POST` | `/api/v2/redis/{dbId}/keys` | Batch operations |
| `GET` | `/api/v2/redis/{dbId}/keys/{key}` | Get key |
| `PUT` | `/api/v2/redis/{dbId}/keys/{key}` | Set key |
| `DELETE` | `/api/v2/redis/{dbId}/keys/{key}` | Delete key |
| `GET` | `/api/v2/redis/{dbId}/keys/{key}/ttl` | Get TTL |
| `POST` | `/api/v2/redis/{dbId}/keys/{key}/ttl` | Set TTL |
| `GET` | `/api/v2/redis/{dbId}/info?section=memory` | Server info |
| `GET` | `/api/v2/redis/{dbId}/memory` | Memory stats |

## 💻 Common Commands

### Create Database
```bash
curl -X POST $BASE_URL/api/v2/databases \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj-123",
    "name": "My Redis",
    "type": "redis",
    "connection_string": "redis://localhost:6379",
    "host": "localhost",
    "port": 6379
  }'
```

### Set Key
```bash
curl -X PUT $BASE_URL/api/v2/redis/db-123/keys/user:1 \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"John","ttl":3600}'
```

### Get Key
```bash
curl -H "API-Version: 2025-11-20" \
     -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/v2/redis/db-123/keys/user:1"
```

### Scan Keys
```bash
curl -H "API-Version: 2025-11-20" \
     -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/v2/redis/db-123/keys?pattern=user:*&limit=100"
```

### Batch Set
```bash
curl -X POST $BASE_URL/api/v2/redis/db-123/keys \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {"action":"set","key":"k1","value":"v1","ttl":300},
      {"action":"set","key":"k2","value":"v2"}
    ]
  }'
```

### Memory Stats
```bash
curl -H "API-Version: 2025-11-20" \
     -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/v2/redis/db-123/memory"
```

## 🔑 Headers

All requests require:
```
API-Version: 2025-11-20
Authorization: Bearer {token}
Content-Type: application/json  (for POST/PUT/PATCH)
```

## ⚡ Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (deleted) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Server Error |

## 🧪 Test Suite

```bash
# Run all tests
./test-redis-api.sh

# Set custom endpoint
BASE_URL=http://localhost:3000 ./test-redis-api.sh
```

## 📊 Key Limits

| Tier | Keys/Scan | Batch Ops | Rate Limit |
|------|-----------|-----------|------------|
| Free | 1-1000 | 100 | 100/min |
| Pro | 1-1000 | 100 | 1000/min |
| Enterprise | 1-1000 | 100 | Custom |

## 🔍 Pagination Example

```bash
# First page
curl "$BASE_URL/api/v2/redis/db-123/keys?limit=10"

# Response includes cursor
{
  "data": [...],
  "cursor": "bmV4dDEyMw==",
  "hasMore": true
}

# Next page
curl "$BASE_URL/api/v2/redis/db-123/keys?limit=10&cursor=bmV4dDEyMw=="
```

## ❌ Error Format (RFC 9457)

```json
{
  "type": "https://api.supabase.com/errors/NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Key 'user:999' not found",
  "errorCode": "NOT_FOUND"
}
```

## 📁 File Structure

```
apps/studio/
├── lib/api/
│   ├── platform/
│   │   ├── databases.ts        # DB config helpers
│   │   └── redis.ts            # Redis client wrapper
│   └── v2/
│       ├── apiWrapper.ts       # Auth, rate limit, audit
│       ├── errorHandler.ts     # RFC 9457 errors
│       └── pagination.ts       # Cursor pagination
└── pages/api/v2/
    ├── databases/
    │   ├── index.ts            # List, create
    │   └── [id]/
    │       ├── index.ts        # Get, update, delete
    │       └── test.ts         # Test connection
    └── redis/[databaseId]/
        ├── keys/
        │   ├── index.ts        # Scan, batch
        │   └── [key]/
        │       ├── index.ts    # Get, set, delete
        │       └── ttl.ts      # TTL management
        ├── info/index.ts       # Server info
        └── memory/index.ts     # Memory stats
```

## 🎯 Common Patterns

### Check if key exists
```bash
curl "$BASE_URL/api/v2/redis/db-123/keys/mykey"
# 200 = exists, 404 = doesn't exist
```

### Set with expiration
```bash
curl -X PUT "$BASE_URL/api/v2/redis/db-123/keys/session:abc" \
  -d '{"value":"data","ttl":1800}'
```

### Scan all keys (paginated)
```bash
# Keep calling with returned cursor until hasMore=false
while [ "$HAS_MORE" != "false" ]; do
  curl "$BASE_URL/api/v2/redis/db-123/keys?cursor=$CURSOR"
done
```

### Batch delete
```bash
curl -X POST "$BASE_URL/api/v2/redis/db-123/keys" \
  -d '{
    "operations":[
      {"action":"delete","key":"tmp:1"},
      {"action":"delete","key":"tmp:2"}
    ]
  }'
```

---

**Ready to use!** 🎉

For full documentation, see `REDIS_API_DOCUMENTATION.md`
