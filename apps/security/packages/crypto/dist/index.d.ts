/**
 * ZKEB Cryptography Library
 *
 * This package provides cryptographic primitives for ZKEB:
 * - HKDF: Key derivation (RFC 5869)
 * - AES-256-GCM: Authenticated encryption (NIST SP 800-38D)
 *
 * All implementations use native WebCrypto API for maximum performance and security.
 *
 * @module @security/crypto
 */
export { hkdf, hkdfExtract, hkdfExpand } from './hkdf';
export { encrypt, decrypt, generateKey, generateNonce, encryptString, decryptString, AESGCMError, type EncryptedData } from './aes-gcm';
//# sourceMappingURL=index.d.ts.map