import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jobQueueManager } from '@/lib/queue';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      segments,
      globalVoiceId = 'Mai Anh',
      ttsVolume = 1.0,
      pauseDurationMs = 400,
      hasOriginalTimestamps = false,
    } = body;

    if (!Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Thiếu danh sách các đoạn văn bản (segments)' },
        { status: 400 }
      );
    }

    // Kiểm tra có ít nhất 1 đoạn có chữ
    const hasText = segments.some((s: any) => s && s.text && s.text.trim().length > 0);
    if (!hasText) {
      return NextResponse.json(
        { success: false, error: 'Văn bản nhập vào trống' },
        { status: 400 }
      );
    }

    const jobId = 'tts_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

    const job = await prisma.subtitleJob.create({
      data: {
        id: jobId,
        type: 'tts',
        status: 'queued',
        inputFile: 'tts_input_text',
        meta: JSON.stringify({
          segments,
          globalVoiceId,
          ttsVolume,
          pauseDurationMs,
          hasOriginalTimestamps,
        }),
        progressLog: JSON.stringify([
          `[Queue] Đã nhận ${segments.length} đoạn văn bản...`,
          `[Queue] Đang chờ tạo giọng đọc AI...`,
        ]),
      },
    });

    jobQueueManager.addJob(jobId, async () => {
      const { processTtsJob } = await import('@/lib/tts-processor');
      return processTtsJob(jobId);
    });

    return NextResponse.json({ success: true, jobId });
  } catch (err: unknown) {
    console.error('POST /api/tts error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tạo job đọc văn bản' },
      { status: 500 }
    );
  }
}
