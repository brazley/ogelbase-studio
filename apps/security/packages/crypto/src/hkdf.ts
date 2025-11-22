/**
 * HKDF (HMAC-based Key Derivation Function) - RFC 5869
 *
 * Implementation of HKDF for deriving cryptographic keys from input keying material.
 * This is the ONLY custom cryptographic implementation in ZKEB - all other primitives
 * use native WebCrypto API.
 *
 * @module hkdf
 * @see https://tools.ietf.org/html/rfc5869
 */

const HASH_ALGORITHM = 'SHA-256';
const HASH_LENGTH = 32; // SHA-256 produces 32-byte (256-bit) output
const MAX_OUTPUT_LENGTH = 255 * HASH_LENGTH; // 8160 bytes for SHA-256

/**
 * Performs HMAC-SHA256 using WebCrypto API
 *
 * @internal
 * @param key - HMAC key material
 * @param data - Data to authenticate
 * @returns HMAC output
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: HASH_ALGORITHM },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

/**
 * Concatenates multiple Uint8Arrays into a single array
 *
 * @internal
 * @param arrays - Arrays to concatenate
 * @returns Concatenated array
 */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * HKDF Extract step (RFC 5869 Section 2.2)
 *
 * Extracts a pseudorandom key (PRK) from input keying material (IKM) and salt.
 *
 * The Extract step:
 * ```
 * PRK = HMAC-Hash(salt, IKM)
 * ```
 *
 * @param salt - Optional salt value (a non-secret random value).
 *               If zero-length, a string of HashLen zeros is used per RFC 5869.
 * @param ikm - Input keying material (should have sufficient entropy)
 * @returns Pseudorandom key (PRK) of HashLen octets (32 bytes for SHA-256)
 *
 * @example
 * ```typescript
 * const salt = new Uint8Array([0x00, 0x01, 0x02, ...]);
 * const ikm = new Uint8Array([0x0b, 0x0b, 0x0b, ...]);
 * const prk = await hkdfExtract(salt, ikm);
 * ```
 */
export async function hkdfExtract(
  salt: Uint8Array,
  ikm: Uint8Array
): Promise<Uint8Array> {
  // RFC 5869 Section 2.2: If salt is not provided (zero-length),
  // it is set to a string of HashLen zeros
  const actualSalt = salt.length === 0 ? new Uint8Array(HASH_LENGTH) : salt;

  // PRK = HMAC-Hash(salt, IKM)
  return hmacSha256(actualSalt, ikm);
}

/**
 * HKDF Expand step (RFC 5869 Section 2.3)
 *
 * Expands a pseudorandom key (PRK) into multiple output keying material (OKM) of
 * specified length using optional context information.
 *
 * The Expand step:
 * ```
 * N = ceil(L/HashLen)
 * T = T(1) | T(2) | T(3) | ... | T(N)
 * OKM = first L octets of T
 *
 * where:
 * T(0) = empty string (zero length)
 * T(1) = HMAC-Hash(PRK, T(0) | info | 0x01)
 * T(2) = HMAC-Hash(PRK, T(1) | info | 0x02)
 * T(3) = HMAC-Hash(PRK, T(2) | info | 0x03)
 * ...
 * ```
 *
 * @param prk - Pseudorandom key from Extract step (at least HashLen octets)
 * @param info - Optional context and application specific information.
 *               Use different info values to derive independent keys.
 * @param length - Length of output keying material in octets (must be <= 255*HashLen)
 * @returns Output keying material (OKM) of length octets
 * @throws Error if length > 255 * HashLen (8160 for SHA-256)
 * @throws Error if length is negative or zero
 *
 * @example
 * ```typescript
 * const prk = await hkdfExtract(salt, ikm);
 * const info = new TextEncoder().encode('application-context');
 * const okm = await hkdfExpand(prk, info, 42);
 * ```
 */
export async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Validate output length per RFC 5869 Section 2.3
  if (length <= 0) {
    throw new Error('HKDF: output length must be positive');
  }

  if (length > MAX_OUTPUT_LENGTH) {
    throw new Error(
      `HKDF: output length too long (max ${MAX_OUTPUT_LENGTH} bytes for SHA-256)`
    );
  }

  // Calculate number of iterations needed
  // N = ceil(L/HashLen)
  const n = Math.ceil(length / HASH_LENGTH);

  // Build output by iteratively applying HMAC
  const blocks: Uint8Array[] = [];
  let previousBlock: Uint8Array = new Uint8Array(0); // T(0) = empty string

  for (let i = 1; i <= n; i++) {
    // T(i) = HMAC-Hash(PRK, T(i-1) | info | i)
    const input = concat(
      previousBlock,
      info,
      new Uint8Array([i]) // Counter as single byte
    );

    previousBlock = await hmacSha256(prk, input);
    blocks.push(previousBlock);
  }

  // T = T(1) | T(2) | ... | T(N)
  const t = concat(...blocks);

  // OKM = first L octets of T
  return t.slice(0, length);
}

/**
 * HKDF (Extract-then-Expand) - RFC 5869
 *
 * Convenience function that performs both Extract and Expand steps in sequence.
 * This is the primary interface for most use cases.
 *
 * HKDF takes an input keying material (IKM) and derives one or more
 * cryptographically strong keys suitable for use in cryptographic operations.
 *
 * Key Properties:
 * - Deterministic: Same inputs always produce same output
 * - Key Separation: Different `info` values produce independent keys
 * - Extraction: Concentrates entropy from possibly weak IKM
 * - Expansion: Produces variable-length output from fixed PRK
 *
 * @param salt - Optional salt value (random value recommended but not required).
 *               Use zero-length array if no salt available.
 * @param ikm - Input keying material (should have sufficient entropy).
 *              Do NOT use weak passwords directly - use PBKDF2/Argon2 first.
 * @param info - Optional context and application specific information.
 *               Use to bind derived keys to specific contexts/purposes.
 * @param length - Length of output keying material in octets (must be <= 8160 for SHA-256)
 * @returns Output keying material (OKM) suitable for cryptographic use
 * @throws Error if length is invalid
 *
 * @example
 * ```typescript
 * // Derive encryption and authentication keys from master key
 * const masterKey = new Uint8Array(32); // From secure source
 * crypto.getRandomValues(masterKey);
 *
 * const salt = new Uint8Array(16);
 * crypto.getRandomValues(salt);
 *
 * const encKey = await hkdf(
 *   salt,
 *   masterKey,
 *   new TextEncoder().encode('encryption-key'),
 *   32
 * );
 *
 * const macKey = await hkdf(
 *   salt,
 *   masterKey,
 *   new TextEncoder().encode('authentication-key'),
 *   32
 * );
 * ```
 *
 * @see https://tools.ietf.org/html/rfc5869
 */
export async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}
