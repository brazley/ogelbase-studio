# ZKEB Cryptographic Architecture: Visual Reference

**Quick reference for implementation team**

---

## Key Hierarchy Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Password (PW)                           │
│                    "SecurePassword123!"                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼ PBKDF2 (600k iterations)
                ┌────────────────────────────┐
                │  Password-Derived Key (PDK) │
                │  (AES-256 key)              │
                └────────────┬────────────────┘
                             │
                             │ Wraps/Unwraps
                             ▼
                ┌────────────────────────────┐
                │  User Master Key (UMK)     │  ← Generated once
                │  (AES-256, 256 bits)       │    Stored encrypted (IndexedDB)
                └────────────┬────────────────┘
                             │
                ┌────────────┴────────────┐
                │ HKDF-SHA256             │
                │ salt: device_id_bytes   │
                │ info: "ZKEB-Cloud-DMK"  │
                └────────────┬────────────┘
                             ▼
                ┌────────────────────────────┐
                │  Device Master Key (DMK)   │  ← Per-device key
                │  (AES-256, 256 bits)       │
                └────────────┬────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌───────────────────┐   ┌───────────────────┐
    │ Backup Enc Key    │   │ Metadata Enc Key  │
    │ (BEK)             │   │ (MEK)             │
    │ HKDF(DMK,"backup")│   │ HKDF(DMK,"meta")  │
    └───────────────────┘   └───────────────────┘
             │                       │
             ▼                       ▼
    [Backup Data]           [Metadata]
     Encrypted               Encrypted
```

**Key Properties**:
- UMK never leaves client (stored encrypted in IndexedDB)
- Server NEVER sees UMK, DMK, BEK, or MEK
- Password loss = data loss (by design for zero-knowledge)
- Recovery via Shamir secret sharing (optional)

---

## Encryption Flow (Client → Server)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  1. Plaintext Data                                              │
│     "SSN: 123-45-6789"                                          │
│                                                                 │
│  2. Retrieve Key from IndexedDB (encrypted)                     │
│     UMK (wrapped with password) → Unwrap → UMK                  │
│                                                                 │
│  3. Generate Nonce (12 bytes random)                            │
│     crypto.getRandomValues(new Uint8Array(12))                  │
│                                                                 │
│  4. AES-256-GCM Encryption                                      │
│     ┌──────────────────────────────────────┐                   │
│     │ Plaintext: "SSN: 123-45-6789"        │                   │
│     │ Key: UMK (256 bits)                  │                   │
│     │ Nonce: [12 random bytes]             │                   │
│     │ Algorithm: AES-GCM                   │                   │
│     └──────────────┬───────────────────────┘                   │
│                    │                                            │
│                    ▼                                            │
│     ┌──────────────────────────────────────┐                   │
│     │ Ciphertext: [opaque bytes]           │                   │
│     │ Tag: [16 bytes, authentication]      │                   │
│     └──────────────┬───────────────────────┘                   │
│                    │                                            │
│  5. Package EncryptedData                                       │
│     {                                                           │
│       ciphertext: Uint8Array,                                   │
│       nonce: Uint8Array,                                        │
│       tag: Uint8Array,                                          │
│       classification: "Restricted",                             │
│       algorithm: "AES-256-GCM"                                  │
│     }                                                           │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS POST /api/blobs
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER (Railway/Node.js)                     │
│                                                                 │
│  1. Receive EncryptedData (opaque blob)                         │
│     Server sees: ciphertext, nonce, tag                         │
│     Server CANNOT see: plaintext, key                           │
│                                                                 │
│  2. Store in PostgreSQL                                         │
│     INSERT INTO encrypted_blobs (                               │
│       ciphertext,    -- Opaque bytes                            │
│       nonce,         -- Public (needed for decryption)          │
│       auth_tag,      -- Public (authentication)                 │
│       size_bytes,    -- Metadata (ciphertext size)              │
│       created_at     -- Timestamp                               │
│     )                                                           │
│                                                                 │
│  3. Return blob_id                                              │
│     { blobId: "uuid-1234-5678" }                                │
│                                                                 │
│  ❌ FORBIDDEN OPERATIONS:                                       │
│     - decrypt(ciphertext, key)  ← Server has no key!           │
│     - inspect plaintext          ← Opaque to server             │
│     - derive keys                ← No password/master key       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Zero-Knowledge Guarantee**: At no point does the server possess the cryptographic capability to decrypt user data.

---

## Decryption Flow (Server → Client)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER (Railway/Node.js)                     │
│                                                                 │
│  1. Receive request: GET /api/blobs/:id                         │
│                                                                 │
│  2. Query PostgreSQL                                            │
│     SELECT ciphertext, nonce, auth_tag, ...                     │
│     FROM encrypted_blobs WHERE id = :id                         │
│                                                                 │
│  3. Return EncryptedData (opaque blob)                          │
│     {                                                           │
│       ciphertext: [opaque bytes],                               │
│       nonce: [12 bytes],                                        │
│       tag: [16 bytes],                                          │
│       ...                                                       │
│     }                                                           │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS Response
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  1. Receive EncryptedData                                       │
│                                                                 │
│  2. Retrieve Key from IndexedDB                                 │
│     Password → PDK → Unwrap → UMK                               │
│                                                                 │
│  3. AES-256-GCM Decryption                                      │
│     ┌──────────────────────────────────────┐                   │
│     │ Ciphertext: [opaque bytes]           │                   │
│     │ Nonce: [12 bytes]                    │                   │
│     │ Tag: [16 bytes]                      │                   │
│     │ Key: UMK (256 bits)                  │                   │
│     │ Algorithm: AES-GCM                   │                   │
│     └──────────────┬───────────────────────┘                   │
│                    │                                            │
│                    ▼ crypto.subtle.decrypt()                    │
│     ┌──────────────────────────────────────┐                   │
│     │ ✅ Tag Valid: Authenticated          │                   │
│     │ Plaintext: "SSN: 123-45-6789"        │                   │
│     └──────────────────────────────────────┘                   │
│                                                                 │
│  4. Use plaintext in application                                │
│     Display to user, process, etc.                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Authentication Tag Verification**: If ciphertext is tampered with, tag verification fails → decryption aborts → data integrity guaranteed.

---

## HKDF Key Derivation (The Custom Implementation)

```
Input Keying Material (IKM):  UMK (256 bits, from crypto.getRandomValues)
Salt:                         device_id_hash (32 bytes, SHA-256)
Info:                         "ZKEB-Cloud-DMK-v1" (UTF-8 bytes)
Desired Output Length:        32 bytes (256 bits)

Step 1: HKDF-Extract
──────────────────────────────────────────────────────────────
PRK = HMAC-SHA256(salt, IKM)

  Key:   salt (32 bytes)
  Data:  IKM (32 bytes)
  ↓
  HMAC-SHA256
  ↓
  PRK (32 bytes, pseudorandom key)

Step 2: HKDF-Expand
──────────────────────────────────────────────────────────────
OKM = T(1) | T(2) | ... | T(N)

Where:
  T(0) = empty string
  T(i) = HMAC-SHA256(PRK, T(i-1) | info | i)  for i = 1..N

N = ceil(L / HashLen) = ceil(32 / 32) = 1

T(1) = HMAC-SHA256(PRK, "" | "ZKEB-Cloud-DMK-v1" | 0x01)

  Key:   PRK (32 bytes)
  Data:  "ZKEB-Cloud-DMK-v1" + byte(0x01)
  ↓
  HMAC-SHA256
  ↓
  T(1) (32 bytes)

OKM = T(1)[0..32] = T(1) (exactly 32 bytes)

Output:
──────────────────────────────────────────────────────────────
DMK = OKM (32 bytes, Device Master Key)
```

**Security Properties**:
- Computationally indistinguishable from random oracle
- Collision resistance from HMAC-SHA256
- Different `info` strings → different output keys (domain separation)

**Implementation**: ~100 lines TypeScript (see full code in main spec)

---

## Data Classification Levels

```
┌─────────────────────────────────────────────────────────────────┐
│  PUBLIC                                                         │
│  • No encryption                                                │
│  • Example: Public profile info, avatar URLs                   │
│  • Algorithm: None                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  INTERNAL                                                       │
│  • Standard encryption (AES-256-GCM)                            │
│  • Example: Email addresses, first/last names                  │
│  • Algorithm: AES-256-GCM                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CONFIDENTIAL                                                   │
│  • Enhanced encryption (AES-256-GCM + additional protections)   │
│  • Example: Date of birth, phone numbers, addresses            │
│  • Algorithm: AES-256-GCM                                       │
│  • Additional: Rate limiting on access                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  RESTRICTED                                                     │
│  • Maximum encryption (AES-256-GCM + biometric protection)      │
│  • Example: SSN, credit cards, medical records                 │
│  • Algorithm: AES-256-GCM                                       │
│  • Additional: Re-authentication required (password)            │
│  • iOS: Biometric (Face ID/Touch ID)                           │
│  • Web: Password re-entry (web limitation)                     │
└─────────────────────────────────────────────────────────────────┘
```

**Note**: All classifications except PUBLIC use the same AES-256-GCM algorithm. "Enhanced" and "Maximum" refer to additional access controls, not different crypto.

---

## Storage Architecture

### Client-Side (IndexedDB)

```
IndexedDB Database: "zkeb-keystore"
Object Store: "keys"

Structure:
┌────────────────────────────────────────────────────────────┐
│ Key (keyPath): classification                              │
│                                                            │
│ Value: {                                                   │
│   classification: "Confidential",                         │
│   wrappedKey: Uint8Array,    // Encrypted key material    │
│   salt: Uint8Array,          // PBKDF2 salt               │
│   iv: Uint8Array,            // AES-GCM nonce             │
│   iterations: 600000,        // PBKDF2 iterations         │
│   algorithm: "PBKDF2-AES-256-GCM",                        │
│   createdAt: Date,                                        │
│   lastAccessed: Date                                      │
│ }                                                          │
└────────────────────────────────────────────────────────────┘

Security:
  • Browser encrypts IndexedDB at rest (OS-level)
  • Keys wrapped with user password (PBKDF2 + AES-GCM)
  • Double encryption: password-wrapped + OS-encrypted
```

### Server-Side (PostgreSQL)

```
Table: encrypted_blobs
┌────────────────────────────────────────────────────────────┐
│ id                UUID PRIMARY KEY                         │
│ user_id           UUID (hashed, not plaintext)             │
│ ciphertext        BYTEA (opaque to server)                 │
│ nonce             BYTEA (12 bytes, public)                 │
│ auth_tag          BYTEA (16 bytes, public)                 │
│ classification    VARCHAR(50)                              │
│ size_bytes        INTEGER                                  │
│ created_at        TIMESTAMPTZ                              │
│ updated_at        TIMESTAMPTZ                              │
│ signature         BYTEA (client signature, optional)       │
└────────────────────────────────────────────────────────────┘

Security:
  • NO encryption keys stored
  • Ciphertext is opaque (server cannot interpret)
  • User ID hashed (SHA-256) for unlinkability
  • Audit logs hash all PII (IP addresses, user agents)
```

---

## Attack Surface Analysis

### Client-Side Attacks

```
┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector: XSS (Cross-Site Scripting)                      │
├─────────────────────────────────────────────────────────────────┤
│ Threat: Malicious JS steals keys from memory/IndexedDB         │
│ Mitigation:                                                     │
│   • Content Security Policy (CSP): script-src 'self'           │
│   • Subresource Integrity (SRI): hash all JS bundles          │
│   • No inline scripts allowed                                  │
│   • HTTPOnly cookies (if using sessions)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector: Malicious Server (Code Injection)               │
├─────────────────────────────────────────────────────────────────┤
│ Threat: Compromised server serves backdoored JS                │
│ Mitigation:                                                     │
│   • Subresource Integrity (SRI): Browser verifies hash         │
│   • Progressive Web App (PWA): Cached code, offline-first      │
│   • Service Worker: Code pinning (never fetch from network)    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector: Timing Side-Channels                            │
├─────────────────────────────────────────────────────────────────┤
│ Threat: Adversary measures decryption time to infer key bits   │
│ Mitigation:                                                     │
│   • Constant-time comparison (tag verification)                │
│   • Noise injection (random delays)                            │
│   • WebCrypto is generally constant-time (browser impl)        │
└─────────────────────────────────────────────────────────────────┘
```

### Server-Side Attacks

```
┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector: Server Compromise (Full Database Access)        │
├─────────────────────────────────────────────────────────────────┤
│ Threat: Adversary reads all data in PostgreSQL                 │
│ Impact: NONE (zero-knowledge guarantee)                        │
│ Why: Server has ciphertext but no keys to decrypt              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector: Legal Compulsion (Government Subpoena)          │
├─────────────────────────────────────────────────────────────────┤
│ Threat: Court order demands user data                          │
│ Response: Server provides encrypted blobs (opaque)             │
│ Impact: NONE (adversary cannot decrypt without key)            │
│ Legal: "We mathematically cannot access user data"             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Attack Vector: Metadata Leakage (Traffic Analysis)             │
├─────────────────────────────────────────────────────────────────┤
│ Threat: Adversary analyzes blob sizes, access patterns         │
│ Mitigation:                                                     │
│   • Pad blobs to fixed sizes (e.g., 1KB, 10KB, 100KB)         │
│   • Encrypt metadata (timestamps, user IDs hashed)             │
│   • Dummy requests (mask access patterns)                      │
│   • Tor/VPN recommended for maximum privacy                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Sequence (Visual)

```
Week 1: Core Cryptographic Primitives
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Day 1-2: Foundation
┌─────────────┐
│ HKDF.ts     │ ← CRITICAL: Custom implementation (RFC 5869)
└──────┬──────┘
       │
       ├─────────────┐
       │             │
┌──────▼───────┐  ┌─▼──────────┐
│ encryption.ts│  │ hash.ts    │
│ (AES-256-GCM)│  │ (SHA-256)  │
└──────────────┘  └────────────┘

Day 3-4: Key Management
┌──────────────────┐
│ key-management.ts│ ← UMK → DMK → BEK/MEK hierarchy
└────────┬─────────┘
         │
         │
┌────────▼─────────┐
│ storage.ts       │ ← IndexedDB encrypted storage
└──────────────────┘


Week 2: Integration & Security Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Day 5-6: Main Interfaces
┌──────────────────┐       ┌──────────────────┐
│ zkeb-client.ts   │       │ zkeb-server.ts   │
│ (Client API)     │       │ (Server API)     │
│ • encrypt()      │       │ • storeBlob()    │
│ • decrypt()      │       │ • retrieveBlob() │
│ • generateKey()  │       │ • verifySign()   │
└──────────────────┘       └──────────────────┘

Day 7-8: Security Tests
┌──────────────────────────────────────────────┐
│ security.test.ts                             │
│ ✓ Zero-knowledge guarantee                  │
│ ✓ Timing attack resistance                  │
│ ✓ Tampering detection                       │
│ ✓ Key isolation                             │
└──────────────────────────────────────────────┘

Day 9-10: Performance & Interop
┌──────────────────────────────────────────────┐
│ benchmarks/                                  │
│ • AES-GCM throughput                         │
│ • HKDF performance                           │
│ • PBKDF2 timing                              │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ interop.test.ts                              │
│ • iOS → TypeScript decryption               │
│ • TypeScript → iOS decryption               │
└──────────────────────────────────────────────┘
```

---

## Quick Reference: Critical Functions

### Client-Side Encryption
```typescript
async function encrypt(
  data: Uint8Array,
  classification: DataClassification
): Promise<EncryptedData> {
  const key = await retrieveKey(classification);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data
  );
  return { ciphertext, nonce, tag, classification, ... };
}
```

### Server-Side Storage (No Decryption)
```typescript
async function storeBlob(encrypted: EncryptedData): Promise<string> {
  // Server stores opaque blob
  const blobId = await db.insertBlob({
    ciphertext: encrypted.ciphertext, // Opaque to server
    nonce: encrypted.nonce,           // Public
    tag: encrypted.tag,               // Public
    size_bytes: encrypted.ciphertext.length
  });
  return blobId;
}

// ❌ FORBIDDEN: Server CANNOT decrypt
// async function decrypt(encrypted: EncryptedData): Promise<Uint8Array> {
//   throw new Error("SECURITY VIOLATION: Server cannot decrypt");
// }
```

### HKDF Key Derivation
```typescript
async function deriveKey(
  masterKey: CryptoKey,
  context: string
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.exportKey("raw", masterKey);
  const info = new TextEncoder().encode(context);
  const okm = await hkdf({
    salt: new Uint8Array(32),
    ikm: new Uint8Array(ikm),
    info: info,
    length: 32
  });
  return await crypto.subtle.importKey(
    "raw",
    okm,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
```

---

## Final Checklist: Pre-Deployment

**Security**
- [ ] Zero-knowledge test passes (server cannot decrypt)
- [ ] Timing attack test passes (<5% variance)
- [ ] HKDF matches RFC 5869 test vectors
- [ ] iOS interoperability verified
- [ ] External security audit complete

**Performance**
- [ ] AES-256-GCM (1MB) <10ms
- [ ] HKDF derivation <5ms
- [ ] PBKDF2 (600k iter) <200ms

**Deployment**
- [ ] Railway health checks green
- [ ] CSP + SRI configured
- [ ] TLS 1.3 enforced
- [ ] Rate limiting active
- [ ] Audit logging enabled

**Documentation**
- [ ] API reference complete
- [ ] Integration guide written
- [ ] Security architecture documented

---

**Ready for Implementation**

Begin with Day 1: HKDF implementation (100 lines, RFC 5869).

Full specification: `QUANTUM-crypto-implementation.md` (40 pages).
