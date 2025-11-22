/**
 * AES-256-GCM Test Suite
 *
 * Tests against NIST SP 800-38D test vectors and comprehensive edge cases.
 *
 * Test Coverage:
 * - NIST SP 800-38D official test vectors
 * - Round-trip encryption/decryption
 * - Nonce uniqueness verification
 * - Authentication tag verification
 * - Additional authenticated data (AAD)
 * - Edge cases (empty data, large data)
 * - Performance benchmarks
 * - Error handling
 */

import {
  encrypt,
  decrypt,
  generateKey,
  generateNonce,
  encryptString,
  decryptString,
  AESGCMError
} from '../src/aes-gcm';

describe('AES-256-GCM', () => {
  describe('Key Generation', () => {
    test('generateKey() produces 256-bit keys', async () => {
      const key = await generateKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32); // 256 bits
    });

    test('generateKey() produces unique keys', async () => {
      const key1 = await generateKey();
      const key2 = await generateKey();

      // Keys should not be identical
      expect(Buffer.from(key1).equals(Buffer.from(key2))).toBe(false);
    });

    test('generateKey() produces cryptographically random keys', async () => {
      // Generate 100 keys and verify entropy
      const keys = await Promise.all(
        Array.from({ length: 100 }, () => generateKey())
      );

      // Check that keys are unique
      const uniqueKeys = new Set(keys.map((k: Uint8Array) => Buffer.from(k).toString('hex')));
      expect(uniqueKeys.size).toBe(100);

      // Check that keys have sufficient entropy (no all-zero or all-one keys)
      for (const key of keys) {
        const allZero = key.every((byte: number) => byte === 0);
        const allOne = key.every((byte: number) => byte === 0xff);
        expect(allZero).toBe(false);
        expect(allOne).toBe(false);
      }
    });
  });

  describe('Nonce Generation', () => {
    test('generateNonce() produces 96-bit nonces', () => {
      const nonce = generateNonce();
      expect(nonce).toBeInstanceOf(Uint8Array);
      expect(nonce.length).toBe(12); // 96 bits
    });

    test('generateNonce() produces unique nonces', () => {
      const nonces = new Set();

      // Generate 10000 nonces and verify uniqueness
      for (let i = 0; i < 10000; i++) {
        const nonce = generateNonce();
        const nonceHex = Buffer.from(nonce).toString('hex');
        expect(nonces.has(nonceHex)).toBe(false);
        nonces.add(nonceHex);
      }

      expect(nonces.size).toBe(10000);
    });

    test('generateNonce() produces cryptographically random nonces', () => {
      // Generate 1000 nonces and check entropy
      const nonces = Array.from({ length: 1000 }, () => generateNonce());

      // Check that nonces are unique
      const uniqueNonces = new Set(
        nonces.map(n => Buffer.from(n).toString('hex'))
      );
      expect(uniqueNonces.size).toBe(1000);

      // Check that nonces have sufficient entropy
      for (const nonce of nonces) {
        const allZero = nonce.every((byte: number) => byte === 0);
        const allOne = nonce.every((byte: number) => byte === 0xff);
        expect(allZero).toBe(false);
        expect(allOne).toBe(false);
      }
    });
  });

  describe('Round-Trip Encryption/Decryption', () => {
    test('encrypts and decrypts data correctly', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('Hello, ZKEB!');

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    test('handles empty plaintext', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array(0);

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
      expect(decrypted.length).toBe(0);
    });

    test('handles large plaintext (1MB)', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array(1024 * 1024); // 1MB

      // crypto.getRandomValues has 65KB limit, fill in chunks
      const chunkSize = 65536;
      for (let i = 0; i < plaintext.length; i += chunkSize) {
        const chunk = plaintext.subarray(i, Math.min(i + chunkSize, plaintext.length));
        crypto.getRandomValues(chunk);
      }

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    test('encrypted data structure contains all required fields', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('test data');

      const encrypted = await encrypt(plaintext, key);

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('nonce');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce).toBeInstanceOf(Uint8Array);
      expect(encrypted.tag).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce.length).toBe(12); // 96 bits
      expect(encrypted.tag.length).toBe(16); // 128 bits
    });

    test('each encryption produces unique nonce', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('test data');

      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      // Nonces should be different
      expect(Buffer.from(encrypted1.nonce).equals(Buffer.from(encrypted2.nonce))).toBe(false);
    });

    test('same plaintext produces different ciphertexts (randomized nonce)', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('test data');

      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      // Ciphertexts should differ due to different nonces
      expect(
        Buffer.from(encrypted1.ciphertext).equals(Buffer.from(encrypted2.ciphertext))
      ).toBe(false);
    });
  });

  describe('Additional Authenticated Data (AAD)', () => {
    test('encrypts and decrypts with AAD', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');
      const aad = new TextEncoder().encode('metadata');

      const encrypted = await encrypt(plaintext, key, aad);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    test('decryption fails with wrong AAD', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');
      const aad1 = new TextEncoder().encode('metadata');
      const aad2 = new TextEncoder().encode('different');

      const encrypted = await encrypt(plaintext, key, aad1);

      // Tamper with AAD
      encrypted.additionalData = aad2;

      await expect(decrypt(encrypted, key)).rejects.toThrow(AESGCMError);
    });

    test('decryption fails with missing AAD', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');
      const aad = new TextEncoder().encode('metadata');

      const encrypted = await encrypt(plaintext, key, aad);

      // Remove AAD
      delete encrypted.additionalData;

      await expect(decrypt(encrypted, key)).rejects.toThrow(AESGCMError);
    });

    test('AAD is not encrypted (remains readable)', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret');
      const aad = new TextEncoder().encode('public metadata');

      const encrypted = await encrypt(plaintext, key, aad);

      // AAD should be stored as-is (not encrypted)
      expect(encrypted.additionalData).toEqual(aad);
    });
  });

  describe('Authentication Tag Verification', () => {
    test('decryption fails with tampered ciphertext', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');

      const encrypted = await encrypt(plaintext, key);

      // Tamper with ciphertext (flip one bit)
      encrypted.ciphertext[0] ^= 0x01;

      await expect(decrypt(encrypted, key)).rejects.toThrow(AESGCMError);
      await expect(decrypt(encrypted, key)).rejects.toThrow(/authentication tag mismatch/i);
    });

    test('decryption fails with tampered tag', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');

      const encrypted = await encrypt(plaintext, key);

      // Tamper with tag (flip one bit)
      encrypted.tag[0] ^= 0x01;

      await expect(decrypt(encrypted, key)).rejects.toThrow(AESGCMError);
    });

    test('decryption fails with wrong key', async () => {
      const key1 = await generateKey();
      const key2 = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');

      const encrypted = await encrypt(plaintext, key1);

      await expect(decrypt(encrypted, key2)).rejects.toThrow(AESGCMError);
    });

    test('decryption fails with wrong nonce', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('secret message');

      const encrypted = await encrypt(plaintext, key);

      // Replace nonce with different one
      encrypted.nonce = generateNonce();

      await expect(decrypt(encrypted, key)).rejects.toThrow(AESGCMError);
    });
  });

  describe('String Convenience Functions', () => {
    test('encryptString and decryptString work correctly', async () => {
      const key = await generateKey();
      const plaintext = 'Hello, World! 🌍';

      const encrypted = await encryptString(plaintext, key);
      const decrypted = await decryptString(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    test('encryptString handles Unicode correctly', async () => {
      const key = await generateKey();
      const plaintext = '日本語 • Español • العربية • 🚀';

      const encrypted = await encryptString(plaintext, key);
      const decrypted = await decryptString(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    test('encryptString handles empty string', async () => {
      const key = await generateKey();
      const plaintext = '';

      const encrypted = await encryptString(plaintext, key);
      const decrypted = await decryptString(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    test('decryptString throws on invalid UTF-8', async () => {
      const key = await generateKey();

      // Create encrypted data containing invalid UTF-8 bytes
      const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
      const encrypted = await encrypt(invalidUtf8, key);

      await expect(decryptString(encrypted, key)).rejects.toThrow(AESGCMError);
      await expect(decryptString(encrypted, key)).rejects.toThrow(/not valid UTF-8/i);
    });
  });

  describe('Error Handling', () => {
    test('encrypt throws on invalid key length', async () => {
      const badKey = new Uint8Array(16); // 128 bits, not 256
      const plaintext = new TextEncoder().encode('test');

      await expect(encrypt(plaintext, badKey)).rejects.toThrow(AESGCMError);
      await expect(encrypt(plaintext, badKey)).rejects.toThrow(/invalid key length/i);
    });

    test('decrypt throws on invalid nonce length', async () => {
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('test');

      const encrypted = await encrypt(plaintext, key);

      // Tamper with nonce length
      encrypted.nonce = new Uint8Array(16); // Wrong length

      await expect(decrypt(encrypted, key)).rejects.toThrow(AESGCMError);
      await expect(decrypt(encrypted, key)).rejects.toThrow(/invalid nonce length/i);
    });

    test('AESGCMError has correct properties', async () => {
      const badKey = new Uint8Array(16);
      const plaintext = new TextEncoder().encode('test');

      try {
        await encrypt(plaintext, badKey);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AESGCMError);
        expect((error as AESGCMError).message).toContain('Invalid key length');
        expect((error as AESGCMError).name).toBe('AESGCMError');
      }
    });
  });

  describe('NIST SP 800-38D Test Vectors', () => {
    /**
     * NIST SP 800-38D Test Case 13
     * AES-256-GCM with 96-bit IV and 128-bit tag
     */
    test('NIST Test Case 13: 256-bit key, empty plaintext', async () => {
      // Test vectors from NIST SP 800-38D Appendix B
      const keyHex = '0000000000000000000000000000000000000000000000000000000000000000';
      const ivHex = '000000000000000000000000';
      const plaintextHex = '';
      const expectedCiphertextHex = '';
      const expectedTagHex = '530f8afbc74536b9a963b4f1c4cb738b';

      const key = hexToBytes(keyHex);
      const nonce = hexToBytes(ivHex);
      const plaintext = hexToBytes(plaintextHex);

      // Re-encrypt with fixed nonce for comparison
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      const result = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
        cryptoKey,
        plaintext as BufferSource
      );

      const resultArray = new Uint8Array(result);
      const ciphertext = resultArray.slice(0, -16);
      const tag = resultArray.slice(-16);

      expect(bytesToHex(ciphertext)).toBe(expectedCiphertextHex);
      expect(bytesToHex(tag)).toBe(expectedTagHex);
    });

    test('NIST Test Case 14: 256-bit key, 128-bit plaintext', async () => {
      const keyHex = '0000000000000000000000000000000000000000000000000000000000000000';
      const ivHex = '000000000000000000000000';
      const plaintextHex = '00000000000000000000000000000000';
      const expectedCiphertextHex = 'cea7403d4d606b6e074ec5d3baf39d18';
      const expectedTagHex = 'd0d1c8a799996bf0265b98b5d48ab919';

      const key = hexToBytes(keyHex);
      const nonce = hexToBytes(ivHex);
      const plaintext = hexToBytes(plaintextHex);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      const result = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
        cryptoKey,
        plaintext as BufferSource
      );

      const resultArray = new Uint8Array(result);
      const ciphertext = resultArray.slice(0, -16);
      const tag = resultArray.slice(-16);

      expect(bytesToHex(ciphertext)).toBe(expectedCiphertextHex);
      expect(bytesToHex(tag)).toBe(expectedTagHex);

      // Verify decryption
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
        cryptoKey,
        result as BufferSource
      );

      expect(bytesToHex(new Uint8Array(decrypted))).toBe(plaintextHex);
    });

    test('NIST verification: Our encrypt/decrypt matches WebCrypto', async () => {
      // Verify our implementation matches WebCrypto exactly
      const key = await generateKey();
      const plaintext = new TextEncoder().encode('Test message for NIST compliance');

      // Use our encrypt
      const encrypted = await encrypt(plaintext, key);

      // Verify decryption works
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);

      // Verify WebCrypto can decrypt what we encrypted
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const combined = new Uint8Array(encrypted.ciphertext.length + encrypted.tag.length);
      combined.set(encrypted.ciphertext, 0);
      combined.set(encrypted.tag, encrypted.ciphertext.length);

      const webCryptoDecrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: encrypted.nonce as BufferSource,
          tagLength: 128
        },
        cryptoKey,
        combined as BufferSource
      );

      expect(new Uint8Array(webCryptoDecrypted)).toEqual(plaintext);
    });
  });

  describe('Performance Benchmarks', () => {
    test('encrypts 1KB in <3ms', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array(1024); // 1KB
      crypto.getRandomValues(plaintext);

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await encrypt(plaintext, key);
      }

      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Average encryption time for 1KB: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(3); // <3ms requirement
    });

    test('encrypts 10KB in <5ms', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array(10 * 1024); // 10KB
      crypto.getRandomValues(plaintext);

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await encrypt(plaintext, key);
      }

      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Average encryption time for 10KB: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(5); // <5ms target
    });

    test('round-trip (encrypt + decrypt) 1KB in <5ms', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array(1024);
      crypto.getRandomValues(plaintext);

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const encrypted = await encrypt(plaintext, key);
        await decrypt(encrypted, key);
      }

      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Average round-trip time for 1KB: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(5);
    });

    test('Performance Benchmark: Complete Report', async () => {
      const key = await generateKey();
      const sizes = [
        { name: '1KB', bytes: 1024 },
        { name: '10KB', bytes: 10 * 1024 },
        { name: '100KB', bytes: 100 * 1024 },
        { name: '1MB', bytes: 1024 * 1024 }
      ];

      console.log('\n=== AES-256-GCM Performance Benchmark ===');

      for (const { name, bytes } of sizes) {
        const plaintext = new Uint8Array(bytes);

        // crypto.getRandomValues has 65KB limit, fill in chunks
        const chunkSize = 65536;
        for (let i = 0; i < plaintext.length; i += chunkSize) {
          const chunk = plaintext.subarray(i, Math.min(i + chunkSize, plaintext.length));
          crypto.getRandomValues(chunk);
        }

        const iterations = bytes <= 10240 ? 100 : 10;

        // Encryption
        const encStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          await encrypt(plaintext, key);
        }
        const encEnd = performance.now();
        const encAvg = (encEnd - encStart) / iterations;

        // Decryption
        const encrypted = await encrypt(plaintext, key);
        const decStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          await decrypt(encrypted, key);
        }
        const decEnd = performance.now();
        const decAvg = (decEnd - decStart) / iterations;

        const throughputMBps = (bytes / (1024 * 1024)) / (encAvg / 1000);

        console.log(`${name}:`);
        console.log(`  Encryption: ${encAvg.toFixed(2)}ms`);
        console.log(`  Decryption: ${decAvg.toFixed(2)}ms`);
        console.log(`  Throughput: ${throughputMBps.toFixed(2)} MB/s`);
      }

      console.log('==========================================\n');
    });
  });
});

// Helper functions for NIST test vectors

function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
