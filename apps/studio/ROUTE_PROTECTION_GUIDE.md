# Route Protection Implementation Guide

This guide shows how to implement route-level and component-level protection using the authentication and permission system.

## Table of Contents

1. [Basic Authentication Protection](#basic-authentication-protection)
2. [Role-Based Protection](#role-based-protection)
3. [Permission-Based Protection](#permission-based-protection)
4. [Component-Level Guards](#component-level-guards)
5. [Navigation Guards](#navigation-guards)
6. [Practical Examples](#practical-examples)

## Basic Authentication Protection

### Protect a Page from Unauthenticated Access

```tsx
// pages/organizations/[slug]/index.tsx
import { AuthGuard } from 'components/AuthGuard'

export default function OrganizationPage() {
  return (
    <AuthGuard>
      <OrganizationLayout>
        <OrganizationDashboard />
      </OrganizationLayout>
    </AuthGuard>
  )
}
```

This will:
- Show loading spinner while checking auth
- Redirect to `/sign-in?returnTo=<current-path>` if not authenticated
- Render the page content if authenticated

## Role-Based Protection

### Require Minimum Role

```tsx
// pages/organizations/[slug]/settings.tsx
import { AuthGuard } from 'components/AuthGuard'
import { Role } from 'lib/api/platform/rbac'

export default function OrganizationSettingsPage() {
  return (
    <AuthGuard minimumRole={Role.ADMIN}>
      <OrganizationLayout>
        <OrganizationSettings />
      </OrganizationLayout>
    </AuthGuard>
  )
}
```

This ensures only admins and owners can access the settings page.

### Owner-Only Routes

```tsx
// pages/organizations/[slug]/delete.tsx
import { AuthGuard } from 'components/AuthGuard'
import { Role } from 'lib/api/platform/rbac'

export default function DeleteOrganizationPage() {
  return (
    <AuthGuard minimumRole={Role.OWNER}>
      <OrganizationLayout>
        <DeleteOrganization />
      </OrganizationLayout>
    </AuthGuard>
  )
}
```

## Permission-Based Protection

### Require Specific Permission

```tsx
// pages/organizations/[slug]/billing.tsx
import { AuthGuard } from 'components/AuthGuard'
import { Permission } from 'lib/api/platform/rbac'

export default function OrganizationBillingPage() {
  return (
    <AuthGuard requiredPermission={Permission.ORG_BILLING_VIEW}>
      <OrganizationLayout>
        <OrganizationBilling />
      </OrganizationLayout>
    </AuthGuard>
  )
}
```

### Project-Level Protection

```tsx
// pages/project/[ref]/compute.tsx
import { AuthGuard } from 'components/AuthGuard'
import { Permission } from 'lib/api/platform/rbac'

export default function ProjectComputePage() {
  return (
    <AuthGuard requiredPermission={Permission.PROJECT_COMPUTE_VIEW}>
      <ProjectLayout>
        <ComputeSettings />
      </ProjectLayout>
    </AuthGuard>
  )
}
```

### Custom Fallback

```tsx
import { AuthGuard } from 'components/AuthGuard'
import { Permission } from 'lib/api/platform/rbac'

export default function AdvancedFeaturesPage() {
  return (
    <AuthGuard
      requiredPermission={Permission.PROJECT_EDIT}
      fallback={<UpgradePrompt />}
    >
      <AdvancedFeatures />
    </AuthGuard>
  )
}
```

## Component-Level Guards

### Hide/Show UI Elements

```tsx
import { Can, Cannot } from 'components/PermissionGuard'
import { Permission } from 'lib/api/platform/rbac'

function OrganizationSettings() {
  return (
    <div>
      <h1>Organization Settings</h1>
      
      {/* Only show edit button to users with permission */}
      <Can permission={Permission.ORG_EDIT}>
        <Button onClick={handleEdit}>Edit Organization</Button>
      </Can>
      
      {/* Only owners can delete */}
      <Can permission={Permission.ORG_DELETE}>
        <Button variant="destructive" onClick={handleDelete}>
          Delete Organization
        </Button>
      </Can>
      
      {/* Show upgrade prompt to users without permission */}
      <Cannot permission={Permission.ORG_BILLING_MANAGE}>
        <UpgradePrompt feature="billing management" />
      </Cannot>
    </div>
  )
}
```

### Disable Interactive Elements

```tsx
import { DisableIfNoPermission } from 'components/PermissionGuard'
import { Permission } from 'lib/api/platform/rbac'

function ProjectSettings() {
  return (
    <Form onSubmit={handleSubmit}>
      <DisableIfNoPermission permission={Permission.PROJECT_EDIT}>
        {(disabled) => (
          <>
            <Input
              name="project_name"
              disabled={disabled}
            />
            <Button
              type="submit"
              disabled={disabled}
            >
              Save Changes
            </Button>
          </>
        )}
      </DisableIfNoPermission>
    </Form>
  )
}
```

### Using Hooks for Complex Logic

```tsx
import { usePermissions } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'

function ProjectDashboard() {
  const {
    canEditProject,
    canDeleteProject,
    canManageBilling,
    isOwner,
    role,
  } = usePermissions('admin')

  return (
    <div>
      <h1>Project Dashboard</h1>
      <p>Your role: {role}</p>
      
      {canEditProject && <EditProjectButton />}
      {canDeleteProject && <DeleteProjectButton />}
      {canManageBilling && <BillingSection />}
      
      {isOwner && (
        <div className="owner-tools">
          <TransferOwnershipButton />
        </div>
      )}
    </div>
  )
}
```

## Navigation Guards

### Check Access in Layouts

```tsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useProductionAuth } from 'lib/auth/context'
import { canAccessOrganization } from 'lib/navigation/guards'

function OrganizationLayout({ children, orgSlug }) {
  const { user } = useProductionAuth()
  const router = useRouter()
  
  useEffect(() => {
    if (user && !canAccessOrganization(user, orgSlug)) {
      router.push('/organizations')
    }
  }, [user, orgSlug, router])
  
  return <>{children}</>
}
```

### Filter Navigation Items

```tsx
import { usePermissions } from 'hooks/usePermissions'
import { Permission } from 'lib/api/platform/rbac'

function OrganizationSidebar() {
  const {
    canViewMembers,
    canEditOrg,
    canManageBilling,
  } = usePermissions()
  
  const menuItems = [
    { label: 'Overview', path: '', show: true },
    { label: 'Projects', path: '/projects', show: true },
    { label: 'Members', path: '/members', show: canViewMembers },
    { label: 'Settings', path: '/settings', show: canEditOrg },
    { label: 'Billing', path: '/billing', show: canManageBilling },
  ]
  
  return (
    <nav>
      {menuItems.filter(item => item.show).map(item => (
        <SidebarLink key={item.path} href={item.path}>
          {item.label}
        </SidebarLink>
      ))}
    </nav>
  )
}
```

## Practical Examples

### Organization Settings Page (Full Example)

```tsx
// pages/organizations/[slug]/settings.tsx
import { AuthGuard } from 'components/AuthGuard'
import { Can } from 'components/PermissionGuard'
import { usePermissions } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'
import { Button, Input, Form } from 'ui'

export default function OrganizationSettingsPage() {
  return (
    <AuthGuard minimumRole={Role.ADMIN}>
      <OrganizationLayout>
        <OrganizationSettingsContent />
      </OrganizationLayout>
    </AuthGuard>
  )
}

function OrganizationSettingsContent() {
  const { canEditOrg, canDeleteOrg, isOwner } = usePermissions()
  
  return (
    <div className="space-y-6">
      <h1>Organization Settings</h1>
      
      <section>
        <h2>General Settings</h2>
        <Form onSubmit={handleUpdate}>
          <Input name="name" label="Organization Name" />
          <Input name="slug" label="Organization Slug" />
          
          <Can permission={Permission.ORG_EDIT}>
            <Button type="submit">Save Changes</Button>
          </Can>
        </Form>
      </section>
      
      <Can permission={Permission.ORG_DELETE}>
        <section className="danger-zone">
          <h2>Danger Zone</h2>
          <p>Permanently delete this organization and all its projects.</p>
          <Button variant="destructive" onClick={handleDelete}>
            Delete Organization
          </Button>
        </section>
      </Can>
    </div>
  )
}
```

### Project Compute Page (Full Example)

```tsx
// pages/project/[ref]/compute.tsx
import { AuthGuard } from 'components/AuthGuard'
import { DisableIfNoPermission } from 'components/PermissionGuard'
import { Permission } from 'lib/api/platform/rbac'

export default function ProjectComputePage() {
  return (
    <AuthGuard requiredPermission={Permission.PROJECT_COMPUTE_VIEW}>
      <ProjectLayout>
        <ComputeSettings />
      </ProjectLayout>
    </AuthGuard>
  )
}

function ComputeSettings() {
  return (
    <div>
      <h1>Compute Settings</h1>
      
      <DisableIfNoPermission permission={Permission.PROJECT_COMPUTE_EDIT}>
        {(disabled) => (
          <Form onSubmit={handleSave}>
            <Select
              name="instance_size"
              label="Instance Size"
              disabled={disabled}
              options={[
                { value: 'micro', label: 'Micro' },
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
              ]}
            />
            
            <Button
              type="submit"
              disabled={disabled}
            >
              {disabled ? 'Read Only' : 'Save Changes'}
            </Button>
            
            {disabled && (
              <p className="text-sm text-gray-500">
                You don't have permission to edit compute settings
              </p>
            )}
          </Form>
        )}
      </DisableIfNoPermission>
    </div>
  )
}
```

### Conditional Rendering with Multiple Checks

```tsx
import { usePermissions } from 'hooks/usePermissions'
import { Permission, Role } from 'lib/api/platform/rbac'

function ProjectToolbar() {
  const {
    hasPermission,
    hasMinimumRole,
    canEditProject,
    canDeleteProject,
    isOwner,
  } = usePermissions()
  
  const canPause = hasPermission(Permission.PROJECT_EDIT)
  const canRestore = hasPermission(Permission.PROJECT_EDIT)
  const canViewBilling = hasPermission(Permission.ORG_BILLING_VIEW)
  
  return (
    <div className="flex gap-2">
      {canEditProject && <EditButton />}
      {canPause && <PauseButton />}
      {canRestore && <RestoreButton />}
      {canDeleteProject && <DeleteButton />}
      {canViewBilling && <BillingLink />}
      
      {isOwner && (
        <DropdownMenu>
          <DropdownMenuItem>Transfer Ownership</DropdownMenuItem>
          <DropdownMenuItem>Export Data</DropdownMenuItem>
        </DropdownMenu>
      )}
    </div>
  )
}
```

## Permission Matrix

### Organization Permissions

| Permission | Owner | Admin | Developer | Read-Only |
|-----------|-------|-------|-----------|-----------|
| ORG_VIEW | ✅ | ✅ | ✅ | ✅ |
| ORG_EDIT | ✅ | ✅ | ❌ | ❌ |
| ORG_DELETE | ✅ | ❌ | ❌ | ❌ |
| ORG_BILLING_VIEW | ✅ | ✅ | ❌ | ❌ |
| ORG_BILLING_MANAGE | ✅ | ❌ | ❌ | ❌ |

### Project Permissions

| Permission | Owner | Admin | Developer | Read-Only |
|-----------|-------|-------|-----------|-----------|
| PROJECT_VIEW | ✅ | ✅ | ✅ | ✅ |
| PROJECT_CREATE | ✅ | ✅ | ✅ | ❌ |
| PROJECT_EDIT | ✅ | ✅ | ✅ | ❌ |
| PROJECT_DELETE | ✅ | ✅ | ❌ | ❌ |
| PROJECT_COMPUTE_EDIT | ✅ | ✅ | ❌ | ❌ |

### Member Permissions

| Permission | Owner | Admin | Developer | Read-Only |
|-----------|-------|-------|-----------|-----------|
| MEMBER_VIEW | ✅ | ✅ | ✅ | ✅ |
| MEMBER_INVITE | ✅ | ✅ | ❌ | ❌ |
| MEMBER_EDIT | ✅ | ✅ | ❌ | ❌ |
| MEMBER_REMOVE | ✅ | ❌ | ❌ | ❌ |

## Best Practices

1. **Always use AuthGuard at the page level** for authentication
2. **Use role checks for structural access** (e.g., who can view the page)
3. **Use permission checks for actions** (e.g., who can click the button)
4. **Provide clear feedback** when access is denied
5. **Test all permission combinations** to ensure security
6. **Use Can/Cannot for simple show/hide** logic
7. **Use usePermissions hook for complex** conditional logic
8. **Always validate permissions on the backend** (client-side is UI only)

## Testing Your Protection

Run the test suite:

```bash
npm test -- tests/components/protection.test.tsx
```

The tests verify:
- ✅ Unauthenticated users are redirected
- ✅ Users without minimum role see access denied
- ✅ Users without permission cannot see protected UI
- ✅ Role hierarchy is respected
- ✅ Custom fallbacks work correctly
