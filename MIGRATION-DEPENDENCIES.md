# Migration 006 Dependencies & Execution Graph

**Visual representation of migration dependencies and execution order**

---

## Dependency Tree

```
EXISTING MIGRATIONS (REQUIRED FOUNDATION)
═════════════════════════════════════════

001_create_platform_schema.sql
    ├─ Creates: platform schema
    ├─ Creates: platform.projects table
    ├─ Creates: platform.organizations table
    ├─ Creates: platform.update_updated_at_column() function
    └─ Status: ✅ MUST BE APPLIED

002_platform_billing_schema.sql
    ├─ Creates: platform.subscriptions
    ├─ Creates: platform.invoices
    ├─ Creates: platform.payment_methods
    ├─ Creates: platform.billing_plans
    └─ Status: ✅ MUST BE APPLIED

003_user_management_and_permissions.sql
    ├─ Creates: pgcrypto extension ← CRITICAL FOR 006
    ├─ Creates: platform.users
    ├─ Creates: platform.user_sessions
    ├─ Creates: platform.api_keys
    └─ Status: ✅ MUST BE APPLIED

004_create_lancio_org.sql
    ├─ Creates: Lancio organization
    ├─ Creates: Lancio Studio project ← REQUIRED FOR STEP 3
    └─ Status: ✅ MUST BE APPLIED

005_create_audit_logs.sql
    ├─ Creates: platform.audit_logs
    └─ Status: ✅ MUST BE APPLIED
```

---

## Migration 006 Execution Graph

```
MIGRATION 006 COMPONENTS (SEQUENTIAL EXECUTION)
═══════════════════════════════════════════════

┌────────────────────────────────────────────────────────────────┐
│ STEP 1: 006_add_platform_databases_table.sql                  │
├────────────────────────────────────────────────────────────────┤
│ Requires:                                                      │
│   ✓ platform schema (from 001)                                │
│   ✓ platform.projects table (from 001)                        │
│   ✓ pgcrypto extension (from 003)                             │
│   ✓ platform.update_updated_at_column() (from 001)            │
│                                                                │
│ Creates:                                                       │
│   • platform.databases table                                  │
│   • 8 indexes                                                 │
│   • 4 functions (encrypt, decrypt, get, update_health)       │
│   • 2 views (safe, with_connection_strings)                  │
│   • 2 triggers (encryption, updated_at)                       │
│                                                                │
│ Duration: ~2 seconds                                          │
│ Risk: LOW                                                     │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ Depends on platform.databases
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 2: 006_enable_rls_with_permissive_policies.sql           │
├────────────────────────────────────────────────────────────────┤
│ Requires:                                                      │
│   ✓ All platform tables (from 001-005)                        │
│   ✓ PostgreSQL 9.5+ (for RLS support)                         │
│                                                                │
│ Creates:                                                       │
│   • RLS enabled on 24+ tables                                │
│   • 24+ permissive policies (USING true, WITH CHECK true)    │
│   • 2 verification functions                                  │
│                                                                │
│ Impact: ZERO BEHAVIOR CHANGE (permissive policies)            │
│ Duration: ~3 seconds                                          │
│ Risk: LOW                                                     │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ Can run independently OR
                              │ Depends on databases table if registering DBs
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ STEP 3: 006_register_railway_databases.sql                    │
├────────────────────────────────────────────────────────────────┤
│ Requires:                                                      │
│   ✓ platform.databases table (from Step 1)                    │
│   ✓ Lancio project exists (from 004)                          │
│   ✓ Railway Redis service deployed                            │
│   ✓ Railway MongoDB service deployed (optional)               │
│                                                                │
│ Creates:                                                       │
│   • MongoDB database record (with placeholder credentials)    │
│   • Redis database record (with placeholder credentials)      │
│                                                                │
│ Post-Migration Action Required:                               │
│   ⚠️  Update connection strings with actual Railway values    │
│                                                                │
│ Duration: ~1 second                                           │
│ Risk: LOW (uses placeholders, safe to fail)                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Parallel vs Sequential Execution

### CAN Run in Parallel? NO

**Why Sequential Execution is Required**:

```
Step 1 (databases table) ─────► Step 3 (registration)
                                     │
                                     └─ DEPENDS ON: platform.databases table

Step 2 (RLS policies) ─────────────► Independent of Step 1 & 3
                                     BUT recommended to run after Step 1
                                     to ensure all objects exist
```

**Recommended Order**:
1. Step 1 first (creates foundation)
2. Step 2 second (enables RLS on all tables including databases)
3. Step 3 last (populates databases table)

---

## Database Objects Created

### Tables

```
platform.databases
    ├─ Columns: 19 total
    │   ├─ id (UUID PK)
    │   ├─ project_id (UUID FK → platform.projects)
    │   ├─ name, type, host, port, database
    │   ├─ username, password (plaintext, consider removing)
    │   ├─ connection_string (plaintext)
    │   ├─ connection_string_encrypted (BYTEA) ← Encrypted via trigger
    │   ├─ ssl_enabled (BOOLEAN)
    │   ├─ config (JSONB)
    │   ├─ metadata (JSONB)
    │   ├─ status, health_check_status, last_health_check_at
    │   ├─ health_check_error
    │   └─ created_at, updated_at
    └─ Constraints:
        ├─ CHECK: type IN ('mongodb', 'redis', 'postgresql')
        ├─ CHECK: status IN ('active', 'inactive', 'error', 'maintenance')
        ├─ CHECK: health_check_status IN ('healthy', 'unhealthy', 'unknown')
        ├─ CHECK: port > 0 AND port < 65536
        ├─ FK: project_id → platform.projects(id) ON DELETE CASCADE
        └─ NOT NULL: name, host, port, connection_string
```

---

### Indexes (8 total)

```
idx_databases_project_id          → (project_id)
idx_databases_type                → (type)
idx_databases_status              → (status)
idx_databases_project_type_status → (project_id, type, status) -- Composite
idx_databases_health_check        → (health_check_status, last_health_check_at) WHERE health_check_status IS NOT NULL
idx_databases_created_at          → (created_at DESC)
idx_databases_updated_at          → (updated_at DESC)
```

**Query Optimization**:
- Project databases lookup: Use `idx_databases_project_id`
- Filter by type: Use `idx_databases_type`
- Health monitoring: Use `idx_databases_health_check`
- Composite queries: Use `idx_databases_project_type_status`

---

### Functions (6 total)

**From Step 1 (databases table)**:
```sql
platform.encrypt_database_connection_string()
    └─ Trigger function: Auto-encrypts on INSERT/UPDATE

platform.decrypt_database_connection_string(database_id UUID) → TEXT
    └─ Returns: Decrypted connection string
    └─ Security: SECURITY DEFINER (runs as table owner)

platform.get_project_databases(project_id UUID, type TEXT) → TABLE
    └─ Returns: All active databases for a project (optionally filtered by type)
    └─ Excludes: status = 'inactive'

platform.update_database_health(database_id UUID, status TEXT, error TEXT) → BOOLEAN
    └─ Updates: health_check_status, last_health_check_at, health_check_error
    └─ Returns: TRUE if row found and updated
```

**From Step 2 (RLS)**:
```sql
platform.verify_rls_enabled() → TABLE
    └─ Returns: table_name, rls_enabled, policy_count for all platform tables

platform.test_rls_policies() → TABLE
    └─ Runs: 5 basic tests to verify RLS is working correctly
    └─ Returns: test_name, test_result, description
```

---

### Views (2 total)

```sql
platform.databases_with_connection_strings
    ├─ Includes: Decrypted connection strings via decrypt_database_connection_string()
    ├─ Security: RESTRICTED - Only for service role
    └─ Use Case: Backend services that need actual connection strings

platform.databases_safe
    ├─ Excludes: All sensitive credentials (password, username, connection_string)
    ├─ Includes: Masked connection string for display (e.g., "redis://host:port")
    ├─ Security: PUBLIC - Safe for API responses
    └─ Use Case: Frontend UI, API responses
```

---

### Triggers (2 on databases table)

```sql
update_databases_updated_at
    ├─ Event: BEFORE UPDATE
    ├─ Function: platform.update_updated_at_column()
    └─ Purpose: Auto-update updated_at timestamp

encrypt_database_connection_string_trigger
    ├─ Event: BEFORE INSERT OR UPDATE
    ├─ Function: platform.encrypt_database_connection_string()
    └─ Purpose: Auto-encrypt connection_string → connection_string_encrypted
```

---

### RLS Policies (24+ policies)

**From Step 2 (permissive policies)**:

All policies follow this pattern:
```sql
CREATE POLICY "permissive_all_<table_name>"
ON platform.<table_name>
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (true)         -- Allow all SELECTs
WITH CHECK (true);   -- Allow all INSERTs/UPDATEs/DELETEs
```

**Tables with RLS enabled**:
- organizations
- organization_members
- organization_invitations
- organization_feature_flags
- projects
- project_members
- project_addons
- project_metrics
- subscriptions
- invoices
- payment_methods
- tax_ids
- customer_profiles
- credits
- disk_config
- compute_config
- addons
- usage_metrics
- users
- user_sessions
- api_keys
- audit_logs
- feature_flags
- billing_plans
- credentials

**Future (Migration 007)**: These will be replaced with restrictive organization-based policies

---

## Dependency Violations & Error Scenarios

### Error: "relation platform.databases does not exist"

**Cause**: Step 3 run before Step 1
**Solution**: Run Step 1 first

```bash
psql $DATABASE_URL -f 006_add_platform_databases_table.sql
psql $DATABASE_URL -f 006_register_railway_databases.sql
```

---

### Error: "extension pgcrypto does not exist"

**Cause**: Migration 003 not applied
**Solution**: Apply migrations 001-005 in order

```bash
psql $DATABASE_URL -f 001_create_platform_schema.sql
psql $DATABASE_URL -f 002_platform_billing_schema.sql
psql $DATABASE_URL -f 003_user_management_and_permissions.sql
psql $DATABASE_URL -f 004_create_lancio_org.sql
psql $DATABASE_URL -f 005_create_audit_logs.sql
```

---

### Error: "Lancio project not found"

**Cause**: Migration 004 not applied
**Solution**: Apply migration 004

```bash
psql $DATABASE_URL -f 004_create_lancio_org.sql
```

---

### Error: "table platform.projects does not exist"

**Cause**: Migration 001 not applied
**Solution**: Apply migration 001

```bash
psql $DATABASE_URL -f 001_create_platform_schema.sql
```

---

### Warning: "Railway MongoDB not found"

**Cause**: Railway MongoDB service not deployed
**Impact**: Registration skipped (safe)
**Solution**: Deploy MongoDB on Railway, then manually register:

```sql
INSERT INTO platform.databases (
  project_id, name, type, connection_string,
  host, port, database, ssl_enabled, status
) VALUES (
  '<lancio-project-id>',
  'Railway MongoDB',
  'mongodb',
  '<actual-mongodb-url>',
  'mongodb.railway.internal',
  27017,
  'lancio',
  false,
  'active'
);
```

---

## Testing Dependencies

### Unit Test Order

```
1. Test databases table creation
   └─ Verify: Table exists, indexes exist, functions exist

2. Test encryption/decryption
   └─ Verify: Insert row, check encrypted column populated, decrypt successfully

3. Test RLS policies
   └─ Verify: Policies exist, queries still work (no 403 errors)

4. Test database registration
   └─ Verify: MongoDB and Redis records created
```

---

### Integration Test Order

```
1. Full migration sequence (1 → 2 → 3)
   └─ Verify: No errors, all objects created

2. Application endpoint tests
   └─ Verify: All APIs return 200 OK (not 403)

3. Performance baseline
   └─ Verify: Query times within 10% of baseline
```

---

## Version Compatibility Matrix

| Component | Minimum Version | Recommended | Notes |
|-----------|----------------|-------------|-------|
| PostgreSQL | 9.5 | 12+ | RLS support introduced in 9.5 |
| pgcrypto | 1.0 | Latest | Included with PostgreSQL |
| Railway | N/A | Latest | For Redis/MongoDB deployment |
| Studio App | N/A | Latest | Must support multi-database |

---

## Migration State Diagram

```
[Pre-Migration State]
        │
        ├─ platform schema exists ✓
        ├─ projects table exists ✓
        ├─ pgcrypto installed ✓
        └─ RLS disabled on all tables
        │
        ▼
   [Step 1: Run 006_add_platform_databases_table.sql]
        │
        ├─ platform.databases table created ✓
        ├─ Encryption functions created ✓
        ├─ Views created ✓
        └─ RLS still disabled
        │
        ▼
   [Step 2: Run 006_enable_rls_with_permissive_policies.sql]
        │
        ├─ RLS enabled on 24+ tables ✓
        ├─ Permissive policies created ✓
        └─ Zero behavior change (policies allow all)
        │
        ▼
   [Step 3: Run 006_register_railway_databases.sql]
        │
        ├─ MongoDB registered (placeholder creds) ✓
        ├─ Redis registered (placeholder creds) ✓
        └─ Ready for actual connection string update
        │
        ▼
[Post-Migration State: READY FOR REDIS INTEGRATION]
        │
        ├─ Multi-database support enabled ✓
        ├─ Connection encryption enabled ✓
        ├─ RLS foundation established ✓
        └─ Next: Update connection strings, implement Redis client
```

---

## Critical Path Analysis

**Blocking Dependencies** (must complete before migration):
1. Backup database ← CRITICAL
2. Verify migrations 001-005 applied ← CRITICAL
3. Verify pgcrypto extension installed ← CRITICAL
4. Verify Lancio project exists ← REQUIRED FOR STEP 3

**Non-Blocking Dependencies** (can fix after migration):
1. Actual Railway connection strings ← Can update post-migration
2. Redis client implementation ← Separate task
3. MongoDB client implementation ← Separate task
4. Health check automation ← Future enhancement

**Bottleneck**: None (total execution ~6 seconds)

**Single Point of Failure**: Database connection stability
**Mitigation**: Pre-test connection, have rollback ready

---

## Execution Checklist (Dependency-Aware)

**Phase 1: Verify Prerequisites**
- [ ] Database backup created
- [ ] Migration 001 applied (platform schema exists)
- [ ] Migration 002 applied (billing schema exists)
- [ ] Migration 003 applied (pgcrypto exists)
- [ ] Migration 004 applied (Lancio project exists)
- [ ] Migration 005 applied (audit_logs exists)

**Phase 2: Execute in Order**
- [ ] Step 1: 006_add_platform_databases_table.sql
- [ ] Verify: `SELECT COUNT(*) FROM platform.databases;` returns 0
- [ ] Step 2: 006_enable_rls_with_permissive_policies.sql
- [ ] Verify: `SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'platform';` returns 24+
- [ ] Step 3: 006_register_railway_databases.sql
- [ ] Verify: `SELECT COUNT(*) FROM platform.databases;` returns 2+

**Phase 3: Post-Migration**
- [ ] Update connection strings with actual Railway values
- [ ] Test application endpoints
- [ ] Monitor for errors

---

**For detailed execution steps, see**: `MIGRATION-QUICK-START.md`
**For complete migration plan, see**: `DATABASE-MIGRATION-MASTER-PLAN.md`
