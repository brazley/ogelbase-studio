/**
 * RLS Performance Benchmarks - Migration 007
 *
 * Measures the performance impact of restrictive RLS policies.
 * Target: RLS overhead should be < 2x slowdown (acceptable for security isolation)
 *
 * Tests:
 * 1. Simple SELECT queries (baseline)
 * 2. JOINs across tables (org isolation)
 * 3. Complex WHERE conditions (with indexes)
 * 4. Aggregations (COUNT, SUM)
 * 5. Inserts (with policy checks)
 * 6. Updates (with policy checks)
 *
 * Metrics Captured:
 * - Min/max/mean query execution time
 * - Standard deviation
 * - Throughput (queries/sec)
 * - Cache hit rates (if available)
 */

import { queryPlatformDatabase } from '../lib/api/platform/database'
import { setRLSContext, clearRLSContext, setSystemUserContext } from './rls-test-helper'

// Test data
const TEST_ORG_ID = '50000000-0000-0000-0000-000000000005'
const TEST_USER_ID = '55555555-5555-5555-5555-555555555555'
const ITERATIONS = 100

interface BenchmarkResult {
  name: string
  queries: number
  totalMs: number
  minMs: number
  maxMs: number
  meanMs: number
  stdDevMs: number
  qps: number
  overhead?: number
}

/**
 * Helper to calculate statistics
 */
function calculateStats(
  measurements: number[]
): {
  min: number
  max: number
  mean: number
  stdDev: number
} {
  const min = Math.min(...measurements)
  const max = Math.max(...measurements)
  const mean = measurements.reduce((a, b) => a + b, 0) / measurements.length
  const variance =
    measurements.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / measurements.length
  const stdDev = Math.sqrt(variance)

  return { min, max, mean, stdDev }
}

/**
 * Run benchmark with timing
 */
async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = ITERATIONS
): Promise<BenchmarkResult> {
  const measurements: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    const end = performance.now()
    measurements.push(end - start)
  }

  const stats = calculateStats(measurements)
  const totalMs = measurements.reduce((a, b) => a + b, 0)
  const qps = (iterations / totalMs) * 1000

  return {
    name,
    queries: iterations,
    totalMs,
    minMs: stats.min,
    maxMs: stats.max,
    meanMs: stats.mean,
    stdDevMs: stats.stdDev,
    qps,
  }
}

/**
 * Format benchmark result as readable string
 */
function formatResult(result: BenchmarkResult, baselineQps?: number): string {
  let output = `
${result.name}
  Queries: ${result.queries}
  Total: ${result.totalMs.toFixed(2)}ms
  Min: ${result.minMs.toFixed(3)}ms
  Max: ${result.maxMs.toFixed(3)}ms
  Mean: ${result.meanMs.toFixed(3)}ms
  StdDev: ${result.stdDevMs.toFixed(3)}ms
  QPS: ${result.qps.toFixed(2)}
  `

  if (baselineQps && result.overhead) {
    output += `  Overhead: ${(result.overhead * 100).toFixed(1)}%\n`
  }

  return output
}

describe('RLS Performance Benchmarks', () => {
  beforeAll(async () => {
    await clearRLSContext()
  })

  afterEach(async () => {
    await clearRLSContext()
  })

  // ============================================
  // SELECT Query Benchmarks
  // ============================================

  describe('SELECT Query Performance', () => {
    it('should measure simple SELECT without RLS overhead', async () => {
      // Baseline: query without RLS context (service role)
      await setSystemUserContext()

      const result = await benchmark(
        'SELECT * FROM organizations (system user)',
        async () => {
          await queryPlatformDatabase({
            query: 'SELECT id, name FROM platform.organizations LIMIT 10',
          })
        }
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(100) // Reasonable upper bound
    })

    it('should measure SELECT with RLS context', async () => {
      // With RLS: same query but with session context
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'SELECT * FROM organizations (with RLS)',
        async () => {
          await queryPlatformDatabase({
            query: 'SELECT id, name FROM platform.organizations LIMIT 10',
          })
        }
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(100)
    })

    it('should measure JOIN performance with RLS', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'SELECT with JOIN (orgs + members)',
        async () => {
          await queryPlatformDatabase({
            query: `
              SELECT o.id, o.name, om.role
              FROM platform.organizations o
              JOIN platform.organization_members om ON o.id = om.organization_id
              LIMIT 10
            `,
          })
        }
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(200)
    })

    it('should measure indexed query performance', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'SELECT with indexed column',
        async () => {
          await queryPlatformDatabase({
            query: `
              SELECT id, name FROM platform.projects
              WHERE organization_id = $1
            `,
            parameters: [TEST_ORG_ID],
          })
        }
      )

      console.log(formatResult(result))
      // Indexed queries should be fast
      expect(result.meanMs).toBeLessThan(50)
    })

    it('should measure COUNT aggregation with RLS', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'SELECT COUNT(*) with RLS',
        async () => {
          await queryPlatformDatabase({
            query: 'SELECT COUNT(*) FROM platform.projects WHERE organization_id = $1',
            parameters: [TEST_ORG_ID],
          })
        }
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(100)
    })
  })

  // ============================================
  // Policy Evaluation Overhead
  // ============================================

  describe('Policy Evaluation Overhead', () => {
    it('should measure RLS policy check overhead', async () => {
      // Measure baseline without RLS
      const baselineResult = await benchmark(
        'Baseline (no RLS)',
        async () => {
          await setSystemUserContext()
          await queryPlatformDatabase({
            query: 'SELECT COUNT(*) FROM platform.organizations',
          })
        },
        50 // Fewer iterations for this comparison
      )

      // Measure with RLS
      const withRlsResult = await benchmark(
        'With RLS policies',
        async () => {
          await setRLSContext(TEST_USER_ID, TEST_ORG_ID)
          await queryPlatformDatabase({
            query: 'SELECT COUNT(*) FROM platform.organizations',
          })
        },
        50
      )

      const overhead = withRlsResult.meanMs / baselineResult.meanMs

      console.log(formatResult(baselineResult))
      console.log(formatResult(withRlsResult))
      console.log(`
RLS Overhead Analysis:
  Baseline Mean: ${baselineResult.meanMs.toFixed(3)}ms
  With RLS Mean: ${withRlsResult.meanMs.toFixed(3)}ms
  Overhead: ${(overhead * 100).toFixed(1)}%
  Overhead Factor: ${overhead.toFixed(2)}x
  `)

      // Target: RLS overhead < 2x
      expect(overhead).toBeLessThan(2)
    })

    it('should measure cost of helper function calls', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'Helper function: current_user_id()',
        async () => {
          await queryPlatformDatabase({
            query: 'SELECT platform.get_current_user_id() as user_id',
          })
        },
        50
      )

      console.log(formatResult(result))
      // Helper functions should be very fast
      expect(result.meanMs).toBeLessThan(50)
    })

    it('should measure cost of role checking', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'Helper function: user_has_org_role()',
        async () => {
          await queryPlatformDatabase({
            query: 'SELECT platform.user_has_org_role($1, $2) as has_role',
            parameters: [TEST_ORG_ID, 'owner'],
          })
        },
        50
      )

      console.log(formatResult(result))
      // Role checking with hierarchy logic
      expect(result.meanMs).toBeLessThan(100)
    })
  })

  // ============================================
  // Complex Query Benchmarks
  // ============================================

  describe('Complex Query Performance', () => {
    it('should measure deep JOIN performance', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'Deep JOIN: orgs → projects → config',
        async () => {
          await queryPlatformDatabase({
            query: `
              SELECT o.id, p.id, dc.id
              FROM platform.organizations o
              JOIN platform.projects p ON o.id = p.organization_id
              LEFT JOIN platform.disk_config dc ON p.id = dc.project_id
              LIMIT 10
            `,
          })
        },
        50
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(200)
    })

    it('should measure subquery performance', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'Subquery: projects in user orgs',
        async () => {
          await queryPlatformDatabase({
            query: `
              SELECT id FROM platform.projects
              WHERE organization_id IN (
                SELECT organization_id
                FROM platform.organization_members
                WHERE user_id = $1
              )
            `,
            parameters: [TEST_USER_ID],
          })
        },
        50
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(200)
    })
  })

  // ============================================
  // Write Operation Benchmarks
  // ============================================

  describe('Write Operation Performance', () => {
    it('should measure INSERT performance with RLS', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'INSERT with RLS policy evaluation',
        async () => {
          const projectId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          await queryPlatformDatabase({
            query: `
              INSERT INTO platform.projects (id, organization_id, name, ref, database_host)
              VALUES ($1, $2, $3, $4, 'db.internal')
            `,
            parameters: [projectId, TEST_ORG_ID, `Project ${projectId}`, projectId],
          })
        },
        30 // Fewer iterations for writes
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(500)
    })

    it('should measure UPDATE performance with RLS', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'UPDATE with RLS policy evaluation',
        async () => {
          await queryPlatformDatabase({
            query: `
              UPDATE platform.organizations
              SET name = $1
              WHERE id = $2
            `,
            parameters: [`Updated ${Date.now()}`, TEST_ORG_ID],
          })
        },
        30
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(500)
    })
  })

  // ============================================
  // Context Switching Benchmarks
  // ============================================

  describe('Context Switching Performance', () => {
    it('should measure cost of switching user context', async () => {
      const user2Id = '66666666-6666-6666-6666-666666666666'

      const result = await benchmark(
        'User context switch',
        async () => {
          await setRLSContext(user2Id, TEST_ORG_ID)
        },
        100
      )

      console.log(formatResult(result))
      // Context switching should be very cheap
      expect(result.meanMs).toBeLessThan(10)
    })

    it('should measure cost of clearing context', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const result = await benchmark(
        'Clear RLS context',
        async () => {
          await clearRLSContext()
        },
        100
      )

      console.log(formatResult(result))
      expect(result.meanMs).toBeLessThan(10)
    })
  })

  // ============================================
  // Load Testing
  // ============================================

  describe('Load Testing', () => {
    it('should handle sustained query load with RLS', async () => {
      await setRLSContext(TEST_USER_ID, TEST_ORG_ID)

      const startTime = performance.now()
      let successCount = 0
      let errorCount = 0

      // Simulate 10 seconds of sustained load
      const loadDuration = 10000 // ms
      const loadEndTime = startTime + loadDuration

      while (performance.now() < loadEndTime) {
        try {
          const result = await queryPlatformDatabase({
            query: 'SELECT COUNT(*) FROM platform.organizations',
          })

          if (result.error) {
            errorCount++
          } else {
            successCount++
          }
        } catch {
          errorCount++
        }
      }

      const totalQueries = successCount + errorCount
      const successRate = (successCount / totalQueries) * 100

      console.log(`
Load Test Results (10 second duration):
  Total Queries: ${totalQueries}
  Successful: ${successCount}
  Failed: ${errorCount}
  Success Rate: ${successRate.toFixed(2)}%
  QPS: ${(totalQueries / (loadDuration / 1000)).toFixed(2)}
  `)

      expect(successRate).toBeGreaterThan(95) // At least 95% success rate
    })
  })
})
