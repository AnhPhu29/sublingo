import { NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/prisma';

const execAsync = promisify(exec);

// GET /api/custom-voices
export async function GET() {
  try {
    const voices = await prisma.customVoice.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ success: true, voices });
  } catch (err: any) {
    console.error('GET /api/custom-voices error:', err);
    return NextResponse.json({ success: false, error: 'Không thể liệt kê danh sách giọng tùy chỉnh' }, { status: 500 });
  }
}

// POST /api/custom-voices
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = formData.get('name') as string | null;
    const refText = formData.get('refText') as string | null;
    const audioFile = formData.get('audio') as File | null;

    if (!name || !refText || !audioFile) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin yêu cầu (tên, transcript, audio)' }, { status: 400 });
    }

    // Tạo thư mục uploads/voices nếu chưa tồn tại
    const voicesDir = path.join(process.cwd(), 'uploads', 'voices');
    await mkdir(voicesDir, { recursive: true });

    const timestamp = Date.now();
    const fileExt = audioFile.name.split('.').pop() || 'wav';
    
    // Lưu tạm file tải lên
    const tempFileName = `temp_${timestamp}.${fileExt}`;
    const tempFilePath = path.join(voicesDir, tempFileName);
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(tempFilePath, audioBuffer);

    // Chuẩn hóa tên file WAV đầu ra
    const finalFileName = `voice_${timestamp}.wav`;
    const finalFilePath = path.join(voicesDir, finalFileName);

    try {
      // Dùng ffmpeg convert sang WAV PCM 16-bit Mono 24000Hz (khớp Native VieNeu-TTS) kèm loudnorm cân bằng âm lượng
      await execAsync(`ffmpeg -i "${tempFilePath}" -ac 1 -ar 24000 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a pcm_s16le -y "${finalFilePath}"`);
      
      // Xóa file tạm
      await unlink(tempFilePath).catch(() => {});
    } catch (ffmpegErr) {
      console.error('FFmpeg conversion error:', ffmpegErr);
      // Nếu ffmpeg lỗi mà file gốc là WAV, dùng tạm file gốc, không thì báo lỗi
      if (fileExt.toLowerCase() === 'wav') {
        fs.renameSync(tempFilePath, finalFilePath);
      } else {
        await unlink(tempFilePath).catch(() => {});
        return NextResponse.json({ success: false, error: 'Không thể convert audio mẫu sang WAV. Hãy đảm bảo đã cài ffmpeg.' }, { status: 500 });
      }
    }

    // Lưu vào database
    const newVoice = await prisma.customVoice.create({
      data: {
        name,
        refAudioPath: finalFilePath,
        refText
      }
    });

    return NextResponse.json({ success: true, voice: newVoice });
  } catch (err: any) {
    console.error('POST /api/custom-voices error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống khi thêm giọng tùy chỉnh' }, { status: 500 });
  }
}
