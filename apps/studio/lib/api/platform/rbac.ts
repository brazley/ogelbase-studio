/**
 * Role-Based Access Control (RBAC) System
 *
 * This module defines permissions, roles, and access control logic for the platform.
 * It provides a comprehensive permission system that controls what actions users can
 * perform based on their role within an organization or project.
 *
 * @module rbac
 */

/**
 * Enum defining all available permissions in the system.
 * Permissions are organized by resource type (org, project, member, settings).
 */
export enum Permission {
  // Organization permissions
  ORG_VIEW = 'org:view',
  ORG_EDIT = 'org:edit',
  ORG_DELETE = 'org:delete',
  ORG_BILLING_VIEW = 'org:billing:view',
  ORG_BILLING_MANAGE = 'org:billing:manage',

  // Project permissions
  PROJECT_VIEW = 'project:view',
  PROJECT_CREATE = 'project:create',
  PROJECT_EDIT = 'project:edit',
  PROJECT_DELETE = 'project:delete',
  PROJECT_COMPUTE_VIEW = 'project:compute:view',
  PROJECT_COMPUTE_EDIT = 'project:compute:edit',
  PROJECT_ADDONS_VIEW = 'project:addons:view',
  PROJECT_ADDONS_MANAGE = 'project:addons:manage',
  PROJECT_DISK_VIEW = 'project:disk:view',
  PROJECT_DISK_EDIT = 'project:disk:edit',

  // Member permissions
  MEMBER_VIEW = 'member:view',
  MEMBER_INVITE = 'member:invite',
  MEMBER_EDIT = 'member:edit',
  MEMBER_REMOVE = 'member:remove',

  // Settings permissions
  SETTINGS_VIEW = 'settings:view',
  SETTINGS_EDIT = 'settings:edit',

  // Database permissions
  DATABASE_VIEW = 'database:view',
  DATABASE_EXECUTE = 'database:execute',
  DATABASE_MIGRATE = 'database:migrate',

  // API permissions
  API_KEY_VIEW = 'api:key:view',
  API_KEY_ROTATE = 'api:key:rotate',
}

/**
 * Enum defining available roles in the system.
 * Roles are hierarchical with owner having the highest privileges.
 */
export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  READ_ONLY = 'read_only',
}

/**
 * Role permission matrix defining which permissions each role has.
 * This is the single source of truth for role-based access control.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: [
    // Owners have ALL permissions
    ...Object.values(Permission),
  ],

  [Role.ADMIN]: [
    // Organization
    Permission.ORG_VIEW,
    Permission.ORG_EDIT,
    Permission.ORG_BILLING_VIEW,

    // Projects
    Permission.PROJECT_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_EDIT,
    Permission.PROJECT_COMPUTE_VIEW,
    Permission.PROJECT_COMPUTE_EDIT,
    Permission.PROJECT_ADDONS_VIEW,
    Permission.PROJECT_ADDONS_MANAGE,
    Permission.PROJECT_DISK_VIEW,
    Permission.PROJECT_DISK_EDIT,

    // Members
    Permission.MEMBER_VIEW,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_EDIT,

    // Settings
    Permission.SETTINGS_VIEW,
    Permission.SETTINGS_EDIT,

    // Database
    Permission.DATABASE_VIEW,
    Permission.DATABASE_EXECUTE,
    Permission.DATABASE_MIGRATE,

    // API
    Permission.API_KEY_VIEW,
  ],

  [Role.DEVELOPER]: [
    // Organization
    Permission.ORG_VIEW,

    // Projects
    Permission.PROJECT_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_COMPUTE_VIEW,
    Permission.PROJECT_ADDONS_VIEW,
    Permission.PROJECT_DISK_VIEW,

    // Members
    Permission.MEMBER_VIEW,

    // Settings
    Permission.SETTINGS_VIEW,

    // Database
    Permission.DATABASE_VIEW,
    Permission.DATABASE_EXECUTE,

    // API
    Permission.API_KEY_VIEW,
  ],

  [Role.READ_ONLY]: [
    // Organization
    Permission.ORG_VIEW,

    // Projects
    Permission.PROJECT_VIEW,
    Permission.PROJECT_COMPUTE_VIEW,
    Permission.PROJECT_ADDONS_VIEW,
    Permission.PROJECT_DISK_VIEW,

    // Members
    Permission.MEMBER_VIEW,

    // Settings
    Permission.SETTINGS_VIEW,

    // Database
    Permission.DATABASE_VIEW,

    // API
    Permission.API_KEY_VIEW,
  ],
}

/**
 * Role hierarchy levels used for comparing roles.
 * Higher numbers indicate higher privileges.
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.OWNER]: 4,
  [Role.ADMIN]: 3,
  [Role.DEVELOPER]: 2,
  [Role.READ_ONLY]: 1,
}

/**
 * Checks if a role has a specific permission.
 *
 * @param role - User role (owner, admin, developer, read_only)
 * @param permission - Permission to check
 * @returns true if the role has the permission, false otherwise
 *
 * @example
 * ```typescript
 * if (hasPermission('admin', Permission.ORG_EDIT)) {
 *   // Allow organization edit
 * }
 * ```
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role]
  if (!permissions) return false
  return permissions.includes(permission)
}

/**
 * Checks if a role has at least one of the specified permissions.
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @returns true if the role has any of the permissions
 *
 * @example
 * ```typescript
 * if (hasAnyPermission('developer', [Permission.PROJECT_EDIT, Permission.PROJECT_CREATE])) {
 *   // Allow project modification
 * }
 * ```
 */
export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

/**
 * Checks if a role has all of the specified permissions.
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @returns true if the role has all of the permissions
 *
 * @example
 * ```typescript
 * if (hasAllPermissions('admin', [Permission.ORG_EDIT, Permission.ORG_BILLING_VIEW])) {
 *   // Allow full organization management
 * }
 * ```
 */
export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p))
}

/**
 * Gets all permissions for a specific role.
 *
 * @param role - User role
 * @returns Array of permissions the role has, or empty array if role is invalid
 *
 * @example
 * ```typescript
 * const permissions = getRolePermissions('admin')
 * console.log('Admin has', permissions.length, 'permissions')
 * ```
 */
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || []
}

/**
 * Checks if a user's role meets the minimum required role level.
 * Uses role hierarchy to determine if userRole >= requiredRole.
 *
 * @param userRole - The user's current role
 * @param requiredRole - The minimum required role
 * @returns true if user's role is at or above the required level
 *
 * @example
 * ```typescript
 * if (hasMinimumRole('admin', 'developer')) {
 *   // Admin meets developer requirement
 * }
 * ```
 */
export function hasMinimumRole(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as Role] || 0
  const requiredLevel = ROLE_HIERARCHY[requiredRole as Role] || 0
  return userLevel >= requiredLevel
}

/**
 * Compares two roles to determine if the first is higher in hierarchy.
 *
 * @param role1 - First role to compare
 * @param role2 - Second role to compare
 * @returns true if role1 has higher privileges than role2
 *
 * @example
 * ```typescript
 * if (isHigherRole('admin', 'developer')) {
 *   // Admin can manage developer
 * }
 * ```
 */
export function isHigherRole(role1: string, role2: string): boolean {
  const level1 = ROLE_HIERARCHY[role1 as Role] || 0
  const level2 = ROLE_HIERARCHY[role2 as Role] || 0
  return level1 > level2
}

/**
 * Validates if a string is a valid role.
 *
 * @param role - String to validate
 * @returns true if the string is a valid role
 */
export function isValidRole(role: string): role is Role {
  return Object.values(Role).includes(role as Role)
}

/**
 * Gets the role hierarchy level.
 *
 * @param role - Role to get level for
 * @returns Numeric level (0 if invalid role)
 */
export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role as Role] || 0
}

/**
 * Express middleware factory for requiring a specific permission.
 * Returns 403 Forbidden if the user doesn't have the required permission.
 *
 * @param permission - Permission required to access the endpoint
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.patch('/api/org/:slug',
 *   requirePermission(Permission.ORG_EDIT),
 *   async (req, res) => {
 *     // Handle organization update
 *   }
 * )
 * ```
 */
export function requirePermission(permission: Permission) {
  return (req: any, res: any, next: any): void => {
    const userRole = req.user?.role

    if (!userRole || !hasPermission(userRole, permission)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
        required: permission,
      })
      return
    }

    next()
  }
}

/**
 * Express middleware factory for requiring a minimum role level.
 * Returns 403 Forbidden if the user's role is below the required level.
 *
 * @param requiredRole - Minimum role required
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * router.delete('/api/org/:slug',
 *   requireRole(Role.OWNER),
 *   async (req, res) => {
 *     // Handle organization deletion
 *   }
 * )
 * ```
 */
export function requireRole(requiredRole: Role) {
  return (req: any, res: any, next: any): void => {
    const userRole = req.user?.role

    if (!userRole || !hasMinimumRole(userRole, requiredRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `This action requires ${requiredRole} role or higher`,
        required: requiredRole,
        current: userRole,
      })
      return
    }

    next()
  }
}

/**
 * Type guard to check if a permission string is valid.
 *
 * @param permission - String to validate
 * @returns true if the string is a valid permission
 */
export function isValidPermission(permission: string): permission is Permission {
  return Object.values(Permission).includes(permission as Permission)
}

/**
 * Gets a human-readable description of a permission.
 *
 * @param permission - Permission to describe
 * @returns Human-readable description
 */
export function getPermissionDescription(permission: Permission): string {
  const descriptions: Record<Permission, string> = {
    [Permission.ORG_VIEW]: 'View organization details',
    [Permission.ORG_EDIT]: 'Edit organization settings',
    [Permission.ORG_DELETE]: 'Delete organization',
    [Permission.ORG_BILLING_VIEW]: 'View billing information',
    [Permission.ORG_BILLING_MANAGE]: 'Manage billing and subscriptions',
    [Permission.PROJECT_VIEW]: 'View project details',
    [Permission.PROJECT_CREATE]: 'Create new projects',
    [Permission.PROJECT_EDIT]: 'Edit project settings',
    [Permission.PROJECT_DELETE]: 'Delete projects',
    [Permission.PROJECT_COMPUTE_VIEW]: 'View compute instances',
    [Permission.PROJECT_COMPUTE_EDIT]: 'Modify compute instances',
    [Permission.PROJECT_ADDONS_VIEW]: 'View project addons',
    [Permission.PROJECT_ADDONS_MANAGE]: 'Manage project addons',
    [Permission.PROJECT_DISK_VIEW]: 'View disk configuration',
    [Permission.PROJECT_DISK_EDIT]: 'Modify disk configuration',
    [Permission.MEMBER_VIEW]: 'View team members',
    [Permission.MEMBER_INVITE]: 'Invite new members',
    [Permission.MEMBER_EDIT]: 'Edit member roles',
    [Permission.MEMBER_REMOVE]: 'Remove team members',
    [Permission.SETTINGS_VIEW]: 'View settings',
    [Permission.SETTINGS_EDIT]: 'Modify settings',
    [Permission.DATABASE_VIEW]: 'View database contents',
    [Permission.DATABASE_EXECUTE]: 'Execute database queries',
    [Permission.DATABASE_MIGRATE]: 'Run database migrations',
    [Permission.API_KEY_VIEW]: 'View API keys',
    [Permission.API_KEY_ROTATE]: 'Rotate API keys',
  }

  return descriptions[permission] || 'Unknown permission'
}

/**
 * Gets a human-readable description of a role.
 *
 * @param role - Role to describe
 * @returns Human-readable description
 */
export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    [Role.OWNER]: 'Full access to all organization and project resources',
    [Role.ADMIN]: 'Manage organization and projects, but cannot delete organization',
    [Role.DEVELOPER]: 'Create and view projects, execute queries, but limited management access',
    [Role.READ_ONLY]: 'View-only access to organization and projects',
  }

  return descriptions[role] || 'Unknown role'
}
