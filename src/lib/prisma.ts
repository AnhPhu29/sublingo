import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let localPrisma: PrismaClient | null = null;

function getPrismaInstance(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (!localPrisma) {
    try {
      const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
      const rawDbPath = process.env.DATABASE_URL || 'file:./dev.db';
      const adapter = new PrismaBetterSqlite3({ url: rawDbPath });
      localPrisma = new PrismaClient({ adapter });
    } catch {
      localPrisma = new PrismaClient();
    }

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = localPrisma;
    }
  }
  return localPrisma;
}

// Proxy wrapper để trì hoãn việc khởi tạo PrismaClient (Lazy Initialization)
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    try {
      const instance = getPrismaInstance();
      const value = Reflect.get(instance, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(instance);
      }
      return value;
    } catch {
      return () => Promise.resolve(null);
    }
  },
});

