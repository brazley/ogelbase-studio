#!/bin/bash

# Test Authentication Connection to Railway GoTrue
# Created: 2025-11-20

set -e

echo "========================================="
echo "Testing OgelBase GoTrue Authentication"
echo "========================================="
echo ""

# Load environment variables from .env.production
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
else
  echo "Error: .env.production file not found"
  exit 1
fi

GOTRUE_URL="${NEXT_PUBLIC_GOTRUE_URL}"
ANON_KEY="${SUPABASE_ANON_KEY}"

echo "GoTrue URL: $GOTRUE_URL"
echo "Anon Key: ${ANON_KEY:0:20}..."
echo ""

# Test 1: Check GoTrue health
echo "Test 1: Checking GoTrue health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${GOTRUE_URL}/health" || echo "000")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n 1)

if [ "$HEALTH_CODE" = "200" ]; then
  echo "✅ GoTrue is healthy"
  echo "Response: $HEALTH_BODY"
else
  echo "❌ GoTrue health check failed (HTTP $HEALTH_CODE)"
  echo "Response: $HEALTH_BODY"
fi
echo ""

# Test 2: Try to get settings
echo "Test 2: Fetching GoTrue settings..."
SETTINGS_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "apikey: $ANON_KEY" \
  "${GOTRUE_URL}/settings" || echo "000")
SETTINGS_CODE=$(echo "$SETTINGS_RESPONSE" | tail -1)
SETTINGS_BODY=$(echo "$SETTINGS_RESPONSE" | head -n 1)

if [ "$SETTINGS_CODE" = "200" ]; then
  echo "✅ GoTrue settings retrieved successfully"
  echo "$SETTINGS_BODY" | jq '.' 2>/dev/null || echo "$SETTINGS_BODY"
else
  echo "❌ Failed to get GoTrue settings (HTTP $SETTINGS_CODE)"
  echo "Response: $SETTINGS_BODY"
fi
echo ""

# Test 3: Create a test user (will fail if user exists, that's ok)
echo "Test 3: Testing user signup..."
TEST_EMAIL="test-$(date +%s)@ogelbase.com"
TEST_PASSWORD="TestPassword123!"

SIGNUP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  "${GOTRUE_URL}/signup" || echo "000")
SIGNUP_CODE=$(echo "$SIGNUP_RESPONSE" | tail -1)
SIGNUP_BODY=$(echo "$SIGNUP_RESPONSE" | head -n 1)

if [ "$SIGNUP_CODE" = "200" ]; then
  echo "✅ User signup successful"
  echo "Test user created: $TEST_EMAIL"
  USER_ID=$(echo "$SIGNUP_BODY" | jq -r '.id' 2>/dev/null || echo "unknown")
  echo "User ID: $USER_ID"

  # Save credentials for manual testing
  echo ""
  echo "Test credentials saved:"
  echo "Email: $TEST_EMAIL"
  echo "Password: $TEST_PASSWORD"
else
  echo "⚠️  User signup failed or user already exists (HTTP $SIGNUP_CODE)"
  echo "Response: $SIGNUP_BODY"
fi
echo ""

# Test 4: Try to sign in (if we created a user)
if [ "$SIGNUP_CODE" = "200" ]; then
  echo "Test 4: Testing user login..."

  LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
    "${GOTRUE_URL}/token?grant_type=password" || echo "000")
  LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
  LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n 1)

  if [ "$LOGIN_CODE" = "200" ]; then
    echo "✅ User login successful"
    ACCESS_TOKEN=$(echo "$LOGIN_BODY" | jq -r '.access_token' 2>/dev/null)

    echo "Access token (first 30 chars): ${ACCESS_TOKEN:0:30}..."

    # Test 5: Verify JWT claims
    echo ""
    echo "Test 5: Verifying JWT claims..."

    # Decode JWT payload (second part)
    PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2)
    # Add padding if needed
    PAYLOAD_PADDED=$(echo "$PAYLOAD" | sed 's/$/===/' | head -c $((${#PAYLOAD} + 3)))
    DECODED=$(echo "$PAYLOAD_PADDED" | base64 -d 2>/dev/null || echo "{}")

    echo "JWT Claims:"
    echo "$DECODED" | jq '.' 2>/dev/null || echo "$DECODED"

  else
    echo "❌ User login failed (HTTP $LOGIN_CODE)"
    echo "Response: $LOGIN_BODY"
  fi
fi

echo ""
echo "========================================="
echo "Authentication Test Complete"
echo "========================================="
echo ""
echo "Summary:"
echo "- GoTrue URL: $GOTRUE_URL"
echo "- Connection: $([ "$HEALTH_CODE" = "200" ] && echo "Working ✅" || echo "Failed ❌")"
echo "- Settings: $([ "$SETTINGS_CODE" = "200" ] && echo "Accessible ✅" || echo "Failed ❌")"
echo "- Signup: $([ "$SIGNUP_CODE" = "200" ] && echo "Working ✅" || echo "Skipped")"
echo ""
echo "Next Steps:"
echo "1. Run the migration: psql \$DATABASE_URL < migrations/add_organization_members.sql"
echo "2. Update profile endpoint to use JWT authentication"
echo "3. Test multi-tenant access control"
echo ""
