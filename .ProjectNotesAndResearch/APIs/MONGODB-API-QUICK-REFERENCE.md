# MongoDB API - Quick Reference

## Base URL
```
/api/v2/mongodb/[databaseId]
```

## Headers Required
```
API-Version: 2025-11-20
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

## Endpoints Cheat Sheet

### Databases
```bash
# List
GET /databases

# Create
POST /databases
{"name": "mydb"}
```

### Collections
```bash
# List
GET /collections?database=mydb

# Create
POST /collections
{"database": "mydb", "collection": "users"}

# Stats
GET /collections/users/stats?database=mydb
```

### Documents
```bash
# Query (paginated)
GET /documents?database=mydb&collection=users&filter={}&limit=100

# Insert
POST /documents
{"database": "mydb", "collection": "users", "document": {...}}

# Get by ID
GET /documents/507f1f77bcf86cd799439011?database=mydb&collection=users

# Update
PATCH /documents/507f1f77bcf86cd799439011
{"database": "mydb", "collection": "users", "update": {"$set": {...}}}

# Delete
DELETE /documents/507f1f77bcf86cd799439011?database=mydb&collection=users
```

### Aggregation
```bash
# Execute pipeline
POST /aggregate
{
  "database": "mydb",
  "collection": "users",
  "pipeline": [
    {"$match": {"age": {"$gte": 25}}},
    {"$group": {"_id": "$role", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
  ]
}
```

### Indexes
```bash
# List
GET /indexes?database=mydb&collection=users

# Create
POST /indexes
{
  "database": "mydb",
  "collection": "users",
  "key": {"email": 1},
  "options": {"unique": true}
}
```

## Common Filters

```javascript
// Equal
{"name": "John"}

// Greater than
{"age": {"$gte": 25}}

// In array
{"role": {"$in": ["admin", "developer"]}}

// And condition
{"age": {"$gte": 18}, "role": "developer"}

// Or condition
{"$or": [{"role": "admin"}, {"role": "developer"}]}

// Regex
{"email": {"$regex": "@example.com$"}}

// Exists
{"profile": {"$exists": true}}
```

## Common Aggregations

```javascript
// Group by field
[
  {"$group": {"_id": "$role", "count": {"$sum": 1}}}
]

// Average
[
  {"$group": {"_id": null, "avgAge": {"$avg": "$age"}}}
]

// Filter then group
[
  {"$match": {"age": {"$gte": 18}}},
  {"$group": {"_id": "$role", "count": {"$sum": 1}}}
]

// Lookup (join)
[
  {
    "$lookup": {
      "from": "posts",
      "localField": "_id",
      "foreignField": "user_id",
      "as": "posts"
    }
  }
]

// Count
[
  {"$count": "total"}
]
```

## Update Operators

```javascript
// Set fields
{"$set": {"name": "John", "age": 30}}

// Increment
{"$inc": {"login_count": 1, "age": 1}}

// Unset (remove field)
{"$unset": {"temp_field": ""}}

// Push to array
{"$push": {"tags": "new-tag"}}

// Pull from array
{"$pull": {"tags": "old-tag"}}

// Add to set (unique)
{"$addToSet": {"tags": "unique-tag"}}

// Multiply
{"$mul": {"price": 1.1}}

// Min/Max
{"$min": {"score": 100}}
{"$max": {"score": 0}}

// Current date
{"$currentDate": {"updated_at": true}}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 400  | Bad Request - Invalid parameters |
| 401  | Unauthorized - Missing/invalid token |
| 403  | Forbidden - No access |
| 404  | Not Found - Resource doesn't exist |
| 422  | Validation Failed |
| 429  | Rate Limited |
| 500  | Server Error |

## Pagination

```bash
# First page
GET /documents?database=mydb&collection=users&limit=100

# Response includes cursor
{
  "data": [...],
  "cursor": "NTA3ZjFmNzdiY2Y4NmNkNzk5NDM5MDEx",
  "hasMore": true
}

# Next page
GET /documents?database=mydb&collection=users&cursor=NTA3ZjFmNzdiY2Y4NmNkNzk5NDM5MDEx&limit=100
```

## Security Rules

### Allowed
- All standard MongoDB query operators
- 20+ aggregation stages (match, group, lookup, etc.)
- Safe update operators

### Forbidden
- `$where` operator (JavaScript)
- `$function` operator (JavaScript)
- `$out` stage (writes)
- `$merge` stage (merges)
- Pipeline > 20 stages
- Pipeline depth > 5 levels
- Query cost > 150

## Index Types

```javascript
// Ascending
{"email": 1}

// Descending
{"created_at": -1}

// Compound
{"role": 1, "age": -1}

// Text search
{"description": "text"}

// Geospatial
{"location": "2dsphere"}

// TTL (auto-delete)
{"created_at": 1}
// options: {"expireAfterSeconds": 86400}
```

## Testing

```bash
# Set environment
export DATABASE_ID="your-db-id"
export AUTH_TOKEN="your-token"

# Run test suite
./test-mongodb-api.sh
```

## Files Created

```
Helpers & Validation:
  lib/api/platform/mongodb-validation.ts (340 lines)
  lib/api/platform/mongodb-helpers.ts (77 lines)

API Endpoints:
  pages/api/v2/mongodb/[databaseId]/
    ├── databases/index.ts (90 lines)
    ├── collections/
    │   ├── index.ts (114 lines)
    │   └── [name]/stats.ts (70 lines)
    ├── documents/
    │   ├── index.ts (168 lines)
    │   └── [id]/index.ts (210 lines)
    ├── aggregate/index.ts (113 lines)
    └── indexes/index.ts (169 lines)

Documentation:
  MONGODB-API-DOCUMENTATION.md (12K)
  MONGODB-API-IMPLEMENTATION-SUMMARY.md (14K)
  test-mongodb-api.sh (5.5K)
```

## Performance Tips

1. **Use indexes** - Create indexes on frequently queried fields
2. **Limit early** - Add `$limit` stage early in pipeline
3. **Match first** - Put `$match` at beginning to reduce data
4. **Project wisely** - Use `$project` to reduce document size
5. **Monitor costs** - Check `estimatedCost` in aggregation responses
6. **Pagination** - Always use cursor pagination for large datasets

## Common Use Cases

### User Analytics
```javascript
// Active users by role
POST /aggregate
{
  "pipeline": [
    {"$match": {"active": true}},
    {"$group": {"_id": "$role", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
  ]
}
```

### Recent Activity
```javascript
// Last 10 logins
GET /documents?database=mydb&collection=logins&limit=10&sort={"timestamp":-1}
```

### Data Cleanup
```javascript
// Delete old records
DELETE /documents?database=mydb&collection=logs&filter={"created_at":{"$lt":"2024-01-01"}}
```

### Unique Values
```javascript
// Get unique roles
POST /aggregate
{
  "pipeline": [
    {"$group": {"_id": "$role"}},
    {"$sort": {"_id": 1}}
  ]
}
```

## Support

- Full Documentation: `MONGODB-API-DOCUMENTATION.md`
- Implementation Details: `MONGODB-API-IMPLEMENTATION-SUMMARY.md`
- Test Script: `./test-mongodb-api.sh`
