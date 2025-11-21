#!/bin/bash

# Redis API v2 Testing Script
# This script tests all Redis management API endpoints

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_VERSION="2025-11-20"
TOKEN="${SUPABASE_TOKEN:-your-token-here}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Test $TESTS_RUN: $test_name"

    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "API-Version: $API_VERSION" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "API-Version: $API_VERSION" \
            -H "Authorization: Bearer $TOKEN" \
            "$BASE_URL$endpoint")
    fi

    # Extract status code (last line)
    status_code=$(echo "$response" | tail -n 1)
    # Extract body (everything except last line)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" -eq "$expected_status" ]; then
        log_success "Status: $status_code (expected $expected_status)"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo ""
        return 0
    else
        log_error "Status: $status_code (expected $expected_status)"
        echo "Response: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo ""
        return 1
    fi
}

echo "=================================================="
echo "Redis Management API v2 Test Suite"
echo "=================================================="
echo ""

# Database Management API Tests
echo "--- Database Management API Tests ---"
echo ""

PROJECT_ID="${PROJECT_ID:-test-project-123}"

# Test 1: Create a Redis database connection
log_info "Creating test Redis database connection..."
DB_CREATE_DATA='{
  "projectId": "'$PROJECT_ID'",
  "name": "Test Redis DB",
  "type": "redis",
  "connection_string": "redis://localhost:6379",
  "host": "localhost",
  "port": 6379,
  "ssl_enabled": false
}'

run_test "Create Redis database" "POST" "/api/v2/databases" "$DB_CREATE_DATA" 201 || true
DB_ID=$(echo "$body" | jq -r '.data.id' 2>/dev/null || echo "test-db-123")

# Test 2: List databases
run_test "List databases" "GET" "/api/v2/databases?projectId=$PROJECT_ID" "" 200 || true

# Test 3: Get single database
if [ -n "$DB_ID" ] && [ "$DB_ID" != "null" ]; then
    run_test "Get database by ID" "GET" "/api/v2/databases/$DB_ID" "" 200 || true

    # Test 4: Test database connection
    run_test "Test database connection" "POST" "/api/v2/databases/$DB_ID/test" "" 200 || true

    # Test 5: Update database
    DB_UPDATE_DATA='{"name": "Updated Redis DB"}'
    run_test "Update database" "PATCH" "/api/v2/databases/$DB_ID" "$DB_UPDATE_DATA" 200 || true
fi

echo ""
echo "--- Redis Operations API Tests ---"
echo ""

# Use a test database ID (replace with actual ID if available)
TEST_DB_ID="${DB_ID:-test-db-123}"

# Test 6: Set a key
KEY_SET_DATA='{"value": "test-value-123", "ttl": 3600}'
run_test "Set Redis key" "PUT" "/api/v2/redis/$TEST_DB_ID/keys/test:key:1" "$KEY_SET_DATA" 200 || true

# Test 7: Get a key
run_test "Get Redis key" "GET" "/api/v2/redis/$TEST_DB_ID/keys/test:key:1" "" 200 || true

# Test 8: Get key TTL
run_test "Get key TTL" "GET" "/api/v2/redis/$TEST_DB_ID/keys/test:key:1/ttl" "" 200 || true

# Test 9: Update key TTL
TTL_UPDATE_DATA='{"ttl": 7200}'
run_test "Update key TTL" "POST" "/api/v2/redis/$TEST_DB_ID/keys/test:key:1/ttl" "$TTL_UPDATE_DATA" 200 || true

# Test 10: Scan keys
run_test "Scan Redis keys" "GET" "/api/v2/redis/$TEST_DB_ID/keys?pattern=test:*&limit=10" "" 200 || true

# Test 11: Batch operations
BATCH_DATA='{
  "operations": [
    {"action": "set", "key": "batch:1", "value": "value1", "ttl": 300},
    {"action": "set", "key": "batch:2", "value": "value2"},
    {"action": "set", "key": "batch:3", "value": "value3"}
  ]
}'
run_test "Batch set operations" "POST" "/api/v2/redis/$TEST_DB_ID/keys" "$BATCH_DATA" 200 || true

# Test 12: Get Redis info
run_test "Get Redis server info" "GET" "/api/v2/redis/$TEST_DB_ID/info" "" 200 || true

# Test 13: Get Redis info (specific section)
run_test "Get Redis memory section" "GET" "/api/v2/redis/$TEST_DB_ID/info?section=memory" "" 200 || true

# Test 14: Get memory stats
run_test "Get Redis memory stats" "GET" "/api/v2/redis/$TEST_DB_ID/memory" "" 200 || true

# Test 15: Delete a key
run_test "Delete Redis key" "DELETE" "/api/v2/redis/$TEST_DB_ID/keys/test:key:1" "" 204 || true

# Test 16: Batch delete operations
BATCH_DELETE_DATA='{
  "operations": [
    {"action": "delete", "key": "batch:1"},
    {"action": "delete", "key": "batch:2"},
    {"action": "delete", "key": "batch:3"}
  ]
}'
run_test "Batch delete operations" "POST" "/api/v2/redis/$TEST_DB_ID/keys" "$BATCH_DELETE_DATA" 200 || true

echo ""
echo "--- Error Handling Tests ---"
echo ""

# Test 17: Invalid database ID
run_test "Get non-existent database" "GET" "/api/v2/databases/invalid-id-999" "" 404 || true

# Test 18: Invalid Redis key
run_test "Get non-existent Redis key" "GET" "/api/v2/redis/$TEST_DB_ID/keys/nonexistent:key" "" 404 || true

# Test 19: Invalid query parameters
run_test "Invalid limit parameter" "GET" "/api/v2/redis/$TEST_DB_ID/keys?limit=9999" "" 400 || true

# Test 20: Missing required fields
INVALID_DATA='{"name": "Test"}'
run_test "Create database with missing fields" "POST" "/api/v2/databases" "$INVALID_DATA" 400 || true

echo ""
echo "=================================================="
echo "Test Summary"
echo "=================================================="
echo "Total tests run:    $TESTS_RUN"
log_success "Tests passed:       $TESTS_PASSED"
if [ $TESTS_FAILED -gt 0 ]; then
    log_error "Tests failed:       $TESTS_FAILED"
else
    log_success "Tests failed:       $TESTS_FAILED"
fi
echo "=================================================="

# Cleanup (optional)
if [ -n "$DB_ID" ] && [ "$DB_ID" != "null" ] && [ "$DB_ID" != "test-db-123" ]; then
    log_info "Cleanup: Deleting test database..."
    curl -s -X DELETE \
        -H "API-Version: $API_VERSION" \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/v2/databases/$DB_ID" > /dev/null
    log_success "Cleanup complete"
fi

# Exit with error if any tests failed
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
fi

exit 0
