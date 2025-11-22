/**
 * Hotkey Detection System Test
 *
 * Validates hotkey tracking, sliding window behavior, and alert generation
 */

import { HotkeyDetector } from '../lib/api/cache/hotkey-detection'

interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration: number
}

const results: TestResult[] = []

function test(name: string, fn: () => void | Promise<void>): void {
  const start = Date.now()
  try {
    const result = fn()
    if (result instanceof Promise) {
      result
        .then(() => {
          results.push({ name, passed: true, duration: Date.now() - start })
          console.log(`✅ ${name} (${Date.now() - start}ms)`)
        })
        .catch((error) => {
          results.push({ name, passed: false, error: String(error), duration: Date.now() - start })
          console.error(`❌ ${name}: ${error}`)
        })
    } else {
      results.push({ name, passed: true, duration: Date.now() - start })
      console.log(`✅ ${name} (${Date.now() - start}ms)`)
    }
  } catch (error) {
    results.push({ name, passed: false, error: String(error), duration: Date.now() - start })
    console.error(`❌ ${name}: ${error}`)
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

console.log('🚀 Starting Hotkey Detection Tests\n')

// ========================================
// Test 1: Basic Tracking
// ========================================
test('Basic key tracking', () => {
  const detector = new HotkeyDetector({ threshold: 100 })
  const now = Date.now()

  // Track a key 5 times
  for (let i = 0; i < 5; i++) {
    detector.track('test:key:1', now)
  }

  const metric = detector.getKeyMetric('test:key:1', now)
  assert(metric !== null, 'Metric should exist')
  assert(metric!.accessCount === 5, `Expected 5 accesses, got ${metric!.accessCount}`)
  assert(metric!.key === 'test:key:1', `Expected key test:key:1, got ${metric!.key}`)
})

// ========================================
// Test 2: Sliding Window
// ========================================
test('Sliding window behavior', () => {
  const detector = new HotkeyDetector({ threshold: 100, windowSizeMs: 5000 })
  const now = Date.now()

  // Track at time T
  detector.track('test:key:2', now)
  detector.track('test:key:2', now + 1000)
  detector.track('test:key:2', now + 2000)

  // Should see 3 accesses
  let metric = detector.getKeyMetric('test:key:2', now + 2000)
  assert(metric!.accessCount === 3, `Expected 3 accesses at T+2s, got ${metric!.accessCount}`)

  // Track beyond window (T+6s)
  const futureTime = now + 6000
  metric = detector.getKeyMetric('test:key:2', futureTime)

  // First access at T should be outside 5s window
  assert(
    metric!.accessCount < 3,
    `Expected <3 accesses outside window, got ${metric!.accessCount}`
  )
})

// ========================================
// Test 3: Hotkey Detection
// ========================================
test('Hotkey threshold detection', () => {
  const detector = new HotkeyDetector({ threshold: 10, windowSizeMs: 60000 })
  const now = Date.now()

  // Track below threshold
  for (let i = 0; i < 5; i++) {
    detector.track('test:key:cold', now)
  }

  // Track above threshold
  for (let i = 0; i < 15; i++) {
    detector.track('test:key:hot', now)
  }

  const coldMetric = detector.getKeyMetric('test:key:cold', now)
  const hotMetric = detector.getKeyMetric('test:key:hot', now)

  assert(!coldMetric!.isHot, 'Cold key should not be hot')
  assert(hotMetric!.isHot, 'Hot key should be hot')

  const stats = detector.getHotkeys(10, now)
  assert(stats.thresholdExceeded === 1, `Expected 1 hotkey, got ${stats.thresholdExceeded}`)
  assert(stats.hotkeys[0].key === 'test:key:hot', 'Top hotkey should be test:key:hot')
})

// ========================================
// Test 4: Top N Hotkeys
// ========================================
test('Top N hotkey ranking', () => {
  const detector = new HotkeyDetector({ threshold: 10 })
  const now = Date.now()

  // Create keys with different access counts
  for (let i = 0; i < 50; i++) detector.track('test:key:rank:1', now)
  for (let i = 0; i < 30; i++) detector.track('test:key:rank:2', now)
  for (let i = 0; i < 20; i++) detector.track('test:key:rank:3', now)
  for (let i = 0; i < 5; i++) detector.track('test:key:rank:4', now)

  const stats = detector.getHotkeys(3, now)

  assert(stats.hotkeys.length === 3, `Expected 3 hotkeys, got ${stats.hotkeys.length}`)
  assert(stats.hotkeys[0].key === 'test:key:rank:1', 'Rank 1 should be first')
  assert(stats.hotkeys[1].key === 'test:key:rank:2', 'Rank 2 should be second')
  assert(stats.hotkeys[2].key === 'test:key:rank:3', 'Rank 3 should be third')

  // Verify descending order
  assert(
    stats.hotkeys[0].accessesPerMinute > stats.hotkeys[1].accessesPerMinute,
    'Hotkeys should be sorted by frequency'
  )
})

// ========================================
// Test 5: Memory Limit
// ========================================
test('Max tracked keys limit', () => {
  const detector = new HotkeyDetector({ threshold: 100, maxTrackedKeys: 5 })
  const now = Date.now()

  // Track more keys than limit
  for (let i = 0; i < 10; i++) {
    detector.track(`test:key:limit:${i}`, now)
  }

  const stats = detector.getStats()
  assert(
    stats.trackedKeys <= 5,
    `Should not track more than 5 keys, got ${stats.trackedKeys}`
  )
})

// ========================================
// Test 6: Cleanup
// ========================================
test('Automatic cleanup of stale keys', () => {
  const detector = new HotkeyDetector({ threshold: 100, windowSizeMs: 1000 })
  const now = Date.now()

  // Track a key
  detector.track('test:key:cleanup', now)

  // Verify it exists
  let metric = detector.getKeyMetric('test:key:cleanup', now)
  assert(metric !== null, 'Key should exist immediately')

  // Move time forward beyond window
  const futureTime = now + 2000
  metric = detector.getKeyMetric('test:key:cleanup', futureTime)

  // Key should have zero accesses in new window
  assert(metric!.accessCount === 0, `Expected 0 accesses after cleanup, got ${metric!.accessCount}`)
})

// ========================================
// Test 7: Performance (Overhead)
// ========================================
test('Tracking overhead <2ms', () => {
  const detector = new HotkeyDetector({ threshold: 1000 })
  const iterations = 1000

  const start = Date.now()
  for (let i = 0; i < iterations; i++) {
    detector.track(`test:key:perf:${i % 10}`, Date.now())
  }
  const duration = Date.now() - start

  const avgOverhead = duration / iterations
  console.log(`   Average overhead: ${avgOverhead.toFixed(3)}ms per operation`)

  assert(avgOverhead < 2, `Overhead ${avgOverhead.toFixed(3)}ms exceeds 2ms limit`)
})

// ========================================
// Test 8: Accesses Per Minute Calculation
// ========================================
test('Accesses per minute calculation', () => {
  const detector = new HotkeyDetector({ threshold: 1000, windowSizeMs: 60000 })
  const now = Date.now()

  // Track 1000 accesses in 1 minute
  for (let i = 0; i < 1000; i++) {
    detector.track('test:key:apm', now + i * 60) // Spread over 60 seconds
  }

  const metric = detector.getKeyMetric('test:key:apm', now + 60000)
  const expectedAPM = 1000 // 1000 accesses in 1 minute

  assert(
    Math.abs(metric!.accessesPerMinute - expectedAPM) < 10,
    `Expected ~${expectedAPM} APM, got ${metric!.accessesPerMinute}`
  )
})

// ========================================
// Test 9: Reset Functionality
// ========================================
test('Reset clears all tracking data', () => {
  const detector = new HotkeyDetector({ threshold: 100 })
  const now = Date.now()

  // Track some keys
  for (let i = 0; i < 5; i++) {
    detector.track(`test:key:reset:${i}`, now)
  }

  // Verify keys are tracked
  let stats = detector.getStats()
  assert(stats.trackedKeys > 0, 'Should have tracked keys')

  // Reset
  detector.reset()

  // Verify all cleared
  stats = detector.getStats()
  assert(stats.trackedKeys === 0, `Expected 0 tracked keys after reset, got ${stats.trackedKeys}`)

  const metric = detector.getKeyMetric('test:key:reset:0', now)
  assert(metric === null, 'Should not find metric after reset')
})

// ========================================
// Test 10: Concurrent Tracking
// ========================================
test('Concurrent key tracking', () => {
  const detector = new HotkeyDetector({ threshold: 100 })
  const now = Date.now()

  // Simulate concurrent access to multiple keys
  const keys = ['key:1', 'key:2', 'key:3', 'key:4', 'key:5']
  const accessesPerKey = 10

  keys.forEach((key) => {
    for (let i = 0; i < accessesPerKey; i++) {
      detector.track(key, now)
    }
  })

  const stats = detector.getHotkeys(10, now)

  assert(stats.totalKeys === keys.length, `Expected ${keys.length} keys, got ${stats.totalKeys}`)
  assert(
    stats.totalAccesses === keys.length * accessesPerKey,
    `Expected ${keys.length * accessesPerKey} total accesses, got ${stats.totalAccesses}`
  )

  // Verify each key has correct count
  keys.forEach((key) => {
    const metric = detector.getKeyMetric(key, now)
    assert(
      metric!.accessCount === accessesPerKey,
      `Expected ${accessesPerKey} accesses for ${key}, got ${metric!.accessCount}`
    )
  })
})

// ========================================
// Summary
// ========================================
setTimeout(() => {
  console.log('\n📊 Test Summary')
  console.log('================')

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const total = results.length

  console.log(`✅ Passed: ${passed}/${total}`)
  console.log(`❌ Failed: ${failed}/${total}`)

  if (failed > 0) {
    console.log('\n❌ Failed Tests:')
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`)
      })
    process.exit(1)
  } else {
    console.log('\n🎉 All tests passed!')
    process.exit(0)
  }
}, 1000)
