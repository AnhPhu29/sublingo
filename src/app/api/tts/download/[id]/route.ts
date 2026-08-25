import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const job = await prisma.subtitleJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy job' }, { status: 404 });
    }
    if (job.status !== 'done' || !job.outputFile) {
      return NextResponse.json(
        { success: false, error: 'File âm thanh chưa sẵn sàng' },
        { status: 400 }
      );
    }

    const filePath = job.outputFile;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json({ success: false, error: 'File âm thanh không tồn tại trên server' }, { status: 404 });
    }

    const fileName = path.basename(filePath);
    const fileSize = stat.size;

    const stream = createReadStream(filePath);
    const nodeReadable = stream as unknown as ReadableStream<Uint8Array>;

    return new Response(nodeReadable, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(fileSize),
      },
    });
  } catch (err: unknown) {
    console.error('GET /api/tts/download error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tải file âm thanh' },
      { status: 500 }
    );
  }
}
