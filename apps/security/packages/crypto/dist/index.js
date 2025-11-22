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
// HKDF - Key Derivation Function (RFC 5869)
export { hkdf, hkdfExtract, hkdfExpand } from './hkdf.js';
// AES-256-GCM - Authenticated Encryption (NIST SP 800-38D)
export { encrypt, decrypt, generateKey, generateNonce, encryptString, decryptString, AESGCMError } from './aes-gcm.js';
// Key Hierarchy - ZKEB Key Management
export { generateUserMasterKey, deriveDeviceMasterKey, deriveDeviceKeys, deriveKeysFromUMK, KeyHierarchyError } from './key-hierarchy.js';
// PBKDF2 - Password-Based Key Derivation (RFC 2898)
export { deriveKeyFromPassword, verifyPassword, generateSalt, PBKDF2_CONSTANTS } from './pbkdf2.js';
// RSA-4096-PSS - Digital Signatures
export { generateKeyPair, sign, verify, exportKeyPair, exportPublicKey, exportPrivateKey, importPublicKey, importPrivateKey, getModulusLength, verifyKeyPairMatch, RSAError } from './rsa.js';
//# sourceMappingURL=index.js.map