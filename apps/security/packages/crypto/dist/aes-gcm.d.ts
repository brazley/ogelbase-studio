/**
 * AES-256-GCM Encryption - NIST SP 800-38D
 *
 * Implementation of AES-256-GCM (Galois/Counter Mode) for authenticated encryption.
 * This is the PRIMARY encryption primitive for ZKEB - every backup payload uses this.
 *
 * AES-256-GCM provides:
 * - Confidentiality (encryption)
 * - Authenticity (authentication tag)
 * - Performance (hardware-accelerated via Intel AES-NI, ARM Crypto Extensions)
 *
 * This implementation uses native WebCrypto API for maximum performance and security.
 * No custom cryptographic code - all operations delegated to browser/runtime crypto.
 *
 * @module aes-gcm
 * @see https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
 */
/**
 * Error thrown by AES-GCM operations
 */
export declare class AESGCMError extends Error {
    readonly cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
/**
 * Encrypted data container (AES-256-GCM output)
 *
 * Separates ciphertext, nonce, and authentication tag for clean API.
 * WebCrypto returns ciphertext+tag concatenated, we split them.
 */
export interface EncryptedData {
    /** Ciphertext (encrypted plaintext) */
    ciphertext: Uint8Array;
    /** Nonce/IV (96 bits for GCM, MUST be unique per encryption) */
    nonce: Uint8Array;
    /** Authentication tag (128 bits, GCM output) */
    tag: Uint8Array;
    /** Optional associated data (authenticated but not encrypted) */
    additionalData?: Uint8Array;
}
/**
 * Generate cryptographically secure random 256-bit AES key
 *
 * Uses crypto.getRandomValues() which is cryptographically secure
 * across all platforms (browser, Node.js, Deno, Bun).
 *
 * @returns Random 256-bit key suitable for AES-256-GCM
 *
 * @example
 * ```typescript
 * const key = await generateKey();
 * console.log(key.length); // 32 bytes
 * ```
 */
export declare function generateKey(): Promise<Uint8Array>;
/**
 * Generate cryptographically secure random 96-bit nonce
 *
 * CRITICAL: Each encryption MUST use a unique nonce with the same key.
 * Nonce reuse with the same key = catastrophic security failure.
 *
 * 96-bit nonces allow 2^32 encryptions per key before birthday bound
 * concerns (more than sufficient for ZKEB use case).
 *
 * @returns Random 96-bit nonce
 *
 * @example
 * ```typescript
 * const nonce = generateNonce();
 * console.log(nonce.length); // 12 bytes
 * ```
 */
export declare function generateNonce(): Uint8Array;
/**
 * Encrypt data using AES-256-GCM
 *
 * AES-256-GCM provides authenticated encryption:
 * - Ciphertext (encrypted plaintext)
 * - Authentication tag (proves data hasn't been tampered with)
 *
 * The nonce is generated automatically using cryptographically secure random.
 * Each encryption gets a unique nonce - this is critical for security.
 *
 * Optional additional data (AAD) is authenticated but not encrypted.
 * Use AAD for metadata that needs integrity protection but not confidentiality.
 *
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key (use generateKey() to create)
 * @param additionalData - Optional authenticated data (not encrypted)
 * @returns Encrypted data with nonce and auth tag
 * @throws AESGCMError if encryption fails or key is invalid
 *
 * @example
 * ```typescript
 * const key = await generateKey();
 * const plaintext = new TextEncoder().encode('secret message');
 * const encrypted = await encrypt(plaintext, key);
 *
 * // With additional authenticated data
 * const aad = new TextEncoder().encode('metadata');
 * const encrypted2 = await encrypt(plaintext, key, aad);
 * ```
 */
export declare function encrypt(plaintext: Uint8Array, key: Uint8Array, additionalData?: Uint8Array): Promise<EncryptedData>;
/**
 * Decrypt data using AES-256-GCM
 *
 * Performs authenticated decryption:
 * 1. Verifies authentication tag (proves data hasn't been tampered with)
 * 2. Decrypts ciphertext to recover plaintext
 *
 * If the authentication tag doesn't match, decryption fails with an error.
 * This protects against tampered or corrupted data.
 *
 * @param encrypted - Encrypted data container (from encrypt())
 * @param key - 256-bit decryption key (same as encryption key)
 * @returns Decrypted plaintext
 * @throws AESGCMError if authentication fails (tampered data) or decryption fails
 *
 * @example
 * ```typescript
 * const key = await generateKey();
 * const plaintext = new TextEncoder().encode('secret message');
 *
 * // Encrypt
 * const encrypted = await encrypt(plaintext, key);
 *
 * // Decrypt
 * const decrypted = await decrypt(encrypted, key);
 *
 * // Verify round-trip
 * console.log(new TextDecoder().decode(decrypted)); // "secret message"
 * ```
 */
export declare function decrypt(encrypted: EncryptedData, key: Uint8Array): Promise<Uint8Array>;
/**
 * Convenience function: Encrypt string
 *
 * @param plaintext - String to encrypt
 * @param key - 256-bit encryption key
 * @param additionalData - Optional authenticated data
 * @returns Encrypted data
 *
 * @example
 * ```typescript
 * const key = await generateKey();
 * const encrypted = await encryptString('secret', key);
 * ```
 */
export declare function encryptString(plaintext: string, key: Uint8Array, additionalData?: Uint8Array): Promise<EncryptedData>;
/**
 * Convenience function: Decrypt to string
 *
 * @param encrypted - Encrypted data
 * @param key - 256-bit decryption key
 * @returns Decrypted string
 * @throws AESGCMError if decryption fails or result is not valid UTF-8
 *
 * @example
 * ```typescript
 * const key = await generateKey();
 * const encrypted = await encryptString('secret', key);
 * const decrypted = await decryptString(encrypted, key);
 * console.log(decrypted); // "secret"
 * ```
 */
export declare function decryptString(encrypted: EncryptedData, key: Uint8Array): Promise<string>;
//# sourceMappingURL=aes-gcm.d.ts.map