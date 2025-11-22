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
 * AES-256-GCM encryption parameters
 */
const AES_KEY_LENGTH = 32; // 256 bits
const NONCE_LENGTH = 12; // 96 bits (recommended for GCM)
const TAG_LENGTH = 16; // 128 bits (GCM authentication tag)
/**
 * Error thrown by AES-GCM operations
 */
export class AESGCMError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'AESGCMError';
    }
}
/**
 * Validates that a key is 256 bits (32 bytes)
 *
 * @internal
 * @param key - Key to validate
 * @throws AESGCMError if key is not 256 bits
 */
function validateKey(key) {
    if (key.length !== AES_KEY_LENGTH) {
        throw new AESGCMError(`Invalid key length: expected ${AES_KEY_LENGTH} bytes, got ${key.length} bytes`);
    }
}
/**
 * Validates that a nonce is 96 bits (12 bytes)
 *
 * @internal
 * @param nonce - Nonce to validate
 * @throws AESGCMError if nonce is not 96 bits
 */
function validateNonce(nonce) {
    if (nonce.length !== NONCE_LENGTH) {
        throw new AESGCMError(`Invalid nonce length: expected ${NONCE_LENGTH} bytes, got ${nonce.length} bytes`);
    }
}
/**
 * Imports a raw key into WebCrypto CryptoKey format
 *
 * @internal
 * @param key - Raw 256-bit key
 * @returns WebCrypto CryptoKey ready for encryption/decryption
 */
async function importKey(key) {
    validateKey(key);
    try {
        return await crypto.subtle.importKey('raw', key, { name: 'AES-GCM', length: 256 }, false, // Not extractable (security best practice)
        ['encrypt', 'decrypt']);
    }
    catch (error) {
        throw new AESGCMError('Failed to import key', error);
    }
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
export async function generateKey() {
    const key = new Uint8Array(AES_KEY_LENGTH);
    crypto.getRandomValues(key);
    return key;
}
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
export function generateNonce() {
    const nonce = new Uint8Array(NONCE_LENGTH);
    crypto.getRandomValues(nonce);
    return nonce;
}
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
export async function encrypt(plaintext, key, additionalData) {
    // Import key into WebCrypto format
    const cryptoKey = await importKey(key);
    // Generate unique nonce (CRITICAL: must be unique per encryption)
    const nonce = generateNonce();
    try {
        // Perform AES-256-GCM encryption
        // WebCrypto returns ciphertext + tag concatenated
        const encrypted = await crypto.subtle.encrypt({
            name: 'AES-GCM',
            iv: nonce,
            additionalData: additionalData,
            tagLength: TAG_LENGTH * 8 // 128 bits
        }, cryptoKey, plaintext);
        // Split ciphertext and tag
        // WebCrypto appends tag to ciphertext (last 16 bytes)
        const encryptedArray = new Uint8Array(encrypted);
        const ciphertextLength = encryptedArray.length - TAG_LENGTH;
        const ciphertext = encryptedArray.slice(0, ciphertextLength);
        const tag = encryptedArray.slice(ciphertextLength);
        return {
            ciphertext,
            nonce,
            tag,
            additionalData
        };
    }
    catch (error) {
        throw new AESGCMError('Encryption failed', error);
    }
}
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
export async function decrypt(encrypted, key) {
    // Validate nonce
    validateNonce(encrypted.nonce);
    // Import key into WebCrypto format
    const cryptoKey = await importKey(key);
    // Reconstruct WebCrypto format: ciphertext + tag
    const combined = new Uint8Array(encrypted.ciphertext.length + encrypted.tag.length);
    combined.set(encrypted.ciphertext, 0);
    combined.set(encrypted.tag, encrypted.ciphertext.length);
    try {
        // Perform AES-256-GCM decryption
        // WebCrypto automatically verifies authentication tag
        const decrypted = await crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv: encrypted.nonce,
            additionalData: encrypted.additionalData,
            tagLength: TAG_LENGTH * 8 // 128 bits
        }, cryptoKey, combined);
        return new Uint8Array(decrypted);
    }
    catch (error) {
        // Authentication failure or decryption error
        throw new AESGCMError('Decryption failed (authentication tag mismatch or corrupted data)', error);
    }
}
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
export async function encryptString(plaintext, key, additionalData) {
    const plaintextBytes = new TextEncoder().encode(plaintext);
    return encrypt(plaintextBytes, key, additionalData);
}
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
export async function decryptString(encrypted, key) {
    const decrypted = await decrypt(encrypted, key);
    try {
        return new TextDecoder().decode(decrypted);
    }
    catch (error) {
        throw new AESGCMError('Decrypted data is not valid UTF-8', error);
    }
}
//# sourceMappingURL=aes-gcm.js.map