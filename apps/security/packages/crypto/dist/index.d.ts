/**
 * ZKEB Cryptography Library
 *
 * This package provides cryptographic primitives for ZKEB:
 * - HKDF: Key derivation (RFC 5869)
 * - AES-256-GCM: Authenticated encryption (NIST SP 800-38D)
 * - Key Hierarchy: UMK → DMK → BEK/MEK (ZKEB key management)
 * - PBKDF2: Password-based key derivation (RFC 2898, OWASP 2023: 600k iterations)
 * - RSA-4096-PSS: Digital signatures for device authentication and backup integrity
 *
 * All implementations use native WebCrypto API for maximum performance and security.
 *
 * @module @security/crypto
 */
export { hkdf, hkdfExtract, hkdfExpand } from './hkdf.js';
export { encrypt, decrypt, generateKey, generateNonce, encryptString, decryptString, AESGCMError, type EncryptedData } from './aes-gcm.js';
export { generateUserMasterKey, deriveDeviceMasterKey, deriveDeviceKeys, deriveKeysFromUMK, KeyHierarchyError, type UserMasterKey, type DeviceMasterKey, type DeviceKeys } from './key-hierarchy.js';
export { deriveKeyFromPassword, verifyPassword, generateSalt, PBKDF2_CONSTANTS, type DerivedKey } from './pbkdf2.js';
export { generateKeyPair, sign, verify, exportKeyPair, exportPublicKey, exportPrivateKey, importPublicKey, importPrivateKey, getModulusLength, verifyKeyPairMatch, RSAError, type RSAKeyPair, type ExportedKeyPair } from './rsa.js';
//# sourceMappingURL=index.d.ts.map