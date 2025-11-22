/**
 * TypeScript interfaces for Redis metrics and dashboard data
 * @module types/redis
 */

// ========================================
// Health & Status Types (matches /api/health/redis)
// ========================================

export type RedisStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface RedisHealth {
  status: RedisStatus
  timestamp: string
  redis: RedisInfo
  sessionCache: SessionCacheInfo
  hotkeys: HotkeysInfo
  performance: PerformanceMetrics
  errors: string[]
}

export interface RedisInfo {
  connected: boolean
  version?: string
  uptime?: number
  usedMemory?: string
  totalKeys?: number
}

export interface SessionCacheInfo {
  enabled: boolean
  healthy: boolean
  metrics: SessionCacheMetrics
  pool: ConnectionPoolStats | null
}

export interface SessionCacheMetrics {
  hits: number
  misses: number
  errors: number
  total: number
  hitRate: number
  ttl: number
}

export interface ConnectionPoolStats {
  size: number
  available: number
  pending: number
}

export interface HotkeysInfo {
  totalTracked: number
  totalAccesses: number
  thresholdExceeded: number
  topHotkeys: HotkeyMetric[]
  detectorStats: HotkeyDetectorStats
}

export interface HotkeyMetric {
  key: string
  accesses: number
  accessesPerMinute: number
  firstSeen: number
  lastAccessed: number
  isHot: boolean
}

export interface HotkeyDetectorStats {
  threshold: number
  windowSizeMs: number
  maxTrackedKeys: number
  trackedKeys?: number
}

export interface PerformanceMetrics {
  ping: number | null
  set: number | null
  get: number | null
}

// ========================================
// Alerts Types (matches /api/health/redis-alerts)
// ========================================

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface Alert {
  severity: AlertSeverity
  metric: string
  message: string
  threshold: string
  actual: string
  recommendation: string
  timestamp: string
}

export interface AlertsResponse {
  status: 'healthy' | 'warning' | 'critical'
  timestamp: string
  alerts: Alert[]
  summary: AlertsSummary
}

export interface AlertsSummary {
  critical: number
  warning: number
  info: number
}

// ========================================
// Historical Metrics Types (for new /api/health/redis/metrics endpoint)
// ========================================

export type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h' | '7d'
export type MetricInterval = '5s' | '30s' | '1m' | '5m' | '15m' | '1h'

export interface RedisMetricsHistory {
  range: TimeRange
  interval: MetricInterval
  dataPoints: MetricDataPoint[]
}

export interface MetricDataPoint {
  timestamp: string
  hitRate: number
  latencyP99: number
  latencyP95: number
  latencyP50: number
  memoryPercent: number
  memoryUsed?: number
  connectionsActive?: number
  connectionsIdle?: number
}

// ========================================
// Dashboard KPI Types
// ========================================

export type MetricStatus = 'healthy' | 'warning' | 'critical'
export type TrendDirection = 'up' | 'down' | 'neutral'

export interface MetricTrend {
  value: number
  direction: TrendDirection
  period?: string // e.g., "vs. 5 min ago"
}

export interface KPIMetric {
  value: number
  unit: string
  trend?: MetricTrend
  status: MetricStatus
  tooltip?: string
}

// ========================================
// Legacy types (for backward compatibility)
// ========================================

/** @deprecated Use RedisHealth instead */
export interface Hotkey {
  key: string
  frequency: number
}

/** @deprecated Use Alert instead */
export interface RedisAlert {
  id: string
  severity: 'warning' | 'critical'
  message: string
  timestamp: string
  status: 'active' | 'resolved' | 'auto-resolved'
  runbook?: string
  details?: Record<string, any>
}

/** @deprecated Use SessionCacheMetrics directly from RedisHealth */
export interface RedisMetrics {
  hit_rate: number
  latency_p50: number
  latency_p95: number
  latency_p99: number
  memory_used: number
  memory_max: number
  memory_percent: number
  connections_active: number
  connections_idle: number
  connections_max: number
  circuit_breaker: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  errors_24h: number
}
