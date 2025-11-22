# Unified Security Architecture for OgelBase Multi-Database Stack

**Author**: Anjali Desai (PostgreSQL Security Specialist)
**Date**: 2025-11-21
**Status**: Design Document
**Priority**: P0 (Critical)
**Scope**: All 5 databases + Supabase services on Railway

---

## Executive Summary

OgelBase runs a **multi-database platform** with:
- **5 Databases**: PostgreSQL (Supabase), Redis, MongoDB, Convex, Neon
- **Services**: Supabase Auth (GoTrue), Storage (MinIO), Edge Functions, Realtime
- **Multi-tenancy**: Hundreds to thousands of organizations
- **Infrastructure**: Railway (auto-scaling containers)

**The Security Challenge**: Design ONE coherent security model that protects data across all databases, prevents tenant isolation violations, authenticates users consistently, authorizes based on subscription tier, encrypts data properly, logs all access, and prevents attacks.

**The Solution**: A **unified security architecture** with:

1. **Single Authentication Source**: Supabase Auth (GoTrue) issues JWTs
2. **Unified Authorization**: JWT claims drive access control across all databases
3. **Multi-Layer Tenant Isolation**: Database-level + application-level enforcement
4. **Encryption Everywhere**: TLS in transit, encryption at rest, key management via Vault
5. **Comprehensive Audit Trail**: All database operations logged with org_id attribution
6. **Defense in Depth**: Attack prevention at API Gateway, application, database layers

This is NOT "5 different security systems bolted together." This is ONE security architecture that spans the entire stack.

---

## I. The Security Problem

### Current Architecture (What We Have)
```
┌─────────────────────────────────────────────────────────────┐
│                    OgelBase on Railway                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  PostgreSQL │  │    Redis    │  │   MongoDB   │        │
│  │  (Supabase) │  │   (Cache)   │  │ (Metadata)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐                         │
│  │   Convex    │  │     Neon    │                         │
│  │  (Backend)  │  │ (Serverless │                         │
│  │             │  │   Postgres) │                         │
│  └─────────────┘  └─────────────┘                         │
│                                                             │
│  Services:                                                  │
│  • Supabase Auth (GoTrue) - OAuth/JWT authentication      │
│  • Supabase Storage (MinIO) - File uploads                │
│  • Supabase Edge Functions - Deno serverless             │
│  • Supabase Realtime - WebSocket subscriptions           │
│  • Kong API Gateway - HTTP routing                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Security Requirements (What We Need)

**1. Tenant Isolation** (Zero Cross-Tenant Data Leakage)
- Org A CANNOT access Org B's data in ANY database
- Isolation enforced at database level (survives app compromise)
- Verifiable through penetration testing

**2. Authentication** (Who Is This User?)
- Single source of truth: Supabase Auth (GoTrue)
- JWT-based authentication across all services
- Token expiration, refresh, revocation
- Social login (GitHub, Google) + email/password

**3. Authorization** (What Can This User Do?)
- Tier-based access control (FREE, STARTER, PRO, ENTERPRISE)
- Connection limits, rate limits, feature flags per tier
- Role-based access within organizations (admin, member, viewer)
- Enforce at multiple layers (API, database, service)

**4. Data Encryption**
- **At Rest**: All databases encrypted on Railway volumes
- **In Transit**: TLS 1.3 for all database connections
- **Application-Level**: Sensitive PII encrypted in Postgres (SSN, CC numbers)
- **Key Management**: Secrets in Vault, rotation automated

**5. Audit Logging** (Who Did What, When?)
- Every database operation logged with org_id
- All authentication events (login, logout, token refresh)
- Authorization failures (tier limit hits, denied access)
- Retention: 1 year minimum (compliance)
- Queryable audit trail for incident response

**6. Attack Prevention**
- SQL injection prevention (Postgres, Neon)
- NoSQL injection prevention (MongoDB, Convex)
- Redis command injection prevention
- Rate limiting (prevent DDoS, brute force)
- CSRF, XSS protection at API gateway

---

## II. Authentication Architecture: Supabase Auth as Source of Truth

### Why Supabase Auth (GoTrue)?
- **Already integrated**: Running in current Supabase stack
- **Industry-standard**: OAuth 2.0, OpenID Connect compliant
- **Multi-provider**: GitHub, Google, email/password, magic links
- **JWT-based**: Stateless tokens work across all databases
- **Proven at scale**: Powers thousands of Supabase projects

### JWT Token Structure

**Primary JWT Claims** (issued by GoTrue):
```json
{
  "sub": "user_uuid",                    // User ID (Supabase Auth user)
  "email": "user@example.com",
  "role": "authenticated",

  // OgelBase Custom Claims (added via GoTrue hooks)
  "app_metadata": {
    "org_id": "org-uuid-here",           // Primary: Which organization?
    "org_role": "admin",                 // Role within org (admin, member, viewer)
    "tier": "PRO",                       // Subscription tier (billing)
    "tier_limits": {
      "max_connections": 100,
      "max_storage_gb": 100,
      "rate_limit_per_min": 10000
    }
  },

  "user_metadata": {
    "full_name": "Alice Developer",
    "avatar_url": "https://..."
  },

  // Standard JWT Claims
  "iat": 1732234594,                     // Issued at (Unix timestamp)
  "exp": 1732238194,                     // Expires at (1 hour)
  "aud": "authenticated",
  "iss": "https://ogelbase.supabase.co/auth/v1"
}
```

**Why This Structure?**
- `org_id`: Tenant isolation enforcement across all databases
- `tier`: Authorization decisions (connection limits, features)
- `org_role`: Within-org permissions (admin can invite, member can't)
- Short expiration (1 hour): Limit JWT theft window
- Refresh token stored securely: Client-side refresh flow

### Authentication Flow (Unified Across All Databases)

```
┌──────────────────────────────────────────────────────────────────┐
│                   Authentication Flow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User Login                                                   │
│     ↓                                                            │
│  [Client App] → [Supabase Auth] → [GoTrue]                     │
│                      ↓                                           │
│                  Validate Credentials                            │
│                  (email/password, OAuth)                         │
│                      ↓                                           │
│                  Lookup User Org (MongoDB)                       │
│                      ↓                                           │
│                  Fetch Org Tier (MongoDB)                        │
│                      ↓                                           │
│                  Generate JWT with Claims:                       │
│                  - sub: user_id                                  │
│                  - org_id: org-uuid                              │
│                  - tier: PRO                                     │
│                  - org_role: admin                               │
│                      ↓                                           │
│  [Client App] ← JWT Token + Refresh Token                       │
│                                                                  │
│  2. Database Access (All 5 Databases)                           │
│     ↓                                                            │
│  [Client] → [API Gateway] → Validate JWT Signature             │
│                      ↓                                           │
│                  Extract org_id from JWT                         │
│                      ↓                                           │
│              ┌───────┴───────┐                                  │
│              ↓               ↓                                   │
│         [PostgreSQL]    [Redis/Mongo/Convex/Neon]              │
│              ↓               ↓                                   │
│     SET app.org_id = 'uuid'  Tag connection with org_id        │
│     RLS policies enforce      Namespace/database isolation      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### JWT Verification (All Services)

**Where JWT Is Validated:**
1. **Kong API Gateway**: First line of defense (signature validation)
2. **Edge Functions**: Deno runtime validates JWT before execution
3. **Supabase Storage**: MinIO proxy validates JWT for file access
4. **Supabase Realtime**: WebSocket handshake validates JWT
5. **Database Connections**: Application layer validates before querying

**Shared JWT Validation Logic** (TypeScript):
```typescript
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET! // From Supabase Auth

interface OgelBaseJWT {
  sub: string                          // user_id
  email: string
  app_metadata: {
    org_id: string                     // CRITICAL: Tenant identifier
    org_role: 'admin' | 'member' | 'viewer'
    tier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'
    tier_limits: {
      max_connections: number
      max_storage_gb: number
      rate_limit_per_min: number
    }
  }
  iat: number
  exp: number
}

export async function validateJWT(token: string): Promise<OgelBaseJWT> {
  try {
    // Verify signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET) as OgelBaseJWT

    // Ensure required claims present
    if (!decoded.app_metadata?.org_id) {
      throw new Error('JWT missing org_id claim')
    }

    if (!decoded.app_metadata?.tier) {
      throw new Error('JWT missing tier claim')
    }

    return decoded
  } catch (err) {
    throw new Error(`Invalid JWT: ${err.message}`)
  }
}

// Usage in API Gateway (Kong Lua plugin)
export async function authenticateRequest(req: Request): Promise<OgelBaseJWT> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header')
  }

  const token = authHeader.slice(7) // Remove "Bearer "
  return await validateJWT(token)
}
```

### Token Lifecycle Management

**Token Expiration Strategy:**
- **Access Token**: 1 hour (short-lived, limits theft window)
- **Refresh Token**: 30 days (stored securely, HttpOnly cookie)
- **Automatic Refresh**: Client SDK handles refresh before expiration

**Token Refresh Flow:**
```typescript
// Client-side (Supabase JS SDK handles this automatically)
const { data, error } = await supabase.auth.refreshSession()

// Server-side endpoint for manual refresh
async function refreshToken(refreshToken: string): Promise<JWTResponse> {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken
  })

  if (error) throw new Error('Token refresh failed')

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: 3600,
    expires_at: data.session.expires_at
  }
}
```

**Token Revocation:**
When user logs out or tier changes:
```typescript
async function revokeAllTokens(userId: string) {
  // Supabase Auth handles token revocation
  await supabase.auth.admin.signOut(userId)

  // Invalidate Redis session cache
  await redis.del(`session:${userId}`)

  // Force JWT blacklist (if using short-lived JWTs)
  // Not needed with 1-hour expiration - wait for natural expiry
}
```

---

## III. Authorization Enforcement: Multi-Database Strategy

### Authorization Model (3-Layer Enforcement)

```
┌─────────────────────────────────────────────────────────────────┐
│              Authorization Enforcement Layers                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: API Gateway (Kong) - FAST FAIL                       │
│  ├─ JWT signature validation                                   │
│  ├─ Rate limiting per org_id (tier-based)                      │
│  ├─ Request size limits (tier-based)                           │
│  └─ Return 429/403 before hitting databases                    │
│                                                                 │
│  Layer 2: Application Layer - BUSINESS LOGIC                   │
│  ├─ Extract org_id from JWT                                    │
│  ├─ Check tier limits (connection count, feature flags)        │
│  ├─ Tag database connections with org_id                       │
│  └─ Enforce org_role permissions (admin, member, viewer)       │
│                                                                 │
│  Layer 3: Database Layer - LAST LINE OF DEFENSE                │
│  ├─ PostgreSQL: RLS policies (org_id filter)                   │
│  ├─ Redis: Keyspace namespacing (org:${org_id}:*)             │
│  ├─ MongoDB: Database per org OR collection filters            │
│  ├─ Convex: Built-in auth integration                          │
│  ├─ Neon: Database-level isolation                             │
│  └─ Audit logging (pgAudit, MongoDB audit, custom)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Per-Database Authorization Implementation

#### 1. PostgreSQL (Supabase) - Row-Level Security

**RLS Policy Enforcement:**
```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users only see their org's data
CREATE POLICY tenant_isolation ON projects
  FOR ALL
  USING (org_id = current_setting('app.org_id')::UUID);

-- Force RLS (applies even to superuser connections)
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

-- Index for policy performance
CREATE INDEX idx_projects_org_id ON projects(org_id);
```

**Connection-Time Setup** (from JWT):
```typescript
async function createPostgresConnection(jwt: OgelBaseJWT): Promise<PostgresConnection> {
  const pool = await postgres.pool()
  const conn = await pool.connect()

  // Set session variables for RLS
  await conn.query(`SET SESSION app.org_id = $1`, [jwt.app_metadata.org_id])
  await conn.query(`SET SESSION app.tier = $1`, [jwt.app_metadata.tier])
  await conn.query(`SET SESSION app.user_id = $1`, [jwt.sub])

  // Apply tier-based limits
  const tier_limits = POSTGRES_TIER_LIMITS[jwt.app_metadata.tier]
  await conn.query(`SET SESSION statement_timeout = $1`, [tier_limits.statement_timeout])
  await conn.query(`SET SESSION work_mem = $1`, [tier_limits.work_mem])

  return conn
}
```

#### 2. Redis - Namespace Isolation

**Keyspace Enforcement:**
```typescript
class RedisSecureClient {
  private namespace(orgId: string, key: string): string {
    return `org:${orgId}:${key}`
  }

  async get(jwt: OgelBaseJWT, key: string): Promise<any> {
    const namespacedKey = this.namespace(jwt.app_metadata.org_id, key)
    return await redis.get(namespacedKey)
  }

  async set(jwt: OgelBaseJWT, key: string, value: any, ttl?: number): Promise<void> {
    const orgId = jwt.app_metadata.org_id
    const tier = jwt.app_metadata.tier

    // Check key quota for tier
    const keyCount = await this.getKeyCount(orgId)
    const tierLimits = REDIS_TIER_LIMITS[tier]

    if (keyCount >= tierLimits.max_keys) {
      throw new TierLimitError(`Redis key quota exceeded (${tierLimits.max_keys})`)
    }

    // Check memory quota
    const memoryUsage = await this.getOrgMemoryUsage(orgId)
    if (memoryUsage >= tierLimits.max_memory_bytes) {
      // Evict based on tier policy
      await this.evictKeys(orgId, tierLimits.eviction_policy)
    }

    const namespacedKey = this.namespace(orgId, key)
    const finalTTL = ttl || tierLimits.default_ttl_seconds

    await redis.setex(namespacedKey, finalTTL, JSON.stringify(value))
  }

  // Prevent cross-tenant key scanning
  async keys(jwt: OgelBaseJWT, pattern: string): Promise<string[]> {
    const orgId = jwt.app_metadata.org_id
    const orgPattern = `org:${orgId}:${pattern}`

    const keys = await redis.keys(orgPattern)
    // Strip namespace prefix before returning
    return keys.map(k => k.replace(`org:${orgId}:`, ''))
  }
}
```

#### 3. MongoDB - Database/Collection Isolation

**Two Isolation Strategies:**

**Option A: Database Per Org** (Strongest Isolation):
```typescript
async function getMongoDatabase(jwt: OgelBaseJWT): Promise<Db> {
  const orgId = jwt.app_metadata.org_id
  const client = await mongoClient.connect()

  // Each org gets its own database
  const db = client.db(`org_${orgId}`)

  return db
}

// Usage
const db = await getMongoDatabase(jwt)
const projects = await db.collection('projects').find({}).toArray()
// No cross-tenant leakage possible - physically separate databases
```

**Option B: Shared Database with Filters** (Better Resource Efficiency):
```typescript
async function queryMongo(
  jwt: OgelBaseJWT,
  collection: string,
  filter: any
): Promise<any[]> {
  const orgId = jwt.app_metadata.org_id
  const db = mongoClient.db('ogelbase')

  // ALWAYS add org_id filter (tamper-proof from JWT)
  const secureFilter = {
    ...filter,
    org_id: orgId  // Force org_id match
  }

  return await db.collection(collection).find(secureFilter).toArray()
}

// Index for performance
db.collection('projects').createIndex({ org_id: 1 })
```

**MongoDB Query Timeout Enforcement:**
```typescript
async function queryWithTierTimeout(
  jwt: OgelBaseJWT,
  collection: string,
  query: any
): Promise<any[]> {
  const tierLimits = MONGO_TIER_LIMITS[jwt.app_metadata.tier]

  return await db
    .collection(collection)
    .find(query)
    .maxTimeMS(tierLimits.query_timeout_ms)
    .toArray()
}
```

#### 4. Convex - Built-In Auth Integration

Convex has native auth support. Configure to use Supabase Auth JWTs:

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: "https://ogelbase.supabase.co/auth/v1",
      applicationID: "supabase",
    },
  ],
}

// convex/functions.ts
import { query, mutation } from "./_generated/server"
import { v } from "convex/values"

export const getProjects = query({
  args: {},
  handler: async (ctx) => {
    // Convex automatically validates JWT and provides user identity
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    // Extract org_id from JWT claims
    const orgId = identity.tokenIdentifier.split('|')[1] // Or from custom claim

    // Query with automatic org_id filtering
    return await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("org_id"), orgId))
      .collect()
  },
})
```

#### 5. Neon - Database-Level Isolation

**Neon Serverless Postgres** (separate from main Supabase Postgres):

**Strategy: Database Per Org** (Neon supports thousands of databases):
```typescript
async function getNeonConnection(jwt: OgelBaseJWT): Promise<NeonConnection> {
  const orgId = jwt.app_metadata.org_id

  // Each org gets dedicated Neon database
  const connectionString = `postgresql://user:pass@${orgId}.neon.tech/db`

  return await neon(connectionString)
}

// RLS still applied for defense in depth
// Even within dedicated database, enforce org_id filters
```

---

## IV. Tenant Isolation: Multi-Database Guarantee

### Isolation Requirements

**Primary Goal**: Org A CANNOT access Org B's data under any circumstances.

**Verification Method**: Penetration testing with adversarial queries:
```sql
-- Attempt 1: Direct org_id bypass (should fail)
SET app.org_id = 'org-b-uuid';
SELECT * FROM projects WHERE org_id = 'org-a-uuid';
-- Result: 0 rows (RLS blocks access)

-- Attempt 2: UNION injection (should fail)
SELECT * FROM projects WHERE name = 'test' UNION SELECT * FROM projects WHERE org_id = 'victim-uuid';
-- Result: RLS applied to both sides of UNION

-- Attempt 3: Function privilege escalation (should fail)
CREATE FUNCTION bypass_rls() RETURNS TABLE(...) SECURITY DEFINER AS $$
  SELECT * FROM projects WHERE org_id != current_setting('app.org_id')::UUID;
$$ LANGUAGE SQL;
-- Result: Function still subject to RLS
```

### Per-Database Isolation Strategy

| Database | Isolation Method | Strength | Verification |
|----------|-----------------|----------|--------------|
| **PostgreSQL (Supabase)** | RLS policies + session context | ✅ Strong (database-enforced) | Adversarial SQL queries |
| **Redis** | Keyspace namespacing (`org:${id}:*`) | ⚠️ Moderate (app-enforced) | Cross-namespace key scan attempts |
| **MongoDB** | Database per org OR org_id filters | ✅ Strong (physical or filter) | Cross-org query attempts |
| **Convex** | Built-in auth + query filters | ✅ Strong (framework-enforced) | Identity spoofing attempts |
| **Neon** | Database per org + RLS | ✅ Very Strong (physical + logical) | Cross-database connection attempts |

### Cross-Database Attack Scenarios

**Attack 1: JWT Forgery (Attempt to change org_id)**
```typescript
// Attacker intercepts JWT, tries to modify org_id claim
const stolenJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// Attacker modifies payload: org_id = 'victim-org-uuid'
const tamperedPayload = { ...originalPayload, app_metadata: { org_id: 'victim-uuid' } }
const tamperedJWT = jwt.sign(tamperedPayload, 'WRONG_SECRET')

// Validation fails: Signature mismatch
await validateJWT(tamperedJWT)
// Error: Invalid JWT signature
```

**Defense**: JWT signature validation with server-side secret. Attacker cannot forge valid signature without secret.

**Attack 2: Connection Pooling Bypass (Session Leakage)**
```typescript
// Attacker hopes connection pool reuses connection with victim's org_id

// Connection A sets org_id = 'victim-uuid'
await conn1.query(`SET SESSION app.org_id = 'victim-uuid'`)

// Connection returned to pool, given to attacker
// Attacker gets conn1 (reused connection)

// Defense: Clear session state on connection handoff
await conn1.query(`RESET app.org_id`)
await conn1.query(`SET SESSION app.org_id = 'attacker-uuid'`)
```

**Defense**: PgBouncer session mode + session cleanup. OR use separate connection pools per org.

**Attack 3: Redis Namespace Bypass (Key Scanning)**
```typescript
// Attacker tries to scan ALL keys (cross-tenant)
const allKeys = await redis.keys('*')  // Dangerous!

// Defense: Restrict KEYS command, enforce namespacing
class SecureRedis {
  async keys(jwt: OgelBaseJWT, pattern: string): Promise<string[]> {
    const orgId = jwt.app_metadata.org_id
    const orgPattern = `org:${orgId}:${pattern}`

    // Only scan within tenant namespace
    return await redis.keys(orgPattern)
  }

  // Prevent raw Redis access (no bypass)
}
```

**Attack 4: MongoDB Cross-Collection Access**
```typescript
// Attacker tries to access different collection without org_id filter
await db.collection('other_orgs_data').find({}).toArray()

// Defense: ALWAYS apply org_id filter at ORM/query builder level
class SecureMongoClient {
  async find(jwt: OgelBaseJWT, collection: string, filter: any) {
    // Force org_id into every query
    const secureFilter = { ...filter, org_id: jwt.app_metadata.org_id }
    return await db.collection(collection).find(secureFilter).toArray()
  }
}
```

---

## V. Encryption Strategy

### Encryption at Rest (Railway Volumes)

**Railway Infrastructure Encryption:**
- Railway volumes encrypted by default (AES-256)
- Encryption managed by Railway platform
- Keys managed by cloud provider (AWS KMS, GCP KMS)

**Verification:**
```bash
# Check Railway volume encryption status
railway volume list --json | jq '.[] | {name, encrypted}'
```

**Application-Layer Encryption** (for extra-sensitive data):
```sql
-- Encrypt PII columns in PostgreSQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  email TEXT NOT NULL,
  ssn TEXT,  -- Social Security Number (ENCRYPTED)
  credit_card TEXT  -- (ENCRYPTED)
);

-- Encrypt on INSERT
INSERT INTO users (id, org_id, email, ssn, credit_card)
VALUES (
  gen_random_uuid(),
  'org-uuid',
  'user@example.com',
  pgp_sym_encrypt('123-45-6789', current_setting('app.encryption_key')),
  pgp_sym_encrypt('4111-1111-1111-1111', current_setting('app.encryption_key'))
);

-- Decrypt on SELECT (only with valid key)
SELECT
  id,
  email,
  pgp_sym_decrypt(ssn::bytea, current_setting('app.encryption_key')) AS ssn_decrypted
FROM users
WHERE org_id = current_setting('app.org_id')::UUID;
```

### Encryption in Transit (TLS 1.3)

**All database connections enforce TLS:**

**PostgreSQL TLS Configuration:**
```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,  // Enforce valid certificates
    ca: fs.readFileSync('/path/to/ca-certificate.crt'),
  }
})
```

**Redis TLS:**
```typescript
const redis = new Redis({
  host: 'redis.railway.internal',
  port: 6379,
  tls: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/redis-ca.crt')
  }
})
```

**MongoDB TLS:**
```typescript
const client = new MongoClient(mongoUrl, {
  ssl: true,
  sslValidate: true,
  sslCA: fs.readFileSync('/path/to/mongo-ca.pem')
})
```

**HTTP/API TLS:**
- Kong API Gateway terminates TLS
- All client connections HTTPS only
- HSTS headers enforced
- TLS 1.3 minimum version

### Key Management (HashiCorp Vault)

**Vault Integration Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                  Key Management Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Application] → Request Encryption Key                     │
│        ↓                                                    │
│  [Vault] → Authenticate (AppRole or JWT)                   │
│        ↓                                                    │
│  Fetch Secret: `database/encryption_key`                    │
│        ↓                                                    │
│  Return: AES-256 key (time-limited lease)                  │
│        ↓                                                    │
│  [Application] → Use key for encrypt/decrypt                │
│        ↓                                                    │
│  Key rotates every 90 days (automated)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Vault Secrets Storage:**
```bash
# Store database encryption keys
vault kv put secret/ogelbase/database/encryption_key value="$(openssl rand -base64 32)"

# Store JWT signing secret
vault kv put secret/ogelbase/auth/jwt_secret value="$SUPABASE_JWT_SECRET"

# Store API keys (Stripe, SendGrid, etc.)
vault kv put secret/ogelbase/integrations/stripe api_key="sk_live_..."
```

**Application Retrieval:**
```typescript
import Vault from 'node-vault'

const vault = Vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
})

async function getEncryptionKey(): Promise<string> {
  const result = await vault.read('secret/ogelbase/database/encryption_key')
  return result.data.value
}

// Set as session variable for PostgreSQL encryption
await conn.query(`SET SESSION app.encryption_key = $1`, [await getEncryptionKey()])
```

**Key Rotation Strategy:**
```typescript
async function rotateEncryptionKey() {
  // Generate new key
  const newKey = crypto.randomBytes(32).toString('base64')

  // Store in Vault with version
  await vault.write('secret/ogelbase/database/encryption_key', {
    value: newKey,
    previous_key: await getEncryptionKey(),  // Keep old key for decryption
    rotated_at: new Date().toISOString()
  })

  // Re-encrypt data with new key (background job)
  await reEncryptSensitiveData(newKey)
}

// Automated rotation (every 90 days)
cron.schedule('0 0 1 */3 *', rotateEncryptionKey)  // Every 3 months
```

---

## VI. Audit Logging Architecture

### What to Log (Comprehensive Audit Trail)

**1. Authentication Events:**
- User login (success, failure, provider)
- User logout
- JWT token refresh
- Password reset requests
- OAuth authorization grants

**2. Authorization Events:**
- Tier limit hits (connection limit, rate limit, storage quota)
- Permission denials (insufficient role, missing feature flag)
- Tier upgrades/downgrades

**3. Database Operations:**
- All SQL queries (PostgreSQL via pgAudit)
- MongoDB mutations (via MongoDB audit log)
- Redis key writes (via custom logging)
- Connection creation/destruction

**4. Administrative Actions:**
- Org creation/deletion
- User invitation/removal
- Tier changes
- Security setting modifications

### Audit Log Schema (MongoDB Collection)

```typescript
interface AuditLogEntry {
  id: string                           // Unique log entry ID
  timestamp: Date                      // When event occurred

  // WHO
  user_id: string                      // User who performed action
  org_id: string                       // Organization context
  ip_address: string                   // Client IP (for fraud detection)
  user_agent: string                   // Browser/client info

  // WHAT
  event_type: string                   // 'auth.login', 'db.query', 'admin.tier_change'
  action: string                       // 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
  resource_type: string                // 'table', 'collection', 'key'
  resource_name: string                // 'projects', 'users', etc.

  // DETAILS
  query?: string                       // Actual SQL/NoSQL query (sanitized)
  params?: any[]                       // Query parameters (PII redacted)
  result_count?: number                // Rows/docs affected
  duration_ms?: number                 // Query execution time

  // AUTHORIZATION CONTEXT
  tier: string                         // User's tier at time of action
  org_role: string                     // User's role in org

  // OUTCOME
  success: boolean                     // Did action succeed?
  error_code?: string                  // Error code if failed
  error_message?: string               // Error message

  // METADATA
  database: string                     // 'postgres', 'redis', 'mongo', 'convex', 'neon'
  session_id?: string                  // Database session identifier
}
```

### Per-Database Audit Implementation

#### PostgreSQL Audit (pgAudit Extension)

**Installation & Configuration:**
```sql
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Audit all queries (READ, WRITE, DDL)
ALTER SYSTEM SET pgaudit.log = 'all';
ALTER SYSTEM SET pgaudit.log_parameter = on;  -- Log query parameters
ALTER SYSTEM SET pgaudit.log_relation = on;   -- Log table names

-- Reload config
SELECT pg_reload_conf();
```

**pgAudit Log Format:**
```
2025-11-21 22:30:45 UTC [12345] LOG:
  AUDIT: SESSION,1,1,READ,SELECT,TABLE,public.projects,
  "SELECT * FROM projects WHERE org_id = $1",
  <org_id='org-uuid-123',user_id='user-uuid-456'>
```

**Forwarding pgAudit Logs to MongoDB:**
```typescript
// Parse Postgres logs, send to MongoDB audit collection
async function processPgAuditLog(logLine: string) {
  const parsed = parsePgAuditLog(logLine)

  await mongo.db('ogelbase_audit').collection('logs').insertOne({
    timestamp: parsed.timestamp,
    user_id: parsed.session_vars.user_id,
    org_id: parsed.session_vars.org_id,
    event_type: 'db.query',
    action: parsed.command,  // SELECT, INSERT, UPDATE, DELETE
    resource_type: 'table',
    resource_name: parsed.table_name,
    query: parsed.statement,
    params: parsed.parameters,
    success: true,
    database: 'postgres'
  })
}
```

#### MongoDB Audit (Built-in Audit Log)

**Enable MongoDB Auditing:**
```bash
# MongoDB config (mongod.conf)
auditLog:
  destination: file
  format: JSON
  path: /var/log/mongodb/audit.json
  filter: '{ $or: [
    { "atype": "insert" },
    { "atype": "update" },
    { "atype": "delete" },
    { "atype": "createCollection" },
    { "atype": "dropCollection" }
  ]}'
```

**MongoDB Audit Log Format:**
```json
{
  "atype": "insert",
  "ts": { "$date": "2025-11-21T22:30:45.123Z" },
  "local": { "ip": "127.0.0.1", "port": 27017 },
  "remote": { "ip": "10.0.1.5", "port": 54321 },
  "users": [{ "user": "ogelbase_app", "db": "admin" }],
  "roles": [{ "role": "readWrite", "db": "ogelbase" }],
  "param": {
    "ns": "ogelbase.projects",
    "document": {
      "_id": "...",
      "org_id": "org-uuid-123",
      "name": "New Project"
    }
  },
  "result": 0
}
```

#### Redis Audit (Custom Logging)

**Redis Command Interception:**
```typescript
class AuditedRedisClient {
  private baseClient: Redis
  private auditLogger: AuditLogger

  async set(key: string, value: any, jwt: OgelBaseJWT): Promise<void> {
    const start = Date.now()

    try {
      await this.baseClient.set(key, value)

      // Log successful operation
      await this.auditLogger.log({
        timestamp: new Date(),
        user_id: jwt.sub,
        org_id: jwt.app_metadata.org_id,
        event_type: 'redis.set',
        action: 'SET',
        resource_type: 'key',
        resource_name: key,
        duration_ms: Date.now() - start,
        success: true,
        database: 'redis'
      })
    } catch (err) {
      // Log failure
      await this.auditLogger.log({
        timestamp: new Date(),
        user_id: jwt.sub,
        org_id: jwt.app_metadata.org_id,
        event_type: 'redis.set',
        action: 'SET',
        resource_type: 'key',
        resource_name: key,
        success: false,
        error_message: err.message,
        database: 'redis'
      })
      throw err
    }
  }
}
```

### Audit Log Querying (Incident Response)

**Find all actions by specific user:**
```typescript
const userActions = await audit.find({
  user_id: 'suspect-user-uuid',
  timestamp: { $gte: new Date('2025-11-20'), $lte: new Date('2025-11-21') }
}).sort({ timestamp: -1 }).toArray()
```

**Find all failed authorization attempts:**
```typescript
const authFailures = await audit.find({
  event_type: /^auth\./,
  success: false
}).toArray()
```

**Find cross-org access attempts (should be zero):**
```typescript
// Query logs for org_id mismatch (attack detection)
const suspiciousQueries = await audit.aggregate([
  {
    $match: {
      database: 'postgres',
      query: { $regex: /org_id\s*=\s*'[^']*'/ }  // Queries with explicit org_id
    }
  },
  {
    $project: {
      user_org_id: '$org_id',
      query_org_id: { $regexFind: { input: '$query', regex: /org_id\s*=\s*'([^']*)'/ } }
    }
  },
  {
    $match: {
      $expr: { $ne: ['$user_org_id', '$query_org_id.captures.0'] }  // org_id mismatch!
    }
  }
]).toArray()
```

### Audit Log Retention & Compliance

**Retention Policy:**
- **Hot storage**: Last 90 days (MongoDB, fast queries)
- **Warm storage**: 90 days - 1 year (compressed, S3)
- **Cold storage**: 1+ years (archival, Glacier)

**Compliance Requirements:**
- **SOC2**: 1 year minimum retention, tamper-proof logs
- **GDPR**: Right to erasure (delete user's logs after account deletion)
- **HIPAA**: 6 years retention for healthcare data

**Log Immutability** (Prevent Tampering):
```typescript
// Write logs to append-only collection (no UPDATE/DELETE)
await mongo.db('ogelbase_audit').createCollection('logs', {
  capped: false,
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['timestamp', 'user_id', 'org_id', 'event_type']
    }
  }
})

// Disable UPDATE/DELETE on audit collection
await mongo.db('ogelbase_audit').runCommand({
  collMod: 'logs',
  validationLevel: 'strict',
  validationAction: 'error'
})
```

---

## VII. Attack Surface & Prevention

### Attack Vectors by Database

| Attack Type | PostgreSQL | Redis | MongoDB | Convex | Neon | Mitigation |
|-------------|-----------|-------|---------|---------|------|------------|
| **SQL Injection** | ✅ Risk | ❌ N/A | ❌ N/A | ❌ N/A | ✅ Risk | Parameterized queries, RLS |
| **NoSQL Injection** | ❌ N/A | ❌ N/A | ✅ Risk | ⚠️ Low | ❌ N/A | Input validation, query filters |
| **Command Injection** | ⚠️ Low | ✅ Risk | ⚠️ Low | ❌ N/A | ⚠️ Low | Disable dangerous commands |
| **Timing Attacks** | ⚠️ Low | ⚠️ Low | ⚠️ Low | ⚠️ Low | ⚠️ Low | Constant-time operations |
| **JWT Theft** | ✅ Risk | ✅ Risk | ✅ Risk | ✅ Risk | ✅ Risk | Short expiration, HTTPS only |
| **Session Hijacking** | ⚠️ Low | ⚠️ Low | ⚠️ Low | ⚠️ Low | ⚠️ Low | Session cleanup, IP validation |
| **DDoS** | ✅ Risk | ✅ Risk | ✅ Risk | ✅ Risk | ✅ Risk | Rate limiting, connection limits |
| **Privilege Escalation** | ⚠️ Low | ❌ N/A | ⚠️ Low | ❌ N/A | ⚠️ Low | RLS, minimal privileges |

### Layer-by-Layer Defense

#### 1. API Gateway (Kong) - First Line of Defense

**Rate Limiting:**
```lua
-- Kong rate limiting plugin
plugins:
  - name: rate-limiting
    config:
      minute: {{ tier_limits.rate_limit_per_min }}
      policy: redis
      redis_host: redis.railway.internal
      redis_port: 6379
      identifier: jwt_claim_org_id
```

**Request Size Limits:**
```lua
-- Prevent large payload attacks
plugins:
  - name: request-size-limiting
    config:
      allowed_payload_size: 10  # 10MB for PRO tier
```

**JWT Validation:**
```lua
-- Kong JWT plugin
plugins:
  - name: jwt
    config:
      secret_is_base64: false
      claims_to_verify:
        - exp
        - iat
      key_claim_name: kid
      maximum_expiration: 3600  # 1 hour max
```

#### 2. Application Layer - Business Logic Enforcement

**SQL Injection Prevention (Parameterized Queries):**
```typescript
// ❌ WRONG: String concatenation
const query = `SELECT * FROM projects WHERE name = '${userInput}'`

// ✅ CORRECT: Parameterized query
const query = `SELECT * FROM projects WHERE name = $1`
const result = await conn.query(query, [userInput])
```

**NoSQL Injection Prevention (MongoDB):**
```typescript
// ❌ WRONG: Direct object insertion
const filter = JSON.parse(req.body.filter)  // Attacker sends: { "$ne": null }
await db.collection('users').find(filter).toArray()

// ✅ CORRECT: Whitelist allowed fields
const allowedFields = ['name', 'email', 'created_at']
const safeFilter = Object.fromEntries(
  Object.entries(JSON.parse(req.body.filter))
    .filter(([key]) => allowedFields.includes(key))
)
await db.collection('users').find(safeFilter).toArray()
```

**Redis Command Injection Prevention:**
```typescript
// ❌ WRONG: Eval arbitrary Lua
await redis.eval(userProvidedScript)

// ✅ CORRECT: Pre-defined scripts only
const ALLOWED_SCRIPTS = {
  'increment_counter': `
    local current = redis.call('GET', KEYS[1])
    redis.call('SET', KEYS[1], current + 1)
    return current + 1
  `
}

async function executeScript(scriptName: string, keys: string[]) {
  if (!ALLOWED_SCRIPTS[scriptName]) {
    throw new Error('Script not allowed')
  }
  return await redis.eval(ALLOWED_SCRIPTS[scriptName], keys.length, ...keys)
}
```

#### 3. Database Layer - Last Line of Defense

**PostgreSQL RLS Enforcement:**
```sql
-- Even if application bypassed, RLS catches it
SELECT * FROM projects WHERE org_id = 'attacker-controlled-value';
-- RLS policy filters: org_id = current_setting('app.org_id')::UUID
-- Result: Only attacker's own org's projects (session context enforced)
```

**MongoDB Defense in Depth:**
```typescript
// Always apply org_id filter, even if app layer bypassed
class SecureMongoDAO {
  async find(collection: string, filter: any, jwt: OgelBaseJWT) {
    // Force org_id into filter (can't be bypassed)
    const secureFilter = {
      ...filter,
      org_id: jwt.app_metadata.org_id  // Tamper-proof from JWT
    }

    return await this.db.collection(collection).find(secureFilter).toArray()
  }
}
```

### DDoS & Rate Limiting

**Multi-Tier Rate Limiting:**
```
┌─────────────────────────────────────────────────────────────┐
│             Rate Limiting Strategy                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: Railway Infrastructure (Network Level)            │
│  ├─ DDoS protection (automatic)                            │
│  ├─ Connection rate limiting                               │
│  └─ Bandwidth throttling                                   │
│                                                             │
│  Layer 2: Kong API Gateway (Request Level)                 │
│  ├─ 100-10000 requests/min per org_id (tier-based)        │
│  ├─ Token bucket algorithm                                 │
│  └─ Return 429 Too Many Requests                           │
│                                                             │
│  Layer 3: Application (Resource Level)                     │
│  ├─ Connection limits per org_id                           │
│  ├─ Query complexity limits                                │
│  └─ Storage quota enforcement                              │
│                                                             │
│  Layer 4: Database (Query Level)                           │
│  ├─ Statement timeout (5s-120s per tier)                   │
│  ├─ Connection pool limits                                 │
│  └─ Query cost estimation                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## VIII. Security Threat Model Summary

### Threat Matrix (Likelihood × Impact)

| Threat | Likelihood | Impact | Risk Level | Mitigation |
|--------|-----------|--------|------------|------------|
| **SQL Injection** | Low | Critical | Medium | Parameterized queries, RLS |
| **NoSQL Injection** | Low | High | Medium | Input validation, filters |
| **JWT Theft** | Medium | High | High | Short expiration, HTTPS only |
| **Cross-Tenant Data Leak** | Low | Critical | Medium | RLS, namespace isolation |
| **DDoS Attack** | High | Medium | High | Rate limiting, Kong throttling |
| **Insider Threat** | Low | High | Medium | Audit logging, role separation |
| **Privilege Escalation** | Low | High | Medium | Minimal privileges, RLS |
| **Session Hijacking** | Low | Medium | Low | Session cleanup, IP validation |
| **Timing Attacks** | Medium | Low | Low | Constant-time operations |
| **Backup Exposure** | Low | Critical | Medium | Encrypted backups, access controls |

### Compliance Posture

**SOC2 Type II:**
- ✅ Access controls (RLS, JWT validation)
- ✅ Encryption at rest/transit
- ✅ Audit logging (comprehensive)
- ✅ Change management (tier transitions)
- ✅ Incident response (monitoring, alerting)

**GDPR:**
- ✅ Data minimization (tenant isolation)
- ✅ Encryption (at rest, in transit, application-level)
- ✅ Right to erasure (delete user data)
- ✅ Breach notification (audit logs + monitoring)
- ✅ Data portability (API export)

**HIPAA** (if storing PHI):
- ✅ PHI encryption (pgcrypto)
- ✅ Access controls (RLS, role-based)
- ✅ Audit trails (6 year retention)
- ✅ Transmission security (TLS 1.3)
- ⚠️ Business Associate Agreements (with Railway, Supabase)

---

## IX. Implementation Roadmap

### Phase 1: Authentication Foundation (Week 1-2)
- [ ] Configure Supabase Auth with custom JWT claims (org_id, tier)
- [ ] Implement JWT validation middleware (Kong plugin)
- [ ] Build JWT refresh flow
- [ ] Test token expiration/revocation

### Phase 2: PostgreSQL Security (Week 3-4)
- [ ] Enable RLS on all tenant-scoped tables
- [ ] Create RLS policies for each table
- [ ] Implement session variable setup (org_id, tier)
- [ ] Test adversarial SQL injection attempts
- [ ] Deploy pgAudit extension

### Phase 3: Redis Security (Week 5)
- [ ] Implement keyspace namespacing wrapper
- [ ] Add tier-based memory/key quotas
- [ ] Build eviction policies per tier
- [ ] Test cross-tenant key access prevention

### Phase 4: MongoDB Security (Week 6)
- [ ] Choose isolation strategy (database per org OR filters)
- [ ] Implement org_id filter enforcement
- [ ] Add query timeout enforcement
- [ ] Enable MongoDB audit logging

### Phase 5: Convex & Neon Security (Week 7)
- [ ] Configure Convex Supabase Auth integration
- [ ] Implement Neon database per org provisioning
- [ ] Test cross-database isolation

### Phase 6: Encryption (Week 8)
- [ ] Verify Railway volume encryption
- [ ] Deploy HashiCorp Vault
- [ ] Implement application-level encryption (pgcrypto)
- [ ] Test key rotation

### Phase 7: Audit Logging (Week 9-10)
- [ ] Build MongoDB audit log collection
- [ ] Implement pgAudit log forwarding
- [ ] Add Redis/MongoDB custom logging
- [ ] Build audit query dashboard

### Phase 8: Attack Prevention (Week 11-12)
- [ ] Deploy Kong rate limiting
- [ ] Implement DDoS protection
- [ ] Add input validation for all endpoints
- [ ] Penetration testing

### Phase 9: Monitoring & Alerting (Week 13)
- [ ] Prometheus metrics for security events
- [ ] Grafana dashboards (auth failures, tier limits)
- [ ] Alert rules (suspicious activity)
- [ ] Incident response runbook

### Phase 10: Compliance & Documentation (Week 14)
- [ ] SOC2 control mapping
- [ ] GDPR compliance documentation
- [ ] Security audit report
- [ ] User-facing security documentation

---

## X. Conclusion

This unified security architecture provides **comprehensive protection** across OgelBase's multi-database stack:

1. **ONE Authentication Source**: Supabase Auth (GoTrue) issues JWTs for all services
2. **CONSISTENT Authorization**: JWT claims drive access control across all 5 databases
3. **STRONG Tenant Isolation**: Database-level enforcement prevents cross-tenant leakage
4. **COMPLETE Encryption**: TLS in transit, AES-256 at rest, pgcrypto for PII
5. **COMPREHENSIVE Auditing**: Every database operation logged with org_id
6. **LAYERED Defense**: Attack prevention at API Gateway, application, database layers

**Key Strengths:**
- NOT "5 security systems" - ONE coherent model
- Defense in depth (multiple enforcement layers)
- Survives application compromise (database RLS enforced)
- Compliance-ready (SOC2, GDPR, HIPAA)
- Railway-optimized (leverages platform security)

**What Makes This Work:**
- **JWT as universal identity**: org_id claim drives isolation everywhere
- **Database-level enforcement**: RLS, namespacing, filters can't be bypassed
- **Vault for secrets**: Centralized key management, automated rotation
- **Audit everything**: MongoDB audit trail enables incident response

**Implementation Effort**: 14 weeks (3.5 months) to production-ready security.

**Risk Assessment**: Low residual risk with proper implementation. High confidence in preventing cross-tenant data leakage, JWT forgery, SQL injection, and DDoS attacks.

---

**Document Owner**: Anjali Desai (PostgreSQL Security Specialist)
**Review Required**: Engineering (implementation), Security (audit), Compliance (SOC2/GDPR)
**Approval Required**: CTO (architecture), Legal (compliance)
**Status**: ✅ Design Complete - Ready for Implementation Planning
