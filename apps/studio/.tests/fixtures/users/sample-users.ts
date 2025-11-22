/**
 * User and Session Fixtures
 *
 * Mock user and session data for testing
 */

import type { MockUser, MockSession } from '../../helpers/mocks'

/**
 * Owner user
 */
export const ownerUser: MockUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'owner@example.com',
  name: 'Test Owner',
  role: 'owner',
  organizations: [
    {
      id: '987fcdeb-51a2-43f1-b123-456789abcdef',
      name: 'Test Organization',
      role: 'owner',
    },
  ],
}

/**
 * Admin user
 */
export const adminUser: MockUser = {
  id: '234e5678-e89b-12d3-a456-426614174001',
  email: 'admin@example.com',
  name: 'Test Admin',
  role: 'admin',
  organizations: [
    {
      id: '987fcdeb-51a2-43f1-b123-456789abcdef',
      name: 'Test Organization',
      role: 'admin',
    },
  ],
}

/**
 * Member user
 */
export const memberUser: MockUser = {
  id: '345e6789-e89b-12d3-a456-426614174002',
  email: 'member@example.com',
  name: 'Test Member',
  role: 'member',
  organizations: [
    {
      id: '987fcdeb-51a2-43f1-b123-456789abcdef',
      name: 'Test Organization',
      role: 'member',
    },
  ],
}

/**
 * User in multiple organizations
 */
export const multiOrgUser: MockUser = {
  id: '456e7890-e89b-12d3-a456-426614174003',
  email: 'multi@example.com',
  name: 'Multi Org User',
  role: 'owner',
  organizations: [
    {
      id: '987fcdeb-51a2-43f1-b123-456789abcdef',
      name: 'First Organization',
      role: 'owner',
    },
    {
      id: '876fcdeb-51a2-43f1-b123-456789abcdef',
      name: 'Second Organization',
      role: 'admin',
    },
    {
      id: '765fcdeb-51a2-43f1-b123-456789abcdef',
      name: 'Third Organization',
      role: 'member',
    },
  ],
}

/**
 * Valid session for owner
 */
export const validOwnerSession: MockSession = {
  userId: ownerUser.id,
  activeOrgId: ownerUser.organizations[0].id,
  email: ownerUser.email,
  name: ownerUser.name,
  role: 'owner',
  expiresAt: Date.now() + 3600000, // 1 hour from now
}

/**
 * Valid session for admin
 */
export const validAdminSession: MockSession = {
  userId: adminUser.id,
  activeOrgId: adminUser.organizations[0].id,
  email: adminUser.email,
  name: adminUser.name,
  role: 'admin',
  expiresAt: Date.now() + 3600000,
}

/**
 * Valid session for member
 */
export const validMemberSession: MockSession = {
  userId: memberUser.id,
  activeOrgId: memberUser.organizations[0].id,
  email: memberUser.email,
  name: memberUser.name,
  role: 'member',
  expiresAt: Date.now() + 3600000,
}

/**
 * Expired session
 */
export const expiredSession: MockSession = {
  userId: ownerUser.id,
  activeOrgId: ownerUser.organizations[0].id,
  email: ownerUser.email,
  name: ownerUser.name,
  role: 'owner',
  expiresAt: Date.now() - 3600000, // 1 hour ago
}

/**
 * Session about to expire (5 minutes left)
 */
export const expiringSession: MockSession = {
  userId: ownerUser.id,
  activeOrgId: ownerUser.organizations[0].id,
  email: ownerUser.email,
  name: ownerUser.name,
  role: 'owner',
  expiresAt: Date.now() + 300000, // 5 minutes from now
}

/**
 * Fresh session (just created)
 */
export const freshSession: MockSession = {
  userId: ownerUser.id,
  activeOrgId: ownerUser.organizations[0].id,
  email: ownerUser.email,
  name: ownerUser.name,
  role: 'owner',
  expiresAt: Date.now() + 86400000, // 24 hours from now
}

/**
 * All user types
 */
export const allUsers: MockUser[] = [
  ownerUser,
  adminUser,
  memberUser,
  multiOrgUser,
]

/**
 * All session states
 */
export const allSessions: MockSession[] = [
  validOwnerSession,
  validAdminSession,
  validMemberSession,
  expiredSession,
  expiringSession,
  freshSession,
]
