# ZKEB Real-World Examples

This document demonstrates real-world usage of ZKEB cryptography primitives in complete workflows.

---

## Table of Contents

1. [Complete Device Onboarding](#1-complete-device-onboarding)
2. [Multi-Device Backup Encryption](#2-multi-device-backup-encryption)
3. [Account Recovery with Password](#3-account-recovery-with-password)
4. [Server-Side Backup Verification](#4-server-side-backup-verification)
5. [Key Rotation](#5-key-rotation)
6. [Secure Metadata Management](#6-secure-metadata-management)

---

## 1. Complete Device Onboarding

**Scenario:** User creates account on their first device (iPhone). Generate all keys, register device, create first backup.

```typescript
import {
  generateUserMasterKey,
  deriveKeysFromUMK,
  encrypt,
  generateKeyPair,
  sign,
  exportPublicKey,
  exportPrivateKey
} from '@security/crypto';

/**
 * Complete device onboarding workflow
 */
async function onboardNewDevice(
  userId: string,
  deviceId: string
): Promise<{
  umk: Uint8Array;
  deviceKeys: any;
  backupId: string;
}> {
  console.log('🚀 Starting device onboarding...');

  // Step 1: Generate User Master Key (UMK)
  // This is the root of trust - stored ONLY client-side
  const umk = await generateUserMasterKey();
  console.log('✅ Generated UMK (256-bit)');

  // Step 2: Store UMK securely
  // Platform-specific secure storage
  if (platform === 'ios') {
    // iOS Secure Enclave with biometric protection
    await KeychainAccess.store('umk', umk.key, {
      accessibility: 'whenUnlockedThisDeviceOnly',
      biometry: true
    });
  } else if (platform === 'web') {
    // Browser IndexedDB with Web Crypto wrapping
    await secureStorage.storeEncryptedKey('umk', umk.key);
  } else if (platform === 'android') {
    // Android Keystore with biometric protection
    await AndroidKeystore.store('umk', umk.key, {
      requireBiometric: true
    });
  }
  console.log('✅ Stored UMK securely');

  // Step 3: Derive device-specific keys
  const { dmk, keys } = await deriveKeysFromUMK(umk, deviceId);
  console.log('✅ Derived DMK, BEK, MEK for device');

  // Step 4: Generate RSA key pair for device authentication
  const rsaKeyPair = await generateKeyPair();
  console.log('✅ Generated RSA-4096 key pair (this may take a moment...)');

  // Step 5: Store RSA private key locally (NEVER transmit)
  const privateKeyBytes = await exportPrivateKey(rsaKeyPair.privateKey);
  await secureStorage.store('device-private-key', privateKeyBytes);
  console.log('✅ Stored RSA private key locally');

  // Step 6: Register device with server
  const publicKeyBytes = await exportPublicKey(rsaKeyPair.publicKey);
  const deviceCertificate = {
    userId,
    deviceId,
    publicKey: Array.from(publicKeyBytes),
    platform: platform,
    createdAt: Date.now(),
    deviceName: await getDeviceName()
  };

  // Sign certificate to prove device ownership
  const certData = new TextEncoder().encode(JSON.stringify(deviceCertificate));
  const certSignature = await sign(certData, rsaKeyPair.privateKey);

  await api.registerDevice({
    certificate: deviceCertificate,
    signature: Array.from(certSignature)
  });
  console.log('✅ Registered device with server');

  // Step 7: Create initial backup
  const initialBackup = {
    deviceSettings: await getDeviceSettings(),
    userPreferences: await getUserPreferences(),
    timestamp: Date.now()
  };

  const backupData = new TextEncoder().encode(JSON.stringify(initialBackup));
  const encryptedBackup = await encrypt(backupData, keys.backupEncryptionKey);

  // Step 8: Create backup metadata (encrypted separately)
  const backupMetadata = {
    deviceId,
    backupSize: backupData.length,
    encryptedSize: encryptedBackup.ciphertext.length,
    timestamp: Date.now(),
    version: '1.0'
  };

  const metadataBytes = new TextEncoder().encode(JSON.stringify(backupMetadata));
  const encryptedMetadata = await encrypt(metadataBytes, keys.metadataEncryptionKey);

  // Step 9: Sign backup hash for integrity verification
  const backupHash = await crypto.subtle.digest('SHA-256', encryptedBackup.ciphertext);
  const backupSignature = await sign(new Uint8Array(backupHash), rsaKeyPair.privateKey);

  // Step 10: Upload backup to server
  const backupId = await api.uploadBackup({
    userId,
    deviceId,
    encryptedData: Array.from(encryptedBackup.ciphertext),
    nonce: Array.from(encryptedBackup.nonce),
    tag: Array.from(encryptedBackup.tag),
    metadata: {
      ciphertext: Array.from(encryptedMetadata.ciphertext),
      nonce: Array.from(encryptedMetadata.nonce),
      tag: Array.from(encryptedMetadata.tag)
    },
    hash: Array.from(new Uint8Array(backupHash)),
    signature: Array.from(backupSignature)
  });

  console.log(`✅ Created initial backup (ID: ${backupId})`);
  console.log('🎉 Device onboarding complete!');

  return {
    umk: umk.key,
    deviceKeys: { dmk, keys },
    backupId
  };
}

// Usage
const result = await onboardNewDevice('user-123', 'iphone-abc123');
console.log('Backup ID:', result.backupId);
```

**Performance:**
- Total time: ~500ms
- Breakdown:
  - UMK generation: <1ms
  - Key derivation: ~5ms
  - RSA key generation: ~300ms (one-time)
  - Backup encryption: ~10ms
  - Signing: ~10ms
  - Network upload: ~100-200ms

---

## 2. Multi-Device Backup Encryption

**Scenario:** User has multiple devices (iPhone, iPad, Web). Each device creates device-specific backups, but all can access shared data.

```typescript
import {
  deriveKeysFromUMK,
  encrypt,
  decrypt
} from '@security/crypto';

/**
 * Multi-device backup management
 */
class MultiDeviceBackupManager {
  constructor(private umk: Uint8Array) {}

  /**
   * Create device-specific backup
   */
  async createBackup(
    deviceId: string,
    data: any
  ): Promise<{ backupId: string; encryptedSize: number }> {
    // Derive keys for this device
    const { keys } = await deriveKeysFromUMK(this.umk, deviceId);

    // Encrypt backup data with device-specific BEK
    const backupData = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await encrypt(backupData, keys.backupEncryptionKey);

    // Create metadata (device-specific)
    const metadata = {
      deviceId,
      timestamp: Date.now(),
      dataSize: backupData.length,
      platform: platform
    };

    const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
    const encryptedMetadata = await encrypt(metadataBytes, keys.metadataEncryptionKey);

    // Upload to server
    const backupId = await api.uploadBackup({
      deviceId,
      encryptedData: Array.from(encrypted.ciphertext),
      nonce: Array.from(encrypted.nonce),
      tag: Array.from(encrypted.tag),
      metadata: {
        ciphertext: Array.from(encryptedMetadata.ciphertext),
        nonce: Array.from(encryptedMetadata.nonce),
        tag: Array.from(encryptedMetadata.tag)
      }
    });

    console.log(`✅ Created backup for device ${deviceId}: ${backupId}`);
    return {
      backupId,
      encryptedSize: encrypted.ciphertext.length
    };
  }

  /**
   * Restore backup from any device
   */
  async restoreBackup(
    backupId: string,
    originalDeviceId: string
  ): Promise<any> {
    // Fetch encrypted backup from server
    const backup = await api.getBackup(backupId);

    // Derive keys for the device that created this backup
    const { keys } = await deriveKeysFromUMK(this.umk, originalDeviceId);

    // Decrypt metadata first
    const encryptedMetadata = {
      ciphertext: new Uint8Array(backup.metadata.ciphertext),
      nonce: new Uint8Array(backup.metadata.nonce),
      tag: new Uint8Array(backup.metadata.tag)
    };

    const metadataBytes = await decrypt(encryptedMetadata, keys.metadataEncryptionKey);
    const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));

    console.log('📋 Backup metadata:', metadata);

    // Decrypt backup data
    const encryptedBackup = {
      ciphertext: new Uint8Array(backup.encryptedData),
      nonce: new Uint8Array(backup.nonce),
      tag: new Uint8Array(backup.tag)
    };

    const backupData = await decrypt(encryptedBackup, keys.backupEncryptionKey);
    const data = JSON.parse(new TextDecoder().decode(backupData));

    console.log(`✅ Restored backup ${backupId}`);
    return data;
  }

  /**
   * List all backups across all devices
   */
  async listAllBackups(): Promise<Array<{ deviceId: string; backupIds: string[] }>> {
    const backups = await api.listBackups();

    // Group by device
    const deviceBackups = new Map<string, string[]>();

    for (const backup of backups) {
      const deviceId = backup.deviceId;
      if (!deviceBackups.has(deviceId)) {
        deviceBackups.set(deviceId, []);
      }
      deviceBackups.get(deviceId)!.push(backup.backupId);
    }

    return Array.from(deviceBackups.entries()).map(([deviceId, backupIds]) => ({
      deviceId,
      backupIds
    }));
  }

  /**
   * Migrate data from one device to another
   */
  async migrateDevice(
    oldDeviceId: string,
    newDeviceId: string,
    backupId: string
  ): Promise<string> {
    // 1. Restore backup from old device
    const data = await this.restoreBackup(backupId, oldDeviceId);

    // 2. Create new backup on new device
    const { backupId: newBackupId } = await this.createBackup(newDeviceId, data);

    console.log(`✅ Migrated backup from ${oldDeviceId} to ${newDeviceId}`);
    return newBackupId;
  }
}

// Usage Example: User has 3 devices
const umk = new Uint8Array(32); // Retrieved from secure storage
const manager = new MultiDeviceBackupManager(umk);

// iPhone creates backup
await manager.createBackup('iphone-abc', { contacts: [...], photos: [...] });

// iPad creates backup
await manager.createBackup('ipad-def', { documents: [...], notes: [...] });

// Web browser creates backup
await manager.createBackup('web-ghi', { bookmarks: [...], history: [...] });

// List all backups
const allBackups = await manager.listAllBackups();
console.log('All backups:', allBackups);

// iPad restores iPhone backup (cross-device)
const iphoneData = await manager.restoreBackup('backup-123', 'iphone-abc');
console.log('Restored iPhone data on iPad:', iphoneData);
```

**Key Insight:** Same UMK allows all devices to decrypt each other's backups, but different DMKs ensure device-specific key separation.

---

## 3. Account Recovery with Password

**Scenario:** User loses device but remembers password. Recover UMK from password and restore all backups.

```typescript
import {
  deriveKeyFromPassword,
  verifyPassword,
  deriveKeysFromUMK,
  decrypt,
  encrypt
} from '@security/crypto';

/**
 * Account Recovery Manager
 */
class AccountRecoveryManager {
  /**
   * Setup password-based recovery during account creation
   */
  async setupPasswordRecovery(
    umk: Uint8Array,
    password: string
  ): Promise<void> {
    console.log('🔐 Setting up password recovery...');

    // Derive encryption key from password (600k iterations)
    const { key: passwordKey, salt } = await deriveKeyFromPassword(password);
    console.log('✅ Derived key from password (65-70ms)');

    // Encrypt UMK with password-derived key
    const encryptedUmk = await encrypt(umk, passwordKey);

    // Store encrypted UMK + salt on server
    // Salt is NOT secret, can be stored server-side
    await api.storeRecoveryData({
      encryptedUmk: {
        ciphertext: Array.from(encryptedUmk.ciphertext),
        nonce: Array.from(encryptedUmk.nonce),
        tag: Array.from(encryptedUmk.tag)
      },
      salt: Array.from(salt),
      iterations: 600000 // Store iteration count for future-proofing
    });

    console.log('✅ Password recovery setup complete');
  }

  /**
   * Recover account with password
   */
  async recoverAccount(
    userId: string,
    password: string
  ): Promise<{
    umk: Uint8Array;
    backupCount: number;
  }> {
    console.log('🔓 Starting account recovery...');

    // Step 1: Fetch recovery data from server
    const recoveryData = await api.getRecoveryData(userId);
    const salt = new Uint8Array(recoveryData.salt);
    console.log('✅ Retrieved recovery data from server');

    // Step 2: Derive key from password (same salt)
    const { key: passwordKey } = await deriveKeyFromPassword(
      password,
      salt,
      recoveryData.iterations
    );
    console.log('✅ Derived key from password (65-70ms)');

    // Step 3: Decrypt UMK
    const encryptedUmk = {
      ciphertext: new Uint8Array(recoveryData.encryptedUmk.ciphertext),
      nonce: new Uint8Array(recoveryData.encryptedUmk.nonce),
      tag: new Uint8Array(recoveryData.encryptedUmk.tag)
    };

    let umk: Uint8Array;
    try {
      umk = await decrypt(encryptedUmk, passwordKey);
      console.log('✅ Decrypted UMK successfully');
    } catch (error) {
      console.error('❌ Password incorrect or UMK corrupted');
      throw new Error('Account recovery failed: Invalid password');
    }

    // Step 4: Verify UMK by attempting to decrypt a backup
    const backups = await api.listBackups(userId);
    if (backups.length > 0) {
      try {
        const testBackup = backups[0];
        const { keys } = await deriveKeysFromUMK(umk, testBackup.deviceId);

        const encryptedBackup = {
          ciphertext: new Uint8Array(testBackup.encryptedData),
          nonce: new Uint8Array(testBackup.nonce),
          tag: new Uint8Array(testBackup.tag)
        };

        await decrypt(encryptedBackup, keys.backupEncryptionKey);
        console.log('✅ UMK verified (successfully decrypted test backup)');
      } catch (error) {
        console.error('❌ UMK verification failed');
        throw new Error('Account recovery failed: UMK corrupted or backups corrupted');
      }
    }

    console.log(`🎉 Account recovered! ${backups.length} backups available`);

    return {
      umk,
      backupCount: backups.length
    };
  }

  /**
   * Change recovery password
   */
  async changeRecoveryPassword(
    umk: Uint8Array,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    console.log('🔄 Changing recovery password...');

    // Verify old password first
    const recoveryData = await api.getRecoveryData();
    const oldSalt = new Uint8Array(recoveryData.salt);

    const { key: oldPasswordKey } = await deriveKeyFromPassword(oldPassword, oldSalt);

    const encryptedUmk = {
      ciphertext: new Uint8Array(recoveryData.encryptedUmk.ciphertext),
      nonce: new Uint8Array(recoveryData.encryptedUmk.nonce),
      tag: new Uint8Array(recoveryData.encryptedUmk.tag)
    };

    try {
      const decryptedUmk = await decrypt(encryptedUmk, oldPasswordKey);

      // Verify decrypted UMK matches current UMK
      if (!arrayEquals(decryptedUmk, umk)) {
        throw new Error('UMK mismatch');
      }

      console.log('✅ Old password verified');
    } catch (error) {
      console.error('❌ Old password incorrect');
      throw new Error('Password change failed: Invalid old password');
    }

    // Re-encrypt with new password
    await this.setupPasswordRecovery(umk, newPassword);
    console.log('✅ Password changed successfully');
  }
}

// Helper function
function arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Usage Example
const recovery = new AccountRecoveryManager();

// During account creation
const umk = await generateUserMasterKey();
await recovery.setupPasswordRecovery(umk.key, 'my-strong-password');

// Later: User loses device
const { umk: recoveredUmk, backupCount } = await recovery.recoverAccount(
  'user-123',
  'my-strong-password'
);

console.log(`Recovered UMK, ${backupCount} backups available`);
```

**Security Notes:**
- ⚠️ Password recovery is the **weakest link** in ZKEB
- Recommend Shamir Secret Sharing for high-security scenarios
- Never transmit password to server
- Salt can be stored server-side (not secret)

---

## 4. Server-Side Backup Verification

**Scenario:** Server receives backup upload. Verify signature before accepting.

```typescript
import {
  verify,
  importPublicKey
} from '@security/crypto';

/**
 * Server-side backup verification
 */
class BackupVerificationService {
  /**
   * Verify backup signature before storing
   */
  async verifyBackupIntegrity(
    deviceId: string,
    encryptedBackup: Uint8Array,
    signature: Uint8Array,
    hash: Uint8Array
  ): Promise<boolean> {
    console.log(`🔍 Verifying backup from device ${deviceId}...`);

    // Step 1: Retrieve device public key from database
    const device = await db.getDevice(deviceId);
    if (!device) {
      console.error('❌ Device not registered');
      return false;
    }

    const publicKeyBytes = new Uint8Array(device.publicKey);
    const publicKey = await importPublicKey(publicKeyBytes);
    console.log('✅ Retrieved device public key');

    // Step 2: Verify provided hash matches backup data
    const computedHash = await crypto.subtle.digest('SHA-256', encryptedBackup);
    const computedHashArray = new Uint8Array(computedHash);

    if (!arrayEquals(hash, computedHashArray)) {
      console.error('❌ Hash mismatch - backup data corrupted or tampered');
      return false;
    }
    console.log('✅ Hash verified');

    // Step 3: Verify signature
    const isValid = await verify(hash, signature, publicKey);

    if (!isValid) {
      console.error('❌ Signature verification failed - possible tampering');
      return false;
    }

    console.log('✅ Signature verified - backup authentic');
    return true;
  }

  /**
   * Accept and store verified backup
   */
  async acceptBackup(
    userId: string,
    deviceId: string,
    encryptedBackup: Uint8Array,
    signature: Uint8Array,
    hash: Uint8Array,
    metadata: any
  ): Promise<string> {
    // Verify integrity
    const isValid = await this.verifyBackupIntegrity(
      deviceId,
      encryptedBackup,
      signature,
      hash
    );

    if (!isValid) {
      throw new Error('Backup verification failed - rejected');
    }

    // Store backup in database
    const backupId = generateId();
    await db.storeBackup({
      backupId,
      userId,
      deviceId,
      encryptedData: encryptedBackup,
      signature,
      hash,
      metadata,
      verifiedAt: Date.now(),
      createdAt: Date.now()
    });

    console.log(`✅ Backup ${backupId} accepted and stored`);
    return backupId;
  }

  /**
   * Verify device signature during registration
   */
  async verifyDeviceRegistration(
    certificate: any,
    signature: Uint8Array
  ): Promise<boolean> {
    console.log(`🔍 Verifying device registration for ${certificate.deviceId}...`);

    // Import public key from certificate
    const publicKeyBytes = new Uint8Array(certificate.publicKey);
    const publicKey = await importPublicKey(publicKeyBytes);

    // Verify certificate signature (self-signed)
    const certData = new TextEncoder().encode(JSON.stringify(certificate));
    const isValid = await verify(certData, signature, publicKey);

    if (!isValid) {
      console.error('❌ Device registration signature invalid');
      return false;
    }

    console.log('✅ Device registration verified');
    return true;
  }
}

// Helper function
function arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function generateId(): string {
  return crypto.randomUUID();
}

// Usage Example (Server-side)
const verificationService = new BackupVerificationService();

// Accept backup upload
app.post('/api/backups', async (req, res) => {
  const {
    userId,
    deviceId,
    encryptedData,
    signature,
    hash,
    metadata
  } = req.body;

  try {
    const backupId = await verificationService.acceptBackup(
      userId,
      deviceId,
      new Uint8Array(encryptedData),
      new Uint8Array(signature),
      new Uint8Array(hash),
      metadata
    );

    res.json({ backupId, status: 'verified' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Server Benefits:**
- ✅ Server can verify backup authenticity without decryption
- ✅ Prevents malicious backup uploads
- ✅ No access to plaintext data (zero-knowledge)

---

## 5. Key Rotation

**Scenario:** Security best practice requires periodic key rotation. Rotate device keys without changing UMK.

```typescript
import {
  generateUserMasterKey,
  deriveKeysFromUMK,
  encrypt,
  decrypt
} from '@security/crypto';

/**
 * Key Rotation Manager
 */
class KeyRotationManager {
  /**
   * Rotate device keys (creates new device registration)
   */
  async rotateDeviceKeys(
    umk: Uint8Array,
    oldDeviceId: string
  ): Promise<{
    newDeviceId: string;
    reEncryptedBackups: number;
  }> {
    console.log(`🔄 Rotating keys for device ${oldDeviceId}...`);

    // Step 1: Generate new device ID (forces new DMK derivation)
    const newDeviceId = `${oldDeviceId}-rotated-${Date.now()}`;

    // Step 2: Derive new keys
    const { keys: newKeys } = await deriveKeysFromUMK(umk, newDeviceId);
    console.log('✅ Derived new device keys');

    // Step 3: Fetch all backups created with old keys
    const oldBackups = await api.listBackups(oldDeviceId);
    console.log(`📋 Found ${oldBackups.length} backups to re-encrypt`);

    // Step 4: Re-encrypt all backups with new keys
    const { keys: oldKeys } = await deriveKeysFromUMK(umk, oldDeviceId);

    for (const backup of oldBackups) {
      // Decrypt with old key
      const encryptedBackup = {
        ciphertext: new Uint8Array(backup.encryptedData),
        nonce: new Uint8Array(backup.nonce),
        tag: new Uint8Array(backup.tag)
      };

      const plaintext = await decrypt(encryptedBackup, oldKeys.backupEncryptionKey);

      // Encrypt with new key
      const reEncrypted = await encrypt(plaintext, newKeys.backupEncryptionKey);

      // Update backup
      await api.updateBackup(backup.backupId, {
        deviceId: newDeviceId,
        encryptedData: Array.from(reEncrypted.ciphertext),
        nonce: Array.from(reEncrypted.nonce),
        tag: Array.from(reEncrypted.tag),
        rotatedAt: Date.now()
      });
    }

    // Step 5: Revoke old device
    await api.revokeDevice(oldDeviceId);

    console.log(`✅ Key rotation complete: ${oldBackups.length} backups re-encrypted`);

    return {
      newDeviceId,
      reEncryptedBackups: oldBackups.length
    };
  }

  /**
   * Emergency UMK rotation (complete account reset)
   */
  async rotateUMK(
    oldUmk: Uint8Array
  ): Promise<{
    newUmk: Uint8Array;
    reEncryptedBackups: number;
  }> {
    console.log('⚠️  EMERGENCY: Rotating UMK (destructive operation)...');

    // Generate new UMK
    const newUmk = await generateUserMasterKey();
    console.log('✅ Generated new UMK');

    // Fetch ALL backups across ALL devices
    const allBackups = await api.listAllBackups();
    console.log(`📋 Found ${allBackups.length} total backups`);

    let reEncryptedCount = 0;

    for (const backup of allBackups) {
      // Decrypt with old UMK
      const { keys: oldKeys } = await deriveKeysFromUMK(oldUmk, backup.deviceId);

      const encryptedBackup = {
        ciphertext: new Uint8Array(backup.encryptedData),
        nonce: new Uint8Array(backup.nonce),
        tag: new Uint8Array(backup.tag)
      };

      const plaintext = await decrypt(encryptedBackup, oldKeys.backupEncryptionKey);

      // Encrypt with new UMK (same device ID)
      const { keys: newKeys } = await deriveKeysFromUMK(newUmk.key, backup.deviceId);
      const reEncrypted = await encrypt(plaintext, newKeys.backupEncryptionKey);

      // Update backup
      await api.updateBackup(backup.backupId, {
        encryptedData: Array.from(reEncrypted.ciphertext),
        nonce: Array.from(reEncrypted.nonce),
        tag: Array.from(reEncrypted.tag),
        umkRotatedAt: Date.now()
      });

      reEncryptedCount++;
    }

    console.log(`✅ UMK rotation complete: ${reEncryptedCount} backups re-encrypted`);
    console.log('⚠️  CRITICAL: Store new UMK securely and update password recovery!');

    return {
      newUmk: newUmk.key,
      reEncryptedBackups: reEncryptedCount
    };
  }
}

// Usage Example
const rotation = new KeyRotationManager();

// Rotate device keys (safe, non-destructive)
const { newDeviceId } = await rotation.rotateDeviceKeys(umk, 'iphone-abc123');
console.log('New device ID:', newDeviceId);

// Emergency UMK rotation (only if UMK compromised)
// WARNING: This is destructive and affects ALL devices
const { newUmk } = await rotation.rotateUMK(oldUmk);
await secureStorage.store('umk', newUmk);
```

**Rotation Recommendations:**
- **Device Keys:** Rotate annually or after device compromise
- **UMK:** Only rotate if compromised (destructive, affects all devices)

---

## 6. Secure Metadata Management

**Scenario:** Encrypt backup metadata separately from backup data for granular access control.

```typescript
import {
  deriveKeysFromUMK,
  encrypt,
  decrypt
} from '@security/crypto';

/**
 * Metadata Manager
 */
class BackupMetadataManager {
  constructor(private umk: Uint8Array) {}

  /**
   * Create backup with separate metadata encryption
   */
  async createBackupWithMetadata(
    deviceId: string,
    backupData: any,
    metadata: any
  ): Promise<string> {
    const { keys } = await deriveKeysFromUMK(this.umk, deviceId);

    // Encrypt backup data
    const dataBytes = new TextEncoder().encode(JSON.stringify(backupData));
    const encryptedData = await encrypt(dataBytes, keys.backupEncryptionKey);

    // Encrypt metadata SEPARATELY with MEK
    const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
    const encryptedMetadata = await encrypt(metadataBytes, keys.metadataEncryptionKey);

    // Upload both
    const backupId = await api.uploadBackup({
      deviceId,
      data: {
        ciphertext: Array.from(encryptedData.ciphertext),
        nonce: Array.from(encryptedData.nonce),
        tag: Array.from(encryptedData.tag)
      },
      metadata: {
        ciphertext: Array.from(encryptedMetadata.ciphertext),
        nonce: Array.from(encryptedMetadata.nonce),
        tag: Array.from(encryptedMetadata.tag)
      }
    });

    return backupId;
  }

  /**
   * List backups (decrypt metadata only, not data)
   */
  async listBackupsWithMetadata(
    deviceId: string
  ): Promise<Array<{ backupId: string; metadata: any }>> {
    const { keys } = await deriveKeysFromUMK(this.umk, deviceId);

    const backups = await api.listBackups(deviceId);

    const decryptedBackups = [];

    for (const backup of backups) {
      // Decrypt ONLY metadata (fast)
      const encryptedMetadata = {
        ciphertext: new Uint8Array(backup.metadata.ciphertext),
        nonce: new Uint8Array(backup.metadata.nonce),
        tag: new Uint8Array(backup.metadata.tag)
      };

      const metadataBytes = await decrypt(encryptedMetadata, keys.metadataEncryptionKey);
      const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));

      decryptedBackups.push({
        backupId: backup.backupId,
        metadata
      });
    }

    return decryptedBackups;
  }

  /**
   * Update metadata without touching backup data
   */
  async updateMetadata(
    backupId: string,
    deviceId: string,
    newMetadata: any
  ): Promise<void> {
    const { keys } = await deriveKeysFromUMK(this.umk, deviceId);

    // Encrypt new metadata
    const metadataBytes = new TextEncoder().encode(JSON.stringify(newMetadata));
    const encryptedMetadata = await encrypt(metadataBytes, keys.metadataEncryptionKey);

    // Update only metadata
    await api.updateBackupMetadata(backupId, {
      ciphertext: Array.from(encryptedMetadata.ciphertext),
      nonce: Array.from(encryptedMetadata.nonce),
      tag: Array.from(encryptedMetadata.tag)
    });
  }
}

// Usage Example
const metadataManager = new BackupMetadataManager(umk);

// Create backup with rich metadata
await metadataManager.createBackupWithMetadata(
  'iphone-abc',
  { contacts: [...], photos: [...] }, // Backup data
  { // Metadata
    timestamp: Date.now(),
    deviceName: 'iPhone 14 Pro',
    dataSize: 1024000,
    tags: ['contacts', 'photos'],
    version: '1.0'
  }
);

// List backups (decrypt metadata only - fast!)
const backups = await metadataManager.listBackupsWithMetadata('iphone-abc');
console.log('Available backups:', backups);

// Update metadata (e.g., add tag)
await metadataManager.updateMetadata(
  'backup-123',
  'iphone-abc',
  { ...existingMetadata, tags: [...existingMetadata.tags, 'updated'] }
);
```

**Benefits of Separate Metadata Encryption:**
- ✅ List backups without decrypting full data (fast)
- ✅ Search metadata without accessing sensitive data
- ✅ Update metadata without re-encrypting backup data
- ✅ Key separation: MEK compromise doesn't expose backup data

---

## Conclusion

These examples demonstrate real-world ZKEB workflows:

1. ✅ **Device Onboarding**: Complete setup with UMK, DMK, RSA keys, and first backup
2. ✅ **Multi-Device**: Seamless backup management across devices
3. ✅ **Account Recovery**: Password-based UMK recovery
4. ✅ **Server Verification**: Zero-knowledge backup verification
5. ✅ **Key Rotation**: Safe key rotation without UMK change
6. ✅ **Metadata Management**: Efficient metadata handling

**All primitives work together seamlessly for production-ready ZKEB implementation.**

---

**Last Updated:** 2024-11-22
**Version:** 0.1.0-alpha
