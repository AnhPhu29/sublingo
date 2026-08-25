import { NextResponse } from 'next/server';
import { createReadStream, statSync, existsSync } from 'fs';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { voiceId = 'phuong', text = 'Xin chào, đây là giọng đọc thử nghiệm của SubLingo AI.' } = body;

    // 1. Kiểm tra xem có phải giọng nhân bản tùy chỉnh (Custom Voice) không
    const customVoice = await prisma.customVoice.findUnique({ where: { id: voiceId } });
    if (customVoice && customVoice.refAudioPath && existsSync(customVoice.refAudioPath)) {
      const stat = statSync(customVoice.refAudioPath);
      const stream = createReadStream(customVoice.refAudioPath);
      const nodeReadable = stream as unknown as ReadableStream<Uint8Array>;

      return new Response(nodeReadable, {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(stat.size),
        },
      });
    }

    // 2. Nếu là giọng tiêu chuẩn VieNeu (Phương, Mai Anh, Phạm Tuyên, Dũng,...), gọi Python backend
    const pythonServiceUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const pyResponse = await fetch(`${pythonServiceUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceId,
        speed: 1.0,
      }),
    });

    if (!pyResponse.ok) {
      const errText = await pyResponse.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: `Python service TTS error: ${errText}` },
        { status: 500 }
      );
    }

    const audioBuffer = await pyResponse.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.byteLength),
      },
    });
  } catch (err: any) {
    console.error('POST /api/voices/preview error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tạo bản nghe thử giọng đọc' },
      { status: 500 }
    );
  }
}
