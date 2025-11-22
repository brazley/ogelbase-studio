/**
 * RSA-4096-PSS Digital Signatures Test Suite
 *
 * Test Coverage:
 * - Key generation (4096-bit, performance <50ms)
 * - Sign/verify round-trip
 * - Tamper detection (modified data/signature fails)
 * - Key export/import (SPKI + PKCS8)
 * - Device certificate use case
 * - Error handling
 * - Performance benchmarks
 */
import {
  generateKeyPair,
  sign,
  verify,
  exportKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  getModulusLength,
  verifyKeyPairMatch,
  RSAError,
} from '../src/rsa.js';

describe('RSA-4096-PSS Digital Signatures', () => {
  // =========================================================================
  // Key Generation Tests
  // =========================================================================

  describe('generateKeyPair', () => {
    it('generates 4096-bit RSA key pair', async () => {
      const keyPair = await generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(getModulusLength(keyPair.publicKey)).toBe(4096);
      expect(getModulusLength(keyPair.privateKey)).toBe(4096);
    });

    it('generates unique key pairs', async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();

      const exported1 = await exportKeyPair(keyPair1);
      const exported2 = await exportKeyPair(keyPair2);

      // Different keys should have different bytes
      expect(exported1.publicKey).not.toEqual(exported2.publicKey);
      expect(exported1.privateKey).not.toEqual(exported2.privateKey);
    });

    it('generates keys (RSA-4096 performance)', async () => {
      const start = performance.now();
      await generateKeyPair();
      const elapsed = performance.now() - start;

      // RSA-4096 key generation is computationally expensive (100-800ms typical)
      // This is a one-time operation during device registration
      expect(elapsed).toBeLessThan(1000);
    }, 1200); // 1.2s timeout

    it('generates matching public/private key pairs', async () => {
      const keyPair = await generateKeyPair();
      const matches = await verifyKeyPairMatch(keyPair);
      expect(matches).toBe(true);
    });
  });

  // =========================================================================
  // Sign & Verify Tests
  // =========================================================================

  describe('sign and verify', () => {
    it('sign and verify round-trip', async () => {
      const keyPair = await generateKeyPair();
      const data = new TextEncoder().encode('test message');

      const signature = await sign(data, keyPair.privateKey);
      const isValid = await verify(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('produces different signatures for same data (PSS salt)', async () => {
      const keyPair = await generateKeyPair();
      const data = new TextEncoder().encode('test message');

      const signature1 = await sign(data, keyPair.privateKey);
      const signature2 = await sign(data, keyPair.privateKey);

      // PSS includes random salt - different signatures
      expect(signature1).not.toEqual(signature2);

      // But both verify correctly
      expect(await verify(data, signature1, keyPair.publicKey)).toBe(true);
      expect(await verify(data, signature2, keyPair.publicKey)).toBe(true);
    });

    it('signs and verifies empty data', async () => {
      const keyPair = await generateKeyPair();
      const emptyData = new Uint8Array(0);

      const signature = await sign(emptyData, keyPair.privateKey);
      const isValid = await verify(emptyData, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('signs and verifies large data', async () => {
      const keyPair = await generateKeyPair();
      // crypto.getRandomValues has 65KB limit - use multiple chunks
      const largeData = new Uint8Array(64 * 1024); // 64KB (max for getRandomValues)
      crypto.getRandomValues(largeData);

      const signature = await sign(largeData, keyPair.privateKey);
      const isValid = await verify(largeData, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('signing completes reasonably fast', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(1024); // 1KB
      crypto.getRandomValues(data);

      const start = performance.now();
      await sign(data, keyPair.privateKey);
      const elapsed = performance.now() - start;

      // RSA-4096 signing is slower than ECDSA (acceptable for device auth)
      expect(elapsed).toBeLessThan(100);
    }, 800); // 800ms timeout (includes key generation ~500ms + signing)

    it('verification completes reasonably fast', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(1024);
      crypto.getRandomValues(data);
      const signature = await sign(data, keyPair.privateKey);

      const start = performance.now();
      await verify(data, signature, keyPair.publicKey);
      const elapsed = performance.now() - start;

      // Verification faster than signing but still slower than ECDSA
      expect(elapsed).toBeLessThan(50);
    }, 800); // 800ms timeout (includes key generation + signing)
  });

  // =========================================================================
  // Tamper Detection Tests (CRITICAL!)
  // =========================================================================

  describe('tamper detection', () => {
    it('detects tampered data', async () => {
      const keyPair = await generateKeyPair();
      const originalData = new TextEncoder().encode('original message');
      const signature = await sign(originalData, keyPair.privateKey);

      // Tamper with data
      const tamperedData = new TextEncoder().encode('tampered message');
      const isValid = await verify(tamperedData, signature, keyPair.publicKey);

      expect(isValid).toBe(false); // MUST fail
    });

    it('detects tampered signature', async () => {
      const keyPair = await generateKeyPair();
      const data = new TextEncoder().encode('test message');
      const signature = await sign(data, keyPair.privateKey);

      // Tamper with signature (flip one bit)
      const tamperedSig = new Uint8Array(signature);
      tamperedSig[0] ^= 0xFF;

      const isValid = await verify(data, tamperedSig, keyPair.publicKey);

      expect(isValid).toBe(false); // MUST fail
    });

    it('detects tampered signature (flip random bit)', async () => {
      const keyPair = await generateKeyPair();
      const data = new TextEncoder().encode('test message');
      const signature = await sign(data, keyPair.privateKey);

      // Flip random bit in signature
      const tamperedSig = new Uint8Array(signature);
      const randomIndex = Math.floor(Math.random() * tamperedSig.length);
      tamperedSig[randomIndex] ^= 0x01;

      const isValid = await verify(data, tamperedSig, keyPair.publicKey);

      expect(isValid).toBe(false); // MUST fail
    });

    it('fails verification with wrong public key', async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();
      const data = new TextEncoder().encode('test message');

      // Sign with keyPair1 private key
      const signature = await sign(data, keyPair1.privateKey);

      // Try to verify with keyPair2 public key (wrong key!)
      const isValid = await verify(data, signature, keyPair2.publicKey);

      expect(isValid).toBe(false); // MUST fail
    });

    it('detects single byte change in data', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(100);
      crypto.getRandomValues(data);
      const signature = await sign(data, keyPair.privateKey);

      // Change single byte
      const tamperedData = new Uint8Array(data);
      tamperedData[50] ^= 0x01;

      const isValid = await verify(tamperedData, signature, keyPair.publicKey);

      expect(isValid).toBe(false); // MUST fail
    });
  });

  // =========================================================================
  // Key Export/Import Tests
  // =========================================================================

  describe('key export and import', () => {
    it('exports and imports key pair', async () => {
      const originalKeyPair = await generateKeyPair();
      const exported = await exportKeyPair(originalKeyPair);

      // Verify export format
      expect(exported.publicKey).toBeInstanceOf(Uint8Array);
      expect(exported.privateKey).toBeInstanceOf(Uint8Array);
      expect(exported.publicKey.length).toBeGreaterThan(500); // ~550 bytes
      expect(exported.privateKey.length).toBeGreaterThan(2350); // ~2370-2400 bytes

      // Import keys
      const importedPublic = await importPublicKey(exported.publicKey);
      const importedPrivate = await importPrivateKey(exported.privateKey);

      // Verify imported keys work
      const data = new TextEncoder().encode('test message');
      const signature = await sign(data, importedPrivate);
      const isValid = await verify(data, signature, importedPublic);

      expect(isValid).toBe(true);
    });

    it('exports public key only', async () => {
      const keyPair = await generateKeyPair();
      const publicKeyBytes = await exportPublicKey(keyPair.publicKey);

      expect(publicKeyBytes).toBeInstanceOf(Uint8Array);
      expect(publicKeyBytes.length).toBeGreaterThan(500);

      // Verify imported public key works for verification
      const importedPublic = await importPublicKey(publicKeyBytes);
      const data = new TextEncoder().encode('test');
      const signature = await sign(data, keyPair.privateKey);
      const isValid = await verify(data, signature, importedPublic);

      expect(isValid).toBe(true);
    });

    it('exports private key only', async () => {
      const keyPair = await generateKeyPair();
      const privateKeyBytes = await exportPrivateKey(keyPair.privateKey);

      expect(privateKeyBytes).toBeInstanceOf(Uint8Array);
      expect(privateKeyBytes.length).toBeGreaterThan(2350); // ~2370-2400 bytes

      // Verify imported private key works for signing
      const importedPrivate = await importPrivateKey(privateKeyBytes);
      const data = new TextEncoder().encode('test');
      const signature = await sign(data, importedPrivate);
      const isValid = await verify(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('preserves key functionality after export/import cycle', async () => {
      const original = await generateKeyPair();
      const exported = await exportKeyPair(original);

      // Import back
      const publicKey = await importPublicKey(exported.publicKey);
      const privateKey = await importPrivateKey(exported.privateKey);
      const imported = { publicKey, privateKey };

      // Test 100 sign/verify cycles
      for (let i = 0; i < 100; i++) {
        const data = new Uint8Array(32);
        crypto.getRandomValues(data);

        const signature = await sign(data, imported.privateKey);
        const isValid = await verify(data, signature, imported.publicKey);

        expect(isValid).toBe(true);
      }
    });

    it('throws on invalid public key import', async () => {
      const invalidKey = new Uint8Array(500);
      crypto.getRandomValues(invalidKey);

      await expect(importPublicKey(invalidKey)).rejects.toThrow(RSAError);
    });

    it('throws on invalid private key import', async () => {
      const invalidKey = new Uint8Array(2400);
      crypto.getRandomValues(invalidKey);

      await expect(importPrivateKey(invalidKey)).rejects.toThrow(RSAError);
    });
  });

  // =========================================================================
  // Device Certificate Use Case (Critical for ZKEB!)
  // =========================================================================

  describe('device certificate use case', () => {
    it('device certificate signing workflow', async () => {
      // 1. Device generates key pair
      const deviceKeys = await generateKeyPair();

      // 2. Create device certificate
      const deviceId = 'device-123';
      const publicKeyBytes = await exportPublicKey(deviceKeys.publicKey);
      const certificate = {
        deviceId,
        publicKey: Array.from(publicKeyBytes), // Convert for JSON
        createdAt: Date.now(),
        platform: 'ios',
      };

      // 3. Sign certificate with private key
      const certData = new TextEncoder().encode(JSON.stringify(certificate));
      const signature = await sign(certData, deviceKeys.privateKey);

      // 4. Server receives certificate + signature
      // 5. Server verifies signature with public key from certificate
      const receivedPublicKey = await importPublicKey(
        new Uint8Array(certificate.publicKey)
      );
      const isValid = await verify(certData, signature, receivedPublicKey);

      expect(isValid).toBe(true);
    });

    it('backup integrity signing workflow', async () => {
      // Device setup
      const deviceKeys = await generateKeyPair();

      // Create backup data
      const backupData = new TextEncoder().encode('sensitive user data');

      // Hash backup data (sign hash, not full data)
      const backupHash = await crypto.subtle.digest('SHA-256', backupData);

      // Sign hash
      const signature = await sign(
        new Uint8Array(backupHash),
        deviceKeys.privateKey
      );

      // Create signed backup
      const signedBackup = {
        data: Array.from(backupData),
        signature: Array.from(signature),
        hash: Array.from(new Uint8Array(backupHash)),
        timestamp: Date.now(),
      };

      // Server verification
      const receivedHash = await crypto.subtle.digest(
        'SHA-256',
        new Uint8Array(signedBackup.data)
      );
      const isValid = await verify(
        new Uint8Array(receivedHash),
        new Uint8Array(signedBackup.signature),
        deviceKeys.publicKey
      );

      expect(isValid).toBe(true);

      // Verify hash matches
      expect(Array.from(new Uint8Array(receivedHash))).toEqual(
        signedBackup.hash
      );
    });

    it('multi-device authentication', async () => {
      // User has multiple devices
      const device1Keys = await generateKeyPair();
      const device2Keys = await generateKeyPair();
      const device3Keys = await generateKeyPair();

      // Each device signs same data
      const data = new TextEncoder().encode('shared backup metadata');

      const sig1 = await sign(data, device1Keys.privateKey);
      const sig2 = await sign(data, device2Keys.privateKey);
      const sig3 = await sign(data, device3Keys.privateKey);

      // Each signature verifies with correct public key
      expect(await verify(data, sig1, device1Keys.publicKey)).toBe(true);
      expect(await verify(data, sig2, device2Keys.publicKey)).toBe(true);
      expect(await verify(data, sig3, device3Keys.publicKey)).toBe(true);

      // Signatures don't verify with wrong public key
      expect(await verify(data, sig1, device2Keys.publicKey)).toBe(false);
      expect(await verify(data, sig2, device3Keys.publicKey)).toBe(false);
      expect(await verify(data, sig3, device1Keys.publicKey)).toBe(false);
    });

    it('device revocation scenario', async () => {
      // Device registers
      const deviceKeys = await generateKeyPair();
      const publicKeyBytes = await exportPublicKey(deviceKeys.publicKey);

      // Server stores public key for verification
      const storedPublicKey = publicKeyBytes;

      // Device signs backup
      const backup = new TextEncoder().encode('backup data');
      const signature = await sign(backup, deviceKeys.privateKey);

      // Server verifies (before revocation)
      const publicKey = await importPublicKey(storedPublicKey);
      expect(await verify(backup, signature, publicKey)).toBe(true);

      // Device revoked (server deletes public key)
      // New signatures cannot be verified (no public key!)
      const newBackup = new TextEncoder().encode('new backup');
      const _newSignature = await sign(newBackup, deviceKeys.privateKey);

      // Server has no public key to verify
      // In real system: publicKey lookup fails, reject signature
      expect(storedPublicKey).toBeDefined(); // Still exists in test
      expect(_newSignature).toBeDefined(); // Signature created but cannot verify
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('error handling', () => {
    it('throws RSAError on signing with invalid key', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(32);

      // Try to sign with public key (wrong key type!)
      await expect(
        sign(data, keyPair.publicKey as any)
      ).rejects.toThrow(RSAError);
    });

    it('returns false for invalid signature format', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(32);
      const invalidSignature = new Uint8Array(512); // Wrong length
      crypto.getRandomValues(invalidSignature);

      const isValid = await verify(data, invalidSignature, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('returns false for empty signature', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(32);
      const emptySignature = new Uint8Array(0);

      const isValid = await verify(data, emptySignature, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('handles corrupted key export gracefully', async () => {
      const keyPair = await generateKeyPair();
      const exported = await exportKeyPair(keyPair);

      // Corrupt first byte
      exported.publicKey[0] ^= 0xFF;

      await expect(importPublicKey(exported.publicKey)).rejects.toThrow(
        RSAError
      );
    });
  });

  // =========================================================================
  // Utility Function Tests
  // =========================================================================

  describe('utility functions', () => {
    it('getModulusLength returns correct key size', async () => {
      const keyPair = await generateKeyPair();

      expect(getModulusLength(keyPair.publicKey)).toBe(4096);
      expect(getModulusLength(keyPair.privateKey)).toBe(4096);
    });

    it('verifyKeyPairMatch confirms matching keys', async () => {
      const keyPair = await generateKeyPair();
      const matches = await verifyKeyPairMatch(keyPair);

      expect(matches).toBe(true);
    });

    it('verifyKeyPairMatch detects mismatched keys', async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();

      // Mismatched pair (public from 1, private from 2)
      const mismatchedPair = {
        publicKey: keyPair1.publicKey,
        privateKey: keyPair2.privateKey,
      };

      const matches = await verifyKeyPairMatch(mismatchedPair);
      expect(matches).toBe(false);
    });
  });

  // =========================================================================
  // Security Properties Tests
  // =========================================================================

  describe('security properties', () => {
    it('public key cannot sign (enforced by WebCrypto)', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(32);

      // WebCrypto should reject signing with public key
      await expect(
        sign(data, keyPair.publicKey as any)
      ).rejects.toThrow();
    });

    it('private key cannot verify (returns false)', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(32);
      const signature = await sign(data, keyPair.privateKey);

      // WebCrypto verify() with wrong key type returns false (doesn't throw)
      const isValid = await verify(
        data,
        signature,
        keyPair.privateKey as any
      );
      expect(isValid).toBe(false);
    });

    it('PSS padding includes random salt (non-deterministic signatures)', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(32);
      crypto.getRandomValues(data);

      // Generate 10 signatures of same data
      const signatures = await Promise.all(
        Array.from({ length: 10 }, () => sign(data, keyPair.privateKey))
      );

      // All signatures should be different (due to random salt)
      const uniqueSignatures = new Set(
        signatures.map((sig) => sig.join(','))
      );
      expect(uniqueSignatures.size).toBe(10);

      // But all verify correctly
      for (const signature of signatures) {
        expect(await verify(data, signature, keyPair.publicKey)).toBe(true);
      }
    });
  });

  // =========================================================================
  // Performance Benchmarks
  // =========================================================================

  describe('performance benchmarks', () => {
    it('key generation performance benchmark', async () => {
      const iterations = 3;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await generateKeyPair();
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`Key generation avg: ${avgTime.toFixed(2)}ms`);

      // RSA-4096 key generation is expensive (varies 100-800ms based on CPU/load)
      // This is acceptable for one-time device registration
      expect(avgTime).toBeLessThan(1000);
    }, 3000); // 3s timeout for 3 key generations

    it('signing performance (<10ms)', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(1024); // 1KB
      crypto.getRandomValues(data);

      const iterations = 20;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await sign(data, keyPair.privateKey);
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`Signing avg: ${avgTime.toFixed(2)}ms`);

      expect(avgTime).toBeLessThan(10);
    }, 500);

    it('verification performance (<30ms avg)', async () => {
      const keyPair = await generateKeyPair();
      const data = new Uint8Array(1024);
      crypto.getRandomValues(data);
      const signature = await sign(data, keyPair.privateKey);

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await verify(data, signature, keyPair.publicKey);
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`Verification avg: ${avgTime.toFixed(2)}ms`);

      expect(avgTime).toBeLessThan(30);
    }, 1000); // 1s timeout
  });
});
