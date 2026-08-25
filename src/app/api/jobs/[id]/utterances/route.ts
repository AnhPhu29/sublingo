import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    
    // 1. Tìm job trong DB
    const job = await prisma.subtitleJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy Job tương ứng' },
        { status: 404 }
      );
    }

    // 2. Trích xuất đường dẫn file utterances từ meta
    let utterancesPath = "";
    try {
      const metaObj = JSON.parse(job.meta || '{}');
      utterancesPath = metaObj.stt_utterances_path || "";
    } catch {
      utterancesPath = "";
    }

    // 3. Fallback tìm thủ công trong thư mục uploads nếu meta không lưu
    if (!utterancesPath) {
      const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
      utterancesPath = path.join(uploadsDir, `${jobId}_stt_utterances.json`);
    }

    // 4. Kiểm tra sự tồn tại của file và trả về dữ liệu
    if (fs.existsSync(utterancesPath)) {
      try {
        const fileContent = fs.readFileSync(utterancesPath, 'utf-8');
        const utterances = JSON.parse(fileContent);
        return NextResponse.json({
          success: true,
          data: utterances
        });
      } catch (readErr: any) {
        console.error(`[API] Lỗi đọc file utterances của job ${jobId}:`, readErr);
        return NextResponse.json(
          { success: false, error: 'Lỗi khi đọc file phụ đề thô' },
          { status: 500 }
        );
      }
    }

    // 5. Nếu không tìm thấy file
    return NextResponse.json(
      { success: false, error: 'Chưa có dữ liệu phụ đề thô (utterances) cho Job này' },
      { status: 404 }
    );
  } catch (err: any) {
    console.error('[API] Get job utterances error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi tải danh sách câu thoại thô' },
      { status: 500 }
    );
  }
}
