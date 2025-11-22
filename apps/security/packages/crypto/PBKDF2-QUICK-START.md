# PBKDF2 Quick Start Guide

**TL;DR**: PBKDF2 derives encryption keys from passwords. Use for account recovery ONLY. Passwords are weak - prefer Shamir Secret Sharing.

---

## Basic Usage (600k iterations, OWASP 2023)

```typescript
import { deriveKeyFromPassword } from '@security/crypto';

// Derive key from password (auto-generates salt)
const password = 'correct horse battery staple';
const { key, salt, iterations } = await deriveKeyFromPassword(password);

// Store salt (NOT secret, can be server-side)
await storage.store('recovery-salt', salt);

// Later: Recover key from password + salt
const { key: recovered } = await deriveKeyFromPassword(password, salt);
// recovered === key (byte-for-byte)
```

---

## Account Recovery Workflow

### Setup (First Time)

```typescript
import { deriveKeyFromPassword } from '@security/crypto';

// User creates recovery password
const password = promptUser('Create recovery password (12+ chars):');
const { key: umk, salt } = await deriveKeyFromPassword(password);

// Store salt (not secret)
await storage.store('user-recovery-salt', salt);

// Use UMK normally
await secureStorage.store('umk', umk);
```

### Recovery (Lost Device)

```typescript
// Retrieve salt from server/storage
const salt = await storage.retrieve('user-recovery-salt');

// User enters password
const password = promptUser('Enter recovery password:');

// Derive UMK
const { key: umk } = await deriveKeyFromPassword(password, salt);

// Now derive all keys and decrypt backups
const { dmk, keys } = await deriveKeysFromUMK(umk, deviceId);
```

---

## Encrypt UMK with Password

```typescript
import { deriveKeyFromPassword } from '@security/crypto';
import { encrypt, decrypt, generateKey } from '@security/crypto';

// Generate actual UMK (random, not from password)
const umk = await generateKey();

// Derive encryption key from password
const password = 'user-password';
const { key: passwordKey, salt } = await deriveKeyFromPassword(password);

// Encrypt UMK
const encryptedUmk = await encrypt(umk, passwordKey);

// Store encrypted UMK + salt
await storage.store('encrypted-umk', encryptedUmk);
await storage.store('salt', salt);

// ============= Later: Decrypt =============

const { key: passwordKey2 } = await deriveKeyFromPassword(password, salt);
const umk2 = await decrypt(encryptedUmk, passwordKey2);
// umk2 === umk
```

---

## Password Verification

```typescript
import { verifyPassword } from '@security/crypto';

// During setup
const { key, salt } = await deriveKeyFromPassword(password);
await storage.store('key', key);
await storage.store('salt', salt);

// During login
const userInput = promptUser('Password:');
const isValid = await verifyPassword(userInput, key, salt);

if (isValid) {
  // Password correct
} else {
  // Password wrong
}
```

---

## Custom Iteration Counts

```typescript
// Higher iterations = more secure but slower
const derived = await deriveKeyFromPassword(
  'password',
  undefined,    // Auto-generate salt
  1_000_000     // 1M iterations (vs default 600k)
);

console.log(derived.iterations); // 1000000
```

---

## Performance

| Iterations | Time | Security |
|------------|------|----------|
| 600,000 (default) | ~65ms | ✅ OWASP 2023 |
| 1,000,000 | ~110ms | ✅ Extra secure |

---

## ⚠️ Security Warnings

### Passwords Are Weak

- Minimum 12 characters (OWASP)
- Use passphrase: `correct horse battery staple`
- Don't reuse passwords
- Password forgotten = permanent data loss
- Brute-force still possible (despite 600k iterations)

### Salt Requirements

- Salt is **NOT secret** (can be public)
- Salt **MUST be unique per user**
- Never reuse salts
- 128 bits minimum (default: 16 bytes)

### Recommendation

**Prefer Shamir Secret Sharing** for recovery. Use PBKDF2 as fallback/secondary option.

---

## API Reference

### `deriveKeyFromPassword(password, salt?, iterations?)`

**Returns**: `Promise<DerivedKey>`

```typescript
{
  key: Uint8Array;        // 256-bit encryption key
  salt: Uint8Array;       // 128-bit salt (store this!)
  iterations: number;     // Iteration count (store this!)
}
```

**Parameters**:
- `password: string | Uint8Array` - User password
- `salt?: Uint8Array` - Optional salt (auto-generated if omitted)
- `iterations?: number` - Iteration count (default: 600,000)

### `verifyPassword(password, expectedKey, salt, iterations?)`

**Returns**: `Promise<boolean>`

Constant-time comparison (prevents timing attacks).

### `generateSalt(length?)`

**Returns**: `Uint8Array`

Generate cryptographically secure random salt.

**Parameters**:
- `length?: number` - Salt length in bytes (default: 16)

---

## Examples

### Multi-Device Recovery

```typescript
// Same password + same salt = same key on all devices
const password = 'shared-password';
const salt = await storage.retrieve('shared-salt');

// Device A
const { key: umkA } = await deriveKeyFromPassword(password, salt);

// Device B
const { key: umkB } = await deriveKeyFromPassword(password, salt);

// umkA === umkB (byte-for-byte identical)
```

### Progressive Enhancement

```typescript
// Start with weak password protection
const { key, salt } = await deriveKeyFromPassword(password, undefined, 100_000);

// Later: Increase security (re-derive with more iterations)
const { key: strongerKey } = await deriveKeyFromPassword(password, salt, 1_000_000);
```

---

## Common Mistakes

### ❌ Don't Use Weak Passwords

```typescript
// BAD: Too weak
await deriveKeyFromPassword('password123');

// GOOD: Strong passphrase
await deriveKeyFromPassword('correct horse battery staple');
```

### ❌ Don't Lose Salt

```typescript
// BAD: Salt not stored
const { key } = await deriveKeyFromPassword(password);
// Can't recover later!

// GOOD: Store salt
const { key, salt } = await deriveKeyFromPassword(password);
await storage.store('salt', salt);
```

### ❌ Don't Reuse Salts

```typescript
// BAD: Same salt for multiple users
const sharedSalt = generateSalt();
await deriveKeyFromPassword(userA.password, sharedSalt); // ❌
await deriveKeyFromPassword(userB.password, sharedSalt); // ❌

// GOOD: Unique salt per user
const saltA = generateSalt();
const saltB = generateSalt();
await deriveKeyFromPassword(userA.password, saltA); // ✅
await deriveKeyFromPassword(userB.password, saltB); // ✅
```

---

## PBKDF2 vs HKDF

| Use PBKDF2 When | Use HKDF When |
|-----------------|---------------|
| Deriving key from **password** | Deriving keys from **keys** |
| Account recovery | Key hierarchy (UMK → DMK) |
| User authentication | Key separation (BEK, MEK) |
| Low-entropy input | High-entropy input |

**Rule**: PBKDF2 for **password → key**. HKDF for **key → key**.

---

## Testing

```bash
# Run PBKDF2 tests
npm test -- pbkdf2.test.ts

# Check performance
npm run bench

# Coverage
npm run test:coverage
```

---

## Constants

```typescript
import { PBKDF2_CONSTANTS } from '@security/crypto';

PBKDF2_CONSTANTS.OWASP_2023_ITERATIONS  // 600000
PBKDF2_CONSTANTS.SALT_LENGTH            // 16 bytes
PBKDF2_CONSTANTS.KEY_LENGTH             // 32 bytes
PBKDF2_CONSTANTS.HASH_ALGORITHM         // 'SHA-256'
PBKDF2_CONSTANTS.MIN_PASSWORD_LENGTH    // 12 chars
PBKDF2_CONSTANTS.PERFORMANCE_TARGET_MS  // 200ms
```

---

## Full Documentation

See `README.md` for comprehensive documentation including:
- Security considerations
- Cross-platform compatibility
- RFC compliance
- Performance benchmarks
- Integration examples

---

**Built for ZKEB account recovery. Passwords are weak - use responsibly.**
