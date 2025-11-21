#!/usr/bin/env node
/**
 * Authentication Flow Test Script
 * Tests the complete auth flow: signup -> signin -> refresh -> signout
 *
 * Usage:
 *   node test-auth-flow.js [base-url]
 *
 * Example:
 *   node test-auth-flow.js http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

// Test data
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'SecureTest123',
  first_name: 'Test',
  last_name: 'User',
  username: `testuser${Date.now()}`,
};

let sessionToken = null;

// Helper function to make requests
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

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

// Test functions
async function testSignup() {
  console.log('\n🔷 Testing Signup...');
  const res = await request('/api/auth/signup', 'POST', TEST_USER);

  if (res.ok && res.status === 201) {
    console.log('✅ Signup successful');
    console.log(`   User ID: ${res.data.user.id}`);
    console.log(`   Email: ${res.data.user.email}`);
    return true;
  } else {
    console.error('❌ Signup failed:', res.data);
    return false;
  }
}

async function testSignin() {
  console.log('\n🔷 Testing Signin...');
  const res = await request('/api/auth/signin', 'POST', {
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  if (res.ok && res.status === 200) {
    sessionToken = res.data.token;
    console.log('✅ Signin successful');
    console.log(`   Token: ${sessionToken.substring(0, 16)}...`);
    console.log(`   Expires: ${res.data.expires_at}`);
    return true;
  } else {
    console.error('❌ Signin failed:', res.data);
    return false;
  }
}

async function testInvalidSignin() {
  console.log('\n🔷 Testing Invalid Signin...');
  const res = await request('/api/auth/signin', 'POST', {
    email: TEST_USER.email,
    password: 'WrongPassword123',
  });

  if (!res.ok && res.status === 401) {
    console.log('✅ Invalid signin correctly rejected');
    return true;
  } else {
    console.error('❌ Invalid signin should have been rejected');
    return false;
  }
}

async function testRefresh() {
  console.log('\n🔷 Testing Token Refresh...');
  const res = await request('/api/auth/refresh', 'POST', null, sessionToken);

  if (res.ok && res.status === 200) {
    console.log('✅ Token refresh successful');
    console.log(`   New Token: ${res.data.token.substring(0, 16)}...`);
    console.log(`   Expires: ${res.data.expires_at}`);
    // Update token if it changed
    sessionToken = res.data.token;
    return true;
  } else {
    console.error('❌ Token refresh failed:', res.data);
    return false;
  }
}

async function testSignout() {
  console.log('\n🔷 Testing Signout...');
  const res = await request('/api/auth/signout', 'POST', null, sessionToken);

  if (res.ok && res.status === 200) {
    console.log('✅ Signout successful');
    return true;
  } else {
    console.error('❌ Signout failed:', res.data);
    return false;
  }
}

async function testSignoutAfterSignout() {
  console.log('\n🔷 Testing Signout After Already Signed Out...');
  const res = await request('/api/auth/signout', 'POST', null, sessionToken);

  if (!res.ok && res.status === 404) {
    console.log('✅ Already signed out - session not found (expected)');
    return true;
  } else {
    console.error('❌ Should have returned 404 for already signed out session');
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 Authentication Flow Test Suite');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User Email: ${TEST_USER.email}`);

  const results = [];

  try {
    // Test signup
    results.push(await testSignup());

    // Test signin with valid credentials
    results.push(await testSignin());

    // Test signin with invalid credentials
    results.push(await testInvalidSignin());

    // Test token refresh
    results.push(await testRefresh());

    // Test signout
    results.push(await testSignout());

    // Test signout after already signed out
    results.push(await testSignoutAfterSignout());

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    const passed = results.filter(Boolean).length;
    const failed = results.filter((r) => !r).length;
    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ for native fetch support');
  console.error('   Or run: npm install node-fetch');
  process.exit(1);
}

// Run the tests
runTests();
