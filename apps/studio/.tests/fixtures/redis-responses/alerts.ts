/**
 * Redis Alerts Response Fixtures
 *
 * Mock data for Redis alert responses
 */

import type { MockRedisAlert } from '../../helpers/mocks'

/**
 * High memory usage alert
 */
export const highMemoryAlert: MockRedisAlert = {
  id: 'alert-mem-001',
  type: 'high_memory',
  severity: 'warning',
  message: 'Memory usage is approaching limit (85.5%)',
  value: 85.5,
  threshold: 80,
  timestamp: '2025-11-22T10:00:00Z',
}

/**
 * Critical memory usage alert
 */
export const criticalMemoryAlert: MockRedisAlert = {
  id: 'alert-mem-002',
  type: 'high_memory',
  severity: 'critical',
  message: 'Memory usage has exceeded critical threshold (96.8%)',
  value: 96.8,
  threshold: 95,
  timestamp: '2025-11-22T10:05:00Z',
}

/**
 * Low cache hit rate alert
 */
export const lowHitRateAlert: MockRedisAlert = {
  id: 'alert-cache-001',
  type: 'low_hit_rate',
  severity: 'warning',
  message: 'Cache hit rate has dropped below optimal level (65.3%)',
  value: 65.3,
  threshold: 75,
  timestamp: '2025-11-22T10:10:00Z',
}

/**
 * Critical low cache hit rate alert
 */
export const criticalHitRateAlert: MockRedisAlert = {
  id: 'alert-cache-002',
  type: 'low_hit_rate',
  severity: 'critical',
  message: 'Cache hit rate is critically low (32.1%), review caching strategy',
  value: 32.1,
  threshold: 50,
  timestamp: '2025-11-22T10:15:00Z',
}

/**
 * High latency alert
 */
export const highLatencyAlert: MockRedisAlert = {
  id: 'alert-lat-001',
  type: 'high_latency',
  severity: 'warning',
  message: 'Redis latency has increased significantly (45.8ms)',
  value: 45.8,
  threshold: 20,
  timestamp: '2025-11-22T10:20:00Z',
}

/**
 * Critical latency alert
 */
export const criticalLatencyAlert: MockRedisAlert = {
  id: 'alert-lat-002',
  type: 'high_latency',
  severity: 'critical',
  message: 'Redis latency is critically high (125.4ms), investigate immediately',
  value: 125.4,
  threshold: 100,
  timestamp: '2025-11-22T10:25:00Z',
}

/**
 * Connection spike alert
 */
export const connectionSpikeAlert: MockRedisAlert = {
  id: 'alert-conn-001',
  type: 'connection_spike',
  severity: 'warning',
  message: 'Connection count has spiked to 42 (peak: 48)',
  value: 42,
  threshold: 30,
  timestamp: '2025-11-22T10:30:00Z',
}

/**
 * Critical connection spike alert
 */
export const criticalConnectionAlert: MockRedisAlert = {
  id: 'alert-conn-002',
  type: 'connection_spike',
  severity: 'critical',
  message: 'Connection limit nearly reached (45/50), connections being rejected',
  value: 45,
  threshold: 40,
  timestamp: '2025-11-22T10:35:00Z',
}

/**
 * Hotkey detected alert
 */
export const hotkeyAlert: MockRedisAlert = {
  id: 'alert-hotkey-001',
  type: 'hotkey',
  severity: 'info',
  message: 'Hotkey detected: "session:user:123" accessed 1,247 times (15.2% of all requests)',
  value: 15.2,
  threshold: 10,
  timestamp: '2025-11-22T10:40:00Z',
}

/**
 * Critical hotkey alert
 */
export const criticalHotkeyAlert: MockRedisAlert = {
  id: 'alert-hotkey-002',
  type: 'hotkey',
  severity: 'critical',
  message: 'Critical hotkey detected: "session:user:456" consuming 42.3% of all requests, consider sharding',
  value: 42.3,
  threshold: 25,
  timestamp: '2025-11-22T10:45:00Z',
}

/**
 * Multiple alerts scenario
 */
export const multipleAlerts: MockRedisAlert[] = [
  highMemoryAlert,
  lowHitRateAlert,
  hotkeyAlert,
]

/**
 * Critical alerts scenario
 */
export const criticalAlerts: MockRedisAlert[] = [
  criticalMemoryAlert,
  criticalLatencyAlert,
  criticalConnectionAlert,
]

/**
 * No alerts (healthy system)
 */
export const noAlerts: MockRedisAlert[] = []

/**
 * Info-level alerts only
 */
export const infoAlerts: MockRedisAlert[] = [
  hotkeyAlert,
]
