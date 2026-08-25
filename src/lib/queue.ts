import { prisma } from './prisma';
import * as fs from 'fs';
import * as path from 'path';

export interface QueueJob {
  id: string;
  type?: 'stt' | 'ocr' | 'general';
  processFn: () => Promise<void>;
}

class JobQueueManager {
  private queue: QueueJob[] = [];
  private isHeavyJobRunning = false;

  // Thêm job vào hàng đợi và kích hoạt xử lý
  public addJob(jobId: string, processFn: () => Promise<void>, type: 'stt' | 'ocr' | 'general' = 'general') {
    this.queue.push({ id: jobId, type, processFn });
    console.log(`[Queue] Added job ${jobId} (type: ${type}). Queue length: ${this.queue.length}`);
    this.triggerNext();
  }

  // Lấy danh sách job trong queue
  public getQueue() {
    return this.queue;
  }

  // Kiểm tra xem có job nặng đang chạy không
  public getIsHeavyJobRunning() {
    return this.isHeavyJobRunning;
  }

  // Kích hoạt xử lý job tiếp theo
  private async triggerNext() {
    if (this.queue.length === 0 || this.isHeavyJobRunning) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.isHeavyJobRunning = true;

    console.log(`[Queue] Executing job ${job.id} (type: ${job.type || 'general'})`);

    (async () => {
      try {
        await job.processFn();
      } catch (err: any) {
        console.error(`[Queue] Fatal error executing job ${job.id}:`, err);
        try {
          const currentJob = await prisma.subtitleJob.findUnique({ where: { id: job.id } });
          if (currentJob && currentJob.status === 'processing') {
            await prisma.subtitleJob.update({
              where: { id: job.id },
              data: {
                status: 'error',
                errorMessage: err.message || 'Lỗi hệ thống nghiêm trọng khi thực thi job',
              },
            });
          }
        } catch (dbErr) {
          console.error('[Queue] Failed to update error state in DB:', dbErr);
        }
      } finally {
        this.isHeavyJobRunning = false;
        // Gọi tiếp tục triggerNext cho công việc còn tồn đọng trong queue
        this.triggerNext();
      }
    })();
  }
}

// Singleton Queue Manager
export const jobQueueManager = new JobQueueManager();

// ======================== HELPERS CHO WORKER ========================

/**
 * Cập nhật tiến trình của Job vào SQLite
 * @param jobId ID của job
 * @param message Dòng log mới
 */
const jobLogLocks = new Map<string, Promise<void>>();

export async function updateJobProgress(jobId: string, message: string, progressPercent?: number) {
  const previousLock = jobLogLocks.get(jobId) || Promise.resolve();
  const currentTask = previousLock.then(async () => {
    try {
      const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
      if (!job) return;

      let logs: string[] = [];
      try {
        logs = JSON.parse(job.progressLog || '[]');
      } catch {
        logs = [];
      }

      const timestamp = new Date().toLocaleTimeString('vi-VN');
      logs.push(`[${timestamp}] ${message}`);

      const updateData: any = {
        progressLog: JSON.stringify(logs),
      };
      if (progressPercent !== undefined && progressPercent !== null) {
        updateData.progressPercent = Math.min(100, Math.max(0, Math.round(progressPercent)));
      }

      await prisma.subtitleJob.update({
        where: { id: jobId },
        data: updateData,
      });
      console.log(`[Job ${jobId}] ${progressPercent !== undefined ? `(${progressPercent}%) ` : ''}${message}`);
    } catch (err) {
      console.error(`Failed to update progress for job ${jobId}:`, err);
    }
  }).catch(() => {});

  jobLogLocks.set(jobId, currentTask);
  await currentTask;
}

/**
 * Lấy thư mục uploads tạm thời của dự án Next.js
 */
export function getUploadsDir(): string {
  const dir = path.join(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Dọn dẹp tất cả các file tạm liên quan đến một Job cụ thể
 * @param jobId ID của job
 */
export function cleanupJobFiles(jobId: string) {
  try {
    const uploadsDir = getUploadsDir();
    const files = fs.readdirSync(uploadsDir);
    let count = 0;

    files.forEach((file) => {
      // Các file tạm được lưu theo dạng: {jobId}_{filename} hoặc thư mục tạm của frames: {jobId}_frames/
      if (file.startsWith(jobId)) {
        const fullPath = path.join(uploadsDir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        count++;
      }
    });

    if (count > 0) {
      console.log(`[Cleanup] Cleaned up ${count} temporary files for job ${jobId}`);
    }
  } catch (err) {
    console.error(`Failed to cleanup files for job ${jobId}:`, err);
  }
}
