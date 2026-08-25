import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUploadsDir, jobQueueManager } from '@/lib/queue';
import { processOcrVideoJob } from '@/lib/video-processor';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Cho phép upload file lớn hơn 10MB (mặc định Next.js App Router)
export const maxDuration = 300; // 5 phút timeout cho file video lớn
export const dynamic = 'force-dynamic';

function runCommandAsync(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cropRegionStr = formData.get('cropRegion') as string;
    const sourceLanguage = (formData.get('sourceLanguage') as string) || 'auto';
    const removeWatermark = formData.get('removeWatermark') === 'true';
    const autoTranslate = formData.get('autoTranslate') === 'true';
    const syncAudio = formData.get('syncAudio') !== 'false';
    const selectedLangsStr = formData.get('selectedLangs') as string;
    const glossaryStr = formData.get('glossary') as string;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Thiếu file video tải lên' }, { status: 400 });
    }

    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'Dung lượng file video vượt quá giới hạn (tối đa 500MB)' }, { status: 400 });
    }

    const cropRegion = JSON.parse(cropRegionStr || '{}');
    const selectedLangs = JSON.parse(selectedLangsStr || '[]');
    const glossary = JSON.parse(glossaryStr || '[]');
    const engine = (formData.get('engine') as string) || 'local';

    // Tạo Job ID mới
    const jobId = 'job_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

    // Lưu file tạm thời
    const uploadsDir = getUploadsDir();
    const originalName = file.name;
    const ext = originalName.split('.').pop()?.toLowerCase();
    const tempFileName = `${jobId}_video.${ext}`;
    const tempFilePath = path.join(uploadsDir, tempFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Sử dụng ffprobe lấy duration video
    let durationSeconds = 0;
    try {
      const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempFilePath}"`;
      const durationStr = await runCommandAsync(ffprobeCmd);
      durationSeconds = parseFloat(durationStr) || 0;
    } catch (ffErr) {
      console.warn('[OCR Video Upload] Failed to probe duration:', ffErr);
    }

    const meta = JSON.stringify({
      cropRegion,
      sourceLanguage,
      removeWatermark,
      autoTranslate,
      syncAudio,
      selectedLangs,
      glossary,
      engine,
      originalFileName: originalName,
      durationSeconds
    });

    // Tạo bản ghi job trong SQLite
    await prisma.subtitleJob.create({
      data: {
        id: jobId,
        type: 'ocr_video',
        status: 'queued',
        inputFile: originalName,
        meta,
        costUsd: 0,
        progressLog: JSON.stringify([`[Queue] Đã nhận file video: ${originalName}`, `[Queue] Độ dài: ${durationSeconds.toFixed(1)}s. Đang chờ đến lượt xử lý...`])
      }
    });

    // Đưa vào hàng đợi nền
    jobQueueManager.addJob(jobId, () => processOcrVideoJob(jobId));

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Đã tải lên video và thêm vào hàng đợi thành công'
    });
  } catch (err: any) {
    console.error('OCR Video upload API error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Lỗi xử lý tải lên video' },
      { status: 500 }
    );
  }
}
