# Kong + Ogelfy Command Reference

Quick reference for all commands, endpoints, and operations.

---

## 📦 NPM Scripts

```bash
# Development
bun run dev              # Start Ogelfy server only
bun run start            # Start Ogelfy production server

# Docker Compose (Local Development)
bun run docker:dev       # Start Kong + 3 Ogelfy + Redis
bun run docker:logs      # View all logs
bun run docker:stop      # Stop all services

# Kong Administration
bun run kong:status      # Kong status
bun run kong:health      # Upstream health
bun run kong:test        # Test all endpoints

# Railway Deployment
bun run deploy:railway   # Deploy to Railway

# Testing
bun test                 # Run Ogelfy tests
```

---

## 🐳 Docker Compose Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f              # All services
docker-compose logs -f kong         # Kong only
docker-compose logs -f ogelfy-1     # Ogelfy-1 only

# Restart services
docker-compose restart kong
docker-compose restart ogelfy-1

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Check service status
docker-compose ps
```

---

## 🚂 Railway CLI Commands

```bash
# Setup
npm i -g @railway/cli   # Install Railway CLI
railway --version       # Check version
railway login           # Login to Railway
railway whoami          # Check current user

# Project Management
railway init            # Create new project
railway link            # Link existing project
railway status          # Show project status
railway list            # List all projects

# Service Management
railway service list                    # List services
railway service create {name}           # Create service
railway service {name} up               # Deploy service
railway service {name} logs             # View logs
railway service {name} status           # Service status
railway service {name} restart          # Restart service
railway service {name} delete           # Delete service

# Deployment
railway service kong up --dockerfile Dockerfile.kong
railway service ogelfy-1 up --dockerfile Dockerfile.ogelfy

# Environment Variables
railway service kong variables              # List variables
railway service kong variables set KEY=val  # Set variable
railway service kong variables unset KEY    # Remove variable

# Domains
railway service kong domain                 # Get domain
railway service kong domain add custom.com  # Add custom domain

# Logs & Monitoring
railway service kong logs           # Real-time logs
railway service kong metrics        # Service metrics
```

---

## 🔧 Kong Admin Script

```bash
./scripts/kong-admin.sh status      # Kong status
./scripts/kong-admin.sh services    # List services
./scripts/kong-admin.sh routes      # List routes
./scripts/kong-admin.sh upstreams   # List upstream targets
./scripts/kong-admin.sh health      # Upstream health
./scripts/kong-admin.sh plugins     # List plugins
./scripts/kong-admin.sh metrics     # Prometheus metrics
./scripts/kong-admin.sh config      # Kong configuration
./scripts/kong-admin.sh test        # Test all endpoints
./scripts/kong-admin.sh logs        # Tail Kong logs
./scripts/kong-admin.sh help        # Show help
```

**With custom URLs**:
```bash
KONG_ADMIN_URL=https://kong.railway.app:8001 ./scripts/kong-admin.sh status
KONG_PROXY_URL=https://kong.railway.app:8000 ./scripts/kong-admin.sh test
```

---

## 🚀 Deployment Script

```bash
# Full Railway deployment
./scripts/deploy-kong.sh

# What it does:
# 1. Creates 4 Railway services
# 2. Deploys Kong + 3 Ogelfy instances
# 3. Configures environment variables
# 4. Tests deployment
# 5. Outputs service URLs
```

---

## 🌐 API Endpoints

### Local Development (http://localhost:8000)

```bash
# Health & Status
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl http://localhost:8000/metrics

# API Endpoints
curl http://localhost:8000/api
curl http://localhost:8000/api/hello
curl http://localhost:8000/api/greet/World

# POST Request
curl -X POST http://localhost:8000/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

### Railway Production (https://your-kong-url)

```bash
# Replace with your Kong URL
KONG_URL=https://kong-production.up.railway.app

# Health & Status
curl $KONG_URL/health
curl $KONG_URL/ready
curl $KONG_URL/metrics

# API Endpoints
curl $KONG_URL/api
curl $KONG_URL/api/hello
curl $KONG_URL/api/greet/YourName

# POST Request
curl -X POST $KONG_URL/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

---

## 🔍 Testing Commands

### Health Check

```bash
# Local
curl -s http://localhost:8000/health | jq

# Railway
curl -s https://your-kong-url/health | jq
```

**Expected Response**:
```json
{
  "status": "ok",
  "service": "ogelfy",
  "replica": "1",
  "uptime": 42.5,
  "timestamp": "2024-11-22T19:00:00.000Z"
}
```

### Load Balancing Test

```bash
# Send 10 requests, watch replica IDs
for i in {1..10}; do
  curl -s http://localhost:8000/api/hello | jq -r '.replica'
done

# Expected output: 1, 2, 3, 1, 2, 3, 1, 2, 3, 1
```

### Rate Limiting Test

```bash
# Send 1100 requests rapidly
for i in {1..1100}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:8000/api/hello
done | sort | uniq -c

# Expected: ~1000 × 200, ~100 × 429
```

### CORS Test

```bash
curl -X OPTIONS http://localhost:8000/api/echo \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -v

# Check response headers:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

### Metrics Test

```bash
curl http://localhost:8000/metrics

# Look for:
# kong_http_requests_total
# kong_latency_ms
# kong_bandwidth_bytes
```

---

## 🔧 Kong Admin API

### Service Status

```bash
# Kong status
curl http://localhost:8001/status | jq

# List services
curl http://localhost:8001/services | jq

# List routes
curl http://localhost:8001/routes | jq

# Show specific service
curl http://localhost:8001/services/ogelfy-api | jq
```

### Upstream Management

```bash
# List upstreams
curl http://localhost:8001/upstreams | jq

# Show upstream targets
curl http://localhost:8001/upstreams/ogelfy-upstream/targets | jq

# Upstream health
curl http://localhost:8001/upstreams/ogelfy-upstream/health | jq

# Expected: All targets "HEALTHY"
```

### Plugin Management

```bash
# List plugins
curl http://localhost:8001/plugins | jq

# Show specific plugin
curl http://localhost:8001/plugins/{plugin-id} | jq

# Enabled plugins
curl http://localhost:8001/plugins/enabled | jq
```

---

## 🐛 Debugging Commands

### Check Kong Configuration

```bash
# Validate kong.conf
docker run --rm -v $(pwd):/kong kong:3.4-alpine kong check /kong/kong.conf

# View effective configuration
curl http://localhost:8001/config | jq
```

### Check Ogelfy Directly (Local)

```bash
# Ogelfy instances are not exposed directly in Docker Compose
# Access via Kong proxy only

# Check via Kong
curl http://localhost:8000/health
```

### Check Ogelfy Directly (Railway)

```bash
# Get Ogelfy URL
OGELFY_1_URL=$(railway service ogelfy-1 domain)

# Test directly (bypasses Kong)
curl https://$OGELFY_1_URL/health
```

### View Service Logs

```bash
# Local
docker-compose logs -f kong
docker-compose logs -f ogelfy-1

# Railway
railway service kong logs
railway service ogelfy-1 logs
```

### Check Upstream Health

```bash
# Via Admin API
curl http://localhost:8001/upstreams/ogelfy-upstream/health | jq

# Via helper script
./scripts/kong-admin.sh health

# Expected: All targets showing "HEALTHY"
```

---

## 🧪 Load Testing

### Using wrk (if installed)

```bash
# Install wrk (macOS)
brew install wrk

# Load test (4 threads, 100 connections, 30 seconds)
wrk -t4 -c100 -d30s http://localhost:8000/api/hello

# With custom headers
wrk -t4 -c100 -d30s \
  -H "Authorization: Bearer token" \
  http://localhost:8000/api/hello
```

### Using ab (Apache Bench)

```bash
# 10,000 requests, 100 concurrent
ab -n 10000 -c 100 http://localhost:8000/api/hello

# With keep-alive
ab -n 10000 -c 100 -k http://localhost:8000/api/hello
```

### Using hey (lightweight)

```bash
# Install hey
go install github.com/rakyll/hey@latest

# 10,000 requests, 50 workers
hey -n 10000 -c 50 http://localhost:8000/api/hello
```

---

## 📊 Monitoring Commands

### Railway Metrics

```bash
# Service metrics (CPU, Memory, Network)
railway service kong metrics
railway service ogelfy-1 metrics

# Watch in real-time
watch -n 5 railway service kong metrics
```

### Prometheus Metrics

```bash
# Scrape all metrics
curl http://localhost:8000/metrics

# Filter specific metrics
curl http://localhost:8000/metrics | grep kong_http_requests_total
curl http://localhost:8000/metrics | grep kong_latency_ms
```

### Request Rate

```bash
# Count requests in last minute (from logs)
docker-compose logs kong --since 1m | grep "GET /api" | wc -l

# Railway
railway service kong logs --since 1m | grep "GET /api" | wc -l
```

---

## 🔒 Security Commands

### Restrict Admin API (Production)

Edit `kong.conf`:
```conf
admin_listen = 127.0.0.1:8001
```

### Add API Key Authentication

```bash
# Create consumer
curl -X POST http://localhost:8001/consumers \
  --data "username=client1"

# Create API key
curl -X POST http://localhost:8001/consumers/client1/key-auth \
  --data "key=your-secret-key"

# Test with key
curl http://localhost:8000/api/hello \
  -H "apikey: your-secret-key"
```

### IP Whitelist

Edit `kong.yml`:
```yaml
plugins:
  - name: ip-restriction
    config:
      allow:
        - 10.0.0.0/8
        - 192.168.0.0/16
```

---

## 🎓 Quick Reference

### Start Local Dev
```bash
bun run docker:dev
curl http://localhost:8000/health
```

### Deploy to Railway
```bash
railway login && railway init
bun run deploy:railway
```

### Check Status
```bash
./scripts/kong-admin.sh status
./scripts/kong-admin.sh health
```

### View Logs
```bash
# Local
docker-compose logs -f kong

# Railway
railway service kong logs
```

### Test Endpoints
```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/hello
```

---

## 📖 Documentation

- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)
- **Complete Setup**: [KONG_SETUP.md](./KONG_SETUP.md)
- **Railway Guide**: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)
- **Scripts**: [scripts/README.md](./scripts/README.md)
