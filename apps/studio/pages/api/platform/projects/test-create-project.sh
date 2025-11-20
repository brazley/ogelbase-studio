#!/bin/bash

# ===========================================
# Test Script for Project Creation API
# ===========================================
# This script tests the /api/platform/projects/create endpoint
#
# Usage:
#   ./test-create-project.sh
#
# Environment Variables:
#   STUDIO_URL - Studio API URL (default: http://localhost:8082)
#   ORG_ID - Organization UUID (required)
#   DB_HOST - Database host (default: localhost)
#   DB_PORT - Database port (default: 5432)
#   DB_NAME - Database name (default: postgres)
#   DB_USER - Database user (default: postgres)
#   DB_PASSWORD - Database password (default: postgres)
#   PGMETA_URL - Postgres Meta URL (default: http://localhost:8085)
#   SUPABASE_URL - Supabase URL (default: http://localhost:8000)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STUDIO_URL=${STUDIO_URL:-"http://localhost:8082"}
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-"postgres"}
DB_USER=${DB_USER:-"postgres"}
DB_PASSWORD=${DB_PASSWORD:-"postgres"}
PGMETA_URL=${PGMETA_URL:-"http://localhost:8085"}
SUPABASE_URL=${SUPABASE_URL:-"http://localhost:8000"}

echo -e "${YELLOW}=== Supabase Studio - Project Creation Test ===${NC}\n"

# Check if organization ID is provided
if [ -z "$ORG_ID" ]; then
  echo -e "${RED}ERROR: ORG_ID environment variable is required${NC}"
  echo ""
  echo "To find your organization ID, run:"
  echo "  SELECT id, name, slug FROM platform.organizations;"
  echo ""
  echo "Then set it with:"
  echo "  export ORG_ID='your-org-id-here'"
  exit 1
fi

# Generate a unique project name
PROJECT_NAME="Test Project $(date +%s)"

echo -e "${GREEN}Configuration:${NC}"
echo "  Studio URL:      $STUDIO_URL"
echo "  Organization ID: $ORG_ID"
echo "  Project Name:    $PROJECT_NAME"
echo "  Database Host:   $DB_HOST"
echo "  Database Port:   $DB_PORT"
echo "  Database Name:   $DB_NAME"
echo "  Postgres Meta:   $PGMETA_URL"
echo "  Supabase URL:    $SUPABASE_URL"
echo ""

# Create the project
echo -e "${YELLOW}Creating project...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$STUDIO_URL/api/platform/projects/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PROJECT_NAME\",
    \"organization_id\": \"$ORG_ID\",
    \"database_host\": \"$DB_HOST\",
    \"database_port\": $DB_PORT,
    \"database_name\": \"$DB_NAME\",
    \"database_user\": \"$DB_USER\",
    \"database_password\": \"$DB_PASSWORD\",
    \"postgres_meta_url\": \"$PGMETA_URL\",
    \"supabase_url\": \"$SUPABASE_URL\"
  }")

# Extract HTTP code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract body (everything except last line)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
echo -e "${YELLOW}Response:${NC}"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

# Check response
if [ "$HTTP_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ Project created successfully!${NC}"
  echo ""

  # Extract key information
  PROJECT_ID=$(echo "$BODY" | jq -r '.project.id' 2>/dev/null)
  PROJECT_REF=$(echo "$BODY" | jq -r '.project.ref' 2>/dev/null)
  ANON_KEY=$(echo "$BODY" | jq -r '.credentials.anon_key' 2>/dev/null)
  SERVICE_KEY=$(echo "$BODY" | jq -r '.credentials.service_role_key' 2>/dev/null)

  echo -e "${GREEN}Project Details:${NC}"
  echo "  ID:               $PROJECT_ID"
  echo "  Ref:              $PROJECT_REF"
  echo "  Anon Key:         ${ANON_KEY:0:50}..."
  echo "  Service Key:      ${SERVICE_KEY:0:50}..."
  echo ""

  echo -e "${GREEN}Verification:${NC}"
  echo "You can verify the project was created by running:"
  echo ""
  echo "  SELECT * FROM platform.projects WHERE ref = '$PROJECT_REF';"
  echo ""
  echo "  SELECT * FROM platform.credentials WHERE project_id = '$PROJECT_ID';"
  echo ""

  exit 0
else
  echo -e "${RED}✗ Project creation failed!${NC}"
  echo -e "${RED}HTTP Status: $HTTP_CODE${NC}"
  echo ""

  # Try to extract error message
  ERROR_MSG=$(echo "$BODY" | jq -r '.error.message' 2>/dev/null)
  if [ "$ERROR_MSG" != "null" ] && [ -n "$ERROR_MSG" ]; then
    echo -e "${RED}Error: $ERROR_MSG${NC}"
  fi

  exit 1
fi
