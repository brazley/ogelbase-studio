#!/usr/bin/env node

/**
 * Test script for multi-tenant JWT authentication endpoints
 *
 * This script tests the three updated API endpoints:
 * - /api/platform/profile
 * - /api/platform/organizations
 * - /api/platform/projects
 *
 * Usage:
 *   node test-jwt-endpoints.js <jwt-token>
 *
 * Example:
 *   node test-jwt-endpoints.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_TOKEN = process.argv[2];

if (!JWT_TOKEN) {
  console.error('Error: JWT token is required');
  console.error('Usage: node test-jwt-endpoints.js <jwt-token>');
  process.exit(1);
}

async function testEndpoint(path, description) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${description}`);
    console.log(`Endpoint: ${url.href}`);
    console.log(`${'='.repeat(60)}`);

    const req = client.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);

        try {
          const json = JSON.parse(data);
          console.log(`Response:`, JSON.stringify(json, null, 2));

          if (res.statusCode === 200) {
            console.log('✅ SUCCESS');
          } else if (res.statusCode === 401) {
            console.log('❌ UNAUTHORIZED - Check JWT token validity');
          } else {
            console.log(`⚠️  UNEXPECTED STATUS CODE: ${res.statusCode}`);
          }

          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          console.log(`Raw response:`, data);
          console.log('❌ FAILED - Invalid JSON response');
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ REQUEST FAILED:`, error.message);
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('\n🔐 JWT Multi-Tenant Authentication Tests');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`JWT Token: ${JWT_TOKEN.substring(0, 20)}...`);

  try {
    // Test 1: Profile endpoint
    await testEndpoint(
      '/api/platform/profile',
      'Profile Endpoint - Should return user profile with filtered organizations'
    );

    // Test 2: Organizations endpoint
    await testEndpoint(
      '/api/platform/organizations',
      'Organizations Endpoint - Should return only user\'s organizations'
    );

    // Test 3: Projects endpoint
    await testEndpoint(
      '/api/platform/projects',
      'Projects Endpoint - Should return only projects in user\'s organizations'
    );

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Test without token
async function testWithoutAuth() {
  console.log('\n🔓 Testing without authentication (should return 401)');

  return new Promise((resolve, reject) => {
    const url = new URL('/api/platform/profile', BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);

        if (res.statusCode === 401) {
          console.log('✅ Correctly returns 401 Unauthorized');
        } else {
          console.log(`⚠️  Expected 401, got ${res.statusCode}`);
        }

        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`❌ REQUEST FAILED:`, error.message);
      reject(error);
    });

    req.end();
  });
}

// Run all tests
(async () => {
  await runTests();
  await testWithoutAuth();
})();
