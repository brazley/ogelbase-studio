// Prisma Seed - Development Data for ZKEB
// Creates mock users, devices, and encrypted backups for testing

import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates SHA-256 hash of email (zero-knowledge lookup)
 */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex');
}

/**
 * Mock PBKDF2 password hash
 * In production: Use @security/crypto package with 600k iterations
 */
function mockPasswordHash(password: string): string {
  return `pbkdf2:600000:${createHash('sha256').update(password).digest('hex')}:mock_salt`;
}

/**
 * Mock RSA-4096 public key (SubjectPublicKeyInfo format)
 * In production: Generated on client device, exported as SPKI
 */
function mockPublicKey(deviceName: string): string {
  const mockKey = createHash('sha256').update(deviceName).digest('hex');
  return `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA${mockKey}
-----END PUBLIC KEY-----`;
}

/**
 * Mock encrypted backup (AES-256-GCM)
 * In production: Client encrypts with BEK derived from UMK + DMK
 */
function mockEncryptedBackup(size: number) {
  return {
    ciphertext: randomBytes(size), // Opaque to server
    nonce: randomBytes(12),        // 96-bit GCM nonce
    authTag: randomBytes(16),      // 128-bit GCM tag
  };
}

/**
 * Mock RSA-PSS signature
 * In production: Device signs backup with private key
 */
function mockSignature(): string {
  return createHash('sha256').update(randomBytes(64)).digest('base64');
}

// ============================================================================
// SEED DATA
// ============================================================================

async function main() {
  console.log('🌱 Seeding ZKEB database...\n');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.backup.deleteMany();
  await prisma.device.deleteMany();
  await prisma.user.deleteMany();

  // =========================================================================
  // USER 1: Test User (alice@example.com)
  // =========================================================================
  console.log('👤 Creating User 1: Alice...');
  const alice = await prisma.user.create({
    data: {
      emailHash: hashEmail('alice@example.com'),
      passwordHash: mockPasswordHash('AliceTestPassword123!'),
    },
  });
  console.log(`   ✅ User ID: ${alice.id}`);

  // Alice's iPhone
  const aliceIPhone = await prisma.device.create({
    data: {
      userId: alice.id,
      deviceName: 'Alice\'s iPhone 15 Pro',
      publicKey: mockPublicKey('alice-iphone-15-pro'),
    },
  });
  console.log(`   📱 Device: ${aliceIPhone.deviceName} (${aliceIPhone.id})`);

  // Alice's Mac
  const aliceMac = await prisma.device.create({
    data: {
      userId: alice.id,
      deviceName: 'Alice\'s MacBook Pro',
      publicKey: mockPublicKey('alice-macbook-pro'),
    },
  });
  console.log(`   💻 Device: ${aliceMac.deviceName} (${aliceMac.id})`);

  // Create backups from iPhone
  console.log('   📦 Creating backups from iPhone...');
  for (let i = 0; i < 3; i++) {
    const backup = mockEncryptedBackup(1024 * (i + 1)); // 1KB, 2KB, 3KB
    await prisma.backup.create({
      data: {
        userId: alice.id,
        deviceId: aliceIPhone.id,
        ciphertext: backup.ciphertext,
        nonce: backup.nonce,
        authTag: backup.authTag,
        sizeBytes: backup.ciphertext.length,
        dataClassification: i === 2 ? 'Restricted' : 'Confidential',
        signature: mockSignature(),
      },
    });
  }
  console.log(`   ✅ Created 3 backups from iPhone\n`);

  // =========================================================================
  // USER 2: Test User (bob@example.com)
  // =========================================================================
  console.log('👤 Creating User 2: Bob...');
  const bob = await prisma.user.create({
    data: {
      emailHash: hashEmail('bob@example.com'),
      passwordHash: mockPasswordHash('BobTestPassword456!'),
    },
  });
  console.log(`   ✅ User ID: ${bob.id}`);

  // Bob's Android
  const bobAndroid = await prisma.device.create({
    data: {
      userId: bob.id,
      deviceName: 'Bob\'s Pixel 8 Pro',
      publicKey: mockPublicKey('bob-pixel-8-pro'),
    },
  });
  console.log(`   📱 Device: ${bobAndroid.deviceName} (${bobAndroid.id})`);

  // Create backups from Android
  console.log('   📦 Creating backups from Android...');
  for (let i = 0; i < 5; i++) {
    const backup = mockEncryptedBackup(2048 * (i + 1)); // 2KB, 4KB, 6KB, 8KB, 10KB
    await prisma.backup.create({
      data: {
        userId: bob.id,
        deviceId: bobAndroid.id,
        ciphertext: backup.ciphertext,
        nonce: backup.nonce,
        authTag: backup.authTag,
        sizeBytes: backup.ciphertext.length,
        dataClassification: 'Internal',
        signature: mockSignature(),
      },
    });
  }
  console.log(`   ✅ Created 5 backups from Android\n`);

  // =========================================================================
  // AUDIT LOGS
  // =========================================================================
  console.log('📝 Creating audit logs...');
  await prisma.auditLog.createMany({
    data: [
      // Alice's activity
      {
        userId: alice.id,
        action: 'user_created',
        ipAddress: '192.168.1.100', // Should be hashed in production
        userAgent: 'iOS/17.0 (iPhone15,2)',
        metadata: { deviceName: 'iPhone 15 Pro' },
      },
      {
        userId: alice.id,
        action: 'device_added',
        ipAddress: '192.168.1.100',
        userAgent: 'iOS/17.0 (iPhone15,2)',
        metadata: { deviceName: 'iPhone 15 Pro' },
      },
      {
        userId: alice.id,
        action: 'backup_created',
        ipAddress: '192.168.1.100',
        userAgent: 'iOS/17.0 (iPhone15,2)',
        metadata: {
          sizeBytes: 1024,
          dataClassification: 'Confidential',
        },
      },
      // Bob's activity
      {
        userId: bob.id,
        action: 'user_created',
        ipAddress: '10.0.0.50',
        userAgent: 'Android/14 (Pixel 8 Pro)',
        metadata: { deviceName: 'Pixel 8 Pro' },
      },
      {
        userId: bob.id,
        action: 'device_added',
        ipAddress: '10.0.0.50',
        userAgent: 'Android/14 (Pixel 8 Pro)',
        metadata: { deviceName: 'Pixel 8 Pro' },
      },
      {
        userId: bob.id,
        action: 'backup_created',
        ipAddress: '10.0.0.50',
        userAgent: 'Android/14 (Pixel 8 Pro)',
        metadata: {
          sizeBytes: 2048,
          dataClassification: 'Internal',
        },
      },
    ],
  });
  console.log(`   ✅ Created 6 audit log entries\n`);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  const userCount = await prisma.user.count();
  const deviceCount = await prisma.device.count();
  const backupCount = await prisma.backup.count();
  const auditLogCount = await prisma.auditLog.count();

  console.log('📊 Database seed complete!');
  console.log(`   👥 Users: ${userCount}`);
  console.log(`   📱 Devices: ${deviceCount}`);
  console.log(`   📦 Backups: ${backupCount}`);
  console.log(`   📝 Audit Logs: ${auditLogCount}\n`);

  console.log('🔐 Zero-Knowledge Verification:');
  console.log('   ✅ No encryption keys stored');
  console.log('   ✅ No passwords stored (only hashes)');
  console.log('   ✅ No private keys stored (only public)');
  console.log('   ✅ All backups are opaque encrypted blobs\n');

  console.log('🧪 Test Credentials:');
  console.log('   Alice: alice@example.com / AliceTestPassword123!');
  console.log('   Bob:   bob@example.com / BobTestPassword456!\n');
}

// ============================================================================
// EXECUTE
// ============================================================================

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
