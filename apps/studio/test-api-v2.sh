#!/bin/bash

# API v2 Test Suite
# Tests all v2 middleware functionality

BASE_URL="http://localhost:3000"
API_VERSION="2025-11-20"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      API v2 Test Suite                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Test 1: API Versioning
echo -e "${YELLOW}Test 1: API Versioning${NC}"
echo "Testing versioning middleware..."
response=$(curl -s -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test")
if echo "$response" | grep -q "API v2 is working"; then
  echo -e "${GREEN}✓ Versioning works${NC}"
  echo "$response" | jq .
else
  echo -e "${RED}✗ Versioning failed${NC}"
  echo "$response"
fi
echo ""

# Test 2: Invalid API Version
echo -e "${YELLOW}Test 2: Invalid API Version${NC}"
echo "Testing invalid version format..."
response=$(curl -s -H "API-Version: invalid" "${BASE_URL}/api/v2/test")
if echo "$response" | grep -q "INVALID_API_VERSION"; then
  echo -e "${GREEN}✓ Invalid version rejected${NC}"
  echo "$response" | jq .
else
  echo -e "${RED}✗ Invalid version not rejected${NC}"
  echo "$response"
fi
echo ""

# Test 3: RFC 9457 Error Responses
echo -e "${YELLOW}Test 3: RFC 9457 Error Responses${NC}"

echo "Testing 400 Bad Request..."
response=$(curl -s -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/error?type=400")
if echo "$response" | grep -q "type.*https://api.supabase.com/errors"; then
  echo -e "${GREEN}✓ RFC 9457 format works${NC}"
  echo "$response" | jq .
else
  echo -e "${RED}✗ RFC 9457 format failed${NC}"
  echo "$response"
fi
echo ""

echo "Testing 404 Not Found..."
response=$(curl -s -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/error?type=404")
echo "$response" | jq .
echo ""

echo "Testing 422 Unprocessable Entity..."
response=$(curl -s -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/error?type=422")
echo "$response" | jq .
echo ""

# Test 4: Cursor Pagination
echo -e "${YELLOW}Test 4: Cursor-Based Pagination${NC}"

echo "Testing first page..."
response=$(curl -s -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/pagination?limit=5")
if echo "$response" | grep -q '"cursor"'; then
  echo -e "${GREEN}✓ Pagination works${NC}"
  cursor=$(echo "$response" | jq -r '.cursor')
  echo "First page cursor: $cursor"
  echo "$response" | jq .
else
  echo -e "${RED}✗ Pagination failed${NC}"
  echo "$response"
fi
echo ""

echo "Testing second page with cursor..."
if [ ! -z "$cursor" ]; then
  response=$(curl -s -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/pagination?limit=5&cursor=${cursor}")
  echo "$response" | jq .
else
  echo "Skipping: No cursor available"
fi
echo ""

# Test 5: Rate Limiting
echo -e "${YELLOW}Test 5: Rate Limiting (5 requests/minute)${NC}"
echo "Making 7 requests to trigger rate limit..."

for i in {1..7}; do
  response=$(curl -s -i -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/rate-limit")
  status=$(echo "$response" | grep HTTP | awk '{print $2}')
  remaining=$(echo "$response" | grep -i "ratelimit-remaining" | awk '{print $2}' | tr -d '\r')

  if [ "$status" == "200" ]; then
    echo -e "${GREEN}✓ Request $i: Success (Remaining: $remaining)${NC}"
  elif [ "$status" == "429" ]; then
    echo -e "${RED}✗ Request $i: Rate Limited (Status: 429)${NC}"
    retry_after=$(echo "$response" | grep -i "retry-after" | awk '{print $2}' | tr -d '\r')
    echo "  Retry-After: $retry_after seconds"
    echo "$response" | tail -n 1 | jq .
    break
  else
    echo -e "${YELLOW}! Request $i: Status $status${NC}"
  fi

  sleep 0.2
done
echo ""

# Test 6: Rate Limit Headers
echo -e "${YELLOW}Test 6: Rate Limit Headers${NC}"
echo "Checking rate limit headers..."
response=$(curl -s -i -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test/rate-limit")
echo "$response" | grep -i "ratelimit"
echo ""

# Test 7: Method Not Allowed
echo -e "${YELLOW}Test 7: Method Not Allowed${NC}"
echo "Testing POST to GET-only endpoint..."
response=$(curl -s -X POST -H "API-Version: ${API_VERSION}" "${BASE_URL}/api/v2/test")
if echo "$response" | grep -q "METHOD_NOT_ALLOWED"; then
  echo -e "${GREEN}✓ Method validation works${NC}"
  echo "$response" | jq .
else
  echo -e "${RED}✗ Method validation failed${NC}"
  echo "$response"
fi
echo ""

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Test Suite Complete               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
