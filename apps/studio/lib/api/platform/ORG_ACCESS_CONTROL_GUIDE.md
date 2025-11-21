# Organization Access Control - Developer Guide

## Quick Start

### Securing an Organization Endpoint

```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import { verifyOrgAccess, requireRole } from 'lib/api/platform/org-access-control'

// 1. Enable authentication
export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

// 2. Update handler signature
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Your endpoint logic
}

// 3. Add access control to each method handler
async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query

  // Verify user has access to this organization
  const membership = await verifyOrgAccess(slug as string, req.user!, res)
  if (!membership) {
    return // Response already sent by verifyOrgAccess
  }

  // membership contains: { role, user_id, org_id, org_name, org_slug }

  // Your logic here...
}
```

### Adding Role Requirements

For sensitive operations, add role checks:

```typescript
async function handleDelete(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query

  // Verify access
  const membership = await verifyOrgAccess(slug as string, req.user!, res)
  if (!membership) return

  // Require admin role or higher
  if (!requireRole(membership, 'admin', res)) {
    return // Response already sent by requireRole
  }

  // Admin-only logic here...
}
```

## API Reference

### `verifyOrgAccess(slug, user, res)`

Verifies user is a member of the organization.

**Parameters:**
- `slug: string` - Organization slug from URL
- `user: UserContext` - User from `req.user`
- `res: NextApiResponse` - Response object

**Returns:**
- `OrganizationMembership | null`
- `null` if access denied (response already sent)

**Membership Object:**
```typescript
{
  role: 'owner' | 'admin' | 'developer' | 'read_only',
  user_id: string,
  org_id: string,
  org_name: string,
  org_slug: string
}
```

**Response Codes Sent:**
- `403` - User is not a member
- `404` - Organization doesn't exist
- `500` - Database error

---

### `requireRole(membership, requiredRole, res)`

Checks if user has minimum required role.

**Parameters:**
- `membership: OrganizationMembership` - From `verifyOrgAccess`
- `requiredRole: 'owner' | 'admin' | 'developer' | 'read_only'`
- `res: NextApiResponse` - Response object

**Returns:**
- `boolean` - `true` if user has sufficient role
- `false` if insufficient (response already sent)

**Response Code Sent:**
- `403` - Insufficient permissions

---

### `hasMinimumRole(userRole, requiredRole)`

Utility to check role hierarchy without sending response.

**Parameters:**
- `userRole: string` - User's role
- `requiredRole: string` - Required minimum role

**Returns:**
- `boolean` - `true` if user meets requirement

## Role Hierarchy

```
owner: 4       Full control
admin: 3       Manage members, billing
developer: 2   Create projects
read_only: 1   View only
```

## Common Patterns

### Read-Only Endpoint (Any Member)

```typescript
async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query

  const membership = await verifyOrgAccess(slug as string, req.user!, res)
  if (!membership) return

  // Any member can read
  const data = await queryOrgData(membership.org_id)
  return res.json(data)
}
```

### Admin-Only Endpoint

```typescript
async function handlePost(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query

  const membership = await verifyOrgAccess(slug as string, req.user!, res)
  if (!membership) return

  if (!requireRole(membership, 'admin', res)) return

  // Admin+ can perform action
  await doAdminAction(membership.org_id)
  return res.json({ success: true })
}
```

### Owner-Only Endpoint

```typescript
async function handleDelete(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query

  const membership = await verifyOrgAccess(slug as string, req.user!, res)
  if (!membership) return

  if (!requireRole(membership, 'owner', res)) return

  // Only owners can delete
  await doOwnerAction(membership.org_id)
  return res.json({ success: true })
}
```

### Custom Role Logic

```typescript
async function handleUpdate(req: AuthenticatedRequest, res: NextApiResponse) {
  const { slug } = req.query

  const membership = await verifyOrgAccess(slug as string, req.user!, res)
  if (!membership) return

  // Custom logic: developers can edit their own, admins can edit all
  const targetUserId = req.body.user_id

  if (targetUserId !== membership.user_id) {
    if (!requireRole(membership, 'admin', res)) return
  }

  // Proceed with update
}
```

## Best Practices

### 1. Always Check Access First

```typescript
// ✅ GOOD
const membership = await verifyOrgAccess(slug, req.user!, res)
if (!membership) return
// ... business logic

// ❌ BAD - business logic before access check
const data = await fetchData()
const membership = await verifyOrgAccess(slug, req.user!, res)
```

### 2. Use Membership Data

```typescript
// ✅ GOOD - Use org_id from membership
const projects = await queryProjects(membership.org_id)

// ❌ BAD - Redundant org lookup
const org = await getOrgBySlug(slug)
const projects = await queryProjects(org.id)
```

### 3. Handle Early Returns

```typescript
// ✅ GOOD
const membership = await verifyOrgAccess(slug, req.user!, res)
if (!membership) return // Response already sent

// ❌ BAD - Double response
const membership = await verifyOrgAccess(slug, req.user!, res)
if (!membership) {
  return res.status(403).json({ error: 'Access denied' })
}
```

### 4. Log Sensitive Operations

```typescript
// ✅ GOOD - Log important actions
console.log(`User ${req.user!.userId} deleted project in org ${slug}`)
await deleteProject(projectId)

// Consider structured logging
logger.audit({
  action: 'project.delete',
  userId: req.user!.userId,
  orgId: membership.org_id,
  projectId
})
```

### 5. Type Safety

```typescript
// ✅ GOOD - Use AuthenticatedRequest type
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // req.user is guaranteed to exist
  const userId = req.user!.userId
}

// ❌ BAD - Might be undefined
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = req.user?.userId // TypeScript error
}
```

## Error Handling

### Standard Error Responses

```typescript
// 400 - Bad Request
return res.status(400).json({
  error: 'Invalid input',
  message: 'Organization slug is required'
})

// 403 - Forbidden (from verifyOrgAccess)
return res.status(403).json({
  error: 'Access denied',
  message: 'You do not have access to this organization'
})

// 403 - Forbidden (from requireRole)
return res.status(403).json({
  error: 'Insufficient permissions',
  message: 'This action requires admin role or higher'
})

// 404 - Not Found
return res.status(404).json({
  error: 'Not found',
  message: 'Organization not found'
})

// 500 - Server Error
return res.status(500).json({
  error: 'Internal server error',
  message: 'Failed to process request'
})
```

## Testing

### Unit Tests

```typescript
import { hasMinimumRole } from 'lib/api/platform/org-access-control'

describe('hasMinimumRole', () => {
  it('owner has all permissions', () => {
    expect(hasMinimumRole('owner', 'admin')).toBe(true)
    expect(hasMinimumRole('owner', 'developer')).toBe(true)
  })

  it('admin cannot access owner-only features', () => {
    expect(hasMinimumRole('admin', 'owner')).toBe(false)
  })
})
```

### Integration Tests

```typescript
describe('GET /api/platform/organizations/:slug', () => {
  it('allows members to view org', async () => {
    const res = await request(app)
      .get('/api/platform/organizations/test-org')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.slug).toBe('test-org')
  })

  it('denies non-members', async () => {
    const res = await request(app)
      .get('/api/platform/organizations/test-org')
      .set('Authorization', `Bearer ${otherUserToken}`)

    expect(res.status).toBe(403)
  })
})
```

## Migration Guide

### Updating Existing Endpoints

1. Add authentication:
```typescript
// Before
export default (req, res) => apiWrapper(req, res, handler)

// After
export default (req, res) => apiWrapper(req, res, handler, { withAuth: true })
```

2. Update handler signature:
```typescript
// Before
async function handler(req: NextApiRequest, res: NextApiResponse)

// After
async function handler(req: AuthenticatedRequest, res: NextApiResponse)
```

3. Add access control:
```typescript
// Add at start of each method handler
const membership = await verifyOrgAccess(slug as string, req.user!, res)
if (!membership) return

// Add role checks if needed
if (!requireRole(membership, 'admin', res)) return
```

4. Update queries to use membership:
```typescript
// Before
const org = await getOrgBySlug(slug)
const data = await fetchData(org.id)

// After
const data = await fetchData(membership.org_id)
```

## FAQ

**Q: What if I need different permissions for GET vs POST?**

A: Check permissions in each method handler separately:

```typescript
async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) return
  // Any member can GET
}

async function handlePost(req: AuthenticatedRequest, res: NextApiResponse) {
  const membership = await verifyOrgAccess(slug, req.user!, res)
  if (!membership) return
  if (!requireRole(membership, 'admin', res)) return
  // Only admin+ can POST
}
```

**Q: Should I return 403 or 404 for non-existent orgs?**

A: `verifyOrgAccess` handles this automatically:
- Returns 404 if org doesn't exist
- Returns 403 if org exists but user isn't a member
- This prevents information leakage

**Q: How do I handle service accounts or API keys?**

A: Service accounts should be treated as users with appropriate org memberships. Create a user record for the service account and add it to organizations with appropriate roles.

**Q: Can I cache membership checks?**

A: Not recommended. Membership and roles can change frequently. The query is fast (<5ms) and properly indexed. Cache at the HTTP level instead.

**Q: What about webhook endpoints?**

A: Webhooks should use a different authentication mechanism (e.g., signing secrets) and may not need org-level access control.

## Support

For questions or issues:
1. Check this guide and test plan
2. Review example implementations in secured endpoints
3. Contact the backend team

---

**Last Updated**: 2025-01-21
**Maintained By**: Backend Team
