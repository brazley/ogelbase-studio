#!/bin/bash

# Test script for all platform API endpoints
# Run this after starting the dev server: npm run dev

BASE_URL="${BASE_URL:-http://localhost:3000}"
ORG_SLUG="org-1"
PROJECT_REF="default"

echo "========================================"
echo "Testing Platform API Endpoints"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local description=$4

  echo -n "Testing: $description ... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✓ OK${NC} (HTTP $http_code)"
    echo "   Response preview: $(echo "$body" | head -c 100)..."
  else
    echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
    echo "   Response: $body"
  fi
  echo ""
}

echo "=== Organization Endpoints ==="
echo ""

test_endpoint "GET" "/api/platform/organizations/$ORG_SLUG/billing/plans" \
  "" "Billing Plans"

test_endpoint "GET" "/api/platform/organizations/$ORG_SLUG/payments" \
  "" "Payment Methods (List)"

test_endpoint "GET" "/api/platform/organizations/$ORG_SLUG/tax-ids" \
  "" "Tax IDs (List)"

test_endpoint "GET" "/api/platform/organizations/$ORG_SLUG/free-project-limit" \
  "" "Free Project Limit"

test_endpoint "GET" "/api/platform/organizations/$ORG_SLUG/usage" \
  "" "Organization Usage"

test_endpoint "GET" "/api/platform/organizations/$ORG_SLUG/billing/subscription" \
  "" "Billing Subscription"

echo "=== Project Endpoints ==="
echo ""

test_endpoint "GET" "/api/platform/projects/$PROJECT_REF/disk" \
  "" "Disk Configuration"

test_endpoint "GET" "/api/platform/projects/$PROJECT_REF/disk/util" \
  "" "Disk Utilization"

test_endpoint "GET" "/api/platform/projects/$PROJECT_REF/disk/custom-config" \
  "" "Disk Auto-Scale Config"

test_endpoint "GET" "/api/platform/projects/$PROJECT_REF/compute" \
  "" "Compute Configuration"

test_endpoint "GET" "/api/platform/projects/$PROJECT_REF/billing/addons" \
  "" "Billing Add-ons"

test_endpoint "GET" "/api/platform/projects/$PROJECT_REF/infra-monitoring" \
  "" "Infrastructure Monitoring"

echo "========================================"
echo "Test Complete!"
echo "========================================"
echo ""
echo "Summary:"
echo "- All organization endpoints tested"
echo "- All project endpoints tested"
echo "- Check output above for any failures"
echo ""
echo "If all tests show ✓ OK, the platform API is ready!"
