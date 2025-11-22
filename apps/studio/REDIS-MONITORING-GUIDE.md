# Redis Monitoring & Alerts Guide

## Overview

Production monitoring system for Redis session cache with automated alerts for critical metrics.

---

## Monitoring Endpoints

### Health Check
**Endpoint:** `GET /api/health/redis`

Returns comprehensive health status including:
- Connection status
- Redis server info (version, uptime, memory)
- Cache metrics (hit rate, errors)
- Connection pool statistics
- Performance benchmarks (ping, SET, GET latency)

**Example Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-22T10:30:00Z",
  "redis": {
    "connected": true,
    "version": "7.2.4",
    "uptime": 86400,
    "usedMemory": "12M",
    "totalKeys": 1523
  },
  "sessionCache": {
    "enabled": true,
    "healthy": true,
    "metrics": {
      "hits": 9542,
      "misses": 458,
      "errors": 0,
      "total": 10000,
      "hitRate": 95.42,
      "ttl": 300
    },
    "pool": {
      "size": 5,
      "available": 4,
      "pending": 0
    }
  },
  "performance": {
    "ping": 2,
    "set": 3,
    "get": 2
  },
  "errors": []
}
```

### Alerts Check
**Endpoint:** `GET /api/health/redis-alerts`

Returns active alerts based on critical thresholds:

**Example Response:**
```json
{
  "status": "warning",
  "timestamp": "2025-01-22T10:30:00Z",
  "alerts": [
    {
      "severity": "warning",
      "metric": "cache_hit_rate",
      "message": "Cache hit rate is 85.2%, below 90% threshold",
      "threshold": ">= 90%",
      "actual": "85.2%",
      "recommendation": "Investigate cache misses. Check TTL settings, cache invalidation patterns, or increase cache size.",
      "timestamp": "2025-01-22T10:30:00Z"
    }
  ],
  "summary": {
    "critical": 0,
    "warning": 1,
    "info": 0
  }
}
```

---

## Alert Thresholds

### Critical Alerts (Immediate Action Required)

| Metric | Threshold | Impact |
|--------|-----------|--------|
| **Cache Hit Rate** | < 70% | Severe performance degradation, database overload risk |
| **p99 Latency** | > 50ms | Unacceptable user experience, session validation too slow |
| **Redis Connection** | Disconnected | Complete cache failure, all requests hit database |
| **Memory Usage** | > 95% | Imminent OOM crash or aggressive eviction |
| **Eviction Policy** | noeviction | Will cause write failures when memory full |
| **Cache Error Rate** | > 5% | Cache reliability failure, partial outage |

### Warning Alerts (Investigation Recommended)

| Metric | Threshold | Impact |
|--------|-----------|--------|
| **Cache Hit Rate** | 70-90% | Sub-optimal performance, potential issues |
| **p99 Latency** | 10-50ms | Degraded performance, below target |
| **Memory Usage** | 80-95% | High memory pressure, eviction active |
| **Eviction Policy** | Not allkeys-lru | Sub-optimal eviction behavior |
| **Cache Error Rate** | 1-5% | Intermittent reliability issues |
| **Maxmemory** | Not configured | Risk of OOM crashes |

---

## Monitoring Strategy

### 1. Automated Monitoring (Recommended)

**Option A: Scheduled Health Checks**
Run health checks every 1-5 minutes via cron or scheduled task:

```bash
# Check health endpoint
curl -s http://localhost:3000/api/health/redis | jq '.status'

# Check for alerts
curl -s http://localhost:3000/api/health/redis-alerts | jq '.summary'
```

**Option B: Monitoring Service Integration**
If you have a monitoring service (Datadog, New Relic, etc.):

```javascript
// Poll alerts endpoint
const response = await fetch('/api/health/redis-alerts')
const { status, alerts, summary } = await response.json()

// Send to monitoring service
if (status === 'critical') {
  monitoring.alert('Redis Critical', alerts)
} else if (status === 'warning') {
  monitoring.warn('Redis Warning', alerts)
}
```

**Option C: Log-Based Alerts**
Parse application logs for Redis health status:

```bash
# Watch logs for errors
tail -f app.log | grep -E '\[SessionCache\]|ERROR'

# Filter for specific issues
tail -f app.log | grep 'SessionCache.*error'
```

### 2. Manual Monitoring

**Quick Health Check:**
```bash
curl http://localhost:3000/api/health/redis | jq '.'
```

**Alert Status:**
```bash
curl http://localhost:3000/api/health/redis-alerts | jq '.'
```

**Railway Redis Dashboard:**
- Navigate to Railway project
- Select Redis service
- Check Metrics tab for memory, CPU, network

---

## Alert Response Procedures

### Cache Hit Rate Alerts

**If hit rate < 90%:**
1. Check current TTL settings (currently 5 minutes)
2. Review cache invalidation patterns
3. Analyze session access patterns
4. Consider increasing TTL if sessions are stable

**Investigation queries:**
```typescript
// Get current cache metrics
const metrics = getSessionCacheMetrics()
console.log('Hit Rate:', metrics.hitRate)
console.log('Hits:', metrics.hits)
console.log('Misses:', metrics.misses)
```

**Common causes:**
- TTL too short for access pattern
- Aggressive cache invalidation
- Cold cache after restart
- Memory pressure causing evictions

### Performance Latency Alerts

**If p99 > 10ms:**
1. Check network latency to Redis
2. Verify using `railway.internal` domain (not public proxy)
3. Review connection pool stats
4. Check for slow Redis commands

**Investigation:**
```bash
# Test direct Redis latency
redis-cli -h hopper.proxy.rlwy.net -p 29824 --latency

# Check connection pool
curl http://localhost:3000/api/health/redis | jq '.sessionCache.pool'
```

**Common causes:**
- Using public proxy instead of internal network
- Connection pool exhaustion
- Network issues
- Redis server CPU/memory pressure

### Memory Usage Alerts

**If memory > 80%:**
1. Check eviction policy is set (`allkeys-lru`)
2. Review memory usage trend
3. Consider increasing `maxmemory` limit
4. Verify eviction is working

**Investigation:**
```bash
# Check Redis memory info
REDIS_URL=... npx tsx scripts/configure-redis.ts

# Or via Railway dashboard
# Redis service -> Metrics -> Memory
```

**Common causes:**
- Data growth exceeding capacity
- Eviction policy not configured
- Memory leak (check for growing key count)
- Inefficient data structures

### Connection Failure Alerts

**If Redis disconnected:**
1. Check Redis service status on Railway
2. Verify `REDIS_URL` environment variable
3. Check network connectivity
4. Review connection logs

**Recovery steps:**
```bash
# Verify Redis is accessible
redis-cli -u $REDIS_URL ping

# Check service status on Railway
# Dashboard -> Redis service -> Status

# Restart application if needed
```

---

## Performance Targets

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| **Cache Hit Rate** | > 95% | 90-95% | < 90% |
| **p50 Latency** | < 3ms | 3-5ms | > 5ms |
| **p95 Latency** | < 5ms | 5-8ms | > 8ms |
| **p99 Latency** | < 10ms | 10-20ms | > 20ms |
| **Error Rate** | 0% | < 0.1% | > 0.1% |
| **Memory Usage** | < 70% | 70-80% | > 80% |
| **Connection Pool** | < 50% used | 50-80% | > 80% |

---

## Monitoring Checklist

### Daily
- [ ] Check `/api/health/redis-alerts` for active alerts
- [ ] Review cache hit rate trend
- [ ] Monitor memory usage

### Weekly
- [ ] Review performance latency trends
- [ ] Analyze cache invalidation patterns
- [ ] Check connection pool utilization
- [ ] Review error logs

### Monthly
- [ ] Performance benchmark comparison
- [ ] Capacity planning review
- [ ] Configuration optimization review
- [ ] Disaster recovery test

---

## Troubleshooting Guide

### Problem: Low Cache Hit Rate

**Symptoms:**
- Hit rate < 90%
- Increased database load
- Slower response times

**Diagnosis:**
```bash
# Check metrics
curl http://localhost:3000/api/health/redis | jq '.sessionCache.metrics'

# Review logs
grep "SessionCache.*MISS" app.log | tail -20
```

**Solutions:**
- Increase TTL if appropriate for use case
- Review cache invalidation logic
- Check for memory pressure causing evictions
- Verify cache warming after deployments

### Problem: High Latency

**Symptoms:**
- p99 > 10ms
- Slow session validation
- User experience degradation

**Diagnosis:**
```bash
# Test Redis latency
redis-cli -u $REDIS_URL --latency

# Check network path
# Should use railway.internal, not proxy
```

**Solutions:**
- Switch to internal network (`railway.internal` domain)
- Increase connection pool size
- Check for network issues
- Optimize data structure usage

### Problem: Memory Pressure

**Symptoms:**
- Memory > 80%
- Eviction alerts
- Cache hit rate declining

**Diagnosis:**
```bash
# Check memory usage
REDIS_URL=... npx tsx scripts/configure-redis.ts
```

**Solutions:**
- Verify eviction policy is `allkeys-lru`
- Increase `maxmemory` limit if capacity allows
- Review data structures for efficiency
- Check for memory leaks

### Problem: Connection Failures

**Symptoms:**
- Redis connection errors
- Cache disabled fallback to DB
- Intermittent failures

**Diagnosis:**
```bash
# Test connection
redis-cli -u $REDIS_URL ping

# Check connection pool
curl http://localhost:3000/api/health/redis | jq '.sessionCache.pool'
```

**Solutions:**
- Verify Redis service is running on Railway
- Check `REDIS_URL` is correct
- Review network connectivity
- Increase connection timeout if needed

---

## Metrics Collection

### Application Logs

The session cache automatically logs important events:

```
[SessionCache] Redis session caching enabled
[SessionCache] Cache HIT for token (2ms)
[SessionCache] Cache MISS, loaded from DB (45ms)
[SessionCache] Invalidated session cache
[SessionCache] Health check failed: <error>
```

**Filter for important events:**
```bash
# Cache performance
grep "SessionCache.*HIT\|MISS" app.log

# Errors
grep "SessionCache.*error" app.log

# Health status
grep "SessionCache.*Health" app.log
```

### Custom Metrics Integration

If you have a metrics system, poll the health endpoint:

```typescript
// Example: Collect metrics every minute
setInterval(async () => {
  const health = await fetch('/api/health/redis').then(r => r.json())

  // Send to metrics system
  metrics.gauge('redis.cache.hit_rate', health.sessionCache.metrics.hitRate)
  metrics.gauge('redis.performance.ping', health.performance.ping)
  metrics.gauge('redis.pool.size', health.sessionCache.pool.size)
  metrics.gauge('redis.pool.available', health.sessionCache.pool.available)

  // Check alerts
  const alerts = await fetch('/api/health/redis-alerts').then(r => r.json())
  metrics.gauge('redis.alerts.critical', alerts.summary.critical)
  metrics.gauge('redis.alerts.warning', alerts.summary.warning)
}, 60000)
```

---

## Alert Configuration Examples

### Example 1: Simple Log Monitoring

```bash
#!/bin/bash
# Check alerts and log to file

ALERTS=$(curl -s http://localhost:3000/api/health/redis-alerts | jq -r '.status')

if [ "$ALERTS" = "critical" ]; then
  echo "[$(date)] CRITICAL: Redis alerts detected" >> /var/log/redis-alerts.log
  curl -s http://localhost:3000/api/health/redis-alerts | jq '.' >> /var/log/redis-alerts.log
elif [ "$ALERTS" = "warning" ]; then
  echo "[$(date)] WARNING: Redis warnings detected" >> /var/log/redis-alerts.log
fi
```

### Example 2: Email Notifications

```typescript
// Monitor and send email on critical alerts
const checkAlerts = async () => {
  const response = await fetch('/api/health/redis-alerts')
  const { status, alerts } = await response.json()

  if (status === 'critical') {
    await sendEmail({
      to: 'ops@example.com',
      subject: 'CRITICAL: Redis Alerts',
      body: JSON.stringify(alerts, null, 2)
    })
  }
}

// Run every 5 minutes
setInterval(checkAlerts, 5 * 60 * 1000)
```

### Example 3: Slack Notifications

```typescript
// Post to Slack on alerts
const checkAlertsSlack = async () => {
  const response = await fetch('/api/health/redis-alerts')
  const { status, alerts, summary } = await response.json()

  if (status !== 'healthy') {
    const emoji = status === 'critical' ? '🔴' : '⚠️'
    const message = `${emoji} Redis ${status.toUpperCase()}: ${summary.critical} critical, ${summary.warning} warnings`

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        text: message,
        attachments: alerts.map(a => ({
          color: a.severity === 'critical' ? 'danger' : 'warning',
          title: a.metric,
          text: a.message,
          fields: [
            { title: 'Threshold', value: a.threshold, short: true },
            { title: 'Actual', value: a.actual, short: true },
            { title: 'Recommendation', value: a.recommendation }
          ]
        }))
      })
    })
  }
}
```

---

## Production Readiness Checklist

Before going to production, verify:

- [ ] Redis eviction policy configured (`allkeys-lru`)
- [ ] Maxmemory limit set (256MB recommended for Railway free tier)
- [ ] AUTH password enabled and verified
- [ ] Connection pool configured (2-10 connections)
- [ ] Health endpoint accessible (`/api/health/redis`)
- [ ] Alerts endpoint accessible (`/api/health/redis-alerts`)
- [ ] Monitoring strategy implemented (automated checks)
- [ ] Alert response procedures documented
- [ ] Team trained on alert response
- [ ] Load testing completed
- [ ] Performance targets met (>90% hit rate, <10ms p99)

---

## Additional Resources

- **Redis Configuration:** `scripts/configure-redis.ts`
- **Performance Benchmark:** `tests/session-performance-benchmark.ts`
- **Session Cache Implementation:** `lib/api/auth/session-cache.ts`
- **Redis Client:** `lib/api/platform/redis.ts`

---

Last Updated: 2025-01-22
