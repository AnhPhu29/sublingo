import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import fs from 'fs';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const voice = await prisma.customVoice.findUnique({ where: { id } });
    if (!voice || !voice.refAudioPath) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy giọng tùy chỉnh' }, { status: 404 });
    }

    const filePath = voice.refAudioPath;
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File audio mẫu không tồn tại trên server' }, { status: 404 });
    }

    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    const nodeReadable = stream as unknown as ReadableStream<Uint8Array>;

    return new Response(nodeReadable, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(stat.size),
      },
    });
  } catch (err: any) {
    console.error('GET /api/custom-voices/audio/[id] error:', err);
    return NextResponse.json({ success: false, error: 'Không thể phát audio' }, { status: 500 });
  }
}
