#!/usr/bin/env node

/**
 * Test script for observability endpoints
 *
 * Usage: node test-observability.js
 */

const http = require('http')

const BASE_URL = process.env.BASE_URL || 'http://localhost:8082'

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          })
        })
      }
    )

    req.on('error', reject)

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

async function testHealthEndpoint() {
  log('\n=== Testing Health Endpoint ===', 'cyan')

  try {
    const response = await makeRequest('/api/platform/health')

    log(`Status Code: ${response.statusCode}`, response.statusCode === 200 ? 'green' : 'red')

    if (response.statusCode === 200) {
      const health = JSON.parse(response.body)
      log('Health Check Response:', 'blue')
      console.log(JSON.stringify(health, null, 2))

      // Verify required fields
      const requiredFields = ['status', 'timestamp', 'uptime', 'version', 'services', 'metrics']
      const missingFields = requiredFields.filter((field) => !(field in health))

      if (missingFields.length === 0) {
        log('✓ All required fields present', 'green')
      } else {
        log(`✗ Missing fields: ${missingFields.join(', ')}`, 'red')
      }

      // Check service statuses
      if (health.services.postgres) {
        log(
          `✓ PostgreSQL: ${health.services.postgres.status} (${health.services.postgres.responseTime}ms)`,
          health.services.postgres.status === 'healthy' ? 'green' : 'yellow'
        )
      }

      if (health.services.platform) {
        log(
          `✓ Platform: ${health.services.platform.status}`,
          health.services.platform.status === 'healthy' ? 'green' : 'yellow'
        )
      }

      return true
    } else {
      log(`✗ Health check failed with status ${response.statusCode}`, 'red')
      log(response.body, 'red')
      return false
    }
  } catch (error) {
    log(`✗ Error testing health endpoint: ${error.message}`, 'red')
    return false
  }
}

async function testMetricsEndpoint() {
  log('\n=== Testing Metrics Endpoint ===', 'cyan')

  try {
    const response = await makeRequest('/api/platform/metrics')

    log(`Status Code: ${response.statusCode}`, response.statusCode === 200 ? 'green' : 'red')

    if (response.statusCode === 200) {
      const contentType = response.headers['content-type']
      log(`Content-Type: ${contentType}`, 'blue')

      // Verify it's Prometheus format
      if (contentType && contentType.includes('text/plain')) {
        log('✓ Correct content type for Prometheus metrics', 'green')
      } else {
        log('✗ Unexpected content type', 'yellow')
      }

      // Parse and count metrics
      const metrics = response.body
      const lines = metrics.split('\n').filter((line) => line && !line.startsWith('#'))
      log(`✓ Found ${lines.length} metric values`, 'green')

      // Show sample metrics
      log('\nSample Metrics:', 'blue')
      const sampleLines = lines.slice(0, 10)
      sampleLines.forEach((line) => console.log(`  ${line}`))

      if (lines.length > 10) {
        log(`  ... and ${lines.length - 10} more`, 'blue')
      }

      // Check for expected metrics
      const expectedMetrics = [
        'process_cpu_user_seconds_total',
        'process_heap_bytes',
        'nodejs_heap_size_total_bytes',
      ]

      expectedMetrics.forEach((metric) => {
        if (metrics.includes(metric)) {
          log(`✓ Found metric: ${metric}`, 'green')
        } else {
          log(`✗ Missing metric: ${metric}`, 'yellow')
        }
      })

      return true
    } else {
      log(`✗ Metrics endpoint failed with status ${response.statusCode}`, 'red')
      log(response.body, 'red')
      return false
    }
  } catch (error) {
    log(`✗ Error testing metrics endpoint: ${error.message}`, 'red')
    return false
  }
}

async function testObservabilityInitialization() {
  log('\n=== Testing Observability Initialization ===', 'cyan')

  // Check if observability files exist
  const fs = require('fs')
  const path = require('path')

  const requiredFiles = [
    'lib/observability/index.ts',
    'lib/observability/tracing.ts',
    'lib/observability/metrics.ts',
    'lib/observability/logger.ts',
    'lib/observability/middleware.ts',
    'pages/api/platform/health/index.ts',
    'pages/api/platform/metrics/index.ts',
  ]

  let allFilesExist = true

  requiredFiles.forEach((file) => {
    const filePath = path.join(process.cwd(), file)
    if (fs.existsSync(filePath)) {
      log(`✓ ${file}`, 'green')
    } else {
      log(`✗ ${file} not found`, 'red')
      allFilesExist = false
    }
  })

  return allFilesExist
}

async function generateTrafficForMetrics() {
  log('\n=== Generating Traffic to Populate Metrics ===', 'cyan')

  const endpoints = [
    '/api/platform/health',
    '/api/platform/projects',
    '/api/platform/organizations',
    '/api/platform/profile',
  ]

  for (const endpoint of endpoints) {
    try {
      log(`Hitting ${endpoint}...`, 'blue')
      await makeRequest(endpoint)
    } catch (error) {
      // Ignore errors, just generating traffic
    }
  }

  log('✓ Traffic generation complete', 'green')
}

async function main() {
  log('\n╔══════════════════════════════════════════════════════════╗', 'cyan')
  log('║     Supabase Studio Observability Test Suite            ║', 'cyan')
  log('╚══════════════════════════════════════════════════════════╝', 'cyan')

  log(`\nTesting against: ${BASE_URL}`, 'blue')

  const results = {
    initialization: false,
    health: false,
    metrics: false,
  }

  // Test 1: File initialization
  results.initialization = await testObservabilityInitialization()

  // Test 2: Generate some traffic
  await generateTrafficForMetrics()

  // Small delay to let metrics populate
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Test 3: Health endpoint
  results.health = await testHealthEndpoint()

  // Test 4: Metrics endpoint
  results.metrics = await testMetricsEndpoint()

  // Summary
  log('\n=== Test Summary ===', 'cyan')
  log(
    `File Initialization: ${results.initialization ? '✓ PASS' : '✗ FAIL'}`,
    results.initialization ? 'green' : 'red'
  )
  log(`Health Endpoint: ${results.health ? '✓ PASS' : '✗ FAIL'}`, results.health ? 'green' : 'red')
  log(
    `Metrics Endpoint: ${results.metrics ? '✓ PASS' : '✗ FAIL'}`,
    results.metrics ? 'green' : 'red'
  )

  const allPassed = Object.values(results).every((result) => result)

  log(
    '\n' + (allPassed ? '✓ All tests passed!' : '✗ Some tests failed'),
    allPassed ? 'green' : 'red'
  )

  process.exit(allPassed ? 0 : 1)
}

main().catch((error) => {
  log(`\nUnexpected error: ${error.message}`, 'red')
  console.error(error)
  process.exit(1)
})
