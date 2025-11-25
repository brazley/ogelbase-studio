#!/bin/bash
set -e

# Kong + Ogelfy Deployment Script for Railway
# This script deploys Kong API Gateway with 3 Ogelfy instances

echo "🚀 Deploying Kong + Ogelfy to Railway"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not installed${NC}"
    echo "Install: npm i -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged into Railway${NC}"
    echo "Run: railway login"
    exit 1
fi

# Check for project
PROJECT_ID=$(railway status 2>/dev/null | grep "Project ID" | awk '{print $3}')
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  No Railway project linked${NC}"
    echo "Run: railway link"
    exit 1
fi

echo -e "${GREEN}✓ Railway CLI ready${NC}"
echo -e "${BLUE}Project ID: $PROJECT_ID${NC}"
echo ""

# Step 1: Create Kong service
echo -e "${BLUE}📦 Creating Kong service...${NC}"
railway service create kong || echo "Kong service already exists"

# Step 2: Create Ogelfy services
echo -e "${BLUE}📦 Creating Ogelfy services...${NC}"
for i in 1 2 3; do
    railway service create "ogelfy-$i" || echo "ogelfy-$i already exists"
done

# Step 3: Deploy Kong
echo -e "${BLUE}🚢 Deploying Kong...${NC}"
railway service kong deploy \
    --dockerfile Dockerfile.kong \
    --env NODE_ENV=production

# Wait a bit for service URLs to be generated
sleep 5

# Step 4: Get Ogelfy service URLs
echo -e "${BLUE}🔗 Getting service URLs...${NC}"
OGELFY_1_URL=$(railway service ogelfy-1 domain 2>/dev/null || echo "ogelfy-1.up.railway.app")
OGELFY_2_URL=$(railway service ogelfy-2 domain 2>/dev/null || echo "ogelfy-2.up.railway.app")
OGELFY_3_URL=$(railway service ogelfy-3 domain 2>/dev/null || echo "ogelfy-3.up.railway.app")

echo -e "${GREEN}Ogelfy URLs:${NC}"
echo "  - https://$OGELFY_1_URL"
echo "  - https://$OGELFY_2_URL"
echo "  - https://$OGELFY_3_URL"
echo ""

# Step 5: Set Kong environment variables
echo -e "${BLUE}⚙️  Configuring Kong environment...${NC}"
railway service kong variables set \
    OGELFY_1_URL="$OGELFY_1_URL" \
    OGELFY_2_URL="$OGELFY_2_URL" \
    OGELFY_3_URL="$OGELFY_3_URL" \
    OGELFY_URL="https://$OGELFY_1_URL"

# Step 6: Deploy Ogelfy instances
echo -e "${BLUE}🚢 Deploying Ogelfy instances...${NC}"
for i in 1 2 3; do
    echo -e "${BLUE}  Deploying ogelfy-$i...${NC}"
    railway service "ogelfy-$i" deploy \
        --dockerfile Dockerfile.ogelfy \
        --env NODE_ENV=production \
        --env RAILWAY_REPLICA_ID="$i"
done

# Step 7: Wait for health checks
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"
sleep 15

# Step 8: Test deployment
echo -e "${BLUE}🧪 Testing deployment...${NC}"
KONG_URL=$(railway service kong domain)

if [ ! -z "$KONG_URL" ]; then
    echo -e "${BLUE}Testing Kong health...${NC}"
    if curl -f -s "https://$KONG_URL/health" > /dev/null; then
        echo -e "${GREEN}✓ Kong is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️  Kong health check failed (may still be starting)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Kong URL not available yet${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}Service URLs:${NC}"
echo "  Kong Gateway: https://$KONG_URL"
echo "  Kong Admin:   https://$KONG_URL:8001 (internal only)"
echo ""
echo -e "${BLUE}Endpoints:${NC}"
echo "  GET  https://$KONG_URL/health       - Health check"
echo "  GET  https://$KONG_URL/api/hello    - API endpoint"
echo "  GET  https://$KONG_URL/metrics      - Prometheus metrics"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Configure custom domain: railway domain add"
echo "  2. View logs: railway logs"
echo "  3. Monitor metrics: railway service kong logs"
echo "  4. Scale Ogelfy: Add more services in Railway dashboard"
echo ""
