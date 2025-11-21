#!/bin/bash

# MongoDB API Testing Script
# Tests all MongoDB management endpoints

# Configuration
API_BASE="http://localhost:3000/api/v2/mongodb"
API_VERSION="2025-11-20"
TOKEN="${AUTH_TOKEN:-your-token-here}"
DATABASE_ID="${DATABASE_ID:-db-123}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to make API call
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3

  echo -e "${YELLOW}>>> ${method} ${endpoint}${NC}"

  if [ -z "$data" ]; then
    curl -s -X ${method} \
      -H "API-Version: ${API_VERSION}" \
      -H "Authorization: Bearer ${TOKEN}" \
      "${API_BASE}/${endpoint}" | jq '.'
  else
    curl -s -X ${method} \
      -H "API-Version: ${API_VERSION}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${data}" \
      "${API_BASE}/${endpoint}" | jq '.'
  fi

  echo ""
}

echo "=========================================="
echo "MongoDB API Endpoint Testing"
echo "=========================================="
echo "Database ID: ${DATABASE_ID}"
echo "API Version: ${API_VERSION}"
echo ""

# 1. List Databases
echo -e "${GREEN}1. List Databases${NC}"
api_call "GET" "${DATABASE_ID}/databases"

# 2. Create Database
echo -e "${GREEN}2. Create Database${NC}"
api_call "POST" "${DATABASE_ID}/databases" '{
  "name": "test_db"
}'

# 3. List Collections
echo -e "${GREEN}3. List Collections${NC}"
api_call "GET" "${DATABASE_ID}/collections?database=test_db"

# 4. Create Collection
echo -e "${GREEN}4. Create Collection${NC}"
api_call "POST" "${DATABASE_ID}/collections" '{
  "database": "test_db",
  "collection": "users",
  "options": {}
}'

# 5. Insert Document
echo -e "${GREEN}5. Insert Document${NC}"
INSERT_RESULT=$(api_call "POST" "${DATABASE_ID}/documents" '{
  "database": "test_db",
  "collection": "users",
  "document": {
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30,
    "role": "developer"
  }
}')

echo "$INSERT_RESULT"

# Extract inserted ID
DOCUMENT_ID=$(echo "$INSERT_RESULT" | jq -r '.insertedId')
echo -e "${YELLOW}Inserted Document ID: ${DOCUMENT_ID}${NC}"
echo ""

# 6. Query Documents (with pagination)
echo -e "${GREEN}6. Query Documents${NC}"
api_call "GET" "${DATABASE_ID}/documents?database=test_db&collection=users&filter={}&limit=10"

# 7. Get Single Document
if [ "$DOCUMENT_ID" != "null" ] && [ -n "$DOCUMENT_ID" ]; then
  echo -e "${GREEN}7. Get Single Document${NC}"
  api_call "GET" "${DATABASE_ID}/documents/${DOCUMENT_ID}?database=test_db&collection=users"

  # 8. Update Document
  echo -e "${GREEN}8. Update Document${NC}"
  api_call "PATCH" "${DATABASE_ID}/documents/${DOCUMENT_ID}" '{
    "database": "test_db",
    "collection": "users",
    "update": {
      "$set": {
        "age": 31,
        "updated": true
      }
    }
  }'
fi

# 9. Collection Stats
echo -e "${GREEN}9. Collection Stats${NC}"
api_call "GET" "${DATABASE_ID}/collections/users/stats?database=test_db"

# 10. Create Index
echo -e "${GREEN}10. Create Index${NC}"
api_call "POST" "${DATABASE_ID}/indexes" '{
  "database": "test_db",
  "collection": "users",
  "key": {
    "email": 1
  },
  "options": {
    "unique": true,
    "name": "email_unique"
  }
}'

# 11. List Indexes
echo -e "${GREEN}11. List Indexes${NC}"
api_call "GET" "${DATABASE_ID}/indexes?database=test_db&collection=users"

# 12. Aggregation Pipeline (Simple)
echo -e "${GREEN}12. Aggregation Pipeline (Simple)${NC}"
api_call "POST" "${DATABASE_ID}/aggregate" '{
  "database": "test_db",
  "collection": "users",
  "pipeline": [
    { "$match": { "age": { "$gte": 25 } } },
    { "$group": { "_id": "$role", "count": { "$sum": 1 } } },
    { "$sort": { "count": -1 } }
  ]
}'

# 13. Aggregation Pipeline (Complex with validation)
echo -e "${GREEN}13. Aggregation Pipeline (Complex)${NC}"
api_call "POST" "${DATABASE_ID}/aggregate" '{
  "database": "test_db",
  "collection": "users",
  "pipeline": [
    { "$match": { "age": { "$gte": 18 } } },
    { "$project": { "name": 1, "email": 1, "age": 1 } },
    { "$limit": 100 }
  ],
  "options": {
    "maxTimeMS": 5000
  }
}'

# 14. Test Invalid Pipeline (Should fail)
echo -e "${GREEN}14. Test Invalid Pipeline (Should Reject)${NC}"
api_call "POST" "${DATABASE_ID}/aggregate" '{
  "database": "test_db",
  "collection": "users",
  "pipeline": [
    { "$where": "this.age > 25" }
  ]
}'

# 15. Delete Document
if [ "$DOCUMENT_ID" != "null" ] && [ -n "$DOCUMENT_ID" ]; then
  echo -e "${GREEN}15. Delete Document${NC}"
  api_call "DELETE" "${DATABASE_ID}/documents/${DOCUMENT_ID}?database=test_db&collection=users"
fi

# 16. Test Pagination with Cursor
echo -e "${GREEN}16. Test Cursor Pagination${NC}"
# First, insert multiple documents
for i in {1..5}; do
  api_call "POST" "${DATABASE_ID}/documents" '{
    "database": "test_db",
    "collection": "users",
    "document": {
      "name": "User '${i}'",
      "email": "user'${i}'@example.com",
      "index": '${i}'
    }
  }' > /dev/null
done

# Query with limit
FIRST_PAGE=$(api_call "GET" "${DATABASE_ID}/documents?database=test_db&collection=users&limit=2")
echo "$FIRST_PAGE"

# Extract cursor
CURSOR=$(echo "$FIRST_PAGE" | jq -r '.cursor')
echo -e "${YELLOW}Next Cursor: ${CURSOR}${NC}"

# Query next page if cursor exists
if [ "$CURSOR" != "null" ] && [ -n "$CURSOR" ]; then
  echo -e "${GREEN}16b. Query Next Page${NC}"
  api_call "GET" "${DATABASE_ID}/documents?database=test_db&collection=users&cursor=${CURSOR}&limit=2"
fi

echo ""
echo "=========================================="
echo "MongoDB API Testing Complete!"
echo "=========================================="
