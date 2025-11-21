#!/bin/bash
# Complete Deployment Workflow: Test → Commit → Deploy
#
# This script implements the workflow:
# 1. Build locally for amd64
# 2. Push to GHCR as :dev
# 3. Deploy to Railway dev
# 4. Wait for user confirmation that it works
# 5. ONLY THEN commit and push code to GitHub
# 6. GitHub Actions builds :latest for production

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Complete Deployment Workflow${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "\n${YELLOW}Workflow Steps:${NC}"
echo "1. Build locally for linux/amd64"
echo "2. Push to GHCR as :dev"
echo "3. Deploy to Railway dev environment"
echo "4. Test that it works"
echo "5. ✅ ONLY IF SUCCESS → Commit code to git"
echo "6. Push to GitHub → Actions builds :latest → Production deploys"
echo ""

read -p "Start deployment workflow? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Step 1: Build for amd64
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Step 1: Building for linux/amd64...${NC}"
echo "This will take ~10-15 minutes on Apple Silicon"
echo ""

docker buildx build --platform linux/amd64 -f apps/studio/Dockerfile -t studio-platform:latest --load .

echo -e "${GREEN}✓ Build complete${NC}"

# Verify platform
PLATFORM=$(docker image inspect studio-platform:latest --format='{{.Architecture}}')
if [ "$PLATFORM" != "amd64" ]; then
    echo -e "${RED}❌ Error: Built for $PLATFORM instead of amd64${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Verified: Image is amd64${NC}"

# Step 2: Push to GHCR as :dev
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Step 2: Pushing to GHCR as :dev...${NC}"

# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u brazley --password-stdin

# Tag and push
docker tag studio-platform:latest ghcr.io/brazley/ogelbase-studio:dev
docker push ghcr.io/brazley/ogelbase-studio:dev

echo -e "${GREEN}✓ Pushed to ghcr.io/brazley/ogelbase-studio:dev${NC}"

# Step 3: Deploy to Railway dev
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Step 3: Deploying to Railway dev...${NC}"

railway variables set IMAGE_URL=ghcr.io/brazley/ogelbase-studio:dev --service studio
railway up --service studio

echo -e "${GREEN}✓ Deployed to Railway dev${NC}"
echo ""
echo "Check deployment status:"
echo "  railway logs --service studio --tail"
echo ""

# Step 4: Wait for user confirmation
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Step 4: Test your deployment${NC}"
echo ""
echo "🧪 Test the Railway dev deployment:"
echo "1. Check that Studio loads correctly"
echo "2. Verify platform routes work (/org, /org/[slug])"
echo "3. Test authentication with GoTrue"
echo "4. Verify database connections"
echo ""

read -p "Did the deployment succeed and work correctly? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Deployment failed or has issues${NC}"
    echo ""
    echo "Fix the issues and run this script again"
    echo "The :dev image is already pushed, so you can:"
    echo "1. Make code changes"
    echo "2. Rebuild and push :dev again"
    echo "3. Test again"
    exit 1
fi

echo -e "${GREEN}✓ Deployment successful!${NC}"

# Step 5: Commit code
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Step 5: Committing code to git...${NC}"

./commit-changes.sh

# Step 6: Push to GitHub
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Step 6: Pushing to GitHub...${NC}"

git push origin main

echo -e "${GREEN}✓ Code pushed to GitHub${NC}"

# Step 7: Monitor GitHub Actions
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"

echo ""
echo "📊 Next steps:"
echo "1. GitHub Actions is building :latest"
echo "   Monitor: gh run list --limit 3"
echo ""
echo "2. Once complete, Railway production will auto-deploy"
echo "   Monitor: railway logs --service studio"
echo ""
echo "3. Test production deployment"
echo "   URL: https://studio-production-cfcd.up.railway.app"
echo ""

echo -e "${GREEN}✨ Deployment workflow complete!${NC}"
