/**
 * Protection Components Tests
 * Tests for AuthGuard, PermissionGuard, and navigation guards
 */

import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/router'
import { AuthGuard } from 'components/AuthGuard'
import { PermissionGuard, Can, Cannot } from 'components/PermissionGuard'
import { useProductionAuth } from 'lib/auth/context'
import { Permission, Role } from 'lib/api/platform/rbac'

// Mock dependencies
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}))

jest.mock('lib/auth/context', () => ({
  useProductionAuth: jest.fn(),
}))

jest.mock('hooks/usePermissions', () => ({
  usePermissions: jest.fn((role) => {
    const { hasPermission: checkPerm, hasMinimumRole: checkRole } = require('lib/api/platform/rbac')
    return {
      hasPermission: (permission: any) => checkPerm(role, permission),
      hasMinimumRole: (minRole: any) => checkRole(role, minRole),
    }
  }),
}))

const mockRouter = {
  push: jest.fn(),
  asPath: '/test-page',
}

describe('AuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
  })

  it('shows loading spinner while checking auth', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: true,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    // Loading spinner should be present
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('redirects unauthenticated users', async () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    )

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        '/sign-in?returnTo=%2Ftest-page'
      )
    })

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children for authenticated users', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: 'developer' },
      loading: false,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('blocks users without minimum role', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.DEVELOPER },
      loading: false,
    })

    render(
      <AuthGuard minimumRole={Role.ADMIN}>
        <div>Admin Only Content</div>
      </AuthGuard>
    )

    expect(screen.queryByText('Admin Only Content')).not.toBeInTheDocument()
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument()
  })

  it('allows users with minimum role', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.ADMIN },
      loading: false,
    })

    render(
      <AuthGuard minimumRole={Role.DEVELOPER}>
        <div>Developer+ Content</div>
      </AuthGuard>
    )

    expect(screen.getByText('Developer+ Content')).toBeInTheDocument()
  })

  it('blocks users without required permission', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.DEVELOPER },
      loading: false,
    })

    render(
      <AuthGuard requiredPermission={Permission.ORG_DELETE}>
        <div>Delete Organization</div>
      </AuthGuard>
    )

    expect(screen.queryByText('Delete Organization')).not.toBeInTheDocument()
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument()
  })

  it('allows users with required permission', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.OWNER },
      loading: false,
    })

    render(
      <AuthGuard requiredPermission={Permission.ORG_DELETE}>
        <div>Delete Organization</div>
      </AuthGuard>
    )

    expect(screen.getByText('Delete Organization')).toBeInTheDocument()
  })

  it('renders custom fallback when access is denied', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.READ_ONLY },
      loading: false,
    })

    render(
      <AuthGuard
        minimumRole={Role.ADMIN}
        fallback={<div>Custom Fallback</div>}
      >
        <div>Admin Content</div>
      </AuthGuard>
    )

    expect(screen.getByText('Custom Fallback')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })
})

describe('PermissionGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hides content without required permission', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.DEVELOPER },
    })

    render(
      <PermissionGuard permission={Permission.ORG_DELETE}>
        <button>Delete Organization</button>
      </PermissionGuard>
    )

    expect(screen.queryByText('Delete Organization')).not.toBeInTheDocument()
  })

  it('shows content with required permission', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.OWNER },
    })

    render(
      <PermissionGuard permission={Permission.ORG_DELETE}>
        <button>Delete Organization</button>
      </PermissionGuard>
    )

    expect(screen.getByText('Delete Organization')).toBeInTheDocument()
  })

  it('shows fallback when permission is denied', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.DEVELOPER },
    })

    render(
      <PermissionGuard
        permission={Permission.ORG_EDIT}
        fallback={<div>Upgrade to edit</div>}
      >
        <button>Edit Organization</button>
      </PermissionGuard>
    )

    expect(screen.getByText('Upgrade to edit')).toBeInTheDocument()
    expect(screen.queryByText('Edit Organization')).not.toBeInTheDocument()
  })

  it('hides content without minimum role', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.READ_ONLY },
    })

    render(
      <PermissionGuard minimumRole={Role.DEVELOPER}>
        <button>Create Project</button>
      </PermissionGuard>
    )

    expect(screen.queryByText('Create Project')).not.toBeInTheDocument()
  })
})

describe('Can component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows content when permission is granted', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.ADMIN },
    })

    render(
      <Can permission={Permission.ORG_EDIT}>
        <button>Edit Organization</button>
      </Can>
    )

    expect(screen.getByText('Edit Organization')).toBeInTheDocument()
  })

  it('hides content when permission is denied', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.READ_ONLY },
    })

    render(
      <Can permission={Permission.ORG_EDIT}>
        <button>Edit Organization</button>
      </Can>
    )

    expect(screen.queryByText('Edit Organization')).not.toBeInTheDocument()
  })

  it('works with minimum role', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.ADMIN },
    })

    render(
      <Can minimumRole={Role.DEVELOPER}>
        <button>View Dashboard</button>
      </Can>
    )

    expect(screen.getByText('View Dashboard')).toBeInTheDocument()
  })
})

describe('Cannot component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows content when permission is denied', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.READ_ONLY },
    })

    render(
      <Cannot permission={Permission.ORG_BILLING_MANAGE}>
        <div>Upgrade to manage billing</div>
      </Cannot>
    )

    expect(screen.getByText('Upgrade to manage billing')).toBeInTheDocument()
  })

  it('hides content when permission is granted', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.OWNER },
    })

    render(
      <Cannot permission={Permission.ORG_BILLING_MANAGE}>
        <div>Upgrade to manage billing</div>
      </Cannot>
    )

    expect(screen.queryByText('Upgrade to manage billing')).not.toBeInTheDocument()
  })
})

describe('Role hierarchy', () => {
  it('owner has all permissions', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.OWNER },
    })

    render(
      <>
        <Can permission={Permission.ORG_DELETE}>
          <div>Delete Org</div>
        </Can>
        <Can permission={Permission.ORG_EDIT}>
          <div>Edit Org</div>
        </Can>
        <Can permission={Permission.PROJECT_CREATE}>
          <div>Create Project</div>
        </Can>
      </>
    )

    expect(screen.getByText('Delete Org')).toBeInTheDocument()
    expect(screen.getByText('Edit Org')).toBeInTheDocument()
    expect(screen.getByText('Create Project')).toBeInTheDocument()
  })

  it('admin cannot delete organization', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.ADMIN },
    })

    render(
      <>
        <Can permission={Permission.ORG_DELETE}>
          <div>Delete Org</div>
        </Can>
        <Can permission={Permission.ORG_EDIT}>
          <div>Edit Org</div>
        </Can>
      </>
    )

    expect(screen.queryByText('Delete Org')).not.toBeInTheDocument()
    expect(screen.getByText('Edit Org')).toBeInTheDocument()
  })

  it('developer has limited permissions', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.DEVELOPER },
    })

    render(
      <>
        <Can permission={Permission.ORG_EDIT}>
          <div>Edit Org</div>
        </Can>
        <Can permission={Permission.PROJECT_VIEW}>
          <div>View Project</div>
        </Can>
        <Can permission={Permission.PROJECT_CREATE}>
          <div>Create Project</div>
        </Can>
      </>
    )

    expect(screen.queryByText('Edit Org')).not.toBeInTheDocument()
    expect(screen.getByText('View Project')).toBeInTheDocument()
    expect(screen.getByText('Create Project')).toBeInTheDocument()
  })

  it('read_only can only view', () => {
    ;(useProductionAuth as jest.Mock).mockReturnValue({
      user: { id: '1', email: 'test@example.com', role: Role.READ_ONLY },
    })

    render(
      <>
        <Can permission={Permission.PROJECT_VIEW}>
          <div>View Project</div>
        </Can>
        <Can permission={Permission.PROJECT_EDIT}>
          <div>Edit Project</div>
        </Can>
        <Can permission={Permission.PROJECT_CREATE}>
          <div>Create Project</div>
        </Can>
      </>
    )

    expect(screen.getByText('View Project')).toBeInTheDocument()
    expect(screen.queryByText('Edit Project')).not.toBeInTheDocument()
    expect(screen.queryByText('Create Project')).not.toBeInTheDocument()
  })
})
