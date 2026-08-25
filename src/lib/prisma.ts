import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let localPrisma: PrismaClient | null = null;

async function cleanupStaleJobs(client: PrismaClient) {
  try {
    const res = await client.subtitleJob.updateMany({
      where: {
        status: {
          in: ['queued', 'processing']
        }
      },
      data: {
        status: 'error',
        errorMessage: 'Hệ thống khởi động lại đột ngột khi job đang xử lý.'
      }
    });
    if (res.count > 0) {
      console.log(`[Startup Cleanup] Đã reset ${res.count} job bị treo do khởi động lại server.`);
    }
  } catch (err) {
    console.error('[Startup Cleanup] Error running database update:', err);
  }
}

function getPrismaInstance(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (!localPrisma) {
    const rawDbPath = process.env.DATABASE_URL || 'file:./dev.db';
    const adapter = new PrismaBetterSqlite3({ url: rawDbPath });
    localPrisma = new PrismaClient({ adapter });
    
    // Tự động dọn dẹp job treo khi khởi động client lần đầu
    cleanupStaleJobs(localPrisma).catch(err => {
      console.error('[Startup Cleanup] Failed to cleanup stale jobs:', err);
    });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = localPrisma;
    }
  }
  return localPrisma;
}

// Proxy wrapper để trì hoãn việc khởi tạo PrismaClient (Lazy Initialization)
// Điều này giúp vượt qua các lỗi kiểm tra database ở build-time của Next.js
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const instance = getPrismaInstance();
    // Bắt buộc bind các function để tránh lỗi mất context 'this'
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
