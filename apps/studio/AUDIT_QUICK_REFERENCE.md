# Audit Logging - Quick Reference

## 🎯 Core Files

```
/apps/studio/lib/api/platform/audit.ts          - Helper functions
/apps/studio/pages/api/platform/audit/logs.ts   - Query API
/apps/studio/database/migrations/005_*.sql      - Database schema
/apps/studio/test-audit-logging.js              - Test suite
```

## 🔥 Quick Start

### Log an Action (TypeScript)

```typescript
import { logAuditEventFromRequest } from 'lib/api/platform/audit'

// Simple create action
await logAuditEventFromRequest(req, {
  userId: req.user!.userId,
  entityType: 'project',
  entityId: project.id,
  action: 'create',
  changes: { name: 'My Project' },
})

// Update with before/after
import { createChangeLog } from 'lib/api/platform/audit'
const changes = createChangeLog(
  { name: 'Old', plan: 'free' },
  { name: 'New', plan: 'pro' }
)
await logAuditEventFromRequest(req, {
  userId: req.user!.userId,
  entityType: 'organization',
  entityId: orgId,
  action: 'update',
  changes,
})
```

### Query Logs (REST API)

```bash
# All logs
curl "http://localhost:8082/api/platform/audit/logs" \
  -H "Authorization: Bearer $TOKEN"

# Project logs only
curl "http://localhost:8082/api/platform/audit/logs?entity_type=project" \
  -H "Authorization: Bearer $TOKEN"

# Last 24 hours
START=$(date -u -v-1d +%Y-%m-%dT%H:%M:%SZ)
curl "http://localhost:8082/api/platform/audit/logs?start_date=$START" \
  -H "Authorization: Bearer $TOKEN"

# Specific project history
curl "http://localhost:8082/api/platform/audit/logs?entity_type=project&entity_id=abc123" \
  -H "Authorization: Bearer $TOKEN"
```

### Query Logs (SQL)

```sql
-- Recent logs
SELECT * FROM platform.audit_logs
ORDER BY created_at DESC
LIMIT 10;

-- Project actions
SELECT * FROM platform.audit_logs
WHERE entity_type = 'project'
  AND entity_id = 'project-uuid';

-- User activity
SELECT * FROM platform.audit_logs
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;

-- Last 24 hours
SELECT * FROM platform.audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours';
```

## 📋 Entity Types

```typescript
'project'      // Project operations
'organization' // Org operations
'user'         // User operations
'addon'        // Add-on management
'billing'      // Billing changes
```

## 🎬 Common Actions

```typescript
'create'                     // Resource created
'update'                     // Resource updated
'delete'                     // Resource deleted
'member.add'                 // Member added
'member.remove'              // Member removed
'member.role_change'         // Role changed
'compute.update'             // Compute size changed
'disk.update'                // Disk size changed
'addon.add'                  // Add-on enabled
'addon.remove'               // Add-on disabled
'billing.subscription_change' // Plan changed
'billing.payment_method_add' // Payment added
'settings.update'            // Settings changed
```

## 🧪 Testing

```bash
# Run full test suite
export BASE_URL=http://localhost:8082
export TEST_EMAIL=nik@lancio.io
export TEST_PASSWORD=test123
node apps/studio/test-audit-logging.js
```

## 🔧 Database Functions

```sql
-- Log from SQL
SELECT platform.log_audit_event(
  'user-uuid'::UUID,
  'project',
  'project-uuid',
  'update',
  '{"name": "New"}'::JSONB,
  '192.168.1.1'::INET,
  'Mozilla/5.0'
);

-- Clean old logs (90 days)
SELECT platform.clean_old_audit_logs();

-- Clean old logs (30 days)
SELECT platform.clean_old_audit_logs(30);
```

## 📊 Monitoring Queries

```sql
-- Total logs
SELECT COUNT(*) FROM platform.audit_logs;

-- Logs today
SELECT COUNT(*) FROM platform.audit_logs
WHERE created_at > CURRENT_DATE;

-- Top actions
SELECT action, COUNT(*) as count
FROM platform.audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY action
ORDER BY count DESC;

-- Active users
SELECT user_id, COUNT(*) as actions
FROM platform.audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id
ORDER BY actions DESC
LIMIT 10;
```

## 🚀 Integration Checklist

1. **Import helper**:
   ```typescript
   import { logAuditEventFromRequest } from 'lib/api/platform/audit'
   ```

2. **Require auth**:
   ```typescript
   apiWrapper(req, res, handler, { withAuth: true })
   ```

3. **Log action**:
   ```typescript
   await logAuditEventFromRequest(req, {
     userId: req.user!.userId,
     entityType: 'project',
     entityId: id,
     action: 'create',
     changes: { ... },
   })
   ```

4. **Test**:
   ```bash
   node apps/studio/test-audit-logging.js
   ```

## 🎯 Query Parameters

| Parameter | Type | Example |
|-----------|------|---------|
| entity_type | string | `project` |
| entity_id | string | `abc-123` |
| action | string | `create` |
| user_id | string | `user-uuid` |
| start_date | ISO date | `2025-01-01T00:00:00Z` |
| end_date | ISO date | `2025-12-31T23:59:59Z` |
| limit | number | `50` (max 1000) |
| offset | number | `0` |

## 📈 Response Format

```json
{
  "data": [
    {
      "id": "log-uuid",
      "user_id": "user-uuid",
      "entity_type": "project",
      "entity_id": "project-uuid",
      "action": "create",
      "changes": { "name": "My Project" },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

## 🔐 Security

- ✅ Authentication required
- ✅ IP addresses captured
- ✅ User agents logged
- ✅ No sensitive data in changes
- ✅ Insert-only (tamper-proof)
- ✅ 90-day retention (configurable)

## 📚 Full Documentation

See `/apps/studio/AUDIT_LOGGING.md` for complete documentation.
