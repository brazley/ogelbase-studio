#!/usr/bin/env node

/**
 * Test Platform APIs - Diagnostic Tool
 * Tests all platform API endpoints and routing
 */

const https = require('https')
const http = require('http')

// Railway database connection
const DATABASE_URL =
  'postgresql://postgres:sl2i90d6w7lzgejxxqwh3tiwuqxhtl64@maglev.proxy.rlwy.net:20105/postgres'
const PG_META_URL = 'http://localhost:8000/pg'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(color, ...args) {
  console.log(color, ...args, colors.reset)
}

function testFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    const req = client.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
        ...options,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve({ status: res.statusCode, data: json, headers: res.headers })
          } catch (e) {
            resolve({ status: res.statusCode, data: data, headers: res.headers })
          }
        })
      }
    )

    req.on('error', reject)
    if (options.body) req.write(JSON.stringify(options.body))
    req.end()
  })
}

async function testEndpoint(name, url, expectedKeys = []) {
  log(colors.cyan, `\n🔍 Testing: ${name}`)
  log(colors.blue, `   URL: ${url}`)

  try {
    const { status, data } = await testFetch(url)

    if (status === 200) {
      log(colors.green, `   ✓ Status: ${status}`)

      if (Array.isArray(data)) {
        log(colors.green, `   ✓ Array response with ${data.length} items`)
        if (data.length > 0) {
          log(colors.cyan, `   First item:`, JSON.stringify(data[0], null, 2))

          // Check expected keys
          if (expectedKeys.length > 0) {
            const firstItem = data[0]
            const missingKeys = expectedKeys.filter((key) => !(key in firstItem))
            if (missingKeys.length > 0) {
              log(colors.yellow, `   ⚠ Missing keys: ${missingKeys.join(', ')}`)
            } else {
              log(colors.green, `   ✓ All expected keys present`)
            }
          }
        } else {
          log(colors.yellow, `   ⚠ Array is empty`)
        }
      } else if (typeof data === 'object') {
        log(colors.green, `   ✓ Object response`)
        log(colors.cyan, `   Keys: ${Object.keys(data).join(', ')}`)
        log(colors.cyan, `   Data:`, JSON.stringify(data, null, 2))
      } else {
        log(colors.yellow, `   Response: ${data}`)
      }
    } else {
      log(colors.red, `   ✗ Status: ${status}`)
      log(colors.red, `   Error:`, data)
    }

    return { success: status === 200, status, data }
  } catch (error) {
    log(colors.red, `   ✗ Error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function testDatabaseConnection() {
  log(colors.cyan, `\n🔍 Testing: Database Connection via pg-meta`)

  const crypto = require('crypto-js')
  const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY || 'SAMPLE_KEY'
  const connectionStringEncrypted = crypto.AES.encrypt(DATABASE_URL, ENCRYPTION_KEY).toString()

  try {
    const { status, data } = await testFetch(`${PG_META_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-connection-encrypted': connectionStringEncrypted,
      },
      body: { query: 'SELECT * FROM platform.organizations ORDER BY name' },
    })

    if (status === 200) {
      log(colors.green, `   ✓ Database connection successful`)
      log(colors.green, `   ✓ Found ${data.length} organizations`)
      log(colors.cyan, `   Organizations:`, JSON.stringify(data, null, 2))
    } else {
      log(colors.red, `   ✗ Database query failed: ${status}`)
      log(colors.red, `   Error:`, data)
    }

    return { success: status === 200, data }
  } catch (error) {
    log(colors.red, `   ✗ Database connection error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function testRouting() {
  log(colors.cyan, `\n🔍 Testing: Next.js Routing`)

  const routes = ['/', '/organizations', '/org/test-org', '/project/test-proj']

  for (const route of routes) {
    const url = `http://localhost:3000${route}`
    try {
      const { status } = await testFetch(url)
      if (status === 200) {
        log(colors.green, `   ✓ ${route} - Status: ${status}`)
      } else {
        log(colors.yellow, `   ⚠ ${route} - Status: ${status}`)
      }
    } catch (error) {
      log(colors.red, `   ✗ ${route} - Error: ${error.message}`)
    }
  }
}

async function checkEnvironment() {
  log(colors.cyan, `\n🔍 Environment Check`)

  const envVars = {
    NEXT_PUBLIC_IS_PLATFORM: process.env.NEXT_PUBLIC_IS_PLATFORM,
    DATABASE_URL: process.env.DATABASE_URL ? '✓ Set' : '✗ Not set',
    STUDIO_PG_META_URL: process.env.STUDIO_PG_META_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NODE_ENV: process.env.NODE_ENV,
  }

  for (const [key, value] of Object.entries(envVars)) {
    if (value) {
      log(colors.green, `   ✓ ${key}: ${value}`)
    } else {
      log(colors.yellow, `   ⚠ ${key}: Not set`)
    }
  }
}

async function main() {
  log(colors.cyan, '\n' + '='.repeat(60))
  log(colors.cyan, '🚀 Supabase Studio Platform API Diagnostic Tool')
  log(colors.cyan, '='.repeat(60))

  // Check environment
  await checkEnvironment()

  // Test database connection directly
  log(colors.cyan, '\n' + '='.repeat(60))
  log(colors.cyan, '📊 DATABASE CONNECTION TEST')
  log(colors.cyan, '='.repeat(60))
  await testDatabaseConnection()

  // Test API endpoints
  log(colors.cyan, '\n' + '='.repeat(60))
  log(colors.cyan, '🌐 API ENDPOINT TESTS')
  log(colors.cyan, '='.repeat(60))

  const endpoints = [
    {
      name: 'Organizations API',
      url: 'http://localhost:3000/api/platform/organizations',
      keys: ['id', 'name', 'slug', 'billing_email'],
    },
    {
      name: 'Projects API',
      url: 'http://localhost:3000/api/platform/projects',
      keys: ['id', 'ref', 'name', 'organization_id'],
    },
    {
      name: 'Profile API',
      url: 'http://localhost:3000/api/platform/profile',
      keys: ['id', 'username', 'organizations'],
    },
  ]

  const results = {}
  for (const endpoint of endpoints) {
    results[endpoint.name] = await testEndpoint(endpoint.name, endpoint.url, endpoint.keys)
  }

  // Test routing
  log(colors.cyan, '\n' + '='.repeat(60))
  log(colors.cyan, '🛣️  ROUTING TESTS')
  log(colors.cyan, '='.repeat(60))
  await testRouting()

  // Summary
  log(colors.cyan, '\n' + '='.repeat(60))
  log(colors.cyan, '📋 SUMMARY')
  log(colors.cyan, '='.repeat(60))

  for (const [name, result] of Object.entries(results)) {
    if (result.success) {
      log(colors.green, `✓ ${name}: Working`)
    } else {
      log(colors.red, `✗ ${name}: Failed`)
    }
  }

  log(colors.cyan, '\n' + '='.repeat(60))
}

// Run diagnostics
main().catch(console.error)
