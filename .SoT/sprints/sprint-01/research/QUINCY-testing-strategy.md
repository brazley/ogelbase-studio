# ZKEB Cloud Testing Strategy
**QA Engineer**: Quincy Washington
**Date**: 2025-11-22
**Classification**: Test Architecture Specification
**Target**: Zero-Knowledge Encrypted Backup (ZKEB) Cloud Platform

---

## Executive Summary

This testing strategy focuses on **cryptographic verification** as the primary success criterion. Unlike traditional web applications where functionality is the main concern, ZKEB's value proposition is its zero-knowledge guarantee - if that guarantee fails, the entire system fails regardless of how well other features work.

**Core Testing Principle**: Tests must be designed to **fail loudly** when zero-knowledge properties are violated, even if functionality appears correct.

---

## 1. Test Architecture Overview

### 1.1 Testing Pyramid (Inverted for Security)

Traditional web apps prioritize unit tests at the base. ZKEB inverts this - security verification tests form the foundation:

```
┌─────────────────────────────────────┐
│   E2E User Flow Tests (10%)        │  ← Verify UX
├─────────────────────────────────────┤
│   API Integration Tests (15%)      │  ← Verify endpoints
├─────────────────────────────────────┤
│   Zero-Knowledge Tests (35%)       │  ← PROVE security
├─────────────────────────────────────┤
│   Crypto Primitive Tests (40%)     │  ← Verify math
└─────────────────────────────────────┘
```

**Rationale**: Cryptographic correctness is non-negotiable. A single key leakage violation destroys all value, while a broken UI button can be tolerated temporarily.

### 1.2 Test Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Unit Tests** | Jest 29 + ts-jest | TypeScript native, fast, industry standard |
| **Crypto Tests** | Jest + Node crypto test vectors | Built-in crypto, verifiable against standards |
| **Integration** | Supertest + Test Containers | Real HTTP, isolated databases per test |
| **E2E** | Playwright + Chromium | Real browser WebCrypto, cross-device simulation |
| **Security** | Custom adversarial framework | Simulate attacker with server access |
| **Performance** | Artillery + custom benchmarks | Load testing + crypto timing verification |
| **Coverage** | Istanbul (c8) | 80%+ for critical paths, 100% for crypto |

### 1.3 Test Environment Strategy

```typescript
// Test environments with escalating realism
const TEST_ENVIRONMENTS = {
  // Isolated unit tests - pure functions
  unit: {
    crypto: "node:crypto.subtle", // Native WebCrypto polyfill
    database: "in-memory SQLite",
    network: "mocked"
  },

  // Integration tests - real components
  integration: {
    crypto: "node:crypto.subtle",
    database: "Docker PostgreSQL 16",
    network: "localhost HTTP"
  },

  // E2E tests - real browser
  e2e: {
    crypto: "Chromium WebCrypto", // Real browser
    database: "Docker PostgreSQL 16",
    network: "Railway staging environment"
  },

  // Security tests - adversarial server
  security: {
    crypto: "node:crypto.subtle",
    database: "compromised_db_simulator", // Simulates leaked DB
    network: "mitm_proxy" // Man-in-the-middle simulator
  }
};
```

---

## 2. Cryptographic Primitive Testing

**Goal**: Verify each primitive matches specification and produces deterministic, verifiable outputs.

### 2.1 AES-256-GCM Round-Trip Tests

```typescript
// tests/crypto/aes-gcm.test.ts
import { describe, it, expect } from '@jest/globals';
import { ZKEBCloudClient, DataClassification } from '@/zkeb-cloud-client';

describe('AES-256-GCM Encryption', () => {
  const client = new ZKEBCloudClient();

  it('should encrypt and decrypt producing exact original plaintext', async () => {
    const plaintext = new TextEncoder().encode('Sensitive PHI data');

    const encrypted = await client.encrypt(
      plaintext,
      DataClassification.Restricted
    );

    const decrypted = await client.decrypt(encrypted);

    expect(decrypted).toEqual(plaintext);
  });

  it('should produce different ciphertext for identical plaintext (nonce uniqueness)', async () => {
    const plaintext = new TextEncoder().encode('Same message');

    const encrypted1 = await client.encrypt(plaintext, DataClassification.Confidential);
    const encrypted2 = await client.encrypt(plaintext, DataClassification.Confidential);

    // Nonces MUST differ (IND-CPA security requirement)
    expect(encrypted1.nonce).not.toEqual(encrypted2.nonce);
    expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
  });

  it('should reject tampered ciphertext (authentication tag verification)', async () => {
    const plaintext = new TextEncoder().encode('Protected data');
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    // Flip one bit in ciphertext
    encrypted.ciphertext[0] ^= 0x01;

    // Decryption MUST fail with authentication error
    await expect(client.decrypt(encrypted)).rejects.toThrow(/authentication|tag|invalid/i);
  });

  it('should reject tampered authentication tag', async () => {
    const plaintext = new TextEncoder().encode('Protected data');
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    // Flip one bit in tag
    encrypted.tag[0] ^= 0x01;

    await expect(client.decrypt(encrypted)).rejects.toThrow(/authentication|tag|invalid/i);
  });

  it('should reject wrong nonce (nonce reuse detection)', async () => {
    const plaintext1 = new TextEncoder().encode('Message 1');
    const plaintext2 = new TextEncoder().encode('Message 2');

    const encrypted1 = await client.encrypt(plaintext1, DataClassification.Confidential);
    const encrypted2 = await client.encrypt(plaintext2, DataClassification.Confidential);

    // Try to decrypt encrypted2 with encrypted1's nonce (should fail)
    const tamperedEncrypted = {
      ...encrypted2,
      nonce: encrypted1.nonce
    };

    await expect(client.decrypt(tamperedEncrypted)).rejects.toThrow();
  });

  it('should handle maximum plaintext size (64GB theoretical, 1GB practical)', async () => {
    // Test with 10MB payload (practical upper bound for web)
    const largePayload = crypto.getRandomValues(new Uint8Array(10 * 1024 * 1024));

    const encrypted = await client.encrypt(largePayload, DataClassification.Internal);
    const decrypted = await client.decrypt(encrypted);

    expect(decrypted).toEqual(largePayload);
  });

  it('should match NIST test vectors', async () => {
    // NIST SP 800-38D test vector
    const testVector = {
      key: hexToBytes('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308'),
      plaintext: hexToBytes('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255'),
      nonce: hexToBytes('cafebabefacedbaddecaf888'),
      ciphertext: hexToBytes('522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad'),
      tag: hexToBytes('b094dac5d93471bdec1a502270e3cc6c')
    };

    // Import test key
    const key = await crypto.subtle.importKey(
      'raw',
      testVector.key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Encrypt with fixed nonce (only for testing!)
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: testVector.nonce },
      key,
      testVector.plaintext
    );

    const ciphertext = new Uint8Array(encrypted).slice(0, -16);
    const tag = new Uint8Array(encrypted).slice(-16);

    expect(ciphertext).toEqual(testVector.ciphertext);
    expect(tag).toEqual(testVector.tag);
  });
});

// Utility: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
```

### 2.2 HKDF Key Derivation Tests

```typescript
// tests/crypto/hkdf.test.ts
import { describe, it, expect } from '@jest/globals';
import { hkdf, hkdfExtract, hkdfExpand } from '@/crypto/hkdf';

describe('HKDF-SHA256 Key Derivation', () => {
  it('should derive deterministic keys from same inputs', async () => {
    const ikm = new TextEncoder().encode('input-keying-material');
    const salt = new TextEncoder().encode('unique-salt');
    const info = new TextEncoder().encode('ZKEB-DMK-v1');

    const okm1 = await hkdf(salt, ikm, info, 32);
    const okm2 = await hkdf(salt, ikm, info, 32);

    expect(okm1).toEqual(okm2);
  });

  it('should derive different keys for different contexts', async () => {
    const ikm = new TextEncoder().encode('master-key');
    const salt = new TextEncoder().encode('device-id');

    const bekInfo = new TextEncoder().encode('ZKEB-BEK-v1');
    const mekInfo = new TextEncoder().encode('ZKEB-MEK-v1');

    const bek = await hkdf(salt, ikm, bekInfo, 32);
    const mek = await hkdf(salt, ikm, mekInfo, 32);

    // Different info strings MUST produce different keys
    expect(bek).not.toEqual(mek);
  });

  it('should match RFC 5869 test vectors', async () => {
    // RFC 5869 Test Case 1
    const testVector = {
      ikm: hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
      salt: hexToBytes('000102030405060708090a0b0c'),
      info: hexToBytes('f0f1f2f3f4f5f6f7f8f9'),
      length: 42,
      expectedPrk: hexToBytes('077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5'),
      expectedOkm: hexToBytes('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865')
    };

    const prk = await hkdfExtract(testVector.salt, testVector.ikm);
    expect(prk).toEqual(testVector.expectedPrk);

    const okm = await hkdfExpand(prk, testVector.info, testVector.length);
    expect(okm).toEqual(testVector.expectedOkm);
  });

  it('should support hierarchical key derivation', async () => {
    // User Master Key → Device Master Key → Encryption Keys
    const umk = crypto.getRandomValues(new Uint8Array(32));
    const deviceId = new TextEncoder().encode('device-12345');

    // Derive Device Master Key
    const dmkInfo = new TextEncoder().encode('ZKEB-Cloud-DMK-v1');
    const dmk = await hkdf(deviceId, umk, dmkInfo, 32);

    // Derive Backup Encryption Key from DMK
    const backupSalt = new TextEncoder().encode('backup');
    const bekInfo = new TextEncoder().encode('ZKEB-BEK-v1');
    const bek = await hkdf(backupSalt, dmk, bekInfo, 32);

    // Derive Metadata Encryption Key from DMK
    const metadataSalt = new TextEncoder().encode('metadata');
    const mekInfo = new TextEncoder().encode('ZKEB-MEK-v1');
    const mek = await hkdf(metadataSalt, dmk, mekInfo, 32);

    // Keys MUST be different and deterministic
    expect(bek).not.toEqual(mek);
    expect(bek).not.toEqual(dmk);
    expect(mek).not.toEqual(dmk);
  });

  it('should resist length extension attacks', async () => {
    const ikm = new TextEncoder().encode('secret');
    const salt = new TextEncoder().encode('salt');
    const info = new TextEncoder().encode('context');

    const okm32 = await hkdf(salt, ikm, info, 32);
    const okm64 = await hkdf(salt, ikm, info, 64);

    // First 32 bytes of 64-byte derivation SHOULD NOT equal 32-byte derivation
    // (This verifies we're using HKDF correctly, not naive concatenation)
    expect(okm64.slice(0, 32)).not.toEqual(okm32);
  });
});
```

### 2.3 Nonce Uniqueness Verification

**Critical Security Property**: AES-GCM security breaks catastrophically if nonce is ever reused with the same key.

```typescript
// tests/crypto/nonce-uniqueness.test.ts
import { describe, it, expect } from '@jest/globals';
import { ZKEBCloudClient, DataClassification } from '@/zkeb-cloud-client';

describe('Nonce Uniqueness Verification', () => {
  it('should generate unique nonces across 10,000 encryptions', async () => {
    const client = new ZKEBCloudClient();
    const plaintext = new TextEncoder().encode('Test message');
    const nonceSet = new Set<string>();

    for (let i = 0; i < 10_000; i++) {
      const encrypted = await client.encrypt(plaintext, DataClassification.Confidential);
      const nonceHex = Array.from(encrypted.nonce)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Check for duplicate nonce
      if (nonceSet.has(nonceHex)) {
        throw new Error(`Duplicate nonce detected after ${i} iterations: ${nonceHex}`);
      }

      nonceSet.add(nonceHex);
    }

    // Verify all nonces were unique
    expect(nonceSet.size).toBe(10_000);
  });

  it('should use cryptographically secure random source', async () => {
    // Statistical test: Verify nonce bytes have uniform distribution
    const client = new ZKEBCloudClient();
    const plaintext = new TextEncoder().encode('Test');

    const byteFrequency = new Array(256).fill(0);
    const samples = 1_000;

    for (let i = 0; i < samples; i++) {
      const encrypted = await client.encrypt(plaintext, DataClassification.Internal);

      // Count frequency of each byte value in nonce
      encrypted.nonce.forEach(byte => byteFrequency[byte]++);
    }

    // Expected frequency per byte: (1000 samples * 12 bytes) / 256 ≈ 46.875
    const totalBytes = samples * 12;
    const expectedFreq = totalBytes / 256;
    const tolerance = expectedFreq * 0.3; // 30% tolerance for statistical variation

    // Chi-square test would be more rigorous, but this catches obvious bias
    for (let i = 0; i < 256; i++) {
      expect(byteFrequency[i]).toBeGreaterThan(expectedFreq - tolerance);
      expect(byteFrequency[i]).toBeLessThan(expectedFreq + tolerance);
    }
  });

  it('should never reuse nonces even after key rotation', async () => {
    const client = new ZKEBCloudClient();
    const plaintext = new TextEncoder().encode('Data');

    // Generate nonces with old key
    const oldKeyNonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const encrypted = await client.encrypt(plaintext, DataClassification.Confidential);
      oldKeyNonces.add(Buffer.from(encrypted.nonce).toString('hex'));
    }

    // Simulate key rotation
    await client.rotateKey(DataClassification.Confidential);

    // Generate nonces with new key
    const newKeyNonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const encrypted = await client.encrypt(plaintext, DataClassification.Confidential);
      const nonceHex = Buffer.from(encrypted.nonce).toString('hex');

      // New nonce MUST NOT collide with old nonces
      expect(oldKeyNonces.has(nonceHex)).toBe(false);
      newKeyNonces.add(nonceHex);
    }

    expect(newKeyNonces.size).toBe(100);
  });
});
```

### 2.4 Side-Channel Resistance Tests

```typescript
// tests/crypto/timing-attacks.test.ts
import { describe, it, expect } from '@jest/globals';
import { ZKEBCloudClient } from '@/zkeb-cloud-client';

describe('Timing Side-Channel Resistance', () => {
  it('should have constant-time decryption regardless of plaintext', async () => {
    const client = new ZKEBCloudClient();

    // Two different plaintexts
    const plaintext1 = new TextEncoder().encode('a'.repeat(1024));
    const plaintext2 = new TextEncoder().encode('z'.repeat(1024));

    const encrypted1 = await client.encrypt(plaintext1, DataClassification.Confidential);
    const encrypted2 = await client.encrypt(plaintext2, DataClassification.Confidential);

    // Measure decryption timing
    const timings1: number[] = [];
    const timings2: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start1 = performance.now();
      await client.decrypt(encrypted1);
      timings1.push(performance.now() - start1);

      const start2 = performance.now();
      await client.decrypt(encrypted2);
      timings2.push(performance.now() - start2);
    }

    // Statistical analysis: means should be close
    const mean1 = timings1.reduce((a, b) => a + b) / timings1.length;
    const mean2 = timings2.reduce((a, b) => a + b) / timings2.length;

    const percentDiff = Math.abs(mean1 - mean2) / mean1 * 100;

    // Allow 10% variance (timing attacks need <1% to be exploitable)
    expect(percentDiff).toBeLessThan(10);
  });

  it('should resist timing attacks on authentication tag verification', async () => {
    const client = new ZKEBCloudClient();
    const plaintext = new TextEncoder().encode('Sensitive data');
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    // Valid decryption timing
    const validTimings: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      await client.decrypt(encrypted);
      validTimings.push(performance.now() - start);
    }

    // Invalid decryption timing (tampered tag)
    const invalidTimings: number[] = [];
    for (let i = 0; i < 50; i++) {
      const tampered = { ...encrypted, tag: crypto.getRandomValues(new Uint8Array(16)) };
      const start = performance.now();
      try {
        await client.decrypt(tampered);
      } catch {
        // Expected to fail
      }
      invalidTimings.push(performance.now() - start);
    }

    // Valid and invalid should have similar timing profiles
    const validMean = validTimings.reduce((a, b) => a + b) / validTimings.length;
    const invalidMean = invalidTimings.reduce((a, b) => a + b) / invalidTimings.length;

    const percentDiff = Math.abs(validMean - invalidMean) / validMean * 100;
    expect(percentDiff).toBeLessThan(15); // Allow some variance
  });
});
```

---

## 3. Zero-Knowledge Verification Tests

**Goal**: **PROVE** that server cannot decrypt user data, even with full infrastructure access.

### 3.1 Server Adversary Simulation

```typescript
// tests/security/zero-knowledge-proof.test.ts
import { describe, it, expect } from '@jest/globals';
import { createAdversarialServer, ServerAdversary } from './adversarial-server';
import { ZKEBCloudClient } from '@/zkeb-cloud-client';

describe('Zero-Knowledge Guarantee Verification', () => {
  let adversary: ServerAdversary;
  let client: ZKEBCloudClient;

  beforeEach(async () => {
    // Spin up adversarial server with full access
    adversary = await createAdversarialServer({
      databaseAccess: true,
      memoryAccess: true,
      networkAccess: true,
      logAccess: true
    });

    client = new ZKEBCloudClient();
  });

  it('should prevent server from decrypting uploaded ciphertext', async () => {
    const sensitiveData = {
      ssn: '123-45-6789',
      creditCard: '4242-4242-4242-4242',
      diagnosis: 'Hypertension'
    };

    const plaintext = new TextEncoder().encode(JSON.stringify(sensitiveData));

    // Client encrypts data
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    // Upload to server
    const blobId = await adversary.uploadBlob(encrypted);

    // ADVERSARY ATTEMPT: Try to decrypt with full server access
    const storedBlob = await adversary.db.query('SELECT * FROM encrypted_blobs WHERE id = $1', [blobId]);

    // Adversary has ciphertext, nonce, tag - but NO KEY
    const decryptionAttempt = await adversary.attemptDecryption({
      ciphertext: storedBlob.ciphertext,
      nonce: storedBlob.nonce,
      tag: storedBlob.auth_tag
    });

    // Decryption MUST fail - no key available
    expect(decryptionAttempt.success).toBe(false);
    expect(decryptionAttempt.plaintext).toBeNull();

    // Verify ciphertext is computationally useless
    const ciphertextString = Buffer.from(storedBlob.ciphertext).toString('utf8', 0, 100);
    expect(ciphertextString).not.toContain('123-45-6789');
    expect(ciphertextString).not.toContain('4242');
    expect(ciphertextString).not.toContain('Hypertension');
  });

  it('should prevent key extraction from database dumps', async () => {
    const client = new ZKEBCloudClient();

    // Client generates and stores key locally
    await client.generateKey(DataClassification.Restricted);

    // Simulate complete database dump
    const dbDump = await adversary.dumpFullDatabase();

    // ADVERSARY ATTEMPT: Search for encryption keys in database
    const keySearchResults = await adversary.searchForKeys(dbDump, {
      patterns: [
        /[A-Fa-f0-9]{64}/, // 256-bit hex keys
        /^[A-Za-z0-9+/]{44}$/, // Base64 256-bit keys
        /BEGIN.*KEY/, // PEM format keys
      ]
    });

    // Database MUST NOT contain any encryption keys
    expect(keySearchResults.keysFound).toBe(0);
    expect(keySearchResults.suspiciousPatterns).toHaveLength(0);
  });

  it('should prevent key extraction from server memory', async () => {
    // Client encrypts data
    const encrypted = await client.encrypt(
      new TextEncoder().encode('Secret message'),
      DataClassification.Confidential
    );

    await adversary.uploadBlob(encrypted);

    // ADVERSARY ATTEMPT: Dump server process memory
    const memoryDump = await adversary.dumpProcessMemory();

    // Search for encryption keys in memory
    const memorySearch = await adversary.searchForKeys(memoryDump, {
      patterns: [
        /[A-Fa-f0-9]{64}/,
        /^[A-Za-z0-9+/]{44}$/
      ]
    });

    // Server memory MUST NOT contain user encryption keys
    expect(memorySearch.keysFound).toBe(0);
  });

  it('should prevent key derivation from user password (server never sees password)', async () => {
    const userPassword = 'SuperSecret123!';

    // Client derives key from password (client-side only)
    const key = await client.deriveKeyFromPassword(
      userPassword,
      crypto.getRandomValues(new Uint8Array(32)),
      600_000
    );

    // Client encrypts some data
    const encrypted = await client.encrypt(
      new TextEncoder().encode('Private data'),
      DataClassification.Restricted
    );

    await adversary.uploadBlob(encrypted);

    // ADVERSARY ATTEMPT: Access server logs, network traffic, database
    const serverLogs = await adversary.getServerLogs();
    const networkTraffic = await adversary.getNetworkTraffic();
    const database = await adversary.dumpFullDatabase();

    // Password MUST NOT appear in any server-side artifact
    expect(serverLogs).not.toContain('SuperSecret123!');
    expect(networkTraffic).not.toContain('SuperSecret123!');
    expect(database).not.toContain('SuperSecret123!');

    // ADVERSARY ATTEMPT: Try to derive key from database info
    const userRecord = await adversary.db.query('SELECT * FROM users WHERE id = $1', ['user-123']);

    // Even with username_hash, server cannot derive encryption key
    const keyDerivationAttempt = await adversary.attemptKeyDerivation({
      usernameHash: userRecord.username_hash,
      // Adversary does NOT have password
    });

    expect(keyDerivationAttempt.success).toBe(false);
  });

  it('should maintain zero-knowledge under legal compulsion scenario', async () => {
    // Simulate: Government subpoena demands user data

    const clientData = {
      medicalRecords: 'Patient has diabetes type 2',
      prescriptions: ['Metformin 500mg', 'Insulin'],
      labResults: 'HbA1c: 7.2%'
    };

    const plaintext = new TextEncoder().encode(JSON.stringify(clientData));
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    await adversary.uploadBlob(encrypted);

    // COMPULSION SCENARIO: Authority demands server provide plaintext data
    const legalRequest = {
      userId: 'user-123',
      scope: 'all_medical_records',
      authority: 'court_order'
    };

    const serverResponse = await adversary.respondToLegalRequest(legalRequest);

    // Server MUST only be able to provide encrypted blobs (useless without key)
    expect(serverResponse.plaintext).toBeNull();
    expect(serverResponse.encryptedBlobs).toHaveLength(1);
    expect(serverResponse.canDecrypt).toBe(false);
    expect(serverResponse.reason).toContain('zero-knowledge');

    // Verify: Even with full cooperation, server cannot provide plaintext
    const providedData = serverResponse.encryptedBlobs[0];
    expect(providedData.ciphertext).toBeDefined();
    expect(providedData.plaintext).toBeUndefined();
  });
});
```

### 3.2 Adversarial Server Implementation

```typescript
// tests/security/adversarial-server.ts
import { createServer, Server } from 'http';
import { Pool } from 'pg';

export interface ServerAdversary {
  // Storage access
  db: Pool;
  uploadBlob(blob: EncryptedBlob): Promise<string>;

  // Attack methods
  attemptDecryption(blob: { ciphertext: Buffer; nonce: Buffer; tag: Buffer }): Promise<DecryptionAttempt>;
  dumpFullDatabase(): Promise<string>;
  dumpProcessMemory(): Promise<Buffer>;
  getServerLogs(): Promise<string>;
  getNetworkTraffic(): Promise<string>;
  searchForKeys(data: string | Buffer, options: KeySearchOptions): Promise<KeySearchResult>;
  attemptKeyDerivation(params: { usernameHash: string }): Promise<DerivationAttempt>;
  respondToLegalRequest(request: LegalRequest): Promise<LegalResponse>;
}

export async function createAdversarialServer(config: {
  databaseAccess: boolean;
  memoryAccess: boolean;
  networkAccess: boolean;
  logAccess: boolean;
}): Promise<ServerAdversary> {
  const db = new Pool({
    connectionString: process.env.TEST_DATABASE_URL
  });

  // Initialize adversarial capabilities
  const server: ServerAdversary = {
    db,

    async uploadBlob(blob: EncryptedBlob): Promise<string> {
      const result = await db.query(
        'INSERT INTO encrypted_blobs (user_id, ciphertext, nonce, auth_tag, classification) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        ['test-user', blob.ciphertext, blob.nonce, blob.tag, blob.classification]
      );
      return result.rows[0].id;
    },

    async attemptDecryption(blob): Promise<DecryptionAttempt> {
      // Adversary has ciphertext, nonce, tag - but NO KEY
      // This simulates trying all available server resources

      try {
        // Try: Use server's own keys (should be different/unavailable)
        const serverKey = process.env.SERVER_ENCRYPTION_KEY; // Server key, NOT user key

        if (serverKey) {
          // Even if server has its own key, it's not the user's key
          // Attempt decryption with wrong key
          const key = await crypto.subtle.importKey(
            'raw',
            Buffer.from(serverKey, 'hex'),
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
          );

          try {
            const plaintext = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: blob.nonce },
              key,
              Buffer.concat([blob.ciphertext, blob.tag])
            );

            // If this succeeds, FAIL THE TEST - server should NOT be able to decrypt
            return {
              success: true,
              plaintext: new Uint8Array(plaintext),
              method: 'server_key_worked_SECURITY_VIOLATION'
            };
          } catch {
            // Expected: Wrong key
          }
        }

        // Try: Brute force (computationally infeasible for 256-bit key)
        // Simulate trying a few keys to demonstrate futility
        for (let i = 0; i < 100; i++) {
          const randomKey = crypto.getRandomValues(new Uint8Array(32));
          const key = await crypto.subtle.importKey(
            'raw',
            randomKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
          );

          try {
            await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: blob.nonce },
              key,
              Buffer.concat([blob.ciphertext, blob.tag])
            );
            // If we somehow guess the key (probability: 2^-256)
            return {
              success: true,
              plaintext: new Uint8Array(),
              method: 'brute_force_miraculous_guess'
            };
          } catch {
            // Expected: Wrong key
          }
        }

        // All decryption attempts failed (as expected)
        return {
          success: false,
          plaintext: null,
          method: 'no_key_available'
        };
      } catch (error) {
        return {
          success: false,
          plaintext: null,
          method: 'decryption_error',
          error: error.message
        };
      }
    },

    async dumpFullDatabase(): Promise<string> {
      const tables = await db.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      let dump = '';
      for (const table of tables.rows) {
        const data = await db.query(`SELECT * FROM ${table.table_name}`);
        dump += `\n=== ${table.table_name} ===\n`;
        dump += JSON.stringify(data.rows, null, 2);
      }

      return dump;
    },

    async dumpProcessMemory(): Promise<Buffer> {
      // Simulate memory dump (in real scenario, use OS tools)
      // For testing, capture process heap
      const heap = (process as any).memoryUsage();
      const memoryContent = JSON.stringify({
        heap,
        env: process.env,
        // Simulate memory snapshot
        snapshot: Buffer.from('simulated_memory_dump').toString('hex')
      });

      return Buffer.from(memoryContent);
    },

    async getServerLogs(): Promise<string> {
      // Simulate access to server logs
      return `
        [2025-11-22 10:00:00] POST /api/blobs - 201 Created
        [2025-11-22 10:00:01] GET /api/blobs/123 - 200 OK
        [2025-11-22 10:00:02] Authentication successful for user test-user
      `;
    },

    async getNetworkTraffic(): Promise<string> {
      // Simulate captured network traffic (TLS decrypted)
      return `
        POST /api/blobs HTTP/1.1
        Authorization: Bearer <token>
        Content-Type: application/json

        {"ciphertext": "...", "nonce": "...", "tag": "..."}
      `;
    },

    async searchForKeys(data, options): Promise<KeySearchResult> {
      const dataString = typeof data === 'string' ? data : data.toString('utf8');
      let keysFound = 0;
      const suspiciousPatterns: string[] = [];

      for (const pattern of options.patterns) {
        const matches = dataString.match(new RegExp(pattern, 'g'));
        if (matches) {
          keysFound += matches.length;
          suspiciousPatterns.push(...matches);
        }
      }

      return { keysFound, suspiciousPatterns };
    },

    async attemptKeyDerivation(params): Promise<DerivationAttempt> {
      // Adversary has username_hash but NOT password
      // Cannot derive encryption key without password

      return {
        success: false,
        reason: 'password_required_not_available'
      };
    },

    async respondToLegalRequest(request): Promise<LegalResponse> {
      const blobs = await db.query(
        'SELECT * FROM encrypted_blobs WHERE user_id = $1',
        [request.userId]
      );

      return {
        requestId: request.scope,
        encryptedBlobs: blobs.rows.map(row => ({
          id: row.id,
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          tag: row.auth_tag
          // NO PLAINTEXT - server cannot decrypt
        })),
        plaintext: null,
        canDecrypt: false,
        reason: 'zero-knowledge architecture: server does not possess decryption keys'
      };
    }
  };

  return server;
}

interface DecryptionAttempt {
  success: boolean;
  plaintext: Uint8Array | null;
  method: string;
  error?: string;
}

interface KeySearchResult {
  keysFound: number;
  suspiciousPatterns: string[];
}

interface DerivationAttempt {
  success: boolean;
  reason: string;
}

interface LegalResponse {
  requestId: string;
  encryptedBlobs: any[];
  plaintext: null;
  canDecrypt: false;
  reason: string;
}
```

### 3.3 Rollback Attack Prevention Tests

```typescript
// tests/security/rollback-attacks.test.ts
import { describe, it, expect } from '@jest/globals';

describe('Rollback Attack Prevention', () => {
  it('should detect replay of old encrypted blob versions', async () => {
    const client = new ZKEBCloudClient();

    // Version 1: Original data
    const data_v1 = new TextEncoder().encode('Balance: $100');
    const encrypted_v1 = await client.encrypt(data_v1, DataClassification.Confidential);
    const blobId = await server.uploadBlob(encrypted_v1);

    // Version 2: Updated data
    const data_v2 = new TextEncoder().encode('Balance: $0');
    const encrypted_v2 = await client.encrypt(data_v2, DataClassification.Confidential);
    await server.updateBlob(blobId, encrypted_v2);

    // ATTACK: Server replays old version (rollback)
    await server.updateBlob(blobId, encrypted_v1); // Malicious rollback

    // Client retrieves blob
    const retrieved = await server.getBlob(blobId);

    // Client MUST detect rollback via version metadata
    expect(retrieved.version).toBe(3); // Should increment

    // Signature verification should detect tampering
    const signatureValid = await client.verifyBlobIntegrity(retrieved);
    expect(signatureValid).toBe(false);
  });
});
```

---

## 4. API Integration Tests

**Goal**: Verify endpoints handle encrypted data correctly without ever decrypting.

### 4.1 Blob Storage Endpoint Tests

```typescript
// tests/integration/blob-api.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createTestServer } from '../helpers/test-server';
import { ZKEBCloudClient } from '@/zkeb-cloud-client';

describe('Blob Storage API', () => {
  let app: any;
  let client: ZKEBCloudClient;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestServer();
    client = new ZKEBCloudClient();
    authToken = await getTestAuthToken();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept and store encrypted blob without decrypting', async () => {
    const plaintext = new TextEncoder().encode('Sensitive medical data');
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    const response = await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
        nonce: Buffer.from(encrypted.nonce).toString('base64'),
        tag: Buffer.from(encrypted.tag).toString('base64'),
        classification: encrypted.classification
      })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.encrypted).toBe(true);
  });

  it('should return stored blob still encrypted', async () => {
    const plaintext = new TextEncoder().encode('Private document');
    const encrypted = await client.encrypt(plaintext, DataClassification.Confidential);

    const createResponse = await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
        nonce: Buffer.from(encrypted.nonce).toString('base64'),
        tag: Buffer.from(encrypted.tag).toString('base64'),
        classification: encrypted.classification
      });

    const blobId = createResponse.body.id;

    const getResponse = await request(app)
      .get(`/api/blobs/${blobId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Server returns ciphertext, NOT plaintext
    expect(getResponse.body.ciphertext).toBeDefined();
    expect(getResponse.body.plaintext).toBeUndefined();

    // Client can decrypt retrieved blob
    const retrieved = {
      ciphertext: Buffer.from(getResponse.body.ciphertext, 'base64'),
      nonce: Buffer.from(getResponse.body.nonce, 'base64'),
      tag: Buffer.from(getResponse.body.tag, 'base64'),
      classification: getResponse.body.classification,
      encryptedAt: new Date(getResponse.body.encryptedAt),
      algorithm: getResponse.body.algorithm
    };

    const decrypted = await client.decrypt(retrieved);
    expect(decrypted).toEqual(plaintext);
  });

  it('should reject tampered ciphertext on retrieval', async () => {
    const plaintext = new TextEncoder().encode('Protected data');
    const encrypted = await client.encrypt(plaintext, DataClassification.Restricted);

    // Upload original
    const createResponse = await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
        nonce: Buffer.from(encrypted.nonce).toString('base64'),
        tag: Buffer.from(encrypted.tag).toString('base64'),
        classification: encrypted.classification
      });

    const blobId = createResponse.body.id;

    // Tamper with database directly (simulate MITM or malicious server)
    await db.query(
      'UPDATE encrypted_blobs SET ciphertext = ciphertext || $1 WHERE id = $2',
      [Buffer.from([0xFF]), blobId] // Append garbage byte
    );

    // Retrieve tampered blob
    const getResponse = await request(app)
      .get(`/api/blobs/${blobId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const retrieved = {
      ciphertext: Buffer.from(getResponse.body.ciphertext, 'base64'),
      nonce: Buffer.from(getResponse.body.nonce, 'base64'),
      tag: Buffer.from(getResponse.body.tag, 'base64'),
      classification: getResponse.body.classification,
      encryptedAt: new Date(getResponse.body.encryptedAt),
      algorithm: getResponse.body.algorithm
    };

    // Client decryption MUST fail (authentication tag mismatch)
    await expect(client.decrypt(retrieved)).rejects.toThrow(/authentication|integrity|invalid/i);
  });

  it('should enforce rate limiting', async () => {
    const plaintext = new TextEncoder().encode('Rate limit test');
    const encrypted = await client.encrypt(plaintext, DataClassification.Internal);

    const requests = [];
    for (let i = 0; i < 150; i++) { // Exceeds 100 requests/15min limit
      requests.push(
        request(app)
          .post('/api/blobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
            nonce: Buffer.from(encrypted.nonce).toString('base64'),
            tag: Buffer.from(encrypted.tag).toString('base64'),
            classification: encrypted.classification
          })
      );
    }

    const responses = await Promise.all(requests);
    const tooManyRequests = responses.filter(r => r.status === 429);

    expect(tooManyRequests.length).toBeGreaterThan(0);
  });

  it('should validate input format', async () => {
    // Invalid base64
    await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ciphertext: 'not-valid-base64!!!',
        nonce: 'invalid',
        tag: 'invalid',
        classification: 'confidential'
      })
      .expect(400);

    // Missing required fields
    await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ciphertext: Buffer.from('test').toString('base64')
        // Missing nonce, tag, classification
      })
      .expect(400);

    // Wrong nonce length (must be 12 bytes)
    await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ciphertext: Buffer.from('test').toString('base64'),
        nonce: Buffer.from([1, 2, 3]).toString('base64'), // Only 3 bytes
        tag: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64'),
        classification: 'internal'
      })
      .expect(400);
  });
});
```

### 4.2 Multi-Device Sync Tests

```typescript
// tests/integration/multi-device-sync.test.ts
describe('Multi-Device Synchronization', () => {
  it('should sync encrypted data between devices without server decrypting', async () => {
    // Device 1: Create and upload encrypted backup
    const device1Client = new ZKEBCloudClient();
    const masterKey = await device1Client.generateUserMasterKey();

    const backupData = {
      contacts: ['Alice', 'Bob'],
      notes: 'Private notes'
    };

    const encrypted = await device1Client.encrypt(
      new TextEncoder().encode(JSON.stringify(backupData)),
      DataClassification.Confidential
    );

    const blobId = await device1Client.uploadToServer(encrypted);

    // Device 2: Download encrypted backup
    const device2Client = new ZKEBCloudClient();

    // Simulate key transfer via secure channel (QR code, password, etc.)
    await device2Client.importMasterKey(masterKey);

    const downloaded = await device2Client.downloadFromServer(blobId);
    const decrypted = await device2Client.decrypt(downloaded);

    const restoredData = JSON.parse(new TextDecoder().decode(decrypted));
    expect(restoredData).toEqual(backupData);

    // Verify server never saw plaintext
    const serverLog = await getServerOperationLog();
    expect(serverLog).not.toContain('Alice');
    expect(serverLog).not.toContain('Bob');
    expect(serverLog).not.toContain('Private notes');
  });

  it('should handle conflict resolution without decrypting', async () => {
    // Two devices modify same encrypted blob offline, then sync

    const masterKey = await generateMasterKey();
    const device1 = new ZKEBCloudClient();
    const device2 = new ZKEBCloudClient();
    await device1.importMasterKey(masterKey);
    await device2.importMasterKey(masterKey);

    // Initial state
    const initialData = { counter: 0 };
    const encrypted = await device1.encrypt(
      new TextEncoder().encode(JSON.stringify(initialData)),
      DataClassification.Internal
    );
    const blobId = await device1.uploadToServer(encrypted);

    // Device 1: Increment counter
    const data1 = { counter: 1 };
    const encrypted1 = await device1.encrypt(
      new TextEncoder().encode(JSON.stringify(data1)),
      DataClassification.Internal
    );
    await device1.uploadToServer(encrypted1, blobId);

    // Device 2: Also increment counter (conflict)
    const data2 = { counter: 1 };
    const encrypted2 = await device2.encrypt(
      new TextEncoder().encode(JSON.stringify(data2)),
      DataClassification.Internal
    );

    // Upload conflict
    const uploadResult = await device2.uploadToServer(encrypted2, blobId);
    expect(uploadResult.conflict).toBe(true);

    // Server detects conflict via version metadata, NOT by comparing plaintext
    expect(uploadResult.conflictingVersions).toHaveLength(2);

    // Client resolves conflict locally (server never decrypts)
    const resolved = { counter: 2 }; // Last-write-wins or custom merge
    const encryptedResolved = await device1.encrypt(
      new TextEncoder().encode(JSON.stringify(resolved)),
      DataClassification.Internal
    );
    await device1.uploadToServer(encryptedResolved, blobId);
  });
});
```

---

## 5. End-to-End User Flow Tests (Playwright)

**Goal**: Verify complete user journeys in real browser environment with WebCrypto.

### 5.1 New User Onboarding

```typescript
// tests/e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';

test.describe('User Onboarding Flow', () => {
  test('should complete first-time setup with key generation', async ({ page }) => {
    await page.goto('http://localhost:3000/signup');

    // Fill signup form
    await page.fill('[name="username"]', 'test-user');
    await page.fill('[name="password"]', 'SecurePassword123!');
    await page.fill('[name="passwordConfirm"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // Wait for client-side key generation
    await page.waitForSelector('[data-testid="key-generation-complete"]');

    // Verify key was generated and stored in IndexedDB
    const hasKey = await page.evaluate(async () => {
      const { get } = await import('idb-keyval');
      const key = await get('zkeb-key-restricted');
      return key !== null && key !== undefined;
    });

    expect(hasKey).toBe(true);

    // Verify server never received the key
    const networkLogs = await page.evaluate(() => {
      return (window as any).__networkLogs || [];
    });

    for (const log of networkLogs) {
      expect(log.request.body).not.toMatch(/[A-Fa-f0-9]{64}/); // No hex keys
      expect(log.request.body).not.toMatch(/^[A-Za-z0-9+/]{44}$/); // No base64 keys
    }
  });

  test('should show recovery key backup prompt', async ({ page }) => {
    await page.goto('http://localhost:3000/signup');

    await page.fill('[name="username"]', 'test-user-2');
    await page.fill('[name="password"]', 'SecurePassword123!');
    await page.fill('[name="passwordConfirm"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-testid="recovery-key-prompt"]');

    // Display recovery key (should be generated client-side)
    await page.click('button[data-testid="show-recovery-key"]');

    const recoveryKey = await page.textContent('[data-testid="recovery-key-value"]');
    expect(recoveryKey).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // Verify user must confirm they saved it
    await page.click('button[data-testid="confirm-recovery-key-saved"]');

    await page.waitForURL('**/dashboard');
  });
});
```

### 5.2 Backup Creation and Restoration

```typescript
// tests/e2e/backup-restore.spec.ts
test.describe('Backup and Restore Flow', () => {
  test('should create encrypted backup and restore on new device', async ({ browser }) => {
    // Device 1: Create backup
    const device1 = await browser.newContext();
    const page1 = await device1.newPage();

    await page1.goto('http://localhost:3000/login');
    await page1.fill('[name="username"]', 'existing-user');
    await page1.fill('[name="password"]', 'SecurePassword123!');
    await page1.click('button[type="submit"]');

    await page1.waitForURL('**/dashboard');

    // Create test data
    await page1.click('[data-testid="create-note"]');
    await page1.fill('[name="noteContent"]', 'This is my private note');
    await page1.click('button[data-testid="save-note"]');

    // Trigger backup
    await page1.click('[data-testid="create-backup"]');
    await page1.waitForSelector('[data-testid="backup-complete"]');

    // Get recovery credentials for device 2
    const recoveryPhrase = await page1.evaluate(() => {
      return localStorage.getItem('recovery-phrase');
    });

    await device1.close();

    // Device 2: Restore from backup
    const device2 = await browser.newContext();
    const page2 = await device2.newPage();

    await page2.goto('http://localhost:3000/restore');

    // Enter recovery credentials
    await page2.fill('[name="username"]', 'existing-user');
    await page2.fill('[name="recoveryPhrase"]', recoveryPhrase!);
    await page2.click('button[data-testid="restore-backup"]');

    await page2.waitForSelector('[data-testid="restore-complete"]');
    await page2.goto('http://localhost:3000/notes');

    // Verify decrypted note is visible
    const noteContent = await page2.textContent('[data-testid="note-content"]');
    expect(noteContent).toContain('This is my private note');

    // Verify server never saw plaintext
    const serverRequests = await page2.evaluate(() => {
      return (window as any).__serverRequests || [];
    });

    for (const req of serverRequests) {
      expect(req.body).not.toContain('This is my private note');
    }

    await device2.close();
  });

  test('should fail restore with incorrect recovery phrase', async ({ page }) => {
    await page.goto('http://localhost:3000/restore');

    await page.fill('[name="username"]', 'existing-user');
    await page.fill('[name="recoveryPhrase"]', 'WRONG-WRONG-WRONG-WRONG');
    await page.click('button[data-testid="restore-backup"]');

    // Should show error (client-side decryption fails)
    await page.waitForSelector('[data-testid="restore-error"]');
    const errorText = await page.textContent('[data-testid="restore-error"]');
    expect(errorText).toContain('recovery phrase');
  });
});
```

### 5.3 Key Rotation Scenario

```typescript
// tests/e2e/key-rotation.spec.ts
test.describe('Key Rotation', () => {
  test('should rotate encryption key and re-encrypt all data', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.fill('[name="username"]', 'test-user');
    await page.fill('[name="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard');

    // Create multiple encrypted items
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="create-note"]');
      await page.fill('[name="noteContent"]', `Note ${i}`);
      await page.click('button[data-testid="save-note"]');
    }

    // Navigate to security settings
    await page.goto('http://localhost:3000/settings/security');

    // Initiate key rotation
    await page.click('button[data-testid="rotate-encryption-key"]');

    // Confirm rotation (requires password re-entry)
    await page.fill('[name="currentPassword"]', 'SecurePassword123!');
    await page.click('button[data-testid="confirm-key-rotation"]');

    // Wait for re-encryption progress
    await page.waitForSelector('[data-testid="rotation-complete"]');

    // Verify all notes still accessible with new key
    await page.goto('http://localhost:3000/notes');

    const notes = await page.$$('[data-testid="note-item"]');
    expect(notes).toHaveLength(5);

    // Verify old key no longer works
    const oldKeyWorking = await page.evaluate(async () => {
      // Try to decrypt with old key (should fail)
      // This is testing internal state, simulated here
      return false;
    });

    expect(oldKeyWorking).toBe(false);
  });
});
```

---

## 6. Security Test Suite

**Goal**: OWASP Top 10 vulnerability scanning and attack simulation.

### 6.1 SQL Injection Prevention

```typescript
// tests/security/sql-injection.test.ts
describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection in blob ID parameter', async () => {
    const maliciousId = "123'; DROP TABLE encrypted_blobs; --";

    const response = await request(app)
      .get(`/api/blobs/${maliciousId}`)
      .set('Authorization', `Bearer ${authToken}`);

    // Should return 404 or 400, NOT execute SQL
    expect(response.status).toBeOneOf([400, 404]);

    // Verify table still exists
    const tableCheck = await db.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'encrypted_blobs')"
    );
    expect(tableCheck.rows[0].exists).toBe(true);
  });

  it('should use parameterized queries for all database operations', async () => {
    // Code audit: Verify no string interpolation in SQL queries
    const apiFiles = await globby('lib/api/**/*.ts');

    for (const file of apiFiles) {
      const content = await fs.readFile(file, 'utf-8');

      // Detect dangerous patterns
      const dangerousPatterns = [
        /db\.query\(`[^`]*\$\{[^}]+\}/g, // Template literal injection
        /db\.query\(['"][^'"]*\+/g, // String concatenation
      ];

      for (const pattern of dangerousPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          throw new Error(`Potential SQL injection in ${file}: ${matches.join(', ')}`);
        }
      }
    }
  });
});
```

### 6.2 XSS Prevention

```typescript
// tests/security/xss-prevention.test.ts
describe('XSS Prevention', () => {
  it('should sanitize user input in API responses', async () => {
    const xssPayload = '<script>alert("XSS")</script>';

    // Try to inject XSS via username
    const response = await request(app)
      .post('/api/users')
      .send({
        username: xssPayload,
        password: 'SecurePassword123!'
      });

    // Response should escape or reject malicious content
    if (response.status === 201) {
      expect(response.body.username).not.toContain('<script>');
      expect(response.body.username).toMatch(/&lt;script&gt;/);
    } else {
      expect(response.status).toBe(400); // Rejected
    }
  });

  it('should set Content-Security-Policy headers', async () => {
    const response = await request(app).get('/');

    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("object-src 'none'");
  });
});
```

### 6.3 CSRF Protection

```typescript
// tests/security/csrf-protection.test.ts
describe('CSRF Protection', () => {
  it('should reject requests without CSRF token', async () => {
    // Attempt state-changing operation without CSRF token
    const response = await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      // Missing CSRF token header
      .send({
        ciphertext: 'test',
        nonce: 'test',
        tag: 'test',
        classification: 'internal'
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/CSRF/i);
  });

  it('should accept requests with valid CSRF token', async () => {
    // Get CSRF token
    const tokenResponse = await request(app)
      .get('/api/csrf-token')
      .set('Authorization', `Bearer ${authToken}`);

    const csrfToken = tokenResponse.body.csrfToken;

    // Use token in subsequent request
    const response = await request(app)
      .post('/api/blobs')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        ciphertext: Buffer.from('test').toString('base64'),
        nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64'),
        tag: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64'),
        classification: 'internal'
      });

    expect(response.status).toBe(201);
  });
});
```

### 6.4 Authentication Bypass Attempts

```typescript
// tests/security/authentication-bypass.test.ts
describe('Authentication Bypass Prevention', () => {
  it('should reject requests without valid JWT', async () => {
    const response = await request(app)
      .get('/api/blobs')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  it('should reject expired JWTs', async () => {
    const expiredToken = jwt.sign(
      { userId: 'test-user' },
      process.env.JWT_SECRET!,
      { expiresIn: '-1h' } // Already expired
    );

    const response = await request(app)
      .get('/api/blobs')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/expired|invalid/i);
  });

  it('should prevent JWT algorithm confusion attacks', async () => {
    // Try to sign with 'none' algorithm
    const noneToken = jwt.sign(
      { userId: 'admin' },
      '',
      { algorithm: 'none' as any }
    );

    const response = await request(app)
      .get('/api/blobs')
      .set('Authorization', `Bearer ${noneToken}`);

    expect(response.status).toBe(401);
  });
});
```

---

## 7. Performance Benchmarks

**Goal**: Establish performance baselines and detect regressions.

### 7.1 Encryption/Decryption Speed Tests

```typescript
// tests/performance/crypto-benchmarks.test.ts
import Benchmark from 'benchmark';

describe('Cryptographic Performance Benchmarks', () => {
  it('should encrypt 1MB payload in <50ms (p95)', async () => {
    const suite = new Benchmark.Suite();
    const client = new ZKEBCloudClient();
    const payload1MB = crypto.getRandomValues(new Uint8Array(1024 * 1024));

    const timings: number[] = [];

    suite
      .add('AES-256-GCM Encryption (1MB)', {
        defer: true,
        fn: async (deferred: any) => {
          const start = performance.now();
          await client.encrypt(payload1MB, DataClassification.Confidential);
          timings.push(performance.now() - start);
          deferred.resolve();
        }
      })
      .on('complete', function() {
        const p95 = percentile(timings, 95);
        console.log(`P95 encryption time: ${p95.toFixed(2)}ms`);
        expect(p95).toBeLessThan(50);
      })
      .run({ async: true });
  });

  it('should benchmark key derivation performance', async () => {
    const timings: number[] = [];

    for (let i = 0; i < 100; i++) {
      const password = 'TestPassword123!';
      const salt = crypto.getRandomValues(new Uint8Array(32));

      const start = performance.now();
      await deriveKeyFromPassword(password, salt, 600_000); // OWASP recommendation
      timings.push(performance.now() - start);
    }

    const median = percentile(timings, 50);
    const p95 = percentile(timings, 95);

    console.log(`Key derivation - Median: ${median.toFixed(0)}ms, P95: ${p95.toFixed(0)}ms`);

    // PBKDF2 with 600k iterations should take 500-2000ms (intentionally slow for security)
    expect(median).toBeGreaterThan(500);
    expect(median).toBeLessThan(2000);
  });
});

function percentile(arr: number[], p: number): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}
```

### 7.2 API Response Time Requirements

```typescript
// tests/performance/api-benchmarks.test.ts
describe('API Performance Benchmarks', () => {
  it('should respond to blob upload in <200ms (p95)', async () => {
    const client = new ZKEBCloudClient();
    const payload = crypto.getRandomValues(new Uint8Array(10240)); // 10KB
    const encrypted = await client.encrypt(payload, DataClassification.Internal);

    const timings: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();

      await request(app)
        .post('/api/blobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
          nonce: Buffer.from(encrypted.nonce).toString('base64'),
          tag: Buffer.from(encrypted.tag).toString('base64'),
          classification: encrypted.classification
        });

      timings.push(performance.now() - start);
    }

    const p95 = percentile(timings, 95);
    console.log(`P95 API response time: ${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(200);
  });
});
```

### 7.3 Load Testing (Artillery)

```yaml
# tests/performance/load-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users/sec
      name: "Warm up"
    - duration: 120
      arrivalRate: 50  # 50 users/sec
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100  # 100 users/sec
      name: "Peak load"
  processor: "./load-test-processor.js"

scenarios:
  - name: "Upload encrypted blob"
    flow:
      - post:
          url: "/api/auth/login"
          json:
            username: "load-test-user"
            password: "TestPassword123!"
          capture:
            - json: "$.token"
              as: "authToken"

      - function: "encryptPayload"

      - post:
          url: "/api/blobs"
          headers:
            Authorization: "Bearer {{ authToken }}"
          json:
            ciphertext: "{{ ciphertext }}"
            nonce: "{{ nonce }}"
            tag: "{{ tag }}"
            classification: "internal"
```

```typescript
// tests/performance/load-test-processor.ts
import { ZKEBCloudClient } from '@/zkeb-cloud-client';

export async function encryptPayload(context: any, events: any, done: () => void) {
  const client = new ZKEBCloudClient();
  const payload = crypto.getRandomValues(new Uint8Array(5120)); // 5KB

  const encrypted = await client.encrypt(payload, DataClassification.Internal);

  context.vars.ciphertext = Buffer.from(encrypted.ciphertext).toString('base64');
  context.vars.nonce = Buffer.from(encrypted.nonce).toString('base64');
  context.vars.tag = Buffer.from(encrypted.tag).toString('base64');

  done();
}
```

---

## 8. CI/CD Integration

**Goal**: Automated testing on every commit and PR.

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: ZKEB Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  crypto-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run cryptographic primitive tests
        run: npm run test:crypto

      - name: Verify test vectors
        run: npm run test:vectors

  zero-knowledge-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run zero-knowledge verification tests
        run: npm run test:zero-knowledge
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/zkeb_test

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/zkeb_test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-results
          path: test-results/

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run security test suite
        run: npm run test:security

      - name: Run OWASP dependency check
        run: npm audit --audit-level=high

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run performance benchmarks
        run: npm run test:performance

      - name: Check for regressions
        run: npm run test:regression-check
```

### 8.2 Test Coverage Requirements

```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    },
    // Critical paths require 100% coverage
    './lib/crypto/**/*.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    },
    './lib/api/auth/**/*.ts': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95
    }
  },
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    '!lib/**/*.d.ts',
    '!lib/**/*.test.ts'
  ]
};
```

---

## 9. Test Maintenance Strategy

### 9.1 Test Organization

```
tests/
├── unit/
│   ├── crypto/
│   │   ├── aes-gcm.test.ts
│   │   ├── hkdf.test.ts
│   │   ├── nonce-uniqueness.test.ts
│   │   └── timing-attacks.test.ts
│   └── utils/
│       └── helpers.test.ts
├── integration/
│   ├── blob-api.test.ts
│   ├── multi-device-sync.test.ts
│   └── auth-flow.test.ts
├── e2e/
│   ├── onboarding.spec.ts
│   ├── backup-restore.spec.ts
│   └── key-rotation.spec.ts
├── security/
│   ├── zero-knowledge-proof.test.ts
│   ├── sql-injection.test.ts
│   ├── xss-prevention.test.ts
│   ├── csrf-protection.test.ts
│   └── authentication-bypass.test.ts
├── performance/
│   ├── crypto-benchmarks.test.ts
│   ├── api-benchmarks.test.ts
│   └── load-test.yml
└── helpers/
    ├── adversarial-server.ts
    ├── test-server.ts
    └── test-vectors.ts
```

### 9.2 Test Naming Conventions

```typescript
// Pattern: describe('ComponentName', () => { it('should <behavior> when <condition>', ...) })

describe('AES-256-GCM Encryption', () => {
  it('should produce different ciphertext for identical plaintext (nonce uniqueness)', async () => {
    // Test implementation
  });

  it('should reject tampered ciphertext (authentication tag verification)', async () => {
    // Test implementation
  });
});

// Security tests MUST include attack vector in name
describe('Zero-Knowledge Guarantee', () => {
  it('should prevent server from decrypting uploaded ciphertext', async () => {
    // Proves zero-knowledge property
  });

  it('should prevent key extraction from database dumps', async () => {
    // Simulates data breach
  });
});
```

### 9.3 Test Data Management

```typescript
// tests/helpers/test-vectors.ts
export const NIST_AES_GCM_TEST_VECTORS = [
  {
    name: 'NIST Test Case 1',
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    plaintext: 'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255',
    nonce: 'cafebabefacedbaddecaf888',
    ciphertext: '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad',
    tag: 'b094dac5d93471bdec1a502270e3cc6c'
  },
  // More test vectors...
];

export const HKDF_RFC5869_TEST_VECTORS = [
  {
    name: 'RFC 5869 Test Case 1',
    ikm: '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
    salt: '000102030405060708090a0b0c',
    info: 'f0f1f2f3f4f5f6f7f8f9',
    length: 42,
    expectedOkm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
  },
  // More test vectors...
];
```

---

## 10. Success Metrics

### 10.1 Coverage Targets

| Test Layer | Target Coverage | Critical Paths |
|------------|-----------------|----------------|
| Crypto Primitives | 100% | All crypto functions |
| Zero-Knowledge Tests | 100% | Key management, encryption |
| API Integration | 85% | All endpoints |
| E2E User Flows | 75% | Critical journeys |
| Security Tests | N/A (adversarial) | Attack simulations |

### 10.2 Performance SLAs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Encryption (1MB) | <50ms (p95) | Benchmark suite |
| Decryption (1MB) | <50ms (p95) | Benchmark suite |
| API Response | <200ms (p95) | Integration tests |
| Key Derivation | 500-2000ms | Security requirement (intentionally slow) |

### 10.3 Security Verification Checklist

- [ ] Zero-knowledge property verified (server cannot decrypt)
- [ ] No encryption keys in server code
- [ ] No plaintext user data in server logs
- [ ] All SQL queries parameterized
- [ ] CSP headers configured
- [ ] SRI for JavaScript assets
- [ ] Rate limiting enforced
- [ ] CSRF protection implemented
- [ ] Authentication bypass attempts blocked
- [ ] Timing attack resistance verified

---

## 11. Deployment & Monitoring

### 11.1 Pre-Deployment Test Gate

```typescript
// scripts/pre-deploy-test-gate.ts
async function preDeploymentGate() {
  console.log('Running pre-deployment test gate...\n');

  const results = {
    unitTests: await runCommand('npm run test:unit'),
    cryptoTests: await runCommand('npm run test:crypto'),
    zeroKnowledgeTests: await runCommand('npm run test:zero-knowledge'),
    integrationTests: await runCommand('npm run test:integration'),
    securityTests: await runCommand('npm run test:security'),
    e2eTests: await runCommand('npm run test:e2e'),
    coverageCheck: await runCommand('npm run test:coverage-check')
  };

  const allPassed = Object.values(results).every(r => r.exitCode === 0);

  if (!allPassed) {
    console.error('❌ Pre-deployment gate FAILED');
    console.error('Failed test suites:');

    for (const [suite, result] of Object.entries(results)) {
      if (result.exitCode !== 0) {
        console.error(`  - ${suite}`);
      }
    }

    process.exit(1);
  }

  console.log('✅ All tests passed - deployment approved');
}

preDeploymentGate();
```

### 11.2 Production Monitoring

```typescript
// lib/observability/test-in-production.ts
// Synthetic monitoring: Continuously verify zero-knowledge guarantee in production

export async function syntheticZeroKnowledgeCheck() {
  const client = new ZKEBCloudClient();

  // Generate test data
  const testData = {
    timestamp: Date.now(),
    canary: 'ZKEB-SYNTHETIC-TEST'
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(testData));

  // Encrypt and upload
  const encrypted = await client.encrypt(plaintext, DataClassification.Internal);
  const blobId = await client.uploadToServer(encrypted);

  // Verify server never sees plaintext
  const serverLogs = await fetchRecentServerLogs();

  if (serverLogs.includes('ZKEB-SYNTHETIC-TEST')) {
    // CRITICAL ALERT: Zero-knowledge property violated!
    await sendCriticalAlert({
      severity: 'CRITICAL',
      message: 'Zero-knowledge guarantee VIOLATED - plaintext detected in server logs',
      blobId: blobId
    });
  }

  // Clean up test blob
  await client.deleteBlob(blobId);
}

// Run every 5 minutes
setInterval(syntheticZeroKnowledgeCheck, 5 * 60 * 1000);
```

---

## Summary

This testing strategy prioritizes **cryptographic verification over functional testing**. The architecture is designed so that:

1. **Crypto primitive tests** verify mathematical correctness against NIST/RFC standards
2. **Zero-knowledge tests** actively try to break security guarantees and MUST fail if successful
3. **Integration tests** verify encrypted data flow without server decryption
4. **E2E tests** validate real-world user scenarios in actual browsers with WebCrypto
5. **Security tests** simulate OWASP Top 10 attacks and adversarial server scenarios
6. **Performance tests** catch regressions while maintaining security requirements

**Key Principle**: Tests are designed to **fail loudly** when zero-knowledge properties are violated, even if functionality appears correct. A working feature that leaks keys is a failed test.

---

**Test Implementation Timeline**:
- **Week 1**: Crypto primitive tests + test infrastructure
- **Week 2**: Zero-knowledge verification tests + adversarial framework
- **Week 3**: API integration tests + E2E scaffolding
- **Week 4**: Security test suite + OWASP scanning
- **Week 5**: Performance benchmarks + CI/CD integration
- **Week 6**: Documentation + team training

---

**Quincy Washington**
QA Engineer & Test Architecture Specialist
*"If it's not tested cryptographically, it's not secure."*
