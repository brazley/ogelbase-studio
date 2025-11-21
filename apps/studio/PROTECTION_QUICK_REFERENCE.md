# Protection System Quick Reference

## 🔒 Page Protection

### Basic Auth
```tsx
<AuthGuard>
  <YourPage />
</AuthGuard>
```

### Require Role
```tsx
<AuthGuard minimumRole={Role.ADMIN}>
  <AdminPage />
</AuthGuard>
```

### Require Permission
```tsx
<AuthGuard requiredPermission={Permission.ORG_BILLING_VIEW}>
  <BillingPage />
</AuthGuard>
```

## 🎨 UI Protection

### Show/Hide Elements
```tsx
<Can permission={Permission.ORG_EDIT}>
  <EditButton />
</Can>

<Cannot permission={Permission.ORG_BILLING_MANAGE}>
  <UpgradePrompt />
</Cannot>
```

### Disable Elements
```tsx
<DisableIfNoPermission permission={Permission.PROJECT_EDIT}>
  {(disabled) => <Button disabled={disabled}>Save</Button>}
</DisableIfNoPermission>
```

## 🪝 Permission Hooks

### Basic Usage
```tsx
const {
  canEditProject,
  canDeleteProject,
  canManageBilling,
  isOwner,
  isAdmin,
} = usePermissions()
```

### Check Specific Permission
```tsx
const { hasPermission } = usePermissions()

if (hasPermission(Permission.ORG_DELETE)) {
  // Show delete option
}
```

### Check Minimum Role
```tsx
const { hasMinimumRole } = usePermissions()

if (hasMinimumRole(Role.ADMIN)) {
  // Show admin features
}
```

## 🗺️ Navigation Guards

### Check Access
```tsx
if (!canAccessOrganization(user, orgSlug)) {
  router.push('/organizations')
}

if (!canAccessProject(user, projectRef)) {
  router.push('/projects')
}
```

### Get User Role
```tsx
const orgRole = getOrgRole(user, orgSlug)
const projectRole = getProjectRole(user, projectRef)
```

### Filter by Role
```tsx
const adminOrgs = filterOrgsByRole(user, Role.ADMIN)
const ownedProjects = filterProjectsByRole(user, Role.OWNER)
```

## 📊 Roles & Permissions

### Roles (Highest to Lowest)
1. **Owner** - All permissions
2. **Admin** - Management (no delete org)
3. **Developer** - Create & view
4. **Read-Only** - View only

### Common Permissions

**Organization**:
- `Permission.ORG_VIEW` - View org details
- `Permission.ORG_EDIT` - Edit org settings
- `Permission.ORG_DELETE` - Delete org
- `Permission.ORG_BILLING_VIEW` - View billing
- `Permission.ORG_BILLING_MANAGE` - Manage billing

**Project**:
- `Permission.PROJECT_VIEW` - View project
- `Permission.PROJECT_CREATE` - Create projects
- `Permission.PROJECT_EDIT` - Edit project
- `Permission.PROJECT_DELETE` - Delete project
- `Permission.PROJECT_COMPUTE_EDIT` - Edit compute
- `Permission.PROJECT_DISK_EDIT` - Edit disk

**Members**:
- `Permission.MEMBER_VIEW` - View members
- `Permission.MEMBER_INVITE` - Invite members
- `Permission.MEMBER_EDIT` - Edit member roles
- `Permission.MEMBER_REMOVE` - Remove members

## 🎯 Common Patterns

### Protected Settings Page
```tsx
export default function SettingsPage() {
  return (
    <AuthGuard minimumRole={Role.ADMIN}>
      <SettingsContent />
    </AuthGuard>
  )
}
```

### Conditional Toolbar
```tsx
function Toolbar() {
  const { canEdit, canDelete } = usePermissions()
  
  return (
    <div>
      {canEdit && <EditButton />}
      {canDelete && <DeleteButton />}
    </div>
  )
}
```

### Filtered Menu
```tsx
function Menu() {
  const { canViewMembers, canEditOrg } = usePermissions()
  
  const items = [
    { label: 'Overview', show: true },
    { label: 'Members', show: canViewMembers },
    { label: 'Settings', show: canEditOrg },
  ].filter(item => item.show)
  
  return <MenuItems items={items} />
}
```

### Read-Only Form
```tsx
function Form() {
  return (
    <DisableIfNoPermission permission={Permission.PROJECT_EDIT}>
      {(disabled) => (
        <>
          <Input disabled={disabled} />
          <Button disabled={disabled}>
            {disabled ? 'Read Only' : 'Save'}
          </Button>
        </>
      )}
    </DisableIfNoPermission>
  )
}
```

## ⚠️ Important Notes

1. **Client-side is UX only** - Always validate on backend
2. **Use AuthGuard at page level** for authentication
3. **Use Can/Cannot for simple** show/hide logic
4. **Use hooks for complex** conditional logic
5. **Always test all role combinations**
6. **Provide clear feedback** when access denied

## 📁 File Locations

- **AuthGuard**: `components/AuthGuard.tsx`
- **PermissionGuard**: `components/PermissionGuard.tsx`
- **RBAC**: `lib/api/platform/rbac.ts`
- **Hooks**: `hooks/usePermissions.ts`
- **Navigation**: `lib/navigation/guards.ts`
- **Tests**: `tests/components/protection.test.tsx`
- **Guide**: `ROUTE_PROTECTION_GUIDE.md`

## 🧪 Testing

```bash
# Run protection tests
npm test -- tests/components/protection.test.tsx

# Test as different roles
# 1. Sign in as owner/admin/developer/read-only
# 2. Navigate to protected pages
# 3. Verify UI elements show/hide correctly
# 4. Check disabled states work
```

## 🔗 Integration

```tsx
import { AuthGuard } from 'components/AuthGuard'
import { Can, Cannot, DisableIfNoPermission } from 'components/PermissionGuard'
import { usePermissions } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'
import { canAccessOrganization, canAccessProject } from 'lib/navigation/guards'
```

---

**Need more details?** See `ROUTE_PROTECTION_GUIDE.md` for comprehensive examples.
