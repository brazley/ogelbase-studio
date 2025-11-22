# ZKEB Railway Deployment - Quick Start Guide
**Get production deployment running in 30 minutes**

---

## Prerequisites

```bash
# Install Railway CLI
npm install -g @railway/cli

# Install Docker
# https://docs.docker.com/get-docker/

# Verify installations
railway --version
docker --version
node --version  # Should be 20.x
```

---

## 30-Minute Deployment Checklist

### Phase 1: Railway Setup (10 minutes)

```bash
# 1. Login to Railway
railway login

# 2. Create new project
railway init --name zkeb-production

# 3. Add PostgreSQL service
railway add --service postgres

# 4. Add Redis service
railway add --service redis

# 5. Generate secure keys
ZKEB_MASTER_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
API_KEY_SALT=$(openssl rand -base64 16)

# 6. Set environment variables
railway variables set \
  NODE_ENV=production \
  ZKEB_MASTER_ENCRYPTION_KEY="$ZKEB_MASTER_KEY" \
  JWT_SECRET="$JWT_SECRET" \
  API_KEY_SALT="$API_KEY_SALT" \
  --service api-server

# 7. Link private network URLs
railway variables set \
  DATABASE_URL='${{Postgres.DATABASE_PRIVATE_URL}}' \
  REDIS_URL='${{Redis.REDIS_PRIVATE_URL}}' \
  --service api-server

echo "✅ Railway project configured!"
echo "SAVE THESE KEYS IN 1PASSWORD:"
echo "ZKEB_MASTER_KEY=$ZKEB_MASTER_KEY"
echo "JWT_SECRET=$JWT_SECRET"
echo "API_KEY_SALT=$API_KEY_SALT"
```

### Phase 2: Database Setup (5 minutes)

```bash
# 1. Run ZKEB schema migration
railway run --service postgres \
  "psql \$DATABASE_URL -f apps/security/database/migrations/009_create_zkeb_schema.sql"

# 2. Verify schema created
railway run --service postgres \
  "psql \$DATABASE_URL -c '\dt zkeb.*'"

# Expected output:
# zkeb.encrypted_backups
# zkeb.device_registrations

echo "✅ Database schema created!"
```

### Phase 3: GitHub Actions Setup (10 minutes)

```bash
# 1. Get Railway project ID
RAILWAY_PROJECT_ID=$(railway status --json | jq -r '.projectId')

# 2. Generate Railway API token
# Visit: https://railway.app/account/tokens
# Copy token

# 3. Add GitHub secrets
# Go to: https://github.com/<your-org>/<your-repo>/settings/secrets/actions
# Add these secrets:
#   RAILWAY_TOKEN=<your-railway-token>
#   RAILWAY_PROJECT_ID=<your-project-id>

echo "✅ GitHub Actions configured!"
```

### Phase 4: First Deployment (5 minutes)

```bash
# 1. Create GitHub Actions workflow files
mkdir -p .github/workflows
cp .SoT/sprints/sprint-01/research/workflows/* .github/workflows/

# 2. Commit and push
git add .github/workflows/
git commit -m "feat: add Railway CI/CD pipeline"
git push origin main

# 3. Watch deployment
# Visit: https://github.com/<your-org>/<your-repo>/actions

# 4. Verify deployment
DEPLOY_URL=$(railway status --service api-server --json | jq -r '.url')
curl $DEPLOY_URL/api/health

# Expected: {"status":"healthy","timestamp":"..."}

echo "✅ First deployment complete!"
echo "API URL: $DEPLOY_URL"
```

---

## Verification Checklist

Run these commands to verify everything is working:

```bash
# 1. Check service health
curl https://zkeb.ogel.app/api/health
# Expected: {"status":"healthy"}

# 2. Check database connectivity
curl https://zkeb.ogel.app/api/health/db
# Expected: {"status":"healthy","database":"postgresql"}

# 3. Check Redis connectivity
curl https://zkeb.ogel.app/api/health/redis
# Expected: {"status":"healthy","cache":"redis"}

# 4. View logs
railway logs --service api-server --tail

# 5. Check metrics
railway status --service api-server --json | jq
```

---

## Common Issues

### Issue: Deployment timeout
```bash
# Check logs
railway logs --service api-server

# Verify health endpoint
railway run --service api-server "curl localhost:3000/api/health"

# Increase timeout
# Edit railway.toml: healthcheckTimeout = 60
```

### Issue: Database connection error
```bash
# Verify DATABASE_URL is set
railway variables --service api-server | grep DATABASE_URL

# Test connection
railway run --service postgres "psql \$DATABASE_URL -c 'SELECT 1'"
```

### Issue: Build failure
```bash
# Check Docker build locally
docker build -t zkeb:test -f apps/security/Dockerfile .

# Verify platform is linux/amd64
docker buildx build --platform linux/amd64 -t zkeb:test .
```

---

## Next Steps

1. **Configure Custom Domain**:
   ```bash
   railway domain add zkeb.ogel.app --service api-server
   ```

2. **Set up Monitoring**:
   - Railway dashboard: https://railway.app/dashboard
   - View metrics: `railway metrics --service api-server`

3. **Configure Alerts**:
   - Add Slack webhook in Railway project settings
   - Set alert thresholds for CPU/memory/errors

4. **Load Testing**:
   ```bash
   # Install k6
   brew install k6

   # Run load test
   k6 run scripts/load-test.js
   ```

---

## Emergency Procedures

### Rollback Deployment
```bash
railway rollback --service api-server
```

### Check Error Logs
```bash
railway logs --service api-server --filter error
```

### Database Backup
```bash
railway run --service postgres \
  "pg_dump \$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

### Restart Service
```bash
railway restart --service api-server
```

---

## Cost Estimates

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| PostgreSQL | Starter | $5 |
| Redis | Starter | $5 |
| API Server | Developer | $10 |
| **Total** | | **$20/month** |

*Pricing accurate as of Nov 2025*

---

## Support

- **Full Documentation**: `.SoT/sprints/sprint-01/research/ZHANG-devops-railway.md`
- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Emergency Contact**: Zhang Wei (CI/CD Pipeline Engineer)

---

**Deployment Time**: ~30 minutes
**Complexity**: Medium
**Production Ready**: ✅ Yes
