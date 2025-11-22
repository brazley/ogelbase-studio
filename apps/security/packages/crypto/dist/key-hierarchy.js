/**
 * ZKEB Key Hierarchy - Hierarchical Key Derivation
 *
 * Implements a three-tier key hierarchy for ZKEB:
 * 1. User Master Key (UMK) - Root of trust, client-side only
 * 2. Device Master Key (DMK) - Per-device key derived from UMK
 * 3. Encryption Keys (BEK, MEK) - Purpose-specific keys derived from DMK
 *
 * Key Properties:
 * - Deterministic: Same inputs always produce same outputs
 * - Key Separation: Different keys for different purposes
 * - Key Rotation: Rotate child keys without changing parents
 * - Multi-Device: Different DMKs per device, same UMK
 *
 * Security Model:
 * - UMK: NEVER transmitted, stored only client-side (IndexedDB/Secure Enclave)
 * - DMK: Derived per-device, enables device revocation
 * - BEK: Encrypts backup payloads
 * - MEK: Encrypts backup metadata
 *
 * @module key-hierarchy
 */
import { hkdf } from './hkdf.js';
/**
 * Key derivation context strings - MUST match iOS implementation
 * These bind derived keys to specific purposes (domain separation)
 */
const CONTEXT_DMK = 'ZKEB-DMK-v1'; // Device Master Key context
const CONTEXT_BEK = 'ZKEB-BEK-v1'; // Backup Encryption Key context
const CONTEXT_MEK = 'ZKEB-MEK-v1'; // Metadata Encryption Key context
/**
 * Salt strings for key derivation
 * Use human-readable salts for debugging and auditability
 */
const SALT_BACKUP = 'backup';
const SALT_METADATA = 'metadata';
/**
 * Key length (256 bits / 32 bytes for all keys)
 */
const KEY_LENGTH = 32;
/**
 * Error thrown by key hierarchy operations
 */
export class KeyHierarchyError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'KeyHierarchyError';
    }
}
/**
 * Generate new User Master Key (UMK)
 *
 * Creates a cryptographically secure 256-bit random key.
 * This is the root of trust for the entire key hierarchy.
 *
 * **WARNING**: The UMK MUST be stored securely client-side and NEVER transmitted.
 * Loss of UMK = permanent data loss (no recovery).
 *
 * Recommended storage:
 * - Browser: IndexedDB with encryption at rest
 * - iOS: Secure Enclave with biometric protection
 * - Android: Android Keystore with biometric protection
 *
 * @returns New User Master Key
 *
 * @example
 * ```typescript
 * // Generate UMK at account creation
 * const umk = await generateUserMasterKey();
 *
 * // Store securely (implementation-dependent)
 * await secureStorage.store('umk', umk.key);
 *
 * // NEVER send to server
 * // NEVER log
 * ```
 */
export async function generateUserMasterKey() {
    // Generate 256-bit cryptographically secure random key
    const key = new Uint8Array(KEY_LENGTH);
    crypto.getRandomValues(key);
    return { key };
}
/**
 * Derive Device Master Key (DMK) from User Master Key (UMK)
 *
 * Creates a device-specific key using HKDF with device ID as salt.
 * This enables multi-device support and per-device key rotation.
 *
 * Derivation:
 * ```
 * DMK = HKDF-Extract-Expand(
 *   salt = deviceId (UTF-8 bytes),
 *   ikm = UMK,
 *   info = "ZKEB-DMK-v1",
 *   length = 32
 * )
 * ```
 *
 * Properties:
 * - Deterministic: Same UMK + deviceId always produces same DMK
 * - Device-specific: Different deviceId produces different DMK
 * - Independent: DMKs for different devices are cryptographically independent
 *
 * @param umk - User Master Key (root of key hierarchy)
 * @param deviceId - Unique device identifier (e.g., UUID, device token)
 * @returns Device Master Key for specified device
 * @throws KeyHierarchyError if derivation fails or inputs are invalid
 *
 * @example
 * ```typescript
 * const umk = await generateUserMasterKey();
 * const deviceId = 'device-123-abc';
 *
 * const dmk = await deriveDeviceMasterKey(umk, deviceId);
 *
 * // Same inputs = same output (deterministic)
 * const dmk2 = await deriveDeviceMasterKey(umk, deviceId);
 * // dmk.key equals dmk2.key
 *
 * // Different device = different key
 * const dmkOtherDevice = await deriveDeviceMasterKey(umk, 'device-456-def');
 * // dmk.key NOT equal to dmkOtherDevice.key
 * ```
 */
export async function deriveDeviceMasterKey(umk, deviceId) {
    // Validate inputs
    if (!umk?.key || umk.key.length !== KEY_LENGTH) {
        throw new KeyHierarchyError(`Invalid UMK: expected ${KEY_LENGTH} bytes, got ${umk?.key?.length ?? 0} bytes`);
    }
    if (!deviceId || deviceId.trim().length === 0) {
        throw new KeyHierarchyError('Device ID cannot be empty');
    }
    try {
        // Convert device ID to bytes for use as salt
        const deviceIdBytes = new TextEncoder().encode(deviceId);
        // Convert context string to bytes
        const contextBytes = new TextEncoder().encode(CONTEXT_DMK);
        // Derive DMK using HKDF
        // salt = deviceId (device-specific)
        // ikm = UMK (input keying material)
        // info = "ZKEB-DMK-v1" (context binding)
        // length = 32 (256 bits)
        const dmkKey = await hkdf(deviceIdBytes, umk.key, contextBytes, KEY_LENGTH);
        return {
            key: dmkKey,
            deviceId
        };
    }
    catch (error) {
        throw new KeyHierarchyError('Failed to derive Device Master Key', error);
    }
}
/**
 * Derive encryption keys from Device Master Key (DMK)
 *
 * Creates purpose-specific encryption keys from DMK:
 * - BEK (Backup Encryption Key): Encrypts backup payloads
 * - MEK (Metadata Encryption Key): Encrypts backup metadata
 *
 * Key Separation:
 * Different salts and contexts ensure BEK and MEK are cryptographically
 * independent. Compromise of one key doesn't affect the other.
 *
 * Derivation:
 * ```
 * BEK = HKDF(salt="backup", ikm=DMK, info="ZKEB-BEK-v1", length=32)
 * MEK = HKDF(salt="metadata", ikm=DMK, info="ZKEB-MEK-v1", length=32)
 * ```
 *
 * @param dmk - Device Master Key
 * @returns Backup and metadata encryption keys
 * @throws KeyHierarchyError if derivation fails or DMK is invalid
 *
 * @example
 * ```typescript
 * const umk = await generateUserMasterKey();
 * const dmk = await deriveDeviceMasterKey(umk, 'device-123');
 * const keys = await deriveDeviceKeys(dmk);
 *
 * // Use BEK for backup encryption
 * const encrypted = await encrypt(backupData, keys.backupEncryptionKey);
 *
 * // Use MEK for metadata encryption
 * const encryptedMeta = await encrypt(metadata, keys.metadataEncryptionKey);
 * ```
 */
export async function deriveDeviceKeys(dmk) {
    // Validate DMK
    if (!dmk?.key || dmk.key.length !== KEY_LENGTH) {
        throw new KeyHierarchyError(`Invalid DMK: expected ${KEY_LENGTH} bytes, got ${dmk?.key?.length ?? 0} bytes`);
    }
    try {
        // Derive Backup Encryption Key (BEK)
        const bekSalt = new TextEncoder().encode(SALT_BACKUP);
        const bekContext = new TextEncoder().encode(CONTEXT_BEK);
        const backupEncryptionKey = await hkdf(bekSalt, dmk.key, bekContext, KEY_LENGTH);
        // Derive Metadata Encryption Key (MEK)
        const mekSalt = new TextEncoder().encode(SALT_METADATA);
        const mekContext = new TextEncoder().encode(CONTEXT_MEK);
        const metadataEncryptionKey = await hkdf(mekSalt, dmk.key, mekContext, KEY_LENGTH);
        return {
            backupEncryptionKey,
            metadataEncryptionKey
        };
    }
    catch (error) {
        throw new KeyHierarchyError('Failed to derive device keys', error);
    }
}
/**
 * Derive complete key hierarchy from UMK
 *
 * Convenience function that derives DMK and encryption keys in one call.
 * Equivalent to calling deriveDeviceMasterKey() then deriveDeviceKeys().
 *
 * Key Hierarchy:
 * ```
 * UMK (User Master Key)
 *   └─ DMK (Device Master Key, device-specific)
 *       ├─ BEK (Backup Encryption Key)
 *       └─ MEK (Metadata Encryption Key)
 * ```
 *
 * @param umk - User Master Key
 * @param deviceId - Unique device identifier
 * @returns Device Master Key and derived encryption keys
 * @throws KeyHierarchyError if derivation fails
 *
 * @example
 * ```typescript
 * // Generate UMK once at account creation
 * const umk = await generateUserMasterKey();
 *
 * // Derive all keys for a device
 * const { dmk, keys } = await deriveKeysFromUMK(umk, 'device-123');
 *
 * // Use keys immediately
 * const encrypted = await encrypt(data, keys.backupEncryptionKey);
 *
 * // For another device (same UMK, different DMK/keys)
 * const device2 = await deriveKeysFromUMK(umk, 'device-456');
 * ```
 */
export async function deriveKeysFromUMK(umk, deviceId) {
    // Derive DMK from UMK
    const dmk = await deriveDeviceMasterKey(umk, deviceId);
    // Derive encryption keys from DMK
    const keys = await deriveDeviceKeys(dmk);
    return { dmk, keys };
}
//# sourceMappingURL=key-hierarchy.js.map