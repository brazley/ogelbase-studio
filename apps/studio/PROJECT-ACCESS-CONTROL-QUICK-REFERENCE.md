# Project Access Control - Quick Reference

## For Developers: How to Secure New Endpoints

### Step 1: Import the Helper

```typescript
import {
  authenticateAndVerifyProjectAccess,
  getClientIp,
  getUserAgent,
  logAuditEvent,
} from 'lib/api/platform/project-access'
```

### Step 2: Add Access Check to Handler

#### For Read Operations (Any Member Can Access)

```typescript
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (any member can view)
  const result = await authenticateAndVerifyProjectAccess(req, res)
  if (!result) return // Response already sent (401/403/404)

  const { user, access } = result
  const project = access.project

  // Your endpoint logic here
  // Use project.id for database queries, not req.query.ref
}
```

#### For Write Operations (Admin/Owner Required)

```typescript
const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (admin or owner can update)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'admin')
  if (!result) return // Response already sent

  const { user, access } = result

  // Your update logic here

  // Log the change
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'your.action.name',
    changes: { /* what changed */ },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res.status(200).json(result)
}
```

#### For Delete Operations (Owner Only)

```typescript
const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  // Authenticate and verify access (only owner can delete)
  const result = await authenticateAndVerifyProjectAccess(req, res, 'owner')
  if (!result) return // Response already sent

  const { user, access } = result

  // Your delete logic here

  // Log the deletion
  await logAuditEvent({
    userId: user.userId,
    entityType: 'project',
    entityId: access.project.id,
    action: 'delete',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  })

  return res.status(200).json({ message: 'Deleted successfully' })
}
```

## Role Hierarchy

```
member  (level 1) - Read-only access
  ↓
admin   (level 2) - Can modify configurations
  ↓
owner   (level 3) - Full control including deletion
```

## Access Inheritance

Users have access to a project if:
1. They are a **direct project member** (via `project_members` table)
2. They are an **organization member** (via `organization_members` table)

If user has both, the **higher role** takes precedence.

## Common Patterns

### Pattern 1: View-Only Endpoint
```typescript
// Any member can view
const result = await authenticateAndVerifyProjectAccess(req, res)
```

### Pattern 2: Admin Actions
```typescript
// Only admins and owners can perform this action
const result = await authenticateAndVerifyProjectAccess(req, res, 'admin')
```

### Pattern 3: Owner-Only Actions
```typescript
// Only the owner can do this
const result = await authenticateAndVerifyProjectAccess(req, res, 'owner')
```

### Pattern 4: Custom Role Check
```typescript
const result = await authenticateAndVerifyProjectAccess(req, res)
if (!result) return

// Custom logic based on role
if (access.role === 'owner') {
  // Owner-specific logic
} else if (access.role === 'admin') {
  // Admin-specific logic
} else {
  // Member-only logic
}
```

## Audit Logging Best Practices

### What to Log

**Always log**:
- Create operations
- Update operations
- Delete operations
- Permission changes
- Configuration changes
- Add-on modifications

**Action naming convention**:
- `entity.action` format (e.g., `project.update`, `addon.add`, `compute.update`)
- Use past tense for completed actions
- Be specific: `disk.resize` not just `update`

### What to Include in Changes

```typescript
changes: {
  // For updates - include what changed
  before: { name: 'Old Name' },
  after: { name: 'New Name' },

  // For creates - include initial values
  created: { addon_type: 'pitr', addon_variant: 'pitr_7' },

  // For deletes - include what was deleted
  deleted: { addon_type: 'compute_instance' },
}
```

### Example: Complete Audit Log Entry

```typescript
await logAuditEvent({
  userId: user.userId,
  entityType: 'project', // project, organization, user, addon, billing
  entityId: access.project.id,
  action: 'compute.update',
  changes: {
    before: { instance_size: 'micro' },
    after: { instance_size: 'small' },
    metadata: { triggered_by: 'api' }
  },
  ipAddress: getClientIp(req),
  userAgent: getUserAgent(req),
})
```

## Database Queries

### Always Use Project ID

**❌ Bad** (allows SQL injection if ref is not sanitized):
```typescript
query: `SELECT * FROM table WHERE project_id = (SELECT id FROM projects WHERE ref = $1)`,
parameters: [req.query.ref]
```

**✅ Good** (use project ID from access check):
```typescript
query: `SELECT * FROM table WHERE project_id = $1`,
parameters: [access.project.id]
```

## Error Responses

The helper automatically sends appropriate errors:

- **401 Unauthorized**: Missing or invalid auth token
- **403 Forbidden**: User doesn't have access or insufficient role
- **404 Not Found**: Project doesn't exist
- **400 Bad Request**: You need to send this for invalid parameters

## Testing Your Endpoint

### 1. Test Without Auth
```bash
curl http://localhost:3000/api/platform/projects/test-ref/your-endpoint
# Should return 401
```

### 2. Test With Non-Member
```bash
curl -H "Authorization: Bearer $NON_MEMBER_TOKEN" \
  http://localhost:3000/api/platform/projects/test-ref/your-endpoint
# Should return 403
```

### 3. Test With Member (Read-Only)
```bash
curl -H "Authorization: Bearer $MEMBER_TOKEN" \
  http://localhost:3000/api/platform/projects/test-ref/your-endpoint
# Should return 200 for GET, 403 for POST/DELETE
```

### 4. Test With Admin
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"field":"value"}' \
  http://localhost:3000/api/platform/projects/test-ref/your-endpoint
# Should return 200
```

## Advanced: Manual Access Check

If you need more control than the middleware provides:

```typescript
import { verifyProjectAccess, hasMinimumRole } from 'lib/api/platform/project-access'

const access = await verifyProjectAccess(projectRef, userId)

if (!access) {
  return res.status(403).json({ error: 'Access denied' })
}

// Check specific role
if (!hasMinimumRole(access.role, 'admin')) {
  return res.status(403).json({ error: 'Admin access required' })
}

// Use the access info
console.log(`User has ${access.role} access via ${access.accessType}`)
```

## Viewing Audit Logs

```sql
-- Recent actions by user
SELECT * FROM platform.audit_logs
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 50;

-- All actions on a project
SELECT
  al.*,
  u.email,
  u.username
FROM platform.audit_logs al
JOIN platform.users u ON al.user_id = u.id
WHERE al.entity_type = 'project'
  AND al.entity_id = 'project-uuid'
ORDER BY al.created_at DESC;

-- Actions by type
SELECT action, COUNT(*) as count
FROM platform.audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY action
ORDER BY count DESC;
```

## Performance Tips

1. **Always use indexes**: The access check query is optimized with proper indexes
2. **Cache user context**: The user context from `apiAuthenticate` can be reused
3. **Batch audit logs**: For bulk operations, consider batching audit logs
4. **Use project.id**: Always query by project.id, never by ref in WHERE clauses

## Common Mistakes to Avoid

❌ **Don't query by ref**:
```typescript
WHERE ref = $1  // Requires subquery or extra lookup
```

✅ **Do query by ID**:
```typescript
WHERE id = $1  // Direct index lookup
```

---

❌ **Don't forget audit logging**:
```typescript
// Update something important
// ... but forgot to log it!
```

✅ **Do log critical actions**:
```typescript
// Update something important
await logAuditEvent({ ... })
```

---

❌ **Don't expose sensitive data**:
```typescript
return { database_password: project.database_password }
```

✅ **Do sanitize responses**:
```typescript
return {
  database_host: project.database_host,
  // Never include passwords or secrets
}
```

---

❌ **Don't check access after operations**:
```typescript
await deleteProject(id)
const access = await verifyProjectAccess(ref, userId) // Too late!
```

✅ **Do check access first**:
```typescript
const access = await verifyProjectAccess(ref, userId)
if (!access) return res.status(403).json(...)
await deleteProject(access.project.id)
```

## Questions?

See the full implementation docs:
- `/apps/studio/TICKET-10-PROJECT-ACCESS-CONTROL-COMPLETE.md`
- `/apps/studio/lib/api/platform/project-access.ts`

Run tests:
```bash
node test-project-access-control.js
```
