/**
 * Redis Hotkey Detection System
 *
 * Tracks key access frequency to identify hotkeys that could cause bottlenecks.
 * Uses sliding window algorithm for real-time detection with minimal overhead.
 *
 * Features:
 * - Sliding window tracking (1 minute intervals)
 * - Configurable thresholds (default: 1000 accesses/min)
 * - Top N hotkey reporting
 * - Auto-cleanup of stale data
 * - <2ms overhead per operation
 *
 * Usage:
 *   const detector = new HotkeyDetector()
 *   detector.track('session:user:123')
 *   const hotkeys = detector.getHotkeys()
 */

import { Redis as RedisClient } from 'ioredis'

interface HotkeyMetric {
  key: string
  accessCount: number
  accessesPerMinute: number
  firstSeen: number
  lastSeen: number
  isHot: boolean
}

interface HotkeyStats {
  totalKeys: number
  totalAccesses: number
  hotkeys: HotkeyMetric[]
  thresholdExceeded: number
  windowStartTime: number
  windowEndTime: number
}

interface AccessWindow {
  count: number
  timestamp: number
}

/**
 * Sliding window for tracking key access frequency
 */
class SlidingWindow {
  private windows: Map<number, number> = new Map()
  private readonly windowSizeMs: number
  private readonly bucketSizeMs: number

  constructor(windowSizeMs: number = 60000, bucketSizeMs: number = 1000) {
    this.windowSizeMs = windowSizeMs
    this.bucketSizeMs = bucketSizeMs
  }

  /**
   * Record an access in the current time bucket
   */
  record(timestamp: number = Date.now()): void {
    const bucket = Math.floor(timestamp / this.bucketSizeMs)
    const current = this.windows.get(bucket) || 0
    this.windows.set(bucket, current + 1)
  }

  /**
   * Get access count within the sliding window
   */
  getCount(now: number = Date.now()): number {
    const windowStart = now - this.windowSizeMs
    const startBucket = Math.floor(windowStart / this.bucketSizeMs)
    const endBucket = Math.floor(now / this.bucketSizeMs)

    let count = 0
    for (let bucket = startBucket; bucket <= endBucket; bucket++) {
      count += this.windows.get(bucket) || 0
    }

    return count
  }

  /**
   * Clean up old buckets outside the window
   */
  cleanup(now: number = Date.now()): void {
    const windowStart = now - this.windowSizeMs
    const startBucket = Math.floor(windowStart / this.bucketSizeMs)

    for (const [bucket] of this.windows) {
      if (bucket < startBucket) {
        this.windows.delete(bucket)
      }
    }
  }

  /**
   * Get accesses per minute based on current window
   */
  getAccessesPerMinute(now: number = Date.now()): number {
    const count = this.getCount(now)
    const windowSizeMinutes = this.windowSizeMs / 60000
    return Math.round(count / windowSizeMinutes)
  }
}

/**
 * Hotkey detection and tracking system
 */
export class HotkeyDetector {
  private keyTracking: Map<string, SlidingWindow> = new Map()
  private firstSeenTimestamps: Map<string, number> = new Map()
  private lastSeenTimestamps: Map<string, number> = new Map()
  private readonly threshold: number
  private readonly windowSizeMs: number
  private readonly maxTrackedKeys: number
  private lastCleanup: number = Date.now()
  private readonly cleanupIntervalMs: number = 30000 // 30 seconds

  constructor(options: {
    threshold?: number
    windowSizeMs?: number
    maxTrackedKeys?: number
  } = {}) {
    this.threshold = options.threshold || 1000 // accesses per minute
    this.windowSizeMs = options.windowSizeMs || 60000 // 1 minute
    this.maxTrackedKeys = options.maxTrackedKeys || 10000 // prevent memory issues
  }

  /**
   * Track a key access
   * This is the hot path - must be <2ms
   */
  track(key: string, timestamp: number = Date.now()): void {
    // Fast path: if we're tracking too many keys, only track existing keys
    if (this.keyTracking.size >= this.maxTrackedKeys && !this.keyTracking.has(key)) {
      return
    }

    // Get or create sliding window for this key
    let window = this.keyTracking.get(key)
    if (!window) {
      window = new SlidingWindow(this.windowSizeMs)
      this.keyTracking.set(key, window)
      this.firstSeenTimestamps.set(key, timestamp)
    }

    // Record access
    window.record(timestamp)
    this.lastSeenTimestamps.set(key, timestamp)

    // Periodic cleanup to prevent memory leaks
    if (timestamp - this.lastCleanup > this.cleanupIntervalMs) {
      this.cleanup(timestamp)
      this.lastCleanup = timestamp
    }
  }

  /**
   * Get hotkey metrics for a specific key
   */
  getKeyMetric(key: string, now: number = Date.now()): HotkeyMetric | null {
    const window = this.keyTracking.get(key)
    if (!window) {
      return null
    }

    const accessCount = window.getCount(now)
    const accessesPerMinute = window.getAccessesPerMinute(now)

    return {
      key,
      accessCount,
      accessesPerMinute,
      firstSeen: this.firstSeenTimestamps.get(key) || now,
      lastSeen: this.lastSeenTimestamps.get(key) || now,
      isHot: accessesPerMinute >= this.threshold,
    }
  }

  /**
   * Get all hotkeys exceeding the threshold
   */
  getHotkeys(limit: number = 10, now: number = Date.now()): HotkeyStats {
    const allMetrics: HotkeyMetric[] = []
    let totalAccesses = 0

    // Collect metrics for all tracked keys
    for (const [key, window] of this.keyTracking) {
      const accessCount = window.getCount(now)
      const accessesPerMinute = window.getAccessesPerMinute(now)

      totalAccesses += accessCount

      allMetrics.push({
        key,
        accessCount,
        accessesPerMinute,
        firstSeen: this.firstSeenTimestamps.get(key) || now,
        lastSeen: this.lastSeenTimestamps.get(key) || now,
        isHot: accessesPerMinute >= this.threshold,
      })
    }

    // Sort by access frequency
    allMetrics.sort((a, b) => b.accessesPerMinute - a.accessesPerMinute)

    // Get top N
    const topHotkeys = allMetrics.slice(0, limit)

    // Count how many exceed threshold
    const thresholdExceeded = allMetrics.filter((m) => m.isHot).length

    return {
      totalKeys: this.keyTracking.size,
      totalAccesses,
      hotkeys: topHotkeys,
      thresholdExceeded,
      windowStartTime: now - this.windowSizeMs,
      windowEndTime: now,
    }
  }

  /**
   * Check if a specific key is hot
   */
  isHotkey(key: string, now: number = Date.now()): boolean {
    const metric = this.getKeyMetric(key, now)
    return metric ? metric.isHot : false
  }

  /**
   * Clean up stale tracking data
   */
  private cleanup(now: number = Date.now()): void {
    const keysToRemove: string[] = []

    for (const [key, window] of this.keyTracking) {
      // Clean up old buckets within each window
      window.cleanup(now)

      // Remove keys with no recent activity
      const accessCount = window.getCount(now)
      if (accessCount === 0) {
        keysToRemove.push(key)
      }
    }

    // Remove stale keys
    for (const key of keysToRemove) {
      this.keyTracking.delete(key)
      this.firstSeenTimestamps.delete(key)
      this.lastSeenTimestamps.delete(key)
    }
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.keyTracking.clear()
    this.firstSeenTimestamps.clear()
    this.lastSeenTimestamps.clear()
    this.lastCleanup = Date.now()
  }

  /**
   * Get current tracking statistics
   */
  getStats(): {
    trackedKeys: number
    threshold: number
    windowSizeMs: number
    maxTrackedKeys: number
  } {
    return {
      trackedKeys: this.keyTracking.size,
      threshold: this.threshold,
      windowSizeMs: this.windowSizeMs,
      maxTrackedKeys: this.maxTrackedKeys,
    }
  }
}

/**
 * Global hotkey detector instance
 * Shared across all Redis operations for consistent tracking
 */
let globalDetector: HotkeyDetector | null = null

/**
 * Get or create the global hotkey detector
 */
export function getHotkeyDetector(): HotkeyDetector {
  if (!globalDetector) {
    globalDetector = new HotkeyDetector({
      threshold: parseInt(process.env.REDIS_HOTKEY_THRESHOLD || '1000'),
      windowSizeMs: parseInt(process.env.REDIS_HOTKEY_WINDOW_MS || '60000'),
      maxTrackedKeys: parseInt(process.env.REDIS_MAX_TRACKED_KEYS || '10000'),
    })
  }
  return globalDetector
}

/**
 * Reset the global detector (useful for testing)
 */
export function resetHotkeyDetector(): void {
  if (globalDetector) {
    globalDetector.reset()
  }
  globalDetector = null
}

/**
 * Export types for external use
 */
export type { HotkeyMetric, HotkeyStats }
