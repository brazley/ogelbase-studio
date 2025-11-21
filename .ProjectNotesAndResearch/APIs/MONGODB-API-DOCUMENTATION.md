# MongoDB Management API Documentation

Complete MongoDB database management via RESTful API endpoints with pagination, aggregation, and security validation.

## Overview

The MongoDB API provides full database management capabilities:
- Database and collection management
- Document CRUD operations with cursor pagination
- Aggregation pipelines with cost estimation
- Index management
- Query safety and validation

## Base URL

```
/api/v2/mongodb/[databaseId]
```

## Authentication

All endpoints require authentication via Bearer token:

```bash
Authorization: Bearer <your-token>
API-Version: 2025-11-20
```

## Endpoints

### 1. Database Management

#### List Databases

```http
GET /api/v2/mongodb/[databaseId]/databases
```

**Response:**
```json
{
  "databases": [
    {
      "name": "mydb",
      "sizeOnDisk": 123456789,
      "empty": false
    }
  ],
  "totalSize": 123456789,
  "totalSizeMb": 117.7
}
```

#### Create Database

```http
POST /api/v2/mongodb/[databaseId]/databases
```

**Request:**
```json
{
  "name": "new_database"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Database \"new_database\" created successfully",
  "name": "new_database"
}
```

### 2. Collection Management

#### List Collections

```http
GET /api/v2/mongodb/[databaseId]/collections?database=mydb
```

**Query Parameters:**
- `database` (required) - Database name

**Response:**
```json
{
  "database": "mydb",
  "collections": [
    {
      "name": "users",
      "type": "collection",
      "options": {},
      "info": { "readOnly": false }
    }
  ],
  "count": 1
}
```

#### Create Collection

```http
POST /api/v2/mongodb/[databaseId]/collections
```

**Request:**
```json
{
  "database": "mydb",
  "collection": "users",
  "options": {
    "capped": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Collection \"users\" created successfully",
  "database": "mydb",
  "collection": "users"
}
```

#### Get Collection Stats

```http
GET /api/v2/mongodb/[databaseId]/collections/[name]/stats?database=mydb
```

**Response:**
```json
{
  "collection": "users",
  "database": "mydb",
  "namespace": "mydb.users",
  "count": 1250,
  "size": 524288,
  "avgObjSize": 419,
  "storageSize": 1048576,
  "nindexes": 2,
  "totalIndexSize": 81920,
  "indexSizes": {
    "_id_": 40960,
    "email_unique": 40960
  },
  "capped": false
}
```

### 3. Document Operations

#### Query Documents (with Pagination)

```http
GET /api/v2/mongodb/[databaseId]/documents?database=mydb&collection=users&filter={}&cursor=abc&limit=100
```

**Query Parameters:**
- `database` (required) - Database name
- `collection` (required) - Collection name
- `filter` (optional) - JSON filter object (default: `{}`)
- `cursor` (optional) - Pagination cursor
- `limit` (optional) - Results per page (default: 100, max: 1000)

**Response:**
```json
{
  "database": "mydb",
  "collection": "users",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "age": 30
    }
  ],
  "cursor": "NTA3ZjFmNzdiY2Y4NmNkNzk5NDM5MDEx",
  "hasMore": true,
  "count": 100
}
```

**Filter Examples:**
```bash
# Find users over 25
?filter={"age":{"$gte":25}}

# Find by email
?filter={"email":"john@example.com"}

# Complex query
?filter={"age":{"$gte":18,"$lte":65},"role":"developer"}
```

#### Insert Document

```http
POST /api/v2/mongodb/[databaseId]/documents
```

**Request:**
```json
{
  "database": "mydb",
  "collection": "users",
  "document": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "age": 28,
    "role": "designer"
  }
}
```

**Response:**
```json
{
  "success": true,
  "insertedId": "507f1f77bcf86cd799439011",
  "database": "mydb",
  "collection": "users"
}
```

#### Get Single Document

```http
GET /api/v2/mongodb/[databaseId]/documents/[id]?database=mydb&collection=users
```

**Response:**
```json
{
  "database": "mydb",
  "collection": "users",
  "document": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  }
}
```

#### Update Document

```http
PATCH /api/v2/mongodb/[databaseId]/documents/[id]
```

**Request:**
```json
{
  "database": "mydb",
  "collection": "users",
  "update": {
    "$set": {
      "age": 31,
      "updated_at": "2025-11-20T10:00:00Z"
    },
    "$inc": {
      "login_count": 1
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "matchedCount": 1,
  "modifiedCount": 1,
  "database": "mydb",
  "collection": "users",
  "id": "507f1f77bcf86cd799439011"
}
```

#### Delete Document

```http
DELETE /api/v2/mongodb/[databaseId]/documents/[id]?database=mydb&collection=users
```

**Response:**
```json
{
  "success": true,
  "deletedCount": 1,
  "database": "mydb",
  "collection": "users",
  "id": "507f1f77bcf86cd799439011"
}
```

### 4. Aggregation Pipeline

```http
POST /api/v2/mongodb/[databaseId]/aggregate
```

**Request:**
```json
{
  "database": "mydb",
  "collection": "users",
  "pipeline": [
    { "$match": { "age": { "$gte": 25 } } },
    { "$group": { "_id": "$role", "count": { "$sum": 1 }, "avgAge": { "$avg": "$age" } } },
    { "$sort": { "count": -1 } },
    { "$limit": 10 }
  ],
  "options": {
    "maxTimeMS": 10000,
    "allowDiskUse": false
  }
}
```

**Response:**
```json
{
  "database": "mydb",
  "collection": "users",
  "data": [
    {
      "_id": "developer",
      "count": 45,
      "avgAge": 32.5
    },
    {
      "_id": "designer",
      "count": 23,
      "avgAge": 29.8
    }
  ],
  "count": 2,
  "meta": {
    "pipelineStages": 4,
    "estimatedCost": 28,
    "executionTimeMs": 156
  }
}
```

**Allowed Pipeline Stages:**
- `$match`, `$project`, `$limit`, `$skip`, `$sort`
- `$group`, `$unwind`, `$lookup`, `$addFields`
- `$count`, `$sample`, `$replaceRoot`, `$facet`
- `$bucket`, `$bucketAuto`, `$sortByCount`
- `$geoNear`, `$graphLookup`, `$redact`, `$unionWith`

**Forbidden Stages (Security):**
- `$out` - Writes to collection
- `$merge` - Merges with collection
- `$where` - JavaScript execution
- `$function` - Custom JavaScript
- `$accumulator` - Custom accumulators

**Cost Limits:**
- Simple queries: < 10
- Moderate queries: 10-50
- Complex queries: 50-100
- Maximum allowed: 150

### 5. Index Management

#### List Indexes

```http
GET /api/v2/mongodb/[databaseId]/indexes?database=mydb&collection=users
```

**Response:**
```json
{
  "database": "mydb",
  "collection": "users",
  "indexes": [
    {
      "name": "_id_",
      "key": { "_id": 1 },
      "unique": false,
      "sparse": false,
      "v": 2
    },
    {
      "name": "email_unique",
      "key": { "email": 1 },
      "unique": true,
      "sparse": false,
      "v": 2
    }
  ],
  "count": 2
}
```

#### Create Index

```http
POST /api/v2/mongodb/[databaseId]/indexes
```

**Request:**
```json
{
  "database": "mydb",
  "collection": "users",
  "key": {
    "email": 1
  },
  "options": {
    "unique": true,
    "sparse": false,
    "name": "email_unique"
  }
}
```

**Index Types:**
- `1` - Ascending index
- `-1` - Descending index
- `"text"` - Text index
- `"2d"` - 2D geospatial index
- `"2dsphere"` - 2D sphere geospatial index

**Response:**
```json
{
  "success": true,
  "indexName": "email_unique",
  "database": "mydb",
  "collection": "users",
  "key": { "email": 1 },
  "options": {
    "unique": true,
    "name": "email_unique"
  }
}
```

## Error Handling

All endpoints return RFC 9457 Problem Details format for errors:

```json
{
  "type": "https://api.supabase.com/errors/BAD_REQUEST",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid JSON filter",
  "errorCode": "BAD_REQUEST",
  "instance": "/api/v2/mongodb/db-123/documents"
}
```

**Common Errors:**
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (no access to database)
- `404` - Not Found (database/document not found)
- `422` - Unprocessable Entity (validation failed)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Security & Validation

### Query Validation
- Filters are validated to prevent `$where` and `$function` operators
- Aggregation pipelines are whitelisted by stage
- Maximum pipeline complexity enforced
- Execution timeouts enforced

### Collection/Database Names
- Must not start with `system.`
- Cannot contain `$` or null characters
- Maximum 255 characters for collections
- Maximum 64 characters for databases

### Rate Limiting
- Free tier: 100 requests/minute
- Pro tier: 1000 requests/minute
- Enterprise: Custom limits

## Pagination

All list endpoints support cursor-based pagination:

1. First request returns data + cursor
2. Use cursor in next request to get next page
3. `hasMore` indicates if more results exist

**Example:**
```bash
# Page 1
GET /documents?database=mydb&collection=users&limit=100

# Response includes cursor
{
  "data": [...],
  "cursor": "NTA3ZjFmNzdiY2Y4NmNkNzk5NDM5MDEx",
  "hasMore": true
}

# Page 2
GET /documents?database=mydb&collection=users&cursor=NTA3ZjFmNzdiY2Y4NmNkNzk5NDM5MDEx&limit=100
```

## Testing

Run the test suite:

```bash
export DATABASE_ID="your-database-id"
export AUTH_TOKEN="your-auth-token"
./test-mongodb-api.sh
```

## Examples

### User Management System

```bash
# Create users collection
curl -X POST http://localhost:3000/api/v2/mongodb/db-123/collections \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database": "app",
    "collection": "users"
  }'

# Create email index
curl -X POST http://localhost:3000/api/v2/mongodb/db-123/indexes \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database": "app",
    "collection": "users",
    "key": { "email": 1 },
    "options": { "unique": true }
  }'

# Insert users
curl -X POST http://localhost:3000/api/v2/mongodb/db-123/documents \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database": "app",
    "collection": "users",
    "document": {
      "name": "Alice",
      "email": "alice@example.com",
      "role": "admin",
      "created_at": "2025-11-20T10:00:00Z"
    }
  }'

# Query active admins
curl -X GET "http://localhost:3000/api/v2/mongodb/db-123/documents?database=app&collection=users&filter=%7B%22role%22%3A%22admin%22%7D" \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN"

# Aggregate user statistics by role
curl -X POST http://localhost:3000/api/v2/mongodb/db-123/aggregate \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database": "app",
    "collection": "users",
    "pipeline": [
      { "$group": { "_id": "$role", "count": { "$sum": 1 } } },
      { "$sort": { "count": -1 } }
    ]
  }'
```

## Implementation Files

### Core Files Created:
1. **Validation** - `/apps/studio/lib/api/platform/mongodb-validation.ts`
   - Pipeline validation
   - Filter safety checks
   - Cost estimation

2. **Helpers** - `/apps/studio/lib/api/platform/mongodb-helpers.ts`
   - Database config retrieval
   - Client creation

3. **API Endpoints**:
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/databases/index.ts`
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/collections/index.ts`
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/collections/[name]/stats.ts`
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/documents/index.ts`
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/documents/[id]/index.ts`
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/aggregate/index.ts`
   - `/apps/studio/pages/api/v2/mongodb/[databaseId]/indexes/index.ts`

## Next Steps

1. Deploy to staging environment
2. Run test suite against real MongoDB instance
3. Monitor query performance and costs
4. Adjust rate limits based on usage
5. Add more complex aggregation examples to docs
