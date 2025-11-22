/**
 * RSA-4096-PSS Digital Signatures
 *
 * This module provides RSA-4096 digital signatures with PSS padding for:
 * - Device authentication (prove device identity)
 * - Backup integrity verification (prove backup came from authorized device)
 * - Non-repudiation (signatures cannot be forged)
 *
 * Security Properties:
 * - 4096-bit keys (quantum-resistant until ~2030)
 * - PSS padding (more secure than PKCS#1 v1.5)
 * - SHA-256 hash function
 * - 32-byte salt (256 bits)
 *
 * Use Cases:
 * 1. Device Registration: Device signs certificate with private key
 * 2. Backup Signing: Device signs backup hash before upload
 * 3. Server Verification: Server verifies signature with public key
 *
 * Implementation: Uses native WebCrypto API for maximum performance and security.
 *
 * @module rsa
 */
/**
 * RSA key pair for signing and verification
 */
export interface RSAKeyPair {
    /** Public key for verification (safe to share) */
    publicKey: CryptoKey;
    /** Private key for signing (NEVER share!) */
    privateKey: CryptoKey;
}
/**
 * Exported key pair in standard formats (SPKI/PKCS8)
 */
export interface ExportedKeyPair {
    /** Public key in SPKI format (X.509 SubjectPublicKeyInfo) */
    publicKey: Uint8Array;
    /** Private key in PKCS8 format (PKCS #8 PrivateKeyInfo) */
    privateKey: Uint8Array;
}
/**
 * RSA signature error - thrown when signing/verification fails
 */
export declare class RSAError extends Error {
    constructor(message: string);
}
/**
 * Generate RSA-4096 key pair for signing and verification
 *
 * Performance: <50ms on modern hardware
 *
 * Security: Private key is extractable by default (can be exported for storage).
 * For maximum security, consider non-extractable keys (cannot export).
 *
 * @returns Promise resolving to RSA key pair
 * @throws RSAError if key generation fails
 *
 * @example
 * ```typescript
 * // Generate device signing keys
 * const deviceKeys = await generateKeyPair();
 *
 * // Store private key securely (NEVER transmit!)
 * await secureStorage.store('device-private-key', deviceKeys.privateKey);
 *
 * // Share public key (safe to transmit)
 * const publicKeyBytes = await exportPublicKey(deviceKeys.publicKey);
 * await api.registerDevice({ publicKey: publicKeyBytes });
 * ```
 */
export declare function generateKeyPair(): Promise<RSAKeyPair>;
/**
 * Sign data with RSA private key using PSS padding
 *
 * Performance: <10ms on modern hardware
 *
 * Security: PSS padding includes random salt - same data produces different
 * signatures (but all verify correctly). This prevents signature malleability.
 *
 * @param data - Data to sign (typically hash of larger payload)
 * @param privateKey - RSA private key (NEVER share this!)
 * @returns Promise resolving to signature bytes
 * @throws RSAError if signing fails or key is invalid
 *
 * @example
 * ```typescript
 * // Sign backup hash
 * const backupHash = await crypto.subtle.digest('SHA-256', backupData);
 * const signature = await sign(new Uint8Array(backupHash), privateKey);
 *
 * // Include signature with backup
 * const signedBackup = {
 *   data: backupData,
 *   signature: signature,
 *   timestamp: Date.now()
 * };
 * ```
 */
export declare function sign(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array>;
/**
 * Verify RSA signature with public key
 *
 * Performance: <5ms on modern hardware (faster than signing)
 *
 * Security: Returns false (not exception) if verification fails. This enables
 * constant-time comparison in higher layers.
 *
 * @param data - Original data that was signed
 * @param signature - Signature to verify
 * @param publicKey - RSA public key (safe to share)
 * @returns Promise resolving to true if valid, false otherwise
 *
 * @example
 * ```typescript
 * // Server verifies backup signature
 * const isValid = await verify(backupHash, signature, devicePublicKey);
 *
 * if (!isValid) {
 *   throw new Error('Backup signature verification failed - possible tampering');
 * }
 * ```
 */
export declare function verify(data: Uint8Array, signature: Uint8Array, publicKey: CryptoKey): Promise<boolean>;
/**
 * Export key pair to standard formats for storage/transmission
 *
 * Public Key: SPKI format (X.509 SubjectPublicKeyInfo) - safe to share
 * Private Key: PKCS8 format (PKCS #8 PrivateKeyInfo) - NEVER transmit!
 *
 * @param keyPair - RSA key pair to export
 * @returns Promise resolving to exported keys
 * @throws RSAError if export fails
 *
 * @example
 * ```typescript
 * const keyPair = await generateKeyPair();
 * const exported = await exportKeyPair(keyPair);
 *
 * // Store private key locally (NEVER send to server!)
 * await secureStorage.store('device-private-key', exported.privateKey);
 *
 * // Send public key to server
 * await api.registerDevice({ publicKey: exported.publicKey });
 * ```
 */
export declare function exportKeyPair(keyPair: RSAKeyPair): Promise<ExportedKeyPair>;
/**
 * Export public key only (SPKI format)
 *
 * Convenience function for exporting just the public key.
 * Safe to transmit - this is public information.
 *
 * @param publicKey - RSA public key to export
 * @returns Promise resolving to SPKI-formatted public key
 * @throws RSAError if export fails
 */
export declare function exportPublicKey(publicKey: CryptoKey): Promise<Uint8Array>;
/**
 * Export private key only (PKCS8 format)
 *
 * ⚠️ WARNING: Private keys are secrets! Never transmit over network.
 * Use secure storage (IndexedDB, Secure Enclave, Android Keystore).
 *
 * @param privateKey - RSA private key to export
 * @returns Promise resolving to PKCS8-formatted private key
 * @throws RSAError if export fails
 */
export declare function exportPrivateKey(privateKey: CryptoKey): Promise<Uint8Array>;
/**
 * Import RSA public key from SPKI format
 *
 * SPKI (SubjectPublicKeyInfo) is the standard X.509 public key format.
 * Safe to receive from untrusted sources - public keys are public.
 *
 * @param publicKeyBytes - SPKI-formatted public key
 * @returns Promise resolving to CryptoKey (verify-only)
 * @throws RSAError if import fails or key is invalid
 *
 * @example
 * ```typescript
 * // Import device public key from server
 * const devicePublicKey = await importPublicKey(
 *   deviceCertificate.publicKey
 * );
 *
 * // Verify device signatures
 * const isValid = await verify(data, signature, devicePublicKey);
 * ```
 */
export declare function importPublicKey(publicKeyBytes: Uint8Array): Promise<CryptoKey>;
/**
 * Import RSA private key from PKCS8 format
 *
 * PKCS8 (PrivateKeyInfo) is the standard private key format.
 * ⚠️ Only import from trusted, secure sources!
 *
 * @param privateKeyBytes - PKCS8-formatted private key
 * @returns Promise resolving to CryptoKey (sign-only)
 * @throws RSAError if import fails or key is invalid
 *
 * @example
 * ```typescript
 * // Load device private key from secure storage
 * const privateKeyBytes = await secureStorage.load('device-private-key');
 * const privateKey = await importPrivateKey(privateKeyBytes);
 *
 * // Sign backup
 * const signature = await sign(backupHash, privateKey);
 * ```
 */
export declare function importPrivateKey(privateKeyBytes: Uint8Array): Promise<CryptoKey>;
/**
 * Get modulus length from CryptoKey (for verification/testing)
 *
 * @param key - RSA CryptoKey
 * @returns Modulus length in bits (should be 4096)
 */
export declare function getModulusLength(key: CryptoKey): number;
/**
 * Verify key pair matches (public key corresponds to private key)
 *
 * Signs test data with private key, verifies with public key.
 *
 * @param keyPair - RSA key pair to verify
 * @returns Promise resolving to true if keys match
 */
export declare function verifyKeyPairMatch(keyPair: RSAKeyPair): Promise<boolean>;
//# sourceMappingURL=rsa.d.ts.map