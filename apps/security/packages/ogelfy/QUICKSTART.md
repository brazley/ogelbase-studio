# Kong + Ogelfy Quick Start Guide

Get Kong API Gateway + Ogelfy running in **5 minutes** locally or **15 minutes** on Railway.

---

## Local Development (5 minutes)

### 1. Prerequisites

```bash
# Install Docker
docker --version

# Install Docker Compose
docker-compose --version
```

### 2. Start Services

```bash
# Start Kong + 3 Ogelfy instances
bun run docker:dev

# Or directly:
docker-compose up -d
```

**What this does**:
- Starts Kong API Gateway on port 8000 (proxy) and 8001 (admin)
- Starts 3 Ogelfy instances (load balanced)
- Starts Redis (for distributed rate limiting)

### 3. Verify

```bash
# Check Kong status
bun run kong:status

# Test health endpoint
curl http://localhost:8000/health

# Test API endpoint
curl http://localhost:8000/api/hello
```

**Expected output**:
```json
{
  "message": "Hello from Ogelfy!",
  "service": "ogelfy",
  "replica": "1"
}
```

### 4. Test Load Balancing

```bash
# Send 10 requests, watch replica IDs rotate
for i in {1..10}; do
  curl -s http://localhost:8000/api/hello | jq '.replica'
done
```

**Expected**: `"1"`, `"2"`, `"3"`, `"1"`, `"2"`, `"3"`, etc.

### 5. View Logs

```bash
# All services
bun run docker:logs

# Kong only
docker-compose logs -f kong

# Ogelfy only
docker-compose logs -f ogelfy-1
```

### 6. Stop Services

```bash
bun run docker:stop

# Or:
docker-compose down
```

---

## Railway Deployment (15 minutes)

### 1. Prerequisites

```bash
# Install Railway CLI
npm i -g @railway/cli

# Verify
railway --version
```

### 2. Login & Create Project

```bash
# Login (opens browser)
railway login

# Create new project
railway init

# Or link existing project
railway link
```

### 3. Deploy Everything

```bash
# Automated deployment (creates services, deploys, configures)
bun run deploy:railway

# Or directly:
./scripts/deploy-kong.sh
```

**What this does**:
1. Creates 4 Railway services (kong, ogelfy-1, ogelfy-2, ogelfy-3)
2. Deploys Kong with load balancing
3. Deploys 3 Ogelfy instances
4. Configures environment variables and URLs
5. Tests deployment health

**Time**: ~10-15 minutes first time, ~3-5 minutes for redeployments.

### 4. Get Your URLs

```bash
# Kong URL (your public API)
railway service kong domain

# Example output:
# https://kong-production-abc123.up.railway.app
```

### 5. Test Deployment

```bash
# Replace with your Kong URL
KONG_URL=https://kong-production-abc123.up.railway.app

# Test health
curl $KONG_URL/health

# Test API
curl $KONG_URL/api/hello

# Test load balancing
for i in {1..10}; do
  curl -s $KONG_URL/api/hello | jq '.replica'
done
```

### 6. View Logs

```bash
# Kong logs
railway service kong logs

# Ogelfy logs
railway service ogelfy-1 logs
```

---

## Available Endpoints

Once running, Kong exposes:

**Public endpoints** (port 8000):
```
GET  /health          - Health check (returns Ogelfy status)
GET  /ready           - Readiness check (detailed health)
GET  /metrics         - Prometheus metrics
GET  /api             - API info
GET  /api/hello       - Hello endpoint
GET  /api/greet/:name - Greeting with name parameter
POST /api/echo        - Echo request body
```

**Admin endpoints** (port 8001, internal only):
```
GET  /status          - Kong status
GET  /services        - List services
GET  /routes          - List routes
GET  /upstreams       - List upstreams
GET  /plugins         - List plugins
```

---

## Quick Commands

```bash
# Local development
bun run dev                # Start Ogelfy only (no Kong)
bun run docker:dev         # Start Kong + Ogelfy + Redis
bun run docker:logs        # View logs
bun run docker:stop        # Stop all services

# Kong administration
bun run kong:status        # Kong status
bun run kong:health        # Upstream health
bun run kong:test          # Test all endpoints

# Railway deployment
bun run deploy:railway     # Deploy to Railway

# Manual commands
./scripts/kong-admin.sh help      # All admin commands
./scripts/deploy-kong.sh          # Railway deployment
```

---

## Testing the Setup

### Test Health Checks

```bash
# Local
curl http://localhost:8000/health

# Railway
curl https://your-kong-url/health
```

### Test Load Balancing

```bash
# Send 20 requests, count which replica handled each
curl -s http://localhost:8000/api/hello \
  | jq -r '.replica' \
  | sort | uniq -c

# Expected output (roughly equal distribution):
#   7 1
#   6 2
#   7 3
```

### Test Rate Limiting

```bash
# Send 1100 requests in quick succession
for i in {1..1100}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:8000/api/hello
done | grep -c 429

# Expected: Last ~100 requests return 429 (rate limited)
```

### Test CORS

```bash
curl -X OPTIONS \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/api/echo

# Check response headers:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

### Test Metrics

```bash
# Get Prometheus metrics
curl http://localhost:8000/metrics

# Example metrics:
# kong_http_requests_total{service="ogelfy-api"} 1234
# kong_latency_ms_bucket{type="request",le="100"} 1000
```

---

## Troubleshooting

### "Kong not accessible"

**Local**:
```bash
# Check if running
docker-compose ps

# View logs
docker-compose logs kong

# Restart
docker-compose restart kong
```

**Railway**:
```bash
# Check status
railway service kong status

# View logs
railway service kong logs

# Restart
railway service kong restart
```

### "Ogelfy instances unhealthy"

**Local**:
```bash
# Check Ogelfy directly (bypass Kong)
curl http://localhost:3000/health  # Won't work (not exposed)

# Check via Kong
./scripts/kong-admin.sh health

# Restart Ogelfy
docker-compose restart ogelfy-1
```

**Railway**:
```bash
# Check Ogelfy URL directly
curl https://ogelfy-1.up.railway.app/health

# Restart
railway service ogelfy-1 restart
```

### "Load balancing not working"

```bash
# Check upstream status
./scripts/kong-admin.sh health

# Verify all instances healthy
curl -s http://localhost:8001/upstreams/ogelfy-upstream/health | jq

# Expected: All targets showing "HEALTHY"
```

---

## Next Steps

### After Local Setup

1. **Explore API**: Try different endpoints (`/api/greet/YourName`, `/metrics`)
2. **Modify routes**: Edit `kong.yml`, restart Kong
3. **Add plugins**: Add authentication, custom plugins
4. **Read docs**: See [KONG_SETUP.md](./KONG_SETUP.md)

### After Railway Deployment

1. **Add custom domain**: `railway service kong domain add api.yourdomain.com`
2. **Set up monitoring**: UptimeRobot, Better Uptime, etc.
3. **Configure alerts**: Get notified on downtime
4. **Scale as needed**: Add more Ogelfy instances
5. **Optimize costs**: Right-size resources, monitor usage

---

## Configuration Files

- **`kong.yml`** - Kong declarative config (routes, services, plugins)
- **`kong.conf`** - Kong runtime settings (workers, timeouts)
- **`docker-compose.yml`** - Local development setup
- **`.env.example`** - Environment variables template
- **`Dockerfile.kong`** - Kong container image
- **`Dockerfile.ogelfy`** - Ogelfy container image

---

## Documentation

- **[KONG_SETUP.md](./KONG_SETUP.md)** - Complete Kong setup guide
- **[RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)** - Railway deployment guide
- **[scripts/README.md](./scripts/README.md)** - Scripts documentation
- **[README.md](./README.md)** - Ogelfy framework documentation

---

## Architecture Diagram

```
                 Client
                    ↓
        ┌───────────────────────┐
        │  Kong Gateway         │
        │  (Port 8000/8001)     │
        │  - Load Balancing     │
        │  - Rate Limiting      │
        │  - Health Checks      │
        │  - CORS               │
        │  - Metrics            │
        └─────────┬─────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ↓             ↓             ↓
┌─────────┐  ┌─────────┐  ┌─────────┐
│Ogelfy-1 │  │Ogelfy-2 │  │Ogelfy-3 │
│Port:3000│  │Port:3000│  │Port:3000│
└─────────┘  └─────────┘  └─────────┘
```

---

## Summary

**Local**: `bun run docker:dev` → visit http://localhost:8000/health

**Railway**: `bun run deploy:railway` → visit https://your-kong-url/health

**Total time**: 5 minutes (local), 15 minutes (Railway)

**You get**:
- ✅ Kong API Gateway with load balancing
- ✅ 3 Ogelfy instances (high availability)
- ✅ Automatic health checks and failover
- ✅ Rate limiting and CORS protection
- ✅ Prometheus metrics for monitoring
- ✅ Production-ready deployment on Railway

**Questions?** See full documentation in [KONG_SETUP.md](./KONG_SETUP.md).
