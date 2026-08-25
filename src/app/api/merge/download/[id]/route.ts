import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const job = await prisma.subtitleJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy job ghép video' }, { status: 404 });
    }
    if (job.status !== 'done' || !job.outputFile) {
      return NextResponse.json(
        { success: false, error: 'Video ghép chưa hoàn thành hoặc chưa sẵn sàng' },
        { status: 400 }
      );
    }

    const filePath = job.outputFile;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json({ success: false, error: 'File video không tồn tại trên server' }, { status: 404 });
    }

    const fileName = path.basename(filePath);
    const fileSize = stat.size;

    // Hỗ trợ HTTP Range Requests (HTTP 206) cho phép trình duyệt tua (seek) siêu tốc trên video 20GB+
    const range = request.headers.get('range');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const stream = createReadStream(filePath, { start, end });
      const nodeReadable = stream as unknown as ReadableStream<Uint8Array>;

      return new Response(nodeReadable, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunksize),
          'Content-Type': 'video/mp4',
          'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    }

    const stream = createReadStream(filePath);
    const nodeReadable = stream as unknown as ReadableStream<Uint8Array>;

    return new Response(nodeReadable, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(fileSize),
      },
    });
  } catch (err: unknown) {
    console.error('GET /api/merge/download error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tải video ghép' },
      { status: 500 }
    );
  }
}
