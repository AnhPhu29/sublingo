import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import fs from 'fs';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { id } = params;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID giọng nói cần xóa' }, { status: 400 });
    }

    // Tìm giọng nói trong database
    const voice = await prisma.customVoice.findUnique({
      where: { id }
    });

    if (!voice) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy giọng tùy chỉnh' }, { status: 404 });
    }

    // Xóa file âm thanh trên đĩa nếu tồn tại
    if (voice.refAudioPath) {
      try {
        if (fs.existsSync(voice.refAudioPath)) {
          await unlink(voice.refAudioPath);
        }
      } catch (fileErr) {
        console.warn(`Không thể xóa file audio mẫu tại ${voice.refAudioPath}:`, fileErr);
      }
    }

    // Xóa bản ghi trong database
    await prisma.customVoice.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/custom-voices/[id] error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống khi xóa giọng tùy chỉnh' }, { status: 500 });
  }
}
