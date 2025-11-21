#!/usr/bin/env node

/**
 * FINAL INTEGRATION TEST SUITE - TICKET-20
 * Complete end-to-end multi-tenant platform validation
 *
 * Tests:
 * ✓ Authentication flow (signup → signin → session → signout)
 * ✓ Multi-user scenarios (User A cannot see User B's data)
 * ✓ Organization management (CRUD + access control)
 * ✓ Project management (CRUD + compute/disk + metrics)
 * ✓ Team management (invites, roles, permissions)
 * ✓ Audit logging (all critical actions tracked)
 * ✓ Profile integration (user sees only their data)
 *
 * Usage:
 *   node test-final-integration.js [base-url]
 *
 * Example:
 *   node test-final-integration.js http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

// Test users we'll create
const TEST_USERS = {
  userA: {
    email: `alice-${Date.now()}@example.com`,
    password: 'SecureAlice123!',
    first_name: 'Alice',
    last_name: 'Anderson',
    username: `alice${Date.now()}`,
    token: null,
    userId: null,
  },
  userB: {
    email: `bob-${Date.now()}@example.com`,
    password: 'SecureBob123!',
    first_name: 'Bob',
    last_name: 'Builder',
    username: `bob${Date.now()}`,
    token: null,
    userId: null,
  },
  userC: {
    email: `carol-${Date.now()}@example.com`,
    password: 'SecureCarol123!',
    first_name: 'Carol',
    last_name: 'Chen',
    username: `carol${Date.now()}`,
    token: null,
    userId: null,
  },
};

// Test data we'll create
let TEST_DATA = {
  orgAlice: null, // Alice's organization
  orgBob: null, // Bob's organization
  projectAlice1: null, // Alice's project in her org
  projectAlice2: null, // Another project in Alice's org
  projectBob: null, // Bob's project in his org
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  suites: {},
};

// Current suite tracking
let currentSuite = null;

/**
 * Helper: Make HTTP request
 */
async function request(path, method = 'GET', body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, options);
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: response.headers,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Test assertion
 */
function assert(condition, testName, details = null) {
  testResults.total++;

  if (!testResults.suites[currentSuite]) {
    testResults.suites[currentSuite] = { passed: 0, failed: 0, tests: [] };
  }

  if (condition) {
    testResults.passed++;
    testResults.suites[currentSuite].passed++;
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    testResults.suites[currentSuite].tests.push({ name: testName, passed: true });
    return true;
  } else {
    testResults.failed++;
    testResults.suites[currentSuite].failed++;
    console.log(`  ${colors.red}✗${colors.reset} ${testName}`);
    if (details) {
      console.log(`    ${colors.dim}${details}${colors.reset}`);
    }
    testResults.suites[currentSuite].tests.push({ name: testName, passed: false, details });
    return false;
  }
}

/**
 * Suite header
 */
function testSuite(name) {
  currentSuite = name;
  console.log(`\n${colors.cyan}${'━'.repeat(70)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${name}${colors.reset}`);
  console.log(`${colors.cyan}${'━'.repeat(70)}${colors.reset}`);
}

/**
 * Log info
 */
function info(message) {
  console.log(`  ${colors.blue}ℹ${colors.reset} ${message}`);
}

/**
 * SUITE 1: Authentication Flow
 */
async function testAuthenticationFlow() {
  testSuite('SUITE 1: Authentication Flow');

  // Test 1.1: Sign up User A
  info('Creating User A (Alice)...');
  const signupA = await request('/api/auth/signup', 'POST', TEST_USERS.userA);
  assert(
    signupA.status === 201 && signupA.data.user,
    'User A signup successful',
    signupA.status !== 201 ? `Status: ${signupA.status}, ${JSON.stringify(signupA.data)}` : null
  );
  if (signupA.data.user) {
    TEST_USERS.userA.userId = signupA.data.user.id;
  }

  // Test 1.2: Sign up User B
  info('Creating User B (Bob)...');
  const signupB = await request('/api/auth/signup', 'POST', TEST_USERS.userB);
  assert(
    signupB.status === 201 && signupB.data.user,
    'User B signup successful',
    signupB.status !== 201 ? `Status: ${signupB.status}` : null
  );
  if (signupB.data.user) {
    TEST_USERS.userB.userId = signupB.data.user.id;
  }

  // Test 1.3: Sign up User C
  info('Creating User C (Carol)...');
  const signupC = await request('/api/auth/signup', 'POST', TEST_USERS.userC);
  assert(
    signupC.status === 201 && signupC.data.user,
    'User C signup successful',
    signupC.status !== 201 ? `Status: ${signupC.status}` : null
  );
  if (signupC.data.user) {
    TEST_USERS.userC.userId = signupC.data.user.id;
  }

  // Test 1.4: Sign in User A
  info('Signing in User A...');
  const signinA = await request('/api/auth/signin', 'POST', {
    email: TEST_USERS.userA.email,
    password: TEST_USERS.userA.password,
  });
  assert(
    signinA.status === 200 && signinA.data.token,
    'User A signin successful',
    signinA.status !== 200 ? `Status: ${signinA.status}` : null
  );
  if (signinA.data.token) {
    TEST_USERS.userA.token = signinA.data.token;
  }

  // Test 1.5: Sign in User B
  info('Signing in User B...');
  const signinB = await request('/api/auth/signin', 'POST', {
    email: TEST_USERS.userB.email,
    password: TEST_USERS.userB.password,
  });
  assert(
    signinB.status === 200 && signinB.data.token,
    'User B signin successful',
    signinB.status !== 200 ? `Status: ${signinB.status}` : null
  );
  if (signinB.data.token) {
    TEST_USERS.userB.token = signinB.data.token;
  }

  // Test 1.6: Sign in User C
  info('Signing in User C...');
  const signinC = await request('/api/auth/signin', 'POST', {
    email: TEST_USERS.userC.email,
    password: TEST_USERS.userC.password,
  });
  assert(
    signinC.status === 200 && signinC.data.token,
    'User C signin successful',
    signinC.status !== 200 ? `Status: ${signinC.status}` : null
  );
  if (signinC.data.token) {
    TEST_USERS.userC.token = signinC.data.token;
  }

  // Test 1.7: Token refresh for User A
  info('Testing token refresh...');
  const refresh = await request('/api/auth/refresh', 'POST', null, TEST_USERS.userA.token);
  assert(
    refresh.status === 200 && refresh.data.token,
    'Token refresh successful',
    refresh.status !== 200 ? `Status: ${refresh.status}` : null
  );
  if (refresh.data.token) {
    TEST_USERS.userA.token = refresh.data.token; // Use new token
  }

  // Test 1.8: Invalid credentials rejected
  info('Testing invalid credentials...');
  const invalidSignin = await request('/api/auth/signin', 'POST', {
    email: TEST_USERS.userA.email,
    password: 'WrongPassword123!',
  });
  assert(invalidSignin.status === 401, 'Invalid credentials correctly rejected', null);

  // Test 1.9: Protected route without token
  info('Testing protected route without auth...');
  const noAuth = await request('/api/platform/profile');
  assert(noAuth.status === 401, 'Protected route requires authentication', null);

  // Test 1.10: Protected route with valid token
  info('Testing protected route with auth...');
  const withAuth = await request('/api/platform/profile', 'GET', null, TEST_USERS.userA.token);
  assert(withAuth.status === 200, 'Protected route accessible with valid token', null);
}

/**
 * SUITE 2: Organization Management
 */
async function testOrganizationManagement() {
  testSuite('SUITE 2: Organization Management');

  // Test 2.1: User A creates organization
  info('User A creating organization...');
  const createOrgA = await request(
    '/api/platform/organizations',
    'POST',
    {
      name: `Alice Corp ${Date.now()}`,
      slug: `alice-corp-${Date.now()}`,
      billing_email: TEST_USERS.userA.email,
    },
    TEST_USERS.userA.token
  );
  assert(
    createOrgA.status === 201 && createOrgA.data.id,
    'User A organization created',
    createOrgA.status !== 201 ? `Status: ${createOrgA.status}, ${JSON.stringify(createOrgA.data)}` : null
  );
  if (createOrgA.data.id) {
    TEST_DATA.orgAlice = createOrgA.data;
  }

  // Test 2.2: User B creates organization
  info('User B creating organization...');
  const createOrgB = await request(
    '/api/platform/organizations',
    'POST',
    {
      name: `Bob Industries ${Date.now()}`,
      slug: `bob-industries-${Date.now()}`,
      billing_email: TEST_USERS.userB.email,
    },
    TEST_USERS.userB.token
  );
  assert(
    createOrgB.status === 201 && createOrgB.data.id,
    'User B organization created',
    createOrgB.status !== 201 ? `Status: ${createOrgB.status}` : null
  );
  if (createOrgB.data.id) {
    TEST_DATA.orgBob = createOrgB.data;
  }

  // Test 2.3: User A can view their organization
  info('User A viewing their organization...');
  const viewOrgA = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}`,
    'GET',
    null,
    TEST_USERS.userA.token
  );
  assert(viewOrgA.status === 200, 'User A can view their organization', null);

  // Test 2.4: User B CANNOT view User A's organization
  info('User B attempting to view User A organization...');
  const viewOrgAByB = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}`,
    'GET',
    null,
    TEST_USERS.userB.token
  );
  assert(
    viewOrgAByB.status === 403 || viewOrgAByB.status === 404,
    'User B cannot view User A organization',
    `Status: ${viewOrgAByB.status}`
  );

  // Test 2.5: User A can list their organizations
  info('User A listing their organizations...');
  const listOrgsA = await request('/api/platform/organizations', 'GET', null, TEST_USERS.userA.token);
  assert(
    listOrgsA.status === 200 && Array.isArray(listOrgsA.data),
    'User A can list organizations',
    null
  );
  const userAOrgs = listOrgsA.data.filter((org) => org.slug === TEST_DATA.orgAlice.slug);
  assert(userAOrgs.length > 0, 'User A sees their own organization in list', null);

  // Test 2.6: User A does NOT see User B's organization in list
  const userASeesB = listOrgsA.data.filter((org) => org.slug === TEST_DATA.orgBob.slug);
  assert(userASeesB.length === 0, 'User A does not see User B organization in list', null);

  // Test 2.7: Update organization (owner only)
  info('User A updating organization settings...');
  const updateOrg = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}`,
    'PATCH',
    {
      name: 'Alice Corporation Updated',
    },
    TEST_USERS.userA.token
  );
  assert(updateOrg.status === 200, 'Organization owner can update settings', null);
}

/**
 * SUITE 3: Project Management
 */
async function testProjectManagement() {
  testSuite('SUITE 3: Project Management');

  // Test 3.1: User A creates project in their organization
  info('User A creating project...');
  const createProjectA1 = await request(
    '/api/platform/projects/create',
    'POST',
    {
      name: `Alice Project 1 ${Date.now()}`,
      organization_id: TEST_DATA.orgAlice.id,
      plan: 'free',
      region: 'us-east-1',
      db_pass: 'SecureDbPass123!',
    },
    TEST_USERS.userA.token
  );
  assert(
    createProjectA1.status === 201 && createProjectA1.data.id,
    'User A project created',
    createProjectA1.status !== 201
      ? `Status: ${createProjectA1.status}, ${JSON.stringify(createProjectA1.data)}`
      : null
  );
  if (createProjectA1.data.id) {
    TEST_DATA.projectAlice1 = createProjectA1.data;
  }

  // Test 3.2: User A creates another project
  info('User A creating second project...');
  const createProjectA2 = await request(
    '/api/platform/projects/create',
    'POST',
    {
      name: `Alice Project 2 ${Date.now()}`,
      organization_id: TEST_DATA.orgAlice.id,
      plan: 'free',
      region: 'us-east-1',
      db_pass: 'SecureDbPass123!',
    },
    TEST_USERS.userA.token
  );
  assert(
    createProjectA2.status === 201 && createProjectA2.data.id,
    'User A second project created',
    createProjectA2.status !== 201 ? `Status: ${createProjectA2.status}` : null
  );
  if (createProjectA2.data.id) {
    TEST_DATA.projectAlice2 = createProjectA2.data;
  }

  // Test 3.3: User B creates project in their organization
  info('User B creating project...');
  const createProjectB = await request(
    '/api/platform/projects/create',
    'POST',
    {
      name: `Bob Project ${Date.now()}`,
      organization_id: TEST_DATA.orgBob.id,
      plan: 'free',
      region: 'us-east-1',
      db_pass: 'SecureDbPass123!',
    },
    TEST_USERS.userB.token
  );
  assert(
    createProjectB.status === 201 && createProjectB.data.id,
    'User B project created',
    createProjectB.status !== 201 ? `Status: ${createProjectB.status}` : null
  );
  if (createProjectB.data.id) {
    TEST_DATA.projectBob = createProjectB.data;
  }

  // Test 3.4: User A can view their project
  info('User A viewing their project...');
  const viewProjectA = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}`,
    'GET',
    null,
    TEST_USERS.userA.token
  );
  assert(viewProjectA.status === 200, 'User A can view their project', null);

  // Test 3.5: User B CANNOT view User A's project
  info('User B attempting to view User A project...');
  const viewProjectAByB = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}`,
    'GET',
    null,
    TEST_USERS.userB.token
  );
  assert(
    viewProjectAByB.status === 403 || viewProjectAByB.status === 404,
    'User B cannot view User A project',
    `Status: ${viewProjectAByB.status}`
  );

  // Test 3.6: User A can update compute config
  info('User A updating compute configuration...');
  const updateCompute = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}/compute`,
    'POST',
    {
      instance_size: 'micro',
    },
    TEST_USERS.userA.token
  );
  assert(updateCompute.status === 200, 'Project owner can update compute config', null);

  // Test 3.7: User A can update disk config
  info('User A updating disk configuration...');
  const updateDisk = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}/disk`,
    'POST',
    {
      size_gb: 16,
    },
    TEST_USERS.userA.token
  );
  assert(updateDisk.status === 200, 'Project owner can update disk config', null);

  // Test 3.8: User A can list projects
  info('User A listing projects...');
  const listProjectsA = await request('/api/platform/projects', 'GET', null, TEST_USERS.userA.token);
  assert(
    listProjectsA.status === 200 && Array.isArray(listProjectsA.data),
    'User A can list projects',
    null
  );

  // Test 3.9: User A sees only their projects
  const userAProjects = listProjectsA.data.filter(
    (p) => p.ref === TEST_DATA.projectAlice1.ref || p.ref === TEST_DATA.projectAlice2.ref
  );
  assert(
    userAProjects.length === 2,
    'User A sees their own projects',
    `Found ${userAProjects.length} projects`
  );

  // Test 3.10: User A does NOT see User B's projects
  const userASeesB = listProjectsA.data.filter((p) => p.ref === TEST_DATA.projectBob.ref);
  assert(
    userASeesB.length === 0,
    'User A does not see User B projects',
    `Found ${userASeesB.length} of User B projects`
  );
}

/**
 * SUITE 4: Team Management & Invites
 */
async function testTeamManagement() {
  testSuite('SUITE 4: Team Management & Member Invites');

  // Test 4.1: User A invites User C to organization
  info('User A inviting User C to organization...');
  const inviteC = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members`,
    'POST',
    {
      user_id: TEST_USERS.userC.userId,
      role: 'developer',
    },
    TEST_USERS.userA.token
  );
  assert(
    inviteC.status === 201 || inviteC.status === 200,
    'Organization owner can invite members',
    inviteC.status !== 201 && inviteC.status !== 200 ? `Status: ${inviteC.status}` : null
  );

  // Test 4.2: User C can now view organization
  info('User C viewing organization after invite...');
  const viewOrgByC = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}`,
    'GET',
    null,
    TEST_USERS.userC.token
  );
  assert(viewOrgByC.status === 200, 'Invited member can view organization', null);

  // Test 4.3: User C can view projects via organization membership
  info('User C viewing project via org membership...');
  const viewProjectByC = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}`,
    'GET',
    null,
    TEST_USERS.userC.token
  );
  assert(
    viewProjectByC.status === 200,
    'Organization member can view projects',
    `Status: ${viewProjectByC.status}`
  );

  // Test 4.4: User C (developer role) CANNOT update compute
  info('User C attempting to update compute (should fail)...');
  const updateComputeByC = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}/compute`,
    'POST',
    {
      instance_size: 'small',
    },
    TEST_USERS.userC.token
  );
  assert(
    updateComputeByC.status === 403,
    'Developer role cannot update compute config',
    `Status: ${updateComputeByC.status}`
  );

  // Test 4.5: List organization members
  info('User A listing organization members...');
  const listMembers = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members`,
    'GET',
    null,
    TEST_USERS.userA.token
  );
  assert(listMembers.status === 200 && Array.isArray(listMembers.data), 'Can list members', null);
  assert(listMembers.data.length >= 2, 'Organization has multiple members', null);

  // Test 4.6: User A changes User C role to admin
  info('User A promoting User C to admin...');
  const updateRole = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members/${TEST_USERS.userC.userId}`,
    'PATCH',
    {
      role: 'admin',
    },
    TEST_USERS.userA.token
  );
  assert(updateRole.status === 200, 'Owner can change member roles', null);

  // Test 4.7: User C (now admin) CAN update compute
  info('User C (now admin) updating compute...');
  const updateComputeByAdmin = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}/compute`,
    'POST',
    {
      instance_size: 'micro',
    },
    TEST_USERS.userC.token
  );
  assert(updateComputeByAdmin.status === 200, 'Admin role can update compute config', null);

  // Test 4.8: User C CANNOT remove themselves
  info('User C attempting to remove themselves (should fail)...');
  const removeSelf = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members/${TEST_USERS.userC.userId}`,
    'DELETE',
    null,
    TEST_USERS.userC.token
  );
  assert(
    removeSelf.status === 400 || removeSelf.status === 403,
    'Member cannot remove themselves',
    `Status: ${removeSelf.status}`
  );

  // Test 4.9: User C CANNOT change their own role
  info('User C attempting to change own role (should fail)...');
  const changeOwnRole = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members/${TEST_USERS.userC.userId}`,
    'PATCH',
    {
      role: 'owner',
    },
    TEST_USERS.userC.token
  );
  assert(
    changeOwnRole.status === 400 || changeOwnRole.status === 403,
    'Member cannot change own role',
    `Status: ${changeOwnRole.status}`
  );
}

/**
 * SUITE 5: Audit Logging
 */
async function testAuditLogging() {
  testSuite('SUITE 5: Audit Logging');

  // All previous operations should have generated audit logs
  // Test 5.1: User A can view audit logs
  info('User A viewing audit logs...');
  const viewLogs = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/audit-logs`,
    'GET',
    null,
    TEST_USERS.userA.token
  );
  assert(viewLogs.status === 200 && Array.isArray(viewLogs.data), 'Can view audit logs', null);
  assert(viewLogs.data.length > 0, 'Audit logs contain entries', `Found ${viewLogs.data.length} logs`);

  // Test 5.2: Audit logs include organization creation
  const orgCreationLog = viewLogs.data.find((log) => log.action === 'organization.created');
  assert(orgCreationLog !== undefined, 'Organization creation logged', null);

  // Test 5.3: Audit logs include project creation
  const projectCreationLog = viewLogs.data.find((log) => log.action === 'project.created');
  assert(projectCreationLog !== undefined, 'Project creation logged', null);

  // Test 5.4: Audit logs include member invite
  const memberInviteLog = viewLogs.data.find((log) => log.action === 'member.invited' || log.action === 'member.added');
  assert(memberInviteLog !== undefined, 'Member invite logged', null);

  // Test 5.5: Audit logs include role change
  const roleChangeLog = viewLogs.data.find((log) => log.action === 'member.role_changed');
  assert(roleChangeLog !== undefined, 'Role change logged', null);

  // Test 5.6: Filter audit logs by action type
  info('Testing audit log filtering...');
  const filteredLogs = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/audit-logs?action=project.created`,
    'GET',
    null,
    TEST_USERS.userA.token
  );
  assert(
    filteredLogs.status === 200 && Array.isArray(filteredLogs.data),
    'Can filter audit logs by action',
    null
  );

  // Test 5.7: User B CANNOT view User A's audit logs
  info('User B attempting to view User A audit logs...');
  const viewLogsByB = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/audit-logs`,
    'GET',
    null,
    TEST_USERS.userB.token
  );
  assert(
    viewLogsByB.status === 403 || viewLogsByB.status === 404,
    'Non-member cannot view audit logs',
    `Status: ${viewLogsByB.status}`
  );
}

/**
 * SUITE 6: Profile Integration
 */
async function testProfileIntegration() {
  testSuite('SUITE 6: Profile Integration');

  // Test 6.1: User A views profile
  info('User A viewing profile...');
  const profileA = await request('/api/platform/profile', 'GET', null, TEST_USERS.userA.token);
  assert(profileA.status === 200, 'User can view profile', null);
  assert(profileA.data.id === TEST_USERS.userA.userId, 'Profile shows correct user ID', null);

  // Test 6.2: Profile includes organizations
  assert(
    profileA.data.organizations && Array.isArray(profileA.data.organizations),
    'Profile includes organizations array',
    null
  );

  // Test 6.3: User A sees their organization in profile
  const userAOrgInProfile = profileA.data.organizations.find(
    (org) => org.slug === TEST_DATA.orgAlice.slug
  );
  assert(userAOrgInProfile !== undefined, 'User sees their organization in profile', null);

  // Test 6.4: Profile shows correct role
  assert(
    userAOrgInProfile.role === 'owner',
    'Profile shows correct role for organization',
    `Role: ${userAOrgInProfile.role}`
  );

  // Test 6.5: User C views profile
  info('User C viewing profile...');
  const profileC = await request('/api/platform/profile', 'GET', null, TEST_USERS.userC.token);
  assert(profileC.status === 200, 'User C can view profile', null);

  // Test 6.6: User C sees organization they were invited to
  const userCOrgInProfile = profileC.data.organizations.find(
    (org) => org.slug === TEST_DATA.orgAlice.slug
  );
  assert(
    userCOrgInProfile !== undefined,
    'Invited member sees organization in profile',
    null
  );

  // Test 6.7: User C sees correct role in profile
  assert(
    userCOrgInProfile.role === 'admin',
    'Profile shows updated role (admin)',
    `Role: ${userCOrgInProfile.role}`
  );

  // Test 6.8: User B does NOT see User A's organization
  info('User B viewing profile...');
  const profileB = await request('/api/platform/profile', 'GET', null, TEST_USERS.userB.token);
  const userBSeesA = profileB.data.organizations.find(
    (org) => org.slug === TEST_DATA.orgAlice.slug
  );
  assert(
    userBSeesA === undefined,
    'User B does not see User A organization in profile',
    null
  );
}

/**
 * SUITE 7: Permission Edge Cases
 */
async function testPermissionEdgeCases() {
  testSuite('SUITE 7: Permission Edge Cases');

  // Test 7.1: Read-only member added
  info('User A adding read-only member...');
  const addReadOnly = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members`,
    'POST',
    {
      user_id: TEST_USERS.userB.userId, // Temporarily add User B as read-only
      role: 'read_only',
    },
    TEST_USERS.userA.token
  );
  assert(
    addReadOnly.status === 201 || addReadOnly.status === 200,
    'Can add read-only member',
    null
  );

  // Test 7.2: Read-only member can view but not modify
  info('Read-only member attempting update...');
  const readOnlyUpdate = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}/compute`,
    'POST',
    {
      instance_size: 'small',
    },
    TEST_USERS.userB.token
  );
  assert(
    readOnlyUpdate.status === 403,
    'Read-only member cannot modify resources',
    `Status: ${readOnlyUpdate.status}`
  );

  // Test 7.3: Read-only member can view
  info('Read-only member viewing project...');
  const readOnlyView = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}`,
    'GET',
    null,
    TEST_USERS.userB.token
  );
  assert(
    readOnlyView.status === 200,
    'Read-only member can view resources',
    `Status: ${readOnlyView.status}`
  );

  // Test 7.4: Remove read-only member
  info('User A removing read-only member...');
  const removeReadOnly = await request(
    `/api/platform/organizations/${TEST_DATA.orgAlice.slug}/members/${TEST_USERS.userB.userId}`,
    'DELETE',
    null,
    TEST_USERS.userA.token
  );
  assert(removeReadOnly.status === 200 || removeReadOnly.status === 204, 'Can remove member', null);

  // Test 7.5: Removed member loses access
  info('Removed member attempting to view project...');
  const removedMemberView = await request(
    `/api/platform/projects/${TEST_DATA.projectAlice1.ref}`,
    'GET',
    null,
    TEST_USERS.userB.token
  );
  assert(
    removedMemberView.status === 403 || removedMemberView.status === 404,
    'Removed member loses access',
    `Status: ${removedMemberView.status}`
  );
}

/**
 * SUITE 8: Cleanup & Sign Out
 */
async function testCleanupAndSignout() {
  testSuite('SUITE 8: Session Cleanup & Sign Out');

  // Test 8.1: User A signs out
  info('User A signing out...');
  const signoutA = await request('/api/auth/signout', 'POST', null, TEST_USERS.userA.token);
  assert(signoutA.status === 200, 'User A signout successful', null);

  // Test 8.2: Signed out token no longer works
  info('Testing signed out token...');
  const afterSignout = await request('/api/platform/profile', 'GET', null, TEST_USERS.userA.token);
  assert(
    afterSignout.status === 401,
    'Signed out token rejected',
    `Status: ${afterSignout.status}`
  );

  // Test 8.3: User B signs out
  info('User B signing out...');
  const signoutB = await request('/api/auth/signout', 'POST', null, TEST_USERS.userB.token);
  assert(signoutB.status === 200, 'User B signout successful', null);

  // Test 8.4: User C signs out
  info('User C signing out...');
  const signoutC = await request('/api/auth/signout', 'POST', null, TEST_USERS.userC.token);
  assert(signoutC.status === 200, 'User C signout successful', null);
}

/**
 * Print final summary
 */
function printSummary() {
  console.log(`\n${colors.bright}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}FINAL TEST SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${'═'.repeat(70)}${colors.reset}\n`);

  // Suite breakdown
  for (const [suiteName, suite] of Object.entries(testResults.suites)) {
    const total = suite.passed + suite.failed;
    const percentage = total > 0 ? ((suite.passed / total) * 100).toFixed(1) : 0;
    const color = suite.failed === 0 ? colors.green : colors.yellow;

    console.log(`${color}${suiteName}${colors.reset}`);
    console.log(`  ${suite.passed}/${total} passed (${percentage}%)`);
    if (suite.failed > 0) {
      console.log(`  ${colors.red}Failed tests:${colors.reset}`);
      suite.tests
        .filter((t) => !t.passed)
        .forEach((t) => {
          console.log(`    - ${t.name}`);
          if (t.details) {
            console.log(`      ${colors.dim}${t.details}${colors.reset}`);
          }
        });
    }
    console.log('');
  }

  // Overall summary
  const percentage = ((testResults.passed / testResults.total) * 100).toFixed(1);
  const coverageColor =
    percentage >= 95 ? colors.green : percentage >= 80 ? colors.yellow : colors.red;

  console.log(`${colors.bright}Overall Results:${colors.reset}`);
  console.log(`  Total Tests:   ${testResults.total}`);
  console.log(`  ${colors.green}Passed:${colors.reset}        ${testResults.passed}`);
  console.log(`  ${colors.red}Failed:${colors.reset}        ${testResults.failed}`);
  console.log(
    `  ${coverageColor}Coverage:${colors.reset}      ${percentage}%\n`
  );

  // Production readiness assessment
  console.log(`${colors.bright}Production Readiness Assessment:${colors.reset}`);
  if (testResults.failed === 0 && percentage >= 95) {
    console.log(`  ${colors.green}✓ READY FOR PRODUCTION${colors.reset}`);
    console.log(`  ${colors.green}  All critical flows validated${colors.reset}`);
    console.log(`  ${colors.green}  Multi-tenancy enforced${colors.reset}`);
    console.log(`  ${colors.green}  Permissions working correctly${colors.reset}`);
    console.log(`  ${colors.green}  Audit logging operational${colors.reset}\n`);
  } else if (percentage >= 80) {
    console.log(`  ${colors.yellow}⚠ NEEDS ATTENTION${colors.reset}`);
    console.log(`  ${colors.yellow}  Some tests failing - review required${colors.reset}\n`);
  } else {
    console.log(`  ${colors.red}✗ NOT READY${colors.reset}`);
    console.log(`  ${colors.red}  Critical failures detected${colors.reset}\n`);
  }

  console.log(`${colors.bright}${'═'.repeat(70)}${colors.reset}\n`);
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log(`${colors.bright}${colors.blue}╔${'═'.repeat(68)}╗${colors.reset}`);
  console.log(
    `${colors.bright}${colors.blue}║${' '.repeat(18)}FINAL INTEGRATION TEST SUITE${' '.repeat(21)}║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.blue}║${' '.repeat(22)}TICKET-20: Complete E2E${' '.repeat(22)}║${colors.reset}`
  );
  console.log(`${colors.bright}${colors.blue}╚${'═'.repeat(68)}╝${colors.reset}`);
  console.log(`\n${colors.dim}Base URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.dim}Test Start: ${new Date().toISOString()}${colors.reset}\n`);

  try {
    await testAuthenticationFlow();
    await testOrganizationManagement();
    await testProjectManagement();
    await testTeamManagement();
    await testAuditLogging();
    await testProfileIntegration();
    await testPermissionEdgeCases();
    await testCleanupAndSignout();

    printSummary();

    process.exit(testResults.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}FATAL ERROR:${colors.reset}`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Check Node.js version
if (typeof fetch === 'undefined') {
  console.error(`${colors.red}✗ This script requires Node.js 18+ for native fetch${colors.reset}`);
  process.exit(1);
}

// Run the tests
runAllTests();
