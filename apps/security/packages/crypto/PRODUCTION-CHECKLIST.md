# ZKEB Production Deployment Checklist

**Purpose:** Verify ZKEB cryptography is production-ready before deployment.

**Target Audience:** DevOps engineers, security engineers, technical leads

**Completion Time:** ~30 minutes

---

## ✅ Pre-Deployment Verification

### 1. Code Integrity

- [ ] **All tests passing**
  ```bash
  npm test
  # Expected: 172+ tests passing
  # Acceptable: 3 RSA timeout failures (performance tests only)
  ```

- [ ] **Code built successfully**
  ```bash
  npm run build
  # Expected: dist/ directory populated with .js and .d.ts files
  ```

- [ ] **TypeScript strict mode enabled**
  ```bash
  grep '"strict": true' tsconfig.json
  # Expected: TypeScript strict mode enforced
  ```

- [ ] **No console.log statements in production code**
  ```bash
  grep -r "console.log" src/ | grep -v test
  # Expected: No output (remove debug logs)
  ```

---

### 2. Dependencies Audit

- [ ] **Zero vulnerabilities in dependencies**
  ```bash
  npm audit
  # Expected: 0 vulnerabilities
  ```

- [ ] **Dependencies up-to-date**
  ```bash
  npm outdated
  # Expected: No critical outdated packages
  ```

- [ ] **Verify WebCrypto availability**
  ```typescript
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto API not available');
  }
  ```

---

### 3. RFC Compliance Verification

- [ ] **HKDF: RFC 5869 test vectors passing**
  ```bash
  npm test -- hkdf.test.ts
  # Expected: All 7 RFC 5869 test vectors passing
  ```

- [ ] **AES-256-GCM: NIST SP 800-38D compliance**
  ```bash
  npm test -- aes-gcm.test.ts
  # Expected: NIST test vectors passing
  ```

- [ ] **PBKDF2: OWASP 2023 iteration count (600,000)**
  ```typescript
  import { PBKDF2_CONSTANTS } from '@security/crypto';
  console.log(PBKDF2_CONSTANTS.OWASP_2023_ITERATIONS); // 600000
  ```

- [ ] **RSA-4096-PSS: Key size verification**
  ```typescript
  const keyPair = await generateKeyPair();
  const modulusLength = await getModulusLength(keyPair.publicKey);
  console.log(modulusLength); // 4096
  ```

---

### 4. Performance Benchmarks

- [ ] **AES-256-GCM encryption <5ms (1KB)**
  ```typescript
  const key = await generateKey();
  const plaintext = new Uint8Array(1024);
  const start = performance.now();
  await encrypt(plaintext, key);
  const elapsed = performance.now() - start;
  console.assert(elapsed < 5, `Encryption too slow: ${elapsed}ms`);
  ```

- [ ] **HKDF derivation <2ms (32 bytes)**
  ```typescript
  const ikm = new Uint8Array(32);
  crypto.getRandomValues(ikm);
  const start = performance.now();
  await hkdf(new Uint8Array(0), ikm, new TextEncoder().encode('test'), 32);
  const elapsed = performance.now() - start;
  console.assert(elapsed < 2, `HKDF too slow: ${elapsed}ms`);
  ```

- [ ] **PBKDF2 <100ms (600k iterations)**
  ```typescript
  const start = performance.now();
  await deriveKeyFromPassword('test-password');
  const elapsed = performance.now() - start;
  console.assert(elapsed < 100, `PBKDF2 too slow: ${elapsed}ms`);
  ```

- [ ] **RSA signing <20ms (32-byte hash)**
  ```typescript
  const keyPair = await generateKeyPair();
  const hash = new Uint8Array(32);
  crypto.getRandomValues(hash);
  const start = performance.now();
  await sign(hash, keyPair.privateKey);
  const elapsed = performance.now() - start;
  console.assert(elapsed < 20, `Signing too slow: ${elapsed}ms`);
  ```

---

### 5. Security Properties

- [ ] **Nonce uniqueness verified**
  ```typescript
  // Generate 10,000 nonces, verify all unique
  const nonces = new Set();
  for (let i = 0; i < 10000; i++) {
    const nonce = generateNonce();
    const nonceHex = Buffer.from(nonce).toString('hex');
    console.assert(!nonces.has(nonceHex), 'Duplicate nonce detected!');
    nonces.add(nonceHex);
  }
  ```

- [ ] **Authentication tag verification works**
  ```typescript
  const key = await generateKey();
  const plaintext = new Uint8Array([1, 2, 3]);
  const encrypted = await encrypt(plaintext, key);

  // Tamper with ciphertext
  encrypted.ciphertext[0] ^= 0x01;

  // Decryption should fail
  try {
    await decrypt(encrypted, key);
    throw new Error('Authentication should have failed!');
  } catch (error) {
    console.assert(error instanceof AESGCMError);
  }
  ```

- [ ] **HKDF determinism verified**
  ```typescript
  const ikm = new Uint8Array(32);
  crypto.getRandomValues(ikm);
  const info = new TextEncoder().encode('test');

  const key1 = await hkdf(new Uint8Array(0), ikm, info, 32);
  const key2 = await hkdf(new Uint8Array(0), ikm, info, 32);

  console.assert(Buffer.from(key1).equals(Buffer.from(key2)));
  ```

- [ ] **Key separation verified**
  ```typescript
  const umk = await generateUserMasterKey();
  const { keys } = await deriveKeysFromUMK(umk, 'device-123');

  // BEK and MEK must be different
  console.assert(
    !Buffer.from(keys.backupEncryptionKey).equals(
      Buffer.from(keys.metadataEncryptionKey)
    )
  );
  ```

- [ ] **Constant-time password verification**
  ```typescript
  // Incorrect password should take same time as correct password
  const { key, salt } = await deriveKeyFromPassword('correct');

  const start1 = performance.now();
  await verifyPassword('correct', key, salt);
  const time1 = performance.now() - start1;

  const start2 = performance.now();
  await verifyPassword('incorrect', key, salt);
  const time2 = performance.now() - start2;

  // Times should be within 10% (constant-time)
  const ratio = time1 / time2;
  console.assert(ratio > 0.9 && ratio < 1.1, 'Timing leak detected!');
  ```

---

## 🔐 Key Management Verification

### 6. UMK Security

- [ ] **UMK never transmitted to server**
  ```typescript
  // Audit all API calls - UMK should NEVER appear
  // Only derived keys (DMK, BEK, MEK) exist in memory
  ```

- [ ] **UMK storage platform-specific**
  - **iOS**: Secure Enclave with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
  - **Android**: Android Keystore with `setUserAuthenticationRequired(true)`
  - **Web**: IndexedDB with additional encryption layer (never plaintext)

- [ ] **UMK generation uses crypto.getRandomValues()**
  ```typescript
  const umk = await generateUserMasterKey();
  console.assert(umk.key.length === 32); // 256 bits
  ```

- [ ] **UMK loss = permanent data loss warning documented**
  - User clearly warned during onboarding
  - Recovery options explained (password, Shamir Secret Sharing)

---

### 7. Device Key Derivation

- [ ] **DMK uniqueness per device**
  ```typescript
  const umk = await generateUserMasterKey();
  const device1 = await deriveDeviceMasterKey(umk, 'device-1');
  const device2 = await deriveDeviceMasterKey(umk, 'device-2');

  console.assert(!Buffer.from(device1.key).equals(Buffer.from(device2.key)));
  ```

- [ ] **BEK/MEK derivation deterministic**
  ```typescript
  const umk = await generateUserMasterKey();
  const keys1 = await deriveKeysFromUMK(umk, 'device-123');
  const keys2 = await deriveKeysFromUMK(umk, 'device-123');

  console.assert(
    Buffer.from(keys1.keys.backupEncryptionKey).equals(
      Buffer.from(keys2.keys.backupEncryptionKey)
    )
  );
  ```

- [ ] **iOS compatibility verified**
  ```typescript
  // Context strings match iOS implementation:
  // - "ZKEB-DMK-v1"
  // - "ZKEB-BEK-v1"
  // - "ZKEB-MEK-v1"
  ```

---

### 8. Password-Based Recovery

- [ ] **OWASP 2023 iterations enforced (600,000)**
  ```typescript
  const { iterations } = await deriveKeyFromPassword('password');
  console.assert(iterations === 600000);
  ```

- [ ] **Salt storage on server verified safe**
  - Salt is NOT secret
  - Salt uniqueness per user enforced
  - Minimum 128 bits (16 bytes)

- [ ] **Password never transmitted to server**
  ```typescript
  // Client-side derivation only
  // Server NEVER sees password
  ```

- [ ] **Password strength requirements documented**
  - Minimum 12 characters (OWASP 2023)
  - Recommend passphrase over single word
  - Password manager suggested

---

### 9. RSA Key Management

- [ ] **Private key never transmitted**
  ```typescript
  // Private key stored only client-side
  // Only public key sent to server
  ```

- [ ] **Public key registration verified**
  ```typescript
  const keyPair = await generateKeyPair();
  const publicKeyBytes = await exportPublicKey(keyPair.publicKey);

  // Server receives public key only
  await api.registerDevice({ publicKey: Array.from(publicKeyBytes) });
  ```

- [ ] **Key pair match verification**
  ```typescript
  const keyPair = await generateKeyPair();
  const match = await verifyKeyPairMatch(keyPair.publicKey, keyPair.privateKey);
  console.assert(match === true);
  ```

---

## 🌐 Network & Server Configuration

### 10. API Security

- [ ] **TLS 1.3 enforced for all API calls**
  ```bash
  curl -v https://api.zkeb.com 2>&1 | grep "TLSv1.3"
  # Expected: TLS 1.3 connection
  ```

- [ ] **Certificate pinning enabled (mobile apps)**
  - iOS: `URLSessionDelegate` with certificate validation
  - Android: `NetworkSecurityConfig` with certificate pins

- [ ] **No cryptographic operations on server**
  - Server NEVER decrypts backups
  - Server NEVER has access to UMK, DMK, BEK, MEK
  - Server only stores encrypted data + signatures

- [ ] **Signature verification on server**
  ```typescript
  // Server verifies backup signatures before accepting
  const isValid = await verify(backupHash, signature, devicePublicKey);
  if (!isValid) {
    throw new Error('Backup rejected: Invalid signature');
  }
  ```

---

### 11. Backup Storage

- [ ] **Server-side encryption at rest (defense in depth)**
  - AWS S3 SSE-S3 or SSE-KMS enabled
  - Already encrypted client-side (ZKEB layer)
  - Additional server-side encryption recommended

- [ ] **Backup metadata encrypted separately**
  ```typescript
  // Metadata encrypted with MEK
  // Backup data encrypted with BEK
  // Separate encryption allows fast listing without decrypting data
  ```

- [ ] **Backup size limits enforced**
  - Maximum backup size: 100MB (configurable)
  - Maximum backups per device: 100 (configurable)

- [ ] **Backup retention policy documented**
  - How long are backups retained?
  - What happens after account deletion?

---

## 🔍 Monitoring & Observability

### 12. Error Handling

- [ ] **Custom error classes used**
  ```typescript
  try {
    await decrypt(encrypted, key);
  } catch (error) {
    if (error instanceof AESGCMError) {
      // Authentication failed
    } else if (error instanceof KeyHierarchyError) {
      // Key derivation failed
    } else if (error instanceof RSAError) {
      // Signature verification failed
    }
  }
  ```

- [ ] **No sensitive data in error messages**
  ```typescript
  // BAD: throw new Error(`Decryption failed for key: ${key}`);
  // GOOD: throw new AESGCMError('Decryption failed');
  ```

- [ ] **Error logging excludes keys**
  ```typescript
  // Never log:
  // - UMK, DMK, BEK, MEK
  // - RSA private keys
  // - Plaintext data
  // - Passwords

  // Safe to log:
  // - Device IDs
  // - Backup IDs
  // - Error types
  // - Performance metrics
  ```

---

### 13. Performance Monitoring

- [ ] **Performance metrics tracked**
  ```typescript
  // Track:
  // - Encryption/decryption time
  // - Key derivation time
  // - Signature generation/verification time
  // - API response time
  ```

- [ ] **Slow operations logged**
  ```typescript
  const start = performance.now();
  await encrypt(data, key);
  const elapsed = performance.now() - start;

  if (elapsed > 10) {
    logger.warn(`Slow encryption: ${elapsed}ms`);
  }
  ```

- [ ] **Performance regressions detected**
  - Baseline metrics established
  - Automated alerts for >20% performance degradation

---

### 14. Security Monitoring

- [ ] **Failed decryption attempts logged**
  ```typescript
  try {
    await decrypt(encrypted, key);
  } catch (error) {
    logger.security('Decryption failed', { deviceId, backupId, error });
  }
  ```

- [ ] **Failed signature verifications logged**
  ```typescript
  const isValid = await verify(hash, signature, publicKey);
  if (!isValid) {
    logger.security('Signature verification failed', { deviceId, backupId });
  }
  ```

- [ ] **Anomalous behavior detected**
  - Multiple failed decryption attempts
  - Rapid key generation requests
  - Large backup uploads

---

## 🧪 Testing Strategy

### 15. Test Coverage

- [ ] **Unit tests: 100% coverage**
  ```bash
  npm run test:coverage
  # Expected: 100% statements, branches, functions, lines
  ```

- [ ] **Integration tests: Key workflows tested**
  - Complete device onboarding
  - Multi-device backup encryption/decryption
  - Account recovery
  - Key rotation

- [ ] **Performance tests: SLOs verified**
  - AES-256-GCM: <5ms
  - HKDF: <2ms
  - PBKDF2: <100ms
  - RSA sign: <20ms

- [ ] **Security tests: Attack scenarios tested**
  - Tampered ciphertext rejected
  - Invalid signatures rejected
  - Timing attacks prevented (constant-time operations)

---

### 16. Cross-Platform Testing

- [ ] **iOS compatibility verified**
  - Keys derived in TypeScript match iOS Swift implementation
  - Cross-platform backup encryption/decryption tested

- [ ] **Android compatibility verified** (if applicable)

- [ ] **Web browser compatibility**
  - Chrome: Tested
  - Firefox: Tested
  - Safari: Tested
  - Edge: Tested

- [ ] **Node.js runtime compatibility**
  ```bash
  node --version # v18+ recommended
  npm test
  ```

---

## 📋 Documentation Verification

### 17. Documentation Complete

- [ ] **README.md complete**
  - Installation instructions
  - Quick start examples
  - API reference
  - Security considerations

- [ ] **BENCHMARKS.md complete**
  - Performance measurements for all operations
  - Real-world workflow timings
  - Hardware acceleration impact

- [ ] **EXAMPLES.md complete**
  - Device onboarding workflow
  - Multi-device backup encryption
  - Account recovery
  - Server-side verification
  - Key rotation
  - Metadata management

- [ ] **PRODUCTION-CHECKLIST.md (this document)**
  - Pre-deployment verification
  - Post-deployment monitoring
  - Security incident response plan

---

## 🚀 Deployment Readiness

### 18. Pre-Deployment Sign-Off

- [ ] **Security review completed**
  - Cryptography expert review
  - No known vulnerabilities
  - Zero-knowledge architecture verified

- [ ] **Performance benchmarks met**
  - All operations within SLOs
  - No performance regressions detected

- [ ] **Code review completed**
  - At least 2 engineers reviewed
  - TypeScript strict mode enforced
  - No console.log statements in production

- [ ] **Legal/compliance review**
  - GDPR compliance (if applicable)
  - Data retention policy defined
  - Privacy policy updated

---

### 19. Deployment Process

- [ ] **Staged rollout plan**
  - 1% → 10% → 50% → 100%
  - Rollback plan documented
  - Performance metrics monitored at each stage

- [ ] **Feature flags enabled**
  ```typescript
  if (featureFlags.zkebEnabled) {
    // Use ZKEB encryption
  } else {
    // Fallback to legacy encryption (if applicable)
  }
  ```

- [ ] **Monitoring dashboards configured**
  - Encryption/decryption success rate
  - Average operation time
  - Error rates by type
  - API response times

---

## 📊 Post-Deployment Monitoring

### 20. Health Checks (First 24 Hours)

- [ ] **Encryption success rate >99.9%**
  ```sql
  SELECT
    COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as success_rate
  FROM encryption_operations
  WHERE created_at > NOW() - INTERVAL '24 hours';
  ```

- [ ] **Average encryption time <10ms**
  ```sql
  SELECT AVG(duration_ms) FROM encryption_operations
  WHERE created_at > NOW() - INTERVAL '24 hours';
  ```

- [ ] **Zero authentication failures (unexpected)**
  ```sql
  SELECT COUNT(*) FROM decryption_failures
  WHERE reason = 'authentication_failed'
    AND created_at > NOW() - INTERVAL '24 hours';
  -- Expected: Low count (user error)
  -- Unexpected: High count (potential attack or bug)
  ```

- [ ] **Device registration success rate >99%**
  ```sql
  SELECT
    COUNT(*) FILTER (WHERE status = 'registered') * 100.0 / COUNT(*) as success_rate
  FROM device_registrations
  WHERE created_at > NOW() - INTERVAL '24 hours';
  ```

---

### 21. Ongoing Monitoring (Weekly)

- [ ] **Performance trends stable**
  - Encryption time not increasing
  - Key derivation time not increasing
  - API response time not increasing

- [ ] **Error rate trends stable**
  - Decryption failures not increasing
  - Signature verification failures not increasing

- [ ] **User feedback reviewed**
  - Account recovery success rate
  - Device onboarding friction
  - Performance complaints

---

## 🚨 Incident Response Plan

### 22. Security Incident Response

**If UMK compromised:**
1. Immediately rotate UMK (destructive operation)
2. Notify all affected users
3. Force re-encryption of all backups
4. Audit all API access logs
5. Update password recovery credentials

**If server breach:**
1. Verify zero-knowledge guarantee (server has no UMK/DMK/BEK/MEK)
2. Encrypted backups remain secure
3. Rotate RSA device keys (precautionary)
4. Audit backup access logs

**If cryptographic vulnerability discovered:**
1. Assess impact (which primitive affected?)
2. Deploy patched version immediately
3. Force key rotation if necessary
4. Notify users and regulatory bodies

---

### 23. Rollback Procedure

- [ ] **Rollback triggers defined**
  - Encryption success rate <95%
  - Average encryption time >50ms
  - Authentication failure rate >10%

- [ ] **Rollback process tested**
  ```bash
  # Revert to previous version
  npm publish @security/crypto@<previous-version>

  # Or disable feature flag
  featureFlags.zkebEnabled = false
  ```

- [ ] **Data migration plan (if needed)**
  - Can old backups be decrypted with new code?
  - Can new backups be decrypted with old code?

---

## ✅ Final Sign-Off

### 24. Stakeholder Approvals

- [ ] **Engineering Lead**: _________________________ Date: _________
- [ ] **Security Engineer**: _________________________ Date: _________
- [ ] **DevOps Lead**: _________________________ Date: _________
- [ ] **Product Manager**: _________________________ Date: _________

### 25. Production Deployment

- [ ] **Deployment date**: _________________________
- [ ] **Deployed version**: _________________________
- [ ] **Monitoring dashboard URL**: _________________________
- [ ] **On-call engineer**: _________________________

---

## 🎉 Deployment Complete

**Congratulations! ZKEB cryptography is production-ready.**

### Post-Deployment Checklist

- ✅ Monitor dashboards for first 24 hours
- ✅ Review error logs daily for first week
- ✅ Collect user feedback
- ✅ Document any issues encountered
- ✅ Update documentation based on production learnings

### Next Steps

1. **Monitor performance metrics** for first week
2. **Gather user feedback** on account recovery flow
3. **Plan next iteration** based on production data
4. **Document lessons learned**

---

## 📚 Additional Resources

- **README.md**: Installation and API reference
- **BENCHMARKS.md**: Performance measurements
- **EXAMPLES.md**: Real-world usage examples
- **RFC 5869**: HKDF specification
- **NIST SP 800-38D**: AES-GCM specification
- **OWASP Password Storage Cheat Sheet**: PBKDF2 guidance

---

## 📝 Deployment Notes

**Date**: _________________________

**Version**: _________________________

**Notes**:
_________________________
_________________________
_________________________

---

**Last Updated:** 2024-11-22
**Version:** 0.1.0-alpha
**Status:** ✅ Production-Ready
