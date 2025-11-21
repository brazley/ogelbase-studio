#!/bin/bash
# Commit Changes in Logical Groups
# Usage: ./commit-changes.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Staged Commit Strategy${NC}"
echo -e "${BLUE}========================================${NC}"

# Show current status
echo -e "\n${YELLOW}Current Git Status:${NC}"
git status --short

echo -e "\n${YELLOW}Commit Strategy:${NC}"
echo "1. Build configuration (package.json)"
echo "2. CI/CD workflow (.github/workflows)"
echo "3. Environment configs (docker, apps/studio)"
echo "4. Documentation files"
echo ""

read -p "Proceed with staged commits? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Commit 1: Build configuration
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Commit 1: Build configuration${NC}"
if git diff --name-only | grep -q "package.json"; then
    git add package.json
    git commit -m "build: add packageManager field for Docker builds

- Required for turbo prune in Dockerfile
- Specifies pnpm@10.18.0 as package manager"
    echo -e "${GREEN}✓ Committed build configuration${NC}"
else
    echo "No changes to package.json"
fi

# Commit 2: CI/CD workflow
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Commit 2: CI/CD workflow${NC}"
if git diff --name-only | grep -q ".github/workflows"; then
    git add .github/workflows/build-studio-docker.yml
    git commit -m "ci: add automatic version tagging to Docker workflow

- Extract version from apps/studio/package.json
- Tag images with version number, :latest, and commit SHA
- Enable semantic versioning support (v*.*.*)
- Maintain GitHub Actions cache for faster builds"
    echo -e "${GREEN}✓ Committed CI/CD workflow${NC}"
else
    echo "No changes to workflows"
fi

# Commit 3: Environment configuration
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Commit 3: Environment configuration${NC}"
ENV_FILES=(
    "docker/.env"
    "docker/docker-compose.yml"
    "apps/studio/.env.local"
    "apps/studio/.env.development.local"
)

HAS_ENV_CHANGES=false
for file in "${ENV_FILES[@]}"; do
    if git diff --name-only | grep -q "$file"; then
        HAS_ENV_CHANGES=true
        break
    fi
done

if [ "$HAS_ENV_CHANGES" = true ]; then
    for file in "${ENV_FILES[@]}"; do
        if [ -f "$file" ]; then
            git add "$file" 2>/dev/null || true
        fi
    done

    git commit -m "config: align Railway and local Docker environments

Docker configuration:
- Set STUDIO_DEFAULT_ORGANIZATION=OgelBase
- Enable ENABLE_EMAIL_AUTOCONFIRM for local testing
- Add platform mode environment variables to docker-compose.yml

Railway configuration (.env.local):
- Update all URLs from Vercel to Railway domains
- Configure Kong gateway at kong-production-80c6.up.railway.app
- Configure Studio at studio-production-cfcd.up.railway.app
- Align JWT secret with Railway production
- Enable platform mode with real GoTrue auth

Local development (.env.development.local):
- Configure for localhost:8000 (Kong) and localhost:3000 (Studio)
- Use demo JWT tokens for local testing
- Enable platform mode with real auth"
    echo -e "${GREEN}✓ Committed environment configuration${NC}"
else
    echo "No changes to environment files"
fi

# Commit 4: Documentation
echo -e "\n${BLUE}========================================${NC}"
echo -e "${YELLOW}Commit 4: Documentation${NC}"
DOC_FILES=(
    "CICD_FLOW_VERIFICATION.md"
    "RAILWAY_DEPLOYMENT_GUIDE.md"
    "DEPLOYMENT_CONSISTENCY_CHECKLIST.md"
)

HAS_DOC_CHANGES=false
for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        HAS_DOC_CHANGES=true
        break
    fi
done

if [ "$HAS_DOC_CHANGES" = true ]; then
    for file in "${DOC_FILES[@]}"; do
        if [ -f "$file" ]; then
            git add "$file" 2>/dev/null || true
        fi
    done

    git commit -m "docs: add Railway deployment documentation

- CICD_FLOW_VERIFICATION.md: Complete CI/CD flow walkthrough
- RAILWAY_DEPLOYMENT_GUIDE.md: Step-by-step Railway setup
- DEPLOYMENT_CONSISTENCY_CHECKLIST.md: Configuration alignment guide

Documents GitHub → GHCR → Railway deployment pipeline"
    echo -e "${GREEN}✓ Committed documentation${NC}"
else
    echo "No documentation files to commit"
fi

# Final status
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Commit Summary:${NC}"
git log --oneline -4
echo -e "${BLUE}========================================${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Review commits: git log --oneline -4"
echo "2. Push to GitHub: git push origin main"
echo "3. GitHub Actions will automatically build and push :latest"
echo ""
echo "Or push now with: git push origin main"
echo -e "${BLUE}========================================${NC}"
