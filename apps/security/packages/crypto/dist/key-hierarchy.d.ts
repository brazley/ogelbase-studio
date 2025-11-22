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
/**
 * Error thrown by key hierarchy operations
 */
export declare class KeyHierarchyError extends Error {
    readonly cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
/**
 * User Master Key (UMK) - Root of key hierarchy
 *
 * The UMK is the foundational secret from which all other keys derive.
 *
 * Security Properties:
 * - 256-bit random value (cryptographically secure)
 * - NEVER transmitted to server
 * - NEVER stored unencrypted server-side
 * - Client-side storage only (IndexedDB, Secure Enclave, etc.)
 * - User responsible for backup (Shamir secret sharing recommended)
 *
 * Lifecycle:
 * - Generated once at account creation
 * - Rotation = complete account reset (destructive)
 * - Loss = permanent data loss (no recovery)
 */
export interface UserMasterKey {
    /** 256-bit master key (32 bytes) */
    key: Uint8Array;
}
/**
 * Device Master Key (DMK) - Per-device derived key
 *
 * Each device gets a unique DMK derived from the user's UMK.
 * This enables device-level key rotation and revocation.
 *
 * Derivation:
 * ```
 * DMK = HKDF(
 *   salt = deviceId,
 *   ikm = UMK,
 *   info = "ZKEB-DMK-v1",
 *   length = 32
 * )
 * ```
 *
 * Security Properties:
 * - Deterministic (same UMK + deviceId = same DMK)
 * - Device-specific (different deviceId = different DMK)
 * - Enables device revocation without affecting other devices
 *
 * Lifecycle:
 * - Generated at device registration
 * - Rotation = new device registration
 * - Revocation = delete device ID from server
 */
export interface DeviceMasterKey {
    /** 256-bit device master key (32 bytes) */
    key: Uint8Array;
    /** Device identifier used in derivation */
    deviceId: string;
}
/**
 * Device Encryption Keys - Purpose-specific keys
 *
 * Derived from DMK for specific encryption purposes.
 * Separating keys prevents key reuse and enables independent rotation.
 *
 * BEK (Backup Encryption Key):
 * ```
 * BEK = HKDF(
 *   salt = "backup",
 *   ikm = DMK,
 *   info = "ZKEB-BEK-v1",
 *   length = 32
 * )
 * ```
 *
 * MEK (Metadata Encryption Key):
 * ```
 * MEK = HKDF(
 *   salt = "metadata",
 *   ikm = DMK,
 *   info = "ZKEB-MEK-v1",
 *   length = 32
 * )
 * ```
 *
 * Security Properties:
 * - Independent keys (BEK compromise doesn't affect MEK)
 * - Rotatable without changing DMK
 * - Purpose-bound (context strings prevent key confusion)
 */
export interface DeviceKeys {
    /** Backup Encryption Key (BEK) - encrypts backup payloads */
    backupEncryptionKey: Uint8Array;
    /** Metadata Encryption Key (MEK) - encrypts backup metadata */
    metadataEncryptionKey: Uint8Array;
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
export declare function generateUserMasterKey(): Promise<UserMasterKey>;
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
export declare function deriveDeviceMasterKey(umk: UserMasterKey, deviceId: string): Promise<DeviceMasterKey>;
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
export declare function deriveDeviceKeys(dmk: DeviceMasterKey): Promise<DeviceKeys>;
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
export declare function deriveKeysFromUMK(umk: UserMasterKey, deviceId: string): Promise<{
    dmk: DeviceMasterKey;
    keys: DeviceKeys;
}>;
//# sourceMappingURL=key-hierarchy.d.ts.map