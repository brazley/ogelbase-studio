#!/bin/bash

# Audit Logging API Test Script
# Quick curl commands to test the audit logging system

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8082}"
TEST_EMAIL="${TEST_EMAIL:-nik@lancio.io}"
TEST_PASSWORD="${TEST_PASSWORD:-test123}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Audit Logging API Tests (curl)     ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Base URL: $BASE_URL"
echo "Test User: $TEST_EMAIL"
echo ""

# Step 1: Authenticate
echo -e "${YELLOW}1. Authenticating...${NC}"
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Authentication failed${NC}"
  echo "Response: $AUTH_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✓ Authenticated successfully${NC}"
  echo "Token: ${TOKEN:0:20}..."
fi

echo ""

# Step 2: Get all audit logs
echo -e "${YELLOW}2. Getting all audit logs...${NC}"
curl -s -X GET "$BASE_URL/api/platform/audit/logs?limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'

echo ""

# Step 3: Get audit logs for projects only
echo -e "${YELLOW}3. Getting project audit logs...${NC}"
curl -s -X GET "$BASE_URL/api/platform/audit/logs?entity_type=project&limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'

echo ""

# Step 4: Get audit logs from last 24 hours
echo -e "${YELLOW}4. Getting logs from last 24 hours...${NC}"
START_DATE=$(date -u -v-1d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)
curl -s -X GET "$BASE_URL/api/platform/audit/logs?start_date=$START_DATE&limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'

echo ""

# Step 5: Test pagination
echo -e "${YELLOW}5. Testing pagination (page 1)...${NC}"
curl -s -X GET "$BASE_URL/api/platform/audit/logs?limit=3&offset=0" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.pagination'

echo ""

echo -e "${YELLOW}6. Testing pagination (page 2)...${NC}"
curl -s -X GET "$BASE_URL/api/platform/audit/logs?limit=3&offset=3" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.pagination'

echo ""

# Step 6: Filter by action
echo -e "${YELLOW}7. Getting 'create' actions only...${NC}"
curl -s -X GET "$BASE_URL/api/platform/audit/logs?action=create&limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'

echo ""

# Step 7: Get audit log summary
echo -e "${YELLOW}8. Audit log summary...${NC}"
SUMMARY=$(curl -s -X GET "$BASE_URL/api/platform/audit/logs?limit=1000" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

TOTAL=$(echo "$SUMMARY" | jq -r '.pagination.total // 0')
PROJECT_LOGS=$(echo "$SUMMARY" | jq '[.data[] | select(.entity_type=="project")] | length')
ORG_LOGS=$(echo "$SUMMARY" | jq '[.data[] | select(.entity_type=="organization")] | length')
CREATE_ACTIONS=$(echo "$SUMMARY" | jq '[.data[] | select(.action=="create")] | length')
UPDATE_ACTIONS=$(echo "$SUMMARY" | jq '[.data[] | select(.action | startswith("update") or endswith(".update"))] | length')

echo -e "${GREEN}Total audit logs: $TOTAL${NC}"
echo "  - Project logs: $PROJECT_LOGS"
echo "  - Organization logs: $ORG_LOGS"
echo "  - Create actions: $CREATE_ACTIONS"
echo "  - Update actions: $UPDATE_ACTIONS"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ All tests completed!${NC}"
echo -e "${BLUE}========================================${NC}"

# Additional test commands for reference
echo ""
echo -e "${BLUE}Additional test commands:${NC}"
echo ""
echo "# Get specific entity's history"
echo "curl -X GET \"$BASE_URL/api/platform/audit/logs?entity_type=project&entity_id=YOUR_PROJECT_ID\" \\"
echo "  -H \"Authorization: Bearer \$TOKEN\""
echo ""
echo "# Get logs for specific user"
echo "curl -X GET \"$BASE_URL/api/platform/audit/logs?user_id=YOUR_USER_ID\" \\"
echo "  -H \"Authorization: Bearer \$TOKEN\""
echo ""
echo "# Get logs in date range"
echo "START=\$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)"
echo "END=\$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "curl -X GET \"$BASE_URL/api/platform/audit/logs?start_date=\$START&end_date=\$END\" \\"
echo "  -H \"Authorization: Bearer \$TOKEN\""
echo ""
echo "# Export logs to file"
echo "curl -X GET \"$BASE_URL/api/platform/audit/logs?limit=1000\" \\"
echo "  -H \"Authorization: Bearer \$TOKEN\" > audit_logs.json"
echo ""
