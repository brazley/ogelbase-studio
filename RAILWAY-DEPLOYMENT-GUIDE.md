# Railway Deployment Guide - OgelBase Studio

## Quick Deploy to Railway

### Prerequisites
- Railway account (railway.app)
- GitHub Container Registry access (public or authenticated)

### Deployment Options

#### Option 1: Deploy from GHCR (Recommended)

Use the AMD64-optimized image that's ready on GitHub Container Registry:

```bash
# Railway will automatically pull this image
ghcr.io/brazley/ogelbase-studio:latest
```

**Railway Service Configuration:**
1. Create new project in Railway
2. Add a new service → "Deploy from Docker Image"
3. Image URL: `ghcr.io/brazley/ogelbase-studio:latest`
4. Port: `3000`
5. Health check path: `/api/health` (optional)

#### Option 2: Specific Version Tag

For a specific tested version:

```bash
ghcr.io/brazley/ogelbase-studio:0.0.10-optimized-amd64
```

### Environment Variables

**Required for Production:**
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_GOTRUE_URL=https://your-project.supabase.co/auth/v1
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Platform Configuration
PLATFORM_ENABLED=true
PLATFORM_MODE=railway

# Node Environment
NODE_ENV=production
```

**Optional Environment Variables:**
```bash
# Custom domain (if using Railway custom domain)
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Analytics
NEXT_PUBLIC_TELEMETRY_ENABLED=false

# API Configuration
NEXT_PUBLIC_API_URL=https://your-api.railway.app
```

### Railway Configuration File

Create `railway.toml` in your project root (optional):

```toml
[build]
builder = "DOCKERFILE"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[deploy.environmentVariables]]
name = "PORT"
value = "3000"

[[deploy.environmentVariables]]
name = "NODE_ENV"
value = "production"
```

### Deployment Steps

1. **Create Railway Project**
   ```bash
   railway login
   railway init
   ```

2. **Deploy from GHCR**
   - In Railway dashboard, click "New Project"
   - Select "Deploy Docker Image"
   - Enter: `ghcr.io/brazley/ogelbase-studio:latest`
   - Add environment variables (see above)
   - Deploy!

3. **Verify Deployment**
   - Railway will provide a URL (e.g., `https://your-app.up.railway.app`)
   - Check health: `https://your-app.up.railway.app/api/health`
   - Access Studio: `https://your-app.up.railway.app`

### Troubleshooting

#### Container Won't Start
- Check Railway logs for errors
- Verify environment variables are set
- Ensure image is AMD64 (linux/amd64) - Railway runs on AMD64

#### Health Check Failing
- Verify `/api/health` endpoint is accessible
- Check if PORT environment variable is set to 3000
- Review application logs in Railway dashboard

#### Authentication Issues
- Verify `NEXT_PUBLIC_GOTRUE_URL` is correct
- Check `NEXT_PUBLIC_SUPABASE_URL` matches your Supabase project
- Ensure anon key is valid

### Image Information

**Current Stable Release:**
- **Tag:** `latest` or `0.0.10-optimized-amd64`
- **Architecture:** linux/amd64
- **Size:** 701MB
- **Build Date:** 2025-11-21
- **Registry:** ghcr.io/brazley/ogelbase-studio
- **Digest:** sha256:943f3b959b61e9f026170e41d5203ff89d0e505c3b35a0eef2ec12bd4c900c6c

**Test Results:**
✅ Container starts without exec format errors
✅ Next.js 15.5.2 starts in ~2.4 seconds
✅ Health checks pass
✅ AMD64 architecture verified
✅ Pushed to GHCR successfully

### Available Image Tags

```bash
# Latest stable (AMD64) - Recommended for Railway
ghcr.io/brazley/ogelbase-studio:latest

# Specific AMD64 optimized version
ghcr.io/brazley/ogelbase-studio:0.0.10-optimized-amd64

# ARM64 version (for local Mac development)
ghcr.io/brazley/ogelbase-studio:0.0.10-optimized

# Development version
ghcr.io/brazley/ogelbase-studio:dev
```

### CLI Deployment

Using Railway CLI:

```bash
# Login to Railway
railway login

# Link to existing project (or create new)
railway link

# Set environment variables
railway variables set NEXT_PUBLIC_SUPABASE_URL=your-url
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
# ... add other variables

# Deploy specific image
railway up --service studio --image ghcr.io/brazley/ogelbase-studio:latest

# Check deployment status
railway status

# View logs
railway logs
```

### Custom Domain Setup

1. In Railway dashboard, go to your service
2. Click "Settings" → "Networking"
3. Add custom domain
4. Update DNS records as instructed
5. Update `NEXT_PUBLIC_SITE_URL` environment variable

### Monitoring & Logs

**View Logs:**
```bash
railway logs --follow
```

**Check Status:**
```bash
railway status
```

**Resource Usage:**
- Memory: ~512MB recommended minimum
- CPU: 0.5 vCPU minimum
- Storage: 1GB minimum

### Cost Optimization

Railway free tier includes:
- $5 of usage per month
- 512MB RAM
- Shared CPU
- 1GB storage

For production workloads:
- Hobby plan: $5/month + usage
- Pro plan: $20/month + usage

### Security Best Practices

1. **Use Railway's built-in secrets**
   - Never commit `.env` files
   - Use Railway's environment variable UI
   - Enable "locked" for sensitive variables

2. **Enable HTTPS**
   - Railway provides automatic HTTPS
   - Enforce HTTPS redirects in your app

3. **Regular Updates**
   - Pull latest image tag regularly
   - Monitor GHCR for new releases
   - Subscribe to security advisories

### Rolling Back

If you need to rollback to a previous version:

```bash
# Deploy specific version
railway up --service studio --image ghcr.io/brazley/ogelbase-studio:0.0.10-optimized-amd64

# Or use Railway dashboard
# Settings → Deployments → Select previous deployment → Redeploy
```

### Support & Documentation

- Railway Docs: https://docs.railway.app
- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs
- Project Issues: https://github.com/brazley/ogelbase-studio/issues

---

**Last Updated:** 2025-11-21
**Image Version:** 0.0.10-optimized-amd64
**Verified:** ✅ Container startup tested, no exec format errors
