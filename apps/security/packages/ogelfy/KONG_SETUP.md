# Kong API Gateway Setup for Ogelfy on Railway

## Overview

This setup deploys **Kong API Gateway** as a load balancer and infrastructure layer for **Ogelfy**, a high-performance Bun-native web framework. Kong handles load balancing, rate limiting, health checks, and observability, while Ogelfy focuses on business logic.

## Architecture

```
                    Internet
                       ↓
        ┌──────────────────────────┐
        │  Kong Gateway (Railway)  │
        │  - Load Balancing        │
        │  - Rate Limiting         │
        │  - Health Checks         │
        │  - CORS                  │
        │  - Metrics (Prometheus)  │
        └──────────┬───────────────┘
                   │
        ┌──────────┴────────────────┐
        │                           │
        ↓                           ↓
┌───────────────┐         ┌───────────────┐
│  Ogelfy-1     │         │  Ogelfy-2     │
│  (Railway)    │         │  (Railway)    │
│  Port: 3000   │         │  Port: 3000   │
└───────────────┘         └───────────────┘
        │                           │
        └──────────┬────────────────┘
                   ↓
         ┌───────────────┐
         │  Ogelfy-3     │
         │  (Railway)    │
         │  Port: 3000   │
         └───────────────┘
```

## Files Structure

```
ogelfy/
├── kong.yml                 # Kong declarative configuration
├── kong.conf                # Kong runtime settings
├── Dockerfile.kong          # Kong container image
├── Dockerfile.ogelfy        # Ogelfy container image
├── docker-compose.yml       # Local development setup
├── .env.example             # Environment variables template
├── src/
│   └── server.ts            # Production Ogelfy server
└── scripts/
    ├── deploy-kong.sh       # Railway deployment automation
    └── kong-admin.sh        # Kong administration helper
```

## Quick Start

### Local Development

1. **Start all services** (Kong + 3 Ogelfy instances):
   ```bash
   docker-compose up -d
   ```

2. **Check Kong status**:
   ```bash
   ./scripts/kong-admin.sh status
   ```

3. **Test Ogelfy through Kong**:
   ```bash
   curl http://localhost:8000/api/hello
   ```

4. **View metrics**:
   ```bash
   curl http://localhost:8000/metrics
   ```

5. **Stop services**:
   ```bash
   docker-compose down
   ```

### Railway Deployment

1. **Prerequisites**:
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli

   # Login to Railway
   railway login

   # Link to your project (or create new)
   railway init
   ```

2. **Deploy everything** (Kong + 3 Ogelfy instances):
   ```bash
   ./scripts/deploy-kong.sh
   ```

3. **Check deployment status**:
   ```bash
   railway status
   ```

4. **View logs**:
   ```bash
   railway service kong logs
   railway service ogelfy-1 logs
   ```

## Configuration

### Kong Configuration (`kong.yml`)

The declarative config defines:
- **Services**: Ogelfy API service definition
- **Routes**: HTTP routes to Ogelfy (`/api`, `/health`)
- **Upstreams**: 3 Ogelfy instances with health checks
- **Plugins**: Rate limiting, CORS, Prometheus, logging

**Key Settings**:
```yaml
services:
  - name: ogelfy-api
    url: ${OGELFY_URL}          # Primary Ogelfy instance
    retries: 3
    connect_timeout: 5000

    upstreams:
      - algorithm: round-robin   # Load balancing strategy
        healthchecks:
          active:
            http_path: /health   # Health check endpoint
            interval: 5          # Check every 5 seconds
```

### Environment Variables

**Kong** (set in Railway):
```bash
PORT=8000
KONG_DATABASE=off                  # DB-less mode
KONG_DECLARATIVE_CONFIG=/app/kong.yml
OGELFY_1_URL=ogelfy-1.up.railway.app
OGELFY_2_URL=ogelfy-2.up.railway.app
OGELFY_3_URL=ogelfy-3.up.railway.app
```

**Ogelfy** (set in Railway):
```bash
PORT=3000
NODE_ENV=production
RAILWAY_REPLICA_ID=1              # Unique per instance
```

## Kong Features

### 1. Load Balancing

Kong distributes traffic across 3 Ogelfy instances using **round-robin** algorithm.

**Algorithm options** (edit `kong.yml`):
- `round-robin` - Default, equal distribution
- `least-connections` - Sends to least-busy instance
- `consistent-hashing` - Sticky sessions based on client IP

### 2. Health Checks

Kong actively monitors Ogelfy instances:
- **Active checks**: HTTP GET `/health` every 5 seconds
- **Passive checks**: Monitor real request failures
- **Automatic removal**: Unhealthy instances removed from rotation

**Health check endpoint** (Ogelfy provides this):
```typescript
app.get('/health', async () => ({
  status: 'ok',
  uptime: process.uptime(),
  memory: process.memoryUsage(),
}));
```

### 3. Rate Limiting

Protects Ogelfy from overload:
- **1000 requests/minute** per client
- **50,000 requests/hour** per client
- Returns `429 Too Many Requests` when exceeded

**Headers returned**:
```
X-RateLimit-Limit-Minute: 1000
X-RateLimit-Remaining-Minute: 999
```

### 4. CORS

Handles Cross-Origin Resource Sharing:
- Allows all origins (`*`) - restrict in production
- Supports credentials
- Handles preflight OPTIONS requests
- Exposes custom headers (`X-Request-Id`, rate limit headers)

### 5. Observability

**Prometheus Metrics** (`/metrics`):
```
kong_http_requests_total
kong_latency_ms
kong_bandwidth_bytes
kong_upstream_health_checks
```

**Request Correlation** (`X-Request-Id`):
- UUID generated per request
- Passed to Ogelfy
- Useful for distributed tracing

**Logging**:
- All requests logged to stdout
- JSON format for parsing
- Includes upstream response times

## Administration

### Kong Admin API

Access Kong's admin API (port 8001):

```bash
# Status
curl http://localhost:8001/status

# Services
curl http://localhost:8001/services

# Upstream health
curl http://localhost:8001/upstreams/ogelfy-upstream/health
```

### Helper Script

Use `kong-admin.sh` for common tasks:

```bash
# Check Kong status
./scripts/kong-admin.sh status

# View upstream health
./scripts/kong-admin.sh health

# List services and routes
./scripts/kong-admin.sh services
./scripts/kong-admin.sh routes

# Test endpoints
./scripts/kong-admin.sh test

# View logs
./scripts/kong-admin.sh logs
```

### Updating Configuration

**DB-less mode** (our setup) - Kong reloads automatically:

1. Edit `kong.yml`
2. Commit changes
3. Railway auto-deploys and reloads Kong

**No database required** - configuration is in `kong.yml`.

## Railway-Specific Notes

### Service Structure

Deploy as **separate Railway services**:
- **kong** - Kong Gateway (1 instance)
- **ogelfy-1** - Ogelfy instance 1
- **ogelfy-2** - Ogelfy instance 2
- **ogelfy-3** - Ogelfy instance 3

Each service gets its own Railway URL (e.g., `ogelfy-1.up.railway.app`).

### Networking

Railway services communicate via **public URLs** (no internal DNS yet):
- Kong uses `https://ogelfy-1.up.railway.app` URLs
- All traffic is HTTPS (Railway provides SSL)
- No private networking configuration needed

### Scaling

**Horizontal scaling** (add more Ogelfy instances):
1. Create new Railway service: `railway service create ogelfy-4`
2. Deploy Ogelfy: `railway service ogelfy-4 deploy --dockerfile Dockerfile.ogelfy`
3. Add to `kong.yml` upstreams:
   ```yaml
   targets:
     - target: ${OGELFY_4_URL}:443
       weight: 100
   ```
4. Set environment variable: `railway service kong variables set OGELFY_4_URL=ogelfy-4.up.railway.app`
5. Redeploy Kong: `railway service kong deploy`

**Vertical scaling** (more resources per instance):
- Railway dashboard → Service → Settings → Resources
- Increase CPU/Memory limits
- No code changes needed

### Costs

**Estimated Railway costs** (3 Ogelfy + 1 Kong):
- **Hobby plan**: ~$5-10/month (limited resources)
- **Pro plan**: ~$25-50/month (production-ready)
- **Scale plan**: ~$100+/month (high traffic)

**Cost optimization**:
- Use 2 Ogelfy instances instead of 3 (save 33%)
- Scale down during off-hours (Railway doesn't support this yet)
- Monitor resource usage and right-size instances

## Testing

### Local Testing

```bash
# Start services
docker-compose up -d

# Test health check
curl http://localhost:8000/health

# Test API endpoint
curl http://localhost:8000/api/hello

# Test with replica identification
for i in {1..10}; do
  curl -s http://localhost:8000/api/hello | jq '.replica'
done
# Output: "1", "2", "3", "1", "2", "3", ... (round-robin)

# Test rate limiting (send 1100 requests in 1 minute)
for i in {1..1100}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/hello
done
# Last 100 requests should return 429 (rate limited)
```

### Production Testing

```bash
# Get Kong URL
KONG_URL=$(railway service kong domain)

# Test health
curl https://$KONG_URL/health

# Test API
curl https://$KONG_URL/api/hello

# Check metrics
curl https://$KONG_URL/metrics

# Load test (requires `wrk`)
wrk -t4 -c100 -d30s https://$KONG_URL/api/hello
```

## Monitoring

### Prometheus Integration

Kong exposes Prometheus metrics at `/metrics`:

```bash
# Scrape metrics
curl http://localhost:8000/metrics

# Example output:
# kong_http_requests_total{service="ogelfy-api",route="api-routes"} 1234
# kong_latency_ms_bucket{type="request",le="100"} 1000
```

**Integrate with Prometheus**:
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kong'
    static_configs:
      - targets: ['kong.railway.app:8000']
    metrics_path: '/metrics'
```

### Logging

**Railway Logs**:
```bash
# Kong logs
railway service kong logs

# Ogelfy logs
railway service ogelfy-1 logs
railway service ogelfy-2 logs
railway service ogelfy-3 logs
```

**External logging** (optional):
- Add `http-log` plugin to `kong.yml`
- Send logs to Datadog, Logtail, etc.

## Troubleshooting

### Kong not starting

**Check logs**:
```bash
railway service kong logs
# or
docker-compose logs kong
```

**Common issues**:
- Invalid `kong.yml` syntax: Validate with `kong check kong.conf`
- Environment variables not set: Check `OGELFY_*_URL` variables
- Port conflict: Ensure port 8000 is available

### Ogelfy instances unhealthy

**Check health endpoint**:
```bash
curl https://ogelfy-1.up.railway.app/health
```

**Common issues**:
- Service not responding: Check Ogelfy logs
- Health check path wrong: Ensure `/health` route exists
- Timeout too short: Increase `connect_timeout` in `kong.yml`

### Load balancing not working

**Check upstream health**:
```bash
./scripts/kong-admin.sh health
```

**Common issues**:
- All instances showing as unhealthy: Check Ogelfy health endpoints
- Only one instance receiving traffic: Check upstream weights in `kong.yml`
- Sticky sessions: Change algorithm to `round-robin` in `kong.yml`

### Rate limiting not working

**Test with multiple requests**:
```bash
for i in {1..1100}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/hello
done
```

**Common issues**:
- Not hitting limit: Check `minute` value in `kong.yml` rate-limiting plugin
- Policy not applied: Verify plugin is enabled (`./scripts/kong-admin.sh plugins`)
- Redis not connected (if using Redis policy): Check `REDIS_*` environment variables

## Advanced Configuration

### Adding Redis for Distributed Rate Limiting

**Why**: Local rate limiting is per-Kong instance. Redis enables distributed rate limiting across multiple Kong instances.

1. **Deploy Redis on Railway**:
   ```bash
   railway service create redis
   railway service redis deploy --image redis:7-alpine
   ```

2. **Update `kong.yml`** rate-limiting plugin:
   ```yaml
   plugins:
     - name: rate-limiting
       config:
         policy: redis        # Change from 'local'
         redis_host: ${REDIS_HOST}
         redis_port: ${REDIS_PORT}
         redis_password: ${REDIS_PASSWORD}
   ```

3. **Set environment variables**:
   ```bash
   REDIS_URL=$(railway service redis domain)
   railway service kong variables set \
     REDIS_HOST=$REDIS_URL \
     REDIS_PORT=6379 \
     REDIS_PASSWORD=your-redis-password
   ```

### Custom Domain

1. **Add domain in Railway**:
   ```bash
   railway service kong domain add api.yourdomain.com
   ```

2. **Update DNS** (Railway provides instructions):
   ```
   CNAME: api.yourdomain.com → your-project.up.railway.app
   ```

3. **Update Kong routes** in `kong.yml` (if needed):
   ```yaml
   routes:
     - hosts:
         - api.yourdomain.com
   ```

### SSL/TLS Termination

**Railway handles SSL automatically**:
- Free Let's Encrypt certificates
- Auto-renewal
- HTTPS enforced by default

**Kong configuration** (if using external SSL):
- Set `KONG_SSL_CERT` and `KONG_SSL_CERT_KEY` environment variables
- Configure `ssl_listen` in `kong.conf`

## Migration from Other Platforms

### From Heroku/Render

Similar setup, replace platform-specific configs:
- **Service URLs**: Use Railway URLs instead of Heroku/Render URLs
- **Environment variables**: Set in Railway dashboard or CLI
- **Scaling**: Use Railway's dashboard instead of Heroku dynos

### From Kubernetes

Simpler on Railway:
- **No YAML manifests** required (Railway uses Dockerfiles)
- **No Ingress/LoadBalancer** setup (Kong handles this)
- **No kubectl** commands (use Railway CLI)

Trade-offs:
- **Less control**: Railway manages infrastructure
- **Easier setup**: No cluster management
- **Cost**: Potentially cheaper for small-medium apps

## Performance Optimization

### Kong Performance

**Increase worker processes** (`kong.conf`):
```conf
nginx_worker_processes = auto  # Use all CPU cores
nginx_worker_connections = 10240  # Max connections per worker
```

**Enable caching** (add to `kong.yml`):
```yaml
plugins:
  - name: proxy-cache
    config:
      strategy: memory
      content_type:
        - application/json
      cache_ttl: 300  # 5 minutes
```

### Ogelfy Performance

**Optimize memory** (`src/server.ts`):
```typescript
const app = new Ogelfy({
  maxRequestBodySize: 1024 * 1024 * 10,  // 10MB limit
  keepAliveTimeout: 5000,
});
```

**Railway resource allocation**:
- Monitor memory usage: `railway service ogelfy-1 metrics`
- Increase if consistently > 80%: Railway dashboard → Resources

## Security Best Practices

### 1. Lock Down Admin API

**Production**: Restrict Kong Admin API to internal access only:
```conf
# kong.conf
admin_listen = 127.0.0.1:8001  # Localhost only
```

**Railway**: Use Railway's internal networking (when available).

### 2. API Key Authentication

Add API key plugin to `kong.yml`:
```yaml
plugins:
  - name: key-auth
    service: ogelfy-api
    config:
      key_names:
        - apikey
```

Create API keys:
```bash
curl -X POST http://localhost:8001/consumers \
  --data "username=client1"

curl -X POST http://localhost:8001/consumers/client1/key-auth \
  --data "key=your-secret-key"
```

### 3. IP Restrictions

Whitelist allowed IPs:
```yaml
plugins:
  - name: ip-restriction
    service: ogelfy-api
    config:
      allow:
        - 10.0.0.0/8
        - 192.168.0.0/16
```

### 4. Rate Limiting

Already configured! Adjust limits in `kong.yml`:
```yaml
config:
  minute: 100      # Lower for stricter limiting
  hour: 10000
```

## Resources

### Documentation
- **Kong Gateway**: https://docs.konghq.com/gateway/
- **Kong DB-less mode**: https://docs.konghq.com/gateway/latest/production/deployment-topologies/db-less-and-declarative-config/
- **Railway**: https://docs.railway.app/
- **Ogelfy**: See [README.md](./README.md)

### Tools
- **Railway CLI**: https://docs.railway.app/develop/cli
- **Kong Admin API**: https://docs.konghq.com/gateway/latest/admin-api/
- **Prometheus**: https://prometheus.io/docs/

### Support
- **Kong Community**: https://discuss.konghq.com/
- **Railway Discord**: https://discord.gg/railway
- **Ogelfy Issues**: File issues in this repo

---

## Summary

You now have:
- ✅ Kong API Gateway handling infrastructure concerns
- ✅ 3 Ogelfy instances with automatic load balancing
- ✅ Health checks and automatic failover
- ✅ Rate limiting and CORS protection
- ✅ Prometheus metrics and logging
- ✅ Railway deployment automation
- ✅ Local development environment with Docker Compose

**Next steps**:
1. Deploy to Railway: `./scripts/deploy-kong.sh`
2. Add custom domain: `railway service kong domain add api.yourdomain.com`
3. Set up monitoring: Integrate Prometheus metrics
4. Secure Admin API: Restrict to internal access
5. Scale as needed: Add more Ogelfy instances

**Questions?** Check the troubleshooting section or Kong documentation.
