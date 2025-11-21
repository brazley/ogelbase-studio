# API v2 cURL Examples

Real-world HTTP requests for testing the API v2 layer.

---

## 🎯 Basic Requests

### Health Check

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  http://localhost:8082/api/v2/test
```

**Expected Response:**

```json
{
  "message": "API v2 is working!",
  "version": "2025-11-20",
  "timestamp": "2025-11-20T10:30:00.000Z",
  "headers": {
    "version": "2025-11-20",
    "userAgent": "curl/8.4.0"
  }
}
```

---

## 🚨 Error Handling

### 400 Bad Request

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/error?type=400"
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/BAD_REQUEST",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid request parameters",
  "errorCode": "BAD_REQUEST",
  "validationErrors": [
    {
      "field": "email",
      "message": "Email is required"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

### 404 Not Found

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/error?type=404"
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested project was not found",
  "errorCode": "NOT_FOUND"
}
```

### 422 Unprocessable Entity

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/error?type=422"
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/UNPROCESSABLE_ENTITY",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Invalid data format",
  "errorCode": "UNPROCESSABLE_ENTITY",
  "validationErrors": [
    {
      "field": "age",
      "message": "Age must be a positive integer"
    }
  ]
}
```

### 500 Internal Server Error

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/error?type=500"
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/INTERNAL_ERROR",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "Database connection failed",
  "errorCode": "INTERNAL_ERROR"
}
```

---

## 📄 Pagination

### First Page (Default Limit: 100)

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/pagination"
```

**Response:**

```json
{
  "data": [
    {
      "id": "1",
      "name": "Item 1",
      "description": "This is item number 1",
      "createdAt": "2025-11-20T10:00:00.000Z"
    }
  ],
  "cursor": "eyJpZCI6IjEwMCJ9",
  "hasMore": true
}
```

### Custom Limit

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/pagination?limit=10"
```

### Next Page with Cursor

```bash
# Get the cursor from the previous response
CURSOR="eyJpZCI6IjEwIn0="

curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/pagination?limit=10&cursor=${CURSOR}"
```

**Response:**

```json
{
  "data": [
    {
      "id": "11",
      "name": "Item 11",
      "description": "This is item number 11",
      "createdAt": "2025-11-20T09:59:50.000Z"
    }
  ],
  "cursor": "eyJpZCI6IjIwIn0=",
  "hasMore": true
}
```

### Invalid Limit (Too Large)

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  "http://localhost:8082/api/v2/test/pagination?limit=5000"
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/BAD_REQUEST",
  "title": "Bad Request",
  "status": 400,
  "detail": "Limit cannot exceed 1000",
  "errorCode": "BAD_REQUEST"
}
```

---

## 🔒 Rate Limiting

### Normal Request

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  http://localhost:8082/api/v2/test/rate-limit
```

**Response Headers:**

```
HTTP/1.1 200 OK
API-Version: 2025-11-20
RateLimit-Limit: 5
RateLimit-Remaining: 4
RateLimit-Reset: 1732147260
```

**Response Body:**

```json
{
  "message": "Rate limit test successful",
  "timestamp": "2025-11-20T10:30:00.000Z",
  "rateLimitInfo": {
    "limit": "5",
    "remaining": "4",
    "reset": "1732147260"
  },
  "instructions": "Make more than 5 requests within 60 seconds to trigger rate limiting"
}
```

### Trigger Rate Limit (6th Request)

```bash
# Make 6 requests quickly
for i in {1..6}; do
  echo "Request $i:"
  curl -i \
    -H "API-Version: 2025-11-20" \
    http://localhost:8082/api/v2/test/rate-limit
  echo ""
  sleep 0.5
done
```

**6th Request Response:**

```
HTTP/1.1 429 Too Many Requests
API-Version: 2025-11-20
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 1732147260
Retry-After: 60
Content-Type: application/problem+json
```

```json
{
  "type": "https://api.supabase.com/errors/RATE_LIMIT_EXCEEDED",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. You can make 5 requests per 60 seconds.",
  "errorCode": "RATE_LIMIT_EXCEEDED"
}
```

---

## 🔄 API Versioning

### With API-Version Header (Preferred)

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  http://localhost:8082/api/v2/test
```

### With X-API-Version Header (Alternative)

```bash
curl -i \
  -H "X-API-Version: 2025-11-20" \
  http://localhost:8082/api/v2/test
```

### Without Version Header (Uses Default)

```bash
curl -i http://localhost:8082/api/v2/test
```

**Response Headers:**

```
API-Version: 2025-11-20
X-API-Version: 2025-11-20
```

### Invalid Version Format

```bash
curl -i \
  -H "API-Version: invalid-version" \
  http://localhost:8082/api/v2/test
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/invalid-version",
  "title": "Invalid API Version",
  "status": 400,
  "detail": "API version must be in YYYY-MM-DD format. Received: invalid-version",
  "errorCode": "INVALID_API_VERSION"
}
```

### Unsupported Version

```bash
curl -i \
  -H "API-Version: 2024-01-01" \
  http://localhost:8082/api/v2/test
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/unsupported-version",
  "title": "Unsupported API Version",
  "status": 400,
  "detail": "API version 2024-01-01 is not supported. Supported versions: 2025-11-20",
  "errorCode": "UNSUPPORTED_API_VERSION"
}
```

---

## 🚫 Method Not Allowed

### POST to GET-Only Endpoint

```bash
curl -i -X POST \
  -H "API-Version: 2025-11-20" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' \
  http://localhost:8082/api/v2/test
```

**Response:**

```
HTTP/1.1 405 Method Not Allowed
Allow: GET
Content-Type: application/problem+json
```

```json
{
  "type": "https://api.supabase.com/errors/method-not-allowed",
  "title": "Method Not Allowed",
  "status": 405,
  "detail": "Method POST is not allowed for this endpoint. Allowed methods: GET",
  "errorCode": "METHOD_NOT_ALLOWED"
}
```

---

## 🔐 Authenticated Requests

### With Bearer Token

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -i \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8082/api/v2/authenticated-endpoint
```

### Without Token (401 Unauthorized)

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  http://localhost:8082/api/v2/authenticated-endpoint
```

**Response:**

```json
{
  "type": "https://api.supabase.com/errors/UNAUTHORIZED",
  "title": "Unauthorized",
  "status": 401,
  "detail": "missing access token",
  "errorCode": "UNAUTHORIZED"
}
```

---

## 📊 Complex Scenarios

### Paginated List with Authentication

```bash
TOKEN="your-jwt-token"

curl -i \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer ${TOKEN}" \
  "http://localhost:8082/api/v2/projects?limit=50"
```

### POST with JSON Body

```bash
curl -i -X POST \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "description": "A test project"
  }' \
  http://localhost:8082/api/v2/projects
```

### DELETE Request

```bash
curl -i -X DELETE \
  -H "API-Version: 2025-11-20" \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8082/api/v2/projects/123
```

**Success Response:**

```
HTTP/1.1 204 No Content
API-Version: 2025-11-20
```

---

## 🧪 Testing Scripts

### Quick Health Check

```bash
#!/bin/bash
BASE_URL="http://localhost:8082"

echo "Testing API v2..."
curl -s -H "API-Version: 2025-11-20" \
  "${BASE_URL}/api/v2/test" | jq .
```

### Test All Error Types

```bash
#!/bin/bash
BASE_URL="http://localhost:8082"

for error_type in 400 404 422 500; do
  echo "Testing ${error_type}..."
  curl -s -H "API-Version: 2025-11-20" \
    "${BASE_URL}/api/v2/test/error?type=${error_type}" | jq .
  echo ""
done
```

### Test Pagination Flow

```bash
#!/bin/bash
BASE_URL="http://localhost:8082"

echo "Fetching first page..."
response=$(curl -s -H "API-Version: 2025-11-20" \
  "${BASE_URL}/api/v2/test/pagination?limit=5")

echo "$response" | jq .

cursor=$(echo "$response" | jq -r '.cursor')

if [ "$cursor" != "null" ]; then
  echo "Fetching next page with cursor..."
  curl -s -H "API-Version: 2025-11-20" \
    "${BASE_URL}/api/v2/test/pagination?limit=5&cursor=${cursor}" | jq .
fi
```

### Stress Test Rate Limiting

```bash
#!/bin/bash
BASE_URL="http://localhost:8082"

echo "Sending 10 requests to trigger rate limit..."
for i in {1..10}; do
  response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -H "API-Version: 2025-11-20" \
    "${BASE_URL}/api/v2/test/rate-limit")

  status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
  echo "Request $i: Status $status"

  if [ "$status" == "429" ]; then
    echo "Rate limit triggered!"
    echo "$response" | sed '/HTTP_STATUS/d' | jq .
    break
  fi

  sleep 0.5
done
```

---

## 🎯 Production Examples

### With Custom User-Agent

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  -H "User-Agent: MyApp/1.0.0" \
  http://localhost:8082/api/v2/test
```

### With Accept Header

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  -H "Accept: application/json" \
  http://localhost:8082/api/v2/test
```

### With Request Tracing

```bash
curl -i \
  -H "API-Version: 2025-11-20" \
  -H "X-Request-ID: 550e8400-e29b-41d4-a716-446655440000" \
  http://localhost:8082/api/v2/test
```

---

## 📝 Notes

- Replace `localhost:8082` with your actual server URL
- Replace `your-jwt-token` with actual JWT tokens
- Use `-i` flag to see response headers
- Use `jq` for pretty-printing JSON responses
- Add `-v` flag for verbose output (debugging)
- Use `-s` flag for silent mode (no progress bar)

---

## 🚀 Quick Copy Commands

```bash
# Set base URL
export BASE_URL="http://localhost:8082"
export API_VERSION="2025-11-20"

# Quick test
curl -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test"

# Test error
curl -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/error?type=404"

# Test pagination
curl -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/pagination?limit=10"

# Test rate limit
for i in {1..10}; do curl -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/rate-limit"; done
```

---

**Ready to test!** 🧪
