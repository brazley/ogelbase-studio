# ZKEB Crypto Implementation: Quick Start Guide

**Full Specification**: See `QUANTUM-crypto-implementation.md` (40 pages, ~14,000 words)

This quick start provides the critical information needed to begin implementation immediately.

---

## TL;DR: What We're Building

**Goal**: Port iOS Security Module (Swift/CryptoKit) → TypeScript/WebCrypto for Railway cloud deployment.

**Core Principle**: Server never sees keys. Client-side encryption only. Zero-knowledge guarantee.

**Timeline**: 2 weeks (10 working days)

**Key Deliverable**: `@zkeb/crypto` package (~4,000 lines production code + 1,100 lines tests)

---

## Critical Path: Day-by-Day

| Day | Task | Deliverable | Owner |
|-----|------|-------------|-------|
| **1-2** | Core primitives (HKDF, AES-GCM, SHA-256) | `src/core/*.ts` | Web Dev Agent |
| **3-4** | Key management + IndexedDB storage | `src/client/key-management.ts` | Web Dev Agent |
| **5-6** | Main client + server interfaces | `src/client/zkeb-client.ts` | Web Dev Agent |
| **7-8** | Security verification tests | `tests/security.test.ts` | Security Agent |
| **9-10** | Performance benchmarks + iOS interop | `benchmarks/*.ts` | Web Dev Agent |

---

## The One Custom Implementation: HKDF

**Why Custom**: WebCrypto doesn't expose HKDF. Must implement RFC 5869.

**Lines of Code**: ~100 lines (see full implementation in main spec, Section 1.2)

**Test Strategy**: RFC 5869 official test vectors + cross-check with iOS output

**Security Critical**: This is the foundation of key derivation. External audit required.

---

## Zero-Knowledge Guarantee: The Core Test

```typescript
it("server cannot decrypt user data", async () => {
  const client = new ZKEBClient();
  const plaintext = "SSN: 123-45-6789";

  // Client encrypts
  const encrypted = await client.encryptString(
    plaintext,
    DataClassification.Restricted
  );

  // Server stores (opaque blob)
  const server = new ZKEBServer();
  const blobId = await server.storeBlob(encrypted);

  // Server retrieves
  const blob = await server.retrieveBlob(blobId);

  // VERIFY: Ciphertext doesn't leak plaintext
  const ct = new TextDecoder().decode(blob.ciphertext);
  expect(ct).not.toContain("123-45-6789");

  // VERIFY: Server has no decrypt function
  expect(() => (server as any).decrypt(blob)).toThrow();
});
```

This test MUST pass before deployment.

---

## File-by-File Porting Checklist

### iOS → TypeScript Mapping

| iOS File | TypeScript File | Status | Notes |
|----------|----------------|--------|-------|
| `EncryptionService.swift` (495 lines) | `zkeb-client.ts` (400 lines) | 🔴 Not Started | Main client interface |
| `KeychainService.swift` (269 lines) | `storage.ts` (200 lines) | 🔴 Not Started | IndexedDB replaces Keychain |
| `BiometricAuthService.swift` | *Not Ported* | ✅ Skipped | Web doesn't have biometric APIs |
| `SecureModels.swift` (283 lines) | `types/*.ts` (130 lines) | 🔴 Not Started | Data models |

**Key Changes**:
- iOS Keychain → IndexedDB (client-side)
- iOS Secure Enclave → Browser WebCrypto
- Biometric auth → Password-based (web limitation)

---

## Performance Targets (Must Meet)

| Operation | iOS | Target (Web) | Current | Status |
|-----------|-----|--------------|---------|--------|
| AES-256-GCM (1KB) | 0.3ms | <1ms | TBD | 🔴 |
| AES-256-GCM (1MB) | 3ms | <10ms | TBD | 🔴 |
| HKDF derivation | 2ms | <5ms | TBD | 🔴 |
| PBKDF2 (600k iter) | 150ms | <200ms | TBD | 🔴 |

Run benchmarks: `npm run bench`

---

## Security Verification Checklist

Before production deployment, ALL must pass:

- [ ] **Zero-Knowledge Test**: Server cannot decrypt (see test above)
- [ ] **Key Isolation Test**: Keys never transmitted to server
- [ ] **Tampering Test**: Modified ciphertext rejected (auth tag verification)
- [ ] **Timing Attack Test**: Constant-time decryption (<5% variance)
- [ ] **iOS Interop Test**: TS decrypts iOS-encrypted data
- [ ] **HKDF Test Vectors**: RFC 5869 official vectors match
- [ ] **External Audit**: Security firm review (Trail of Bits, NCC Group)

---

## The One Thing That's Different: HKDF

Everything else in WebCrypto is a direct mapping:
- ✅ AES-256-GCM: `crypto.subtle.encrypt()`
- ✅ SHA-256: `crypto.subtle.digest()`
- ✅ RSA-4096-PSS: `crypto.subtle.generateKey()`
- ✅ PBKDF2: `crypto.subtle.deriveKey()`

But HKDF requires custom implementation:
- ⚠️ HKDF: Custom 100-line RFC 5869 implementation

**Critical**: This custom code is security-critical. Must be:
1. Tested against RFC 5869 official test vectors
2. Cross-validated with iOS CryptoKit output
3. Externally audited by security firm

---

## Quick Commands

```bash
# Install dependencies
npm install

# Run tests (must all pass)
npm test

# Run benchmarks (verify performance)
npm run bench

# Build for production
npm run build

# Deploy to Railway
railway up
```

---

## Risk Mitigation: Top 3 Risks

1. **HKDF Implementation Bug** (Likelihood: Low, Impact: Critical)
   - **Mitigation**: RFC test vectors + external audit + iOS cross-check

2. **Server Compromise** (Likelihood: Medium, Impact: **None**)
   - **Mitigation**: Zero-knowledge architecture (server has no keys to compromise)

3. **WebCrypto Not Available** (Likelihood: Low, Impact: High)
   - **Mitigation**: Feature detection + fallback to pure JS (slower but functional)

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **WebCrypto only** | No external crypto deps → minimize supply chain risk |
| **Client-side keys only** | Zero-knowledge guarantee → server never sees keys |
| **AES-256-GCM** | Industry standard, hardware-accelerated, FIPS-validated |
| **IndexedDB storage** | Client-side persistent storage, browser-encrypted |
| **TypeScript** | Type safety for security-critical code |

---

## Example Usage (Target API)

```typescript
import { ZKEBClient, DataClassification } from '@zkeb/crypto';

// Initialize client
const client = new ZKEBClient();

// Encrypt sensitive data
const plaintext = new TextEncoder().encode("SSN: 123-45-6789");
const encrypted = await client.encrypt(
  plaintext,
  DataClassification.Restricted // Maximum security
);

// Server stores opaque blob (cannot decrypt)
await fetch('/api/blobs', {
  method: 'POST',
  body: JSON.stringify(encrypted)
});

// Later: Client retrieves and decrypts
const response = await fetch('/api/blobs/123');
const encryptedBlob = await response.json();
const decrypted = await client.decrypt(encryptedBlob);

console.log(new TextDecoder().decode(decrypted)); // "SSN: 123-45-6789"
```

Server NEVER sees "SSN: 123-45-6789" in plaintext. Only opaque ciphertext.

---

## Success Criteria

Implementation complete when:
1. ✅ All tests passing (>95% coverage)
2. ✅ Zero-knowledge guarantee verified
3. ✅ iOS ↔ TS interoperability confirmed
4. ✅ Performance targets met
5. ✅ External security audit passed
6. ✅ Deployed to Railway (health checks green)

---

## References

- **Full Spec**: `QUANTUM-crypto-implementation.md` (40 pages)
- **Architecture**: `.SoT/ZKEB_CLOUD_ARCHITECTURE.md` (2,070 lines)
- **iOS Source**: `/Users/quikolas/Documents/GitHub/Base/Security/`
- **RFC 5869**: HKDF specification (https://tools.ietf.org/html/rfc5869)

---

## Contact

**Architect**: QUANTUM (Applied Cryptography & Implementation)
**Date**: 2025-01-22
**Status**: Ready for Implementation

Begin with Day 1: HKDF implementation. Full specification in main document.
