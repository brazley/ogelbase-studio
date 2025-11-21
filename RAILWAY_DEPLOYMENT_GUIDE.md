# Railway Deployment Guide - GitHub Container Registry Flow

## Deployment Architecture

```
Local Development → Docker Build → GitHub Container Registry → Railway
```

## ✅ Current Configuration Status

### Local Environment (Docker)
- **Platform Mode**: Enabled
- **Real Auth**: GoTrue via http://localhost:8000/auth/v1
- **Org**: OgelBase
- **Project**: Default Project
- **JWT**: Demo tokens (safe for local)

### Railway Production
- **Platform Mode**: Enabled
- **Real Auth**: GoTrue via https://kong-production-80c6.up.railway.app/auth/v1
- **Org**: OgelBase
- **Project**: Default Project
- **JWT**: Production tokens (PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy)
- **Database**: postgresql://postgres:***@postgres.railway.internal:5432/postgres

### Railway Services
- **Kong Gateway**: `https://kong-production-80c6.up.railway.app`
- **Studio**: `https://studio-production-cfcd.up.railway.app`
- **Auth (GoTrue)**: `https://supabase-auth-production-aa86.up.railway.app`
- **Postgres Meta**: `https://postgres-meta-production-6c48.up.railway.app`

## 🔧 Prerequisites

1. **GitHub Personal Access Token** with `write:packages` scope
2. **Railway CLI** installed and authenticated
3. **Docker** installed locally
4. **GitHub Repository** set up

## 📦 Step 1: Build Custom Studio Docker Image

The custom image includes your platform API routes (`/api/platform/*`) that aren't in the official Supabase Studio image.

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master

# Build the custom Studio image
docker build -f apps/studio/Dockerfile -t studio-platform:latest .
```

**Note**: The build requires `packageManager` in root package.json (✅ Already added: `pnpm@10.18.0`)

## 🚀 Step 2: Tag and Push to GitHub Container Registry

```bash
# Set your GitHub username
GITHUB_USERNAME="your-github-username"

# Tag for GitHub Container Registry
docker tag studio-platform:latest ghcr.io/$GITHUB_USERNAME/ogelbase-studio:latest
docker tag studio-platform:latest ghcr.io/$GITHUB_USERNAME/ogelbase-studio:$(date +%Y%m%d-%H%M%S)

# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# Push both tags
docker push ghcr.io/$GITHUB_USERNAME/ogelbase-studio:latest
docker push ghcr.io/$GITHUB_USERNAME/ogelbase-studio:$(date +%Y%m%d-%H%M%S)
```

## ⚙️ Step 3: Configure Railway Service

### Option A: Update Existing Studio Service

1. Go to Railway Dashboard → OgelBase project → Studio service
2. Settings → Deploy → Source
3. Change from "GitHub" to "Docker Image"
4. Set image: `ghcr.io/$GITHUB_USERNAME/ogelbase-studio:latest`
5. Add environment variables (if not already set):

```bash
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
NEXT_PUBLIC_GOTRUE_URL=${{Kong.RAILWAY_PUBLIC_DOMAIN}}/auth/v1
NEXT_PUBLIC_SUPABASE_URL=${{Kong.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_SITE_URL=${{RAILWAY_PUBLIC_DOMAIN}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
STUDIO_PG_META_URL=${{PostgresMeta.RAILWAY_PUBLIC_DOMAIN}}
DEFAULT_ORGANIZATION_NAME=OgelBase
DEFAULT_PROJECT_NAME=Default Project
```

### Option B: Create Dockerfile in Repository (Recommended)

Add to root of repository:

**`Dockerfile.studio`:**
```dockerfile
# Use the apps/studio Dockerfile
FROM node:20-alpine AS base
# ... (copy contents from apps/studio/Dockerfile)
```

Then configure Railway to build from this Dockerfile automatically on push.

## 🔄 Step 4: Automated CI/CD with GitHub Actions

Create `.github/workflows/deploy-studio.yml`:

```yaml
name: Deploy Studio to Railway

on:
  push:
    branches: [main]
    paths:
      - 'apps/studio/**'
      - 'packages/**'
      - 'Dockerfile.studio'

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/studio/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/ogelbase-studio:latest
            ghcr.io/${{ github.repository_owner }}/ogelbase-studio:${{ github.sha }}

      - name: Trigger Railway Deployment
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          # Railway will automatically pull the :latest tag
          echo "Image pushed successfully. Railway will auto-deploy."
```

## 🧪 Step 5: Test Deployment

```bash
# Test the Studio URL
curl https://studio-production-cfcd.up.railway.app/api/platform/profile

# Expected response (if DATABASE_URL not set):
{
  "id": 1,
  "primary_email": "admin@ogelbase.com",
  "username": "admin",
  "organizations": [
    {
      "id": 1,
      "name": "OgelBase",
      "slug": "default-org",
      "projects": [...]
    }
  ]
}
```

## 📋 Configuration Checklist

Before deploying, ensure:

- [x] `packageManager` added to root package.json
- [x] JWT_SECRET matches Railway production value
- [x] Platform mode enabled in all environments
- [x] `.env.local` updated with Railway URLs (not Vercel)
- [x] Default org/project names consistent everywhere
- [x] Docker build succeeds locally
- [ ] GitHub Container Registry access configured
- [ ] Railway service configured to pull from GHCR
- [ ] Environment variables set in Railway
- [ ] GitHub Actions workflow (optional but recommended)

## 🔐 Security Considerations

### What to Commit
- ✅ `docker/.env` with demo tokens (document clearly)
- ✅ `apps/studio/.env.development.local` (local development only)
- ❌ `apps/studio/.env.local` (contains production secrets!)

### Railway Environment Variables
Store these as Railway service variables, NOT in code:
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- All production JWT tokens

## 🐛 Troubleshooting

### Docker Build Fails
```bash
# Check packageManager field exists
grep packageManager package.json

# Ensure you're in the monorepo root
pwd  # Should end in /supabase-master

# Clean and retry
docker system prune -af
docker build -f apps/studio/Dockerfile -t studio-platform:latest .
```

### Railway Not Pulling Latest Image
```bash
# Force Railway to redeploy
railway up --service studio

# Or manually trigger redeploy in Railway dashboard
```

### Platform Routes 404ing
- Verify custom Docker image is being used (not official Supabase image)
- Check `NEXT_PUBLIC_IS_PLATFORM=true` is set in Railway
- Confirm build included `apps/studio/pages/api/platform/` directory

## 📚 Quick Reference

### Build Commands
```bash
# Local test build
docker build -f apps/studio/Dockerfile -t studio-test .

# Production build and push
docker build -f apps/studio/Dockerfile -t ghcr.io/$USER/ogelbase-studio:latest .
docker push ghcr.io/$USER/ogelbase-studio:latest
```

### Railway Commands
```bash
# Check current service
railway status

# View logs
railway logs --service studio

# Redeploy
railway up --service studio

# Set environment variable
railway variables set NEXT_PUBLIC_IS_PLATFORM=true --service studio
```

---

**Last Updated**: 2025-11-21
**Deployment Flow**: ✅ GitHub Container Registry → Railway
**Vercel**: ❌ Not used
