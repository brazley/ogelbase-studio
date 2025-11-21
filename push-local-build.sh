#!/bin/bash
# Push Local Docker Build to GHCR
# Usage: ./push-local-build.sh [tag]
# Example: ./push-local-build.sh dev
# Example: ./push-local-build.sh latest

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
GITHUB_USERNAME="${GITHUB_USERNAME:-$(git config user.name | tr '[:upper:]' '[:lower:]' | tr ' ' '-')}"
REPO="ogelbase-studio"
LOCAL_IMAGE="studio-platform:latest"
TAG="${1:-dev}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Push Local Build to GHCR${NC}"
echo -e "${BLUE}========================================${NC}"

# Step 1: Verify local image exists
echo -e "\n${YELLOW}Step 1: Verifying local image...${NC}"
if ! docker image inspect "$LOCAL_IMAGE" &>/dev/null; then
    echo "❌ Error: Local image '$LOCAL_IMAGE' not found"
    echo ""
    echo "CRITICAL: Must build for linux/amd64 (Railway runs on x86_64)"
    echo "Run: docker buildx build --platform linux/amd64 -f apps/studio/Dockerfile -t studio-platform:latest --load ."
    echo ""
    echo "Building on arm64 (Apple Silicon) without --platform flag will cause 'Exec format error' on Railway"
    exit 1
fi
echo -e "${GREEN}✓ Local image found${NC}"

# Step 1.5: Verify image platform
echo -e "\n${YELLOW}Step 1.5: Verifying image platform...${NC}"
PLATFORM=$(docker image inspect "$LOCAL_IMAGE" --format='{{.Architecture}}')
if [ "$PLATFORM" != "amd64" ]; then
    echo "❌ Error: Image is built for $PLATFORM architecture"
    echo "Railway requires linux/amd64 (x86_64)"
    echo ""
    echo "Rebuild with:"
    echo "docker buildx build --platform linux/amd64 -f apps/studio/Dockerfile -t studio-platform:latest --load ."
    exit 1
fi
echo -e "${GREEN}✓ Image is amd64 (correct for Railway)${NC}"

# Step 2: Check GitHub CLI authentication
echo -e "\n${YELLOW}Step 2: Checking GitHub authentication...${NC}"
if ! gh auth status &>/dev/null; then
    echo "❌ Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi
echo -e "${GREEN}✓ GitHub authenticated${NC}"

# Step 3: Login to GHCR
echo -e "\n${YELLOW}Step 3: Logging into GHCR...${NC}"
echo $GITHUB_TOKEN | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin 2>/dev/null || {
    echo "Using gh auth token for login..."
    gh auth token | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
}
echo -e "${GREEN}✓ Logged into GHCR${NC}"

# Step 4: Tag the image
REMOTE_IMAGE="ghcr.io/$GITHUB_USERNAME/$REPO:$TAG"
echo -e "\n${YELLOW}Step 4: Tagging image...${NC}"
echo "Local:  $LOCAL_IMAGE"
echo "Remote: $REMOTE_IMAGE"
docker tag "$LOCAL_IMAGE" "$REMOTE_IMAGE"
echo -e "${GREEN}✓ Image tagged${NC}"

# Step 5: Push to GHCR
echo -e "\n${YELLOW}Step 5: Pushing to GHCR...${NC}"
docker push "$REMOTE_IMAGE"
echo -e "${GREEN}✓ Image pushed successfully!${NC}"

# Step 6: Get image info
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Image Details:${NC}"
echo "Image URL: $REMOTE_IMAGE"
echo "Size: $(docker image inspect "$LOCAL_IMAGE" --format='{{.Size}}' | numfmt --to=iec-i --suffix=B)"
echo "Created: $(docker image inspect "$LOCAL_IMAGE" --format='{{.Created}}' | cut -d'T' -f1)"
echo -e "${BLUE}========================================${NC}"

# Step 7: Next steps
echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Test on Railway:"
echo "   railway variables set IMAGE_URL=$REMOTE_IMAGE --service studio"
echo "   railway up --service studio"
echo ""
echo "2. If working, tag as latest:"
echo "   docker tag $LOCAL_IMAGE ghcr.io/$GITHUB_USERNAME/$REPO:latest"
echo "   docker push ghcr.io/$GITHUB_USERNAME/$REPO:latest"
echo ""
echo "3. Commit your code changes (see commit-changes.sh)"
echo -e "${BLUE}========================================${NC}"
