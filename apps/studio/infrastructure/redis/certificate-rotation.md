# Redis TLS Certificate Rotation Guide

## Overview

Certificate rotation is a critical security practice to maintain the integrity of encrypted Redis connections. This guide covers certificate rotation procedures for Railway-managed and custom certificates.

**Rotation Frequency**: Railway auto-rotates certificates before expiration (typically 90 days).

---

## Railway-Managed Certificates

### Automatic Rotation

Railway automatically handles certificate rotation for Redis TLS:

- **No manual intervention required**
- Certificates renewed 30 days before expiration
- Zero-downtime rotation
- Applications automatically use new certificates

### Monitoring Certificate Expiration

Track certificate expiration:

```bash
# Check certificate expiration date
openssl s_client -connect redis.railway.internal:6379 -showcerts 2>/dev/null | \
  openssl x509 -noout -dates

# Output:
# notBefore=Nov 22 00:00:00 2025 GMT
# notAfter=Feb 20 23:59:59 2026 GMT
```

### Verification After Rotation

After automatic rotation, verify TLS connections:

```bash
# Test connection
redis-cli -u rediss://default:password@redis.railway.internal:6379 ping

# Expected: PONG

# Check TLS info
redis-cli -u rediss://default:password@redis.railway.internal:6379 INFO server | grep ssl
```

---

## Custom Certificate Rotation

### When to Rotate Custom Certificates

Rotate certificates when:
- Certificate expires within 30 days
- Certificate is compromised
- Private key is exposed
- Migrating to new PKI infrastructure
- Compliance requirements mandate rotation

### Rotation Procedure (Zero-Downtime)

**Step 1: Generate New Certificates**

```bash
# Generate new private key
openssl genrsa -out redis-new-key.pem 2048

# Generate certificate signing request (CSR)
openssl req -new -key redis-new-key.pem -out redis-new.csr \
  -subj "/CN=redis.railway.internal/O=YourOrg/C=US"

# Sign certificate (by your CA)
openssl x509 -req -in redis-new.csr \
  -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out redis-new-cert.pem \
  -days 365 -sha256
```

**Step 2: Encode Certificates**

```bash
# Encode new CA certificate (if changed)
cat ca-cert-new.pem | base64 -w 0 > redis_ca_cert_new.txt

# Encode new client certificate
cat redis-new-cert.pem | base64 -w 0 > redis_client_cert_new.txt

# Encode new private key
cat redis-new-key.pem | base64 -w 0 > redis_client_key_new.txt
```

**Step 3: Update Environment Variables**

In Railway dashboard:

1. Navigate to your application service
2. Go to Variables tab
3. Update certificates:
   - `REDIS_CA_CERT` → new CA cert (if changed)
   - `REDIS_CLIENT_CERT` → new client cert
   - `REDIS_CLIENT_KEY` → new client key
4. Click "Deploy" to restart service

**Step 4: Verify New Certificates**

```bash
# Test connection with new certificates
npm run test:redis-tls

# Check certificate details
openssl x509 -in redis-new-cert.pem -text -noout | grep -A2 Validity
```

**Step 5: Monitor for Issues**

Watch for connection errors:

```bash
# Check application logs
railway logs --service your-app-service

# Monitor circuit breaker events
# Look for "Circuit breaker OPEN" messages
```

**Step 6: Revoke Old Certificates**

After successful rotation (24-48 hours):

```bash
# Add old certificate to CRL
openssl ca -revoke redis-old-cert.pem -crl_reason superseded

# Generate updated CRL
openssl ca -gencrl -out redis.crl
```

---

## Mutual TLS (mTLS) Rotation

### Server Certificate Rotation

If Redis server certificate changes:

1. Obtain new server certificate fingerprint
2. Update `REDIS_CA_CERT` if CA changed
3. Restart application to reload certificates
4. Verify connection still works

### Client Certificate Rotation

When rotating client certificates for mutual TLS:

```bash
# Generate new client key pair
openssl req -new -x509 -days 365 -nodes \
  -keyout client-new-key.pem \
  -out client-new-cert.pem \
  -subj "/CN=redis-client/O=YourOrg/C=US"

# Encode and update environment
cat client-new-cert.pem | base64 -w 0 > REDIS_CLIENT_CERT
cat client-new-key.pem | base64 -w 0 > REDIS_CLIENT_KEY

# Update in Railway and redeploy
```

---

## Certificate Validation

### Pre-Rotation Checklist

Before rotating certificates:

- [ ] Backup existing certificates securely
- [ ] Verify new certificate validity period
- [ ] Check certificate chain completeness
- [ ] Test new certificates in staging
- [ ] Notify team of planned rotation
- [ ] Schedule rotation during low-traffic period

### Certificate Validation Tests

```bash
# Verify certificate is valid
openssl x509 -in redis-cert.pem -text -noout

# Check certificate chain
openssl verify -CAfile ca-cert.pem redis-cert.pem

# Verify private key matches certificate
openssl x509 -noout -modulus -in redis-cert.pem | openssl md5
openssl rsa -noout -modulus -in redis-key.pem | openssl md5
# Both MD5 hashes should match

# Test TLS handshake
openssl s_client -connect redis.railway.internal:6379 \
  -CAfile ca-cert.pem \
  -cert redis-cert.pem \
  -key redis-key.pem
```

---

## Automation

### Certificate Expiration Monitoring

Set up automated monitoring:

```typescript
// scripts/check-redis-certificate-expiry.ts
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function checkCertificateExpiry() {
  const redisHost = process.env.REDIS_HOST || 'redis.railway.internal'
  const redisPort = process.env.REDIS_PORT || '6379'

  try {
    const { stdout } = await execAsync(
      `echo | openssl s_client -connect ${redisHost}:${redisPort} -showcerts 2>/dev/null | \\
       openssl x509 -noout -enddate`
    )

    const expiryMatch = stdout.match(/notAfter=(.+)/)
    if (expiryMatch) {
      const expiryDate = new Date(expiryMatch[1])
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

      console.log(`Certificate expires in ${daysUntilExpiry} days`)

      if (daysUntilExpiry < 30) {
        console.error(`WARNING: Certificate expires in ${daysUntilExpiry} days!`)
        // Send alert (email, Slack, PagerDuty, etc.)
        return false
      }
    }
  } catch (error) {
    console.error('Failed to check certificate expiry:', error)
    return false
  }

  return true
}

checkCertificateExpiry()
```

Run this check daily via cron or Railway scheduled job:

```bash
# Add to Railway scheduled jobs or GitHub Actions
0 9 * * * node scripts/check-redis-certificate-expiry.ts
```

### Automated Rotation Workflow

GitHub Actions workflow for certificate rotation:

```yaml
# .github/workflows/redis-certificate-rotation.yml
name: Redis Certificate Rotation

on:
  schedule:
    # Run monthly to check certificate expiry
    - cron: '0 0 1 * *'
  workflow_dispatch:

jobs:
  check-and-rotate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check certificate expiry
        id: check
        run: |
          # Check if certificate expires within 30 days
          node scripts/check-redis-certificate-expiry.ts

      - name: Generate new certificates
        if: steps.check.outputs.should_rotate == 'true'
        run: |
          # Generate new certificates
          ./scripts/generate-redis-certificates.sh

      - name: Update Railway variables
        if: steps.check.outputs.should_rotate == 'true'
        run: |
          # Update environment variables via Railway CLI
          railway variables set REDIS_CA_CERT="$(cat redis_ca_cert_new.txt)"
          railway variables set REDIS_CLIENT_CERT="$(cat redis_client_cert_new.txt)"
          railway variables set REDIS_CLIENT_KEY="$(cat redis_client_key_new.txt)"

      - name: Deploy and verify
        if: steps.check.outputs.should_rotate == 'true'
        run: |
          railway up
          sleep 30
          npm run test:redis-tls
```

---

## Rollback Procedure

If certificate rotation causes issues:

**Step 1: Identify the Issue**

```bash
# Check application logs
railway logs --service your-app-service | grep -i "tls\|certificate\|ssl"

# Look for:
# - UNABLE_TO_VERIFY_LEAF_SIGNATURE
# - SELF_SIGNED_CERT_IN_CHAIN
# - CERT_HAS_EXPIRED
```

**Step 2: Restore Previous Certificates**

```bash
# Restore backup certificates
export REDIS_CA_CERT=$(cat redis_ca_cert_backup.txt)
export REDIS_CLIENT_CERT=$(cat redis_client_cert_backup.txt)
export REDIS_CLIENT_KEY=$(cat redis_client_key_backup.txt)

# Update in Railway
railway variables set REDIS_CA_CERT="$REDIS_CA_CERT"
railway variables set REDIS_CLIENT_CERT="$REDIS_CLIENT_CERT"
railway variables set REDIS_CLIENT_KEY="$REDIS_CLIENT_KEY"
```

**Step 3: Redeploy**

```bash
railway up
```

**Step 4: Verify Rollback**

```bash
npm run test:redis-tls
```

**Step 5: Investigate Root Cause**

- Certificate format issues (PEM vs DER)
- Base64 encoding errors
- Certificate chain incomplete
- Hostname mismatch
- Clock skew (affects certificate validity)

---

## Security Best Practices

### Certificate Storage

**DO:**
- Store certificates in Railway environment variables (encrypted at rest)
- Use secret management (HashiCorp Vault, AWS Secrets Manager)
- Keep private keys encrypted when not in use
- Use strong passphrases for private keys

**DON'T:**
- Store certificates in Git repositories
- Share private keys via email/Slack
- Use unencrypted storage for private keys
- Reuse private keys across environments

### Private Key Protection

```bash
# Generate private key with passphrase
openssl genrsa -aes256 -out redis-key-encrypted.pem 2048

# Remove passphrase for application use (store encrypted version as backup)
openssl rsa -in redis-key-encrypted.pem -out redis-key.pem

# Set strict permissions
chmod 600 redis-key.pem
```

### Certificate Lifecycle

1. **Generation**: Use strong key sizes (2048-bit RSA minimum, 256-bit ECDSA)
2. **Distribution**: Securely transfer certificates (encrypted channels)
3. **Installation**: Automate deployment via CI/CD
4. **Rotation**: Rotate before expiration (30-60 days prior)
5. **Revocation**: Immediately revoke compromised certificates
6. **Deletion**: Securely delete old private keys after rotation

---

## Compliance Requirements

### PCI DSS

For PCI DSS compliance:
- Rotate certificates annually at minimum
- Use minimum 2048-bit RSA keys
- Maintain certificate inventory
- Log all certificate changes

### SOC 2

For SOC 2 compliance:
- Document rotation procedures
- Test rotation process quarterly
- Maintain audit trail of certificate changes
- Implement automated expiration monitoring

### HIPAA

For HIPAA compliance:
- Use FIPS 140-2 validated cryptography
- Encrypt private keys at rest
- Maintain certificate access logs
- Implement multi-person approval for rotation

---

## Troubleshooting

### Certificate Expired

**Symptom**: `CERT_HAS_EXPIRED` error

**Solution**:
1. Check system time (must be accurate)
2. Verify certificate validity period
3. Rotate to new certificate immediately

### Certificate Mismatch

**Symptom**: Private key doesn't match certificate

**Solution**:
```bash
# Verify key/cert pair match
diff <(openssl x509 -noout -modulus -in cert.pem | openssl md5) \
     <(openssl rsa -noout -modulus -in key.pem | openssl md5)
```

### Hostname Verification Failed

**Symptom**: `Hostname/IP doesn't match certificate's altnames`

**Solution**:
1. Check certificate Subject Alternative Names (SANs)
2. Ensure Redis hostname matches certificate CN or SAN
3. Use correct hostname in connection string

### Chain Incomplete

**Symptom**: `unable to get local issuer certificate`

**Solution**:
1. Include intermediate CA certificates
2. Concatenate full certificate chain:
   ```bash
   cat server-cert.pem intermediate-ca.pem root-ca.pem > fullchain.pem
   ```

---

## Emergency Contacts

**Certificate Expiration Alert**: Platform Security Team
**Certificate Compromise**: Incident Response Team (24/7)
**Railway Support**: Railway Status Page / Support Ticket

---

## Related Documentation

- [TLS Setup Guide](./tls-setup.md)
- [Redis Operations Guide](../../REDIS-OPERATIONS-GUIDE.md)
- [Security Incident Response Plan](../../docs/security/incident-response.md)

---

**Last Updated**: 2025-11-22
**Maintained By**: Platform Security Engineering
**Review Cycle**: Quarterly
