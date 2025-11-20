#!/bin/bash
# OgelBase Studio Configuration Script
# Run this with: bash configure-studio.sh <studio-service-name>

if [ -z "$1" ]; then
  echo "Usage: bash configure-studio.sh <studio-service-name>"
  echo "Example: bash configure-studio.sh studio"
  exit 1
fi

SERVICE_NAME=$1

echo "Configuring Railway Studio service: $SERVICE_NAME"
echo "---"

# Set environment variables
railway variables set \
  --service "$SERVICE_NAME" \
  SUPABASE_URL="https://kong-production-80c6.up.railway.app" \
  SUPABASE_PUBLIC_URL="https://kong-production-80c6.up.railway.app" \
  SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzNTI4NDAwLCJleHAiOjE5MjEyOTQ4MDB9.2XTVn3nRxkDP8C_AfNNZWSXiEHBf5ELxZphZC4jg-ig" \
  SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjM1Mjg0MDAsImV4cCI6MTkyMTI5NDgwMH0.P9WAMu7vLwgQxM91jO4xm9hS9PGFBBqBhEqCfOVMyAk" \
  STUDIO_PG_META_URL="https://postgres-meta-production-6c48.up.railway.app" \
  POSTGRES_PASSWORD="sl2i90d6w7lzgejxxqwh3tiwuqxhtl64" \
  NEXT_PUBLIC_GOTRUE_URL="https://kong-production-80c6.up.railway.app/auth/v1" \
  NEXT_PUBLIC_IS_PLATFORM="false" \
  DASHBOARD_USERNAME="admin" \
  DASHBOARD_PASSWORD="changeme123"

echo "✓ Variables configured!"
echo "Railway will auto-redeploy the service."
