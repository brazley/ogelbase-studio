# Ogel Cloud MVP - Quick Start Implementation Guide

**Date**: November 21, 2025
**Audience**: Developers ready to build
**Time to MVP**: 8 weeks (1 engineer full-time)

---

## TL;DR - What You're Building

A multi-database platform on Railway that:
- Supports **5 database types** (Postgres, Neon, Convex, Redis, MongoDB)
- Uses **O7s proxy** for routing, throttling, and usage attribution
- Achieves **90%+ gross margins** through usage-based billing
- Deploys in **30 minutes** via Railway template
- Scales from **10 → 10,000 tenants** with Railway auto-scaling

**Cost to run**: ~$80/month for 100 tenants, ~$250/month for 1,000 tenants

---

## Phase 1: Foundation (Weeks 1-2) - CRITICAL PATH

### Goal: Single-database working (Postgres + O7s)

### Week 1: Railway Setup + O7s Skeleton

**Day 1-2: Railway Infrastructure**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Create project
railway login
railway init ogel-cloud-mvp
cd ogel-cloud-mvp

# Deploy core databases
railway add --service postgres
railway add --service redis
railway add --service mongodb

# Configure environment variables
railway variables set DATABASE_URL=<postgres-url>
railway variables set REDIS_URL=<redis-url>
railway variables set MONGODB_URL=<mongodb-url>
```

**Day 3-5: O7s Proxy (Node.js/TypeScript)**

Create `apps/o7s-proxy/`:
```typescript
// apps/o7s-proxy/src/index.ts
import { createServer } from 'net';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';

const redis = new Redis(process.env.REDIS_URL);
const mongo = new MongoClient(process.env.MONGODB_URL);
const platformDb = new Pool({ connectionString: process.env.DATABASE_URL });

// Layer 1-4: Auth, Tier Check, Connection Gate, Rate Limit
class O7sProxy {
  async handleConnection(socket: Socket) {
    // Extract org_id from connection string
    const orgId = this.extractOrgId(socket);

    // Check tier (Redis cache)
    const tier = await redis.get(`tier:${orgId}`) || 'free';

    // Connection gatekeeper
    const activeConns = await redis.incr(`connections:${orgId}`);
    if (activeConns > this.getMaxConnections(tier)) {
      await redis.decr(`connections:${orgId}`);
      socket.end('ERROR: Connection limit exceeded\n');
      return;
    }

    // Rate limiter (per query)
    socket.on('data', async (data) => {
      const allowed = await this.checkRateLimit(orgId, tier);
      if (!allowed) {
        socket.write('ERROR: Rate limit exceeded\n');
        return;
      }

      // Route to Postgres (Layer 5-7)
      const result = await platformDb.query(data.toString());
      socket.write(result);

      // Track usage (Layer 6)
      await this.trackUsage(orgId, data);
    });
  }
}

createServer((socket) => new O7sProxy().handleConnection(socket)).listen(5432);
```

**Deploy**:
```bash
railway up --service ogel-o7s-proxy
```

**Test**:
```bash
# Connect via O7s proxy
psql postgresql://test_org@ogel-o7s-proxy.railway.internal:5432/database
```

### Week 2: Usage Tracking + Studio UI

**Day 6-8: Usage Attribution (MongoDB writes)**

```typescript
// apps/o7s-proxy/src/usage-tracker.ts
class UsageTracker {
  private batcher = new BatchWriter(mongo, 'usageHistory', 10000); // 10s batch

  async trackUsage(orgId: string, query: any) {
    const duration = Date.now() - query.startTime;
    const vcpuHours = this.estimateVCpuHours(duration, query.complexity);
    const memoryGBHours = this.estimateMemoryGBHours(duration, query.workMem);

    await this.batcher.add({
      orgId,
      timestamp: new Date(),
      vcpuHours,
      memoryGBHours,
      queryDuration: duration
    });
  }

  estimateVCpuHours(duration: number, complexity: number): number {
    return (duration / 1000) * complexity * 0.1 / 3600;
  }
}
```

**Day 9-10: Deploy Studio UI (already exists - integrate O7s)**

```bash
# Studio UI already built from previous work
# Just need to point it to O7s proxy instead of direct Postgres

# Update Studio environment
railway variables set DATABASE_URL=postgresql://ogel-o7s-proxy.railway.internal:5432/platform --service studio

# Deploy
railway up --service studio
```

**Success Criteria**:
- ✅ Can connect to Postgres via O7s proxy
- ✅ Connection limits enforced (reject at 5/10/50 based on tier)
- ✅ Rate limits enforced (throttle at 10/50/200 QPS)
- ✅ Usage metrics written to MongoDB
- ✅ Studio UI works (shows orgs, databases)

**Cost**: ~$5-10/month (Hobby plan)

---

## Phase 2: Multi-Database (Weeks 3-4)

### Goal: Add Neon, Convex, MongoDB, full database routing

### Week 3: Neon Integration

**Day 11-13: Deploy Neon Pageserver**

```bash
# Add Neon service
railway add --service neon

# Configure Neon
# Use neondatabase/neon Docker image
# Mount volume for storage
```

```yaml
# railway.toml for Neon service
[build]
builder = "DOCKERFILE"

[deploy]
startCommand = "neon_local start"
healthcheckPath = "/health"

[[services]]
name = "ogel-neon"
image = "neondatabase/neon:latest"

[[services.volumes]]
mountPath = "/data"
name = "neon-pageserver-data"
```

**Day 14-15: Neon Branch Provisioning**

```typescript
// apps/o7s-proxy/src/neon-provisioner.ts
import { NeonClient } from '@neondatabase/api-client';

class NeonProvisioner {
  private neon = new NeonClient({ apiKey: process.env.NEON_API_KEY });

  async createTenantDatabase(orgId: string) {
    // Create Neon branch for this organization
    const branch = await this.neon.createBranch({
      project_id: process.env.NEON_PROJECT_ID,
      name: `org-${orgId}`,
      parent_id: 'main' // Branch from main
    });

    // Store connection string in platform DB
    await platformDb.query(`
      INSERT INTO platform.database_credentials (org_id, database_type, connection_string)
      VALUES ($1, 'neon', $2)
    `, [orgId, branch.connection_uri]);

    return branch;
  }
}
```

### Week 4: Convex + MongoDB + Routing

**Day 16-17: Convex Deployment**

```bash
# Convex is external service (managed)
# Sign up at convex.dev, create deployment
# Get deployment URL

# Add to environment
railway variables set CONVEX_DEPLOYMENT_URL=<convex-url>
```

**Day 18-19: MongoDB for Tenant Data**

```bash
# Already have MongoDB for usage tracking
# Now add multi-tenant collections

# Create indexes
db.tenantData.createIndex({ orgId: 1 })
db.tenantDocuments.createIndex({ orgId: 1, docId: 1 })
```

**Day 20-21: Database Router (O7s Layer 5)**

```typescript
// apps/o7s-proxy/src/database-router.ts
class DatabaseRouter {
  async routeQuery(orgId: string, query: any) {
    // Get database type preference for this query
    const dbType = this.determineDatabase(query);

    switch (dbType) {
      case 'neon':
        const neonConn = await this.getNeonConnection(orgId);
        return await neonConn.query(query);

      case 'convex':
        const convex = new ConvexClient(process.env.CONVEX_URL);
        return await convex.query(query);

      case 'redis':
        return await redis.get(query.key);

      case 'mongodb':
        return await mongo.db().collection(query.collection).find(query.filter);

      default:
        // Default to Postgres
        return await platformDb.query(query);
    }
  }

  determineDatabase(query: any): string {
    // Route based on query type, table name, or explicit hint
    if (query.includes('SELECT') && query.includes('FROM users')) {
      return 'neon'; // Tenant data → Neon
    }
    if (query.collection) {
      return 'mongodb'; // Document queries → MongoDB
    }
    if (query.key) {
      return 'redis'; // Key-value → Redis
    }
    return 'postgres'; // Control plane → Postgres
  }
}
```

**Success Criteria**:
- ✅ Neon branches created per tenant
- ✅ Convex deployment integrated
- ✅ MongoDB multi-tenant collections working
- ✅ O7s routes queries to correct database
- ✅ Studio UI shows all database types

**Cost**: ~$60-80/month (Hobby plan + small overage)

---

## Phase 3: Production Hardening (Weeks 5-6)

### Week 5: Monitoring + Load Testing

**Day 22-24: Monitoring (Grafana + Prometheus)**

```bash
# Add monitoring services
railway add --service grafana
railway add --service prometheus

# Configure Prometheus scraping
# apps/o7s-proxy/src/metrics.ts
import { Registry, Counter, Histogram } from 'prom-client';

const requestCounter = new Counter({
  name: 'o7s_requests_total',
  help: 'Total requests by tier',
  labelNames: ['tier', 'database_type']
});

const latencyHistogram = new Histogram({
  name: 'o7s_latency_seconds',
  help: 'Request latency',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1]
});
```

**Day 25-26: Load Testing**

```typescript
// test/load-test.ts
import autocannon from 'autocannon';

const result = await autocannon({
  url: 'postgresql://ogel-o7s-proxy.railway.internal:5432',
  connections: 1000,
  duration: 60,
  workers: 4
});

// Target: P95 latency <15ms
```

### Week 6: Billing + Documentation

**Day 27-28: Stripe Integration**

```typescript
// apps/billing/src/index.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createMonthlyInvoices() {
  const orgs = await platformDb.query('SELECT id, tier FROM platform.organizations');

  for (const org of orgs.rows) {
    const usage = await mongo.db().collection('usageHistory').aggregate([
      { $match: { orgId: org.id, period: getCurrentMonth() } },
      { $group: { _id: null, totalVCpuHours: { $sum: '$vcpuHours' } } }
    ]).toArray();

    const tier = TIERS[org.tier];
    const overage = Math.max(0, usage.totalVCpuHours - tier.includedVCpuHours);
    const overageCost = overage * tier.overageVCpuRate;

    await stripe.invoiceItems.create({
      customer: org.stripe_customer_id,
      amount: Math.round((tier.baseFee + overageCost) * 100),
      currency: 'usd',
      description: `Ogel Cloud - ${org.tier} tier`
    });
  }
}
```

**Day 29-30: Documentation**

```markdown
# API Documentation
# Deployment Guide
# Customer Onboarding
# Troubleshooting
```

**Success Criteria**:
- ✅ Monitoring dashboards operational
- ✅ Load test passes (1,000 concurrent connections)
- ✅ Billing integration working
- ✅ Documentation complete

**Cost**: ~$100-150/month (upgrade to Developer plan)

---

## Phase 4: Enterprise Features (Weeks 7-8)

### Week 7: Advanced Features

**Day 31-33: Custom Domains**

```typescript
// Allow PRO/ENTERPRISE customers to use custom domains
// customer.example.com → their tenant
await railway.domains.add({
  service: 'ogel-o7s-proxy',
  domain: 'db.customer.example.com'
});
```

**Day 34-35: Advanced Analytics**

```typescript
// Real-time usage dashboard (Convex)
const metrics = await convex.query('getLiveMetrics', { orgId });
// → { connections: 12, qps: 45, cpuUsage: 0.3 }
```

### Week 8: Multi-Region + Compliance

**Day 36-38: Multi-Region Support**

```bash
# Deploy to multiple Railway regions
railway region set us-west-1 --service ogel-neon-west
railway region set eu-west-1 --service ogel-neon-europe

# Route based on tenant location
```

**Day 39-40: Compliance Prep**

```markdown
# SOC2 Checklist
- [ ] Audit logging (already done via MongoDB)
- [ ] Access control (already done via Supabase Auth)
- [ ] Data encryption (Railway TLS + at-rest)
- [ ] Backup/disaster recovery (Railway volumes)
```

**Success Criteria**:
- ✅ Custom domains working
- ✅ Analytics dashboard live
- ✅ Multi-region routing functional
- ✅ Compliance checklist completed

**Cost**: ~$200-300/month (Team plan)

---

## Testing Strategy

### Unit Tests (Jest)

```typescript
// apps/o7s-proxy/test/tier-enforcement.test.ts
describe('Tier Enforcement', () => {
  it('should reject connections over FREE tier limit', async () => {
    // Create 6 connections (FREE limit is 5)
    const conns = await Promise.all(
      Array(6).fill(0).map(() => createConnection('free_org'))
    );

    expect(conns[5]).toBeRejected('Connection limit exceeded');
  });

  it('should throttle QPS over tier limit', async () => {
    const start = Date.now();
    const queries = await Promise.all(
      Array(20).fill(0).map(() => executeQuery('free_org'))
    );
    const duration = Date.now() - start;

    // FREE tier: 10 QPS → 20 queries should take ~2 seconds
    expect(duration).toBeGreaterThan(1900);
  });
});
```

### Integration Tests

```typescript
// test/integration/multi-database.test.ts
describe('Multi-Database Integration', () => {
  it('should route Postgres queries to Neon', async () => {
    const result = await o7sProxy.query('SELECT * FROM users');
    expect(result.source).toBe('neon');
  });

  it('should route real-time queries to Convex', async () => {
    const result = await o7sProxy.query({ type: 'live', table: 'metrics' });
    expect(result.source).toBe('convex');
  });
});
```

### Load Tests

```bash
# 1,000 concurrent connections
autocannon -c 1000 -d 60 postgresql://ogel-o7s-proxy.railway.internal:5432

# Target: P95 latency <15ms
```

---

## Deployment Checklist

### Pre-Launch
- [ ] All Railway services deployed
- [ ] Environment variables configured
- [ ] Private networking verified
- [ ] Custom domains configured
- [ ] SSL certificates issued
- [ ] Health checks passing
- [ ] Monitoring dashboards operational
- [ ] Billing integration tested
- [ ] Documentation complete

### Launch
- [ ] Create first customer account
- [ ] Test signup flow
- [ ] Test database creation (all 5 types)
- [ ] Test tier limits (connection, QPS)
- [ ] Test usage tracking
- [ ] Test billing generation
- [ ] Monitor Railway costs

### Post-Launch
- [ ] Set up alerting (PagerDuty)
- [ ] Monitor error rates
- [ ] Track cost vs revenue
- [ ] Collect customer feedback
- [ ] Iterate on tier limits
- [ ] Optimize pricing

---

## Cost Projections (For Planning)

### MVP (100 tenants)
- Infrastructure: ~$80/month
- Tenant costs: ~$42/month
- **Total cost**: $122/month
- **Revenue** (70 FREE, 20 STARTER, 10 PRO): $700/month
- **Margin**: 82.6%

### Scale (1,000 tenants)
- Infrastructure: ~$250/month
- Tenant costs: ~$418/month
- **Total cost**: $668/month
- **Revenue** (700 FREE, 200 STARTER, 100 PRO): $7,000/month
- **Margin**: 90.5%

### Enterprise (10,000 tenants)
- Infrastructure: ~$800/month (Railway scales efficiently)
- Tenant costs: ~$4,180/month
- **Total cost**: $4,980/month
- **Revenue**: $70,000/month
- **Margin**: 92.9%

**Key Insight**: Margins IMPROVE at scale (infrastructure density)

---

## Common Issues & Solutions

### Issue: O7s proxy high latency
**Cause**: Redis cache miss, MongoDB slow writes
**Solution**:
- Optimize Redis cache TTL (1 hour for tier lookups)
- Batch MongoDB writes (10 second windows)
- Use connection pooling (PgBouncer)

### Issue: Railway resource limits hit
**Cause**: Too many tenants on Hobby plan
**Solution**:
- Monitor Railway usage dashboard
- Upgrade to Developer plan when $5 credit exceeded
- Alert at 80% of plan limit

### Issue: Neon cold start latency
**Cause**: Inactive branches take ~2-5 seconds to wake
**Solution**:
- Predictive pre-warming (wake before expected query)
- Cache frequently accessed data in Redis
- Communicate cold start to users (FREE tier expectation)

---

## Next Steps After MVP

1. **Monitor real usage patterns** (adjust tier limits based on actual data)
2. **Calibrate cost attribution** (compare estimates to Railway bill monthly)
3. **Iterate on pricing** (optimize overage rates for 90% margin target)
4. **Add more databases** (TimescaleDB, Clickhouse, etc.)
5. **Build SaaS apps layer** (Ghost, Plane, Penpot on top of DynaBase)

---

## Resources

**Architecture**:
- Full spec: `.dynabase/OGEL-CLOUD-MVP-ARCHITECTURE.md`
- Executive summary: `.dynabase/00-OGEL-CLOUD-EXECUTIVE-SUMMARY.md`

**Railway**:
- Docs: https://docs.railway.app/
- Pricing: https://railway.com/pricing
- CLI: https://docs.railway.app/develop/cli

**Code Examples**:
- O7s proxy: (see Phase 1 code above)
- Usage tracking: (see Week 2 code above)
- Database router: (see Week 4 code above)

**Support**:
- Railway Discord: https://discord.gg/railway
- Neon Docs: https://neon.tech/docs
- Convex Docs: https://docs.convex.dev/

---

**Ready to build?** Start with Phase 1, Week 1, Day 1. Deploy Railway services and get O7s proxy skeleton running.

**Questions?** Read the architecture docs in `.dynabase/` folder.

**Good luck! 🚀**
