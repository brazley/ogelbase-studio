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
 * Result of PBKDF2 key derivation
 *
 * Contains the derived key, salt used, and iteration count.
 * The salt must be stored alongside encrypted data for key recovery.
 */
export interface DerivedKey {
    /**
     * Derived encryption key (256 bits)
     * This key can be used directly with AES-256-GCM encryption.
     */
    key: Uint8Array;
    /**
     * Salt used during derivation (128 bits)
     * Must be stored (not secret) for key recovery.
     * Salt MUST be unique per user to prevent rainbow table attacks.
     */
    salt: Uint8Array;
    /**
     * PBKDF2 iteration count used
     * Higher iterations = more security but slower derivation.
     * OWASP 2023: 600,000 iterations for PBKDF2-SHA256.
     */
    iterations: number;
}
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
export declare function deriveKeyFromPassword(password: string | Uint8Array, salt?: Uint8Array, iterations?: number): Promise<DerivedKey>;
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
export declare function verifyPassword(password: string | Uint8Array, expectedKey: Uint8Array, salt: Uint8Array, iterations?: number): Promise<boolean>;
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
export declare function generateSalt(length?: number): Uint8Array;
/**
 * PBKDF2 constants for reference and testing
 */
export declare const PBKDF2_CONSTANTS: {
    /**
     * OWASP 2023 recommended iterations for PBKDF2-SHA256
     * This value increases over time as hardware improves.
     */
    OWASP_2023_ITERATIONS: number;
    /**
     * Recommended salt length in bytes (128 bits)
     */
    SALT_LENGTH: number;
    /**
     * Output key length in bytes (256 bits)
     */
    KEY_LENGTH: number;
    /**
     * Hash algorithm used (SHA-256)
     */
    HASH_ALGORITHM: string;
    /**
     * Minimum recommended password length (characters)
     * OWASP 2023 recommendation
     */
    MIN_PASSWORD_LENGTH: number;
    /**
     * Performance target: max time for 600k iterations (ms)
     */
    PERFORMANCE_TARGET_MS: number;
};
//# sourceMappingURL=pbkdf2.d.ts.map