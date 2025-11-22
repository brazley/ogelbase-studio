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

// HKDF - Key Derivation Function (RFC 5869)
export { hkdf, hkdfExtract, hkdfExpand } from './hkdf';

// AES-256-GCM - Authenticated Encryption (NIST SP 800-38D)
export {
  encrypt,
  decrypt,
  generateKey,
  generateNonce,
  encryptString,
  decryptString,
  AESGCMError,
  type EncryptedData
} from './aes-gcm';
