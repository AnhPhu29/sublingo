import { NextResponse } from 'next/server';
import { createReadStream, statSync, existsSync } from 'fs';
import { prisma } from '@/lib/prisma';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

async function synthesizeEdgeNeuralTts(text: string, voiceName: string, rate: number = 1.0, pitch: string = '+0Hz'): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const ratePercent = Math.round((rate - 1.0) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  const { audioStream } = tts.toStream(text, {
    rate: rateStr,
    pitch: pitch,
    volume: '+0%',
  });

  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', (err: Error) => reject(err));
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { voiceId = 'ngoc_huyen', text = 'Xin chào, đây là giọng đọc AI Ngọc Huyền Pro chất lượng cao của SubLingo Studio.' } = body;

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

    // 2. Thử gọi Python backend nếu đang chạy local
    try {
      const pythonServiceUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const pyResponse = await fetch(`${pythonServiceUrl}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId,
          speed: 1.0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (pyResponse.ok) {
        const audioBuffer = await pyResponse.arrayBuffer();
        return new Response(audioBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(audioBuffer.byteLength),
          },
        });
      }
    } catch {}

    // 3. 🔥 TẠO GIỌNG ĐỌC NEURAL TRỰC TIẾP (Hỗ trợ Ngọc Huyền Pro, Hoài My, Nam Minh, Mai Anh,...)
    let edgeVoice = 'vi-VN-HoaiMyNeural';
    let pitch = '+0Hz';

    if (voiceId === 'ngoc_huyen') {
      edgeVoice = 'vi-VN-HoaiMyNeural';
      pitch = '+1Hz';
    } else if (voiceId.includes('nam') || voiceId.includes('dung') || voiceId.includes('hoang') || voiceId === 'male') {
      edgeVoice = 'vi-VN-NamMinhNeural';
      pitch = '+0Hz';
    } else {
      edgeVoice = 'vi-VN-HoaiMyNeural';
      pitch = '+0Hz';
    }

    const audioBuf = await synthesizeEdgeNeuralTts(text, edgeVoice, 1.0, pitch);

    return new Response(new Uint8Array(audioBuf), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuf.byteLength),
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

