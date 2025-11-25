# Kong + Ogelfy Deployment Scripts

Automation scripts for deploying and managing Kong API Gateway with Ogelfy on Railway.

## Scripts

### `deploy-kong.sh`

**Purpose**: Automated deployment of Kong + Ogelfy to Railway.

**What it does**:
1. Creates Railway services (kong, ogelfy-1, ogelfy-2, ogelfy-3)
2. Deploys Kong with Dockerfile.kong
3. Deploys 3 Ogelfy instances with Dockerfile.ogelfy
4. Configures environment variables and service URLs
5. Tests deployment health

**Usage**:
```bash
./scripts/deploy-kong.sh
```

**Prerequisites**:
- Railway CLI installed (`npm i -g @railway/cli`)
- Logged into Railway (`railway login`)
- Project linked (`railway link`)

**Output**:
```
🚀 Deploying Kong + Ogelfy to Railway
✓ Railway CLI ready
📦 Creating services...
🚢 Deploying Kong...
🚢 Deploying Ogelfy instances...
⏳ Waiting for health checks...
🧪 Testing deployment...
✅ Deployment complete!

Service URLs:
  Kong Gateway: https://kong-production.up.railway.app
  ...
```

**Time**: ~5-10 minutes (first deployment), ~2-3 minutes (redeployment)

---

### `kong-admin.sh`

**Purpose**: Kong administration and debugging helper.

**Commands**:

```bash
# Show Kong status
./scripts/kong-admin.sh status

# List services
./scripts/kong-admin.sh services

# List routes
./scripts/kong-admin.sh routes

# Show upstream targets
./scripts/kong-admin.sh upstreams

# Check upstream health
./scripts/kong-admin.sh health

# List plugins
./scripts/kong-admin.sh plugins

# Show Prometheus metrics
./scripts/kong-admin.sh metrics

# Show Kong configuration
./scripts/kong-admin.sh config

# Test Kong endpoints
./scripts/kong-admin.sh test

# Tail Kong logs
./scripts/kong-admin.sh logs

# Show help
./scripts/kong-admin.sh help
```

**Environment Variables**:
```bash
KONG_ADMIN_URL  # Kong Admin API URL (default: http://localhost:8001)
KONG_PROXY_URL  # Kong Proxy URL (default: http://localhost:8000)
```

**Examples**:

**Local development**:
```bash
# Uses default localhost URLs
./scripts/kong-admin.sh status
```

**Railway production**:
```bash
# Set Railway URLs
export KONG_ADMIN_URL=https://kong.railway.app:8001
export KONG_PROXY_URL=https://kong.railway.app:8000

./scripts/kong-admin.sh health
```

**Remote health check**:
```bash
KONG_ADMIN_URL=https://your-kong-url:8001 ./scripts/kong-admin.sh health
```

---

## Quick Reference

### First-Time Deployment

```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Create/link project
railway init  # or railway link

# 4. Deploy everything
./scripts/deploy-kong.sh

# 5. Verify
./scripts/kong-admin.sh status
./scripts/kong-admin.sh test
```

### Daily Operations

```bash
# Check health
./scripts/kong-admin.sh health

# View logs
railway service kong logs
railway service ogelfy-1 logs

# Test endpoints
curl https://your-kong-url/health
curl https://your-kong-url/api/hello

# View metrics
./scripts/kong-admin.sh metrics
```

### Debugging

```bash
# Kong not responding
./scripts/kong-admin.sh status
railway service kong logs

# Ogelfy instances unhealthy
./scripts/kong-admin.sh health
curl https://ogelfy-1.up.railway.app/health

# Load balancing issues
./scripts/kong-admin.sh upstreams
for i in {1..10}; do
  curl -s https://your-kong-url/api/hello | jq '.replica'
done

# Rate limiting issues
./scripts/kong-admin.sh test
# Check X-RateLimit-* headers
```

---

## Script Requirements

### System Requirements
- **Bash**: 4.0+ (macOS/Linux)
- **curl**: For API requests
- **jq**: For JSON parsing (install: `brew install jq`)
- **Railway CLI**: For Railway operations

### Railway Requirements
- **Railway account**: https://railway.app
- **Railway project**: Created via dashboard or CLI
- **Railway CLI token**: Automatic after `railway login`

---

## Customization

### Modify Deployment Script

**Change number of Ogelfy instances**:

Edit `deploy-kong.sh`:
```bash
# Add ogelfy-4
for i in 1 2 3 4; do  # Change from "1 2 3"
    railway service create "ogelfy-$i"
done
```

Update `kong.yml` to include 4 targets.

**Change region**:
```bash
railway service kong up --region us-west1
```

**Custom service names**:
```bash
railway service create "api-gateway"  # Instead of "kong"
railway service create "ogelfy-primary"  # Instead of "ogelfy-1"
```

### Modify Admin Script

**Add custom command**:

Edit `kong-admin.sh`:
```bash
case "$1" in
    # ... existing commands ...

    custom)
        echo -e "${BLUE}🔧 Custom Command${NC}"
        check_kong
        curl -s "$KONG_ADMIN/your-endpoint" | jq '.'
        ;;
esac
```

**Change default URLs**:
```bash
KONG_ADMIN="${KONG_ADMIN_URL:-https://your-default-url:8001}"
KONG_PROXY="${KONG_PROXY_URL:-https://your-default-url:8000}"
```

---

## Troubleshooting

### "Railway CLI not found"

**Issue**: `railway: command not found`

**Fix**:
```bash
npm i -g @railway/cli
railway --version
```

### "Not logged into Railway"

**Issue**: Scripts fail with authentication error

**Fix**:
```bash
railway login
railway whoami  # Verify
```

### "Kong Admin API not accessible"

**Issue**: `kong-admin.sh` fails to connect

**Fix**:
```bash
# Verify URL
echo $KONG_ADMIN_URL

# Test manually
curl https://your-kong-url:8001/status

# Check Railway service
railway service kong status
railway service kong logs
```

### "jq: command not found"

**Issue**: JSON parsing fails

**Fix**:
```bash
# macOS
brew install jq

# Linux (Debian/Ubuntu)
sudo apt install jq

# Linux (RHEL/CentOS)
sudo yum install jq
```

### Scripts don't execute

**Issue**: Permission denied

**Fix**:
```bash
chmod +x scripts/deploy-kong.sh
chmod +x scripts/kong-admin.sh
```

---

## Best Practices

### Before Running Scripts

1. **Read the script**: Understand what it does
2. **Test locally**: Run `docker-compose up` first
3. **Backup config**: Save current `kong.yml`
4. **Check Railway**: Verify project status

### During Deployment

1. **Monitor logs**: Watch `railway logs` during deployment
2. **Test incrementally**: Verify each service after deployment
3. **Keep terminal open**: Don't close until "Deployment complete"
4. **Save URLs**: Note Kong and Ogelfy URLs for later

### After Deployment

1. **Verify health**: Run `kong-admin.sh test`
2. **Check metrics**: Ensure `/metrics` is accessible
3. **Test load balancing**: Send multiple requests, verify rotation
4. **Document URLs**: Save Kong URL to password manager/docs

---

## Additional Resources

- **Kong Admin API**: https://docs.konghq.com/gateway/latest/admin-api/
- **Railway CLI**: https://docs.railway.app/develop/cli
- **Kong Deployment**: See [RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md)
- **Kong Setup**: See [KONG_SETUP.md](../KONG_SETUP.md)

---

## Support

**Questions or issues?**

1. Check documentation: [KONG_SETUP.md](../KONG_SETUP.md)
2. Check Railway docs: https://docs.railway.app
3. Kong community: https://discuss.konghq.com
4. Railway Discord: https://discord.gg/railway
