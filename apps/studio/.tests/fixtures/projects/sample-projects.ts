/**
 * Project Fixtures
 *
 * Mock project data for testing
 */

import type { MockProject } from '../../helpers/mocks'

/**
 * Active healthy project
 */
export const activeProject: MockProject = {
  id: 'proj_123456',
  ref: 'test-project-ref',
  name: 'Test Project',
  organizationId: '987fcdeb-51a2-43f1-b123-456789abcdef',
  status: 'ACTIVE_HEALTHY',
  region: 'us-east-1',
  createdAt: '2025-01-15T10:00:00Z',
}

/**
 * Inactive project
 */
export const inactiveProject: MockProject = {
  id: 'proj_234567',
  ref: 'inactive-project-ref',
  name: 'Inactive Project',
  organizationId: '987fcdeb-51a2-43f1-b123-456789abcdef',
  status: 'INACTIVE',
  region: 'us-west-2',
  createdAt: '2024-06-20T14:30:00Z',
}

/**
 * Restoring project
 */
export const restoringProject: MockProject = {
  id: 'proj_345678',
  ref: 'restoring-project-ref',
  name: 'Restoring Project',
  organizationId: '987fcdeb-51a2-43f1-b123-456789abcdef',
  status: 'RESTORING',
  region: 'eu-west-1',
  createdAt: '2024-12-01T09:15:00Z',
}

/**
 * Project in EU region
 */
export const euProject: MockProject = {
  id: 'proj_456789',
  ref: 'eu-project-ref',
  name: 'EU Project',
  organizationId: '876fcdeb-51a2-43f1-b123-456789abcdef',
  status: 'ACTIVE_HEALTHY',
  region: 'eu-central-1',
  createdAt: '2025-02-10T11:20:00Z',
}

/**
 * Project in AP region
 */
export const apProject: MockProject = {
  id: 'proj_567890',
  ref: 'ap-project-ref',
  name: 'AP Project',
  organizationId: '765fcdeb-51a2-43f1-b123-456789abcdef',
  status: 'ACTIVE_HEALTHY',
  region: 'ap-southeast-1',
  createdAt: '2025-03-05T08:45:00Z',
}

/**
 * Multiple projects in same org
 */
export const orgProjects: MockProject[] = [
  activeProject,
  inactiveProject,
  restoringProject,
]

/**
 * Projects across different orgs
 */
export const multiOrgProjects: MockProject[] = [
  activeProject,
  euProject,
  apProject,
]

/**
 * All project statuses
 */
export const allStatusProjects: MockProject[] = [
  activeProject,
  inactiveProject,
  restoringProject,
]
