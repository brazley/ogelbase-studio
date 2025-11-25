# Railway Deployment Guide for Kong + Ogelfy

## Overview

This guide walks you through deploying Kong API Gateway with 3 Ogelfy instances on Railway from scratch.

**Total time**: 15-20 minutes
**Cost**: ~$25-50/month (Pro plan)
**Prerequisites**: Railway account, Railway CLI installed

---

## Step-by-Step Deployment

### 1. Railway Setup

**Install Railway CLI** (if not installed):
```bash
npm i -g @railway/cli
```

**Login to Railway**:
```bash
railway login
```

**Create new project** (or link existing):
```bash
# Create new
railway init

# Or link existing
railway link
```

**Verify project**:
```bash
railway status
```

---

### 2. Create Services

Railway doesn't use `railway.toml` for service definitions. Instead, create services manually:

**Create Kong service**:
```bash
railway service create kong
```

**Create Ogelfy services**:
```bash
railway service create ogelfy-1
railway service create ogelfy-2
railway service create ogelfy-3
```

**Verify services**:
```bash
railway service list
```

You should see:
```
- kong
- ogelfy-1
- ogelfy-2
- ogelfy-3
```

---

### 3. Deploy Ogelfy Instances

Deploy each Ogelfy instance separately:

**Deploy Ogelfy-1**:
```bash
railway service ogelfy-1 \
  --dockerfile Dockerfile.ogelfy \
  up
```

**Set environment variables**:
```bash
railway service ogelfy-1 variables set \
  PORT=3000 \
  NODE_ENV=production \
  RAILWAY_SERVICE_NAME=ogelfy \
  RAILWAY_REPLICA_ID=1
```

**Repeat for Ogelfy-2 and Ogelfy-3**:
```bash
# Ogelfy-2
railway service ogelfy-2 --dockerfile Dockerfile.ogelfy up
railway service ogelfy-2 variables set \
  PORT=3000 NODE_ENV=production \
  RAILWAY_SERVICE_NAME=ogelfy RAILWAY_REPLICA_ID=2

# Ogelfy-3
railway service ogelfy-3 --dockerfile Dockerfile.ogelfy up
railway service ogelfy-3 variables set \
  PORT=3000 NODE_ENV=production \
  RAILWAY_SERVICE_NAME=ogelfy RAILWAY_REPLICA_ID=3
```

**Generate public domains** (Railway auto-generates URLs):
```bash
railway service ogelfy-1 domain
railway service ogelfy-2 domain
railway service ogelfy-3 domain
```

Save these URLs - you'll need them for Kong configuration.

---

### 4. Configure Kong Environment

Kong needs to know the Ogelfy service URLs:

**Get Ogelfy URLs**:
```bash
OGELFY_1_URL=$(railway service ogelfy-1 domain | sed 's/https:\/\///')
OGELFY_2_URL=$(railway service ogelfy-2 domain | sed 's/https:\/\///')
OGELFY_3_URL=$(railway service ogelfy-3 domain | sed 's/https:\/\///')
```

**Set Kong environment variables**:
```bash
railway service kong variables set \
  PORT=8000 \
  KONG_DATABASE=off \
  KONG_DECLARATIVE_CONFIG=/app/kong.yml \
  KONG_PROXY_LISTEN="0.0.0.0:8000" \
  KONG_ADMIN_LISTEN="0.0.0.0:8001" \
  KONG_LOG_LEVEL=info \
  OGELFY_URL="https://$OGELFY_1_URL" \
  OGELFY_1_URL="$OGELFY_1_URL" \
  OGELFY_2_URL="$OGELFY_2_URL" \
  OGELFY_3_URL="$OGELFY_3_URL"
```

---

### 5. Deploy Kong

**Deploy Kong service**:
```bash
railway service kong \
  --dockerfile Dockerfile.kong \
  up
```

**Wait for deployment** (check logs):
```bash
railway service kong logs
```

Look for:
```
Kong started
```

**Get Kong URL**:
```bash
railway service kong domain
```

---

### 6. Verify Deployment

**Test Kong health**:
```bash
KONG_URL=$(railway service kong domain)
curl https://$KONG_URL/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "ogelfy",
  "replica": "1",
  "uptime": 42.5
}
```

**Test API endpoint**:
```bash
curl https://$KONG_URL/api/hello
```

**Test load balancing** (send 10 requests, watch replica IDs change):
```bash
for i in {1..10}; do
  curl -s https://$KONG_URL/api/hello | jq '.replica'
done
```

Output should rotate: `"1"`, `"2"`, `"3"`, `"1"`, etc.

---

## Railway-Specific Configurations

### Service Networking

**Railway networking** (as of Nov 2024):
- ✅ Each service gets a public URL: `{service}.up.railway.app`
- ✅ All traffic is HTTPS (free SSL)
- ❌ No internal `.railway.internal` DNS (yet)
- ❌ No private networking between services (yet)

**Current solution**: Kong uses public Ogelfy URLs.

**Future**: When Railway adds private networking, update `kong.yml`:
```yaml
url: http://ogelfy-1.railway.internal:3000
```

### Resource Allocation

**Default resources** (Railway Pro plan):
- **CPU**: 1 vCPU (shared)
- **Memory**: 512MB
- **Disk**: 10GB (ephemeral)

**Recommended for production**:

**Kong**:
- CPU: 1 vCPU
- Memory: 512MB (Kong is lightweight)

**Ogelfy** (per instance):
- CPU: 1 vCPU
- Memory: 512MB - 1GB (Bun is efficient)

**Adjust in Railway dashboard**:
1. Go to service → Settings → Resources
2. Increase CPU/Memory as needed
3. Monitor with `railway service {name} metrics`

### Volumes (Persistent Storage)

**Kong doesn't need volumes** (DB-less mode stores config in memory).

**If you need persistent storage**:
```bash
railway service {name} volume create \
  --name data \
  --mount-path /data \
  --size 10
```

### Environment Variables

**View all variables**:
```bash
railway service kong variables
```

**Add variable**:
```bash
railway service kong variables set KEY=value
```

**Remove variable**:
```bash
railway service kong variables unset KEY
```

**Bulk set** (from `.env` file):
```bash
railway service kong variables set \
  $(cat .env | xargs)
```

---

## Scaling

### Horizontal Scaling (Add More Ogelfy Instances)

**Add Ogelfy-4**:
```bash
# Create service
railway service create ogelfy-4

# Deploy
railway service ogelfy-4 --dockerfile Dockerfile.ogelfy up

# Configure
railway service ogelfy-4 variables set \
  PORT=3000 NODE_ENV=production \
  RAILWAY_SERVICE_NAME=ogelfy RAILWAY_REPLICA_ID=4

# Get URL
OGELFY_4_URL=$(railway service ogelfy-4 domain | sed 's/https:\/\///')

# Update Kong config
railway service kong variables set OGELFY_4_URL="$OGELFY_4_URL"
```

**Update `kong.yml`** (add to upstreams):
```yaml
upstreams:
  - name: ogelfy-upstream
    targets:
      - target: ${OGELFY_1_URL}:443
        weight: 100
      - target: ${OGELFY_2_URL}:443
        weight: 100
      - target: ${OGELFY_3_URL}:443
        weight: 100
      - target: ${OGELFY_4_URL}:443
        weight: 100
```

**Redeploy Kong**:
```bash
git add kong.yml
git commit -m "Add ogelfy-4 to upstream"
railway service kong up
```

### Vertical Scaling (More Resources)

**Railway dashboard** → Service → Settings → Resources:
- Increase CPU: 1 → 2 vCPUs
- Increase Memory: 512MB → 1GB → 2GB

**No code changes needed** - Railway automatically restarts service.

---

## Monitoring & Observability

### Railway Logs

**View logs** (real-time):
```bash
railway service kong logs
railway service ogelfy-1 logs
```

**Filter logs**:
```bash
# Errors only
railway service kong logs | grep ERROR

# Specific endpoint
railway service kong logs | grep '/api/hello'
```

### Metrics

**Railway metrics** (CPU, Memory, Network):
```bash
railway service kong metrics
```

**Prometheus metrics** (from Kong):
```bash
KONG_URL=$(railway service kong domain)
curl https://$KONG_URL/metrics
```

**Integrate with external monitoring**:
- Datadog: Use `http-log` plugin
- New Relic: Use custom integration
- Grafana: Scrape `/metrics` endpoint

### Alerting

**Railway doesn't have built-in alerting** (yet).

**Options**:
1. **UptimeRobot**: Free uptime monitoring
   - URL: `https://{kong-url}/health`
   - Check interval: 5 minutes
   - Alert via email/SMS

2. **Better Uptime**: Advanced monitoring
   - Health checks
   - Incident management
   - Status page

3. **Custom**: Use Kong's `http-log` plugin
   - Send logs to your monitoring service
   - Set up alerts there

---

## Cost Optimization

### Reduce Ogelfy Instances

**2 instances instead of 3**:
- Still provides redundancy
- Saves ~$8-15/month
- Trade-off: Less capacity for traffic spikes

**Remove Ogelfy-3**:
```bash
railway service ogelfy-3 delete
```

**Update `kong.yml`** (remove target):
```yaml
targets:
  - target: ${OGELFY_1_URL}:443
    weight: 100
  - target: ${OGELFY_2_URL}:443
    weight: 100
  # Removed OGELFY_3
```

### Right-Size Resources

**Monitor usage**:
```bash
railway service kong metrics
railway service ogelfy-1 metrics
```

**If CPU/Memory < 50% consistently**:
- Reduce resources in Railway dashboard
- Save costs without impacting performance

### Use Hobby Plan for Development

**Hobby plan** (~$5/month):
- Good for development/staging
- Limited resources (512MB memory)
- Not for production traffic

**Pro plan** (~$25-50/month):
- Production-ready
- Better SLA
- Priority support

---

## Troubleshooting

### Kong Won't Start

**Check logs**:
```bash
railway service kong logs
```

**Common issues**:

1. **Invalid kong.yml**:
   ```
   Error: failed to load declarative config file
   ```
   **Fix**: Validate `kong.yml` locally:
   ```bash
   docker run --rm -v $(pwd):/kong kong:3.4-alpine kong check /kong/kong.yml
   ```

2. **Environment variables not set**:
   ```
   Error: OGELFY_1_URL not found
   ```
   **Fix**: Set all required variables:
   ```bash
   railway service kong variables
   ```

3. **Port conflict**:
   ```
   Error: Address already in use
   ```
   **Fix**: Change PORT in Railway (should be 8000 by default).

### Ogelfy Instances Unhealthy

**Check health endpoint**:
```bash
curl https://ogelfy-1.up.railway.app/health
```

**Common issues**:

1. **Service not responding**:
   ```bash
   railway service ogelfy-1 logs
   ```
   Look for startup errors.

2. **Health check timeout**:
   Update `kong.yml`:
   ```yaml
   healthchecks:
     active:
       timeout: 10  # Increase from 1
   ```

3. **Wrong health check path**:
   Ensure Ogelfy has `/health` route in `src/server.ts`.

### Load Balancing Not Working

**Test with request IDs**:
```bash
for i in {1..10}; do
  curl -s https://{kong-url}/api/hello | jq '.replica'
done
```

**Common issues**:

1. **All requests to one instance**:
   - Check upstream algorithm: `round-robin` in `kong.yml`
   - Verify all instances healthy: `./scripts/kong-admin.sh health`

2. **Sticky sessions** (unexpected):
   - Disable `consistent-hashing` if set
   - Use `round-robin` algorithm

### High Latency

**Check Kong metrics**:
```bash
curl https://{kong-url}/metrics | grep latency
```

**Common issues**:

1. **Upstream timeout**:
   Increase in `kong.yml`:
   ```yaml
   connect_timeout: 10000  # 10 seconds
   ```

2. **Health check overhead**:
   Reduce frequency in `kong.yml`:
   ```yaml
   healthchecks:
     active:
       healthy:
         interval: 10  # From 5
   ```

3. **Under-provisioned resources**:
   - Increase CPU/Memory in Railway dashboard
   - Monitor with `railway service {name} metrics`

---

## Advanced: CI/CD Integration

### GitHub Actions

**Deploy on push**:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Railway CLI
        run: npm i -g @railway/cli

      - name: Deploy Kong
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway service kong up --dockerfile Dockerfile.kong

      - name: Deploy Ogelfy
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway service ogelfy-1 up --dockerfile Dockerfile.ogelfy
          railway service ogelfy-2 up --dockerfile Dockerfile.ogelfy
          railway service ogelfy-3 up --dockerfile Dockerfile.ogelfy
```

**Get Railway token**:
```bash
railway login
railway token
```

Add to GitHub Secrets: `RAILWAY_TOKEN`.

---

## Checklist

### Pre-Deployment
- [ ] Railway account created
- [ ] Railway CLI installed (`railway --version`)
- [ ] Logged in (`railway whoami`)
- [ ] Project created/linked (`railway init` or `railway link`)
- [ ] All services created (kong, ogelfy-1, ogelfy-2, ogelfy-3)

### Deployment
- [ ] Ogelfy instances deployed
- [ ] Ogelfy environment variables set
- [ ] Ogelfy domains generated
- [ ] Kong environment variables set (including OGELFY URLs)
- [ ] Kong deployed
- [ ] Kong domain generated

### Verification
- [ ] Kong health check passing (`/health`)
- [ ] API endpoints responding (`/api/hello`)
- [ ] Load balancing working (replica IDs rotating)
- [ ] Metrics accessible (`/metrics`)
- [ ] Logs visible (`railway service kong logs`)

### Production Readiness
- [ ] Custom domain configured (optional)
- [ ] Resources right-sized (CPU/Memory)
- [ ] Monitoring set up (UptimeRobot, etc.)
- [ ] Rate limits configured for traffic
- [ ] Admin API secured (localhost only)
- [ ] SSL certificate verified (Railway auto-provision)

---

## Summary

You deployed:
- ✅ **Kong API Gateway** on Railway
- ✅ **3 Ogelfy instances** with load balancing
- ✅ **Health checks** and automatic failover
- ✅ **Rate limiting** and CORS
- ✅ **Prometheus metrics** for monitoring

**Railway URL**: `https://{your-kong-service}.up.railway.app`

**Total cost**: ~$25-50/month (Pro plan, 4 services)

**Next steps**:
1. Add custom domain
2. Set up monitoring (UptimeRobot)
3. Configure alerting
4. Scale as traffic grows

**Questions?** See [KONG_SETUP.md](./KONG_SETUP.md) or Railway docs.
