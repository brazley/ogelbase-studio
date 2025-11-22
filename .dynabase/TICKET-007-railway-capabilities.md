# TICKET-007: Railway Deployment Constraints & Capabilities Analysis

**Date:** 2025-11-21
**Analyst:** Tomás Andrade
**Objective:** Assess Railway's technical capabilities for DLS (Dynamic Locality Scheduler) with connection-level resource throttling

---

## Executive Summary

**VERDICT: Railway is architecturally incompatible with DLS requirements.**

Railway is a Platform-as-a-Service (PaaS) abstraction layer designed for zero-config deployments. DLS requires low-level system access (cgroups, eBPF, privileged containers) that Railway fundamentally does not and cannot provide.

**Recommendation:** DLS requires bare-metal Kubernetes or VM-based infrastructure. Railway is excellent for OgelBase (standard Postgres deployment) but wrong platform for DLS.

---

## Technical Assessment

### 1. Container Privilege Levels

**Status:** ❌ **CRITICAL BLOCKER**

**Railway Container Architecture:**
- Railway runs containers in **unprivileged mode** (standard Docker security)
- No `--privileged` flag access
- No custom Linux capabilities beyond Docker defaults
- No access to host kernel interfaces

**DLS Requirements (NOT AVAILABLE ON RAILWAY):**
```bash
# ❌ Cannot access cgroups for CPU/memory throttling
/sys/fs/cgroup/cpu.max
/sys/fs/cgroup/memory.max

# ❌ Cannot use eBPF for connection-level monitoring
bpf() syscalls require CAP_BPF or CAP_SYS_ADMIN

# ❌ Cannot manipulate process limits dynamically
setrlimit() for connection throttling requires elevated privileges
```

**Test Results:**
Railway's `railway run` command executes in **local environment**, not Railway containers. There is no shell access to running Railway containers for capability testing.

**What Railway Actually Provides:**
- Standard Docker container (unprivileged)
- Read-only filesystem (except mounted volumes)
- No kernel module loading
- No access to /sys or /proc for system manipulation

**Capabilities Available (Docker default set):**
```
CAP_CHOWN, CAP_DAC_OVERRIDE, CAP_FOWNER, CAP_FSETID,
CAP_KILL, CAP_SETGID, CAP_SETUID, CAP_SETPCAP,
CAP_NET_BIND_SERVICE, CAP_NET_RAW, CAP_SYS_CHROOT,
CAP_MKNOD, CAP_AUDIT_WRITE, CAP_SETFCAP
```

**Capabilities NOT Available (required for DLS):**
```
CAP_SYS_ADMIN  - needed for cgroup manipulation
CAP_BPF        - needed for eBPF programs
CAP_SYS_RESOURCE - needed for setrlimit() overrides
CAP_NET_ADMIN  - needed for traffic shaping
```

**Conclusion:** Railway cannot run DLS as designed. The platform explicitly prevents the kernel-level access DLS requires.

---

### 2. Volume Performance Under Multi-Tenant Load

**Status:** ⚠️ **PERFORMANCE CONSTRAINTS**

**Railway Volume Architecture:**
- **Type:** Network-attached block storage (similar to AWS EBS)
- **Performance:** Shared infrastructure, no guaranteed IOPS
- **Limits:** Volume size affects performance (larger = better IOPS)
- **Pricing:** $0.25/GB/month (significantly more expensive than object storage)

**OgelBase Reference Data:**
```
Current OgelBase deployment: FULL SUPABASE STACK ON RAILWAY

Project: OgelBase (e0b212f2-b913-4ea6-8b0d-6f54a081db5f)
Environment: production

Services Running:
1. Postgres (primary database)
   - Volume: postgres-volume (9f77c275-cb00-4545-8b92-d55ab33ad82e)
   - Mount: /var/lib/postgresql/data
   - Public URL: maglev.proxy.rlwy.net:20105
   - Private URL: postgres.railway.internal:5432

2. Supabase Auth
   - URL: supabase-auth-production-aa86.up.railway.app

3. Studio (Supabase Dashboard)
   - URL: studio-production-cfcd.up.railway.app

4. Server (Supabase API)
   - URL: server-production-fdb5.up.railway.app

5. Kong (API Gateway)
   - URL: kong-production-80c6.up.railway.app

6. Postgres Meta (DB Management)
   - URL: postgres-meta-production-6c48.up.railway.app

7. MinIO (S3-compatible storage)
   - URL: minio-production-f65d.up.railway.app

8. Site (Landing page)
   - URL: site-production-eb00.up.railway.app

This is a production Supabase deployment, demonstrating Railway can handle
multi-service architectures with private networking and service discovery.
```

**Multi-Tenant Performance Concerns:**

1. **IOPS Limitations:**
   - Railway doesn't publish IOPS guarantees
   - Network-attached storage adds latency (vs local NVMe)
   - Shared infrastructure means noisy neighbor problems
   - No way to provision dedicated IOPS (unlike AWS Provisioned IOPS)

2. **Realistic Multi-Tenant Scenario:**
   ```
   DynaBase Free Tier (100 tenants on one Postgres instance):
   - 100 concurrent connections
   - Each tenant: 10 connections × 100ms avg query time
   - Volume operations: ~1000 IOPS for read-heavy workload
   - WAL writes: ~200-500 IOPS for write workload
   ```

   **Expected Railway Performance:**
   - Baseline IOPS: 100-3000 (depends on volume size)
   - Latency: 5-20ms (vs <1ms for local NVMe)
   - Burst capacity: Unknown (Railway doesn't document)

3. **Comparison to DLS Requirements:**
   - DLS needs predictable, isolated I/O per tenant
   - Railway volumes are shared, best-effort
   - No IO controller support (requires cgroups blkio)

**Benchmark Methodology (Cannot Run on Railway):**
Railway does not provide shell access to running containers, so traditional benchmarks (fio, sysbench) are impossible.

**Cost Analysis:**
```
OgelBase Postgres with 100GB volume:
- Volume storage: $25/month
- Compute (2 vCPU, 4GB RAM): ~$20/month
- Total: ~$45/month

DynaBase Requirement (multi-tenant Postgres):
- 500GB volume for 1000 tenants: $125/month
- Compute (8 vCPU, 16GB RAM): ~$100/month
- Total: ~$225/month per Postgres instance

For 10 DynaBase instances: $2,250/month just for storage layer
```

**Conclusion:** Railway volumes work for OgelBase but don't support DLS's need for guaranteed, isolated I/O per tenant.

---

### 3. Railway Service Mesh for Inter-Service Communication

**Status:** ✅ **WORKS FOR STANDARD USE CASES**

**Railway Networking Features:**

1. **Private Networking:**
   - All services in a Railway project can communicate via private network
   - Internal DNS: `servicename.railway.internal` (auto-configured)
   - No need for service discovery setup

2. **Service Variables:**
   Railway auto-generates connection URLs:
   ```
   POSTGRES_URL=postgresql://user:pass@postgres.railway.internal:5432/db
   REDIS_URL=redis://redis.railway.internal:6379
   ```

3. **Public Networking:**
   - Railway generates public URLs: `https://<project>-production.up.railway.app`
   - Custom domains supported (free SSL via Let's Encrypt)
   - No ingress controller configuration required

**What Railway Does NOT Provide:**
- ❌ Service mesh features (Istio, Linkerd) - no sidecar proxies
- ❌ Traffic shaping or rate limiting at network layer
- ❌ Circuit breakers or advanced retry logic
- ❌ Distributed tracing (must integrate APM yourself)
- ❌ mTLS between services (optional, must configure manually)

**DLS Requirements:**
DLS needs dynamic service communication for:
- Tenant request routing to specific Postgres instances
- Connection pooling across multiple PgBouncer instances
- Health checks and automatic failover

Railway's basic service discovery works, but DLS would need to implement:
- Custom load balancing logic (Railway has no ingress controller customization)
- Connection pool management (Railway doesn't support PgBouncer as managed service)
- Dynamic routing based on tenant ID (requires application-level logic)

**Conclusion:** Railway's networking is sufficient for basic microservices but lacks advanced service mesh features DLS would benefit from.

---

### 4. Railway Pricing Model vs DynaBase Tier Economics

**Status:** ⚠️ **COST INEFFICIENT AT SCALE**

**Railway Pricing Model (November 2024):**

**Compute (vCPU + Memory):**
- **Pay-per-second** for actual resource usage
- Pricing: ~$0.000008/vCPU-second (~$20/vCPU-month)
- Memory: Included with vCPU allocation
- Minimum: 0.1 vCPU, 128MB RAM
- Maximum: 32 vCPU, 128GB RAM per service

**Storage (Volumes):**
- **$0.25/GB/month** for persistent volumes
- No snapshots or backups included
- No IOPS guarantees

**Network:**
- Egress: Included in most plans
- Ingress: Free
- No bandwidth limits on Pro plan

**Example Costs:**

**OgelBase (Current Deployment):**
```
PostgreSQL Instance:
- Compute: 2 vCPU, 4GB RAM = ~$40/month
- Volume: 50GB = $12.50/month
Total: ~$52.50/month
```

**DynaBase Free Tier (100 tenants per Postgres):**
```
Per Postgres Instance:
- Compute: 4 vCPU, 8GB RAM = ~$80/month
- Volume: 200GB = $50/month
- Subtotal: $130/month

Supporting Services:
- PgBouncer: 1 vCPU, 1GB RAM = ~$20/month
- Monitoring: 1 vCPU, 2GB RAM = ~$20/month

Total per DynaBase Instance: ~$170/month

For 10 instances (1000 free tier users):
$1,700/month on Railway
```

**DynaBase Standard Tier ($20/month, 10 tenants per user):**
```
Revenue: $20/month per user
Cost per user on Railway:
- Compute allocation: 0.04 vCPU = $0.80/month
- Storage allocation: 2GB = $0.50/month
Total cost: $1.30/month

Margin: $20 - $1.30 = $18.70/month (93.5% margin)
```

**DynaBase Premium Tier ($99/month, dedicated instance):**
```
Revenue: $99/month
Cost per dedicated Postgres on Railway:
- Compute: 2 vCPU, 4GB RAM = ~$40/month
- Volume: 50GB = $12.50/month
Total cost: $52.50/month

Margin: $99 - $52.50 = $46.50/month (47% margin)
```

**Cost Comparison: Railway vs Kubernetes on DigitalOcean:**

**Railway (managed):**
```
10 Postgres instances: $1,700/month
PgBouncer/Monitoring: $400/month
Total: $2,100/month
```

**DigitalOcean Kubernetes (self-managed):**
```
3-node cluster (8 vCPU, 16GB RAM each): $360/month
Block storage (2TB): $200/month
Load balancers: $24/month
Total: $584/month

Savings: $1,516/month (72% cheaper)
```

**Break-Even Analysis:**
- Below 5 DynaBase instances: Railway is cheaper (no DevOps overhead)
- 5-10 instances: Railway and Kubernetes costs comparable
- Above 10 instances: Kubernetes becomes significantly cheaper

**Conclusion:** Railway works for OgelBase and early DynaBase (1-5 instances). At scale (10+ instances), Railway's pricing makes DynaBase margins unsustainable.

---

### 5. Railway GraphQL API for Dynamic Orchestration

**Status:** ⚠️ **LIMITED TO DEPLOYMENT, NOT RUNTIME ORCHESTRATION**

**Railway API Capabilities:**

**Available via GraphQL API:**
1. **Project Management:**
   - Create/delete projects
   - List services and deployments
   - Manage environment variables

2. **Deployment Control:**
   - Trigger new deployments
   - Restart services
   - Rollback to previous deployments

3. **Metrics & Monitoring:**
   - Service CPU/memory usage
   - Deployment logs
   - Build status

**GraphQL API Endpoint:**
```
https://backboard.railway.app/graphql/v2
```

**Authentication:**
```bash
# Railway API token (from railway.app dashboard)
RAILWAY_API_TOKEN=your_token_here

curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { email } }"}'
```

**Example: Deploy New Service via API:**
```graphql
mutation DeployService {
  serviceCreate(input: {
    projectId: "your-project-id"
    name: "postgres-instance-2"
    source: {
      image: "postgres:16"
    }
  }) {
    id
    name
  }
}
```

**Example: Scale Service Resources:**
```graphql
mutation UpdateService {
  serviceUpdate(id: "service-id", input: {
    config: {
      resources: {
        cpu: 4000  # 4 vCPUs
        memory: 8192  # 8GB RAM
      }
    }
  }) {
    id
  }
}
```

**What Railway API CANNOT Do (Critical for DLS):**

❌ **Dynamic Resource Adjustment During Runtime:**
- Cannot change CPU/memory limits without restarting service
- No live migration between resource tiers
- No per-tenant resource isolation (requires cgroups, not exposed)

❌ **Connection-Level Throttling:**
- No API to limit connections per tenant
- No API to adjust PgBouncer pool sizes dynamically
- No API for traffic shaping or QoS

❌ **Real-Time Tenant Routing:**
- No API to route specific tenant requests to specific instances
- No custom load balancing logic
- No tenant-aware service mesh controls

**API Response Times (Critical for DLS):**
Based on Railway documentation and community reports:
- Service restart: 10-30 seconds
- Environment variable update: 5-10 seconds (triggers redeploy)
- New service creation: 1-3 minutes
- Volume provisioning: 30-60 seconds

**DLS Requirement:** Sub-second tenant routing and resource adjustments.
**Railway Reality:** Multi-second deployment changes only.

**Conclusion:** Railway's API is designed for deployment automation, not runtime orchestration. DLS needs real-time tenant management that Railway doesn't support.

---

## Alternative Architectures: What Railway CAN Support

While Railway cannot run DLS as designed, here's what it CAN do well:

### ✅ **OgelBase (Standard Postgres Deployment)**
**Current deployment works perfectly:**
- Zero-config Postgres deployment
- Automatic backups via Railway volumes
- Private networking for application access
- Cost: ~$50/month for small instance

**Why it works:**
- No low-level system access required
- Standard Docker container is sufficient
- Railway's abstractions reduce DevOps overhead

### ✅ **DynaBase API Layer (Stateless Services)**
**What Railway handles well:**
- Node.js/Python/Go API servers (zero-config deployment)
- Connection to external managed Postgres (Supabase, Neon, AWS RDS)
- Redis caching layer for session management
- Background workers for tenant provisioning

**Architecture:**
```
[Railway]                      [External Managed Services]
- API Gateway                  - Supabase (Postgres)
- Auth Service                 - Neon (Tenant DBs)
- Tenant Provisioning Worker   - AWS RDS (Premium tier)
- Redis Cache
```

**Why this works:**
- Railway handles stateless application logic
- Managed database services handle multi-tenancy
- No need for low-level resource throttling

**Cost:**
- Railway API/Workers: ~$100/month
- Managed databases: $500-2000/month (depending on tier)
- Total: ~$600-2100/month

**Tradeoff:** Higher database costs, but zero DevOps overhead.

---

## Final Recommendations

### ❌ **Do NOT Use Railway For:**
1. **DLS (Dynamic Locality Scheduler)**
   - Requires cgroups, eBPF, privileged containers
   - Railway cannot provide kernel-level access

2. **Multi-Tenant Postgres at Scale (10+ instances)**
   - Costs exceed $2,000/month
   - Kubernetes on DigitalOcean is 72% cheaper

3. **High-Performance I/O Workloads**
   - Railway volumes are network-attached (5-20ms latency)
   - No IOPS guarantees or dedicated storage

### ✅ **Use Railway For:**
1. **OgelBase (Current Setup)**
   - Standard Postgres deployment
   - Low DevOps overhead
   - Cost-effective for small scale

2. **DynaBase API Layer (Stateless Services)**
   - Zero-config Node.js/Python/Go APIs
   - Redis caching
   - Background workers
   - Connect to external managed databases

3. **Development/Staging Environments**
   - Fast iteration with zero-config deployments
   - Preview deployments for PRs
   - Cost-effective for non-production workloads

---

## Next Steps

**For DLS Development:**
1. **Abandon Railway for DLS** - platform constraints are fundamental, not workarounds
2. **Choose Infrastructure:**
   - **Bare-metal Kubernetes (DigitalOcean, Hetzner):** Full control, 72% cheaper at scale
   - **Managed Kubernetes (GKE, EKS, AKS):** Less DevOps, more expensive
   - **VMs with custom orchestration:** Maximum control, maximum complexity

**For DynaBase Architecture:**
1. **Stateless services on Railway** (API, workers, cache)
2. **Managed Postgres externally** (Supabase, Neon, AWS RDS)
3. **Custom DLS on Kubernetes** (when scale demands it)

**Cost-Benefit Decision Tree:**
```
Tenants < 100:
  → Use Railway + Supabase (zero DevOps)
  → Cost: ~$200/month

Tenants 100-1000:
  → Use Railway API + Neon/Supabase
  → Cost: ~$1,000/month

Tenants > 1000:
  → Migrate to Kubernetes + DLS
  → Cost: ~$600/month (infra) + DevOps salary
```

---

## Appendix: Railway Platform Documentation

**Official Resources:**
- Railway Docs: https://docs.railway.app
- GraphQL API Reference: https://railway.com/graphiql
- Pricing: https://railway.app/pricing
- Community: https://discord.gg/railway

**Railway Limits (as of November 2024):**
- Max vCPU per service: 32
- Max memory per service: 128GB
- Max volume size: 500GB
- Max services per project: Unlimited (but costs add up)
- Execution time limits: None (unlike serverless)

**Railway Best Practices:**
1. Use volumes sparingly (expensive)
2. Right-size resources (pay-per-second pricing)
3. Leverage private networking (free)
4. Use preview deployments for staging
5. Monitor costs in real-time (Railway dashboard)

---

**Assessment Complete:** Railway is not viable for DLS. Proceed with Kubernetes architecture planning.

---

## Appendix A: OgelBase Production Deployment Analysis

**Complete Service Inventory (17 services across production + dev environments):**

**Core Supabase Services:**
1. **Postgres** (4ee9b87c-3a58-40e2-b3a5-a675d29f16a3)
   - Volume: postgres-volume (9f77c275-cb00-4545-8b92-d55ab33ad82e)
   - Mount: /var/lib/postgresql/data
   - Public: maglev.proxy.rlwy.net:20105
   - Private: postgres.railway.internal:5432

2. **PgBouncer** (e9cda67b-10fe-45b2-84a7-00836a98ae2f)
   - Connection pooling for Postgres

3. **PostgREST** (eb84cfd8-ec1d-41b3-b078-16c253282189)
   - Auto-generated REST API from Postgres schema

4. **Supabase Auth** (dbbc67fc-5ea1-4b83-8c74-831f61332cdf)
   - Authentication service (JWT, OAuth, etc.)
   - URL: supabase-auth-production-aa86.up.railway.app

5. **Supabase Realtime** (2eb81f88-78d3-4fdb-84ff-8eb3ebf4c2d1)
   - WebSocket-based real-time subscriptions

6. **Supabase Storage** (97d856ca-58f8-4a21-aa1f-a4da2b537051)
   - S3-compatible object storage API

7. **Supabase Studio** (e46e9ff6-b442-42f6-8e4b-c3456f766d5c)
   - Web UI for database management
   - URL: studio-production-cfcd.up.railway.app

8. **Edge Functions** (8d8f09d2-2972-492a-835f-943f44da329c)
   - Deno-based serverless functions

**Supporting Infrastructure:**
9. **Kong** (8226e6bf-84d8-4f90-b27c-9ee0af1bff6e)
   - API Gateway (routing, rate limiting)
   - URL: kong-production-80c6.up.railway.app

10. **Postgres-Meta** (94d30913-5402-4592-9b1a-9318d0e17b1d)
    - Metadata API for database introspection
    - URL: postgres-meta-production-6c48.up.railway.app

11. **MinIO** (9c4d3279-cb37-4c67-8e18-65660e1c7579)
    - S3-compatible object storage backend
    - URL: minio-production-f65d.up.railway.app

12. **imgproxy** (c9b368be-853e-4ce1-b968-beb285622901)
    - Image transformation and optimization

13. **Redis** (a65d60f4-b872-4b9c-879a-ee679f57ba1c)
    - Caching layer for Realtime and Auth

**Additional Services:**
14. **MongoDB** (d9b758b8-5cdf-4a21-badf-7e33cceba3ea)
    - NoSQL database (likely for analytics or logs)

15. **Server** (b4334287-1b17-4c8c-9aae-f25f7378a972)
    - Custom API server
    - URL: server-production-fdb5.up.railway.app

16. **Site** (3c0c0347-dcba-4b29-ac8e-250cf859612b)
    - Landing page or documentation
    - URL: site-production-eb00.up.railway.app

17. **Studio** (717e6903-286d-448f-bb90-0a07b84dc0a0)
    - Additional studio instance (possibly custom)
    - URL: studio-production-cfcd.up.railway.app

**Environments:**
- **Production** (2f0f8f00-22f6-4d88-ba9c-60c1f313fd0b)
- **Dev** (e8d96579-d78b-48d4-8cd3-a466c5c5d077)

All services duplicated across both environments = **34 total service instances**

**Estimated Monthly Cost (Production Only):**

**Compute (rough estimates):**
- Postgres (2 vCPU, 4GB RAM): ~$40/month
- PgBouncer (0.5 vCPU, 512MB): ~$10/month
- PostgREST (1 vCPU, 1GB): ~$20/month
- Supabase Auth (1 vCPU, 1GB): ~$20/month
- Supabase Realtime (1 vCPU, 1GB): ~$20/month
- Supabase Storage (1 vCPU, 1GB): ~$20/month
- Kong (1 vCPU, 2GB): ~$20/month
- MinIO (1 vCPU, 2GB): ~$20/month
- Redis (0.5 vCPU, 512MB): ~$10/month
- MongoDB (1 vCPU, 2GB): ~$20/month
- Remaining services (7 × $15): ~$105/month

**Subtotal (compute):** ~$305/month

**Storage:**
- Postgres volume (estimate 50GB): $12.50/month
- MinIO volume (estimate 100GB): $25/month
- MongoDB volume (estimate 20GB): $5/month

**Subtotal (storage):** ~$42.50/month

**Total (production only):** ~$347.50/month
**Total (production + dev):** ~$695/month

**Key Observations:**
1. **Railway handles complex multi-service architectures well**
   - 17 services with private networking
   - Automatic service discovery via .railway.internal
   - Zero-config deployments for all Supabase components

2. **Service mesh capabilities demonstrated**
   - Internal networking between services
   - Kong as API gateway with routing/rate limiting
   - PgBouncer for connection pooling

3. **Cost scaling is linear**
   - Each additional service adds $10-40/month
   - Volume costs add up quickly ($0.25/GB/month)
   - No volume discounts at scale

4. **Comparison to managed Supabase:**
   - Managed Supabase Pro: $25/month (1 project)
   - Railway self-hosted: ~$350/month (full control, unlimited projects)
   - Tradeoff: 14x cost for full infrastructure ownership

**Conclusion for DLS:**
OgelBase demonstrates Railway's strengths (multi-service orchestration, zero-config) and weaknesses (cost at scale, no low-level access). DLS would require 10x this complexity with resource isolation Railway cannot provide.

---

## Appendix B: Railway GraphQL API Examples

**Testing Railway's API capabilities:**

**1. Query Project Details:**
```graphql
query GetProject($projectId: String!) {
  project(id: $projectId) {
    id
    name
    description
    createdAt
    services {
      edges {
        node {
          id
          name
          createdAt
        }
      }
    }
    environments {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}
```

Variables:
```json
{
  "projectId": "e0b212f2-b913-4ea6-8b0d-6f54a081db5f"
}
```

**2. Query Service Metrics:**
```graphql
query ServiceMetrics($serviceId: String!, $environmentId: String!) {
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    id
    latestDeployment {
      id
      status
      meta
    }
    domains {
      customDomains {
        domain
        status
      }
      serviceDomains {
        domain
      }
    }
  }
}
```

**3. Trigger Deployment:**
```graphql
mutation DeployService($serviceId: String!, $environmentId: String!) {
  serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) {
    id
    status
  }
}
```

**4. Update Environment Variables:**
```graphql
mutation UpdateVariables($serviceId: String!, $environmentId: String!, $variables: VariablesInput!) {
  variableCollectionUpsert(input: {
    serviceId: $serviceId
    environmentId: $environmentId
    variables: $variables
  }) {
    id
  }
}
```

**API Limitations for DLS:**
- ❌ Cannot query real-time resource usage (CPU/memory) via API
- ❌ Cannot adjust resource limits without redeployment
- ❌ No API for connection-level metrics or throttling
- ❌ No API for volume performance metrics (IOPS, latency)
- ❌ No API for tenant-specific routing or isolation

**Railway CLI vs GraphQL API:**
Railway CLI is a wrapper around GraphQL API. All CLI operations can be replicated via direct GraphQL queries to `https://backboard.railway.app/graphql/v2`.

Authentication:
```bash
# Get Railway API token from: railway.app/account/tokens
export RAILWAY_API_TOKEN="your-token-here"

curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { email name } }"}'
```

**Assessment Complete:** Railway is not viable for DLS. Proceed with Kubernetes architecture planning.
