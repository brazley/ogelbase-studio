/**
 * PBKDF2 (Password-Based Key Derivation Function 2) - RFC 2898 / PKCS #5
 *
 * Implementation of PBKDF2 for deriving cryptographic keys from user passwords.
 * Uses WebCrypto API for native PBKDF2 implementation with HMAC-SHA256.
 *
 * ⚠️ WARNING: Passwords are weak secrets. This is the WEAKEST link in the crypto chain.
 * Users should prefer Shamir Secret Sharing for recovery over password-based recovery.
 *
 * @module pbkdf2
 * @see https://tools.ietf.org/html/rfc2898
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
/**
 * OWASP 2023 recommended iteration count for PBKDF2-SHA256
 * Balances security against brute-force attacks with acceptable performance.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2
 */
const DEFAULT_ITERATIONS = 600_000;
/**
 * Salt size in bytes (128 bits)
 * Salt must be unique per user but doesn't need to be secret.
 */
const SALT_LENGTH = 16;
/**
 * Output key size in bytes (256 bits)
 * Matches AES-256 key size for downstream encryption.
 */
const KEY_LENGTH = 32;
/**
 * Pseudorandom function used by PBKDF2
 * SHA-256 provides 256-bit security level matching AES-256.
 */
const HASH_ALGORITHM = 'SHA-256';
/**
 * Derive encryption key from password using PBKDF2-SHA256
 *
 * Uses WebCrypto API for hardware-accelerated PBKDF2 computation.
 * Defaults to OWASP 2023 recommended 600,000 iterations.
 *
 * ⚠️ SECURITY WARNINGS:
 * - Passwords are weak secrets (low entropy compared to random keys)
 * - 600k iterations slows attackers but doesn't eliminate risk
 * - Users must choose strong passwords (12+ characters, high entropy)
 * - Salt must be unique per user (prevents rainbow tables)
 * - Consider Shamir Secret Sharing instead for critical recovery
 *
 * 🎯 USE CASE:
 * Account recovery where user has lost device but remembers password.
 * User password + stored salt → derive UMK → recover backup data.
 *
 * ⏱️ PERFORMANCE:
 * 600,000 iterations completes in <200ms on modern hardware.
 * Time increases linearly with iteration count.
 *
 * @param password - User password (string or Uint8Array)
 *                   Minimum 12 characters recommended (OWASP 2023)
 *                   Use passphrase (multiple words) for better entropy
 * @param salt - Optional salt (generated if not provided)
 *               Must be stored (not secret) for recovery
 *               Use same salt to reproduce same key from same password
 * @param iterations - Iteration count (default: 600,000 per OWASP 2023)
 *                     Higher = more secure but slower
 *                     Must store this value alongside salt
 * @returns Promise resolving to derived key, salt, and iteration count
 * @throws Error if password is empty or iterations < 1
 *
 * @example
 * ```typescript
 * // Initial setup: derive key from user password
 * const password = 'correct horse battery staple'; // Strong passphrase
 * const derived = await deriveKeyFromPassword(password);
 *
 * // Store salt (not secret, can be stored server-side)
 * await storage.store('user-salt', derived.salt);
 *
 * // Use derived key as UMK or to encrypt UMK
 * const umk = derived.key;
 *
 * // Later: recover key from password + salt
 * const storedSalt = await storage.retrieve('user-salt');
 * const recovered = await deriveKeyFromPassword(password, storedSalt);
 * // recovered.key === derived.key (byte-for-byte identical)
 * ```
 *
 * @example
 * ```typescript
 * // Custom iteration count (for testing or special requirements)
 * const derived = await deriveKeyFromPassword(
 *   'my-strong-password',
 *   undefined,        // Auto-generate salt
 *   1_000_000         // 1 million iterations (slower but more secure)
 * );
 * ```
 *
 * @see https://tools.ietf.org/html/rfc2898
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 */
export async function deriveKeyFromPassword(password, salt, iterations = DEFAULT_ITERATIONS) {
    // Validate password
    if (typeof password === 'string' && password.length === 0) {
        throw new Error('PBKDF2: password cannot be empty');
    }
    if (password instanceof Uint8Array && password.length === 0) {
        throw new Error('PBKDF2: password cannot be empty');
    }
    // Validate iterations
    if (iterations < 1) {
        throw new Error('PBKDF2: iterations must be at least 1');
    }
    // Convert password to bytes
    const encoder = new TextEncoder();
    const passwordBytes = typeof password === 'string'
        ? encoder.encode(password)
        : password;
    // Generate salt if not provided
    const actualSalt = salt ?? new Uint8Array(SALT_LENGTH);
    if (!salt) {
        crypto.getRandomValues(actualSalt);
    }
    // Validate salt length (warn if too short)
    if (actualSalt.length < 16) {
        console.warn('PBKDF2: Salt shorter than 128 bits may reduce security');
    }
    // Import password as key material for PBKDF2
    const keyMaterial = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, // Not extractable (password stays in WebCrypto)
    ['deriveBits', 'deriveKey']);
    // Derive key using PBKDF2-SHA256
    const derivedKeyBytes = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: actualSalt,
        iterations: iterations,
        hash: HASH_ALGORITHM
    }, keyMaterial, KEY_LENGTH * 8 // Convert bytes to bits (256 bits)
    );
    return {
        key: new Uint8Array(derivedKeyBytes),
        salt: actualSalt,
        iterations: iterations
    };
}
/**
 * Verify that a password produces the expected derived key
 *
 * Useful for password verification without storing the password itself.
 * Constant-time comparison prevents timing attacks.
 *
 * @param password - Password to verify
 * @param expectedKey - Expected derived key
 * @param salt - Salt used during original derivation
 * @param iterations - Iteration count used during original derivation
 * @returns Promise resolving to true if password is correct, false otherwise
 *
 * @example
 * ```typescript
 * // During setup
 * const { key, salt, iterations } = await deriveKeyFromPassword('my-password');
 * await storage.store('key', key);
 * await storage.store('salt', salt);
 *
 * // During login
 * const storedKey = await storage.retrieve('key');
 * const storedSalt = await storage.retrieve('salt');
 * const isValid = await verifyPassword('user-input', storedKey, storedSalt);
 *
 * if (isValid) {
 *   // Password correct, grant access
 * }
 * ```
 */
export async function verifyPassword(password, expectedKey, salt, iterations = DEFAULT_ITERATIONS) {
    const derived = await deriveKeyFromPassword(password, salt, iterations);
    // Constant-time comparison (prevents timing attacks)
    if (derived.key.length !== expectedKey.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < derived.key.length; i++) {
        diff |= derived.key[i] ^ expectedKey[i];
    }
    return diff === 0;
}
/**
 * Generate a cryptographically secure random salt
 *
 * Convenience function for generating salts.
 * Salt doesn't need to be secret but MUST be unique per user.
 *
 * @param length - Salt length in bytes (default: 16 bytes / 128 bits)
 * @returns Random salt
 *
 * @example
 * ```typescript
 * const salt = generateSalt();
 * const derived = await deriveKeyFromPassword('password', salt);
 * ```
 */
export function generateSalt(length = SALT_LENGTH) {
    if (length < 8) {
        throw new Error('PBKDF2: salt must be at least 8 bytes (64 bits)');
    }
    const salt = new Uint8Array(length);
    crypto.getRandomValues(salt);
    return salt;
}
/**
 * PBKDF2 constants for reference and testing
 */
export const PBKDF2_CONSTANTS = {
    /**
     * OWASP 2023 recommended iterations for PBKDF2-SHA256
     * This value increases over time as hardware improves.
     */
    OWASP_2023_ITERATIONS: DEFAULT_ITERATIONS,
    /**
     * Recommended salt length in bytes (128 bits)
     */
    SALT_LENGTH: SALT_LENGTH,
    /**
     * Output key length in bytes (256 bits)
     */
    KEY_LENGTH: KEY_LENGTH,
    /**
     * Hash algorithm used (SHA-256)
     */
    HASH_ALGORITHM: HASH_ALGORITHM,
    /**
     * Minimum recommended password length (characters)
     * OWASP 2023 recommendation
     */
    MIN_PASSWORD_LENGTH: 12,
    /**
     * Performance target: max time for 600k iterations (ms)
     */
    PERFORMANCE_TARGET_MS: 200
};
//# sourceMappingURL=pbkdf2.js.map