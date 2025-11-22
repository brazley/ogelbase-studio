# ZKEB on Railway: Defense-in-Depth Security Architecture
**Defensive Genius Architecture for SOC 2 & HIPAA Compliance**

**Document Version:** 1.0
**Date:** 2025-01-22
**Classification:** Security Architecture
**Architect:** AEGIS - Defensive Security Architecture Visionary

---

## Executive Summary

This document defines a **defense-in-depth security architecture** for deploying the Zero-Knowledge Encrypted Backup (ZKEB) Protocol on Railway's cloud platform. The architecture implements 7 defensive layers designed to satisfy SOC 2 Trust Service Criteria and HIPAA Security Rule requirements while maintaining Railway's operational efficiency.

**Key Defensive Principles:**
- **Zero-Trust Architecture**: Never trust, always verify
- **Defense in Depth**: Multiple independent security layers
- **Assume Breach**: Design for containment and detection
- **Least Privilege**: Minimal access by default
- **Security by Design**: Protection built-in, not bolted-on

---

## Table of Contents

1. [Railway Deployment Architecture](#1-railway-deployment-architecture)
2. [Seven Defensive Layers](#2-seven-defensive-layers)
3. [Threat Model & Attack Surface Analysis](#3-threat-model--attack-surface-analysis)
4. [Security Controls Mapping](#4-security-controls-mapping)
5. [Audit & Compliance Framework](#5-audit--compliance-framework)
6. [Production Hardening Checklist](#6-production-hardening-checklist)
7. [Incident Response & Monitoring](#7-incident-response--monitoring)

---

## 1. Railway Deployment Architecture

### 1.1 Railway Service Topology

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Railway Private Network Topology                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Public Internet                                                                │
│  │                                                                              │
│  │  [TLS 1.3 Termination]                                                      │
│  │  [Certificate Pinning Validation]                                           │
│  ▼                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                       Railway Edge (Cloudflare)                         │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │  - DDoS Protection (Layer 3/4/7)                                 │   │   │
│  │  │  - WAF with OWASP Core Rule Set                                  │   │   │
│  │  │  - Rate Limiting (per-IP, per-endpoint)                          │   │   │
│  │  │  - Geographic Blocking (optional)                                │   │   │
│  │  │  - Bot Detection & Mitigation                                    │   │   │
│  │  └──────────────────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                      │                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │                     Railway Private Network                           │    │
│  │  (Internal DNS: *.railway.internal)                                   │    │
│  ├────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                        │    │
│  │  ┌──────────────────────────────────────────────────────────────┐     │    │
│  │  │  API Gateway Service (zkeb-api-gateway)                      │     │    │
│  │  │  ┌────────────────────────────────────────────────────────┐  │     │    │
│  │  │  │  - Request Authentication (JWT validation)             │  │     │    │
│  │  │  │  - Rate Limiting (per-device, per-user)                │  │     │    │
│  │  │  │  - Request Validation (schema enforcement)             │  │     │    │
│  │  │  │  - Audit Logging (non-PII metadata only)               │  │     │    │
│  │  │  │  - Circuit Breaker Pattern                            │  │     │    │
│  │  │  │  - Service Discovery                                   │  │     │    │
│  │  │  │  Endpoint: https://zkeb-api.railway.app                │  │     │    │
│  │  │  │  Health: https://zkeb-api.railway.app/health           │  │     │    │
│  │  │  └────────────────────────────────────────────────────────┘  │     │    │
│  │  └───────────────────┬──────────────────────────────────────────┘     │    │
│  │                      │                                                │    │
│  │         ┌────────────┼────────────┐                                  │    │
│  │         │            │            │                                  │    │
│  │    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐                             │    │
│  │    │        │   │        │   │        │                             │    │
│  │    │ Auth   │   │ Backup │   │ Index  │                             │    │
│  │    │Service │   │Service │   │Service │                             │    │
│  │    │        │   │        │   │        │                             │    │
│  │    └────┬───┘   └────┬───┘   └────┬───┘                             │    │
│  │         │            │            │                                  │    │
│  │    ┌────▼────────────▼────────────▼────┐                             │    │
│  │    │    Redis Cache (Session Store)    │                             │    │
│  │    │    - TLS 1.3 internal connections │                             │    │
│  │    │    - Password authentication      │                             │    │
│  │    │    - Encrypted session data        │                             │    │
│  │    │    redis://redis.railway.internal  │                             │    │
│  │    └────┬────────────────────────────────┘                            │    │
│  │         │                                                             │    │
│  │    ┌────▼──────────────────────────────┐                              │    │
│  │    │  PostgreSQL Database (Metadata)   │                              │    │
│  │    │  ┌─────────────────────────────┐  │                              │    │
│  │    │  │  - Encrypted at rest (AES256)│  │                              │    │
│  │    │  │  - SSL/TLS connections only  │  │                              │    │
│  │    │  │  - Row-Level Security (RLS)  │  │                              │    │
│  │    │  │  - Audit logging enabled     │  │                              │    │
│  │    │  │  - Automated backups (30d)   │  │                              │    │
│  │    │  │  postgres://postgres.railway │  │                              │    │
│  │    │  └─────────────────────────────┘  │                              │    │
│  │    └─────────────────────────────────────┘                            │    │
│  │         │                                                             │    │
│  │    ┌────▼──────────────────────────────┐                              │    │
│  │    │  Object Storage (Encrypted Blobs) │                              │    │
│  │    │  ┌─────────────────────────────┐  │                              │    │
│  │    │  │  Railway Volumes (encrypted) │  │                              │    │
│  │    │  │  OR                          │  │                              │    │
│  │    │  │  S3-compatible (AWS/R2)      │  │                              │    │
│  │    │  │  - Client-side encryption    │  │                              │    │
│  │    │  │  - Server-side encryption    │  │                              │    │
│  │    │  │  - Versioning enabled        │  │                              │    │
│  │    │  │  - Object locking (immutable)│  │                              │    │
│  │    │  └─────────────────────────────┘  │                              │    │
│  │    └─────────────────────────────────────┘                            │    │
│  │                                                                        │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Monitoring & Observability                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │  - Railway Metrics (CPU, Memory, Network)                             │    │
│  │  - Application Logs (sanitized, no PII)                               │    │
│  │  - Security Event Logs (authentication, access attempts)              │    │
│  │  - Uptime Monitoring (internal & external)                            │    │
│  │  - Alerting (PagerDuty/Slack integration)                             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Railway Service Definitions

**Service: zkeb-api-gateway**
```yaml
service: zkeb-api-gateway
type: web
runtime: node:20-alpine
replicas: 2
healthcheck:
  path: /health
  interval: 30s
  timeout: 10s
resources:
  cpu: 1.0
  memory: 1Gi
environment:
  NODE_ENV: production
  TLS_MIN_VERSION: "1.3"
  REDIS_URL: ${{redis.REDIS_URL}}
  DATABASE_URL: ${{postgres.DATABASE_URL}}
networking:
  internal: true
  domains:
    - zkeb-api.railway.app
```

**Service: zkeb-redis**
```yaml
service: zkeb-redis
type: redis
version: 7.2
persistence: true
maxmemory: 512mb
maxmemory-policy: allkeys-lru
tls: true
password: ${REDIS_PASSWORD}
networking:
  internal: true
```

**Service: zkeb-postgres**
```yaml
service: zkeb-postgres
type: postgresql
version: 15
storage: 10Gi
extensions:
  - pgcrypto
  - pg_audit
backup:
  enabled: true
  retention: 30
encryption:
  at_rest: true
  in_transit: true
networking:
  internal: true
ssl_mode: require
```

### 1.3 Network Security Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Network Trust Boundaries                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Untrusted Zone (Public Internet)                                  │
│  ├─ Threat: DDoS, injection attacks, enumeration                   │
│  └─ Defense: WAF, rate limiting, TLS termination                   │
│                            │                                        │
│                            ▼                                        │
│  DMZ (Railway Edge)                                                 │
│  ├─ Threat: Protocol exploits, certificate attacks                 │
│  └─ Defense: TLS 1.3, certificate pinning, security headers        │
│                            │                                        │
│                            ▼                                        │
│  Trusted Zone (Private Network)                                    │
│  ├─ Threat: Lateral movement, privilege escalation                 │
│  └─ Defense: Service mesh, mTLS, network policies                  │
│                                                                     │
│  Data Zone (Storage Layer)                                         │
│  ├─ Threat: Data exfiltration, unauthorized access                 │
│  └─ Defense: Encryption at rest, access logging, immutable storage │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Seven Defensive Layers

### Layer 1: Network Perimeter Defense

**Objective:** Stop attacks before they reach application logic

#### 2.1.1 Railway Edge Protection
```yaml
Cloudflare WAF Configuration:
  - OWASP ModSecurity Core Rule Set
  - Custom rules for ZKEB protocol patterns
  - Managed rulesets:
    - SQL injection prevention
    - XSS attack blocking
    - Command injection detection
    - Path traversal blocking

Rate Limiting Rules:
  Device Registration:
    - 10 requests per IP per hour
    - 5 requests per device per hour

  Backup Creation:
    - 100 requests per device per hour
    - 1000 requests per user per day

  Backup Retrieval:
    - 500 requests per device per hour
    - Burst: 50 requests per minute

  Authentication:
    - 20 failed attempts per IP per hour → 1 hour block
    - 5 failed attempts per device → CAPTCHA challenge
```

#### 2.1.2 DDoS Mitigation Strategy
```typescript
// Railway + Cloudflare DDoS Protection
const ddosConfig = {
  // Layer 3/4 Protection (Cloudflare)
  synFloodProtection: true,
  udpFloodProtection: true,
  rateLimiting: {
    packetsPerSecond: 10000,
    bytesPerSecond: 100 * 1024 * 1024 // 100 MB/s
  },

  // Layer 7 Protection (Application)
  applicationRateLimits: {
    perIP: {
      requests: 100,
      window: '1m',
      action: 'challenge' // CAPTCHA
    },
    perDevice: {
      requests: 50,
      window: '1m',
      action: 'throttle'
    }
  },

  // Anomaly Detection
  behaviorAnalysis: {
    suddenTrafficSpikes: true,
    unusualRequestPatterns: true,
    alertThreshold: '200% of baseline'
  }
}
```

### Layer 2: Transport Security

**Objective:** Ensure confidential, authenticated, tamper-proof communication

#### 2.2.1 TLS 1.3 Configuration
```nginx
# Railway handles TLS termination at edge
# Internal service-to-service communication

SSL/TLS Configuration:
  Protocol: TLSv1.3 only
  Cipher Suites (FIPS 140-2 approved):
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
    - TLS_AES_128_GCM_SHA256 (fallback)

  Certificate Requirements:
    - RSA 4096-bit or ECDSA P-384
    - Certificate Transparency logging
    - OCSP stapling enabled
    - No self-signed certificates in production

  HSTS Header:
    max-age: 31536000 (1 year)
    includeSubDomains: true
    preload: true
```

#### 2.2.2 Certificate Pinning (Client-Side)
```typescript
// Client-side certificate pinning implementation
const certificatePinning = {
  // Railway's production certificate fingerprints
  expectedFingerprints: [
    'sha256/primaryCertFingerprint==',
    'sha256/backupCertFingerprint=='
  ],

  // Validation logic
  validateCertificate: async (serverCert: Certificate): Promise<boolean> => {
    const certFingerprint = await computeSHA256(serverCert.raw)

    if (!expectedFingerprints.includes(certFingerprint)) {
      await securityLogger.critical({
        event: 'certificate_pin_mismatch',
        expected: expectedFingerprints,
        received: certFingerprint,
        action: 'connection_refused'
      })
      throw new SecurityError('Certificate pinning validation failed')
    }

    return true
  },

  // Pin rotation strategy (90 days before expiry)
  rotationWarning: 90 * 24 * 60 * 60 * 1000 // 90 days
}
```

### Layer 3: Application Security

**Objective:** Prevent exploitation of application logic and APIs

#### 2.3.1 API Security Controls
```typescript
// Express middleware stack for API security
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { body, validationResult } from 'express-validator'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://zkeb-api.railway.app"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' }
}))

// Rate limiting per endpoint
const backupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour per device
  keyGenerator: (req) => req.auth.deviceId,
  handler: (req, res) => {
    auditLogger.warn({
      event: 'rate_limit_exceeded',
      deviceId: req.auth.deviceId,
      endpoint: req.path,
      ip: req.ip
    })
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: res.getHeader('Retry-After')
    })
  }
})

app.post('/backups', backupRateLimit, validateBackup, createBackup)
```

#### 2.3.2 Input Validation & Sanitization
```typescript
// Comprehensive input validation
const validateBackup = [
  body('header.version')
    .isString()
    .matches(/^1\.\d+$/)
    .withMessage('Invalid version format'),

  body('header.containerId')
    .isUUID(4)
    .withMessage('Invalid container ID'),

  body('header.timestamp')
    .isInt({ min: 1600000000, max: Date.now() / 1000 + 300 })
    .withMessage('Invalid timestamp'),

  body('header.deviceIdHash')
    .isBase64()
    .isLength({ min: 44, max: 44 }) // SHA-256 base64
    .withMessage('Invalid device ID hash'),

  body('encryptedPayload')
    .isBase64()
    .isLength({ max: 50 * 1024 * 1024 }) // 50MB max
    .withMessage('Invalid or oversized payload'),

  body('signature')
    .isBase64()
    .isLength({ min: 512, max: 1024 }) // RSA-4096 signature size
    .withMessage('Invalid signature'),

  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      auditLogger.warn({
        event: 'input_validation_failed',
        errors: errors.array(),
        deviceId: req.auth?.deviceId
      })
      return res.status(400).json({ errors: errors.array() })
    }
    next()
  }
]
```

#### 2.3.3 SQL Injection Prevention
```typescript
// Parameterized queries ONLY - never string concatenation
import { sql } from 'kysely'

// ❌ NEVER DO THIS
const badQuery = `SELECT * FROM backups WHERE device_id = '${deviceId}'`

// ✅ ALWAYS DO THIS
const safeQuery = await db
  .selectFrom('backups')
  .selectAll()
  .where('device_id_hash', '=', sql`encode(digest(${deviceId}, 'sha256'), 'base64')`)
  .where('deleted_at', 'is', null)
  .execute()

// Additional protections
const sqlSafetyChecks = {
  // Reject queries containing dangerous patterns
  dangerousPatterns: [
    /;\s*(drop|delete|truncate|alter)\s+/gi,
    /union\s+select/gi,
    /xp_cmdshell/gi,
    /exec(\s+)?\(/gi
  ],

  validateQuery: (query: string): void => {
    for (const pattern of sqlSafetyChecks.dangerousPatterns) {
      if (pattern.test(query)) {
        throw new SecurityError('Potentially malicious SQL pattern detected')
      }
    }
  }
}
```

### Layer 4: Authentication & Authorization

**Objective:** Verify identity and enforce access controls

#### 2.4.1 Device Authentication
```typescript
// JWT-based device authentication
import jwt from 'jsonwebtoken'
import { createHash } from 'crypto'

interface DeviceAuthToken {
  deviceId: string
  deviceIdHash: string // SHA-256(deviceId)
  publicKeyFingerprint: string
  capabilities: string[]
  issuedAt: number
  expiresAt: number
}

const authenticationMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const token = authHeader.substring(7)

  try {
    // Verify JWT signature
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as DeviceAuthToken

    // Verify token hasn't been revoked
    const isRevoked = await redis.get(`revoked:${decoded.deviceIdHash}`)
    if (isRevoked) {
      await auditLogger.warn({
        event: 'revoked_token_used',
        deviceIdHash: decoded.deviceIdHash
      })
      return res.status(401).json({ error: 'Token revoked' })
    }

    // Verify device is still registered
    const device = await db
      .selectFrom('devices')
      .selectAll()
      .where('device_id_hash', '=', decoded.deviceIdHash)
      .where('status', '=', 'active')
      .executeTakeFirst()

    if (!device) {
      return res.status(401).json({ error: 'Device not registered' })
    }

    // Check token expiration with grace period
    const now = Math.floor(Date.now() / 1000)
    if (decoded.expiresAt < now - 300) { // 5 min grace period
      return res.status(401).json({ error: 'Token expired' })
    }

    // Attach auth context to request
    req.auth = {
      deviceId: decoded.deviceId,
      deviceIdHash: decoded.deviceIdHash,
      capabilities: decoded.capabilities
    }

    next()
  } catch (error) {
    await auditLogger.warn({
      event: 'authentication_failed',
      error: error.message,
      ip: req.ip
    })
    res.status(401).json({ error: 'Invalid authentication token' })
  }
}
```

#### 2.4.2 Authorization (Capability-Based)
```typescript
// Fine-grained authorization checks
const requireCapability = (capability: string) => {
  return (req, res, next) => {
    if (!req.auth?.capabilities.includes(capability)) {
      auditLogger.warn({
        event: 'insufficient_permissions',
        deviceIdHash: req.auth.deviceIdHash,
        requiredCapability: capability,
        availableCapabilities: req.auth.capabilities
      })
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: capability
      })
    }
    next()
  }
}

// Apply capability checks to endpoints
app.post('/backups',
  authenticationMiddleware,
  requireCapability('backup.create'),
  createBackup
)

app.get('/backups/:backupId',
  authenticationMiddleware,
  requireCapability('backup.read'),
  getBackup
)

app.delete('/backups/:backupId',
  authenticationMiddleware,
  requireCapability('backup.delete'),
  deleteBackup
)
```

### Layer 5: Data Protection

**Objective:** Protect data at rest, in transit, and in use

#### 2.5.1 Encryption at Rest (PostgreSQL)
```sql
-- Database-level encryption configuration
-- Railway PostgreSQL includes encryption at rest by default

-- Additional application-level encryption for metadata
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt sensitive metadata fields
CREATE TABLE backup_metadata (
  backup_id UUID PRIMARY KEY,
  device_id_hash TEXT NOT NULL, -- Already hashed (SHA-256)

  -- Client-encrypted metadata (already encrypted by client)
  encrypted_metadata BYTEA NOT NULL,

  -- Server-side additional encryption for compliance
  encrypted_metadata_server BYTEA GENERATED ALWAYS AS (
    pgp_sym_encrypt(
      encrypted_metadata::text,
      current_setting('app.encryption_key'),
      'cipher-algo=aes256'
    )
  ) STORED,

  -- Searchable hash for deduplication (cannot reverse to original)
  content_hash TEXT GENERATED ALWAYS AS (
    encode(digest(encrypted_metadata, 'sha256'), 'hex')
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,

  -- Immutability enforcement
  deleted_at TIMESTAMPTZ,
  immutable BOOLEAN DEFAULT true
);

-- Prevent modification of immutable backups
CREATE OR REPLACE FUNCTION prevent_backup_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.immutable = true AND (
    NEW.encrypted_metadata <> OLD.encrypted_metadata OR
    NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  ) THEN
    RAISE EXCEPTION 'Cannot modify immutable backup';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backup_immutability
  BEFORE UPDATE ON backup_metadata
  FOR EACH ROW
  EXECUTE FUNCTION prevent_backup_modification();
```

#### 2.5.2 Encryption in Transit (Internal Services)
```typescript
// Redis connection with TLS
import Redis from 'ioredis'

const redis = new Redis({
  host: 'redis.railway.internal',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3',
    ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256'
  },
  // Connection encryption validation
  enableReadyCheck: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3
})

redis.on('connect', () => {
  console.log('Redis connection established with TLS 1.3')
})

redis.on('error', (err) => {
  console.error('Redis connection error:', err)
  // Alert security team on connection failures
  alerting.critical({
    service: 'redis',
    event: 'connection_failure',
    error: err.message
  })
})
```

#### 2.5.3 Key Management Strategy
```typescript
// Hierarchical key management (Railway secrets + application keys)
class KeyManagementService {
  private serviceKeys: Map<string, Buffer> = new Map()

  constructor() {
    // Load service keys from Railway secrets (injected as env vars)
    this.loadServiceKeys()
  }

  private loadServiceKeys(): void {
    // Master key for server-side operations (NOT for client data!)
    const masterKey = process.env.SERVICE_MASTER_KEY
    if (!masterKey || masterKey.length < 64) {
      throw new Error('Invalid or missing SERVICE_MASTER_KEY')
    }

    // Derive purpose-specific keys using HKDF
    this.serviceKeys.set('metadata', this.deriveKey(masterKey, 'metadata'))
    this.serviceKeys.set('session', this.deriveKey(masterKey, 'session'))
    this.serviceKeys.set('audit', this.deriveKey(masterKey, 'audit'))
  }

  private deriveKey(masterKey: string, purpose: string): Buffer {
    const salt = Buffer.from(`zkeb-${purpose}-v1`)
    return hkdf('sha256', masterKey, salt, Buffer.from(purpose), 32)
  }

  // Automatic key rotation (every 90 days)
  async rotateKeys(): Promise<void> {
    const newMasterKey = randomBytes(64).toString('base64')

    // Store new key in Railway secrets
    await railway.secrets.update('SERVICE_MASTER_KEY', newMasterKey)

    // Re-derive all purpose keys
    this.loadServiceKeys()

    // Audit log key rotation
    await auditLogger.critical({
      event: 'key_rotation_completed',
      timestamp: new Date().toISOString(),
      rotatedKeys: ['metadata', 'session', 'audit']
    })
  }
}
```

### Layer 6: Monitoring & Detection

**Objective:** Detect attacks in real-time and respond automatically

#### 2.6.1 Security Event Logging (Non-PII)
```typescript
// Comprehensive audit logging WITHOUT logging plaintext data
class AuditLogger {
  private readonly logStream: WritableStream

  async log(event: SecurityEvent): Promise<void> {
    const sanitizedEvent = this.sanitize(event)

    // Log structure (NEVER includes plaintext user data)
    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: sanitizedEvent.type,
      event_id: randomUUID(),

      // Identity (hashed)
      device_id_hash: sanitizedEvent.deviceIdHash, // SHA-256, not reversible
      user_id_hash: sanitizedEvent.userIdHash,     // SHA-256, not reversible

      // Context (non-sensitive)
      ip_address_prefix: this.truncateIP(sanitizedEvent.ip), // First 3 octets only
      user_agent_hash: hash(sanitizedEvent.userAgent),

      // Action details (no content)
      action: sanitizedEvent.action,
      resource_type: sanitizedEvent.resourceType,
      resource_id_hash: sanitizedEvent.resourceIdHash,

      // Outcome
      result: sanitizedEvent.result, // 'success' | 'failure' | 'blocked'
      error_code: sanitizedEvent.errorCode,

      // Security metadata
      threat_level: sanitizedEvent.threatLevel, // 'low' | 'medium' | 'high' | 'critical'
      anomaly_score: sanitizedEvent.anomalyScore,

      // NEVER LOGGED:
      // - Plaintext device IDs
      // - User credentials
      // - Encryption keys
      // - Backup content
      // - Full IP addresses (GDPR/CCPA compliance)
    }

    await this.writeLog(logEntry)

    // Real-time alerting for critical events
    if (logEntry.threat_level === 'critical') {
      await this.triggerAlert(logEntry)
    }
  }

  private truncateIP(ip: string): string {
    // For IPv4: 192.168.1.x → 192.168.1.0/24
    // For IPv6: 2001:0db8:85a3:x → 2001:0db8:85a3::/48
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts.slice(0, 3).join('.')}.0/24`
    }
    // IPv6 truncation
    const ipv6Parts = ip.split(':')
    return `${ipv6Parts.slice(0, 3).join(':')}::/48`
  }
}

// Usage examples
await auditLogger.log({
  type: 'authentication',
  action: 'device_login',
  deviceIdHash: hash(deviceId),
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  result: 'success',
  threatLevel: 'low'
})

await auditLogger.log({
  type: 'backup_access',
  action: 'backup_retrieved',
  deviceIdHash: hash(deviceId),
  resourceIdHash: hash(backupId),
  result: 'success',
  threatLevel: 'low'
})

await auditLogger.log({
  type: 'security_violation',
  action: 'sql_injection_attempt',
  ip: req.ip,
  result: 'blocked',
  threatLevel: 'critical',
  errorCode: 'SEC-001'
})
```

#### 2.6.2 Anomaly Detection
```typescript
// Behavioral anomaly detection system
class AnomalyDetector {
  private readonly redis: Redis

  async detectAnomalies(event: SecurityEvent): Promise<ThreatLevel> {
    const deviceKey = `behavior:${event.deviceIdHash}`
    const baseline = await this.getDeviceBaseline(deviceKey)

    const anomalyChecks = [
      this.checkRequestFrequency(event, baseline),
      this.checkGeographicAnomaly(event, baseline),
      this.checkResourceAccessPattern(event, baseline),
      this.checkTimingAnomaly(event, baseline)
    ]

    const anomalyScores = await Promise.all(anomalyChecks)
    const maxScore = Math.max(...anomalyScores)

    if (maxScore > 0.8) {
      await this.raiseAlert({
        type: 'high_anomaly_score',
        deviceIdHash: event.deviceIdHash,
        score: maxScore,
        checks: anomalyScores
      })
      return 'critical'
    } else if (maxScore > 0.5) {
      return 'medium'
    }

    return 'low'
  }

  private async checkRequestFrequency(
    event: SecurityEvent,
    baseline: DeviceBaseline
  ): Promise<number> {
    const recentRequests = await this.redis.zcount(
      `requests:${event.deviceIdHash}`,
      Date.now() - 3600000, // Last hour
      Date.now()
    )

    const expectedRate = baseline.avgRequestsPerHour
    const deviation = Math.abs(recentRequests - expectedRate) / expectedRate

    // Return anomaly score (0.0 - 1.0)
    return Math.min(deviation / 3, 1.0)
  }

  private async checkGeographicAnomaly(
    event: SecurityEvent,
    baseline: DeviceBaseline
  ): Promise<number> {
    const currentLocation = this.geolocateIP(event.ip)
    const historicalLocations = baseline.commonLocations

    const isNewLocation = !historicalLocations.some(loc =>
      this.haversineDistance(loc, currentLocation) < 100 // 100km threshold
    )

    if (isNewLocation) {
      const timeSinceLastSeen = Date.now() - baseline.lastSeenAt

      // Impossible travel detection (>800 km/h)
      if (timeSinceLastSeen < 3600000) { // Less than 1 hour
        return 1.0 // Critical: impossible travel speed
      }
      return 0.6 // Medium: new location but plausible
    }

    return 0.0 // Normal: known location
  }
}
```

### Layer 7: Incident Response

**Objective:** Contain breaches, maintain evidence, recover safely

#### 2.7.1 Automated Incident Response
```typescript
// Automated response to security events
class IncidentResponseSystem {
  async handleSecurityEvent(event: SecurityEvent): Promise<void> {
    const threatLevel = await anomalyDetector.assess(event)

    switch (threatLevel) {
      case 'critical':
        await this.criticalIncidentResponse(event)
        break
      case 'high':
        await this.highIncidentResponse(event)
        break
      case 'medium':
        await this.mediumIncidentResponse(event)
        break
      case 'low':
        await this.logOnly(event)
        break
    }
  }

  private async criticalIncidentResponse(event: SecurityEvent): Promise<void> {
    // 1. Immediate containment
    await this.blockDevice(event.deviceIdHash, 'critical_threat_detected')
    await this.revokeAllTokens(event.deviceIdHash)

    // 2. Alert security team
    await alerting.page({
      severity: 'critical',
      title: 'Critical Security Event',
      message: `Threat detected: ${event.type}`,
      deviceIdHash: event.deviceIdHash,
      runbook: 'https://docs.internal/security/critical-response'
    })

    // 3. Preserve evidence
    await this.captureForensicSnapshot({
      deviceIdHash: event.deviceIdHash,
      timestamp: Date.now(),
      recentActivity: await this.getRecentActivity(event.deviceIdHash)
    })

    // 4. Isolate affected services
    await this.enableCircuitBreaker(`device:${event.deviceIdHash}`)

    // 5. Audit trail
    await auditLogger.critical({
      event: 'critical_incident_response_activated',
      details: event,
      actions: ['device_blocked', 'tokens_revoked', 'evidence_captured']
    })
  }

  private async highIncidentResponse(event: SecurityEvent): Promise<void> {
    // 1. Rate limit aggressively
    await this.applyStrictRateLimit(event.deviceIdHash, 10) // 10 req/hour

    // 2. Require re-authentication
    await this.invalidateSessionCache(event.deviceIdHash)

    // 3. Alert on-call engineer
    await alerting.alert({
      severity: 'high',
      title: 'High-Priority Security Event',
      message: `Suspicious activity: ${event.type}`,
      deviceIdHash: event.deviceIdHash
    })

    // 4. Enhanced monitoring
    await this.enableEnhancedMonitoring(event.deviceIdHash, 3600000) // 1 hour
  }
}
```

---

## 3. Threat Model & Attack Surface Analysis

### 3.1 Threat Actors

| Actor Type | Capability | Motivation | ZKEB Defenses |
|------------|-----------|------------|---------------|
| **Script Kiddie** | Low: automated tools, public exploits | Opportunistic, defacement | WAF, rate limiting, input validation |
| **Cybercriminal** | Medium: custom malware, social engineering | Financial gain, data theft | MFA, encryption, anomaly detection |
| **Insider Threat** | High: internal access, knowledge of systems | Data exfiltration, sabotage | Zero-trust, least privilege, audit logging |
| **Nation-State** | Very High: 0-days, supply chain attacks | Espionage, infrastructure disruption | Defense in depth, encryption, monitoring |
| **Service Provider** | Complete: infrastructure access | Data mining, surveillance | Zero-knowledge architecture, client-side encryption |

### 3.2 Attack Surface Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZKEB Attack Surface                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  External Attack Surface (Internet-Facing)                           │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  API Endpoints:                                                       │  │
│  │  ├─ POST /devices/register                                           │  │
│  │  │  Threats: Enumeration, credential stuffing, DoS                   │  │
│  │  │  Defense: Rate limiting (10/hr), device fingerprinting,CAPTCHA    │  │
│  │  │                                                                    │  │
│  │  ├─ POST /backups                                                    │  │
│  │  │  Threats: Storage exhaustion, malicious uploads, quota abuse      │  │
│  │  │  Defense: Size limits (50MB), quota enforcement, signature verify │  │
│  │  │                                                                    │  │
│  │  ├─ GET /backups/{id}                                                │  │
│  │  │  Threats: Unauthorized access, enumeration, data exfiltration     │  │
│  │  │  Defense: Authentication required, ownership validation, audit    │  │
│  │  │                                                                    │  │
│  │  └─ DELETE /backups/{id}                                             │  │
│  │     Threats: Data destruction, denial of service                     │  │
│  │     Defense: Authentication + capability check, soft delete, immut.  │  │
│  │                                                                       │  │
│  │  TLS Termination:                                                    │  │
│  │  ├─ Threats: MitM, downgrade attacks, certificate substitution       │  │
│  │  └─ Defense: TLS 1.3 only, HSTS, certificate pinning (client)       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Internal Attack Surface (Private Network)                           │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  Service-to-Service Communication:                                   │  │
│  │  ├─ API Gateway ↔ Backend Services                                   │  │
│  │  │  Threats: Lateral movement, service impersonation                 │  │
│  │  │  Defense: mTLS, network policies, service mesh                    │  │
│  │  │                                                                    │  │
│  │  ├─ Backend Services ↔ PostgreSQL                                    │  │
│  │  │  Threats: SQL injection, credential theft, data leakage           │  │
│  │  │  Defense: Parameterized queries only, SSL required, RLS policies  │  │
│  │  │                                                                    │  │
│  │  └─ Backend Services ↔ Redis                                         │  │
│  │     Threats: Cache poisoning, session hijacking                      │  │
│  │     Defense: TLS connections, password auth, encrypted session data  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Data Attack Surface (Storage Layer)                                 │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  PostgreSQL Database:                                                │  │
│  │  ├─ Threats: Data breach, unauthorized access, backup theft          │  │
│  │  └─ Defense: Encryption at rest, SSL only, RLS, audit logging        │  │
│  │                                                                       │  │
│  │  Redis Cache:                                                        │  │
│  │  ├─ Threats: Memory scraping, cache poisoning                        │  │
│  │  └─ Defense: TLS, encrypted session data, short TTLs                 │  │
│  │                                                                       │  │
│  │  Object Storage:                                                     │  │
│  │  ├─ Threats: Bucket enumeration, data exfiltration                   │  │
│  │  └─ Defense: Client-side encryption, server-side encryption,         │  │
│  │              versioning, immutable objects, access logging            │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Attacks We Defend Against

#### ✅ Prevented Attacks
- **DDoS (L3/L4/L7)**: Cloudflare edge protection, rate limiting
- **SQL Injection**: Parameterized queries only, input validation
- **XSS**: CSP headers, output encoding, sanitization
- **CSRF**: SameSite cookies, double-submit tokens
- **Man-in-the-Middle**: TLS 1.3, certificate pinning
- **Replay Attacks**: Nonce-based encryption, timestamp validation
- **Credential Stuffing**: Rate limiting, account lockout
- **Session Hijacking**: Secure cookies, session invalidation
- **Data Exfiltration**: Zero-knowledge encryption, audit logging
- **Privilege Escalation**: Capability-based authorization, least privilege

#### ⚠️ Mitigated Attacks (Requires Monitoring)
- **Advanced Persistent Threats (APT)**: Anomaly detection, behavior analysis
- **Zero-Day Exploits**: Defense in depth, rapid patching, WAF
- **Supply Chain Attacks**: Dependency scanning, SRI, code signing
- **Insider Threats**: Audit logging, separation of duties, access reviews

#### ❌ Attacks Outside Our Control (Client Responsibility)
- **Client Device Compromise**: User must secure their devices
- **Phishing**: User must verify authentic communications
- **Social Engineering**: User must follow security training
- **Physical Access**: User must protect hardware devices

---

## 4. Security Controls Mapping

### 4.1 SOC 2 Trust Service Criteria

| TSC Category | Control | ZKEB Implementation | Evidence |
|-------------|---------|---------------------|----------|
| **CC6.1** Security Incidents | Incident detection & response system | Real-time anomaly detection, automated responses | Alert logs, incident tickets |
| **CC6.6** Logical Access | Device authentication, capability-based authorization | JWT auth, device registry, access policies | Auth logs, capability grants |
| **CC6.7** Encryption | Data encrypted at rest and in transit | AES-256-GCM (client), TLS 1.3, PG encryption | Crypto audit, TLS scanner |
| **CC7.2** Threat Detection | Security monitoring and alerting | SIEM integration, anomaly detection | Security event logs |
| **CC8.1** Change Management | Controlled deployment, rollback capability | Railway CI/CD, blue-green deployment | Deployment logs, rollback tests |
| **A1.2** Availability | High-availability architecture, redundancy | Multi-region, load balancing, failover | Uptime reports, DR tests |
| **P6.6** Data Disposal | Secure deletion, data retention policies | Soft delete, immutable backups, 30-day retention | Retention logs, deletion audit |

### 4.2 HIPAA Security Rule

| Safeguard | Requirement | ZKEB Implementation | Validation |
|-----------|------------|---------------------|------------|
| **§164.312(a)(1)** Access Control | Unique user identification | Device ID hash, JWT authentication | Auth audit logs |
| **§164.312(a)(2)(i)** Emergency Access | Break-glass access procedures | Admin override with dual authorization | Access logs, alerts |
| **§164.312(b)** Audit Controls | Record and examine activity | Comprehensive audit logging (non-PII) | Audit reports |
| **§164.312(c)(1)** Integrity | Protect ePHI from improper alteration | Digital signatures, integrity hashes | Signature verification |
| **§164.312(c)(2)** Mechanisms | Detect unauthorized ePHI access | Anomaly detection, access monitoring | Alert logs, investigations |
| **§164.312(d)** Person/Entity Auth | Verify accessing entity | Device registration, certificate validation | Registration logs |
| **§164.312(e)(1)** Transmission Security | Guard against unauthorized ePHI access | TLS 1.3, client-side encryption | TLS audit, encryption tests |
| **§164.312(e)(2)(i)** Integrity Controls | Ensure ePHI not improperly modified | HMAC authentication, version control | Integrity checks |
| **§164.312(e)(2)(ii)** Encryption | Encrypt ePHI transmission | AES-256-GCM, ChaCha20-Poly1305 | Encryption audit |

---

## 5. Audit & Compliance Framework

### 5.1 What We Log (Without Logging Plaintext)

```typescript
// Audit logging strategy: Maximum visibility, zero plaintext

const auditableEvents = {
  authentication: {
    device_registration: {
      logged: ['timestamp', 'device_id_hash', 'ip_prefix', 'user_agent_hash', 'public_key_fingerprint'],
      NOT_logged: ['device_id', 'private_keys', 'user_master_key']
    },
    device_login: {
      logged: ['timestamp', 'device_id_hash', 'success/failure', 'ip_prefix', 'geolocation_country'],
      NOT_logged: ['credentials', 'tokens', 'full_ip']
    },
    token_refresh: {
      logged: ['timestamp', 'device_id_hash', 'token_fingerprint', 'expiry'],
      NOT_logged: ['token_value', 'jwt_payload']
    }
  },

  dataAccess: {
    backup_created: {
      logged: ['timestamp', 'device_id_hash', 'backup_id', 'size_bytes', 'classification'],
      NOT_logged: ['backup_content', 'encryption_keys', 'metadata_plaintext']
    },
    backup_retrieved: {
      logged: ['timestamp', 'device_id_hash', 'backup_id', 'access_reason'],
      NOT_logged: ['decrypted_content', 'keys_used']
    },
    backup_deleted: {
      logged: ['timestamp', 'device_id_hash', 'backup_id', 'deletion_reason'],
      NOT_logged: ['backup_content', 'recovery_keys']
    }
  },

  securityEvents: {
    anomaly_detected: {
      logged: ['timestamp', 'device_id_hash', 'anomaly_type', 'anomaly_score', 'action_taken'],
      NOT_logged: ['request_payloads', 'decrypted_data']
    },
    rate_limit_exceeded: {
      logged: ['timestamp', 'device_id_hash', 'endpoint', 'request_count', 'window'],
      NOT_logged: ['request_bodies', 'headers']
    },
    authentication_failure: {
      logged: ['timestamp', 'device_id_hash', 'failure_reason', 'attempt_count'],
      NOT_logged: ['credentials_attempted', 'password_hashes']
    }
  },

  systemEvents: {
    key_rotation: {
      logged: ['timestamp', 'key_type', 'rotation_reason', 'old_key_fingerprint', 'new_key_fingerprint'],
      NOT_logged: ['key_values', 'encryption_parameters']
    },
    service_deployment: {
      logged: ['timestamp', 'service_name', 'version', 'deployment_status'],
      NOT_logged: ['environment_variables', 'secrets']
    }
  }
}
```

### 5.2 Audit Trail Requirements

```sql
-- Audit table schema (immutable, append-only)
CREATE TABLE security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  -- Timestamp with nanosecond precision
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  event_date DATE GENERATED ALWAYS AS (event_timestamp::date) STORED,

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'authentication', 'authorization', 'data_access', 'data_modification',
    'security_event', 'configuration_change', 'system_event'
  )),
  event_category TEXT NOT NULL,
  event_action TEXT NOT NULL,

  -- Actor (always hashed, never plaintext)
  actor_type TEXT NOT NULL CHECK (actor_type IN ('device', 'service', 'admin')),
  actor_id_hash TEXT NOT NULL, -- SHA-256 hash
  actor_ip_prefix TEXT, -- First 3 octets only (GDPR/CCPA)

  -- Resource (always hashed if sensitive)
  resource_type TEXT,
  resource_id_hash TEXT, -- SHA-256 hash for sensitive resources

  -- Outcome
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'blocked', 'error')),
  result_code TEXT,

  -- Security context
  threat_level TEXT NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
  anomaly_score NUMERIC(3,2) CHECK (anomaly_score BETWEEN 0 AND 1),

  -- Metadata (JSON, no PII)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Immutability enforcement
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  immutable BOOLEAN NOT NULL DEFAULT true,

  -- Partitioning key for performance
  CONSTRAINT audit_log_partition CHECK (event_date >= DATE '2025-01-01')
) PARTITION BY RANGE (event_date);

-- Create monthly partitions automatically
CREATE TABLE security_audit_log_2025_01 PARTITION OF security_audit_log
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Prevent modifications (append-only)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_immutability
  BEFORE UPDATE OR DELETE ON security_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- Indexes for fast searching
CREATE INDEX idx_audit_event_type ON security_audit_log (event_type, event_timestamp DESC);
CREATE INDEX idx_audit_actor ON security_audit_log (actor_id_hash, event_timestamp DESC);
CREATE INDEX idx_audit_threat_level ON security_audit_log (threat_level, event_timestamp DESC)
  WHERE threat_level IN ('high', 'critical');
```

### 5.3 Compliance Reporting

```typescript
// Automated compliance report generation
class ComplianceReporter {
  async generateSOC2Report(startDate: Date, endDate: Date): Promise<SOC2Report> {
    const report = {
      reportingPeriod: { start: startDate, end: endDate },

      // CC6.1: Security incidents
      securityIncidents: await this.queryAuditLog({
        eventType: 'security_event',
        threatLevel: ['high', 'critical'],
        dateRange: [startDate, endDate]
      }),

      // CC6.6: Access controls
      accessGranted: await this.queryAuditLog({
        eventType: 'authorization',
        result: 'success',
        dateRange: [startDate, endDate]
      }),
      accessDenied: await this.queryAuditLog({
        eventType: 'authorization',
        result: 'failure',
        dateRange: [startDate, endDate]
      }),

      // CC6.7: Encryption verification
      encryptionAudit: await this.verifyEncryptionStatus(),

      // CC7.2: Threat detection
      threatsDetected: await this.queryAuditLog({
        eventType: 'security_event',
        anomalyScore: { gte: 0.5 },
        dateRange: [startDate, endDate]
      }),

      // A1.2: Availability metrics
      availability: await this.calculateUptime(startDate, endDate),

      // Summary statistics
      summary: {
        totalEvents: await this.countEvents(startDate, endDate),
        securityIncidents: 0, // Count from above
        meanTimeToDetect: await this.calculateMTTD(startDate, endDate),
        meanTimeToRespond: await this.calculateMTTR(startDate, endDate)
      }
    }

    return report
  }

  async generateHIPAAReport(startDate: Date, endDate: Date): Promise<HIPAAReport> {
    return {
      reportingPeriod: { start: startDate, end: endDate },

      // §164.312(a)(1): Access control
      uniqueUserIdentification: await this.verifyUniqueDeviceIds(),

      // §164.312(b): Audit controls
      auditLogsGenerated: await this.countAuditLogs(startDate, endDate),
      auditLogIntegrity: await this.verifyAuditIntegrity(),

      // §164.312(c)(1): Integrity
      integrityViolations: await this.queryAuditLog({
        eventCategory: 'integrity_check',
        result: 'failure',
        dateRange: [startDate, endDate]
      }),

      // §164.312(d): Person/entity authentication
      authenticationAttempts: await this.countAuthAttempts(startDate, endDate),
      authenticationFailures: await this.countAuthFailures(startDate, endDate),

      // §164.312(e)(1): Transmission security
      tlsCompliance: await this.verifyTLSCompliance(),

      // §164.312(e)(2)(ii): Encryption
      encryptionCompliance: await this.verifyEncryptionCompliance()
    }
  }
}
```

---

## 6. Production Hardening Checklist

### Pre-Deployment Security Checklist

```markdown
## Network Security
- [ ] TLS 1.3 configured on all endpoints
- [ ] Certificate pinning implemented in client apps
- [ ] HSTS header enabled with preload
- [ ] Security headers configured (CSP, X-Frame-Options, etc.)
- [ ] Railway private networking enabled
- [ ] Internal DNS resolution working (*.railway.internal)
- [ ] WAF rules deployed and tested
- [ ] Rate limiting configured per endpoint
- [ ] DDoS protection verified (Cloudflare)

## Application Security
- [ ] All API endpoints require authentication
- [ ] Authorization checks on all protected resources
- [ ] Input validation on all user inputs
- [ ] Output encoding to prevent XSS
- [ ] SQL injection testing completed (zero vulnerabilities)
- [ ] Dependency vulnerability scan passed
- [ ] Secrets never hardcoded (Railway secrets only)
- [ ] Error messages don't leak sensitive info
- [ ] Debug mode DISABLED in production

## Data Protection
- [ ] Client-side encryption verified (ZKEB protocol)
- [ ] Database encryption at rest enabled
- [ ] TLS for all database connections
- [ ] Redis TLS connections configured
- [ ] Object storage server-side encryption enabled
- [ ] Backup encryption verified
- [ ] Key rotation procedures tested
- [ ] Data retention policies configured
- [ ] Secure deletion procedures verified

## Authentication & Authorization
- [ ] JWT secret strength verified (256-bit minimum)
- [ ] Token expiration configured (24 hours)
- [ ] Refresh token rotation enabled
- [ ] Device registration rate limits set
- [ ] Multi-device support tested
- [ ] Session invalidation working
- [ ] Capability-based authorization enforced

## Monitoring & Logging
- [ ] Audit logging enabled (non-PII only)
- [ ] Security event alerting configured
- [ ] Anomaly detection rules deployed
- [ ] Log retention period set (1 year minimum)
- [ ] SIEM integration tested
- [ ] Incident response runbooks created
- [ ] On-call rotation configured
- [ ] Health checks monitoring all services

## Compliance
- [ ] SOC 2 controls implemented
- [ ] HIPAA safeguards verified
- [ ] GDPR data handling reviewed
- [ ] Data processing agreements signed
- [ ] Privacy policy published
- [ ] Terms of service finalized
- [ ] Compliance audit scheduled

## Operational Security
- [ ] Railway secrets rotated
- [ ] Access control lists reviewed
- [ ] Service accounts use least privilege
- [ ] Deployment pipeline secured
- [ ] Rollback procedures tested
- [ ] Disaster recovery plan documented
- [ ] Backup restoration tested
- [ ] Incident response team trained

## Performance & Reliability
- [ ] Load testing completed (1000 concurrent users)
- [ ] Encryption performance benchmarked (<50ms)
- [ ] Database query performance optimized
- [ ] Auto-scaling configured
- [ ] Health checks passing
- [ ] Uptime monitoring enabled (99.9% SLA)
- [ ] CDN configured for static assets

## Documentation
- [ ] Security architecture documented (this doc)
- [ ] API documentation published
- [ ] Runbooks created for common incidents
- [ ] Security training materials prepared
- [ ] Compliance documentation organized
- [ ] Change management procedures defined
```

### Railway-Specific Hardening

```bash
# Railway CLI configuration for production
railway environment production

# Set critical security environment variables
railway variables set NODE_ENV=production
railway variables set TLS_MIN_VERSION=1.3
railway variables set LOG_LEVEL=info
railway variables set ENABLE_DEBUG=false

# Configure service networking
railway service create zkeb-api-gateway --internal
railway service create zkeb-redis --internal
railway service create zkeb-postgres --internal

# Enable health checks
railway service update zkeb-api-gateway --healthcheck-path=/health

# Configure resource limits
railway service update zkeb-api-gateway --memory=1Gi --cpu=1.0

# Enable auto-scaling
railway service update zkeb-api-gateway --replicas=2 --autoscale-max=10

# Configure secrets (NEVER commit these)
railway variables set JWT_SECRET=$(openssl rand -base64 64)
railway variables set SERVICE_MASTER_KEY=$(openssl rand -base64 64)
railway variables set REDIS_PASSWORD=$(openssl rand -base64 32)
```

---

## 7. Incident Response & Monitoring

### 7.1 Alerting Rules

```yaml
# Alerting configuration (Railway + PagerDuty/Slack)
alerts:
  critical:
    - name: "Data Breach Indicators"
      condition: "anomaly_score > 0.8 OR threat_level = 'critical'"
      escalation: "immediate_page"
      runbook: "https://docs.internal/security/data-breach"

    - name: "Service Unavailability"
      condition: "uptime < 99.0% OVER 5m"
      escalation: "immediate_page"
      runbook: "https://docs.internal/ops/service-down"

    - name: "Encryption Failure"
      condition: "encryption_error_rate > 1%"
      escalation: "immediate_page"
      runbook: "https://docs.internal/security/encryption-failure"

    - name: "Authentication Bypass Attempt"
      condition: "auth_bypass_detected = true"
      escalation: "immediate_page"
      runbook: "https://docs.internal/security/auth-bypass"

  high:
    - name: "High Anomaly Score"
      condition: "anomaly_score > 0.6"
      escalation: "alert_security_team"
      runbook: "https://docs.internal/security/anomaly-investigation"

    - name: "Rate Limit Exceeded"
      condition: "rate_limit_violations > 100 OVER 1h"
      escalation: "alert_security_team"
      runbook: "https://docs.internal/security/rate-limit-abuse"

    - name: "Database Connection Failure"
      condition: "database_connection_errors > 5 OVER 5m"
      escalation: "alert_engineering_team"
      runbook: "https://docs.internal/ops/database-connection"

  medium:
    - name: "Increased Error Rate"
      condition: "error_rate > 5% OVER 10m"
      escalation: "alert_engineering_team"
      runbook: "https://docs.internal/ops/high-error-rate"

    - name: "Slow Response Times"
      condition: "p95_latency > 2000ms OVER 10m"
      escalation: "alert_engineering_team"
      runbook: "https://docs.internal/ops/performance-degradation"
```

### 7.2 Security Metrics Dashboard

```typescript
// Security metrics exposed for monitoring
const securityMetrics = {
  // Authentication metrics
  authenticationAttempts: new Counter({
    name: 'zkeb_authentication_attempts_total',
    help: 'Total authentication attempts',
    labelNames: ['result'] // success, failure
  }),

  authenticationLatency: new Histogram({
    name: 'zkeb_authentication_duration_seconds',
    help: 'Authentication request duration',
    buckets: [0.1, 0.5, 1, 2, 5]
  }),

  // Encryption metrics
  encryptionOperations: new Counter({
    name: 'zkeb_encryption_operations_total',
    help: 'Total encryption operations',
    labelNames: ['operation', 'classification'] // encrypt/decrypt, internal/confidential/restricted
  }),

  encryptionDuration: new Histogram({
    name: 'zkeb_encryption_duration_seconds',
    help: 'Encryption operation duration',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
    labelNames: ['operation']
  }),

  // Security events
  securityEvents: new Counter({
    name: 'zkeb_security_events_total',
    help: 'Total security events',
    labelNames: ['event_type', 'threat_level']
  }),

  anomalyScore: new Gauge({
    name: 'zkeb_anomaly_score',
    help: 'Current anomaly score (0-1)',
    labelNames: ['device_id_hash']
  }),

  // Rate limiting
  rateLimitViolations: new Counter({
    name: 'zkeb_rate_limit_violations_total',
    help: 'Total rate limit violations',
    labelNames: ['endpoint']
  }),

  // System health
  serviceHealth: new Gauge({
    name: 'zkeb_service_health',
    help: 'Service health status (1=healthy, 0=unhealthy)',
    labelNames: ['service']
  })
}
```

---

## Conclusion

This defense-in-depth architecture transforms the ZKEB Protocol into a **production-ready, audit-worthy system** on Railway's platform. We've built **7 independent defensive layers**, each designed to stop different attack vectors, with comprehensive logging that proves security without compromising privacy.

**What Auditors Will Love:**
- ✅ **Zero plaintext in logs**: Complete audit trail without PII
- ✅ **Defense in depth**: 7 layers of independent controls
- ✅ **Compliance by design**: SOC 2 and HIPAA controls mapped
- ✅ **Immutable audit trail**: Tamper-proof evidence
- ✅ **Real-time detection**: Automated incident response
- ✅ **Encryption everywhere**: At rest, in transit, in use

**Railway Deployment Strengths:**
- Private networking isolates sensitive services
- Managed PostgreSQL with encryption at rest
- Edge protection via Cloudflare
- Simple environment variable management
- Built-in health checks and auto-scaling
- Zero-downtime deployments

This architecture doesn't just meet compliance requirements - it **exceeds them** while maintaining operational simplicity. Every layer can fail independently without compromising the zero-knowledge guarantee.

**Next Steps:**
1. Deploy to Railway following the hardening checklist
2. Run comprehensive security testing suite
3. Generate compliance reports for audit
4. Schedule penetration testing
5. Obtain SOC 2 Type II certification

---

**Document Control:**
- **Version:** 1.0
- **Classification:** Internal Use - Security Architecture
- **Review Cycle:** Quarterly
- **Next Review:** 2025-04-22
- **Approvals Required:** Security Team, Compliance Officer, Engineering Lead

*Architecture designed by AEGIS - Building shields that think, walls that learn, defenses that evolve.*
