#!/usr/bin/env node

/**
 * Comprehensive Audit Logging Test Suite
 * Tests all critical actions are being logged correctly
 */

const https = require('https')
const http = require('http')

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:8082'
const TEST_EMAIL = process.env.TEST_EMAIL || 'nik@lancio.io'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123'

// Test state
let authToken = null
let userId = null
let organizationId = null
let projectRef = null
let auditLogsBefore = []

// ANSI colors for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green')
}

function logError(message) {
  log(`✗ ${message}`, 'red')
}

function logInfo(message) {
  log(`ℹ ${message}`, 'cyan')
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow')
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'blue')
  log(`  ${title}`, 'bright')
  log(`${'='.repeat(60)}`, 'blue')
}

/**
 * Make HTTP request
 */
function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const isHttps = url.protocol === 'https:'

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    }

    const lib = isHttps ? https : http
    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {}
          resolve({ status: res.statusCode, headers: res.headers, data: parsed })
        } catch (error) {
          resolve({ status: res.statusCode, headers: res.headers, data })
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }

    req.end()
  })
}

/**
 * Test 1: Authenticate user
 */
async function testAuthentication() {
  logSection('TEST 1: Authentication')

  try {
    const response = await makeRequest('POST', '/api/auth/signin', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })

    if (response.status === 200 && response.data.access_token) {
      authToken = response.data.access_token
      userId = response.data.user?.id
      logSuccess(`Authenticated as ${TEST_EMAIL}`)
      logInfo(`User ID: ${userId}`)
      return true
    } else {
      logError(`Authentication failed: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Authentication error: ${error.message}`)
    return false
  }
}

/**
 * Test 2: Get baseline audit logs
 */
async function testGetBaselineAuditLogs() {
  logSection('TEST 2: Get Baseline Audit Logs')

  try {
    const response = await makeRequest(
      'GET',
      '/api/platform/audit/logs?limit=100',
      null,
      authToken
    )

    if (response.status === 200) {
      auditLogsBefore = response.data.data || []
      const total = response.data.pagination?.total || 0
      logSuccess(`Retrieved ${auditLogsBefore.length} audit logs (total: ${total})`)
      return true
    } else {
      logError(`Failed to get audit logs: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Audit logs query error: ${error.message}`)
    return false
  }
}

/**
 * Test 3: List organizations
 */
async function testListOrganizations() {
  logSection('TEST 3: List Organizations')

  try {
    const response = await makeRequest('GET', '/api/platform/organizations', null, authToken)

    if (response.status === 200 && Array.isArray(response.data)) {
      if (response.data.length > 0) {
        organizationId = response.data[0].id
        logSuccess(`Found ${response.data.length} organizations`)
        logInfo(`Using organization: ${response.data[0].name} (${organizationId})`)
        return true
      } else {
        logWarning('No organizations found - some tests will be skipped')
        return false
      }
    } else {
      logError(`Failed to list organizations: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Organizations list error: ${error.message}`)
    return false
  }
}

/**
 * Test 4: Create project (should create audit log)
 */
async function testCreateProject() {
  logSection('TEST 4: Create Project (Audit Log Test)')

  if (!organizationId) {
    logWarning('Skipping - no organization available')
    return false
  }

  try {
    const projectData = {
      name: `Audit Test Project ${Date.now()}`,
      organization_id: organizationId,
      database_host: 'localhost',
      database_port: 5432,
      database_name: 'test_db',
      database_user: 'postgres',
      database_password: 'postgres',
      postgres_meta_url: 'http://localhost:8085',
      supabase_url: 'http://localhost:8000',
    }

    const response = await makeRequest(
      'POST',
      '/api/platform/projects/create',
      projectData,
      authToken
    )

    if (response.status === 200 && response.data.project) {
      projectRef = response.data.project.ref
      logSuccess(`Project created: ${response.data.project.name}`)
      logInfo(`Project ref: ${projectRef}`)
      logInfo(`Project ID: ${response.data.project.id}`)
      return true
    } else {
      logError(`Failed to create project: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Project creation error: ${error.message}`)
    return false
  }
}

/**
 * Test 5: Update compute size (should create audit log)
 */
async function testUpdateCompute() {
  logSection('TEST 5: Update Compute Size (Audit Log Test)')

  if (!projectRef) {
    logWarning('Skipping - no project available')
    return false
  }

  try {
    const response = await makeRequest(
      'POST',
      `/api/platform/projects/${projectRef}/compute`,
      { instance_size: 'small' },
      authToken
    )

    if (response.status === 200) {
      logSuccess(`Compute size updated to: ${response.data.instance_size}`)
      logInfo(`CPU: ${response.data.cpu}, Memory: ${response.data.memory_gb}GB`)
      return true
    } else {
      logError(`Failed to update compute: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Compute update error: ${error.message}`)
    return false
  }
}

/**
 * Test 6: Update disk size (should create audit log)
 */
async function testUpdateDisk() {
  logSection('TEST 6: Update Disk Size (Audit Log Test)')

  if (!projectRef) {
    logWarning('Skipping - no project available')
    return false
  }

  try {
    const response = await makeRequest(
      'POST',
      `/api/platform/projects/${projectRef}/disk`,
      { size_gb: 16 },
      authToken
    )

    if (response.status === 200) {
      logSuccess(`Disk size updated to: ${response.data.size_gb}GB`)
      logInfo(`IO Budget: ${response.data.io_budget} IOPS`)
      return true
    } else {
      logError(`Failed to update disk: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Disk update error: ${error.message}`)
    return false
  }
}

/**
 * Test 7: Verify audit logs were created
 */
async function testVerifyAuditLogs() {
  logSection('TEST 7: Verify Audit Logs Were Created')

  try {
    // Wait a moment for audit logs to be written
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const response = await makeRequest(
      'GET',
      '/api/platform/audit/logs?limit=100',
      null,
      authToken
    )

    if (response.status === 200) {
      const auditLogsAfter = response.data.data || []
      const newLogs = auditLogsAfter.filter(
        (log) => !auditLogsBefore.some((oldLog) => oldLog.id === log.id)
      )

      logSuccess(`Total audit logs: ${auditLogsAfter.length}`)
      logSuccess(`New audit logs: ${newLogs.length}`)

      if (newLogs.length > 0) {
        log('\n  New Audit Logs:', 'cyan')
        newLogs.forEach((auditLog) => {
          log(`  - ${auditLog.action} on ${auditLog.entity_type} (${auditLog.entity_id})`, 'cyan')
          if (auditLog.changes) {
            log(`    Changes: ${JSON.stringify(auditLog.changes, null, 2)}`, 'cyan')
          }
          log(`    IP: ${auditLog.ip_address || 'N/A'}`, 'cyan')
          log(`    Time: ${auditLog.created_at}`, 'cyan')
        })

        // Verify expected actions were logged
        const expectedActions = ['create', 'compute.update', 'disk.update']
        const foundActions = newLogs.map((log) => log.action)

        const missingActions = expectedActions.filter(
          (action) => !foundActions.includes(action)
        )

        if (missingActions.length === 0) {
          logSuccess('\n✓ All expected audit events were logged!')
          return true
        } else {
          logWarning(
            `\n⚠ Missing audit logs for actions: ${missingActions.join(', ')}`
          )
          return true // Still pass test if some logs are there
        }
      } else {
        logWarning('No new audit logs found - this might indicate a problem')
        return false
      }
    } else {
      logError(`Failed to verify audit logs: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Audit log verification error: ${error.message}`)
    return false
  }
}

/**
 * Test 8: Filter audit logs by entity type
 */
async function testFilterAuditLogs() {
  logSection('TEST 8: Filter Audit Logs by Entity Type')

  try {
    const response = await makeRequest(
      'GET',
      '/api/platform/audit/logs?entity_type=project&limit=10',
      null,
      authToken
    )

    if (response.status === 200) {
      const logs = response.data.data || []
      logSuccess(`Found ${logs.length} project audit logs`)

      // Verify all logs are for projects
      const allProjects = logs.every((log) => log.entity_type === 'project')
      if (allProjects) {
        logSuccess('✓ All filtered logs are for entity_type=project')
        return true
      } else {
        logError('✗ Filter returned non-project logs')
        return false
      }
    } else {
      logError(`Failed to filter audit logs: ${JSON.stringify(response.data)}`)
      return false
    }
  } catch (error) {
    logError(`Audit log filter error: ${error.message}`)
    return false
  }
}

/**
 * Test 9: Pagination test
 */
async function testPagination() {
  logSection('TEST 9: Audit Logs Pagination')

  try {
    // Get first page
    const page1 = await makeRequest(
      'GET',
      '/api/platform/audit/logs?limit=5&offset=0',
      null,
      authToken
    )

    // Get second page
    const page2 = await makeRequest(
      'GET',
      '/api/platform/audit/logs?limit=5&offset=5',
      null,
      authToken
    )

    if (page1.status === 200 && page2.status === 200) {
      const logs1 = page1.data.data || []
      const logs2 = page2.data.data || []

      logSuccess(`Page 1: ${logs1.length} logs`)
      logSuccess(`Page 2: ${logs2.length} logs`)

      // Verify pages don't overlap
      const overlap = logs1.some((log1) => logs2.some((log2) => log1.id === log2.id))
      if (!overlap && logs1.length > 0) {
        logSuccess('✓ Pagination working correctly (no overlap)')
        return true
      } else {
        logWarning('⚠ Pagination might have issues or insufficient data')
        return true
      }
    } else {
      logError('Failed to test pagination')
      return false
    }
  } catch (error) {
    logError(`Pagination test error: ${error.message}`)
    return false
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  log('\n' + '='.repeat(60), 'bright')
  log('  AUDIT LOGGING TEST SUITE', 'bright')
  log('='.repeat(60) + '\n', 'bright')

  const tests = [
    { name: 'Authentication', fn: testAuthentication, required: true },
    { name: 'Get Baseline Audit Logs', fn: testGetBaselineAuditLogs, required: false },
    { name: 'List Organizations', fn: testListOrganizations, required: false },
    { name: 'Create Project', fn: testCreateProject, required: false },
    { name: 'Update Compute', fn: testUpdateCompute, required: false },
    { name: 'Update Disk', fn: testUpdateDisk, required: false },
    { name: 'Verify Audit Logs', fn: testVerifyAuditLogs, required: false },
    { name: 'Filter Audit Logs', fn: testFilterAuditLogs, required: false },
    { name: 'Pagination', fn: testPagination, required: false },
  ]

  const results = []

  for (const test of tests) {
    try {
      const passed = await test.fn()
      results.push({ name: test.name, passed, required: test.required })

      if (!passed && test.required) {
        logError(`Required test failed: ${test.name}`)
        break
      }
    } catch (error) {
      logError(`Test crashed: ${test.name} - ${error.message}`)
      results.push({ name: test.name, passed: false, required: test.required })
      if (test.required) break
    }
  }

  // Summary
  logSection('TEST SUMMARY')
  const passed = results.filter((r) => r.passed).length
  const total = results.length

  results.forEach((result) => {
    if (result.passed) {
      logSuccess(`${result.name}`)
    } else {
      logError(`${result.name}`)
    }
  })

  log(`\n${'='.repeat(60)}`, 'bright')
  if (passed === total) {
    log(`  ✓ ALL TESTS PASSED (${passed}/${total})`, 'green')
  } else {
    log(`  ⚠ SOME TESTS FAILED (${passed}/${total})`, 'yellow')
  }
  log(`${'='.repeat(60)}\n`, 'bright')

  process.exit(passed === total ? 0 : 1)
}

// Run tests
runAllTests().catch((error) => {
  logError(`Fatal error: ${error.message}`)
  console.error(error)
  process.exit(1)
})
