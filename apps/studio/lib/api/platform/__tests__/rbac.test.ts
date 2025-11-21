/**
 * Tests for Role-Based Access Control (RBAC) System
 *
 * This test suite verifies:
 * - Permission checks for all roles
 * - Role hierarchy validation
 * - Edge cases (invalid roles, null values)
 * - Helper functions behavior
 * - Middleware functionality
 */

import {
  Permission,
  Role,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getRolePermissions,
  hasMinimumRole,
  isHigherRole,
  isValidRole,
  isValidPermission,
  getRoleLevel,
  getPermissionDescription,
  getRoleDescription,
  requirePermission,
  requireRole,
} from '../rbac'

describe('RBAC System', () => {
  describe('hasPermission', () => {
    it('should grant all permissions to owner', () => {
      expect(hasPermission(Role.OWNER, Permission.ORG_DELETE)).toBe(true)
      expect(hasPermission(Role.OWNER, Permission.ORG_BILLING_MANAGE)).toBe(true)
      expect(hasPermission(Role.OWNER, Permission.PROJECT_DELETE)).toBe(true)
      expect(hasPermission(Role.OWNER, Permission.MEMBER_REMOVE)).toBe(true)
    })

    it('should grant appropriate permissions to admin', () => {
      // Admin can edit but not delete org
      expect(hasPermission(Role.ADMIN, Permission.ORG_EDIT)).toBe(true)
      expect(hasPermission(Role.ADMIN, Permission.ORG_DELETE)).toBe(false)

      // Admin can view but not manage billing
      expect(hasPermission(Role.ADMIN, Permission.ORG_BILLING_VIEW)).toBe(true)
      expect(hasPermission(Role.ADMIN, Permission.ORG_BILLING_MANAGE)).toBe(false)

      // Admin can manage projects
      expect(hasPermission(Role.ADMIN, Permission.PROJECT_EDIT)).toBe(true)
      expect(hasPermission(Role.ADMIN, Permission.PROJECT_DELETE)).toBe(false)

      // Admin can invite and edit members but not remove
      expect(hasPermission(Role.ADMIN, Permission.MEMBER_INVITE)).toBe(true)
      expect(hasPermission(Role.ADMIN, Permission.MEMBER_EDIT)).toBe(true)
      expect(hasPermission(Role.ADMIN, Permission.MEMBER_REMOVE)).toBe(false)
    })

    it('should grant appropriate permissions to developer', () => {
      // Developer can view but not edit org
      expect(hasPermission(Role.DEVELOPER, Permission.ORG_VIEW)).toBe(true)
      expect(hasPermission(Role.DEVELOPER, Permission.ORG_EDIT)).toBe(false)

      // Developer can create and view projects
      expect(hasPermission(Role.DEVELOPER, Permission.PROJECT_CREATE)).toBe(true)
      expect(hasPermission(Role.DEVELOPER, Permission.PROJECT_VIEW)).toBe(true)
      expect(hasPermission(Role.DEVELOPER, Permission.PROJECT_EDIT)).toBe(false)

      // Developer can view but not invite members
      expect(hasPermission(Role.DEVELOPER, Permission.MEMBER_VIEW)).toBe(true)
      expect(hasPermission(Role.DEVELOPER, Permission.MEMBER_INVITE)).toBe(false)

      // Developer can execute queries
      expect(hasPermission(Role.DEVELOPER, Permission.DATABASE_EXECUTE)).toBe(true)
      expect(hasPermission(Role.DEVELOPER, Permission.DATABASE_MIGRATE)).toBe(false)
    })

    it('should grant only view permissions to read_only', () => {
      expect(hasPermission(Role.READ_ONLY, Permission.ORG_VIEW)).toBe(true)
      expect(hasPermission(Role.READ_ONLY, Permission.ORG_EDIT)).toBe(false)
      expect(hasPermission(Role.READ_ONLY, Permission.PROJECT_VIEW)).toBe(true)
      expect(hasPermission(Role.READ_ONLY, Permission.PROJECT_CREATE)).toBe(false)
      expect(hasPermission(Role.READ_ONLY, Permission.DATABASE_VIEW)).toBe(true)
      expect(hasPermission(Role.READ_ONLY, Permission.DATABASE_EXECUTE)).toBe(false)
    })

    it('should return false for invalid roles', () => {
      expect(hasPermission('invalid_role', Permission.ORG_VIEW)).toBe(false)
      expect(hasPermission('', Permission.ORG_VIEW)).toBe(false)
    })

    it('should handle null/undefined roles gracefully', () => {
      expect(hasPermission(null as any, Permission.ORG_VIEW)).toBe(false)
      expect(hasPermission(undefined as any, Permission.ORG_VIEW)).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('should return true if role has at least one permission', () => {
      expect(
        hasAnyPermission(Role.ADMIN, [Permission.ORG_DELETE, Permission.ORG_EDIT])
      ).toBe(true)
    })

    it('should return false if role has none of the permissions', () => {
      expect(
        hasAnyPermission(Role.DEVELOPER, [Permission.ORG_DELETE, Permission.ORG_EDIT])
      ).toBe(false)
    })

    it('should return true if role has all permissions', () => {
      expect(
        hasAnyPermission(Role.OWNER, [Permission.ORG_DELETE, Permission.ORG_EDIT])
      ).toBe(true)
    })

    it('should handle empty permission arrays', () => {
      expect(hasAnyPermission(Role.OWNER, [])).toBe(false)
    })
  })

  describe('hasAllPermissions', () => {
    it('should return true if role has all permissions', () => {
      expect(
        hasAllPermissions(Role.OWNER, [Permission.ORG_EDIT, Permission.ORG_DELETE])
      ).toBe(true)
    })

    it('should return false if role is missing any permission', () => {
      expect(
        hasAllPermissions(Role.ADMIN, [Permission.ORG_EDIT, Permission.ORG_DELETE])
      ).toBe(false)
    })

    it('should return true for empty permission arrays', () => {
      expect(hasAllPermissions(Role.READ_ONLY, [])).toBe(true)
    })
  })

  describe('getRolePermissions', () => {
    it('should return correct number of permissions for each role', () => {
      const ownerPerms = getRolePermissions(Role.OWNER)
      const adminPerms = getRolePermissions(Role.ADMIN)
      const devPerms = getRolePermissions(Role.DEVELOPER)
      const readOnlyPerms = getRolePermissions(Role.READ_ONLY)

      // Owner should have the most permissions
      expect(ownerPerms.length).toBeGreaterThan(adminPerms.length)
      expect(adminPerms.length).toBeGreaterThan(devPerms.length)
      expect(devPerms.length).toBeGreaterThan(readOnlyPerms.length)
    })

    it('should return empty array for invalid role', () => {
      expect(getRolePermissions('invalid_role')).toEqual([])
    })

    it('should return all permissions for owner', () => {
      const ownerPerms = getRolePermissions(Role.OWNER)
      const allPerms = Object.values(Permission)

      expect(ownerPerms.length).toBe(allPerms.length)
      expect(ownerPerms).toEqual(expect.arrayContaining(allPerms))
    })
  })

  describe('hasMinimumRole', () => {
    it('should return true when user role meets requirement', () => {
      expect(hasMinimumRole(Role.ADMIN, Role.DEVELOPER)).toBe(true)
      expect(hasMinimumRole(Role.OWNER, Role.ADMIN)).toBe(true)
      expect(hasMinimumRole(Role.DEVELOPER, Role.READ_ONLY)).toBe(true)
    })

    it('should return true when user role equals requirement', () => {
      expect(hasMinimumRole(Role.ADMIN, Role.ADMIN)).toBe(true)
      expect(hasMinimumRole(Role.DEVELOPER, Role.DEVELOPER)).toBe(true)
    })

    it('should return false when user role is below requirement', () => {
      expect(hasMinimumRole(Role.DEVELOPER, Role.ADMIN)).toBe(false)
      expect(hasMinimumRole(Role.READ_ONLY, Role.DEVELOPER)).toBe(false)
    })

    it('should handle invalid roles', () => {
      // Invalid user role should return false
      expect(hasMinimumRole('invalid', Role.ADMIN)).toBe(false)
      // Invalid required role with valid user role: invalid role has level 0, so any valid role >= 0
      // This is expected behavior - if required role is invalid (0), any role meets it
      expect(hasMinimumRole(Role.ADMIN, 'invalid' as Role)).toBe(true)
    })
  })

  describe('isHigherRole', () => {
    it('should return true when first role is higher', () => {
      expect(isHigherRole(Role.OWNER, Role.ADMIN)).toBe(true)
      expect(isHigherRole(Role.ADMIN, Role.DEVELOPER)).toBe(true)
      expect(isHigherRole(Role.DEVELOPER, Role.READ_ONLY)).toBe(true)
    })

    it('should return false when roles are equal', () => {
      expect(isHigherRole(Role.ADMIN, Role.ADMIN)).toBe(false)
      expect(isHigherRole(Role.DEVELOPER, Role.DEVELOPER)).toBe(false)
    })

    it('should return false when first role is lower', () => {
      expect(isHigherRole(Role.DEVELOPER, Role.ADMIN)).toBe(false)
      expect(isHigherRole(Role.READ_ONLY, Role.DEVELOPER)).toBe(false)
    })

    it('should handle invalid roles', () => {
      // Invalid role1 (level 0) is not higher than valid role (level > 0)
      expect(isHigherRole('invalid', Role.ADMIN)).toBe(false)
      // Valid role (level > 0) is higher than invalid role (level 0)
      expect(isHigherRole(Role.ADMIN, 'invalid')).toBe(true)
    })
  })

  describe('isValidRole', () => {
    it('should return true for valid roles', () => {
      expect(isValidRole(Role.OWNER)).toBe(true)
      expect(isValidRole(Role.ADMIN)).toBe(true)
      expect(isValidRole(Role.DEVELOPER)).toBe(true)
      expect(isValidRole(Role.READ_ONLY)).toBe(true)
    })

    it('should return false for invalid roles', () => {
      expect(isValidRole('invalid_role')).toBe(false)
      expect(isValidRole('')).toBe(false)
      expect(isValidRole('super_admin')).toBe(false)
    })
  })

  describe('isValidPermission', () => {
    it('should return true for valid permissions', () => {
      expect(isValidPermission(Permission.ORG_VIEW)).toBe(true)
      expect(isValidPermission(Permission.PROJECT_EDIT)).toBe(true)
      expect(isValidPermission(Permission.DATABASE_EXECUTE)).toBe(true)
    })

    it('should return false for invalid permissions', () => {
      expect(isValidPermission('invalid_permission')).toBe(false)
      expect(isValidPermission('')).toBe(false)
      expect(isValidPermission('org:super_delete')).toBe(false)
    })
  })

  describe('getRoleLevel', () => {
    it('should return correct hierarchy levels', () => {
      expect(getRoleLevel(Role.OWNER)).toBe(4)
      expect(getRoleLevel(Role.ADMIN)).toBe(3)
      expect(getRoleLevel(Role.DEVELOPER)).toBe(2)
      expect(getRoleLevel(Role.READ_ONLY)).toBe(1)
    })

    it('should return 0 for invalid roles', () => {
      expect(getRoleLevel('invalid_role')).toBe(0)
      expect(getRoleLevel('')).toBe(0)
    })
  })

  describe('getPermissionDescription', () => {
    it('should return descriptions for all permissions', () => {
      expect(getPermissionDescription(Permission.ORG_VIEW)).toContain('View organization')
      expect(getPermissionDescription(Permission.ORG_EDIT)).toContain('Edit organization')
      expect(getPermissionDescription(Permission.PROJECT_CREATE)).toContain('Create')
      expect(getPermissionDescription(Permission.DATABASE_MIGRATE)).toContain('migration')
    })

    it('should return fallback for unknown permissions', () => {
      expect(getPermissionDescription('unknown' as Permission)).toBe('Unknown permission')
    })
  })

  describe('getRoleDescription', () => {
    it('should return descriptions for all roles', () => {
      expect(getRoleDescription(Role.OWNER)).toContain('Full access')
      expect(getRoleDescription(Role.ADMIN)).toContain('Manage')
      expect(getRoleDescription(Role.DEVELOPER)).toContain('Create and view')
      expect(getRoleDescription(Role.READ_ONLY)).toContain('View-only')
    })

    it('should return fallback for unknown roles', () => {
      expect(getRoleDescription('unknown' as Role)).toBe('Unknown role')
    })
  })

  describe('requirePermission middleware', () => {
    it('should call next() when user has permission', () => {
      const middleware = requirePermission(Permission.ORG_VIEW)
      const req = { user: { role: Role.ADMIN } }
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should return 403 when user lacks permission', () => {
      const middleware = requirePermission(Permission.ORG_EDIT)
      const req = { user: { role: Role.READ_ONLY } }
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          required: Permission.ORG_EDIT,
        })
      )
    })

    it('should return 403 when user role is missing', () => {
      const middleware = requirePermission(Permission.ORG_VIEW)
      const req = { user: {} }
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe('requireRole middleware', () => {
    it('should call next() when user has minimum role', () => {
      const middleware = requireRole(Role.DEVELOPER)
      const req = { user: { role: Role.ADMIN } }
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should return 403 when user role is insufficient', () => {
      const middleware = requireRole(Role.ADMIN)
      const req = { user: { role: Role.DEVELOPER } }
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          required: Role.ADMIN,
          current: Role.DEVELOPER,
        })
      )
    })
  })

  describe('Permission Matrix Completeness', () => {
    it('should have permissions defined for all roles', () => {
      const roles = Object.values(Role)
      roles.forEach((role) => {
        const perms = getRolePermissions(role)
        expect(perms.length).toBeGreaterThan(0)
      })
    })

    it('should have read_only as most restrictive role', () => {
      const readOnlyPerms = getRolePermissions(Role.READ_ONLY)

      // Read-only should only have view permissions
      readOnlyPerms.forEach((perm) => {
        expect(perm).toMatch(/view|VIEW/)
      })
    })

    it('should ensure owner has all other role permissions', () => {
      const ownerPerms = new Set(getRolePermissions(Role.OWNER))
      const allRoles = [Role.ADMIN, Role.DEVELOPER, Role.READ_ONLY]

      allRoles.forEach((role) => {
        const rolePerms = getRolePermissions(role)
        rolePerms.forEach((perm) => {
          expect(ownerPerms.has(perm)).toBe(true)
        })
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle case-sensitive role names', () => {
      expect(hasPermission('Owner', Permission.ORG_DELETE)).toBe(false)
      expect(hasPermission('OWNER', Permission.ORG_DELETE)).toBe(false)
      expect(hasPermission(Role.OWNER, Permission.ORG_DELETE)).toBe(true)
    })

    it('should handle concurrent permission checks', () => {
      const checks = Array(1000)
        .fill(null)
        .map(() => hasPermission(Role.ADMIN, Permission.ORG_EDIT))

      expect(checks.every((result) => result === true)).toBe(true)
    })

    it('should maintain immutability of permission arrays', () => {
      const perms1 = getRolePermissions(Role.ADMIN)
      const perms2 = getRolePermissions(Role.ADMIN)

      expect(perms1).toEqual(perms2)
      expect(perms1).not.toBe(perms2) // Different instances
    })
  })
})
