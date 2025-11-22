# Railway Private Network Quick Reference
**OgelBase Production Environment**

## Private Network URLs (Service-to-Service)

### Core Services
```bash
# PostgreSQL Database
postgres.railway.internal:5432
Connection: postgres://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@postgres.railway.internal:5432/postgres

# MongoDB
mongodb.railway.internal:27017
Connection: mongodb://mongo:pedlSLZyLIwXzNSzaGAwTCKLCfgXtoDW@mongodb.railway.internal:27017

# Redis
redis.railway.internal:6379
Connection: redis://default:UTQjVunMdcoeTkszSCjPeAvXjewOTjAm@redis.railway.internal:6379
```

### Supabase Services
```bash
# Kong API Gateway (Internal)
kong.railway.internal:8000
http://kong.railway.internal:8000

# Postgres Meta (Database Management)
postgres-meta.railway.internal:8080
http://postgres-meta.railway.internal:8080

# Supabase Auth (GoTrue)
supabase-auth.railway.internal:9999
http://supabase-auth.railway.internal:9999

# Minio (Object Storage)
minio.railway.internal:9000
http://minio.railway.internal:9000
```

### Application Services
```bash
# Studio (Admin Dashboard)
studio.railway.internal:3000
http://studio.railway.internal:3000

# Server (Backend API)
server.railway.internal
http://server.railway.internal

# Site (Frontend)
site.railway.internal
http://site.railway.internal
```

## Public URLs (External Access)

### Production Endpoints
```bash
# Kong API Gateway (Public)
https://kong-production-80c6.up.railway.app

# Studio Dashboard (Public)
https://studio-production-cfcd.up.railway.app

# Postgres Meta (Public - Admin Tools)
https://postgres-meta-production-6c48.up.railway.app

# Minio Storage (Public - File Access)
https://minio-production-f65d.up.railway.app

# Supabase Auth (Public - User Auth)
https://supabase-auth-production-aa86.up.railway.app

# Server API (Public)
https://server-production-fdb5.up.railway.app

# Site Frontend (Public)
https://site-production-eb00.up.railway.app
```

### Vercel Deployment
```bash
# Studio on Vercel
https://ogelbase-studio.vercel.app
https://ogelbase-studio.vercel.app/api
```

## When to Use Which URL

### Use Private URLs For:
✅ Service-to-service communication within Railway
✅ Database connections from services
✅ API calls between backend services
✅ Cache/Redis access from services
✅ Internal storage access (Minio)
✅ Backend API routes making internal calls

**Benefits**:
- No egress charges
- Lower latency
- Better security (never leaves Railway network)
- No exposure to internet

### Use Public URLs For:
✅ Browser/client-side requests (`NEXT_PUBLIC_*` variables)
✅ External webhook callbacks
✅ Third-party integrations
✅ User authentication flows (browser-based)
✅ Development/testing from local machine
✅ External monitoring services

**When Required**:
- Browsers cannot access `.railway.internal` domains
- External services need publicly routable addresses
- CORS and SSL/TLS requirements

## Environment Variable Patterns

### Server-Side (Use Private)
```bash
DATABASE_URL=postgres://...@postgres.railway.internal:5432/postgres
SUPABASE_URL=http://kong.railway.internal:8000
STUDIO_PG_META_URL=http://postgres-meta.railway.internal:8080
REDIS_URL=redis://...@redis.railway.internal:6379
```

### Client-Side (Use Public)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://kong-production-80c6.up.railway.app
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api
NEXT_PUBLIC_SITE_URL=https://ogelbase-studio.vercel.app
```

## Service Port Mapping

| Service | Internal Port | External Port | Protocol |
|---------|--------------|---------------|----------|
| Postgres | 5432 | N/A | TCP |
| MongoDB | 27017 | N/A | TCP |
| Redis | 6379 | N/A | TCP |
| Kong | 8000 | 443 (HTTPS) | HTTP |
| Postgres Meta | 8080 | 443 (HTTPS) | HTTP |
| Minio | 9000 | 443 (HTTPS) | HTTP |
| Supabase Auth | 9999 | 443 (HTTPS) | HTTP |
| Studio | 3000 | 443 (HTTPS) | HTTP |

## Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Railway Private Network                   │
│  (*.railway.internal - Service-to-Service Communication)    │
│                                                              │
│  ┌──────────┐    ┌──────┐    ┌──────────────┐              │
│  │ Studio   │───▶│ Kong │───▶│ Supabase     │              │
│  │   :3000  │    │ :8000│    │ Auth :9999   │              │
│  └──────────┘    └──────┘    └──────────────┘              │
│       │              │                                       │
│       ▼              ▼                                       │
│  ┌──────────┐    ┌─────────────┐                           │
│  │ Postgres │    │ Postgres    │                           │
│  │ Meta     │    │ :5432       │                           │
│  │   :8080  │    └─────────────┘                           │
│  └──────────┘                                               │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ Minio    │    │ MongoDB  │    │ Redis    │             │
│  │   :9000  │    │   :27017 │    │   :6379  │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Public Internet (HTTPS via Railway)             │
│                                                              │
│  Users/Browsers          External Services                   │
│       │                        │                             │
│       ▼                        ▼                             │
│  https://kong-production-80c6.up.railway.app                │
│  https://studio-production-cfcd.up.railway.app              │
│  https://ogelbase-studio.vercel.app                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Commands

### Check Service Variables
```bash
railway variables --service studio
railway variables --service postgres
railway variables --service kong
```

### Set Private Network URL
```bash
# Example pattern:
railway variables --service studio --set VARIABLE_NAME="http://service.railway.internal:PORT"
```

### Test Private Network Connectivity
```bash
# From within a Railway service:
curl http://kong.railway.internal:8000/health
curl http://postgres-meta.railway.internal:8080/health
```

## Authentication Credentials

### Database (Postgres)
```
Host: postgres.railway.internal
Port: 5432
User: postgres
Password: sl2i90d6w7lzgejxxqwh3tiwuqxhtl64
Database: postgres
```

### Redis
```
Host: redis.railway.internal
Port: 6379
Password: UTQjVunMdcoeTkszSCjPeAvXjewOTjAm
```

### MongoDB
```
Host: mongodb.railway.internal
Port: 27017
User: mongo
Password: pedlSLZyLIwXzNSzaGAwTCKLCfgXtoDW
```

### Admin Dashboard
```
Username: admin
Password: changeme123
```

## Security Notes

🔒 **Private Network Benefits**:
- Traffic never leaves Railway's infrastructure
- No public internet exposure for databases
- Free internal bandwidth (no egress charges)
- Automatic mTLS between services

🌐 **Public URL Considerations**:
- SSL/TLS automatically provisioned by Railway
- Custom domains supported
- Rate limiting recommended for public endpoints
- CORS properly configured for browser access

---

**Last Updated**: 2025-11-21
**Project**: OgelBase
**Environment**: production
**Railway Project ID**: e0b212f2-b913-4ea6-8b0d-6f54a081db5f
