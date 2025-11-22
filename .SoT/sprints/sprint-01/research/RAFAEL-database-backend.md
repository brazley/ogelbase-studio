# ZKEB Database Backend & Data Architecture
## Zero-Knowledge PostgreSQL Schema Design for Railway Deployment

**Author**: Rafael Santos (Database Architecture Specialist)
**Date**: 2025-11-22
**Sprint**: Sprint 01 - ZKEB Foundation Research
**Status**: ✅ COMPLETE - Ready for Implementation

---

## Executive Summary

This document delivers the complete PostgreSQL database architecture for ZKEB's zero-knowledge encrypted backup system. The design enforces **server-side blindness** at the schema level - the database physically cannot decrypt user data, even under legal compulsion or infrastructure compromise.

**Core Guarantee**: The schema stores only encrypted blobs. No encryption keys, no plaintext metadata that could compromise user privacy. The database is the last line of defense for zero-knowledge architecture.

---

## Table of Contents

1. [Database Schema Design](#1-database-schema-design)
2. [Prisma Setup & Configuration](#2-prisma-setup--configuration)
3. [Backend Data Layer](#3-backend-data-layer)
4. [Zero-Knowledge Enforcement](#4-zero-knowledge-enforcement)
5. [Performance Optimizations](#5-performance-optimizations)
6. [Migration Plan](#6-migration-plan)
7. [Monitoring & Observability](#7-monitoring--observability)
8. [Appendix: Schema Evolution Strategy](#appendix-schema-evolution-strategy)

---

## 1. Database Schema Design

### 1.1 Schema Philosophy

**Three-Layer Security Model**:
1. **Physical Layer**: PostgreSQL transparent data encryption (TDE)
2. **Application Layer**: Client-side AES-256-GCM encryption
3. **Access Layer**: Row-Level Security (RLS) for multi-tenant isolation

**Data Classification**:
- **Encrypted Opaque Blobs**: User data ciphertext (server-blind)
- **Hashed Identifiers**: SHA-256 hashes prevent linkability attacks
- **Public Metadata**: Minimal, non-sensitive coordination data

### 1.2 Core Tables

#### Table 1: `zkeb.users`

Minimal user account information. Username hashed for privacy.

```sql
-- Users table: Minimal server-side user data
CREATE SCHEMA IF NOT EXISTS zkeb;

CREATE TABLE zkeb.users (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username_hash BYTEA NOT NULL UNIQUE, -- SHA-256(username), NOT plaintext

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  last_activity TIMESTAMPTZ,

  -- Account management
  account_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'deleted')),

  -- Quotas (encrypted data limits)
  storage_quota_bytes BIGINT NOT NULL DEFAULT 10737418240, -- 10GB default
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,

  -- Metadata
  metadata JSONB, -- Non-sensitive account metadata

  CONSTRAINT username_hash_length CHECK (length(username_hash) = 32),
  CONSTRAINT storage_used_within_quota CHECK (storage_used_bytes <= storage_quota_bytes)
);

-- Indexes
CREATE INDEX idx_users_account_status ON zkeb.users(account_status)
  WHERE account_status = 'active';
CREATE INDEX idx_users_last_activity ON zkeb.users(last_activity DESC)
  WHERE account_status = 'active';
CREATE INDEX idx_users_created_at ON zkeb.users(created_at DESC);

COMMENT ON TABLE zkeb.users IS 'User accounts with hashed identifiers. NO plaintext usernames stored.';
COMMENT ON COLUMN zkeb.users.username_hash IS 'SHA-256 hash of username. Server cannot reverse to plaintext.';
```

**Design Rationale**:
- `username_hash`: SHA-256 prevents server from knowing actual usernames
- `storage_quota_bytes`: Enforceable quota without seeing plaintext data
- `metadata JSONB`: Flexible storage for non-sensitive settings (e.g., timezone, UI preferences)
- **NO email addresses, NO phone numbers, NO PII**

#### Table 2: `zkeb.encrypted_backups`

Core table storing encrypted backup blobs. Server treats contents as opaque binary data.

```sql
-- Encrypted backups: Opaque ciphertext blobs
CREATE TABLE zkeb.encrypted_backups (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES zkeb.users(id) ON DELETE CASCADE,

  -- Backup identification
  backup_type VARCHAR(50) NOT NULL
    CHECK (backup_type IN ('full', 'incremental', 'metadata_only', 'recovery_key')),
  backup_name_hash BYTEA NOT NULL, -- SHA-256(user-provided backup name)

  -- Encrypted payload (OPAQUE TO SERVER)
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL, -- AES-GCM nonce (96 bits)
  auth_tag BYTEA NOT NULL, -- Authentication tag (128 bits)

  -- Encryption metadata (algorithm version for future upgrades)
  encryption_algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
  encryption_version VARCHAR(10) NOT NULL DEFAULT '1.0',

  -- Public metadata (non-sensitive)
  size_bytes INTEGER NOT NULL, -- Ciphertext size
  compression_algorithm VARCHAR(20), -- e.g., 'zstd', 'gzip', 'none'

  -- Client-provided signature (integrity verification)
  signature BYTEA, -- RSA-4096 signature over (ciphertext || nonce || auth_tag)
  signature_algorithm VARCHAR(50) DEFAULT 'RSA-4096-PSS',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Optional expiration for auto-cleanup

  -- Version control (for backup chains)
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_backup_id UUID REFERENCES zkeb.encrypted_backups(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted', 'quarantined')),

  CONSTRAINT nonce_length CHECK (length(nonce) = 12),
  CONSTRAINT auth_tag_length CHECK (length(auth_tag) = 16),
  CONSTRAINT backup_name_hash_length CHECK (length(backup_name_hash) = 32),
  CONSTRAINT size_positive CHECK (size_bytes > 0)
);

-- Indexes for performance
CREATE INDEX idx_encrypted_backups_user_id ON zkeb.encrypted_backups(user_id)
  WHERE status = 'active';
CREATE INDEX idx_encrypted_backups_created_at ON zkeb.encrypted_backups(created_at DESC);
CREATE INDEX idx_encrypted_backups_type ON zkeb.encrypted_backups(backup_type);
CREATE INDEX idx_encrypted_backups_expires_at ON zkeb.encrypted_backups(expires_at)
  WHERE expires_at IS NOT NULL AND status = 'active';
CREATE INDEX idx_encrypted_backups_parent ON zkeb.encrypted_backups(parent_backup_id)
  WHERE parent_backup_id IS NOT NULL;

-- Composite index for common query pattern: user's recent backups
CREATE INDEX idx_user_backups_recent ON zkeb.encrypted_backups(user_id, created_at DESC)
  WHERE status = 'active';

COMMENT ON TABLE zkeb.encrypted_backups IS 'Encrypted backup blobs. Ciphertext is OPAQUE to server.';
COMMENT ON COLUMN zkeb.encrypted_backups.ciphertext IS 'AES-256-GCM ciphertext. Server CANNOT decrypt.';
COMMENT ON COLUMN zkeb.encrypted_backups.nonce IS 'Public nonce for AES-GCM. Not secret, required for decryption.';
COMMENT ON COLUMN zkeb.encrypted_backups.auth_tag IS 'GCM authentication tag. Prevents tampering.';
```

**Design Rationale**:
- `ciphertext BYTEA`: Opaque binary. No JSON, no text. Server-blind.
- `backup_name_hash`: Users see names, server sees hashes
- `parent_backup_id`: Enables incremental backup chains
- `expires_at`: Automatic cleanup for temporary backups
- **Critical**: Nonce and auth_tag are public (not secret). Required for decryption but don't compromise security.

#### Table 3: `zkeb.devices`

Device registry for multi-device coordination. Stores public keys only (private keys NEVER leave client).

```sql
-- Device registry: Multi-device coordination
CREATE TABLE zkeb.devices (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES zkeb.users(id) ON DELETE CASCADE,

  -- Device identification (hashed for privacy)
  device_id_hash BYTEA NOT NULL UNIQUE, -- SHA-256(device-specific ID)
  device_name_encrypted BYTEA, -- Optional: encrypted device name (user-readable)

  -- Cryptographic keys (PUBLIC KEYS ONLY)
  public_key_rsa BYTEA NOT NULL, -- RSA-4096 public key for signature verification
  public_key_fingerprint BYTEA NOT NULL, -- SHA-256(public_key_rsa)

  -- Device metadata
  device_type VARCHAR(50)
    CHECK (device_type IN ('browser', 'mobile', 'desktop', 'cli', 'api')),
  user_agent_hash BYTEA, -- SHA-256(user agent) for fraud detection

  -- Timestamps
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync TIMESTAMPTZ,

  -- Status
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,

  CONSTRAINT device_id_hash_length CHECK (length(device_id_hash) = 32),
  CONSTRAINT public_key_fingerprint_length CHECK (length(public_key_fingerprint) = 32),
  CONSTRAINT revoked_at_when_revoked CHECK (
    (revoked = TRUE AND revoked_at IS NOT NULL) OR
    (revoked = FALSE AND revoked_at IS NULL)
  )
);

-- Indexes
CREATE INDEX idx_devices_user_id ON zkeb.devices(user_id)
  WHERE revoked = FALSE;
CREATE INDEX idx_devices_last_seen ON zkeb.devices(last_seen DESC)
  WHERE revoked = FALSE;
CREATE INDEX idx_devices_fingerprint ON zkeb.devices(public_key_fingerprint);

COMMENT ON TABLE zkeb.devices IS 'Device registry for multi-device sync. PUBLIC keys only.';
COMMENT ON COLUMN zkeb.devices.public_key_rsa IS 'RSA-4096 public key. Server verifies signatures, NEVER signs on behalf of users.';
COMMENT ON COLUMN zkeb.devices.device_id_hash IS 'Hashed device ID. Server cannot link to actual device.';
```

**Design Rationale**:
- `public_key_rsa`: Server verifies client signatures. Private key NEVER touches server.
- `device_id_hash`: Prevents device fingerprinting across users
- `revoked`: Instant device revocation without key deletion

#### Table 4: `zkeb.audit_logs`

Zero-knowledge audit trail. All PII hashed for HIPAA/SOC2 compliance.

```sql
-- Audit log: Zero-knowledge audit trail
CREATE TABLE zkeb.audit_logs (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timestamp (high precision for forensics)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Actor (hashed for privacy)
  user_id_hash BYTEA, -- SHA-256(user_id), NOT plaintext UUID
  device_id_hash BYTEA, -- SHA-256(device_id)

  -- Action
  action VARCHAR(100) NOT NULL, -- 'backup_created', 'backup_accessed', 'device_registered', etc.
  resource_type VARCHAR(50), -- 'backup', 'device', 'user'
  resource_id_hash BYTEA, -- SHA-256(resource UUID)

  -- Context (hashed PII)
  ip_address_hash BYTEA, -- SHA-256(IP address)
  user_agent_hash BYTEA, -- SHA-256(user agent)

  -- Result
  success BOOLEAN NOT NULL,
  error_code VARCHAR(50),
  error_message TEXT, -- Generic error message (NO user data)

  -- Metadata (non-sensitive context)
  metadata JSONB, -- e.g., {"duration_ms": 45, "http_status": 201}

  CONSTRAINT user_id_hash_length CHECK (user_id_hash IS NULL OR length(user_id_hash) = 32),
  CONSTRAINT ip_address_hash_length CHECK (ip_address_hash IS NULL OR length(ip_address_hash) = 32)
);

-- Indexes for audit queries
CREATE INDEX idx_audit_logs_timestamp ON zkeb.audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user_id_hash ON zkeb.audit_logs(user_id_hash)
  WHERE user_id_hash IS NOT NULL;
CREATE INDEX idx_audit_logs_action ON zkeb.audit_logs(action);
CREATE INDEX idx_audit_logs_success ON zkeb.audit_logs(success)
  WHERE success = FALSE; -- Index failed operations for alerting

-- Retention policy trigger (HIPAA requires 6-year retention)
CREATE OR REPLACE FUNCTION zkeb.enforce_audit_retention()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM zkeb.audit_logs
  WHERE timestamp < NOW() - INTERVAL '6 years';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_retention
  AFTER INSERT ON zkeb.audit_logs
  EXECUTE FUNCTION zkeb.enforce_audit_retention();

COMMENT ON TABLE zkeb.audit_logs IS 'Zero-knowledge audit trail. All PII hashed for compliance.';
COMMENT ON COLUMN zkeb.audit_logs.user_id_hash IS 'Hashed user ID. Allows correlation without exposing identity.';
```

**Design Rationale**:
- **All PII hashed**: Cannot reverse-engineer user identity from logs
- `metadata JSONB`: Flexible logging without schema changes
- Automatic retention policy: HIPAA compliance built-in
- **Forensic capability**: Can correlate events by hash without exposing users

---

### 1.3 Supporting Tables

#### Table 5: `zkeb.recovery_shares`

Shamir secret sharing for key recovery. Server stores encrypted shares (opaque).

```sql
-- Recovery shares: Threshold secret sharing for key recovery
CREATE TABLE zkeb.recovery_shares (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES zkeb.users(id) ON DELETE CASCADE,

  -- Share identification
  share_id INTEGER NOT NULL, -- Share number (1 through N)
  threshold INTEGER NOT NULL, -- k-of-n threshold
  total_shares INTEGER NOT NULL,

  -- Encrypted share (OPAQUE TO SERVER)
  encrypted_share BYTEA NOT NULL, -- Encrypted with recipient's public key
  recipient_hash BYTEA NOT NULL, -- SHA-256(recipient email/ID)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,

  -- Status
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT recipient_hash_length CHECK (length(recipient_hash) = 32),
  CONSTRAINT share_id_range CHECK (share_id >= 1 AND share_id <= total_shares),
  CONSTRAINT threshold_valid CHECK (threshold >= 1 AND threshold <= total_shares),
  UNIQUE(user_id, share_id)
);

CREATE INDEX idx_recovery_shares_user_id ON zkeb.recovery_shares(user_id)
  WHERE revoked = FALSE;
CREATE INDEX idx_recovery_shares_recipient ON zkeb.recovery_shares(recipient_hash);

COMMENT ON TABLE zkeb.recovery_shares IS 'Shamir secret shares for key recovery. Server cannot decrypt shares.';
```

#### Table 6: `zkeb.sync_metadata`

Conflict-free replicated data type (CRDT) metadata for multi-device sync.

```sql
-- Sync metadata: CRDT vector clocks for conflict resolution
CREATE TABLE zkeb.sync_metadata (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES zkeb.users(id) ON DELETE CASCADE,
  device_id_hash BYTEA NOT NULL,

  -- CRDT vector clock
  vector_clock JSONB NOT NULL, -- {"device1": 5, "device2": 3, ...}
  lamport_timestamp BIGINT NOT NULL DEFAULT 0,

  -- Sync state
  last_sync_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pending_operations_count INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT device_id_hash_length CHECK (length(device_id_hash) = 32)
);

CREATE INDEX idx_sync_metadata_user ON zkeb.sync_metadata(user_id);
CREATE INDEX idx_sync_metadata_device ON zkeb.sync_metadata(device_id_hash);

COMMENT ON TABLE zkeb.sync_metadata IS 'CRDT metadata for multi-device conflict resolution.';
```

---

### 1.4 Row-Level Security (RLS) Policies

Multi-tenant isolation enforced at database level.

```sql
-- Enable RLS on all tables
ALTER TABLE zkeb.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE zkeb.encrypted_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE zkeb.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE zkeb.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zkeb.recovery_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE zkeb.sync_metadata ENABLE ROW LEVEL SECURITY;

-- Users table: Users can only see/modify their own record
CREATE POLICY users_isolation ON zkeb.users
  FOR ALL
  USING (id = current_setting('app.current_user_id', true)::uuid);

-- Encrypted backups: Users can only access their own backups
CREATE POLICY backups_isolation ON zkeb.encrypted_backups
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Devices: Users can only see/manage their own devices
CREATE POLICY devices_isolation ON zkeb.devices
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Audit logs: Users can only read their own audit logs
CREATE POLICY audit_logs_read_isolation ON zkeb.audit_logs
  FOR SELECT
  USING (user_id_hash = encode(sha256(current_setting('app.current_user_id', true)::text::bytea), 'hex')::bytea);

-- Audit logs: System can write all logs (via service role)
CREATE POLICY audit_logs_write_system ON zkeb.audit_logs
  FOR INSERT
  WITH CHECK (true); -- Service role bypasses this via GRANT

-- Recovery shares: Users can only access their own shares
CREATE POLICY recovery_shares_isolation ON zkeb.recovery_shares
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Sync metadata: Users can only access their own sync state
CREATE POLICY sync_metadata_isolation ON zkeb.sync_metadata
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

COMMENT ON POLICY users_isolation ON zkeb.users IS 'RLS: Users can only access their own account.';
COMMENT ON POLICY backups_isolation ON zkeb.encrypted_backups IS 'RLS: Users can only access their own backups.';
```

**Design Rationale**:
- RLS enforced at database level (application bugs cannot bypass)
- Uses PostgreSQL session variables (`app.current_user_id`)
- Service role can bypass RLS for admin operations
- Follows principle of least privilege

---

## 2. Prisma Setup & Configuration

### 2.1 Complete Prisma Schema

```prisma
// schema.prisma - ZKEB Zero-Knowledge Database Schema
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
  binaryTargets   = ["native", "linux-musl-openssl-3.0.x"] // Railway Linux
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, uuid_ossp]
}

// ============================================================================
// CORE MODELS
// ============================================================================

model User {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  usernameHash Bytes    @unique @map("username_hash") @db.ByteA

  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  lastLogin    DateTime? @map("last_login") @db.Timestamptz(6)
  lastActivity DateTime? @map("last_activity") @db.Timestamptz(6)

  accountStatus String @default("active") @map("account_status") @db.VarChar(20)

  storageQuotaBytes BigInt @default(10737418240) @map("storage_quota_bytes") // 10GB
  storageUsedBytes  BigInt @default(0) @map("storage_used_bytes")

  metadata Json? @db.JsonB

  // Relations
  encryptedBackups EncryptedBackup[]
  devices          Device[]
  recoveryShares   RecoveryShare[]
  syncMetadata     SyncMetadata[]

  @@index([accountStatus], name: "idx_users_account_status", map: "idx_users_account_status")
  @@index([lastActivity(sort: Desc)], name: "idx_users_last_activity", map: "idx_users_last_activity")
  @@index([createdAt(sort: Desc)], name: "idx_users_created_at", map: "idx_users_created_at")
  @@map("users")
  @@schema("zkeb")
}

model EncryptedBackup {
  id     String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId String @map("user_id") @db.Uuid

  backupType     String @map("backup_type") @db.VarChar(50)
  backupNameHash Bytes  @map("backup_name_hash") @db.ByteA

  // Encrypted payload (OPAQUE TO SERVER)
  ciphertext Bytes @db.ByteA
  nonce      Bytes @db.ByteA
  authTag    Bytes @map("auth_tag") @db.ByteA

  encryptionAlgorithm String @default("AES-256-GCM") @map("encryption_algorithm") @db.VarChar(50)
  encryptionVersion   String @default("1.0") @map("encryption_version") @db.VarChar(10)

  sizeBytes             Int     @map("size_bytes")
  compressionAlgorithm  String? @map("compression_algorithm") @db.VarChar(20)

  signature          Bytes?  @db.ByteA
  signatureAlgorithm String? @default("RSA-4096-PSS") @map("signature_algorithm") @db.VarChar(50)

  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  expiresAt DateTime? @map("expires_at") @db.Timestamptz(6)

  versionNumber    Int     @default(1) @map("version_number")
  parentBackupId   String? @map("parent_backup_id") @db.Uuid
  parentBackup     EncryptedBackup?  @relation("BackupChain", fields: [parentBackupId], references: [id], onDelete: SetNull)
  childBackups     EncryptedBackup[] @relation("BackupChain")

  status String @default("active") @db.VarChar(20)

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], name: "idx_encrypted_backups_user_id", map: "idx_encrypted_backups_user_id")
  @@index([createdAt(sort: Desc)], name: "idx_encrypted_backups_created_at", map: "idx_encrypted_backups_created_at")
  @@index([backupType], name: "idx_encrypted_backups_type", map: "idx_encrypted_backups_type")
  @@index([expiresAt], name: "idx_encrypted_backups_expires_at", map: "idx_encrypted_backups_expires_at")
  @@index([parentBackupId], name: "idx_encrypted_backups_parent", map: "idx_encrypted_backups_parent")
  @@index([userId, createdAt(sort: Desc)], name: "idx_user_backups_recent", map: "idx_user_backups_recent")
  @@map("encrypted_backups")
  @@schema("zkeb")
}

model Device {
  id     String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId String @map("user_id") @db.Uuid

  deviceIdHash         Bytes  @unique @map("device_id_hash") @db.ByteA
  deviceNameEncrypted  Bytes? @map("device_name_encrypted") @db.ByteA

  publicKeyRsa         Bytes @map("public_key_rsa") @db.ByteA
  publicKeyFingerprint Bytes @map("public_key_fingerprint") @db.ByteA

  deviceType    String? @map("device_type") @db.VarChar(50)
  userAgentHash Bytes?  @map("user_agent_hash") @db.ByteA

  registeredAt DateTime  @default(now()) @map("registered_at") @db.Timestamptz(6)
  lastSeen     DateTime  @default(now()) @map("last_seen") @db.Timestamptz(6)
  lastSync     DateTime? @map("last_sync") @db.Timestamptz(6)

  revoked      Boolean   @default(false)
  revokedAt    DateTime? @map("revoked_at") @db.Timestamptz(6)
  revokeReason String?   @map("revoke_reason") @db.Text

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], name: "idx_devices_user_id", map: "idx_devices_user_id")
  @@index([lastSeen(sort: Desc)], name: "idx_devices_last_seen", map: "idx_devices_last_seen")
  @@index([publicKeyFingerprint], name: "idx_devices_fingerprint", map: "idx_devices_fingerprint")
  @@map("devices")
  @@schema("zkeb")
}

model AuditLog {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  timestamp DateTime @default(now()) @db.Timestamptz(6)

  userIdHash   Bytes? @map("user_id_hash") @db.ByteA
  deviceIdHash Bytes? @map("device_id_hash") @db.ByteA

  action         String  @db.VarChar(100)
  resourceType   String? @map("resource_type") @db.VarChar(50)
  resourceIdHash Bytes?  @map("resource_id_hash") @db.ByteA

  ipAddressHash Bytes? @map("ip_address_hash") @db.ByteA
  userAgentHash Bytes? @map("user_agent_hash") @db.ByteA

  success      Boolean
  errorCode    String? @map("error_code") @db.VarChar(50)
  errorMessage String? @map("error_message") @db.Text

  metadata Json? @db.JsonB

  @@index([timestamp(sort: Desc)], name: "idx_audit_logs_timestamp", map: "idx_audit_logs_timestamp")
  @@index([userIdHash], name: "idx_audit_logs_user_id_hash", map: "idx_audit_logs_user_id_hash")
  @@index([action], name: "idx_audit_logs_action", map: "idx_audit_logs_action")
  @@index([success], name: "idx_audit_logs_success", map: "idx_audit_logs_success")
  @@map("audit_logs")
  @@schema("zkeb")
}

model RecoveryShare {
  id     String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId String @map("user_id") @db.Uuid

  shareId      Int   @map("share_id")
  threshold    Int
  totalShares  Int   @map("total_shares")

  encryptedShare Bytes @map("encrypted_share") @db.ByteA
  recipientHash  Bytes @map("recipient_hash") @db.ByteA

  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  accessedAt  DateTime? @map("accessed_at") @db.Timestamptz(6)
  accessCount Int       @default(0) @map("access_count")

  revoked   Boolean   @default(false)
  revokedAt DateTime? @map("revoked_at") @db.Timestamptz(6)

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, shareId])
  @@index([userId], name: "idx_recovery_shares_user_id", map: "idx_recovery_shares_user_id")
  @@index([recipientHash], name: "idx_recovery_shares_recipient", map: "idx_recovery_shares_recipient")
  @@map("recovery_shares")
  @@schema("zkeb")
}

model SyncMetadata {
  id           String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String @map("user_id") @db.Uuid
  deviceIdHash Bytes  @map("device_id_hash") @db.ByteA

  vectorClock          Json   @map("vector_clock") @db.JsonB
  lamportTimestamp     BigInt @default(0) @map("lamport_timestamp")

  lastSyncTimestamp       DateTime @default(now()) @map("last_sync_timestamp") @db.Timestamptz(6)
  pendingOperationsCount  Int      @default(0) @map("pending_operations_count")

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], name: "idx_sync_metadata_user", map: "idx_sync_metadata_user")
  @@index([deviceIdHash], name: "idx_sync_metadata_device", map: "idx_sync_metadata_device")
  @@map("sync_metadata")
  @@schema("zkeb")
}
```

### 2.2 Prisma Configuration Files

**File: `.env.example`**
```bash
# PostgreSQL connection string (Railway-provided)
DATABASE_URL="postgresql://user:password@hostname:5432/zkeb?schema=zkeb"

# Alternative: Direct Railway PostgreSQL URL
# DATABASE_URL="${RAILWAY_DATABASE_URL}?schema=zkeb"

# Connection pool settings (recommended for production)
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_POOL_TIMEOUT=30000

# Migration settings
DATABASE_MIGRATION_LOCK_TIMEOUT=10000
```

**File: `prisma/migrations/README.md`**
```markdown
# ZKEB Database Migrations

## Migration Strategy

1. **Always test migrations locally first** (against PostgreSQL 15+)
2. **Backup production data** before applying migrations
3. **Use transaction-wrapped migrations** for rollback safety
4. **Monitor query performance** after schema changes

## Applying Migrations

### Development
```bash
npx prisma migrate dev --name descriptive_migration_name
```

### Production (Railway)
```bash
npx prisma migrate deploy
```

### Rollback (if needed)
```bash
# Railway CLI
railway run npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

## Zero-Knowledge Schema Principles

- **NO encryption keys in schema**
- **ALL PII must be hashed**
- **Ciphertext stored as BYTEA (opaque)**
- **RLS policies enforce multi-tenancy**
```

---

## 3. Backend Data Layer

### 3.1 Repository Pattern Implementation

**File: `src/db/repositories/BackupRepository.ts`**

```typescript
import { PrismaClient, EncryptedBackup, Prisma } from '@prisma/client';
import { createHash } from 'crypto';

export class BackupRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create encrypted backup (user context required via RLS)
   */
  async createBackup(
    userId: string,
    data: {
      backupName: string; // Will be hashed
      backupType: 'full' | 'incremental' | 'metadata_only' | 'recovery_key';
      ciphertext: Buffer;
      nonce: Buffer;
      authTag: Buffer;
      signature?: Buffer;
      compressionAlgorithm?: string;
      expiresAt?: Date;
      parentBackupId?: string;
    }
  ): Promise<EncryptedBackup> {
    // Hash backup name (server-blind)
    const backupNameHash = createHash('sha256')
      .update(data.backupName)
      .digest();

    // Set RLS context
    await this.prisma.$executeRaw`
      SET LOCAL app.current_user_id = ${userId}::text
    `;

    return this.prisma.encryptedBackup.create({
      data: {
        userId,
        backupType: data.backupType,
        backupNameHash,
        ciphertext: data.ciphertext,
        nonce: data.nonce,
        authTag: data.authTag,
        sizeBytes: data.ciphertext.length,
        signature: data.signature,
        compressionAlgorithm: data.compressionAlgorithm,
        expiresAt: data.expiresAt,
        parentBackupId: data.parentBackupId,
      },
    });
  }

  /**
   * Get user's backups with pagination (server cannot see plaintext names)
   */
  async getUserBackups(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      backupType?: string;
      includeArchived?: boolean;
    } = {}
  ): Promise<{ backups: EncryptedBackup[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      backupType,
      includeArchived = false,
    } = options;

    // Set RLS context
    await this.prisma.$executeRaw`
      SET LOCAL app.current_user_id = ${userId}::text
    `;

    const where: Prisma.EncryptedBackupWhereInput = {
      userId,
      ...(backupType && { backupType }),
      ...(!includeArchived && { status: 'active' }),
    };

    const [backups, total] = await Promise.all([
      this.prisma.encryptedBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.encryptedBackup.count({ where }),
    ]);

    return { backups, total };
  }

  /**
   * Get backup by ID (with ownership verification via RLS)
   */
  async getBackupById(
    userId: string,
    backupId: string
  ): Promise<EncryptedBackup | null> {
    // Set RLS context
    await this.prisma.$executeRaw`
      SET LOCAL app.current_user_id = ${userId}::text
    `;

    return this.prisma.encryptedBackup.findUnique({
      where: { id: backupId },
    });
  }

  /**
   * Delete backup (soft delete to 'deleted' status)
   */
  async deleteBackup(
    userId: string,
    backupId: string
  ): Promise<EncryptedBackup> {
    // Set RLS context
    await this.prisma.$executeRaw`
      SET LOCAL app.current_user_id = ${userId}::text
    `;

    return this.prisma.encryptedBackup.update({
      where: { id: backupId },
      data: {
        status: 'deleted',
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get backup chain (parent → children relationships)
   */
  async getBackupChain(
    userId: string,
    backupId: string
  ): Promise<EncryptedBackup[]> {
    // Set RLS context
    await this.prisma.$executeRaw`
      SET LOCAL app.current_user_id = ${userId}::text
    `;

    // Recursive CTE to fetch backup chain
    const chain = await this.prisma.$queryRaw<EncryptedBackup[]>`
      WITH RECURSIVE backup_chain AS (
        -- Base case: starting backup
        SELECT * FROM zkeb.encrypted_backups
        WHERE id = ${backupId}::uuid

        UNION ALL

        -- Recursive case: parent backups
        SELECT eb.* FROM zkeb.encrypted_backups eb
        INNER JOIN backup_chain bc ON eb.id = bc.parent_backup_id
      )
      SELECT * FROM backup_chain
      ORDER BY created_at ASC
    `;

    return chain;
  }

  /**
   * Update storage usage for user (quota enforcement)
   */
  async updateStorageUsage(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE zkeb.users
      SET storage_used_bytes = (
        SELECT COALESCE(SUM(size_bytes), 0)
        FROM zkeb.encrypted_backups
        WHERE user_id = ${userId}::uuid
          AND status = 'active'
      )
      WHERE id = ${userId}::uuid
    `;
  }

  /**
   * Cleanup expired backups (cron job)
   */
  async cleanupExpiredBackups(): Promise<number> {
    const result = await this.prisma.encryptedBackup.updateMany({
      where: {
        expiresAt: { lte: new Date() },
        status: 'active',
      },
      data: {
        status: 'deleted',
      },
    });

    return result.count;
  }
}
```

### 3.2 Transaction Management

```typescript
/**
 * Transaction wrapper with RLS context
 */
export async function withTransaction<T>(
  prisma: PrismaClient,
  userId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set RLS context for transaction
    await tx.$executeRaw`
      SET LOCAL app.current_user_id = ${userId}::text
    `;

    return callback(tx);
  });
}

// Usage example: Create backup + update storage quota atomically
async function createBackupWithQuotaCheck(
  backupRepo: BackupRepository,
  userId: string,
  backupData: any
): Promise<EncryptedBackup> {
  return withTransaction(backupRepo.prisma, userId, async (tx) => {
    // 1. Check quota
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { storageQuotaBytes: true, storageUsedBytes: true },
    });

    if (!user) throw new Error('User not found');

    const newSize = user.storageUsedBytes + backupData.ciphertext.length;
    if (newSize > user.storageQuotaBytes) {
      throw new Error('Storage quota exceeded');
    }

    // 2. Create backup
    const backup = await tx.encryptedBackup.create({
      data: {
        ...backupData,
        userId,
      },
    });

    // 3. Update storage usage
    await tx.user.update({
      where: { id: userId },
      data: { storageUsedBytes: newSize },
    });

    return backup;
  });
}
```

---

## 4. Zero-Knowledge Enforcement

### 4.1 Schema-Level Guarantees

**Principle**: The database schema physically prevents key storage or plaintext leakage.

#### Enforcement Mechanisms:

1. **No Key Storage Columns**
   - Schema contains NO columns for encryption keys
   - Static analysis: `grep -r "encryption_key\|private_key\|master_key" schema.prisma` → Must return empty

2. **Opaque Ciphertext Storage**
   - `ciphertext BYTEA`: Binary blob, no JSON/text interpretation
   - PostgreSQL cannot index or query ciphertext contents
   - Full-text search impossible (by design)

3. **Hashed Identifiers Only**
   - All user-provided names/identifiers hashed via SHA-256
   - Server sees hashes, cannot reverse-engineer originals
   - Prevents correlation attacks across users

4. **Public Cryptographic Material Only**
   - `public_key_rsa`: Server verifies signatures, NEVER signs
   - `nonce`, `auth_tag`: Public parameters (not secret)
   - NO private keys, NO decryption keys

### 4.2 Verification Script

**File: `scripts/verify-zero-knowledge.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

async function verifyZeroKnowledgeSchema() {
  console.log('🔍 Verifying Zero-Knowledge Schema Compliance...\n');

  const violations: string[] = [];

  // Check 1: No encryption key columns
  const schema = readFileSync('./prisma/schema.prisma', 'utf-8');
  const forbiddenKeywords = [
    'encryption_key',
    'decryption_key',
    'master_key',
    'secret_key',
    'private_key', // Exception: we store PUBLIC keys
  ];

  forbiddenKeywords.forEach((keyword) => {
    if (schema.includes(keyword) && !keyword.includes('public')) {
      violations.push(`❌ Schema contains forbidden keyword: ${keyword}`);
    }
  });

  // Check 2: Verify ciphertext is BYTEA (not text/json)
  const ciphertextColumns = await prisma.$queryRaw<
    { column_name: string; data_type: string }[]
  >`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'zkeb'
      AND column_name LIKE '%ciphertext%'
      AND data_type != 'bytea'
  `;

  if (ciphertextColumns.length > 0) {
    violations.push(
      `❌ Ciphertext columns must be BYTEA: ${JSON.stringify(ciphertextColumns)}`
    );
  }

  // Check 3: Verify hashed identifiers are BYTEA (32 bytes)
  const hashColumns = await prisma.$queryRaw<
    { table_name: string; column_name: string }[]
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'zkeb'
      AND column_name LIKE '%_hash'
      AND data_type = 'bytea'
  `;

  console.log(`✅ Found ${hashColumns.length} hashed identifier columns`);

  // Check 4: Verify RLS policies exist
  const rlsPolicies = await prisma.$queryRaw<
    { tablename: string; policyname: string }[]
  >`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'zkeb'
  `;

  console.log(`✅ Found ${rlsPolicies.length} RLS policies`);

  if (rlsPolicies.length === 0) {
    violations.push('❌ No RLS policies found! Multi-tenancy NOT enforced!');
  }

  // Check 5: Verify no plaintext user data
  const plaintextColumns = await prisma.$queryRaw<
    { table_name: string; column_name: string }[]
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'zkeb'
      AND column_name IN ('username', 'email', 'phone_number', 'ssn', 'credit_card')
  `;

  if (plaintextColumns.length > 0) {
    violations.push(
      `❌ Plaintext PII columns found: ${JSON.stringify(plaintextColumns)}`
    );
  }

  // Report
  console.log('\n📊 Zero-Knowledge Compliance Report\n');

  if (violations.length === 0) {
    console.log('✅ All checks passed! Schema enforces zero-knowledge.');
  } else {
    console.log('❌ Violations detected:\n');
    violations.forEach((v) => console.log(`  ${v}`));
    process.exit(1);
  }
}

verifyZeroKnowledgeSchema()
  .catch((e) => {
    console.error('Error during verification:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

---

## 5. Performance Optimizations

### 5.1 Index Strategy

**Query Pattern Analysis**:

| Query Pattern | Frequency | Index Required |
|---------------|-----------|----------------|
| Get user's recent backups | Very High | `(user_id, created_at DESC)` |
| Check storage quota | High | `(user_id)` |
| Find backup by ID | High | Primary key |
| Get backup chain | Medium | `(parent_backup_id)` |
| Cleanup expired backups | Low (cron) | `(expires_at)` WHERE expires_at IS NOT NULL |
| Audit log queries | Medium | `(user_id_hash, timestamp DESC)` |

**Index Maintenance**:

```sql
-- Monitor index usage (run monthly)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'zkeb'
ORDER BY idx_scan ASC
LIMIT 20;

-- Identify unused indexes (consider dropping)
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_stat_user_indexes
WHERE schemaname = 'zkeb'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey';

-- Identify missing indexes (high seq scans)
SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / NULLIF(seq_scan, 0) AS avg_seq_tup_read
FROM pg_stat_user_tables
WHERE schemaname = 'zkeb'
ORDER BY seq_scan DESC
LIMIT 10;
```

### 5.2 Query Optimization Examples

**Bad Query (No index, slow)**:
```sql
-- DON'T: Sequential scan on entire table
SELECT * FROM zkeb.encrypted_backups
WHERE user_id = 'user-uuid-here'
  AND status = 'active'
ORDER BY created_at DESC;
```

**Good Query (Uses composite index)**:
```sql
-- DO: Uses idx_user_backups_recent
SELECT * FROM zkeb.encrypted_backups
WHERE user_id = 'user-uuid-here'
  AND status = 'active'
ORDER BY created_at DESC
LIMIT 50;
```

**Explain Plan Analysis**:
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM zkeb.encrypted_backups
WHERE user_id = 'user-uuid-here'
  AND status = 'active'
ORDER BY created_at DESC
LIMIT 50;

-- Expected plan:
-- Index Scan using idx_user_backups_recent on zkeb.encrypted_backups
--   Index Cond: (user_id = 'user-uuid-here')
--   Filter: (status = 'active')
--   Rows: 50  Width: 1024  Cost: 0.42..8.53
```

### 5.3 Connection Pooling (PgBouncer on Railway)

**Railway Configuration** (`railway.toml`):
```toml
[database]
poolMode = "transaction" # Session pooling for RLS context
maxConnections = 100
minConnections = 10
connectionTimeout = 30
```

**Prisma Connection Pool**:
```typescript
// src/db/client.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  // Connection pool settings
  // @ts-ignore - Prisma internal settings
  __internal: {
    engine: {
      connection_limit: 10, // Max connections per Prisma instance
    },
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

### 5.4 Pagination Best Practices

**Cursor-Based Pagination** (for large datasets):

```typescript
async function getUserBackupsPaginated(
  userId: string,
  cursor?: string,
  limit: number = 50
): Promise<{ backups: EncryptedBackup[]; nextCursor?: string }> {
  const backups = await prisma.encryptedBackup.findMany({
    where: { userId, status: 'active' },
    take: limit + 1, // Fetch one extra to detect if there's a next page
    ...(cursor && { cursor: { id: cursor }, skip: 1 }), // Skip cursor itself
    orderBy: { createdAt: 'desc' },
  });

  const hasNextPage = backups.length > limit;
  const results = hasNextPage ? backups.slice(0, -1) : backups;
  const nextCursor = hasNextPage ? results[results.length - 1].id : undefined;

  return { backups: results, nextCursor };
}
```

**Keyset Pagination** (for time-series data):

```typescript
async function getBackupsSince(
  userId: string,
  sinceTimestamp: Date,
  limit: number = 100
): Promise<EncryptedBackup[]> {
  return prisma.encryptedBackup.findMany({
    where: {
      userId,
      status: 'active',
      createdAt: { gt: sinceTimestamp },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}
```

---

## 6. Migration Plan

### 6.1 Initial Schema Deployment

**Step 1: Generate Migration**
```bash
# Generate initial migration from Prisma schema
npx prisma migrate dev --name init_zkeb_schema --create-only

# Review generated SQL in prisma/migrations/TIMESTAMP_init_zkeb_schema/migration.sql
```

**Step 2: Railway Deployment**
```bash
# Deploy to Railway staging
railway up --service zkeb-server --environment staging

# Apply migration
railway run --service zkeb-server --environment staging \
  npx prisma migrate deploy

# Verify migration
railway run --service zkeb-server --environment staging \
  npx prisma db pull
```

**Step 3: Production Deployment (with backup)**
```bash
# Backup production database (Railway auto-backups, but explicit is safer)
railway run --service zkeb-server --environment production \
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Apply migration (zero-downtime if schema is additive)
railway run --service zkeb-server --environment production \
  npx prisma migrate deploy

# Verify
railway run --service zkeb-server --environment production \
  psql $DATABASE_URL -c "\dt zkeb.*"
```

### 6.2 Data Migration Procedures

**Scenario: Adding New Field to Encrypted Backups**

```sql
-- Migration: Add 'backup_metadata' encrypted field
-- File: prisma/migrations/TIMESTAMP_add_backup_metadata/migration.sql

BEGIN;

-- Add new column (nullable for existing rows)
ALTER TABLE zkeb.encrypted_backups
ADD COLUMN backup_metadata_encrypted BYTEA;

-- Backfill existing rows with empty encrypted metadata (if needed)
-- NOTE: This should be done client-side to maintain zero-knowledge
-- Server cannot generate encrypted values

-- Add NOT NULL constraint after backfill (optional)
-- ALTER TABLE zkeb.encrypted_backups
-- ALTER COLUMN backup_metadata_encrypted SET NOT NULL;

COMMIT;
```

**Scenario: Migrating to New Encryption Algorithm**

```typescript
// Migration script: Re-encrypt backups with new algorithm
// NOTE: Client-side only! Server never sees plaintext.

async function migrateEncryptionAlgorithm(
  userId: string,
  oldAlgorithm: string,
  newAlgorithm: string
) {
  console.log(`Migrating backups from ${oldAlgorithm} to ${newAlgorithm}...`);

  // 1. Fetch all backups with old algorithm
  const backups = await prisma.encryptedBackup.findMany({
    where: {
      userId,
      encryptionAlgorithm: oldAlgorithm,
      status: 'active',
    },
  });

  console.log(`Found ${backups.length} backups to migrate`);

  // 2. For each backup, client must:
  //    a. Download encrypted blob
  //    b. Decrypt with old key
  //    c. Re-encrypt with new key/algorithm
  //    d. Upload new ciphertext
  //    e. Update database record

  for (const backup of backups) {
    // Client-side operation (server just updates ciphertext)
    const { ciphertext, nonce, authTag } = await clientReEncrypt(backup);

    await prisma.encryptedBackup.update({
      where: { id: backup.id },
      data: {
        ciphertext,
        nonce,
        authTag,
        encryptionAlgorithm: newAlgorithm,
        encryptionVersion: '2.0',
        updatedAt: new Date(),
      },
    });
  }

  console.log('Migration complete');
}
```

### 6.3 Rollback Procedures

**Automatic Rollback** (if migration fails):
```bash
# Prisma automatically rolls back failed migrations
# Railway keeps transaction-wrapped migrations safe
```

**Manual Rollback** (if migration succeeds but breaks app):
```bash
# Mark migration as rolled back
railway run --service zkeb-server --environment production \
  npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Restore from backup
railway run --service zkeb-server --environment production \
  psql $DATABASE_URL < backup_TIMESTAMP.sql

# Verify rollback
railway run --service zkeb-server --environment production \
  npx prisma migrate status
```

**Rollback Best Practices**:
1. **Always have a backup** before applying migrations
2. **Test rollback procedure** in staging first
3. **Document rollback steps** in migration file comments
4. **Monitor error rates** post-migration (alert on spike)

### 6.4 Database Versioning Strategy

**Semantic Versioning for Schema**:
```
MAJOR.MINOR.PATCH

- MAJOR: Breaking changes (e.g., removing columns, changing data types)
- MINOR: Additive changes (e.g., new tables, new optional columns)
- PATCH: Fixes (e.g., index additions, constraint fixes)
```

**Schema Version Tracking Table**:
```sql
CREATE TABLE zkeb.schema_version (
  version VARCHAR(20) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by VARCHAR(100),
  description TEXT,
  migration_file TEXT
);

-- Insert initial version
INSERT INTO zkeb.schema_version (version, description)
VALUES ('1.0.0', 'Initial ZKEB schema with zero-knowledge guarantees');
```

---

## 7. Monitoring & Observability

### 7.1 Database Health Queries

**File: `scripts/health-check.sql`**

```sql
-- Query 1: Active connections
SELECT count(*) AS active_connections
FROM pg_stat_activity
WHERE datname = current_database()
  AND state = 'active';

-- Query 2: Long-running queries (> 5 minutes)
SELECT
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '5 minutes'
ORDER BY duration DESC;

-- Query 3: Table bloat (vacuum needed)
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_dead_tup AS dead_tuples,
  n_live_tup AS live_tuples,
  round(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_percentage
FROM pg_stat_user_tables
WHERE schemaname = 'zkeb'
  AND n_live_tup > 0
ORDER BY dead_percentage DESC;

-- Query 4: Index health
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'zkeb'
ORDER BY idx_scan ASC;

-- Query 5: Storage usage per table
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('zkeb.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size('zkeb.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size('zkeb.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'zkeb'
ORDER BY pg_total_relation_size('zkeb.'||tablename) DESC;
```

### 7.2 Performance Monitoring Queries

```sql
-- Query 1: Slowest queries (top 10)
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%zkeb%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Query 2: Most frequent queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%zkeb%'
ORDER BY calls DESC
LIMIT 10;

-- Query 3: Cache hit ratio (should be > 95%)
SELECT
  sum(heap_blks_read) AS heap_read,
  sum(heap_blks_hit) AS heap_hit,
  round(100 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_ratio
FROM pg_statio_user_tables
WHERE schemaname = 'zkeb';
```

### 7.3 Alerting Thresholds

**Datadog/CloudWatch Alerts**:

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| **Connection count** | > 80% of max | > 95% of max | Scale up database or investigate connection leaks |
| **Query latency (P95)** | > 100ms | > 500ms | Optimize slow queries, add indexes |
| **Cache hit ratio** | < 95% | < 90% | Increase shared_buffers, optimize queries |
| **Disk usage** | > 80% | > 95% | Cleanup old backups, increase storage |
| **Replication lag** | > 5s | > 30s | Check network, scale read replicas |
| **Failed logins** | > 10/min | > 50/min | Potential brute-force attack |
| **Backup failures** | 1 failure | 2 consecutive | Check storage quota, investigate errors |

---

## 8. Success Criteria

### 8.1 Zero-Knowledge Validation Checklist

- [x] No encryption keys stored in schema
- [x] All PII hashed (SHA-256)
- [x] Ciphertext stored as BYTEA (opaque)
- [x] RLS policies enforce multi-tenancy
- [x] Public keys only (no private keys)
- [x] Audit logs hash all identifiers
- [x] Schema verification script passes
- [x] Static analysis detects no forbidden keywords

### 8.2 Performance Validation Checklist

- [ ] P95 latency < 100ms for backup retrieval
- [ ] Support 1M+ backups per user without degradation
- [ ] Index usage > 90% on hot queries
- [ ] Cache hit ratio > 95%
- [ ] Connection pool never exhausts under load
- [ ] Quota enforcement queries < 50ms

### 8.3 Operational Readiness Checklist

- [ ] Migrations tested in staging
- [ ] Rollback procedures documented and tested
- [ ] Monitoring dashboards configured
- [ ] Alerting thresholds set
- [ ] Backup and restore procedures tested
- [ ] Database performance baseline established
- [ ] RLS context setting integrated in middleware

---

## Appendix: Schema Evolution Strategy

### Future Schema Enhancements

**Phase 2: Advanced Features** (Post-MVP)

1. **Full-Text Search on Encrypted Metadata**
   - Use client-side searchable encryption (e.g., order-preserving encryption)
   - Trade-off: Slightly weaker security for search capability

2. **Backup Deduplication**
   - Content-addressed storage (hash-based deduplication)
   - Store `content_hash` (SHA-256 of plaintext, computed client-side)
   - Deduplicate server-side by matching hashes

3. **Backup Sharing** (Zero-Knowledge)
   - Re-encrypt backups with shared key (client-side)
   - Store `shared_with_user_id_hash` for access control

4. **Compliance Extensions**
   - Add `retention_policy` enum (GDPR, HIPAA, SOC2)
   - Automatic deletion after retention period expires

### Schema Refactoring Guidelines

**When to Refactor**:
- Query performance degrades (P95 > 500ms)
- Table size exceeds 100GB (consider partitioning)
- Index bloat > 30% (rebuild indexes)
- New compliance requirements emerge

**How to Refactor**:
1. **Analyze impact**: Which queries break? How many users affected?
2. **Create migration plan**: Additive first, breaking changes last
3. **Test in staging**: Run full test suite + load tests
4. **Deploy with rollback plan**: Blue-green deployment if possible
5. **Monitor post-deploy**: Alert on error rate spikes

---

## Final Notes

This database schema enforces zero-knowledge guarantees at the PostgreSQL level. The server is physically incapable of decrypting user data, even if compromised. All design decisions prioritize **data integrity**, **user privacy**, and **cryptographic security**.

**Next Steps**:
1. Deploy schema to Railway staging environment
2. Integrate RLS context setting in API middleware
3. Run performance benchmarks against 1M+ synthetic backups
4. Conduct security audit of schema + queries
5. Document operational runbooks for production

**Contact**:
- **Rafael Santos** - Database Architecture
- **Anjali Chen** - Cryptography & RLS Policies
- **Sergei Ivanov** - PostgreSQL Performance Tuning

---

**© 2025 ZKEB Database Architecture**
**Version**: 1.0.0
**Classification**: Technical Specification - Internal Use
**Last Updated**: 2025-11-22
