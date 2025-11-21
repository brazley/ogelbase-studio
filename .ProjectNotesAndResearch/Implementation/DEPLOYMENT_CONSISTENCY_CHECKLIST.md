# Deployment Consistency Checklist

## Current Status: ⚠️ NEEDS ALIGNMENT

### ✅ What's Already Consistent

**Platform Configuration:**
- ✅ `NEXT_PUBLIC_IS_PLATFORM=true` in both local and Railway
- ✅ `NEXT_PUBLIC_ENABLE_MOCK_AUTH=false` in both environments
- ✅ Default org: "OgelBase"
- ✅ Default project: "Default Project"
- ✅ JWT Secret now matches Railway (`PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy`)
- ✅ PackageManager field added to root package.json

### ⚠️ Critical Items Requiring Clarification

**1. Studio Deployment Target**
- **Current confusion:**
  - `.env.local` references: `ogelbase-studio.vercel.app`
  - Railway service exists: `studio-production-cfcd.up.railway.app`

- **Question:** Is Studio deployed to:
  - [ ] Vercel (as indicated in .env.local)
  - [ ] Railway (where other services are)
  - [ ] Both (different environments?)

**2. Custom Docker Image Deployment**
- **Current status:** Building custom `studio-platform:latest` image
- **Needed for:** Platform API routes (`/api/platform/*`) and proper URL routing (`/org/[slug]`)
- **Question:** Where will this custom image be deployed?
  - [ ] Local Docker only
  - [ ] Push to Docker registry for Railway to pull
  - [ ] Both

### 🔧 Configuration Files to Update Based on Deployment Strategy

#### If Studio deploys to Railway:
1. Update `.env.local` URLs from Vercel to Railway:
   ```bash
   # Change from:
   NEXT_PUBLIC_SITE_URL=https://ogelbase-studio.vercel.app
   NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api

   # To:
   NEXT_PUBLIC_SITE_URL=https://studio-production-cfcd.up.railway.app
   NEXT_PUBLIC_API_URL=https://studio-production-cfcd.up.railway.app/api
   ```

2. Configure Railway to use custom Docker image:
   - Push `studio-platform:latest` to Docker Hub or GitHub Container Registry
   - Update Railway service to pull from that registry

#### If Studio deploys to Vercel:
1. Ensure Vercel environment variables match `.env.local`
2. Vercel will build from source (includes platform routes automatically)
3. No Docker image needed for Vercel

### 📋 Environment Variable Alignment

#### Local Docker (`docker/.env` + `docker-compose.yml`)
```bash
# Self-hosted mode with platform features
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
NEXT_PUBLIC_GOTRUE_URL=http://kong:8000/auth/v1
STUDIO_DEFAULT_ORGANIZATION=OgelBase
STUDIO_DEFAULT_PROJECT=Default Project

# Uses demo JWT tokens (fine for local)
ANON_KEY=eyJhbGciOiJI... (demo token)
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
```

#### Railway/Production (`.env.local`)
```bash
# Platform mode with real auth
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
DEFAULT_ORGANIZATION_NAME=OgelBase
DEFAULT_PROJECT_NAME=Default Project

# Uses real Railway tokens
SUPABASE_ANON_KEY=eyJhbGciOiJI... (Railway token)
SUPABASE_JWT_SECRET=PYEtFVTaPuUJRNI3t03UDBKrZdNuI5vaY8Wt1cBy

# Platform database connection
DATABASE_URL=postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres
```

### 🚀 Deployment Workflow (Once Strategy is Clarified)

#### Option A: Railway Deployment with Custom Docker Image
1. Build custom Studio image: `docker build -t studio-platform:latest .`
2. Tag for registry: `docker tag studio-platform:latest ghcr.io/yourusername/studio-platform:latest`
3. Push to registry: `docker push ghcr.io/yourusername/studio-platform:latest`
4. Update Railway service to use custom image
5. Deploy to Railway

#### Option B: Vercel Deployment
1. Connect GitHub repo to Vercel
2. Set environment variables in Vercel dashboard (from `.env.local`)
3. Deploy from main branch
4. Vercel builds from source automatically

### 📊 Key Differences Between Local and Production

| Setting | Local Docker | Railway/Production |
|---------|-------------|-------------------|
| URLs | `localhost:8000`, `localhost:3000` | `*.up.railway.app` |
| JWT Tokens | Demo tokens | Real Railway tokens |
| DATABASE_URL | Not needed (self-hosted) | Required (platform features) |
| Custom Build | Needed (for platform routes) | Needed OR deploy to Vercel |

### ✅ Next Steps to Complete Alignment

1. **Clarify deployment target** (Railway vs Vercel vs Both)
2. **Update `.env.local`** URLs based on target
3. **Complete Docker build** (fix packageManager - DONE ✅)
4. **Test custom image locally** before pushing
5. **Set up Docker registry** (if using Railway)
6. **Configure CI/CD** for automatic deployments
7. **Update Railway environment variables** to match local config

### 🔒 Security Notes

- ⚠️ `.env.local` contains production secrets - DO NOT commit to git
- ✅ `docker/.env` uses demo tokens - Safe for git (but document this)
- ⚠️ Railway variables contain real passwords - Keep secure
- ✅ Consider using Railway secrets management for sensitive values

---

**Last Updated:** 2025-11-21
**Status:** Awaiting clarification on deployment strategy
