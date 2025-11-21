# RBAC Quick Reference

## Role Hierarchy

```
Owner (Level 4)
  └─ Admin (Level 3)
      └─ Developer (Level 2)
          └─ Read Only (Level 1)
```

## Permission Matrix

| Permission | Owner | Admin | Developer | Read Only |
|------------|-------|-------|-----------|-----------|
| **Organization** |
| View | ✅ | ✅ | ✅ | ✅ |
| Edit | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ |
| View Billing | ✅ | ✅ | ❌ | ❌ |
| Manage Billing | ✅ | ❌ | ❌ | ❌ |
| **Projects** |
| View | ✅ | ✅ | ✅ | ✅ |
| Create | ✅ | ✅ | ✅ | ❌ |
| Edit | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ |
| View Compute | ✅ | ✅ | ✅ | ✅ |
| Edit Compute | ✅ | ✅ | ❌ | ❌ |
| View Addons | ✅ | ✅ | ✅ | ✅ |
| Manage Addons | ✅ | ✅ | ❌ | ❌ |
| **Members** |
| View | ✅ | ✅ | ✅ | ✅ |
| Invite | ✅ | ✅ | ❌ | ❌ |
| Edit | ✅ | ✅ | ❌ | ❌ |
| Remove | ✅ | ❌ | ❌ | ❌ |
| **Database** |
| View | ✅ | ✅ | ✅ | ✅ |
| Execute | ✅ | ✅ | ✅ | ❌ |
| Migrate | ✅ | ✅ | ❌ | ❌ |
| **Settings** |
| View | ✅ | ✅ | ✅ | ✅ |
| Edit | ✅ | ✅ | ❌ | ❌ |

## Common Code Snippets

### Backend - API Endpoint

```typescript
import { hasPermission, Permission } from 'lib/api/platform/rbac'

if (!hasPermission(membership.role, Permission.ORG_EDIT)) {
  return res.status(403).json({ error: 'Forbidden' })
}
```

### Backend - Middleware

```typescript
import { requirePermission, Permission } from 'lib/api/platform/rbac'

router.patch('/api/org/:slug',
  requirePermission(Permission.ORG_EDIT),
  handler
)
```

### Frontend - React Hook

```typescript
import { usePermissions } from 'hooks/usePermissions'

function Component() {
  const { canEditOrg, canDeleteOrg } = usePermissions('admin')

  return (
    <>
      {canEditOrg && <EditButton />}
      {canDeleteOrg && <DeleteButton />}
    </>
  )
}
```

## All Permissions

```typescript
// Organization
Permission.ORG_VIEW
Permission.ORG_EDIT
Permission.ORG_DELETE
Permission.ORG_BILLING_VIEW
Permission.ORG_BILLING_MANAGE

// Projects
Permission.PROJECT_VIEW
Permission.PROJECT_CREATE
Permission.PROJECT_EDIT
Permission.PROJECT_DELETE
Permission.PROJECT_COMPUTE_VIEW
Permission.PROJECT_COMPUTE_EDIT
Permission.PROJECT_ADDONS_VIEW
Permission.PROJECT_ADDONS_MANAGE
Permission.PROJECT_DISK_VIEW
Permission.PROJECT_DISK_EDIT

// Members
Permission.MEMBER_VIEW
Permission.MEMBER_INVITE
Permission.MEMBER_EDIT
Permission.MEMBER_REMOVE

// Settings
Permission.SETTINGS_VIEW
Permission.SETTINGS_EDIT

// Database
Permission.DATABASE_VIEW
Permission.DATABASE_EXECUTE
Permission.DATABASE_MIGRATE

// API
Permission.API_KEY_VIEW
Permission.API_KEY_ROTATE
```

## Helper Functions

```typescript
// Check single permission
hasPermission(role, Permission.ORG_EDIT) // boolean

// Check any permission
hasAnyPermission(role, [Permission.ORG_EDIT, Permission.ORG_DELETE]) // boolean

// Check all permissions
hasAllPermissions(role, [Permission.ORG_VIEW, Permission.ORG_EDIT]) // boolean

// Check minimum role
hasMinimumRole(userRole, Role.ADMIN) // boolean

// Compare roles
isHigherRole(Role.ADMIN, Role.DEVELOPER) // boolean

// Get all permissions
getRolePermissions(Role.ADMIN) // Permission[]

// Get role level
getRoleLevel(Role.ADMIN) // number (3)
```

## React Hook API

```typescript
const {
  // Functions
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasMinimumRole,
  isHigherThan,

  // Organization shortcuts
  canViewOrg,
  canEditOrg,
  canDeleteOrg,
  canViewBilling,
  canManageBilling,

  // Project shortcuts
  canViewProject,
  canCreateProject,
  canEditProject,
  canDeleteProject,
  canViewCompute,
  canEditCompute,

  // Member shortcuts
  canViewMembers,
  canInviteMembers,
  canEditMembers,
  canRemoveMembers,

  // Database shortcuts
  canViewDatabase,
  canExecuteQueries,
  canRunMigrations,

  // Role info
  role,
  roleLevel,
  permissions,
  isOwner,
  isAdmin,
  isDeveloper,
  isReadOnly,
} = usePermissions('admin')
```

## Migration Patterns

### Before
```typescript
if (role === 'owner' || role === 'admin') {
  // Allow
}
```

### After
```typescript
if (hasPermission(role, Permission.ORG_EDIT)) {
  // Allow
}
```

---

### Before
```typescript
if (user.role !== 'owner') {
  return res.status(403)
}
```

### After
```typescript
if (!hasPermission(user.role, Permission.ORG_DELETE)) {
  return res.status(403)
}
```

---

### Before
```typescript
const canEdit = ['owner', 'admin'].includes(role)
```

### After
```typescript
const canEdit = hasPermission(role, Permission.ORG_EDIT)
```

## Error Response Format

```json
{
  "error": "Forbidden",
  "message": "You do not have permission to perform this action",
  "required": "org:edit"
}
```

## Testing Example

```typescript
describe('Permissions', () => {
  it('should allow admin to edit org', () => {
    expect(hasPermission(Role.ADMIN, Permission.ORG_EDIT)).toBe(true)
  })

  it('should prevent developer from deleting org', () => {
    expect(hasPermission(Role.DEVELOPER, Permission.ORG_DELETE)).toBe(false)
  })
})
```
