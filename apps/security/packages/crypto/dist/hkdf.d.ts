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
export declare function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array>;
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
export declare function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>;
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
export declare function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>;
//# sourceMappingURL=hkdf.d.ts.map