# ZKEB Database Quick Reference
## Developer Cheat Sheet for Zero-Knowledge PostgreSQL Backend

**Author**: Rafael Santos
**Date**: 2025-11-22
**Audience**: Backend developers integrating with ZKEB database

---

## 🚀 Quick Start

### Environment Setup

```bash
# .env file
DATABASE_URL="postgresql://user:pass@railway.app:5432/zkeb?schema=zkeb"

# Install dependencies
npm install @prisma/client
npm install -D prisma

# Generate Prisma client
npx prisma generate

# Apply migrations (development)
npx prisma migrate dev

# Apply migrations (production)
npx prisma migrate deploy
```

---

## 📊 Schema Overview

### Core Tables at a Glance

```
zkeb.users                   → User accounts (hashed identifiers)
zkeb.encrypted_backups       → Encrypted blobs (opaque ciphertext)
zkeb.devices                 → Device registry (public keys only)
zkeb.audit_logs              → Zero-knowledge audit trail
zkeb.recovery_shares         → Shamir secret shares
zkeb.sync_metadata           → CRDT sync state
```

### Key Columns to Remember

| Table | Key Column | Purpose | NEVER Store |
|-------|-----------|---------|-------------|
| `users` | `username_hash` | SHA-256(username) | Plaintext username |
| `encrypted_backups` | `ciphertext` | AES-256-GCM blob | Decryption keys |
| `devices` | `public_key_rsa` | RSA-4096 public key | Private keys |
| `audit_logs` | `user_id_hash` | SHA-256(user_id) | Plaintext UUIDs |

---

## 🔐 Zero-Knowledge Rules

### ✅ ALWAYS

- Hash user identifiers before storing (`SHA-256`)
- Store ciphertext as `BYTEA` (opaque binary)
- Set RLS context before database queries
- Verify signatures (server-side), never generate them
- Log security events to `audit_logs` (hashed)

### ❌ NEVER

- Store encryption keys in database
- Store plaintext usernames, emails, phone numbers
- Decrypt user data on server
- Sign data on behalf of users
- Log plaintext user IDs or sensitive data

---

## 🛠️ Common Operations

### 1. Create Encrypted Backup

```typescript
import { createHash } from 'crypto';
import { prisma } from './db/client';

async function createBackup(userId: string, backupData: {
  backupName: string;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}) {
  // Set RLS context (REQUIRED)
  await prisma.$executeRaw`
    SET LOCAL app.current_user_id = ${userId}::text
  `;

  // Hash backup name (server-blind)
  const backupNameHash = createHash('sha256')
    .update(backupData.backupName)
    .digest();

  // Create backup
  return prisma.encryptedBackup.create({
    data: {
      userId,
      backupType: 'full',
      backupNameHash,
      ciphertext: backupData.ciphertext,
      nonce: backupData.nonce,
      authTag: backupData.authTag,
      sizeBytes: backupData.ciphertext.length,
    },
  });
}
```

### 2. Get User's Backups (with Pagination)

```typescript
async function getUserBackups(
  userId: string,
  options: { limit?: number; cursor?: string } = {}
) {
  const { limit = 50, cursor } = options;

  // Set RLS context
  await prisma.$executeRaw`
    SET LOCAL app.current_user_id = ${userId}::text
  `;

  // Cursor-based pagination
  const backups = await prisma.encryptedBackup.findMany({
    where: { userId, status: 'active' },
    take: limit + 1, // Fetch one extra to detect next page
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { createdAt: 'desc' },
  });

  const hasNextPage = backups.length > limit;
  const results = hasNextPage ? backups.slice(0, -1) : backups;
  const nextCursor = hasNextPage ? results[results.length - 1].id : undefined;

  return { backups: results, nextCursor };
}
```

### 3. Verify Backup Signature (RSA-4096)

```typescript
import { createVerify } from 'crypto';

async function verifyBackupSignature(
  backupId: string,
  userId: string
): Promise<boolean> {
  // Set RLS context
  await prisma.$executeRaw`
    SET LOCAL app.current_user_id = ${userId}::text
  `;

  // Fetch backup and device public key
  const backup = await prisma.encryptedBackup.findUnique({
    where: { id: backupId },
    include: { user: { include: { devices: { where: { revoked: false } } } } },
  });

  if (!backup || !backup.signature) return false;

  // Reconstruct signed data
  const signedData = Buffer.concat([
    backup.ciphertext,
    backup.nonce,
    backup.authTag,
  ]);

  // Verify with device public key
  const device = backup.user.devices[0]; // Use first active device
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signedData);

  return verifier.verify(
    { key: device.publicKeyRsa, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    backup.signature
  );
}
```

### 4. Audit Log Entry

```typescript
import { createHash } from 'crypto';

async function logBackupAccess(
  userId: string,
  backupId: string,
  success: boolean
) {
  await prisma.auditLog.create({
    data: {
      timestamp: new Date(),
      userIdHash: createHash('sha256').update(userId).digest(),
      action: 'backup_accessed',
      resourceType: 'backup',
      resourceIdHash: createHash('sha256').update(backupId).digest(),
      success,
    },
  });
}
```

### 5. Register New Device

```typescript
async function registerDevice(
  userId: string,
  deviceData: {
    deviceId: string; // Client-generated UUID
    publicKeyRsa: Buffer; // RSA-4096 public key
    deviceType: 'browser' | 'mobile' | 'desktop';
  }
) {
  // Set RLS context
  await prisma.$executeRaw`
    SET LOCAL app.current_user_id = ${userId}::text
  `;

  // Hash device ID
  const deviceIdHash = createHash('sha256')
    .update(deviceData.deviceId)
    .digest();

  // Fingerprint public key
  const publicKeyFingerprint = createHash('sha256')
    .update(deviceData.publicKeyRsa)
    .digest();

  return prisma.device.create({
    data: {
      userId,
      deviceIdHash,
      publicKeyRsa: deviceData.publicKeyRsa,
      publicKeyFingerprint,
      deviceType: deviceData.deviceType,
    },
  });
}
```

### 6. Check Storage Quota

```typescript
async function checkStorageQuota(
  userId: string,
  newBackupSize: number
): Promise<{ allowed: boolean; remaining: number }> {
  // Set RLS context
  await prisma.$executeRaw`
    SET LOCAL app.current_user_id = ${userId}::text
  `;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storageQuotaBytes: true, storageUsedBytes: true },
  });

  if (!user) throw new Error('User not found');

  const remaining = user.storageQuotaBytes - user.storageUsedBytes;
  const allowed = remaining >= newBackupSize;

  return { allowed, remaining };
}
```

---

## 📈 Performance Tips

### Index Usage

```typescript
// ✅ GOOD: Uses composite index
const backups = await prisma.encryptedBackup.findMany({
  where: { userId, status: 'active' },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
// → Uses: idx_user_backups_recent (user_id, created_at DESC)

// ❌ BAD: Sequential scan
const backups = await prisma.encryptedBackup.findMany({
  where: { backupType: 'full' }, // Missing userId filter
  orderBy: { createdAt: 'desc' },
});
// → Sequential scan on entire table (slow for large datasets)
```

### Batch Operations

```typescript
// ✅ GOOD: Batch delete with single query
await prisma.encryptedBackup.updateMany({
  where: {
    userId,
    expiresAt: { lte: new Date() },
    status: 'active',
  },
  data: { status: 'deleted' },
});

// ❌ BAD: N+1 queries
const backups = await prisma.encryptedBackup.findMany({
  where: { userId, expiresAt: { lte: new Date() } },
});
for (const backup of backups) {
  await prisma.encryptedBackup.update({
    where: { id: backup.id },
    data: { status: 'deleted' },
  });
}
```

### Connection Pooling

```typescript
// Single Prisma client instance (singleton pattern)
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Prevent multiple instances during dev hot-reload
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

export { prisma };
```

---

## 🔍 Debugging

### Check RLS Context

```sql
-- Verify current RLS context
SELECT current_setting('app.current_user_id', true);

-- Output: 'user-uuid-here' or '' (if not set)
```

### Explain Query Performance

```typescript
// Enable query logging in development
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Prisma will output:
// prisma:query SELECT ... FROM zkeb.encrypted_backups ...
// prisma:query Duration: 15ms
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Row-level security policy violation` | RLS context not set | Call `SET LOCAL app.current_user_id` before query |
| `Foreign key constraint violation` | Referenced user/backup doesn't exist | Check if parent record exists first |
| `Unique constraint violation` | Duplicate username_hash or device_id_hash | Hash collision (extremely rare) or duplicate input |
| `Check constraint violation` | Invalid data (e.g., nonce wrong length) | Verify ciphertext format before insert |

---

## 🚨 Security Checklist

Before deploying to production:

- [ ] All queries use RLS context (`SET LOCAL app.current_user_id`)
- [ ] No plaintext PII stored anywhere
- [ ] All user inputs hashed (usernames, device IDs, etc.)
- [ ] Ciphertext stored as BYTEA (not JSON/text)
- [ ] Signature verification works (test with known good/bad signatures)
- [ ] Audit logs hash all identifiers
- [ ] Connection pool limits set (prevent DoS)
- [ ] Query performance tested with 1M+ rows
- [ ] Database backup/restore tested
- [ ] Rollback procedures documented

---

## 📚 Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `src/db/repositories/BackupRepository.ts` | Backup CRUD operations |
| `src/db/client.ts` | Prisma client singleton |
| `scripts/verify-zero-knowledge.ts` | Schema compliance check |
| `scripts/health-check.sql` | Database monitoring queries |

---

## 🔗 Related Documentation

- **Full Schema Spec**: `.SoT/sprints/sprint-01/research/RAFAEL-database-backend.md`
- **RLS Policies**: `apps/studio/tests/RLS-TEST-HARNESS.md`
- **Encryption Architecture**: `.SoT/ZKEB_CLOUD_ARCHITECTURE.md`
- **Prisma Docs**: https://www.prisma.io/docs/
- **Railway Docs**: https://docs.railway.app/databases/postgresql

---

## 💡 Pro Tips

1. **Always hash before storing**: `SHA-256(user_input)` → database
2. **Set RLS context FIRST**: Before any query that accesses user data
3. **Use transactions for multi-step operations**: Atomic backup creation + quota update
4. **Monitor slow queries**: P95 latency should stay < 100ms
5. **Test with production-scale data**: 1M+ backups per user
6. **Never log sensitive data**: Hash identifiers in logs
7. **Use cursor-based pagination**: Faster than offset-based for large datasets
8. **Keep Prisma schema in sync**: Run `npx prisma db pull` to verify

---

**Questions?** Contact Rafael Santos - Database Architecture Specialist

**Last Updated**: 2025-11-22
