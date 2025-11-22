# Railway Network Topology - OgelBase Platform

**Visual Architecture Diagrams**

---

## Current State: Public Network (Costly)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│                    PUBLIC INTERNET ($$$)                             │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         │              │              │              │
    ┌────▼────┐    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │ Browser │    │ Studio  │   │  Kong   │   │  Auth   │
    │  User   │    │  :3000  │   │  :8000  │   │  :9999  │
    └─────────┘    └────┬────┘   └────┬────┘   └────┬────┘
                        │              │              │
           ┌────────────┤              │              │
           │            │              │              │
           │       ┌────▼──────────────▼──────────────▼──┐
           │       │                                      │
           │       │      Database: Postgres :5432        │
           │       │      (postgres.railway.internal)     │
           │       │                                      │
           │       └──────────────────┬───────────────────┘
           │                          │
           │                          │
      ┌────▼────┐              ┌─────▼─────┐
      │ PG Meta │              │   MinIO   │
      │  :8080  │              │   :9000   │
      └─────────┘              └───────────┘

📊 Current: 111GB/month egress
💰 Cost: $11.10/month in egress fees
❌ Problem: All service-to-service traffic goes over public internet
```

---

## Target State: Private Network (Optimized)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      PUBLIC INTERNET                                 │
│                   (Only for browser traffic)                         │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ (18GB/month)
                              │
                         ┌────▼────┐
                         │ Browser │
                         │  User   │
                         └────┬────┘
                              │
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                                                                     │
│              Railway Private Network (FREE)                        │
│                                                                     │
│    ┌─────────┐         ┌─────────┐         ┌─────────┐          │
│    │ Studio  │────────▶│  Kong   │────────▶│  Auth   │          │
│    │  :3000  │         │  :8000  │         │  :9999  │          │
│    └────┬────┘         └────┬────┘         └────┬────┘          │
│         │                   │                    │                │
│         │                   │                    │                │
│    ┌────┴──────────┬────────┴────────────────────┴──────┐        │
│    │               │                                     │        │
│    │          ┌────▼──────────────────────────────┐     │        │
│    │          │                                    │     │        │
│    │          │  Database: Postgres :5432          │     │        │
│    │          │  (postgres.railway.internal)       │     │        │
│    │          │                                    │     │        │
│    │          └────────────────────────────────────┘     │        │
│    │                                                      │        │
│    │                                                      │        │
│ ┌──▼──────┐                                         ┌────▼────┐  │
│ │ PG Meta │                                         │  MinIO  │  │
│ │  :8080  │                                         │  :9000  │  │
│ └─────────┘                                         └─────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

📊 Optimized: 18GB/month egress (only browser traffic)
💰 Cost: $1.80/month in egress fees
✅ Savings: $9.30/month (84% reduction)
```

---

## Service Communication Flow

### Data Flow: User Request to Database Query

#### Current (Public Network - Expensive)

```
User Browser
    │
    │ HTTPS
    ▼
Kong Gateway (Public URL)
    │ kong-production-80c6.up.railway.app
    │
    │ ❌ EGRESS FEE ($$$)
    │
    ▼
Studio Backend (Public URL)
    │ studio-production-cfcd.up.railway.app
    │
    │ ❌ EGRESS FEE ($$$)
    │
    ▼
Postgres Meta (Public URL)
    │ postgres-meta-production-6c48.up.railway.app
    │
    │ ❌ EGRESS FEE ($$$)
    │
    ▼
Postgres Database (Public URL)
    │ maglev.proxy.rlwy.net:20105
    │
    ▼
Response (all the way back)

Total: 5 network hops over public internet
Cost per request: ~5 egress charges
```

#### Optimized (Private Network - Free)

```
User Browser
    │
    │ HTTPS (only egress charge)
    ▼
Kong Gateway
    │ kong.railway.internal:8000
    │
    │ ✅ FREE (private network)
    │
    ▼
Studio Backend
    │ studio.railway.internal:3000
    │
    │ ✅ FREE (private network)
    │
    ▼
Postgres Meta
    │ postgres-meta.railway.internal:8080
    │
    │ ✅ FREE (private network)
    │
    ▼
Postgres Database
    │ postgres.railway.internal:5432
    │
    ▼
Response (all the way back)

Total: 5 network hops (same as before)
Cost per request: 1 egress charge (browser only)
Savings: 80% cost reduction
```

---

## Authentication Flow

### Current Auth Flow (Expensive)

```
Browser
   │
   │ Login Request
   ▼
Kong Gateway
   │ kong-production-80c6.up.railway.app
   │
   │ ❌ EGRESS FEE
   │
   ▼
Auth Service (GoTrue)
   │ supabase-auth-production-aa86.up.railway.app
   │
   │ ❌ EGRESS FEE
   │
   ▼
Postgres (Verify Credentials)
   │ maglev.proxy.rlwy.net:20105
   │
   │ ❌ EGRESS FEE
   │
   ▼
Response + JWT Token

Cost: 3 egress charges per login
Monthly: ~15GB for auth traffic = $1.50/month
```

### Optimized Auth Flow (Free Internal)

```
Browser
   │
   │ Login Request
   ▼
Kong Gateway
   │ kong.railway.internal:8000
   │
   │ ✅ FREE
   │
   ▼
Auth Service (GoTrue)
   │ supabase-auth.railway.internal:9999
   │
   │ ✅ FREE
   │
   ▼
Postgres (Verify Credentials)
   │ postgres.railway.internal:5432
   │
   │ ✅ FREE
   │
   ▼
Response + JWT Token

Cost: 1 egress charge (browser only)
Monthly: ~2GB for auth traffic = $0.20/month
Savings: $1.30/month (87% reduction)
```

---

## Database Management Flow

### Current PG Meta Flow (Expensive)

```
Browser (Studio UI)
   │
   │ Database Query
   ▼
Studio Frontend
   │
   │ API Call
   ▼
Studio Backend
   │ studio-production-cfcd.up.railway.app
   │
   │ ❌ EGRESS FEE
   │
   ▼
Postgres Meta API
   │ postgres-meta-production-6c48.up.railway.app
   │
   │ ❌ EGRESS FEE
   │
   ▼
Postgres Database
   │ maglev.proxy.rlwy.net:20105
   │
   ▼
Response with Schema/Data

Cost: 2 egress charges
Monthly: ~7GB = $0.70/month
```

### Optimized PG Meta Flow (Free Internal)

```
Browser (Studio UI)
   │
   │ Database Query
   ▼
Studio Frontend
   │
   │ API Call (Public)
   ▼
Studio Backend
   │ studio.railway.internal:3000
   │
   │ ✅ FREE
   │
   ▼
Postgres Meta API
   │ postgres-meta.railway.internal:8080
   │
   │ ✅ FREE
   │
   ▼
Postgres Database
   │ postgres.railway.internal:5432
   │
   ▼
Response with Schema/Data

Cost: 1 egress charge (browser to Studio only)
Monthly: ~1GB = $0.10/month
Savings: $0.60/month (86% reduction)
```

---

## Service Dependencies Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    External Users                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Public URL (MUST STAY)
                       │
                       ▼
              ┌─────────────────┐
              │     Studio      │
              │   (Frontend)    │
              └────────┬────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         │ Private URLs (OPTIMIZE)   │ Private URLs (OPTIMIZE)
         │                           │
         ▼                           ▼
    ┌─────────┐              ┌──────────────┐
    │  Kong   │◄─────────────│  Postgres    │
    │ Gateway │              │   Meta       │
    └────┬────┘              └──────────────┘
         │                           │
         │                           │ Private (ALREADY OPTIMIZED ✅)
         │                           │
         ▼                           ▼
    ┌─────────┐              ┌──────────────┐
    │  Auth   │─────────────▶│  Postgres    │
    │ (GoTrue)│              │  Database    │
    └─────────┘              └──────────────┘
         │                           ▲
         │ Private (OPTIMIZE)        │
         │                           │
         │                           │ Private (OPTIMIZE)
         │                           │
         └──────────┬────────────────┘
                    │
                    ▼
              ┌──────────┐
              │  MinIO   │
              │ Storage  │
              └──────────┘

Legend:
━━━━━ Public URL (Browser traffic - MUST STAY PUBLIC)
─────  Private URL (Internal traffic - SHOULD BE PRIVATE)
✅     Already optimized
❌     Needs optimization
```

---

## Egress Cost Breakdown

### Before Optimization

```
Service          Internal Traffic    Egress     Cost/Month
────────────────────────────────────────────────────────────
Studio           →                   48 GB      $4.80
  ├─ Kong        18GB over public    ❌
  ├─ PG Meta     7GB over public     ❌
  └─ Postgres    0GB (already ✅)    ✅

Kong             →                   35 GB      $3.50
  ├─ Postgres    15GB over public    ❌
  ├─ Auth        10GB over public    ❌
  └─ MinIO       5GB over public     ❌

Auth             →                   15 GB      $1.50
  └─ Postgres    8GB over public     ❌

PG Meta          →                   8 GB       $0.80
  └─ Postgres    8GB over public     ❌

MinIO            →                   5 GB       $0.50
  └─ Postgres    5GB over public     ❌

Browser          →                   28 GB      $2.80
  (User traffic, must stay public)   ✅
────────────────────────────────────────────────────────────
TOTAL EGRESS                         111 GB     $11.10/mo
```

### After Optimization

```
Service          Internal Traffic    Egress     Cost/Month
────────────────────────────────────────────────────────────
Studio           →                   6 GB       $0.60
  ├─ Kong        0GB (private ✅)    ✅
  ├─ PG Meta     0GB (private ✅)    ✅
  └─ Postgres    0GB (already ✅)    ✅

Kong             →                   8 GB       $0.80
  ├─ Postgres    0GB (private ✅)    ✅
  ├─ Auth        0GB (private ✅)    ✅
  └─ MinIO       0GB (private ✅)    ✅

Auth             →                   2 GB       $0.20
  └─ Postgres    0GB (private ✅)    ✅

PG Meta          →                   1 GB       $0.10
  └─ Postgres    0GB (private ✅)    ✅

MinIO            →                   1 GB       $0.10
  └─ Postgres    0GB (private ✅)    ✅

Browser          →                   18 GB      $1.80
  (User traffic, must stay public)   ✅
────────────────────────────────────────────────────────────
TOTAL EGRESS                         18 GB      $1.80/mo

SAVINGS                              93 GB      $9.30/mo
REDUCTION                            84%        84%
```

---

## Migration Impact Timeline

### Week 0: Before Migration
```
Egress: ████████████████████████████████████ 111 GB ($11.10)
        ↑ All service traffic over public network
```

### Week 1: Studio Migrated
```
Egress: ████████████████████████ 86 GB ($8.60)
        ↑ Studio now uses private network
        Savings: 25 GB ($2.50) - 23% reduction
```

### Week 2: Kong + Auth Migrated
```
Egress: ████████████ 44 GB ($4.40)
        ↑ Most internal traffic now private
        Savings: 67 GB ($6.70) - 60% reduction
```

### Week 3: Full Migration Complete
```
Egress: ████ 18 GB ($1.80)
        ↑ Only browser traffic remains
        Savings: 93 GB ($9.30) - 84% reduction
```

---

## Port Mapping Reference

### Public vs Private Ports

| Service | Public Host | Public Port | Private Host | Private Port |
|---------|-------------|-------------|--------------|--------------|
| **Postgres** | maglev.proxy.rlwy.net | 20105 | postgres.railway.internal | 5432 |
| **Kong** | kong-production-80c6.up.railway.app | 8000 | kong.railway.internal | 8000 |
| **Auth** | supabase-auth-production-aa86.up.railway.app | 9999 | supabase-auth.railway.internal | 9999 |
| **PG Meta** | postgres-meta-production-6c48.up.railway.app | 8080 | postgres-meta.railway.internal | 8080 |
| **Studio** | studio-production-cfcd.up.railway.app | 3000 | studio.railway.internal | 3000 |
| **MinIO** | minio-production-f65d.up.railway.app | 9000 | minio.railway.internal | 9000 |

**Important Note:**
- Postgres public port is **20105** (Railway proxy)
- Postgres private port is **5432** (standard PostgreSQL)
- All other services use same port on both public and private

---

## DNS Resolution

### Public DNS (External Access)
```
Browser DNS Lookup
    │
    ▼
*.up.railway.app → Railway Edge Network
    │
    ▼
Public IP (Egress counted)
```

### Private DNS (Internal Access)
```
Service DNS Lookup
    │
    ▼
*.railway.internal → Railway Private Network
    │
    ▼
Private IP (No egress, FREE)
```

---

## Environment Variable Patterns

### Public URLs (Browser-Facing)
```bash
# Pattern: NEXT_PUBLIC_*
# Sent to browser JavaScript
# MUST use public URLs

NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_GOTRUE_URL=https://kong-production-80c6.up.railway.app/auth/v1
NEXT_PUBLIC_API_URL=https://studio-production-cfcd.up.railway.app/api
```

### Private URLs (Server-Side Only)
```bash
# Pattern: No NEXT_PUBLIC_ prefix
# Only used in server-side code
# SHOULD use private network URLs

SUPABASE_URL=http://kong.railway.internal:8000
STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080
DATABASE_URL=postgres://postgres:***@postgres.railway.internal:5432/postgres
```

---

## Security Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                  Public Internet                         │
│  (Exposed, SSL/TLS required)                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Firewall / Railway Edge
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Railway Public Network                      │
│  (Services accessible via *.up.railway.app)             │
│  (Egress charges apply)                                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Network Isolation
                      │
┌─────────────────────▼───────────────────────────────────┐
│            Railway Private Network                       │
│  (Only accessible within same Railway environment)      │
│  (No egress charges, FREE)                              │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Studio   │  │  Kong    │  │  Auth    │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ PG Meta  │  │ Postgres │  │  MinIO   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
└──────────────────────────────────────────────────────────┘

Security Features:
✅ Private network isolated per Railway environment
✅ No external access to *.railway.internal domains
✅ TLS/SSL on all public endpoints
✅ Network-level isolation between environments
✅ Service-to-service authentication via JWT
```

---

## Load Distribution

### Before Optimization (All Public)

```
Internet Bandwidth (100%)
  │
  ├─ Browser Traffic (25%) ────────────────┐
  │                                         ▼
  │                                  Studio Public URL
  │
  ├─ Studio → Kong (16%) ──────────────────┐
  │                                         ▼
  │                                    Kong Public URL
  │
  ├─ Studio → PG Meta (6%) ────────────────┐
  │                                         ▼
  │                                  PG Meta Public URL
  │
  ├─ Kong → Postgres (14%) ────────────────┐
  │                                         ▼
  │                                 Postgres Public URL
  │
  ├─ Kong → Auth (9%) ─────────────────────┐
  │                                         ▼
  │                                   Auth Public URL
  │
  ├─ Auth → Postgres (7%) ─────────────────┘
  │
  ├─ PG Meta → Postgres (7%) ──────────────┘
  │
  └─ Other Internal (16%) ─────────────────┘

All traffic = Egress charges
Monthly: 111GB = $11.10
```

### After Optimization (Private Network)

```
Internet Bandwidth (16%)                Private Network (84%)
  │                                            │
  │                                            │
  ├─ Browser Traffic (16%) ──────┐            ├─ Studio → Kong (16%)
  │                               ▼            │
  │                        Studio Public       ├─ Studio → PG Meta (6%)
  └─────────────────────────────┘             │
                                               ├─ Kong → Postgres (14%)
                                               │
                                               ├─ Kong → Auth (9%)
                                               │
                                               ├─ Auth → Postgres (7%)
                                               │
                                               ├─ PG Meta → Postgres (7%)
                                               │
                                               └─ Other Internal (25%)

Internet: 18GB = $1.80
Private: 93GB = FREE
Monthly Savings: $9.30
```

---

**Last Updated:** 2025-11-21
**Visualization:** Network topology and flow diagrams
**Purpose:** Support RAILWAY-ARCHITECTURE-AUDIT.md with visual context
