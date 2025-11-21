# RBAC Integration Guide

This guide shows how to integrate the RBAC permission system into your API endpoints and React components.

## Table of Contents

- [Backend Integration](#backend-integration)
- [Frontend Integration](#frontend-integration)
- [Testing Permissions](#testing-permissions)
- [Common Patterns](#common-patterns)
- [Migration from Old Code](#migration-from-old-code)

---

## Backend Integration

### Using Middleware

The cleanest way to protect endpoints is using the provided middleware:

```typescript
import { requirePermission, requireRole, Permission, Role } from 'lib/api/platform/rbac'

// Protect with specific permission
router.patch('/api/org/:slug',
  requirePermission(Permission.ORG_EDIT),
  async (req, res) => {
    // User is guaranteed to have ORG_EDIT permission here
    await updateOrganization(req.params.slug, req.body)
    res.json({ success: true })
  }
)

// Protect with minimum role
router.delete('/api/org/:slug',
  requireRole(Role.OWNER),
  async (req, res) => {
    // Only owners can reach this code
    await deleteOrganization(req.params.slug)
    res.json({ success: true })
  }
)
```

### Manual Permission Checks

For more complex logic, check permissions manually:

```typescript
import { hasPermission, hasMinimumRole, Permission, Role } from 'lib/api/platform/rbac'

export default async function handler(req, res) {
  const { membership } = req.locals

  // Check specific permission
  if (req.method === 'PATCH') {
    if (!hasPermission(membership.role, Permission.ORG_EDIT)) {
      return res.status(403).json({
        error: 'You do not have permission to edit this organization'
      })
    }
    // Handle update...
  }

  // Check minimum role
  if (req.method === 'DELETE') {
    if (!hasMinimumRole(membership.role, Role.OWNER)) {
      return res.status(403).json({
        error: 'Only owners can delete organizations'
      })
    }
    // Handle deletion...
  }
}
```

### Real-World Examples

#### Organization Endpoints

```typescript
// apps/studio/pages/api/platform/organizations/[slug]/index.ts
import { hasPermission, Permission } from 'lib/api/platform/rbac'

export default async function handler(req, res) {
  const membership = await verifyOrganizationMembership(req, res)
  if (!membership) return

  if (req.method === 'GET') {
    // All roles can view
    if (!hasPermission(membership.role, Permission.ORG_VIEW)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    return res.json(await getOrganization(req.query.slug))
  }

  if (req.method === 'PATCH') {
    // Only admin+ can edit
    if (!hasPermission(membership.role, Permission.ORG_EDIT)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    return res.json(await updateOrganization(req.query.slug, req.body))
  }

  if (req.method === 'DELETE') {
    // Only owners can delete
    if (!hasPermission(membership.role, Permission.ORG_DELETE)) {
      return res.status(403).json({ error: 'Only owners can delete organizations' })
    }
    return res.json(await deleteOrganization(req.query.slug))
  }
}
```

#### Project Endpoints

```typescript
// apps/studio/pages/api/platform/projects/[ref]/compute.ts
import { hasPermission, Permission } from 'lib/api/platform/rbac'

export default async function handler(req, res) {
  const access = await verifyProjectAccess(req, res)
  if (!access) return

  if (req.method === 'GET') {
    if (!hasPermission(access.role, Permission.PROJECT_COMPUTE_VIEW)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    return res.json(await getCompute(req.query.ref))
  }

  if (req.method === 'POST') {
    if (!hasPermission(access.role, Permission.PROJECT_COMPUTE_EDIT)) {
      return res.status(403).json({
        error: 'You need admin role or higher to modify compute instances'
      })
    }
    return res.json(await updateCompute(req.query.ref, req.body))
  }
}
```

#### Member Management

```typescript
// apps/studio/pages/api/platform/organizations/[slug]/members.ts
import { hasPermission, isHigherRole, Permission } from 'lib/api/platform/rbac'

export default async function handler(req, res) {
  const membership = await verifyOrganizationMembership(req, res)
  if (!membership) return

  if (req.method === 'POST') {
    // Check if user can invite members
    if (!hasPermission(membership.role, Permission.MEMBER_INVITE)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Can't invite someone with a higher role than yourself
    const inviteRole = req.body.role
    if (!isHigherRole(membership.role, inviteRole) && membership.role !== inviteRole) {
      return res.status(403).json({
        error: 'You cannot invite members with a role equal to or higher than yours'
      })
    }

    return res.json(await inviteMember(req.query.slug, req.body))
  }

  if (req.method === 'PATCH') {
    if (!hasPermission(membership.role, Permission.MEMBER_EDIT)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    // Additional check: can't change role to higher than yours
    return res.json(await updateMember(req.query.slug, req.body))
  }

  if (req.method === 'DELETE') {
    if (!hasPermission(membership.role, Permission.MEMBER_REMOVE)) {
      return res.status(403).json({ error: 'Only owners can remove members' })
    }
    return res.json(await removeMember(req.query.slug, req.body.memberId))
  }
}
```

---

## Frontend Integration

### Using the Hook

```typescript
import { usePermissions } from 'hooks/usePermissions'

function OrganizationSettings() {
  const { canEditOrg, canDeleteOrg, canManageBilling, role } = usePermissions('admin')

  return (
    <div>
      <h1>Organization Settings</h1>
      <p>Your role: {role}</p>

      {canEditOrg && (
        <Button onClick={handleEdit}>Edit Settings</Button>
      )}

      {canManageBilling && (
        <Button onClick={handleBilling}>Manage Billing</Button>
      )}

      {canDeleteOrg && (
        <div className="danger-zone">
          <Button variant="destructive" onClick={handleDelete}>
            Delete Organization
          </Button>
        </div>
      )}
    </div>
  )
}
```

### Conditional Rendering

```typescript
import { usePermissions } from 'hooks/usePermissions'

function ProjectList() {
  const { canCreateProject, canViewCompute, canEditCompute } = usePermissions('developer')

  return (
    <div>
      {canCreateProject && (
        <Button onClick={handleCreate}>New Project</Button>
      )}

      <ProjectGrid>
        {projects.map(project => (
          <ProjectCard key={project.id}>
            <h3>{project.name}</h3>

            {canViewCompute && (
              <ComputeInfo compute={project.compute} />
            )}

            {canEditCompute && (
              <Button onClick={() => handleEditCompute(project.id)}>
                Edit Compute
              </Button>
            )}
          </ProjectCard>
        ))}
      </ProjectGrid>
    </div>
  )
}
```

### Complex Permission Logic

```typescript
import { usePermissions } from 'hooks/usePermissions'
import { Permission } from 'lib/api/platform/rbac'

function MemberManagement() {
  const {
    hasPermission,
    hasAllPermissions,
    canInviteMembers,
    canEditMembers,
    canRemoveMembers,
    role
  } = usePermissions('admin')

  // Complex permission check
  const canManageAllMembers = hasAllPermissions([
    Permission.MEMBER_INVITE,
    Permission.MEMBER_EDIT,
    Permission.MEMBER_REMOVE,
  ])

  // Custom permission logic
  const canChangeMemberRole = (memberRole: string) => {
    return hasPermission(Permission.MEMBER_EDIT) &&
           hasMinimumRole(role, memberRole)
  }

  return (
    <div>
      {canInviteMembers && (
        <InviteMemberButton />
      )}

      {canManageAllMembers && (
        <p className="text-green-600">Full member management access</p>
      )}

      <MemberList>
        {members.map(member => (
          <MemberCard key={member.id}>
            <p>{member.name} ({member.role})</p>

            {canChangeMemberRole(member.role) && (
              <RoleSelector member={member} />
            )}

            {canRemoveMembers && member.role !== 'owner' && (
              <Button onClick={() => removeMember(member.id)}>
                Remove
              </Button>
            )}
          </MemberCard>
        ))}
      </MemberList>
    </div>
  )
}
```

### Protected Routes

```typescript
import { withPermission, withRole } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'

// Protect a component with permission
const ProtectedSettings = withPermission(
  OrganizationSettings,
  Permission.ORG_EDIT
)

// Protect a component with minimum role
const AdminOnlyPanel = withRole(
  AdminPanel,
  Role.ADMIN
)

// Usage
function App() {
  const userRole = 'admin'

  return (
    <div>
      <ProtectedSettings userRole={userRole} />
      <AdminOnlyPanel userRole={userRole} />
    </div>
  )
}
```

---

## Testing Permissions

### Unit Tests

```typescript
import { hasPermission, Permission, Role } from 'lib/api/platform/rbac'

describe('User Permissions', () => {
  it('should allow admin to edit organization', () => {
    expect(hasPermission(Role.ADMIN, Permission.ORG_EDIT)).toBe(true)
  })

  it('should prevent developer from deleting projects', () => {
    expect(hasPermission(Role.DEVELOPER, Permission.PROJECT_DELETE)).toBe(false)
  })
})
```

### Integration Tests

```typescript
import { requirePermission, Permission } from 'lib/api/platform/rbac'

describe('API Endpoints', () => {
  it('should return 403 when user lacks permission', async () => {
    const req = { user: { role: 'read_only' } }
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()

    const middleware = requirePermission(Permission.ORG_EDIT)
    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
```

---

## Common Patterns

### Pattern 1: Cascading Permissions

```typescript
// Check multiple permission levels
if (hasPermission(role, Permission.ORG_BILLING_MANAGE)) {
  // Full billing access
  return <FullBillingPanel />
} else if (hasPermission(role, Permission.ORG_BILLING_VIEW)) {
  // View-only billing
  return <ReadOnlyBillingPanel />
} else {
  // No billing access
  return <AccessDenied />
}
```

### Pattern 2: Permission-Based Feature Flags

```typescript
const features = {
  canCreateProject: hasPermission(role, Permission.PROJECT_CREATE),
  canManageBilling: hasPermission(role, Permission.ORG_BILLING_MANAGE),
  canInviteMembers: hasPermission(role, Permission.MEMBER_INVITE),
}

return <Dashboard features={features} />
```

### Pattern 3: Dynamic Permission Checks

```typescript
// Check permission based on resource type
function canModifyResource(resourceType: string, role: string): boolean {
  const permissionMap = {
    organization: Permission.ORG_EDIT,
    project: Permission.PROJECT_EDIT,
    member: Permission.MEMBER_EDIT,
  }

  const permission = permissionMap[resourceType]
  return permission ? hasPermission(role, permission) : false
}
```

### Pattern 4: Role-Based UI Variants

```typescript
function Dashboard() {
  const { isOwner, isAdmin, isDeveloper, isReadOnly } = usePermissions()

  if (isOwner) {
    return <OwnerDashboard />
  }

  if (isAdmin) {
    return <AdminDashboard />
  }

  if (isDeveloper) {
    return <DeveloperDashboard />
  }

  return <ReadOnlyDashboard />
}
```

---

## Migration from Old Code

### Before (Manual Role Checks)

```typescript
// ❌ Old way - hardcoded role checks
if (membership.role === 'owner' || membership.role === 'admin') {
  // Allow edit
}
```

### After (Permission-Based)

```typescript
// ✅ New way - permission checks
if (hasPermission(membership.role, Permission.ORG_EDIT)) {
  // Allow edit
}
```

### Migration Checklist

1. **Identify Role Checks**
   ```typescript
   // Find patterns like:
   if (role === 'owner')
   if (role === 'admin' || role === 'owner')
   if (['admin', 'owner'].includes(role))
   ```

2. **Map to Permissions**
   ```typescript
   // Replace with:
   hasPermission(role, Permission.ORG_EDIT)
   hasMinimumRole(role, Role.ADMIN)
   ```

3. **Update Frontend Components**
   ```typescript
   // Before
   const isAdmin = user.role === 'admin'

   // After
   const { canEditOrg } = usePermissions(user.role)
   ```

4. **Add Middleware to Endpoints**
   ```typescript
   // Before
   if (req.user.role !== 'owner') {
     return res.status(403).json({ error: 'Forbidden' })
   }

   // After
   router.delete('/api/org/:slug',
     requireRole(Role.OWNER),
     handler
   )
   ```

---

## Best Practices

1. **Always Use Permissions, Not Roles**
   ```typescript
   // ❌ Don't check roles directly
   if (role === 'admin') { }

   // ✅ Check permissions instead
   if (hasPermission(role, Permission.ORG_EDIT)) { }
   ```

2. **Use Middleware for API Routes**
   ```typescript
   // ✅ Clean and declarative
   router.patch('/api/org/:slug',
     requirePermission(Permission.ORG_EDIT),
     handler
   )
   ```

3. **Provide Clear Error Messages**
   ```typescript
   if (!hasPermission(role, Permission.ORG_DELETE)) {
     return res.status(403).json({
       error: 'Insufficient permissions',
       message: 'Only organization owners can delete organizations',
       requiredPermission: Permission.ORG_DELETE,
     })
   }
   ```

4. **Document Permission Requirements**
   ```typescript
   /**
    * Update organization settings
    * @requires Permission.ORG_EDIT
    */
   async function updateOrganization(slug: string, data: any) {
     // ...
   }
   ```

5. **Test Permission Boundaries**
   ```typescript
   // Test each role's access
   describe('Organization API', () => {
     it('should allow owner to delete', async () => { })
     it('should prevent admin from deleting', async () => { })
     it('should prevent developer from editing', async () => { })
   })
   ```

---

## Additional Resources

- [RBAC Module Documentation](./rbac.ts)
- [Permission Hook Documentation](../../hooks/usePermissions.ts)
- [Test Examples](./__tests__/rbac.test.ts)
