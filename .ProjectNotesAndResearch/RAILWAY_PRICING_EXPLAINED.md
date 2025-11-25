# Railway Pricing Breakdown - What You're Actually Paying For

**Date**: 2025-11-22
**Question**: Why does memory usage show so high? Is it historical or current?

---

## Railway's Pricing Model

Railway charges based on **resource-hours**, not just allocated resources.

### What "Memory Usage" Means

**It means BOTH**:
1. **Current allocation** - How much RAM your services are using RIGHT NOW
2. **Historical usage** - Accumulated over the billing period

**Formula**: `Cost = (RAM GB × Hours Running) + (CPU × Hours) + (Egress GB)`

---

## Example Breakdown

### If Your Dashboard Shows "10GB Memory Used":

**This could mean**:

**Scenario A** - High current usage:
- 10 services × 1GB each = 10GB currently allocated
- Running for 720 hours (30 days) = 7,200 GB-hours
- Cost: 7,200 GB-hours × $0.000231/GB-hour = **$1.66/month** just for RAM

**Scenario B** - Historical accumulation:
- Services used 10GB-hours total so far this billing cycle
- Could be: 1GB service running for 10 hours
- Or: 10GB service running for 1 hour
- Cost: 10 GB-hours × $0.000231/GB-hour = **$0.002** (almost nothing)

---

## Railway Pricing (As of 2024)

### Compute Pricing

```
RAM:     $0.000231 per GB-hour ($0.167/GB/month if running 24/7)
CPU:     $0.000463 per vCPU-hour ($0.334/vCPU/month if running 24/7)
Disk:    $0.000231 per GB-hour ($0.167/GB/month)
Egress:  $0.10 per GB (external data transfer)
```

### What This Means

**1GB RAM running 24/7 for a month**:
- 1 GB × 720 hours = 720 GB-hours
- 720 × $0.000231 = **$0.166/month** (~$0.17)

**1 vCPU running 24/7 for a month**:
- 1 vCPU × 720 hours = 720 vCPU-hours
- 720 × $0.000463 = **$0.333/month** (~$0.33)

---

## Your Services - Estimated Costs

Based on typical Railway service allocations:

### Application Services

```
Studio (Next.js):
- RAM: 512MB (0.5GB)
- CPU: 1 vCPU
- Cost: (0.5 × $0.167) + (1 × $0.334) = $0.417/month
- If idle most of time: Much less (scales to zero)

Kong:
- RAM: 512MB
- CPU: 0.5 vCPU
- Cost: ~$0.25/month

Server (Bun):
- RAM: 256MB
- CPU: 0.5 vCPU
- Cost: ~$0.20/month

Each service is pretty cheap!
```

### Database Services

```
PostgreSQL:
- RAM: 512MB
- CPU: 0.5 vCPU
- Disk: 1GB
- Cost: (0.5 × $0.167) + (0.5 × $0.334) + (1 × $0.167)
      = $0.084 + $0.167 + $0.167
      = $0.418/month
- Railway charges: ~$5/month (includes backup, HA)

Redis:
- RAM: 512MB
- CPU: 0.25 vCPU
- Cost: ~$0.15/month
- Railway charges: ~$5/month (includes persistence, backup)

MariaDB:
- RAM: 512MB
- CPU: 0.5 vCPU
- Cost: ~$0.42/month
- Railway charges: ~$5/month
```

**Why the difference?**
- Railway bundles: Backups, monitoring, automatic scaling
- Database tier pricing includes buffer for spikes
- Simplified billing (no nickel-and-diming)

---

## What You're Seeing in Dashboard

### "Memory Usage: X GB"

**Two possible displays**:

**Option 1 - Current Allocation** (Real-time):
```
Service A: 512MB
Service B: 1GB
Service C: 256MB
Service D: 2GB
─────────────────
Total:     3.75GB currently allocated
```

**Option 2 - Accumulated Usage** (Billing period):
```
Service A: 360 GB-hours (512MB × 720 hours)
Service B: 720 GB-hours (1GB × 720 hours)
Service C: 180 GB-hours (256MB × 720 hours)
Service D: 1440 GB-hours (2GB × 720 hours)
─────────────────────────────
Total:     2,700 GB-hours = ~3.75GB average

Cost: 2,700 × $0.000231 = $0.62 for RAM
```

---

## How to Check What You're Actually Using

### Via Railway Dashboard

1. Go to **project settings** → **Usage**
2. Look for breakdown:
   - **Current**: Shows real-time allocation
   - **This month**: Shows accumulated resource-hours
   - **Estimated cost**: Projects end-of-month bill

### What to Look For

**Current allocation**:
```
Studio:    512MB RAM, 1 vCPU
Postgres:  512MB RAM, 0.5 vCPU
Redis:     512MB RAM, 0.25 vCPU
Kong:      512MB RAM, 0.5 vCPU
...

Total:     ~3GB RAM allocated right now
```

**Accumulated this month**:
```
Total compute:  2,000 GB-hours
Total CPU:      1,500 vCPU-hours
Total egress:   50 GB

Estimated:      $35-45 this month
```

---

## Why Your Bill Might Be High

### 1. Too Many Services Running

**If you have 12 services running 24/7**:
```
12 services × 512MB average × 720 hours = 4,320 GB-hours
4,320 × $0.000231 = $1.00 for RAM alone

But Railway charges per-service minimums:
12 services × $5 average = $60/month
```

**Solution**: Consolidate services, remove unused ones

### 2. High Memory Allocation

**If services are allocated more than they need**:
```
Service using 100MB but allocated 2GB:
2GB × 720 hours = 1,440 GB-hours wasted
Wasted cost: $0.33/month per service
```

**Solution**: Right-size service memory

### 3. Egress Fees

**If using public URLs for internal communication**:
```
Internal API calls via public URLs:
2GB/day × 30 days = 60GB egress
60GB × $0.10 = $6/month wasted
```

**Solution**: Use internal URLs (you just fixed this!)

### 4. Idle Services

**Services that could scale to zero but don't**:
```
Service used 1 hour/day but runs 24/7:
512MB × 720 hours = 360 GB-hours
vs
512MB × 30 hours = 15 GB-hours

Wasted: $0.08/month per idle service
```

**Solution**: Enable autoscaling/scale-to-zero

---

## Expected Costs for Your Stack

### Minimal (Optimized)

```
Studio:       $10-15/month (includes compute + DB)
PostgreSQL:   $5/month
Redis:        $5/month
MariaDB:      $5/month
MongoDB:      $5/month (maybe remove)
────────────────────────
Total:        $30-35/month
```

### Current (With Extra Services)

```
All services: $50-70/month
- Extra services: Kong, Postgres-meta, Auth, etc.
- Each adds: $5-10/month
```

### After Cleanup

```
Remove unused services:
- Redis replica: -$5/month
- MongoDB (if unused): -$5/month
- Extra Kong routing: -$5/month (if can consolidate)

Target: $30-35/month
```

---

## How to Reduce Costs

### 1. Check Service List
```bash
# See all running services
railway status

# Check each service's resources
railway info --service <name>
```

### 2. Identify Unused Services

**Questions to ask**:
- Is this service actually being called?
- Could this run on the same service as another?
- Is this service idle most of the time?

### 3. Right-Size Memory

**Check actual usage**:
- Railway dashboard → Service → Metrics
- Look at actual RAM used vs allocated
- Reduce allocation if consistently under 50%

### 4. Consolidate Services

**Instead of**:
```
Service A: 256MB
Service B: 256MB
Service C: 256MB
────────────────
Total: 768MB = 3 services = $15/month
```

**Do this**:
```
Combined Service: 512MB
────────────────
Total: 512MB = 1 service = $5/month
```

---

## Your Specific Situation

Based on the audit, you have **12+ services** running:

### Application Services (7):
1. studio
2. server (Bun)
3. kong
4. supabase-auth
5. postgres-meta
6. minio
7. site

### Database Services (5):
8. postgres-primary
9. redis-primary
10. redis-replica-1
11. mongodb
12. MariaDB

**At $5-10/month each = $60-120/month**

---

## Recommendation

### Check Your Dashboard For:

1. **Current Memory** - How much RAM is allocated RIGHT NOW
   - Should be: ~3-5GB total for your stack
   - If more: You have too many services or oversized allocations

2. **Monthly Usage** - Accumulated GB-hours this billing cycle
   - Shows: Total compute used since start of month
   - Projects: What your bill will be at month-end

3. **Cost Estimate** - Projected end-of-month bill
   - Should be: $30-50/month for your stack
   - If $70+: Time to clean up services

---

## Quick Commands to Check

```bash
# See current service and resource allocation
railway status

# Link to a specific service to see its metrics
railway service <service-name>

# Check variables (shows service config)
railway variables --service <name>
```

**Or just**:
- Go to Railway dashboard
- Click project → Usage tab
- See breakdown of costs

---

## Bottom Line

**"Memory Usage" in Railway means**:
- **Current view**: How much RAM your services are using right now
- **Billing view**: Accumulated GB-hours for the month (what you'll pay)

**If your bill is high**:
1. Too many services running (12+ services = $60-120/month)
2. Services allocated more RAM than they need
3. Egress fees from public URLs (you fixed this!)
4. Idle services that should scale to zero

**Target cost**: $30-40/month for your full stack

---

**Next Step**: Go to Railway dashboard → Usage tab and share what it shows for:
- Current total memory allocation
- This month's accumulated usage
- Estimated cost

Then we can see exactly what's consuming resources.
