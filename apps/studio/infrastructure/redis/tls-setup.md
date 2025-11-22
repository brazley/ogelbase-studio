# Redis TLS Encryption Setup Guide

## Overview

This guide covers TLS encryption configuration for Redis connections on Railway. All Redis connections MUST use TLS encryption in production to protect data in transit.

**Security Posture**: TLS 1.2+ with certificate validation enforced in production.

---

## Railway Redis TLS Configuration

### 1. Native TLS Support

Railway Redis instances support TLS connections out of the box. Use the `rediss://` protocol (note the double 's'):

```bash
# Standard Redis (unencrypted - DO NOT USE IN PRODUCTION)
redis://default:password@host:port

# TLS-encrypted Redis (required for production)
rediss://default:password@host:port
```

### 2. Environment Variables

Configure TLS in your `.env` file:

```bash
# Production: Use rediss:// protocol for automatic TLS
REDIS_URL=rediss://default:YOUR_PASSWORD@redis.railway.internal:6379

# Force TLS even with redis:// protocol (fallback)
REDIS_USE_TLS=true

# Optional: Custom CA certificate (base64-encoded)
# Only needed for self-signed certificates
REDIS_CA_CERT=base64_encoded_ca_certificate

# Optional: Client certificate for mutual TLS (mTLS)
# Only needed if Redis requires client authentication
REDIS_CLIENT_CERT=base64_encoded_client_certificate
REDIS_CLIENT_KEY=base64_encoded_client_key
```

### 3. Railway Private Networking

**Recommended**: Use Railway's private network for Redis connections:

```bash
# Internal network (TLS + private network)
REDIS_URL=rediss://default:password@redis.railway.internal:6379

# Public proxy (TLS over internet - less secure)
REDIS_URL=rediss://default:password@hopper.proxy.rlwy.net:29824
```

**Benefits of private networking:**
- Reduced attack surface (not exposed to internet)
- Lower latency
- No egress bandwidth charges
- TLS encryption still active

---

## TLS Configuration Details

### ioredis TLS Options

The Redis client automatically configures TLS with enhanced security:

```typescript
{
  tls: {
    // Certificate validation (enforced in production)
    rejectUnauthorized: !allowInsecure,  // Only bypassed in dev with explicit flag

    // Custom certificates (optional)
    ca: process.env.REDIS_CA_CERT,       // Base64-encoded CA cert
    cert: process.env.REDIS_CLIENT_CERT, // Base64-encoded client cert
    key: process.env.REDIS_CLIENT_KEY,   // Base64-encoded client key

    // TLS version constraints
    minVersion: 'TLSv1.2',               // Minimum TLS 1.2
    maxVersion: 'TLSv1.3',               // Maximum TLS 1.3 (best)

    // Hostname verification
    checkServerIdentity: allowInsecure ? () => undefined : undefined,

    // MITM protection
    honorCipherOrder: true,              // Server cipher preference

    // Secure cipher suites only (ECDHE with AES-GCM)
    ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384'
  }
}
```

**Security Enhancements:**
- ✅ **Forward Secrecy**: ECDHE key exchange ensures past communications remain secure even if private key is compromised
- ✅ **Authenticated Encryption**: AES-GCM provides both confidentiality and integrity
- ✅ **TLS 1.3 Support**: Latest protocol with improved security and performance
- ✅ **Strong Ciphers Only**: No weak algorithms (RC4, DES, MD5 excluded)

### Certificate Validation

**Production** (Always Enforced):
- `rejectUnauthorized: true` - Enforces valid certificates
- `checkServerIdentity: undefined` - Uses Node.js default strict checking
- Invalid/expired certificates cause connection failures (this is good!)
- **Cannot be bypassed in production** - security policy enforced at code level

**Development** (Opt-in Insecure Mode):
- Requires **explicit opt-in**: `REDIS_ALLOW_INSECURE_TLS=true`
- Only works when `NODE_ENV=development`
- Logs security warning on startup
- Still uses TLS encryption, just with relaxed validation
- **Never use this in staging or production**

---

## Railway-Specific Setup

### Step 1: Enable TLS in Railway

Railway Redis instances support TLS by default. Simply use the `rediss://` protocol.

### Step 2: Update Connection String

In Railway dashboard:

1. Navigate to your Redis service
2. Copy the connection URL
3. Replace `redis://` with `rediss://` if needed
4. Set as `REDIS_URL` environment variable in your app service

### Step 3: Verify Private Network Connection

Ensure your app and Redis are in the same Railway project:

```bash
# Check connectivity
redis-cli -u rediss://default:password@redis.railway.internal:6379 ping
# Should return: PONG
```

### Step 4: Test TLS Connection

Use the provided test script:

```bash
npm run test:redis-tls
```

---

## Certificate Management

### Railway-Managed Certificates

Railway automatically manages TLS certificates for Redis:
- Certificates are automatically rotated
- No manual intervention required
- Valid, trusted certificates from Railway's CA

### Custom Certificates (Advanced)

Only needed for:
- Self-signed certificates (development)
- Mutual TLS (mTLS) requirements
- Corporate PKI integration

**Encoding certificates for environment variables:**

```bash
# Encode CA certificate
cat ca-cert.pem | base64 -w 0 > redis_ca_cert.txt

# Encode client certificate
cat client-cert.pem | base64 -w 0 > redis_client_cert.txt

# Encode client key
cat client-key.pem | base64 -w 0 > redis_client_key.txt

# Set in environment
export REDIS_CA_CERT=$(cat redis_ca_cert.txt)
export REDIS_CLIENT_CERT=$(cat redis_client_cert.txt)
export REDIS_CLIENT_KEY=$(cat redis_client_key.txt)
```

---

## Security Best Practices

### 1. Always Use TLS in Production

```bash
# WRONG - Unencrypted
REDIS_URL=redis://default:password@host:6379

# CORRECT - Encrypted
REDIS_URL=rediss://default:password@host:6379
```

### 2. Enforce Certificate Validation

Do not disable `rejectUnauthorized` in production:

```typescript
// WRONG - Disables certificate validation
tls: { rejectUnauthorized: false }

// CORRECT - Enforces validation in production
tls: {
  rejectUnauthorized: process.env.NODE_ENV === 'production'
}
```

### 3. Use Strong TLS Versions

Minimum TLS 1.2 is configured by default:

```typescript
tls: {
  minVersion: 'TLSv1.2'  // TLS 1.2 or higher
}
```

### 4. Rotate Credentials Regularly

Railway allows password rotation without downtime:

1. Generate new password in Railway dashboard
2. Update `REDIS_URL` in app service
3. Restart app service
4. Old connections close gracefully

### 5. Monitor TLS Connections

Check connection encryption status:

```bash
# Verify TLS is active
redis-cli -u rediss://... INFO server | grep ssl
```

---

## Performance Considerations

### TLS Overhead

Expected performance impact:
- **Handshake**: 1-3ms (per new connection)
- **Encryption**: <1ms per operation
- **Connection pooling mitigates overhead** (handshake only on new connections)

### Connection Pooling

Our implementation uses connection pooling to minimize TLS handshake overhead:

```typescript
{
  min: 2,   // Minimum connections kept warm
  max: 10,  // Maximum connections per tier
  idleTimeoutMillis: 30000  // Keep connections alive
}
```

### Performance Benchmarks

Run performance tests:

```bash
npm run test:redis-performance
```

Expected results (with TLS):
- **GET operations**: ~70ms/op (Railway proxy)
- **SET operations**: ~70ms/op (Railway proxy)
- **Private network**: ~5-10ms/op (internal routing)

TLS overhead should be <1ms per operation.

---

## Troubleshooting

### Connection Failures

**Error**: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

**Cause**: Certificate validation failure

**Solution**:
1. Verify Railway certificate is valid
2. Check system time is correct (affects cert validation)
3. Ensure NODE_ENV is set correctly
4. For development, set `REDIS_USE_TLS=false` temporarily

**Error**: `ECONNREFUSED`

**Cause**: Wrong host/port or TLS not supported

**Solution**:
1. Verify connection string uses `rediss://`
2. Check port is correct (usually 6379)
3. Test with `redis-cli` first

**Error**: `SELF_SIGNED_CERT_IN_CHAIN`

**Cause**: Self-signed certificate without custom CA

**Solution**:
1. Add CA certificate to `REDIS_CA_CERT`
2. Or disable validation in development only

### Certificate Errors

Check certificate details:

```bash
# View certificate
openssl s_client -connect host:port -showcerts

# Verify certificate chain
openssl verify -CAfile ca-cert.pem server-cert.pem
```

### Debug TLS Connection

Enable ioredis debug logging:

```bash
DEBUG=ioredis:* npm run dev
```

---

## Migration Checklist

- [ ] Update `REDIS_URL` to use `rediss://` protocol
- [ ] Verify `NODE_ENV=production` in production environment
- [ ] Test TLS connection with `npm run test:redis-tls`
- [ ] Monitor performance after TLS enablement (<1ms overhead)
- [ ] Update documentation for team
- [ ] Rotate credentials after migration
- [ ] Set up certificate monitoring (Railway handles auto-rotation)

---

## Related Documentation

- [Certificate Rotation Guide](./certificate-rotation.md)
- [Redis Operations Guide](../../REDIS-OPERATIONS-GUIDE.md)
- [Connection Manager Documentation](../../lib/api/platform/connection-manager.ts)
- [Railway Redis Docs](https://docs.railway.app/databases/redis)

---

**Security Contact**: For security issues with TLS configuration, contact the platform security team.

**Last Updated**: 2025-11-22
**Maintained By**: Platform Security Engineering
