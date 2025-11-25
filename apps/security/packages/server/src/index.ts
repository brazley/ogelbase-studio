/**
 * @security/server - ZKEB Backend
 * Zero-Knowledge Encrypted Backup Server
 *
 * Exports Prisma client and database utilities
 */

export { PrismaClient } from '@prisma/client';
export type {
  User,
  Device,
  Backup,
  AuditLog,
} from '@prisma/client';

/**
 * Re-export Prisma client singleton
 * Use this in your application code
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
