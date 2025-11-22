# ZKEB Full-Stack TypeScript Architecture
## Production-Ready Node.js + Next.js + Railway Implementation

**Architect**: Jordan Kim (Full-Stack TypeScript Developer)
**Date**: 2025-01-22
**Status**: Design Complete → Ready for Implementation
**Stack**: Node.js, Next.js 14, TypeScript, Prisma, Railway

---

## Executive Summary

This document specifies the complete full-stack TypeScript architecture for ZKEB (Zero-Knowledge Encrypted Backup), a production-grade encryption system deployed on Railway. The architecture maintains zero-knowledge guarantees while delivering exceptional developer experience through end-to-end type safety.

**Design Philosophy**: If the types compile, the encryption works. If the API call succeeds, the data is secure.

---

## 1. API Server Architecture (Node.js)

### 1.1 Framework Choice: **Fastify** ✅

**Recommendation: Fastify over Express**

**Rationale**:
```typescript
// Performance comparison (req/sec)
Fastify:  76,000 req/sec (with logging)
Express:  15,000 req/sec (5x slower)

// Type safety
Fastify: Schema-based validation + TypeScript inference
Express: Requires manual type assertions

// Modern features
Fastify: Async/await native, plugin system, schema validation
Express: Middleware-only, requires bolt-ons
```

**Decision Matrix**:

| Criterion | Fastify | Express | Winner |
|-----------|---------|---------|--------|
| Performance | 5x faster | Baseline | **Fastify** |
| Type Safety | Schema-driven | Manual | **Fastify** |
| DX | Plugin ecosystem | Mature but dated | **Fastify** |
| Railway Support | Native | Native | Tie |
| Team Familiarity | Learning curve | Known | Express |
| **VERDICT** | ✅ | ❌ | **Fastify** |

### 1.2 Project Structure

```
packages/server/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth/
│   │   │   │   ├── register.ts       // POST /auth/register
│   │   │   │   ├── login.ts          // POST /auth/login
│   │   │   │   ├── refresh.ts        // POST /auth/refresh
│   │   │   │   └── schemas.ts        // Zod validation schemas
│   │   │   ├── devices/
│   │   │   │   ├── register.ts       // POST /devices/register
│   │   │   │   ├── list.ts           // GET /devices
│   │   │   │   ├── revoke.ts         // DELETE /devices/:id
│   │   │   │   └── schemas.ts
│   │   │   ├── backups/
│   │   │   │   ├── create.ts         // POST /backups
│   │   │   │   ├── list.ts           // GET /backups
│   │   │   │   ├── get.ts            // GET /backups/:id
│   │   │   │   ├── delete.ts         // DELETE /backups/:id
│   │   │   │   └── schemas.ts
│   │   │   └── health/
│   │   │       └── index.ts          // GET /health
│   │   └── plugins/
│   │       ├── auth.ts               // JWT authentication plugin
│   │       ├── rate-limit.ts         // Rate limiting plugin
│   │       ├── cors.ts               // CORS configuration
│   │       ├── security.ts           // Helmet + CSP
│   │       └── prisma.ts             // Prisma client plugin
│   ├── services/
│   │   ├── auth.service.ts           // JWT issuance, refresh
│   │   ├── device.service.ts         // Device registry management
│   │   ├── backup.service.ts         // Encrypted blob CRUD
│   │   ├── crypto-verify.service.ts  // Signature verification
│   │   └── audit.service.ts          // Audit logging
│   ├── lib/
│   │   ├── prisma.ts                 // Prisma client singleton
│   │   ├── redis.ts                  // Redis client (sessions)
│   │   ├── logger.ts                 // Structured logging (Pino)
│   │   └── errors.ts                 // Custom error classes
│   ├── types/
│   │   ├── api.ts                    // API request/response types
│   │   ├── auth.ts                   // JWT payload types
│   │   └── crypto.ts                 // Cryptographic types
│   ├── middleware/
│   │   ├── auth.middleware.ts        // JWT verification
│   │   ├── validation.middleware.ts  // Schema validation
│   │   └── error.middleware.ts       // Global error handler
│   ├── config/
│   │   ├── index.ts                  // Centralized config
│   │   └── schema.ts                 // Config validation (Zod)
│   └── index.ts                      // Server entrypoint
├── prisma/
│   ├── schema.prisma                 // Database schema
│   └── migrations/                   // Migration history
├── tests/
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── devices.test.ts
│   │   └── backups.test.ts
│   └── unit/
│       ├── services/
│       └── lib/
├── package.json
├── tsconfig.json
├── railway.toml                      // Railway config
└── Dockerfile                        // Multi-stage build
```

### 1.3 Core API Endpoints

#### Authentication Flow

```typescript
// src/api/routes/auth/schemas.ts
import { z } from 'zod';

export const RegisterSchema = z.object({
  usernameHash: z.string().length(64), // SHA-256 hex (32 bytes)
  deviceId: z.string().uuid(),
  devicePublicKey: z.string().base64(), // RSA-4096 public key
  platform: z.enum(['web', 'ios', 'android'])
});

export const LoginSchema = z.object({
  usernameHash: z.string().length(64),
  deviceId: z.string().uuid(),
  challenge: z.string().base64(), // Signed challenge
  signature: z.string().base64()  // RSA signature
});

export type RegisterRequest = z.infer<typeof RegisterSchema>;
export type LoginRequest = z.infer<typeof LoginSchema>;
```

```typescript
// src/api/routes/auth/register.ts
import { FastifyPluginAsync } from 'fastify';
import { RegisterSchema } from './schemas';
import { AuthService } from '../../../services/auth.service';
import { DeviceService } from '../../../services/device.service';

export const register: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof RegisterSchema>;
  }>(
    '/auth/register',
    {
      schema: {
        body: RegisterSchema,
        response: {
          201: z.object({
            userId: z.string().uuid(),
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number()
          })
        }
      }
    },
    async (request, reply) => {
      const { usernameHash, deviceId, devicePublicKey, platform } = request.body;

      // 1. Check if user exists (by username hash)
      let user = await fastify.prisma.user.findUnique({
        where: { usernameHash: Buffer.from(usernameHash, 'hex') }
      });

      // 2. Create user if new
      if (!user) {
        user = await fastify.prisma.user.create({
          data: {
            usernameHash: Buffer.from(usernameHash, 'hex'),
            accountStatus: 'active'
          }
        });
      }

      // 3. Register device
      const device = await DeviceService.register({
        userId: user.id,
        deviceId,
        publicKey: Buffer.from(devicePublicKey, 'base64'),
        platform
      });

      // 4. Issue JWT tokens
      const tokens = await AuthService.issueTokens({
        userId: user.id,
        deviceId: device.id
      });

      // 5. Audit log
      await fastify.audit.log({
        action: 'user.registered',
        userId: user.id,
        deviceId: device.id,
        success: true
      });

      return reply.code(201).send(tokens);
    }
  );
};
```

```typescript
// src/api/routes/auth/login.ts
import { FastifyPluginAsync } from 'fastify';
import { LoginSchema } from './schemas';
import { AuthService } from '../../../services/auth.service';
import { CryptoVerifyService } from '../../../services/crypto-verify.service';

export const login: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof LoginSchema>;
  }>(
    '/auth/login',
    {
      schema: {
        body: LoginSchema,
        response: {
          200: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number()
          })
        }
      }
    },
    async (request, reply) => {
      const { usernameHash, deviceId, challenge, signature } = request.body;

      // 1. Verify user exists
      const user = await fastify.prisma.user.findUnique({
        where: { usernameHash: Buffer.from(usernameHash, 'hex') }
      });

      if (!user) {
        throw new fastify.httpErrors.unauthorized('Invalid credentials');
      }

      // 2. Verify device is registered
      const device = await fastify.prisma.device.findFirst({
        where: {
          userId: user.id,
          deviceIdHash: Buffer.from(deviceId, 'hex'),
          revoked: false
        }
      });

      if (!device) {
        throw new fastify.httpErrors.unauthorized('Device not registered');
      }

      // 3. Verify signature (RSA-PSS)
      const isValid = await CryptoVerifyService.verifySignature({
        data: Buffer.from(challenge, 'base64'),
        signature: Buffer.from(signature, 'base64'),
        publicKey: device.publicKey
      });

      if (!isValid) {
        throw new fastify.httpErrors.unauthorized('Invalid signature');
      }

      // 4. Issue tokens
      const tokens = await AuthService.issueTokens({
        userId: user.id,
        deviceId: device.id
      });

      // 5. Update last seen
      await fastify.prisma.device.update({
        where: { id: device.id },
        data: { lastSeen: new Date() }
      });

      // 6. Audit log
      await fastify.audit.log({
        action: 'user.login',
        userId: user.id,
        deviceId: device.id,
        success: true
      });

      return tokens;
    }
  );
};
```

#### Backup Endpoints

```typescript
// src/api/routes/backups/create.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BackupService } from '../../../services/backup.service';

const CreateBackupSchema = z.object({
  ciphertext: z.string().base64(),
  nonce: z.string().base64().length(16), // 12 bytes base64 = 16 chars
  tag: z.string().base64().length(24),   // 16 bytes base64 = ~22 chars
  metadata: z.object({
    classification: z.enum(['public', 'internal', 'confidential', 'restricted']),
    version: z.string().default('1.0')
  }),
  signature: z.string().base64().optional() // RSA signature for integrity
});

export const createBackup: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CreateBackupSchema>;
  }>(
    '/backups',
    {
      preHandler: fastify.auth([fastify.authenticateJWT]), // JWT required
      schema: {
        body: CreateBackupSchema,
        response: {
          201: z.object({
            id: z.string().uuid(),
            createdAt: z.string().datetime()
          })
        }
      }
    },
    async (request, reply) => {
      const { ciphertext, nonce, tag, metadata, signature } = request.body;
      const { userId, deviceId } = request.user; // From JWT

      // 1. Verify signature if provided
      if (signature) {
        const device = await fastify.prisma.device.findUnique({
          where: { id: deviceId }
        });

        const isValid = await CryptoVerifyService.verifySignature({
          data: Buffer.from(ciphertext, 'base64'),
          signature: Buffer.from(signature, 'base64'),
          publicKey: device!.publicKey
        });

        if (!isValid) {
          throw new fastify.httpErrors.badRequest('Invalid signature');
        }
      }

      // 2. Store encrypted blob
      const backup = await BackupService.create({
        userId,
        deviceId,
        ciphertext: Buffer.from(ciphertext, 'base64'),
        nonce: Buffer.from(nonce, 'base64'),
        tag: Buffer.from(tag, 'base64'),
        metadata,
        signature: signature ? Buffer.from(signature, 'base64') : undefined
      });

      // 3. Audit log
      await fastify.audit.log({
        action: 'backup.created',
        userId,
        deviceId,
        resourceId: backup.id,
        success: true
      });

      return reply.code(201).send({
        id: backup.id,
        createdAt: backup.createdAt.toISOString()
      });
    }
  );
};
```

```typescript
// src/api/routes/backups/get.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

export const getBackup: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { id: string };
  }>(
    '/backups/:id',
    {
      preHandler: fastify.auth([fastify.authenticateJWT]),
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            ciphertext: z.string().base64(),
            nonce: z.string().base64(),
            tag: z.string().base64(),
            metadata: z.object({
              classification: z.string(),
              version: z.string()
            }),
            signature: z.string().base64().optional(),
            createdAt: z.string().datetime(),
            updatedAt: z.string().datetime()
          })
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params;
      const { userId } = request.user;

      // 1. Fetch backup (only if owned by user)
      const backup = await fastify.prisma.encryptedBlob.findFirst({
        where: {
          id,
          userId,
          blobType: 'backup'
        }
      });

      if (!backup) {
        throw new fastify.httpErrors.notFound('Backup not found');
      }

      // 2. Audit log
      await fastify.audit.log({
        action: 'backup.accessed',
        userId,
        resourceId: backup.id,
        success: true
      });

      // 3. Return encrypted blob (still encrypted!)
      return {
        id: backup.id,
        ciphertext: backup.ciphertext.toString('base64'),
        nonce: backup.nonce.toString('base64'),
        tag: backup.authTag.toString('base64'),
        metadata: {
          classification: backup.version, // Stored in version field
          version: backup.version
        },
        signature: backup.signature?.toString('base64'),
        createdAt: backup.createdAt.toISOString(),
        updatedAt: backup.updatedAt.toISOString()
      };
    }
  );
};
```

### 1.4 Middleware Stack

```typescript
// src/api/plugins/security.ts
import { FastifyPluginAsync } from 'fastify';
import helmet from '@fastify/helmet';

export const security: FastifyPluginAsync = async (fastify) => {
  // Helmet security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Next.js requires inline styles
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", process.env.API_URL],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    }
  });

  // CORS configuration
  await fastify.register(import('@fastify/cors'), {
    origin: process.env.WEB_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  });
};
```

```typescript
// src/api/plugins/rate-limit.ts
import { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export const rateLimiting: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: 100, // 100 requests
    timeWindow: '15 minutes',
    redis: fastify.redis, // Use Redis for distributed rate limiting
    keyGenerator: (request) => {
      // Rate limit by user ID if authenticated, otherwise by IP
      return request.user?.userId || request.ip;
    },
    errorResponseBuilder: (req, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${context.after}`
      };
    }
  });
};
```

```typescript
// src/api/plugins/auth.ts
import { FastifyPluginAsync } from 'fastify';
import jwt from '@fastify/jwt';

export const authentication: FastifyPluginAsync = async (fastify) => {
  // Register JWT plugin
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: {
      algorithm: 'HS256',
      expiresIn: '15m' // Short-lived access tokens
    },
    verify: {
      algorithms: ['HS256']
    }
  });

  // Decorate fastify with auth method
  fastify.decorate('authenticateJWT', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.unauthorized('Invalid or expired token');
    }
  });
};
```

### 1.5 Database Layer (Prisma ORM)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid()) @db.Uuid
  usernameHash  Bytes    @unique @db.Bytea // SHA-256(username)
  createdAt     DateTime @default(now()) @db.Timestamptz
  lastLogin     DateTime? @db.Timestamptz
  accountStatus String   @default("active") @db.VarChar(20)

  devices       Device[]
  encryptedBlobs EncryptedBlob[]
  auditLogs     AuditLog[]

  @@map("users")
}

model Device {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @db.Uuid
  deviceIdHash  Bytes    @unique @db.Bytea // SHA-256(device_id)
  publicKey     Bytes    @db.Bytea // RSA-4096 public key
  registeredAt  DateTime @default(now()) @db.Timestamptz
  lastSeen      DateTime @default(now()) @db.Timestamptz
  deviceType    String?  @db.VarChar(50) // "web", "mobile"
  revoked       Boolean  @default(false)

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([lastSeen])
  @@map("devices")
}

model EncryptedBlob {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  blobType    String   @db.VarChar(50) // "backup", "sync", "recovery"

  // Encrypted data (opaque to server)
  ciphertext  Bytes    @db.Bytea
  nonce       Bytes    @db.Bytea // 12 bytes (AES-GCM nonce)
  authTag     Bytes    @db.Bytea // 16 bytes (AES-GCM auth tag)

  // Public metadata
  sizeBytes   Int
  version     String   @default("1.0") @db.VarChar(10)
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  // Optional signature for integrity
  signature   Bytes?   @db.Bytea

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([blobType])
  @@index([createdAt(sort: Desc)])
  @@map("encrypted_blobs")
}

model AuditLog {
  id            String   @id @default(uuid()) @db.Uuid
  timestamp     DateTime @default(now()) @db.Timestamptz
  userId        String?  @db.Uuid
  userIdHash    Bytes?   @db.Bytea // SHA-256(user_id) for privacy
  action        String   @db.VarChar(50)
  resourceId    String?  @db.Uuid
  ipAddressHash Bytes?   @db.Bytea // SHA-256(IP)
  userAgentHash Bytes?   @db.Bytea // SHA-256(user agent)
  success       Boolean
  errorCode     String?  @db.VarChar(50)

  user          User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([timestamp(sort: Desc)])
  @@index([userIdHash])
  @@map("audit_log")
}
```

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma client
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### 1.6 Redis Session Management

```typescript
// src/lib/redis.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Session management
export class SessionManager {
  private static readonly SESSION_PREFIX = 'session:';
  private static readonly SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

  static async createSession(userId: string, deviceId: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    const key = `${this.SESSION_PREFIX}${sessionId}`;

    await redis.setex(
      key,
      this.SESSION_TTL,
      JSON.stringify({ userId, deviceId, createdAt: Date.now() })
    );

    return sessionId;
  }

  static async getSession(sessionId: string): Promise<{ userId: string; deviceId: string } | null> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    const data = await redis.get(key);

    if (!data) return null;

    return JSON.parse(data);
  }

  static async deleteSession(sessionId: string): Promise<void> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    await redis.del(key);
  }

  static async refreshSession(sessionId: string): Promise<boolean> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    const exists = await redis.exists(key);

    if (!exists) return false;

    await redis.expire(key, this.SESSION_TTL);
    return true;
  }
}

export { redis };
```

### 1.7 Environment Configuration

```typescript
// src/config/schema.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // CORS
  WEB_URL: z.string().url(),
  API_URL: z.string().url(),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default('15m'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info')
});

export type Config = z.infer<typeof ConfigSchema>;
```

```typescript
// src/config/index.ts
import { ConfigSchema } from './schema';

// Validate environment variables at startup
export const config = ConfigSchema.parse(process.env);
```

---

## 2. Client Library Architecture (`@zkeb/client`)

### 2.1 Browser-Based Encryption (WebCrypto API)

```typescript
// packages/client/src/crypto/aes-gcm.ts
export class AESGCMCrypto {
  /**
   * Encrypt data using AES-256-GCM
   * @param plaintext - Data to encrypt
   * @param key - AES-256 key
   * @returns Encrypted data with nonce and auth tag
   */
  async encrypt(
    plaintext: Uint8Array,
    key: CryptoKey
  ): Promise<EncryptedData> {
    // Generate random nonce (12 bytes for AES-GCM)
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt using WebCrypto
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      key,
      plaintext
    );

    // AES-GCM output includes auth tag at the end (last 16 bytes)
    const ctArray = new Uint8Array(ciphertext);
    const tag = ctArray.slice(-16);
    const ct = ctArray.slice(0, -16);

    return {
      ciphertext: ct,
      nonce,
      tag,
      algorithm: 'AES-256-GCM',
      version: '1.0'
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param encrypted - Encrypted data with nonce and tag
   * @param key - AES-256 key
   * @returns Decrypted plaintext
   */
  async decrypt(
    encrypted: EncryptedData,
    key: CryptoKey
  ): Promise<Uint8Array> {
    // Reconstruct ciphertext + tag for WebCrypto
    const combined = new Uint8Array(
      encrypted.ciphertext.length + encrypted.tag.length
    );
    combined.set(encrypted.ciphertext);
    combined.set(encrypted.tag, encrypted.ciphertext.length);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.nonce, tagLength: 128 },
      key,
      combined
    );

    return new Uint8Array(plaintext);
  }

  /**
   * Generate a new AES-256 key
   * @returns Cryptographically secure random key
   */
  async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable (for storage)
      ['encrypt', 'decrypt']
    );
  }
}

export interface EncryptedData {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
  algorithm: string;
  version: string;
}
```

```typescript
// packages/client/src/crypto/hkdf.ts
/**
 * HKDF (HMAC-based Key Derivation Function)
 * WebCrypto doesn't expose HKDF directly, so we implement it
 */
export class HKDF {
  /**
   * HKDF-Extract: Extract pseudorandom key from input keying material
   */
  async extract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
    // PRK = HMAC-Hash(salt, IKM)
    const key = await crypto.subtle.importKey(
      'raw',
      salt,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const prk = await crypto.subtle.sign('HMAC', key, ikm);
    return new Uint8Array(prk);
  }

  /**
   * HKDF-Expand: Expand pseudorandom key to desired length
   */
  async expand(
    prk: Uint8Array,
    info: Uint8Array,
    length: number
  ): Promise<Uint8Array> {
    const hashLen = 32; // SHA-256 output length
    const n = Math.ceil(length / hashLen);

    if (n > 255) {
      throw new Error('HKDF expand: requested length too large');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      prk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const okm = new Uint8Array(n * hashLen);
    let t = new Uint8Array(0);

    for (let i = 0; i < n; i++) {
      // T(i) = HMAC-Hash(PRK, T(i-1) | info | 0x<i>)
      const input = new Uint8Array(t.length + info.length + 1);
      input.set(t);
      input.set(info, t.length);
      input[t.length + info.length] = i + 1;

      t = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
      okm.set(t, i * hashLen);
    }

    return okm.slice(0, length);
  }

  /**
   * Full HKDF: Extract + Expand
   */
  async derive(
    salt: Uint8Array,
    ikm: Uint8Array,
    info: Uint8Array,
    length: number
  ): Promise<Uint8Array> {
    const prk = await this.extract(salt, ikm);
    return await this.expand(prk, info, length);
  }

  /**
   * Derive CryptoKey from master key
   */
  async deriveKey(
    masterKey: CryptoKey,
    context: string,
    length: number = 32
  ): Promise<CryptoKey> {
    // Export master key
    const rawKey = await crypto.subtle.exportKey('raw', masterKey);
    const ikm = new Uint8Array(rawKey);

    // Use context as info
    const info = new TextEncoder().encode(context);
    const salt = new TextEncoder().encode('ZKEB-v1');

    // Derive new key material
    const okm = await this.derive(salt, ikm, info, length);

    // Import as CryptoKey
    return await crypto.subtle.importKey(
      'raw',
      okm,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
}
```

### 2.2 IndexedDB Key Storage

```typescript
// packages/client/src/storage/key-store.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ZKEBKeyStore extends DBSchema {
  keys: {
    key: string; // key name (e.g., "user-master-key")
    value: {
      keyData: ArrayBuffer;
      algorithm: string;
      usages: KeyUsage[];
      createdAt: number;
      lastUsed: number;
    };
  };
}

export class KeyStore {
  private db: IDBPDatabase<ZKEBKeyStore> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<ZKEBKeyStore>('zkeb-keystore', 1, {
      upgrade(db) {
        // Create object store
        db.createObjectStore('keys');
      },
    });
  }

  /**
   * Store a CryptoKey in IndexedDB
   */
  async storeKey(name: string, key: CryptoKey): Promise<void> {
    if (!this.db) await this.init();

    // Export key
    const keyData = await crypto.subtle.exportKey('raw', key);

    // Store metadata + key data
    await this.db!.put('keys', {
      keyData,
      algorithm: 'AES-GCM',
      usages: ['encrypt', 'decrypt'],
      createdAt: Date.now(),
      lastUsed: Date.now()
    }, name);
  }

  /**
   * Retrieve a CryptoKey from IndexedDB
   */
  async getKey(name: string): Promise<CryptoKey | null> {
    if (!this.db) await this.init();

    const stored = await this.db!.get('keys', name);
    if (!stored) return null;

    // Import key
    const key = await crypto.subtle.importKey(
      'raw',
      stored.keyData,
      { name: stored.algorithm, length: 256 },
      true,
      stored.usages
    );

    // Update last used timestamp
    await this.db!.put('keys', {
      ...stored,
      lastUsed: Date.now()
    }, name);

    return key;
  }

  /**
   * Delete a key from storage
   */
  async deleteKey(name: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.delete('keys', name);
  }

  /**
   * List all stored keys
   */
  async listKeys(): Promise<string[]> {
    if (!this.db) await this.init();
    return await this.db!.getAllKeys('keys');
  }

  /**
   * Clear all keys (use with caution!)
   */
  async clear(): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.clear('keys');
  }
}
```

### 2.3 High-Level Client API

```typescript
// packages/client/src/zkeb-client.ts
import { AESGCMCrypto, EncryptedData } from './crypto/aes-gcm';
import { HKDF } from './crypto/hkdf';
import { KeyStore } from './storage/key-store';

export enum DataClassification {
  Public = 'public',
  Internal = 'internal',
  Confidential = 'confidential',
  Restricted = 'restricted'
}

export class ZKEBClient {
  private crypto: AESGCMCrypto;
  private hkdf: HKDF;
  private keyStore: KeyStore;
  private keyCache: Map<DataClassification, CryptoKey>;

  constructor() {
    this.crypto = new AESGCMCrypto();
    this.hkdf = new HKDF();
    this.keyStore = new KeyStore();
    this.keyCache = new Map();
  }

  async init(): Promise<void> {
    await this.keyStore.init();
  }

  /**
   * Generate User Master Key
   */
  async generateUserMasterKey(): Promise<CryptoKey> {
    const umk = await this.crypto.generateKey();
    await this.keyStore.storeKey('user-master-key', umk);
    return umk;
  }

  /**
   * Derive encryption key for specific classification
   */
  private async deriveEncryptionKey(
    classification: DataClassification
  ): Promise<CryptoKey> {
    // Check cache
    if (this.keyCache.has(classification)) {
      return this.keyCache.get(classification)!;
    }

    // Get User Master Key
    const umk = await this.keyStore.getKey('user-master-key');
    if (!umk) {
      throw new Error('User Master Key not found. Call generateUserMasterKey() first.');
    }

    // Derive classification-specific key using HKDF
    const context = `ZKEB-${classification}-v1`;
    const derivedKey = await this.hkdf.deriveKey(umk, context);

    // Cache for performance
    this.keyCache.set(classification, derivedKey);

    return derivedKey;
  }

  /**
   * Encrypt data
   */
  async encrypt(
    plaintext: Uint8Array,
    classification: DataClassification = DataClassification.Confidential
  ): Promise<EncryptedData> {
    // Public data doesn't need encryption
    if (classification === DataClassification.Public) {
      return {
        ciphertext: plaintext,
        nonce: new Uint8Array(0),
        tag: new Uint8Array(0),
        algorithm: 'none',
        version: '1.0'
      };
    }

    // Get or derive encryption key
    const key = await this.deriveEncryptionKey(classification);

    // Encrypt
    return await this.crypto.encrypt(plaintext, key);
  }

  /**
   * Decrypt data
   */
  async decrypt(
    encrypted: EncryptedData,
    classification: DataClassification = DataClassification.Confidential
  ): Promise<Uint8Array> {
    // Public data (no decryption needed)
    if (encrypted.algorithm === 'none') {
      return encrypted.ciphertext;
    }

    // Get or derive decryption key
    const key = await this.deriveEncryptionKey(classification);

    // Decrypt
    return await this.crypto.decrypt(encrypted, key);
  }

  /**
   * Utility: Hash data (SHA-256)
   */
  async hash(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Utility: Derive key from password (PBKDF2)
   */
  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number = 600_000
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
}
```

### 2.4 API Client Wrapper

```typescript
// packages/client/src/api/client.ts
import { ZKEBClient, DataClassification } from '../zkeb-client';
import type { EncryptedData } from '../crypto/aes-gcm';

export interface BackupMetadata {
  classification: DataClassification;
  version: string;
}

export class ZKEBAPIClient {
  private baseURL: string;
  private accessToken: string | null = null;
  private zkeb: ZKEBClient;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.zkeb = new ZKEBClient();
  }

  async init(): Promise<void> {
    await this.zkeb.init();
  }

  /**
   * Register new user and device
   */
  async register(username: string, deviceId: string, publicKey: string): Promise<{
    userId: string;
    accessToken: string;
    refreshToken: string;
  }> {
    // Hash username (never send plaintext username)
    const usernameHash = await this.zkeb.hash(
      new TextEncoder().encode(username)
    );

    const response = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameHash,
        deviceId,
        devicePublicKey: publicKey,
        platform: 'web'
      })
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.accessToken;

    return data;
  }

  /**
   * Create encrypted backup
   */
  async createBackup(
    plaintext: Uint8Array,
    classification: DataClassification = DataClassification.Confidential
  ): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call register() or login() first.');
    }

    // 1. Encrypt data client-side
    const encrypted = await this.zkeb.encrypt(plaintext, classification);

    // 2. Upload encrypted blob
    const response = await fetch(`${this.baseURL}/backups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: JSON.stringify({
        ciphertext: this.arrayBufferToBase64(encrypted.ciphertext),
        nonce: this.arrayBufferToBase64(encrypted.nonce),
        tag: this.arrayBufferToBase64(encrypted.tag),
        metadata: {
          classification,
          version: encrypted.version
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Backup creation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.id; // Backup ID
  }

  /**
   * Retrieve and decrypt backup
   */
  async getBackup(
    backupId: string,
    classification: DataClassification = DataClassification.Confidential
  ): Promise<Uint8Array> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call register() or login() first.');
    }

    // 1. Download encrypted blob
    const response = await fetch(`${this.baseURL}/backups/${backupId}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Backup retrieval failed: ${response.statusText}`);
    }

    const data = await response.json();

    // 2. Decrypt client-side
    const encrypted: EncryptedData = {
      ciphertext: this.base64ToArrayBuffer(data.ciphertext),
      nonce: this.base64ToArrayBuffer(data.nonce),
      tag: this.base64ToArrayBuffer(data.tag),
      algorithm: data.metadata.algorithm || 'AES-256-GCM',
      version: data.metadata.version
    };

    return await this.zkeb.decrypt(encrypted, classification);
  }

  /**
   * List all backups
   */
  async listBackups(): Promise<Array<{ id: string; createdAt: string }>> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call register() or login() first.');
    }

    const response = await fetch(`${this.baseURL}/backups`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`List backups failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Utility: Convert Uint8Array to base64
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * Utility: Convert base64 to Uint8Array
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
}
```

---

## 3. Web UI Architecture (Next.js 14)

### 3.1 Project Structure

```
apps/web/
├── app/
│   ├── layout.tsx                  // Root layout (CSP headers)
│   ├── page.tsx                    // Landing page
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx                // Dashboard home
│   │   ├── backups/
│   │   │   ├── page.tsx            // Backup list
│   │   │   └── [id]/page.tsx       // Backup detail
│   │   └── settings/
│   │       └── page.tsx            // User settings
│   └── api/
│       └── auth/                   // Optional: NextAuth.js if needed
├── components/
│   ├── crypto/
│   │   ├── KeySetupWizard.tsx      // Key generation flow
│   │   ├── EncryptionStatus.tsx    // Key status indicator
│   │   └── BackupForm.tsx          // Create backup UI
│   ├── ui/                         // shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── layout/
│       ├── Header.tsx
│       ├── Footer.tsx
│       └── Sidebar.tsx
├── lib/
│   ├── zkeb.ts                     // ZKEB client instance
│   ├── api.ts                      // API client instance
│   └── utils.ts                    // Utility functions
├── hooks/
│   ├── useEncryption.ts            // Encryption state hook
│   ├── useAuth.ts                  // Authentication hook
│   └── useBackups.ts               // Backup management hook
├── public/
│   ├── service-worker.js           // PWA service worker
│   └── manifest.json               // PWA manifest
├── next.config.js                  // CSP + SRI configuration
├── middleware.ts                   // Auth middleware
├── package.json
└── tsconfig.json
```

### 3.2 Client-Side Encryption Flow

```typescript
// hooks/useEncryption.ts
import { useState, useEffect, useCallback } from 'react';
import { ZKEBClient, DataClassification } from '@zkeb/client';

export function useEncryption() {
  const [zkeb, setZkeb] = useState<ZKEBClient | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasUserMasterKey, setHasUserMasterKey] = useState(false);

  // Initialize ZKEB client
  useEffect(() => {
    async function init() {
      const client = new ZKEBClient();
      await client.init();
      setZkeb(client);
      setIsInitialized(true);

      // Check if User Master Key exists
      const umk = await client['keyStore'].getKey('user-master-key');
      setHasUserMasterKey(!!umk);
    }

    init();
  }, []);

  // Generate new User Master Key
  const generateKey = useCallback(async () => {
    if (!zkeb) throw new Error('ZKEB not initialized');

    await zkeb.generateUserMasterKey();
    setHasUserMasterKey(true);
  }, [zkeb]);

  // Encrypt data
  const encrypt = useCallback(async (
    plaintext: Uint8Array,
    classification: DataClassification = DataClassification.Confidential
  ) => {
    if (!zkeb) throw new Error('ZKEB not initialized');
    if (!hasUserMasterKey) throw new Error('No User Master Key. Generate one first.');

    return await zkeb.encrypt(plaintext, classification);
  }, [zkeb, hasUserMasterKey]);

  // Decrypt data
  const decrypt = useCallback(async (
    encrypted: any,
    classification: DataClassification = DataClassification.Confidential
  ) => {
    if (!zkeb) throw new Error('ZKEB not initialized');
    if (!hasUserMasterKey) throw new Error('No User Master Key. Generate one first.');

    return await zkeb.decrypt(encrypted, classification);
  }, [zkeb, hasUserMasterKey]);

  return {
    isInitialized,
    hasUserMasterKey,
    generateKey,
    encrypt,
    decrypt
  };
}
```

```typescript
// components/crypto/KeySetupWizard.tsx
'use client';

import { useState } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function KeySetupWizard() {
  const { hasUserMasterKey, generateKey } = useEncryption();
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState<'intro' | 'generating' | 'complete'>('intro');

  const handleGenerateKey = async () => {
    setIsGenerating(true);
    setStep('generating');

    try {
      await generateKey();
      setStep('complete');
    } catch (error) {
      console.error('Key generation failed:', error);
      alert('Key generation failed. Please try again.');
      setStep('intro');
    } finally {
      setIsGenerating(false);
    }
  };

  if (hasUserMasterKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>✅ Encryption Ready</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your encryption key is set up and ready to use.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {step === 'intro' && '🔐 Set Up Encryption'}
          {step === 'generating' && '⏳ Generating Key...'}
          {step === 'complete' && '✅ Key Generated'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {step === 'intro' && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Before you can encrypt data, you need to generate a master encryption key.
              This key will be stored securely on your device and never sent to the server.
            </p>
            <Button onClick={handleGenerateKey} disabled={isGenerating}>
              Generate Encryption Key
            </Button>
          </>
        )}

        {step === 'generating' && (
          <p className="text-sm text-muted-foreground">
            Generating your encryption key using WebCrypto... This may take a moment.
          </p>
        )}

        {step === 'complete' && (
          <>
            <p className="text-sm text-green-600 mb-4">
              Your encryption key has been generated and stored securely on this device.
            </p>
            <Button onClick={() => window.location.href = '/dashboard'}>
              Go to Dashboard
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### 3.3 Backup Creation UI

```typescript
// components/crypto/BackupForm.tsx
'use client';

import { useState } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { ZKEBAPIClient, DataClassification } from '@zkeb/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';

export function BackupForm() {
  const { encrypt } = useEncryption();
  const [data, setData] = useState('');
  const [classification, setClassification] = useState<DataClassification>(
    DataClassification.Confidential
  );
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      // 1. Encrypt data client-side
      const plaintext = new TextEncoder().encode(data);
      const encrypted = await encrypt(plaintext, classification);

      // 2. Upload to server via API client
      const apiClient = new ZKEBAPIClient(process.env.NEXT_PUBLIC_API_URL!);
      // Assume accessToken is stored in state/context
      const accessToken = localStorage.getItem('accessToken');
      apiClient['accessToken'] = accessToken;

      const backupId = await apiClient.createBackup(plaintext, classification);

      alert(`Backup created successfully! ID: ${backupId}`);
      setData('');
    } catch (error) {
      console.error('Backup creation failed:', error);
      alert('Failed to create backup. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="data" className="block text-sm font-medium mb-2">
          Data to Encrypt
        </label>
        <Textarea
          id="data"
          value={data}
          onChange={(e) => setData(e.target.value)}
          placeholder="Enter sensitive data here..."
          rows={6}
          required
        />
      </div>

      <div>
        <label htmlFor="classification" className="block text-sm font-medium mb-2">
          Classification Level
        </label>
        <Select
          id="classification"
          value={classification}
          onChange={(e) => setClassification(e.target.value as DataClassification)}
        >
          <option value={DataClassification.Public}>Public (no encryption)</option>
          <option value={DataClassification.Internal}>Internal</option>
          <option value={DataClassification.Confidential}>Confidential</option>
          <option value={DataClassification.Restricted}>Restricted (highest security)</option>
        </Select>
      </div>

      <Button type="submit" disabled={isCreating}>
        {isCreating ? 'Creating Backup...' : 'Create Encrypted Backup'}
      </Button>
    </form>
  );
}
```

### 3.4 Content Security Policy (CSP)

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Content Security Policy
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval'", // unsafe-eval needed for Next.js dev
              "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for CSS-in-JS
              "img-src 'self' data: https:",
              "font-src 'self'",
              "connect-src 'self' " + process.env.NEXT_PUBLIC_API_URL,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
```

---

## 4. TypeScript Type System Design

### 4.1 Shared Types (`packages/shared`)

```typescript
// packages/shared/src/crypto.ts
export enum DataClassification {
  Public = 'public',
  Internal = 'internal',
  Confidential = 'confidential',
  Restricted = 'restricted'
}

export interface EncryptedBlob {
  id: string;
  ciphertext: string; // base64
  nonce: string;      // base64
  tag: string;        // base64
  metadata: {
    classification: DataClassification;
    version: string;
  };
  signature?: string; // base64 RSA signature
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}

export interface EncryptionMetadata {
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  keyLength: 256;
  nonceLength: 12;
  tagLength: 16;
}
```

```typescript
// packages/shared/src/api.ts
export interface APIResponse<T> {
  data?: T;
  error?: APIError;
  metadata?: {
    timestamp: string;
    requestId: string;
  };
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  retryable: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: 'Bearer';
}

export interface Device {
  id: string;
  deviceIdHash: string;
  platform: 'web' | 'ios' | 'android';
  registeredAt: string;
  lastSeen: string;
  revoked: boolean;
}
```

### 4.2 End-to-End Type Safety

```typescript
// Example: Type-safe API call with inference

// Server-side (Fastify)
fastify.post<{
  Body: { usernameHash: string; deviceId: string };
  Reply: { userId: string; accessToken: string };
}>(
  '/auth/register',
  async (request, reply) => {
    // request.body is typed as { usernameHash: string; deviceId: string }
    // reply must return { userId: string; accessToken: string }
  }
);

// Client-side (TypeScript)
const response = await fetch('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    usernameHash: '...',
    deviceId: '...'
  })
});

const data: { userId: string; accessToken: string } = await response.json();
// data is fully typed!
```

### 4.3 Type-Level Security Guarantees

```typescript
// packages/shared/src/security.ts

/**
 * Opaque type: Server NEVER sees this
 */
export type PlaintextData = string & { __brand: 'plaintext' };

/**
 * Opaque type: Server CAN see this
 */
export type CiphertextData = string & { __brand: 'ciphertext' };

/**
 * Type-level guarantee: Function ONLY accepts encrypted data
 */
export function uploadToServer(data: CiphertextData): Promise<void> {
  // TypeScript ensures 'data' is ciphertext, not plaintext
}

// Usage:
const plaintext = "sensitive data" as PlaintextData;
const ciphertext = encrypt(plaintext) as CiphertextData;

// ✅ This compiles (correct usage)
uploadToServer(ciphertext);

// ❌ This does NOT compile (type error)
// uploadToServer(plaintext); // Error: PlaintextData not assignable to CiphertextData
```

---

## 5. API Specifications (OpenAPI/Swagger)

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: ZKEB API
  version: 1.0.0
  description: Zero-Knowledge Encrypted Backup API

servers:
  - url: https://api.zkeb.app
    description: Production
  - url: http://localhost:3000
    description: Development

paths:
  /auth/register:
    post:
      summary: Register new user and device
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - usernameHash
                - deviceId
                - devicePublicKey
                - platform
              properties:
                usernameHash:
                  type: string
                  format: hex
                  minLength: 64
                  maxLength: 64
                  description: SHA-256 hash of username
                deviceId:
                  type: string
                  format: uuid
                devicePublicKey:
                  type: string
                  format: base64
                  description: RSA-4096 public key
                platform:
                  type: string
                  enum: [web, ios, android]
      responses:
        '201':
          description: User registered successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  userId:
                    type: string
                    format: uuid
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
                  expiresIn:
                    type: integer
                    description: Token expiry in seconds

  /backups:
    post:
      summary: Create encrypted backup
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - ciphertext
                - nonce
                - tag
                - metadata
              properties:
                ciphertext:
                  type: string
                  format: base64
                nonce:
                  type: string
                  format: base64
                  minLength: 16
                  maxLength: 16
                tag:
                  type: string
                  format: base64
                  minLength: 24
                  maxLength: 24
                metadata:
                  type: object
                  properties:
                    classification:
                      type: string
                      enum: [public, internal, confidential, restricted]
                    version:
                      type: string
                signature:
                  type: string
                  format: base64
      responses:
        '201':
          description: Backup created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    format: uuid
                  createdAt:
                    type: string
                    format: date-time

    get:
      summary: List all backups
      security:
        - BearerAuth: []
      responses:
        '200':
          description: List of backups
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                      format: uuid
                    createdAt:
                      type: string
                      format: date-time
                    updatedAt:
                      type: string
                      format: date-time

  /backups/{id}:
    get:
      summary: Get encrypted backup
      security:
        - BearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Encrypted backup data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EncryptedBlob'

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    EncryptedBlob:
      type: object
      properties:
        id:
          type: string
          format: uuid
        ciphertext:
          type: string
          format: base64
        nonce:
          type: string
          format: base64
        tag:
          type: string
          format: base64
        metadata:
          type: object
          properties:
            classification:
              type: string
            version:
              type: string
        signature:
          type: string
          format: base64
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
```

---

## 6. Error Handling Strategy

### 6.1 Error Hierarchy

```typescript
// packages/shared/src/errors.ts

export enum ErrorCode {
  // Cryptographic errors
  CRYPTO_ENCRYPTION_FAILED = 'CRYPTO_001',
  CRYPTO_DECRYPTION_FAILED = 'CRYPTO_002',
  CRYPTO_KEY_NOT_FOUND = 'CRYPTO_003',
  CRYPTO_INVALID_KEY = 'CRYPTO_004',

  // Authentication errors
  AUTH_INVALID_CREDENTIALS = 'AUTH_001',
  AUTH_TOKEN_EXPIRED = 'AUTH_002',
  AUTH_TOKEN_INVALID = 'AUTH_003',
  AUTH_DEVICE_NOT_REGISTERED = 'AUTH_004',

  // API errors
  API_BAD_REQUEST = 'API_001',
  API_NOT_FOUND = 'API_002',
  API_RATE_LIMIT = 'API_003',
  API_SERVER_ERROR = 'API_004',

  // Storage errors
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_001',
  STORAGE_ACCESS_DENIED = 'STORAGE_002',
}

export class ZKEBError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ZKEBError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details
    };
  }
}
```

### 6.2 Error Middleware (Server)

```typescript
// src/middleware/error.middleware.ts
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZKEBError, ErrorCode } from '@zkeb/shared';

export async function errorHandler(
  error: FastifyError | ZKEBError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error (without sensitive data)
  request.log.error({
    error: error.message,
    code: 'code' in error ? error.code : 'UNKNOWN',
    path: request.url,
    method: request.method
  });

  // Handle known errors
  if (error instanceof ZKEBError) {
    return reply.status(400).send({
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable
      }
    });
  }

  // Handle Fastify HTTP errors
  if ('statusCode' in error) {
    return reply.status(error.statusCode).send({
      error: {
        code: `HTTP_${error.statusCode}`,
        message: error.message,
        retryable: error.statusCode >= 500
      }
    });
  }

  // Unknown error (don't leak details)
  return reply.status(500).send({
    error: {
      code: ErrorCode.API_SERVER_ERROR,
      message: 'Internal server error',
      retryable: true
    }
  });
}
```

---

## 7. Implementation Timeline

### Week 1: API Server Foundation

**Days 1-2**: Fastify setup + Database schema
- [ ] Initialize Fastify server
- [ ] Configure Prisma with PostgreSQL
- [ ] Create database migrations
- [ ] Set up environment configuration (Zod validation)

**Days 3-4**: Authentication endpoints
- [ ] Implement `/auth/register`
- [ ] Implement `/auth/login`
- [ ] Implement JWT issuance + refresh
- [ ] Add middleware (auth, rate limiting, CORS)

**Days 5-7**: Backup endpoints + Testing
- [ ] Implement `/backups` (CREATE, LIST, GET, DELETE)
- [ ] Add signature verification service
- [ ] Write integration tests
- [ ] Deploy to Railway staging

### Week 2: Client Library

**Days 1-2**: Core crypto primitives
- [ ] Implement AES-256-GCM wrapper
- [ ] Implement HKDF (custom)
- [ ] Implement key generation utilities
- [ ] Write unit tests for crypto operations

**Days 3-4**: Key management
- [ ] Create IndexedDB key store
- [ ] Implement key derivation hierarchy
- [ ] Add key caching layer
- [ ] Test key persistence across sessions

**Days 5-7**: High-level API
- [ ] Build ZKEBClient class
- [ ] Build ZKEBAPIClient wrapper
- [ ] Write integration tests (encrypt → upload → download → decrypt)
- [ ] Create example usage documentation

### Week 3: Next.js UI

**Days 1-2**: Project setup + Core components
- [ ] Initialize Next.js 14 (App Router)
- [ ] Configure CSP in next.config.js
- [ ] Create layout components (Header, Footer, Sidebar)
- [ ] Set up shadcn/ui component library

**Days 3-4**: Authentication flow
- [ ] Build registration page
- [ ] Build login page
- [ ] Implement useAuth hook
- [ ] Add JWT storage (httpOnly cookies or localStorage)

**Days 5-7**: Dashboard + Backup UI
- [ ] Create KeySetupWizard component
- [ ] Build BackupForm (encryption UI)
- [ ] Build backup list + detail pages
- [ ] Implement useEncryption hook
- [ ] Deploy to Railway (web service)

### Week 4: E2E Integration + Polish

**Days 1-2**: End-to-end testing
- [ ] Test full backup workflow (register → encrypt → upload → download → decrypt)
- [ ] Verify zero-knowledge (server logs contain no plaintext)
- [ ] Test multi-device sync simulation
- [ ] Performance benchmarks (1000 operations)

**Days 3-4**: Error handling + UX
- [ ] Add comprehensive error messages
- [ ] Implement retry logic with exponential backoff
- [ ] Add loading states + progress indicators
- [ ] Create error boundary components

**Days 5-7**: Documentation + Deployment
- [ ] Write API documentation (OpenAPI spec)
- [ ] Write client library README
- [ ] Create user guide
- [ ] Final Railway production deployment
- [ ] Smoke tests on production

---

## 8. Constraints & Non-Negotiables

### 8.1 Security Constraints

✅ **Zero plaintext on server**: Server NEVER receives unencrypted user data
✅ **Client-side encryption only**: All crypto operations happen in browser
✅ **No key storage on server**: Keys live in IndexedDB, never transmitted
✅ **TLS 1.3 everywhere**: All API calls over HTTPS with perfect forward secrecy
✅ **Content Security Policy**: Prevent malicious JavaScript injection

### 8.2 Type Safety Constraints

✅ **TypeScript strict mode**: No `any`, no implicit any, no type assertions without validation
✅ **Zod schema validation**: All API inputs validated with runtime type checking
✅ **End-to-end types**: Shared types between client and server
✅ **Compile-time guarantees**: If types compile, security properties hold

### 8.3 Developer Experience Constraints

✅ **Single command dev setup**: `pnpm install && pnpm dev`
✅ **Hot reload**: Changes reflect immediately in development
✅ **Type-safe API calls**: No manual type casting required
✅ **Self-documenting code**: OpenAPI spec auto-generated from Zod schemas

---

## 9. Success Criteria

### 9.1 Security

- [ ] **Zero-knowledge verified**: Manual audit confirms server never sees plaintext
- [ ] **All API calls authenticated**: JWT required for sensitive endpoints
- [ ] **Rate limiting works**: 100 req/15min per user enforced
- [ ] **CSP prevents XSS**: No inline scripts, no eval()
- [ ] **Audit logs complete**: All sensitive operations logged (hashed IDs)

### 9.2 Performance

- [ ] **Encryption <5ms**: 1KB data encrypted in under 5ms
- [ ] **API latency <100ms**: P95 latency under 100ms (server-side)
- [ ] **Page load <2s**: First contentful paint under 2 seconds
- [ ] **Key generation <50ms**: User master key generated in under 50ms

### 9.3 Developer Experience

- [ ] **Type-safe API**: No manual type assertions required
- [ ] **Error messages actionable**: Every error has clear remediation steps
- [ ] **Hot reload <1s**: Code changes reflect in under 1 second
- [ ] **Test coverage >90%**: Unit + integration tests cover 90%+ of code

---

## 10. Production Readiness Checklist

### Before Launch

- [ ] All environment variables validated with Zod
- [ ] Database migrations tested on staging
- [ ] Redis connection pool configured
- [ ] Railway auto-scaling configured (min 2, max 10 replicas)
- [ ] Health check endpoint responds correctly
- [ ] Monitoring configured (Datadog/CloudWatch)
- [ ] Error tracking configured (Sentry)
- [ ] CDN configured for static assets
- [ ] HTTPS enforced (TLS 1.3 only)
- [ ] CSP headers correct (no unsafe-inline in production)
- [ ] Rate limiting tested under load
- [ ] JWT secret rotated (use Railway environment variables)
- [ ] Database backups scheduled
- [ ] Incident response plan documented

---

## Conclusion

This architecture delivers a production-grade, type-safe, zero-knowledge encryption system that feels like magic to use but is rigorous under the hood.

**The TypeScript Advantage**: When the compiler is happy, the security is solid. When the API call succeeds, the data is encrypted. When the backup uploads, the server knows nothing.

**Railway-Optimized**: This stack is designed to leverage Railway's managed PostgreSQL, Redis, and auto-scaling. Deployment is a single `railway up` command.

**Developer Joy**: End-to-end type safety means fewer bugs, faster iteration, and code that documents itself. The types tell you exactly what's encrypted and what's not.

**Next Steps**: Implement Week 1 (API server) first, then iterate. Get feedback early. Deploy often.

---

**Jordan Kim**
Full-Stack TypeScript Developer & API Architect
*"If the types compile, the encryption works."*
