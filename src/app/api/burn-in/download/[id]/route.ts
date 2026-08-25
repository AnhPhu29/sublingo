import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = await prisma.subtitleJob.findUnique({ where: { id } });

    if (!job || job.status !== 'done' || !job.outputFile) {
      return NextResponse.json({ success: false, error: 'File chưa sẵn sàng' }, { status: 404 });
    }

    const filePath = job.outputFile;
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File không còn tồn tại trên server' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const outName = fileName.replace('_burnin_output', '_subtitled').replace(/^burnin_\d+_/, '');

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${outName}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (err: unknown) {
    console.error('GET /api/burn-in/download error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi tải file' }, { status: 500 });
  }
}
