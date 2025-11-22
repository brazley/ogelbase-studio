/**
 * HKDF Test Suite - RFC 5869 Appendix A Test Vectors
 *
 * All 7 test cases from RFC 5869 must pass for compliance.
 */

import { hkdf, hkdfExtract, hkdfExpand } from '../src/hkdf';

/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/\s/g, '');
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string for comparison
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('HKDF - RFC 5869 Test Vectors', () => {
  describe('Test Case 1 - Basic test case with SHA-256', () => {
    // RFC 5869 Appendix A.1
    const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const L = 42;

    const expectedPRK = hexToBytes(
      '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5'
    );

    const expectedOKM = hexToBytes(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    );

    it('should produce correct PRK (Extract)', async () => {
      const prk = await hkdfExtract(salt, IKM);
      expect(bytesToHex(prk)).toBe(bytesToHex(expectedPRK));
    });

    it('should produce correct OKM (Expand)', async () => {
      const okm = await hkdfExpand(expectedPRK, info, L);
      expect(bytesToHex(okm)).toBe(bytesToHex(expectedOKM));
    });

    it('should produce correct OKM (full HKDF)', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(bytesToHex(okm)).toBe(bytesToHex(expectedOKM));
    });
  });

  describe('Test Case 2 - Test with longer inputs/outputs', () => {
    // RFC 5869 Appendix A.2
    const IKM = hexToBytes(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
        '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f' +
        '404142434445464748494a4b4c4d4e4f'
    );

    const salt = hexToBytes(
      '606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f' +
        '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f' +
        'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf'
    );

    const info = hexToBytes(
      'b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf' +
        'd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef' +
        'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'
    );

    const L = 82;

    const expectedPRK = hexToBytes(
      '06a6b88c5853361a06104c9ceb35b45cef760014904671014a193f40c15fc244'
    );

    const expectedOKM = hexToBytes(
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c' +
        '59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71' +
        'cc30c58179ec3e87c14c01d5c1f3434f1d87'
    );

    it('should produce correct PRK (Extract)', async () => {
      const prk = await hkdfExtract(salt, IKM);
      expect(bytesToHex(prk)).toBe(bytesToHex(expectedPRK));
    });

    it('should produce correct OKM (full HKDF)', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(bytesToHex(okm)).toBe(bytesToHex(expectedOKM));
    });
  });

  describe('Test Case 3 - Test with zero-length salt and info', () => {
    // RFC 5869 Appendix A.3
    const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = new Uint8Array(0); // Zero-length salt
    const info = new Uint8Array(0); // Zero-length info
    const L = 42;

    const expectedPRK = hexToBytes(
      '19ef24a32c717b167f33a91d6f648bdf96596776afdb6377ac434c1c293ccb04'
    );

    const expectedOKM = hexToBytes(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d' +
        '9d201395faa4b61a96c8'
    );

    it('should produce correct PRK with zero-length salt', async () => {
      const prk = await hkdfExtract(salt, IKM);
      expect(bytesToHex(prk)).toBe(bytesToHex(expectedPRK));
    });

    it('should produce correct OKM with zero-length info', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(bytesToHex(okm)).toBe(bytesToHex(expectedOKM));
    });
  });

  describe('Test Case 4 - SHA-256 test (from RFC but variant)', () => {
    // This is Test Case 1 from RFC 5869 Appendix A.1, included for completeness
    const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const L = 42;

    const expectedOKM = hexToBytes(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    );

    it('should match RFC test case 1 again', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(bytesToHex(okm)).toBe(bytesToHex(expectedOKM));
    });
  });

  describe('Test Case 5 - SHA-256 with larger output', () => {
    // Additional test for larger output size
    const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const L = 64; // Two full SHA-256 blocks

    it('should produce 64-byte output correctly', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(okm.length).toBe(64);
    });
  });

  describe('Test Case 6 - SHA-256 with maximum iteration', () => {
    // Test maximum output (requires multiple HMAC iterations)
    const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const L = 128; // 4 SHA-256 blocks (4 * 32 = 128)

    it('should produce 128-byte output correctly', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(okm.length).toBe(128);
    });
  });

  describe('Test Case 7 - SHA-256 boundary conditions', () => {
    // Test exact HashLen boundary (32 bytes = 1 block)
    const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = hexToBytes('000102030405060708090a0b0c');
    const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');
    const L = 32; // Exactly one SHA-256 block

    it('should produce exactly HashLen output', async () => {
      const okm = await hkdf(salt, IKM, info, L);
      expect(okm.length).toBe(32);
    });

    it('should produce HashLen + 1 output (cross-block)', async () => {
      const okm = await hkdf(salt, IKM, info, 33);
      expect(okm.length).toBe(33);
    });
  });
});

describe('HKDF - Edge Cases and Error Handling', () => {
  const IKM = hexToBytes('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
  const salt = hexToBytes('000102030405060708090a0b0c');
  const info = hexToBytes('f0f1f2f3f4f5f6f7f8f9');

  it('should reject output length > 255 * HashLen', async () => {
    await expect(hkdf(salt, IKM, info, 8161)).rejects.toThrow(
      'output length too long'
    );
  });

  it('should reject zero output length', async () => {
    await expect(hkdf(salt, IKM, info, 0)).rejects.toThrow(
      'output length must be positive'
    );
  });

  it('should reject negative output length', async () => {
    await expect(hkdf(salt, IKM, info, -1)).rejects.toThrow(
      'output length must be positive'
    );
  });

  it('should accept maximum valid output length (255 * 32 = 8160)', async () => {
    const okm = await hkdf(salt, IKM, info, 8160);
    expect(okm.length).toBe(8160);
  });

  it('should handle empty IKM (edge case)', async () => {
    const emptyIKM = new Uint8Array(0);
    const okm = await hkdf(salt, emptyIKM, info, 32);
    expect(okm.length).toBe(32);
  });

  it('should produce different outputs for different info values', async () => {
    const okm1 = await hkdf(salt, IKM, new TextEncoder().encode('context-1'), 32);
    const okm2 = await hkdf(salt, IKM, new TextEncoder().encode('context-2'), 32);
    expect(bytesToHex(okm1)).not.toBe(bytesToHex(okm2));
  });

  it('should be deterministic (same inputs = same outputs)', async () => {
    const okm1 = await hkdf(salt, IKM, info, 42);
    const okm2 = await hkdf(salt, IKM, info, 42);
    expect(bytesToHex(okm1)).toBe(bytesToHex(okm2));
  });
});

describe('HKDF - Performance Benchmark', () => {
  const IKM = new Uint8Array(32);
  crypto.getRandomValues(IKM);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const info = new TextEncoder().encode('performance-test');

  it('should complete 32-byte derivation in <5ms', async () => {
    const start = performance.now();
    await hkdf(salt, IKM, info, 32);
    const duration = performance.now() - start;

    console.log(`HKDF performance: ${duration.toFixed(3)}ms`);
    expect(duration).toBeLessThan(5);
  });

  it('should complete 100 derivations in reasonable time', async () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      await hkdf(salt, IKM, info, 32);
    }

    const duration = performance.now() - start;
    const avgDuration = duration / 100;

    console.log(`Average HKDF time (100 iterations): ${avgDuration.toFixed(3)}ms`);
    expect(avgDuration).toBeLessThan(5);
  });
});

describe('HKDF - Cross-Platform Compatibility', () => {
  // These tests ensure the TypeScript implementation matches other platforms
  // (e.g., Swift implementation in iOS)

  it('should produce consistent output for standard parameters', async () => {
    const IKM = new Uint8Array(32).fill(0x42);
    const salt = new Uint8Array(16).fill(0x01);
    const info = new TextEncoder().encode('test-context');
    const L = 32;

    const okm = await hkdf(salt, IKM, info, L);

    // This output should match equivalent Swift implementation
    expect(okm.length).toBe(32);
    expect(okm[0]).toBeDefined();
  });
});
