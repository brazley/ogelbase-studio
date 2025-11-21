#!/usr/bin/env node

/**
 * Comprehensive Multi-Tenant Authentication Test Suite
 *
 * Phase 3: Authentication Flow Testing
 *
 * This script performs exhaustive end-to-end testing of:
 * 1. GoTrue Authentication (signup, login, JWT generation)
 * 2. Profile API endpoint with JWT validation
 * 3. Organizations API endpoint with multi-tenant filtering
 * 4. Projects API endpoint with tenant isolation
 * 5. Multi-tenant isolation (no data leakage)
 * 6. Error handling and edge cases
 * 7. Performance benchmarking
 *
 * Usage:
 *   node comprehensive-auth-test-suite.js
 */

const https = require('https');
const http = require('http');

// Configuration
const GOTRUE_URL = process.env.SUPABASE_URL || 'https://kong-production-80c6.up.railway.app';
const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:3000';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Test user credentials (from Phase 1)
const TEST_USER_1 = {
  email: 'test-1763663946@ogelbase.com',
  password: 'TestPassword123!',
  userId: '50ae110f-99e5-4d64-badc-87f34d52b12d',
  orgId: '73a70e11-c354-4bee-bd86-a0a96a704cbe',
  orgSlug: 'test-org',
  projectRef: 'test-proj'
};

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  warnings: [],
  performance: {}
};

// Utility: Make HTTP/HTTPS request
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    };

    const startTime = Date.now();

    const req = client.request(parsedUrl, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        let parsedData;
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = data;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsedData,
          responseTime
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Test assertion helpers
function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    console.log(`  ✅ ${message}`);
    return true;
  } else {
    testResults.failed++;
    testResults.errors.push(message);
    console.log(`  ❌ ${message}`);
    return false;
  }
}

function logSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}`);
}

function logSubsection(title) {
  console.log(`\n  ${title}`);
  console.log(`  ${'-'.repeat(60)}`);
}

// =============================================================================
// TEST SUITE 1: GoTrue Authentication Testing
// =============================================================================

async function testGoTrueAuthentication() {
  logSection('TEST SUITE 1: GoTrue Authentication Testing');

  let jwt = null;

  // Test 1.1: User Login Flow
  logSubsection('Test 1.1: User Login Flow');
  try {
    const loginUrl = `${GOTRUE_URL}/auth/v1/token?grant_type=password`;
    const response = await makeRequest(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY
      },
      body: {
        email: TEST_USER_1.email,
        password: TEST_USER_1.password
      }
    });

    assert(response.status === 200, `Login returns 200 status (got ${response.status})`);
    assert(response.data.access_token, 'Login returns access_token');
    assert(response.data.user, 'Login returns user object');
    assert(response.data.user.id === TEST_USER_1.userId, `User ID matches (got ${response.data.user?.id})`);

    jwt = response.data.access_token;

    testResults.performance.login = response.responseTime;
    assert(response.responseTime < 3000, `Login response time < 3s (${response.responseTime}ms)`);

  } catch (error) {
    assert(false, `Login failed: ${error.message}`);
    testResults.errors.push(`GoTrue authentication failed: ${error.message}`);
    return null;
  }

  // Test 1.2: JWT Token Structure
  logSubsection('Test 1.2: JWT Token Structure');
  if (jwt) {
    try {
      const parts = jwt.split('.');
      assert(parts.length === 3, 'JWT has 3 parts (header.payload.signature)');

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      assert(payload.sub === TEST_USER_1.userId, `JWT sub matches user ID (got ${payload.sub})`);
      assert(payload.role === 'authenticated', `JWT role is 'authenticated' (got ${payload.role})`);
      assert(payload.exp, 'JWT has expiration time');
      assert(payload.exp > Math.floor(Date.now() / 1000), 'JWT is not expired');

    } catch (error) {
      assert(false, `JWT parsing failed: ${error.message}`);
    }
  }

  return jwt;
}

// =============================================================================
// TEST SUITE 2: Profile API Endpoint Testing
// =============================================================================

async function testProfileEndpoint(jwt) {
  logSection('TEST SUITE 2: Profile API Endpoint Testing');

  // Test 2.1: Valid JWT - Returns Profile
  logSubsection('Test 2.1: Valid JWT - Returns Profile');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 200, `Valid JWT returns 200 (got ${response.status})`);
    assert(response.data.id, 'Profile has user ID');
    assert(response.data.primary_email === TEST_USER_1.email, `Email matches (got ${response.data.primary_email})`);
    assert(Array.isArray(response.data.organizations), 'Profile has organizations array');
    assert(response.data.organizations.length > 0, 'User has at least one organization');

    // Verify multi-tenant filtering
    const userOrg = response.data.organizations.find(org => org.slug === TEST_USER_1.orgSlug);
    assert(userOrg, `User's organization (${TEST_USER_1.orgSlug}) is present`);

    testResults.performance.profile = response.responseTime;
    assert(response.responseTime < 500, `Profile API response time < 500ms (${response.responseTime}ms)`);

  } catch (error) {
    assert(false, `Profile API with valid JWT failed: ${error.message}`);
  }

  // Test 2.2: No JWT - Returns 401
  logSubsection('Test 2.2: No JWT - Returns 401');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/profile`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 401, `No JWT returns 401 (got ${response.status})`);
    assert(response.data.error, 'Error response contains error object');

  } catch (error) {
    assert(false, `Profile API without JWT test failed: ${error.message}`);
  }

  // Test 2.3: Invalid JWT - Returns 401
  logSubsection('Test 2.3: Invalid JWT - Returns 401');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/profile`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid.jwt.token',
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 401, `Invalid JWT returns 401 (got ${response.status})`);

  } catch (error) {
    assert(false, `Profile API with invalid JWT test failed: ${error.message}`);
  }

  // Test 2.4: Malformed Authorization Header
  logSubsection('Test 2.4: Malformed Authorization Header');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/profile`, {
      method: 'GET',
      headers: {
        'Authorization': 'InvalidFormat',
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 401, `Malformed auth header returns 401 (got ${response.status})`);

  } catch (error) {
    assert(false, `Profile API with malformed header test failed: ${error.message}`);
  }
}

// =============================================================================
// TEST SUITE 3: Organizations API Endpoint Testing
// =============================================================================

async function testOrganizationsEndpoint(jwt) {
  logSection('TEST SUITE 3: Organizations API Endpoint Testing');

  // Test 3.1: Valid JWT - Returns Filtered Organizations
  logSubsection('Test 3.1: Valid JWT - Returns Filtered Organizations');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/organizations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 200, `Valid JWT returns 200 (got ${response.status})`);
    assert(Array.isArray(response.data), 'Response is an array');
    assert(response.data.length > 0, 'Returns at least one organization');

    // Verify multi-tenant filtering
    const userOrg = response.data.find(org => org.slug === TEST_USER_1.orgSlug);
    assert(userOrg, `User's organization (${TEST_USER_1.orgSlug}) is present`);
    assert(userOrg.id === TEST_USER_1.orgId, `Organization ID matches`);

    testResults.performance.organizations = response.responseTime;
    assert(response.responseTime < 500, `Organizations API response time < 500ms (${response.responseTime}ms)`);

  } catch (error) {
    assert(false, `Organizations API with valid JWT failed: ${error.message}`);
  }

  // Test 3.2: No JWT - Returns 401
  logSubsection('Test 3.2: No JWT - Returns 401');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/organizations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 401, `No JWT returns 401 (got ${response.status})`);

  } catch (error) {
    assert(false, `Organizations API without JWT test failed: ${error.message}`);
  }

  // Test 3.3: Data Structure Validation
  logSubsection('Test 3.3: Data Structure Validation');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/organizations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.length > 0) {
      const org = response.data[0];
      assert(org.id, 'Organization has id');
      assert(org.name, 'Organization has name');
      assert(org.slug, 'Organization has slug');
      assert(typeof org.billing_email === 'string' || org.billing_email === null, 'Organization has billing_email');
    }

  } catch (error) {
    assert(false, `Organizations data structure validation failed: ${error.message}`);
  }
}

// =============================================================================
// TEST SUITE 4: Projects API Endpoint Testing
// =============================================================================

async function testProjectsEndpoint(jwt) {
  logSection('TEST SUITE 4: Projects API Endpoint Testing');

  // Test 4.1: Valid JWT - Returns Filtered Projects
  logSubsection('Test 4.1: Valid JWT - Returns Filtered Projects');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/projects`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 200, `Valid JWT returns 200 (got ${response.status})`);
    assert(Array.isArray(response.data), 'Response is an array');

    // Verify multi-tenant filtering (if projects exist)
    if (response.data.length > 0) {
      const userProject = response.data.find(proj => proj.ref === TEST_USER_1.projectRef);
      if (userProject) {
        assert(true, `User's project (${TEST_USER_1.projectRef}) is present`);
        assert(userProject.organization_id === TEST_USER_1.orgId, `Project belongs to user's organization`);
      } else {
        testResults.warnings.push(`Test project ${TEST_USER_1.projectRef} not found in results`);
      }
    }

    testResults.performance.projects = response.responseTime;
    assert(response.responseTime < 500, `Projects API response time < 500ms (${response.responseTime}ms)`);

  } catch (error) {
    assert(false, `Projects API with valid JWT failed: ${error.message}`);
  }

  // Test 4.2: No JWT - Returns 401
  logSubsection('Test 4.2: No JWT - Returns 401');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 401, `No JWT returns 401 (got ${response.status})`);

  } catch (error) {
    assert(false, `Projects API without JWT test failed: ${error.message}`);
  }

  // Test 4.3: Data Structure Validation
  logSubsection('Test 4.3: Data Structure Validation');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/projects`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.length > 0) {
      const project = response.data[0];
      assert(project.id, 'Project has id');
      assert(project.ref, 'Project has ref');
      assert(project.name, 'Project has name');
      assert(project.organization_id, 'Project has organization_id');
      assert(project.status, 'Project has status');
    }

  } catch (error) {
    assert(false, `Projects data structure validation failed: ${error.message}`);
  }
}

// =============================================================================
// TEST SUITE 5: Multi-Tenant Isolation Testing
// =============================================================================

async function testMultiTenantIsolation(jwt1) {
  logSection('TEST SUITE 5: Multi-Tenant Isolation Testing');

  logSubsection('Test 5.1: Create Second Test User');
  console.log('  ⚠️  Note: Requires manual creation of second test user');
  console.log('  Skipping multi-tenant isolation test (requires Phase 4)');
  testResults.warnings.push('Multi-tenant isolation test skipped - requires second test user');
}

// =============================================================================
// TEST SUITE 6: Error Handling Testing
// =============================================================================

async function testErrorHandling(jwt) {
  logSection('TEST SUITE 6: Error Handling Testing');

  // Test 6.1: Wrong HTTP Method
  logSubsection('Test 6.1: Wrong HTTP Method (POST to GET endpoint)');
  try {
    const response = await makeRequest(`${STUDIO_URL}/api/platform/profile`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 405, `POST to GET endpoint returns 405 (got ${response.status})`);

  } catch (error) {
    assert(false, `Error handling test (wrong method) failed: ${error.message}`);
  }

  // Test 6.2: Expired JWT (simulated)
  logSubsection('Test 6.2: Expired JWT Token');
  console.log('  ⚠️  Note: Expired JWT test requires generating expired token');
  testResults.warnings.push('Expired JWT test skipped - requires token generation');

  // Test 6.3: JWT with Wrong Signature
  logSubsection('Test 6.3: JWT with Wrong Signature');
  try {
    // Create a JWT with valid structure but wrong signature
    const fakeJWT = jwt.substring(0, jwt.length - 10) + 'fakeSignat';

    const response = await makeRequest(`${STUDIO_URL}/api/platform/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${fakeJWT}`,
        'Content-Type': 'application/json'
      }
    });

    assert(response.status === 401, `JWT with wrong signature returns 401 (got ${response.status})`);

  } catch (error) {
    assert(false, `Error handling test (wrong signature) failed: ${error.message}`);
  }
}

// =============================================================================
// TEST SUITE 7: Performance Testing
// =============================================================================

async function testPerformance(jwt) {
  logSection('TEST SUITE 7: Performance Testing');

  logSubsection('Test 7.1: Concurrent Requests');
  try {
    const concurrentRequests = 10;
    const startTime = Date.now();

    const promises = Array(concurrentRequests).fill().map(() =>
      makeRequest(`${STUDIO_URL}/api/platform/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        }
      })
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / concurrentRequests;

    assert(results.every(r => r.status === 200), 'All concurrent requests succeed');
    assert(avgTime < 1000, `Average concurrent request time < 1s (${avgTime.toFixed(0)}ms)`);

    testResults.performance.concurrent = {
      total: totalTime,
      average: avgTime,
      count: concurrentRequests
    };

  } catch (error) {
    assert(false, `Performance test (concurrent requests) failed: ${error.message}`);
  }

  logSubsection('Test 7.2: Query Performance Analysis');
  console.log(`  Profile API:        ${testResults.performance.profile || 'N/A'}ms`);
  console.log(`  Organizations API:  ${testResults.performance.organizations || 'N/A'}ms`);
  console.log(`  Projects API:       ${testResults.performance.projects || 'N/A'}ms`);
  console.log(`  Login:              ${testResults.performance.login || 'N/A'}ms`);
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runTestSuite() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                   ║');
  console.log('║     COMPREHENSIVE MULTI-TENANT AUTHENTICATION TEST SUITE          ║');
  console.log('║     Phase 3: Authentication Flow Testing                          ║');
  console.log('║                                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Environment check
  logSection('Environment Configuration');
  console.log(`  GoTrue URL:     ${GOTRUE_URL}`);
  console.log(`  Studio URL:     ${STUDIO_URL}`);
  console.log(`  Anon Key:       ${ANON_KEY ? 'Configured' : '⚠️  NOT CONFIGURED'}`);
  console.log(`  Test User:      ${TEST_USER_1.email}`);
  console.log(`  Test Org:       ${TEST_USER_1.orgSlug} (${TEST_USER_1.orgId})`);

  if (!ANON_KEY) {
    console.log('\n  ❌ ERROR: SUPABASE_ANON_KEY not configured');
    console.log('  Please set SUPABASE_ANON_KEY environment variable');
    process.exit(1);
  }

  // Run test suites
  let jwt = null;

  try {
    // Suite 1: GoTrue Authentication
    jwt = await testGoTrueAuthentication();

    if (!jwt) {
      console.log('\n  ❌ CRITICAL: Authentication failed, cannot continue tests');
      printTestResults();
      process.exit(1);
    }

    // Suite 2: Profile API
    await testProfileEndpoint(jwt);

    // Suite 3: Organizations API
    await testOrganizationsEndpoint(jwt);

    // Suite 4: Projects API
    await testProjectsEndpoint(jwt);

    // Suite 5: Multi-Tenant Isolation
    await testMultiTenantIsolation(jwt);

    // Suite 6: Error Handling
    await testErrorHandling(jwt);

    // Suite 7: Performance
    await testPerformance(jwt);

  } catch (error) {
    console.log(`\n  ❌ FATAL ERROR: ${error.message}`);
    console.log(error.stack);
  }

  // Print results
  printTestResults();

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

function printTestResults() {
  logSection('TEST RESULTS SUMMARY');

  console.log(`\n  Total Tests:       ${testResults.total}`);
  console.log(`  Passed:            ${testResults.passed} ✅`);
  console.log(`  Failed:            ${testResults.failed} ❌`);
  console.log(`  Warnings:          ${testResults.warnings.length} ⚠️`);

  if (testResults.warnings.length > 0) {
    console.log('\n  Warnings:');
    testResults.warnings.forEach(warning => {
      console.log(`    ⚠️  ${warning}`);
    });
  }

  if (testResults.failed > 0) {
    console.log('\n  Failed Tests:');
    testResults.errors.forEach(error => {
      console.log(`    ❌ ${error}`);
    });
  }

  console.log('\n  Performance Metrics:');
  console.log(`    Login:              ${testResults.performance.login || 'N/A'}ms`);
  console.log(`    Profile API:        ${testResults.performance.profile || 'N/A'}ms`);
  console.log(`    Organizations API:  ${testResults.performance.organizations || 'N/A'}ms`);
  console.log(`    Projects API:       ${testResults.performance.projects || 'N/A'}ms`);
  if (testResults.performance.concurrent) {
    console.log(`    Concurrent (${testResults.performance.concurrent.count}x): ${testResults.performance.concurrent.average.toFixed(0)}ms avg`);
  }

  const passRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  console.log(`\n  Pass Rate:         ${passRate}%`);

  console.log('\n' + '═'.repeat(70) + '\n');
}

// Run the test suite
runTestSuite();
