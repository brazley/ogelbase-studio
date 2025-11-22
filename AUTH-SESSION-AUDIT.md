# Authentication & Session Architecture Audit

**Audit Lead**: Nadia Ivanova (Auth Systems Architect)
**Coordination**: Yasmin Al-Rashid (Redis), Elif Demir (Connection Pooling)
**Date**: 2025-11-22
**Status**: Discovery Complete - NO FIXES APPLIED

---

## Executive Summary

The authentication and session management system has a **critical gap**: tenant context (organization/project) is validated at the API layer but **never propagated to the database layer** where RLS policies need it. Session management is well-architected with Redis caching, but the multi-tenant security model breaks because RLS policies have no access to tenant context.

### Critical Finding

**SEVERITY: HIGH** - RLS policies cannot enforce tenant isolation because session context is not set in the database.

The system validates that users have access to organizations/projects during API authentication, but this context **disappears** before database queries execute. Migration 007's RLS policies expect `app.current_user_id` and `app.current_org_id` session variables, but these are **never set** in the current architecture.

---

## 1. Authentication Flow Architecture

### 1.1 Sign-Up Flow
**Location**: `/apps/studio/pages/api/auth/signup.ts`

```
User Registration Request
    ↓
Email/Password Validation (Zod schema)
    ↓
Password Hashing (bcrypt)
    ↓
Insert into platform.users
    ↓
Generate Session Token (crypto.randomBytes)
    ↓
Hash Token (SHA-256)
    ↓
Store in platform.user_sessions
    ↓
Return { token, user, expires_at }
```

**Token Storage**:
- Client receives unhashed token
- Database stores SHA-256 hash
- 7-day expiration (default)
- IP address and user agent tracked

**Security Notes**:
- Rate limiting implemented (5 attempts per 15 min per IP)
- No email verification flow detected
- Password complexity not enforced at API level
- Account ban/deletion checks in place

### 1.2 Sign-In Flow
**Location**: `/apps/studio/pages/api/auth/signin.ts`

```
User Login Request
    ↓
Email/Password Validation
    ↓
Rate Limit Check (signin:{ip})
    ↓
Query platform.users by email
    ↓
Check deleted_at, banned_until
    ↓
Verify Password (bcrypt compare)
    ↓
Generate Session Token
    ↓
Create platform.user_sessions record
    ↓
Update last_sign_in_at
    ↓
Clear rate limit on success
    ↓
Return { token, user, expires_at }
```

**Security Mechanisms**:
- ✅ Password hashing (bcrypt)
- ✅ Rate limiting (5 attempts/15 min)
- ✅ Account ban enforcement
- ✅ Soft delete detection
- ✅ Session token hashing (SHA-256)
- ✅ IP/User agent tracking
- ⚠️ No MFA support
- ⚠️ No passwordless flows (magic links, WebAuthn)

### 1.3 Session Validation Flow
**Location**: `/apps/studio/lib/api/apiAuthenticate.ts`

```
API Request with Bearer Token
    ↓
Extract Authorization header
    ↓
Hash token (SHA-256)
    ↓
Query platform.user_sessions + users JOIN
    ↓
Check expires_at > NOW()
    ↓
Check user.deleted_at IS NULL
    ↓
Check user.banned_until IS NULL
    ↓
Update last_activity_at (async)
    ↓
Return UserContext {
  userId, email, firstName, lastName,
  username, sessionId
}
```

**Session Structure**:
```typescript
interface UserContext {
  userId: string        // Platform user ID
  email: string         // User email
  firstName: string | null
  lastName: string | null
  username: string | null
  sessionId: string     // Current session ID
}
```

**⚠️ MISSING**: No organization ID, no project context, no tenant information

---

## 2. Redis Session Caching Layer

### 2.1 Architecture
**Location**: `/apps/studio/lib/api/auth/session-cache.ts`

```
Session Validation Request
    ↓
Check Redis Cache (HGETALL session:{token_prefix})
    ┌─────────┴─────────┐
    │                   │
Cache HIT           Cache MISS
    │                   │
    ├─ Verify token     ├─ Query Postgres
    ├─ Check expiry     ├─ Validate session
    ├─ Return (< 5ms)   ├─ Store in Redis
    │                   └─ Return (10-50ms)
    │
Return SessionWithUser
```

### 2.2 Cache Configuration
```typescript
{
  sessionTTL: 5 * 60,              // 5 minutes
  keyPrefix: 'session:',
  enabled: !!process.env.REDIS_URL
}
```

**Cache Key Structure**: `session:{first_16_chars_of_token}`

**Cached Session Data** (Hash structure):
```typescript
{
  id: session.id,
  userId: session.userId,
  token: session.token,           // Full hash for verification
  expiresAt: session.expiresAt,
  lastActivityAt: session.lastActivityAt,
  ipAddress: session.ipAddress || '',
  userAgent: session.userAgent || '',
  createdAt: session.createdAt,
  email: session.email,
  firstName: session.firstName || '',
  lastName: session.lastName || '',
  username: session.username || ''
}
```

**⚠️ MISSING IN CACHE**: Organization context, project context, team memberships

### 2.3 Cache Metrics & Performance
**Metrics Tracked**:
- Cache hits/misses
- Hit rate percentage
- Errors
- Invalidations

**Target Performance**: < 5ms validation (cache hit)

**Invalidation Strategy**:
- Explicit: On logout (single session)
- Explicit: On revoke all sessions (user scan)
- Automatic: TTL expiration (5 minutes)
- ⚠️ NO invalidation on: role changes, org membership changes, project access revocation

**Connection Pool**:
```typescript
{
  tier: Tier.PRO,
  minPoolSize: 2,
  maxPoolSize: 10,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 10000
}
```

### 2.4 Redis Client Architecture
**Location**: `/apps/studio/lib/api/platform/redis.ts`

**Circuit Breaker Configuration** (Redis-specific):
```typescript
{
  timeout: 1000,                    // 1 second
  errorThresholdPercentage: 70,     // More tolerant than DB
  resetTimeout: 15000,              // 15 seconds
  volumeThreshold: 10
}
```

**Fallback Strategy**: If Redis fails, **always** fall back to direct Postgres query

---

## 3. Multi-Tenant Context Flow (THE GAP)

### 3.1 Current API-Level Authorization
**Location**: `/apps/studio/lib/api/platform/project-access.ts`

```
API Request to /api/platform/projects/{ref}/*
    ↓
authenticateAndVerifyProjectAccess(req, res)
    ↓
1. Authenticate user (apiAuthenticate)
   └─ Return UserContext { userId, email, ... }
    ↓
2. Verify project access (verifyProjectAccess)
   └─ Query JOIN projects + project_members + org_members
   └─ Check role hierarchy (member < admin < owner)
   └─ Return ProjectAccess {
        project: { id, org_id, ref, ... },
        role: 'admin',
        accessType: 'via_org' | 'direct'
      }
    ↓
3. Execute API logic with access context
    ↓
4. Query platform database
    ↓
⚠️ TENANT CONTEXT LOST HERE ⚠️
    ↓
Database executes query WITHOUT session variables
```

### 3.2 The Context Propagation Gap

**What Happens**:
1. User authenticates → `UserContext` has `userId` only
2. API validates project access → `ProjectAccess` has `project.organization_id`
3. API executes database query → **Context not set in session**
4. RLS policy checks `app.current_org_id` → **NULL**
5. RLS policy fails or returns no rows

**Where Context Should Be Set** (Migration 007 expectation):
```sql
-- Before ANY query in a request
SELECT platform.set_user_context(
  '123e4567-e89b-12d3-a456-426614174000'::uuid,  -- user_id
  '987fcdeb-51a2-43c8-b9e5-123456789abc'::uuid   -- org_id
);

-- Then queries execute with RLS context
SELECT * FROM platform.organizations;  -- RLS sees app.current_org_id
```

**Where Context Is Actually Set**: **NOWHERE**

### 3.3 RLS Policy Requirements (Migration 007)
**Location**: `/apps/studio/database/migrations/007_restrictive_rls_policies.sql`

**Session Variables Expected**:
- `app.current_user_id` (UUID) - Set by `platform.set_user_context()`
- `app.current_org_id` (UUID) - Set by `platform.set_user_context()`
- `app.is_system_user` (boolean) - Set by `platform.set_system_user()`

**Example RLS Policy** (organizations table):
```sql
CREATE POLICY "Users can view their organizations"
ON platform.organizations FOR SELECT
USING (
  id = platform.get_current_org_id()
  OR
  EXISTS (
    SELECT 1 FROM platform.organization_members
    WHERE organization_id = organizations.id
    AND user_id = platform.get_current_user_id()
  )
);
```

**Policy Behavior Without Session Context**:
- `platform.get_current_org_id()` returns NULL
- `platform.get_current_user_id()` returns NULL
- User check in EXISTS clause fails
- **Result**: Row-level security blocks ALL access (even legitimate)

### 3.4 Session Helper Functions Available
**Location**: `/apps/studio/database/migrations/007_session_helpers.sql`

**Context Setters**:
```sql
platform.set_user_context(user_id UUID, org_id UUID)  -- Set both
platform.set_user_id(user_id UUID)                    -- User only
platform.set_org_id(org_id UUID)                      -- Org only
platform.set_system_user()                            -- Admin context
```

**Context Getters**:
```sql
platform.get_current_user_id() → UUID
platform.get_current_org_id() → UUID
platform.is_system_user() → BOOLEAN
```

**Context Clearers**:
```sql
platform.clear_user_context()  -- On logout
```

**⚠️ CRITICAL**: These functions exist but are **NEVER CALLED** in the application code

---

## 4. Database Connection & Pooling Integration

### 4.1 Platform Database Access
**Location**: `/apps/studio/lib/api/platform/database.ts`

```typescript
export async function queryPlatformDatabase<T>({
  query,
  parameters,
  headers
}: PlatformQueryOptions): Promise<WrappedResult<T[]>> {
  const connectionStringEncrypted = encryptString(DATABASE_URL)

  // Execute via pg-meta service
  const response = await fetch(`${PG_META_URL}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-connection-encrypted': connectionStringEncrypted
    },
    body: JSON.stringify({ query, parameters })
  })

  return response.json()
}
```

**Connection Flow**:
```
Next.js API Route
    ↓
queryPlatformDatabase({ query, parameters })
    ↓
Encrypt DATABASE_URL
    ↓
POST to pg-meta service
    ↓
pg-meta decrypts connection string
    ↓
pg-meta executes query via connection pool
    ↓
Return results to API
```

**⚠️ MISSING**: No mechanism to pass session context to pg-meta service

### 4.2 Connection Manager Architecture
**Location**: `/apps/studio/lib/api/platform/connection-manager.ts`

**Tier-Based Pooling**:
```typescript
{
  FREE: { minPoolSize: 2, maxPoolSize: 5, maxConcurrent: 20 },
  STARTER: { minPoolSize: 5, maxPoolSize: 10, maxConcurrent: 50 },
  PRO: { minPoolSize: 10, maxPoolSize: 50, maxConcurrent: 200 },
  ENTERPRISE: { minPoolSize: 20, maxPoolSize: 100, maxConcurrent: 500 }
}
```

**Circuit Breaker Protection** (Postgres):
```typescript
{
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10
}
```

**Connection Lifecycle**:
```
Request → Acquire Connection → Execute Query → Release Connection
                ↓                     ↓
        Circuit Breaker        Update Metrics
                ↓                     ↓
        Health Check          Track Duration
```

**⚠️ SESSION CONTEXT ISSUE**: Connection pooling means **same physical connection** may serve different users/organizations. Session variables MUST be set per-transaction, not per-connection.

### 4.3 Proper Session Context Pattern (REQUIRED)

**PostgreSQL Session Variable Behavior**:
- Session variables are **connection-scoped** by default
- Connection pools **reuse connections** across requests
- **Risk**: User A's context bleeds into User B's request

**Safe Pattern** (transaction-local):
```sql
BEGIN;
  -- Set context for THIS TRANSACTION ONLY
  SET LOCAL app.current_user_id = '...';
  SET LOCAL app.current_org_id = '...';

  -- Execute queries
  SELECT * FROM platform.organizations;

COMMIT;
-- Context automatically cleared after commit
```

**Current Implementation**: ❌ No transaction wrapping, no session variables set

---

## 5. Audit Logs & Authorization Tracking

### 5.1 Audit Log Structure
**Location**: `/apps/studio/lib/api/platform/project-access.ts`

```typescript
interface AuditLogEntry {
  userId: string
  entityType: 'project' | 'organization' | 'user'
  entityId: string
  action: string                  // 'create', 'update', 'delete', 'view'
  changes?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}
```

**Audit Events Logged**:
- ✅ Project updates (name, status changes)
- ✅ Project deletion
- ⚠️ NO: Organization operations
- ⚠️ NO: User role changes
- ⚠️ NO: Session creation/invalidation
- ⚠️ NO: Failed authorization attempts

**Storage**: `platform.audit_logs` table

**Retention Policy**: Not defined (potential compliance issue)

### 5.2 Authorization Model

**Role Hierarchy**:
```typescript
{
  member: 1,    // Read access
  admin: 2,     // Read + write
  owner: 3      // Full control + delete
}
```

**Access Types**:
1. **Direct**: User explicitly added to project (`platform.project_members`)
2. **Via Org**: User is org member, inherits project access (`platform.organization_members`)

**Permission Check Pattern**:
```typescript
verifyProjectAccess(projectRef, userId, minimumRole)
  ↓
Query projects
  LEFT JOIN project_members (direct access)
  LEFT JOIN organization_members (org access)
  WHERE (pm.user_id = userId OR om.user_id = userId)
  ↓
Check role >= minimumRole
  ↓
Return ProjectAccess or NULL
```

**⚠️ ISSUE**: Authorization checked at API layer, but **not enforced** at database layer via RLS

---

## 6. Critical Gaps & Security Concerns

### 6.1 Tenant Context Propagation Gap

**SEVERITY: HIGH**

**Problem**: Multi-tenant context (organization, project) validated at API layer but **never reaches database layer** where RLS policies need it.

**Impact**:
- RLS policies cannot enforce tenant isolation
- Queries may return incorrect data or no data
- Potential for data leakage if RLS policies misconfigured
- Migration 007 restrictive policies **will break** API functionality

**Attack Surface**:
- Direct database access bypasses API authorization
- SQL injection could access any tenant's data
- Compromised API token grants full database access

**Mitigation Required**:
1. Set session variables before EVERY database query
2. Wrap queries in transactions with `SET LOCAL`
3. Clear session variables after query completion
4. Add connection context verification

### 6.2 Session Cache Invalidation Gaps

**SEVERITY: MEDIUM**

**Problem**: Redis session cache not invalidated when authorization context changes

**Scenarios**:
1. User removed from organization → Cache still valid for 5 minutes
2. User role downgraded admin→member → Cache retains old role
3. Project access revoked → Cache allows access for 5 minutes
4. User account banned → Cache allows access until TTL

**Impact**: Up to 5 minutes of unauthorized access after permission revocation

**Mitigation Required**:
1. Invalidate cache on org membership changes
2. Invalidate cache on role changes
3. Include role/org context in cache key
4. Reduce TTL for high-security operations

### 6.3 Missing Multi-Factor Authentication

**SEVERITY: MEDIUM**

**Problem**: No MFA support despite enterprise users storing sensitive database credentials

**Current State**:
- `platform.users.mfa_enabled` column exists but unused
- No MFA enrollment flow
- No TOTP/SMS/WebAuthn integration
- No backup codes

**Compliance Risk**: SOC 2, HIPAA, PCI-DSS often require MFA for admin access

### 6.4 Insufficient Audit Logging

**SEVERITY: MEDIUM**

**Missing Events**:
- Failed authentication attempts (needed for intrusion detection)
- Session creation (login events)
- Session revocation (logout/timeout events)
- Authorization failures (403 errors)
- Privilege escalation attempts
- Org membership changes
- Role changes

**Compliance Gap**: Cannot demonstrate "who did what when" for security incidents

### 6.5 Connection Pool Session Variable Contamination Risk

**SEVERITY: MEDIUM**

**Problem**: Session variables set at connection level can bleed between requests in pooled connections

**Example Attack**:
```
Request 1: User A sets app.current_org_id = 'org-123'
    ↓
Connection returned to pool WITHOUT clearing variables
    ↓
Request 2: User B acquires same connection
    ↓
User B queries inherit User A's org context
    ↓
SECURITY VIOLATION: User B sees User A's data
```

**Mitigation**: Use `SET LOCAL` (transaction-scoped) instead of `SET` (connection-scoped)

---

## 7. Architecture Flow Diagrams

### 7.1 Current Authentication Flow
```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /api/auth/signin
       │ { email, password }
       ↓
┌─────────────────────────────────────────┐
│  Next.js API Route                      │
│  /apps/studio/pages/api/auth/signin.ts │
└──────┬──────────────────────────────────┘
       │
       ├─ Validate credentials
       ├─ Check rate limit
       ├─ Query platform.users
       ├─ Verify password (bcrypt)
       ├─ Generate token (crypto)
       ├─ Hash token (SHA-256)
       └─ Insert platform.user_sessions
       │
       ↓
┌─────────────────────────┐
│  Return to Client       │
│  { token, user, exp }   │
└─────────────────────────┘
```

### 7.2 Current Session Validation Flow
```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ GET /api/platform/projects/{ref}
       │ Authorization: Bearer {token}
       ↓
┌─────────────────────────────────────────┐
│  authenticateAndVerifyProjectAccess     │
└──────┬──────────────────────────────────┘
       │
       ├─ 1. apiAuthenticate(req, res)
       │    ├─ Extract Bearer token
       │    ├─ Hash token (SHA-256)
       │    ├─ Query user_sessions + users
       │    └─ Return UserContext { userId, email }
       │
       ├─ 2. verifyProjectAccess(ref, userId)
       │    ├─ Query projects + members + org_members
       │    ├─ Check role hierarchy
       │    └─ Return ProjectAccess { project, role, accessType }
       │
       └─ 3. Execute API logic
            ↓
       ┌────────────────────────────────┐
       │  queryPlatformDatabase(query)  │
       └────────┬───────────────────────┘
                │
                ↓
       ⚠️ TENANT CONTEXT LOST HERE ⚠️
                │
                ↓
       ┌────────────────────────────────┐
       │  Postgres Connection Pool      │
       │  (NO session variables set)    │
       └────────┬───────────────────────┘
                │
                ↓
       ┌────────────────────────────────┐
       │  RLS Policies Execute          │
       │  get_current_user_id() = NULL  │
       │  get_current_org_id() = NULL   │
       │  ❌ Access Denied or Data Leak │
       └────────────────────────────────┘
```

### 7.3 Required Session Context Flow
```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ GET /api/platform/projects/{ref}
       │ Authorization: Bearer {token}
       ↓
┌─────────────────────────────────────────┐
│  authenticateAndVerifyProjectAccess     │
└──────┬──────────────────────────────────┘
       │
       ├─ 1. apiAuthenticate → UserContext { userId }
       ├─ 2. verifyProjectAccess → ProjectAccess { project.organization_id }
       │
       └─ 3. Execute API logic with context
            ↓
       ┌────────────────────────────────────────────┐
       │  queryPlatformDatabaseWithContext(         │
       │    query,                                  │
       │    { userId, orgId }  ← NEW PARAMETER     │
       │  )                                         │
       └────────┬───────────────────────────────────┘
                │
                ↓
       ┌────────────────────────────────┐
       │  BEGIN TRANSACTION             │
       │  SET LOCAL app.current_user_id │
       │  SET LOCAL app.current_org_id  │
       └────────┬───────────────────────┘
                │
                ↓
       ┌────────────────────────────────┐
       │  Execute Query                 │
       └────────┬───────────────────────┘
                │
                ↓
       ┌────────────────────────────────┐
       │  RLS Policies Execute          │
       │  get_current_user_id() = UUID  │
       │  get_current_org_id() = UUID   │
       │  ✅ Tenant Isolation Enforced  │
       └────────┬───────────────────────┘
                │
                ↓
       ┌────────────────────────────────┐
       │  COMMIT                        │
       │  (Session vars auto-cleared)   │
       └────────────────────────────────┘
```

---

## 8. Redis Integration Analysis

### 8.1 Session Cache Implementation Quality

**Strengths**:
- ✅ Proper cache-aside pattern (lazy load)
- ✅ Cache hit/miss metrics tracking
- ✅ Automatic Postgres fallback on Redis failure
- ✅ Connection pooling with health checks
- ✅ Circuit breaker protection
- ✅ TTL-based expiration

**Weaknesses**:
- ⚠️ No cache warming on login
- ⚠️ No pre-fetch for likely accessed sessions
- ⚠️ User-level invalidation requires full scan (expensive)
- ⚠️ No cache versioning (schema changes require manual flush)

### 8.2 Redis Circuit Breaker Tuning

**Current Configuration**:
```typescript
{
  timeout: 1000,                    // Very aggressive (1 sec)
  errorThresholdPercentage: 70,     // More tolerant than DB
  resetTimeout: 15000,              // Fast recovery
  volumeThreshold: 10               // Reasonable sample size
}
```

**Analysis**:
- **Good**: 1-second timeout prevents cache from blocking requests
- **Good**: 70% threshold acknowledges cache is non-critical
- **Good**: 15-second recovery allows quick Redis restart
- **Risk**: If Redis flaps, circuit may oscillate (open/close/open)

**Recommendation**: Monitor circuit state transitions, add exponential backoff on repeated failures

### 8.3 Connection Pool Health

**Current Pool**:
```typescript
{
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 10000,
  testOnBorrow: true
}
```

**Health Indicators to Monitor**:
- Pool exhaustion (pending requests > 0)
- Acquisition timeouts (connection pressure)
- Failed health checks (Redis instability)
- Connection churn (create/destroy rate)

**Baseline Metrics Needed**:
- Target: < 5ms cache hit latency
- Target: > 80% cache hit rate
- Alert: Acquisition timeout > 1000ms
- Alert: Circuit breaker open

---

## 9. Coordination Questions for Other Teams

### 9.1 For Database Squad (Asha Patel)

**Q1**: Are Migration 007 RLS policies already deployed to production?
- If YES: How is the system currently working without session context?
- If NO: Can we delay deployment until context propagation is implemented?

**Q2**: What is the expected behavior when RLS policies block access?
- Should API return 403 Forbidden?
- Should API return empty result set (200 with [])?
- Should API return 500 Internal Server Error?

**Q3**: Are there any tables that should **bypass** RLS for system operations?
- Audit logs (need to log even on permission failures)
- Health checks
- Metrics collection

**Q4**: Do we need different session context for read vs. write operations?
- Read-only queries might need broader access
- Write operations need stricter isolation

### 9.2 For Backend Squad (Jordan Kim)

**Q5**: Should session context be embedded in JWT claims instead of database session variables?
- Pro: Stateless, no database lookup needed
- Con: Cannot revoke until JWT expires
- Con: Larger token size

**Q6**: How should API handle session context for background jobs?
- Scheduled tasks (cron)
- Async workers (queue processors)
- Database migrations
- → Should these use `platform.set_system_user()`?

**Q7**: What is the API's error handling strategy for RLS violations?
- Return generic "Access Denied"?
- Log detailed error but return sanitized message?
- Include troubleshooting hints?

### 9.3 For Architecture Squad (Sydney Chen)

**Q8**: Should we implement a middleware layer for automatic context propagation?
- NextJS middleware to extract context from auth
- Database wrapper to inject SET LOCAL commands
- Connection manager to enforce context requirements

**Q9**: How should we handle multi-project operations?
- User managing multiple projects in single request
- Bulk operations across organizations
- Admin viewing all projects

**Q10**: What's the long-term auth architecture vision?
- Migrate to OAuth 2.0/OIDC?
- Keep custom session system?
- Integrate with external IdP (Auth0, Okta)?

---

## 10. Recommendations for Fixes (DO NOT IMPLEMENT YET)

### 10.1 Immediate Priorities (P0 - Critical)

**1. Implement Session Context Propagation**
- Add `context` parameter to `queryPlatformDatabase()`
- Wrap queries in transactions with `SET LOCAL` variables
- Test with Migration 007 RLS policies
- **Blockers**: Requires coordination with Database and Backend squads

**2. Fix Cache Invalidation on Authorization Changes**
- Invalidate session cache when user removed from org
- Invalidate when role changes
- Invalidate when project access revoked
- **Dependency**: Requires org/project membership change hooks

**3. Add Connection Pool Session Variable Clearing**
- Ensure `SET LOCAL` used (not `SET`)
- Add connection reset hooks
- Add context verification middleware
- **Dependency**: Requires connection manager updates

### 10.2 High Priority (P1 - Security)

**4. Implement Comprehensive Audit Logging**
- Log all authentication events (success + failure)
- Log authorization failures
- Log session creation/revocation
- Log context changes
- **Dependency**: Need log retention and SIEM integration plan

**5. Add MFA Support**
- TOTP (Google Authenticator, Authy)
- SMS backup (optional, less secure)
- WebAuthn (hardware keys) for high-value accounts
- Backup codes for recovery
- **Dependency**: Requires frontend MFA enrollment flow

### 10.3 Medium Priority (P2 - Robustness)

**6. Improve Session Token Security**
- Implement refresh token rotation
- Add token binding (device fingerprint)
- Add geographic anomaly detection
- Implement concurrent session limits
- **Dependency**: Requires frontend token refresh handling

**7. Add Passwordless Authentication**
- Magic link email flow
- WebAuthn for modern browsers
- Fallback to password for legacy clients
- **Dependency**: Requires email delivery infrastructure

**8. Enhance Cache Performance**
- Cache warm-up on login
- Predictive pre-fetching
- Smarter invalidation (pattern-based)
- Cache compression for large sessions
- **Dependency**: Requires Redis Cluster for HA

---

## 11. Questions for Multi-Tenant Architecture

### 11.1 Organization Hierarchy Clarification

**Current Structure** (inferred from code):
```
User
  ├─ organization_members → Organization
  │    └─ projects → Project
  └─ project_members → Project (direct access)
```

**Questions**:
- Can a user be in multiple organizations? (YES - assumed from queries)
- Can a project belong to multiple organizations? (NO - assumed from schema)
- Can a user have different roles in different projects within same org?
- Is there a concept of "default organization" per user?

### 11.2 Session Context Scope

**Which context should be set for each request?**

**Scenario 1**: User listing all their organizations
```sql
-- Need user context only, org context is irrelevant
SET LOCAL app.current_user_id = '{user_id}';
-- Don't set app.current_org_id
```

**Scenario 2**: User accessing specific project
```sql
-- Need both user and org context
SET LOCAL app.current_user_id = '{user_id}';
SET LOCAL app.current_org_id = '{org_id}';  -- From project.organization_id
```

**Scenario 3**: Admin operation (migrations, cleanup)
```sql
-- Need system context
SELECT platform.set_system_user();
```

**Decision needed**: How to determine which context to set for each endpoint?

### 11.3 Cross-Tenant Operations

**Scenarios needing cross-org access**:
- User switching between organizations (change org context mid-session?)
- Platform admins viewing all data
- Billing operations (aggregate across orgs)
- Usage metrics (cross-org analytics)

**Questions**:
- Should we support switching org context without re-authentication?
- How to represent "no org context" vs "system context" vs "specific org context"?
- Should session tokens be org-scoped or user-scoped?

---

## 12. Integration Touchpoints

### 12.1 Upstream Dependencies (Blocking Fix Implementation)

**Database Schema** (Asha Patel):
- Migration 007 RLS policies deployment status
- Session helper functions availability
- Audit log table structure
- Any schema changes needed for context storage

**Connection Manager** (Elif Demir):
- Transaction wrapping support
- Session variable injection points
- Connection lifecycle hooks
- Pool health monitoring

**Redis Cache** (Yasmin Al-Rashid):
- Cache invalidation event hooks
- Org/project context in cache keys
- Invalidation pattern matching
- Cache versioning strategy

### 12.2 Downstream Impact (Will Be Affected by Fixes)

**All API Endpoints** (`/apps/studio/pages/api/platform/**/*.ts`):
- Need to pass context to database queries
- Need to handle RLS permission errors
- Need to determine appropriate context scope
- Need consistent error handling

**Frontend Authentication** (`/apps/studio/lib/auth.tsx`):
- May need to refresh tokens when switching orgs
- May need to handle context-specific errors
- May need to display MFA prompts
- May need to show session management UI

**Monitoring & Metrics**:
- New metrics for context propagation failures
- RLS policy violation tracking
- Session context performance impact
- Authorization cache effectiveness

---

## 13. Testing Requirements (Before Any Fix)

### 13.1 Session Context Propagation Tests

**Test Cases Needed**:
1. User with org access can read org's projects (RLS allows)
2. User without org access cannot read org's projects (RLS blocks)
3. User context persists across multiple queries in same request
4. User context does NOT persist across different requests (isolation)
5. Connection pool does NOT leak context between users
6. System user can bypass RLS for admin operations
7. Org context switch works mid-session
8. Invalid context (non-existent org) handled gracefully

### 13.2 Cache Invalidation Tests

**Test Cases Needed**:
1. User removed from org → Cache invalidated immediately
2. User role downgraded → Cache reflects new role
3. Project access revoked → Cache invalidated
4. Org deleted → All member caches invalidated
5. User account banned → Session cache invalidated
6. Session expired → Cache miss triggers re-auth
7. Redis failure → Postgres fallback works correctly

### 13.3 Security Tests

**Attack Scenarios**:
1. **Context Injection**: Attacker sets malicious org_id in request
   - Expected: API validates context before setting session vars
2. **Token Reuse**: Attacker reuses valid token after logout
   - Expected: Token blacklisted, cache invalidated
3. **Privilege Escalation**: Member token used to access admin endpoint
   - Expected: Role check fails at API layer
4. **Cross-Tenant Access**: User A token used to access Org B data
   - Expected: RLS blocks query, returns no rows
5. **Session Fixation**: Attacker pre-sets session variables
   - Expected: Transaction-local vars prevent contamination

---

## 14. Appendix: Code References

### 14.1 Authentication & Session Files
```
/apps/studio/pages/api/auth/
├── signup.ts                          # User registration
├── signin.ts                          # User login
├── signout.ts                         # Session termination
├── refresh.ts                         # Token refresh
├── validate.ts                        # Session validation endpoint
└── cleanup-sessions.ts                # Expired session cleanup cron

/apps/studio/lib/api/auth/
├── session.ts                         # Session CRUD operations
├── session-cache.ts                   # Redis caching layer
├── types.ts                           # Type definitions
└── utils.ts                           # Token hashing, rate limiting

/apps/studio/lib/
├── auth.tsx                           # Frontend auth context
└── api/
    ├── apiAuthenticate.ts             # Server-side auth middleware
    └── platform/
        ├── project-access.ts          # Multi-tenant authorization
        ├── database.ts                # Platform DB query wrapper
        ├── redis.ts                   # Redis client wrapper
        └── connection-manager.ts      # DB connection pooling
```

### 14.2 Database Migration Files
```
/apps/studio/database/migrations/
├── 006_add_platform_databases_table.sql      # Platform schema setup
├── 007_restrictive_rls_policies.sql          # RLS enforcement (CRITICAL)
├── 007_session_helpers.sql                   # Session context functions
└── 007_rollback.sql                          # RLS rollback script
```

### 14.3 Multi-Tenant Tables (Inferred)
```sql
platform.users                   -- User accounts
platform.user_sessions           -- Active sessions (token hashes)
platform.organizations           -- Tenant orgs
platform.organization_members    -- Org membership + roles
platform.projects                -- Projects (belong to orgs)
platform.project_members         -- Direct project access
platform.audit_logs              -- Audit trail
platform.credentials             -- Project API keys
```

---

## 15. Summary & Next Actions

### 15.1 Critical Findings Summary

**🔴 HIGH SEVERITY**:
1. **Tenant context never propagated to database layer** → RLS policies cannot enforce isolation
2. **Connection pool may leak session variables** → Potential cross-user data exposure
3. **Cache not invalidated on authorization changes** → Up to 5 min unauthorized access

**🟠 MEDIUM SEVERITY**:
4. **No MFA support** → Account takeover risk for privileged users
5. **Insufficient audit logging** → Cannot detect or investigate security incidents
6. **No refresh token rotation** → Compromised tokens valid until expiration

**🟡 LOW SEVERITY**:
7. **No passwordless auth** → User friction, password fatigue
8. **No geographic anomaly detection** → Missed account takeover signals

### 15.2 Architecture Strengths

**✅ Well-Implemented**:
- Session token hashing (SHA-256)
- Password security (bcrypt)
- Rate limiting (credential stuffing protection)
- Redis caching with circuit breaker
- Connection pooling with health monitoring
- Graceful Redis fallback to Postgres

**✅ Good Practices Observed**:
- Separation of concerns (auth vs. authorization)
- Async activity timestamp updates
- IP/User agent tracking
- Soft deletes (user accounts)
- Role hierarchy model

### 15.3 Immediate Next Steps

**For Architecture Squad Lead**:
1. Schedule coordination meeting with Database, Backend, and Redis specialists
2. Present this audit to technical leadership
3. Get approval for context propagation implementation approach
4. Define rollout strategy (feature flags, canary deployment)

**Questions to Answer Before Implementation**:
1. Is Migration 007 already deployed? (blocking question)
2. What's the expected API behavior for RLS violations?
3. Should we use JWT claims or database session variables for context?
4. How should background jobs set their context?
5. Do we need middleware for automatic context injection?

**Required Coordination**:
- **Asha** (Database): RLS policy deployment status, test environment setup
- **Jordan** (Backend): API error handling strategy, endpoint inventory
- **Yasmin** (Redis): Cache invalidation hooks, performance benchmarks
- **Elif** (Connection Pooling): Transaction wrapping, context injection points
- **Sydney** (Architecture): Long-term auth vision, middleware approach

---

**End of Audit**

This document represents the **discovery phase only**. No fixes have been applied. Implementation requires careful coordination across Database, Backend, Connection Pooling, and Redis teams to ensure multi-tenant security and data integrity.

**Document Maintainer**: Nadia Ivanova
**Review Status**: Pending architecture squad review
**Next Review Date**: TBD after coordination meeting
