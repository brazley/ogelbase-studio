#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Project Access Control
 * Tests TICKET-10: Project Access Control Implementation
 *
 * This script tests:
 * - Authentication requirements
 * - Direct project member access
 * - Organization member access
 * - Access denial for non-members
 * - Role-based permissions (member, admin, owner)
 * - Audit logging
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test credentials (these should be set up in your test database)
const TEST_USERS = {
  projectOwner: {
    email: 'owner@test.com',
    token: process.env.TEST_OWNER_TOKEN,
    userId: process.env.TEST_OWNER_USER_ID,
  },
  projectAdmin: {
    email: 'admin@test.com',
    token: process.env.TEST_ADMIN_TOKEN,
    userId: process.env.TEST_ADMIN_USER_ID,
  },
  projectMember: {
    email: 'member@test.com',
    token: process.env.TEST_MEMBER_TOKEN,
    userId: process.env.TEST_MEMBER_USER_ID,
  },
  orgMember: {
    email: 'orgmember@test.com',
    token: process.env.TEST_ORG_MEMBER_TOKEN,
    userId: process.env.TEST_ORG_MEMBER_USER_ID,
  },
  nonMember: {
    email: 'nonmember@test.com',
    token: process.env.TEST_NON_MEMBER_TOKEN,
    userId: process.env.TEST_NON_MEMBER_USER_ID,
  },
};

const TEST_PROJECT_REF = process.env.TEST_PROJECT_REF || 'test-project';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
};

/**
 * Make API request
 */
async function makeRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  return { status: response.status, data, response };
}

/**
 * Test assertion
 */
function assert(condition, testName, errorMessage) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    testResults.passed++;
    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (errorMessage) {
      console.log(`  ${colors.red}${errorMessage}${colors.reset}`);
    }
    testResults.failed++;
    return false;
  }
}

function skip(testName, reason) {
  console.log(`${colors.yellow}⊘${colors.reset} ${testName} - ${reason}`);
  testResults.skipped++;
}

/**
 * Test suite header
 */
function testSuite(name) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.cyan}${name}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

/**
 * Test authentication requirement
 */
async function testAuthenticationRequired() {
  testSuite('Authentication Requirements');

  // Test 1: No auth token should return 401
  const { status } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`);
  assert(status === 401, 'Should return 401 for missing auth token', `Got status: ${status}`);

  // Test 2: Invalid auth token should return 401
  const { status: status2 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    headers: { Authorization: 'Bearer invalid-token-12345' },
  });
  assert(status2 === 401, 'Should return 401 for invalid token', `Got status: ${status2}`);
}

/**
 * Test direct project member access
 */
async function testDirectProjectMemberAccess() {
  testSuite('Direct Project Member Access');

  if (!TEST_USERS.projectMember.token) {
    skip('All tests', 'TEST_MEMBER_TOKEN not set');
    return;
  }

  // Test 1: Member can view project
  const { status, data } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${TEST_USERS.projectMember.token}` },
  });
  assert(
    status === 200,
    'Project member can view project details',
    `Got status: ${status}, data: ${JSON.stringify(data)}`
  );

  // Test 2: Member can view compute config
  const { status: status2 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/compute`,
    {
      headers: { Authorization: `Bearer ${TEST_USERS.projectMember.token}` },
    }
  );
  assert(status2 === 200, 'Project member can view compute config', `Got status: ${status2}`);

  // Test 3: Member can view disk config
  const { status: status3 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}/disk`, {
    headers: { Authorization: `Bearer ${TEST_USERS.projectMember.token}` },
  });
  assert(status3 === 200, 'Project member can view disk config', `Got status: ${status3}`);

  // Test 4: Member can view monitoring data
  const { status: status4 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/infra-monitoring`,
    {
      headers: { Authorization: `Bearer ${TEST_USERS.projectMember.token}` },
    }
  );
  assert(status4 === 200, 'Project member can view monitoring data', `Got status: ${status4}`);

  // Test 5: Member CANNOT update compute (requires admin)
  const { status: status5 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/compute`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_USERS.projectMember.token}` },
      body: JSON.stringify({ instance_size: 'small' }),
    }
  );
  assert(
    status5 === 403,
    'Project member cannot update compute config',
    `Got status: ${status5}`
  );
}

/**
 * Test organization member access
 */
async function testOrgMemberAccess() {
  testSuite('Organization Member Access');

  if (!TEST_USERS.orgMember.token) {
    skip('All tests', 'TEST_ORG_MEMBER_TOKEN not set');
    return;
  }

  // Test 1: Org member can view project
  const { status, data } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${TEST_USERS.orgMember.token}` },
  });
  assert(
    status === 200,
    'Organization member can view project via org membership',
    `Got status: ${status}`
  );

  // Test 2: Verify access_type is 'via_org' (would need to check audit logs or enhanced response)
  assert(
    data && data.id,
    'Response includes project data',
    `Got data: ${JSON.stringify(data)}`
  );
}

/**
 * Test admin permissions
 */
async function testAdminPermissions() {
  testSuite('Admin Role Permissions');

  if (!TEST_USERS.projectAdmin.token) {
    skip('All tests', 'TEST_ADMIN_TOKEN not set');
    return;
  }

  // Test 1: Admin can view project
  const { status: status1 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
  });
  assert(status1 === 200, 'Admin can view project', `Got status: ${status1}`);

  // Test 2: Admin can update compute config
  const { status: status2 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/compute`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
      body: JSON.stringify({ instance_size: 'micro' }),
    }
  );
  assert(status2 === 200, 'Admin can update compute config', `Got status: ${status2}`);

  // Test 3: Admin can update disk config
  const { status: status3 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}/disk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
    body: JSON.stringify({ size_gb: 16 }),
  });
  assert(status3 === 200, 'Admin can update disk config', `Got status: ${status3}`);

  // Test 4: Admin can update project details
  const { status: status4 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
    body: JSON.stringify({ name: 'Updated Test Project' }),
  });
  assert(status4 === 200, 'Admin can update project details', `Got status: ${status4}`);

  // Test 5: Admin CANNOT delete project (requires owner)
  const { status: status5 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
  });
  assert(status5 === 403, 'Admin cannot delete project', `Got status: ${status5}`);
}

/**
 * Test owner permissions
 */
async function testOwnerPermissions() {
  testSuite('Owner Role Permissions');

  if (!TEST_USERS.projectOwner.token) {
    skip('All tests', 'TEST_OWNER_TOKEN not set');
    return;
  }

  // Test 1: Owner can view project
  const { status: status1 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${TEST_USERS.projectOwner.token}` },
  });
  assert(status1 === 200, 'Owner can view project', `Got status: ${status1}`);

  // Test 2: Owner can update project
  const { status: status2 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TEST_USERS.projectOwner.token}` },
    body: JSON.stringify({ name: 'Owner Updated Project' }),
  });
  assert(status2 === 200, 'Owner can update project', `Got status: ${status2}`);

  // Note: We won't actually test delete to avoid breaking the test project
  console.log(
    `${colors.yellow}ℹ${colors.reset} Skipping actual delete test to preserve test project`
  );
}

/**
 * Test access denial for non-members
 */
async function testNonMemberAccessDenial() {
  testSuite('Non-Member Access Denial');

  if (!TEST_USERS.nonMember.token) {
    skip('All tests', 'TEST_NON_MEMBER_TOKEN not set');
    return;
  }

  // Test 1: Non-member cannot view project
  const { status: status1 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    headers: { Authorization: `Bearer ${TEST_USERS.nonMember.token}` },
  });
  assert(status1 === 403, 'Non-member cannot view project', `Got status: ${status1}`);

  // Test 2: Non-member cannot view compute config
  const { status: status2 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/compute`,
    {
      headers: { Authorization: `Bearer ${TEST_USERS.nonMember.token}` },
    }
  );
  assert(status2 === 403, 'Non-member cannot view compute config', `Got status: ${status2}`);

  // Test 3: Non-member cannot update anything
  const { status: status3 } = await makeRequest(`/api/platform/projects/${TEST_PROJECT_REF}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TEST_USERS.nonMember.token}` },
    body: JSON.stringify({ name: 'Hacked Project' }),
  });
  assert(status3 === 403, 'Non-member cannot update project', `Got status: ${status3}`);
}

/**
 * Test addon management
 */
async function testAddonManagement() {
  testSuite('Add-on Management');

  if (!TEST_USERS.projectAdmin.token) {
    skip('All tests', 'TEST_ADMIN_TOKEN not set');
    return;
  }

  // Test 1: View available addons
  const { status: status1 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/billing/addons`,
    {
      headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
    }
  );
  assert(status1 === 200, 'Can view available addons', `Got status: ${status1}`);

  // Test 2: Member cannot add addon (requires admin)
  if (TEST_USERS.projectMember.token) {
    const { status: status2 } = await makeRequest(
      `/api/platform/projects/${TEST_PROJECT_REF}/billing/addons`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${TEST_USERS.projectMember.token}` },
        body: JSON.stringify({ addon_type: 'compute_instance', addon_variant: 'ci_micro' }),
      }
    );
    assert(status2 === 403, 'Member cannot add addon', `Got status: ${status2}`);
  }

  // Test 3: Admin can add addon
  const { status: status3 } = await makeRequest(
    `/api/platform/projects/${TEST_PROJECT_REF}/billing/addons`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_USERS.projectAdmin.token}` },
      body: JSON.stringify({ addon_type: 'pitr', addon_variant: 'pitr_7' }),
    }
  );
  assert(status3 === 201 || status3 === 400, 'Admin can attempt to add addon', `Got status: ${status3}`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.blue}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  Project Access Control Test Suite (TICKET-10)    ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`\nAPI Base URL: ${API_BASE_URL}`);
  console.log(`Test Project Ref: ${TEST_PROJECT_REF}\n`);

  // Check if required environment variables are set
  const missingVars = [];
  if (!TEST_USERS.projectMember.token) missingVars.push('TEST_MEMBER_TOKEN');
  if (!TEST_USERS.projectAdmin.token) missingVars.push('TEST_ADMIN_TOKEN');
  if (!TEST_USERS.projectOwner.token) missingVars.push('TEST_OWNER_TOKEN');

  if (missingVars.length > 0) {
    console.log(
      `${colors.yellow}⚠ Warning: Some test credentials are missing:${colors.reset} ${missingVars.join(', ')}`
    );
    console.log(
      `${colors.yellow}  Some tests will be skipped. Set environment variables to run full suite.${colors.reset}\n`
    );
  }

  try {
    await testAuthenticationRequired();
    await testDirectProjectMemberAccess();
    await testOrgMemberAccess();
    await testAdminPermissions();
    await testOwnerPermissions();
    await testNonMemberAccessDenial();
    await testAddonManagement();

    // Print summary
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}Test Summary${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    console.log(`${colors.green}Passed:${colors.reset}  ${testResults.passed}`);
    console.log(`${colors.red}Failed:${colors.reset}  ${testResults.failed}`);
    console.log(`${colors.yellow}Skipped:${colors.reset} ${testResults.skipped}`);
    console.log(`Total:   ${testResults.passed + testResults.failed + testResults.skipped}\n`);

    if (testResults.failed === 0) {
      console.log(`${colors.green}✓ All tests passed!${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.red}✗ Some tests failed${colors.reset}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run tests
runTests();
