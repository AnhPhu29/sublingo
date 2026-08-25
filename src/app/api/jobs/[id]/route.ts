import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanupJobFiles } from '@/lib/queue';
import { retryVideoJob } from '@/lib/video-processor';
import * as fs from 'fs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = await prisma.subtitleJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy Job yêu cầu' },
        { status: 404 }
      );
    }

    let logs: string[] = [];
    try {
      logs = JSON.parse(job.progressLog || '[]');
    } catch {
      logs = [];
    }

    let metaObj: any = {};
    try {
      metaObj = JSON.parse(job.meta || '{}');
    } catch {
      metaObj = {};
    }

    let resultSrt = metaObj.srtResult || metaObj.result || "";
    if (!resultSrt && job.status === 'done' && job.outputFile && fs.existsSync(job.outputFile) && job.outputFile.endsWith('.srt')) {
      try {
        resultSrt = fs.readFileSync(job.outputFile, 'utf-8');
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      data: {
        id: job.id,
        type: job.type,
        status: job.status,
        inputFile: job.inputFile,
        outputFile: job.outputFile,
        resultSrt,
        progressLog: logs,
        progressPercent: job.progressPercent,
        errorMessage: job.errorMessage,
        costUsd: job.costUsd,
        meta: metaObj
      },
    });
  } catch (err: any) {
    console.error('Get job error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi tải trạng thái Job' },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = await prisma.subtitleJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy Job yêu cầu' },
        { status: 404 }
      );
    }

    if (job.status !== 'error') {
      return NextResponse.json(
        { success: false, error: 'Chỉ có thể thử lại các Job bị lỗi' },
        { status: 400 }
      );
    }

    // Trigger retry logic
    await retryVideoJob(id);

    return NextResponse.json({ success: true, message: 'Đã đưa Job vào hàng đợi thử lại' });
  } catch (err: any) {
    console.error('Retry job error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Không thể chạy lại Job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = await prisma.subtitleJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy Job yêu cầu' },
        { status: 404 }
      );
    }

    // Huỷ job: Đánh dấu cancelled để worker ngắt lập tức, sau đó dọn dẹp file
    if (job.status === 'processing' || job.status === 'queued') {
      await prisma.subtitleJob.update({
        where: { id },
        data: { status: 'cancelled', errorMessage: 'Tiến trình đã bị dừng bởi người dùng.' },
      });
    }
    cleanupJobFiles(id);
    await prisma.subtitleJob.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Đã dừng và huỷ Job' });
  } catch (err: any) {
    console.error('Delete job error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi xoá Job' },
      { status: 500 }
    );
  }
}
