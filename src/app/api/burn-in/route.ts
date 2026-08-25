import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { jobQueueManager } from '@/lib/queue';
import { processBurnInJob } from '@/lib/video-processor';

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseErr: any) {
      console.error('[Burn-in API Route] Failed to parse formData stream:', parseErr);
      return NextResponse.json(
        {
          success: false,
          error: 'Không thể đọc file video tải lên. Dung lượng video vượt quá 2GB hoặc kết nối mạng bị gián đoạn.',
        },
        { status: 400 }
      );
    }

    const videoFile = formData.get('video') as File | null;
    const subtitleContent = formData.get('subtitleContent') as string | null;
    const fontSizeOption = (formData.get('fontSizeOption') as string) || 'medium'; // small | medium | large
    const position = (formData.get('position') as string) || 'bottom';  // bottom | top
    const color = (formData.get('color') as string) || 'white';          // white | yellow
    const langCode = (formData.get('langCode') as string) || 'vi';
    const posX = parseFloat((formData.get('posX') as string) || '50');
    const posY = parseFloat((formData.get('posY') as string) || '88');
    const enableBlurMask = formData.get('enableBlurMask') === 'true';
    const maskX = parseFloat((formData.get('maskX') as string) || '10');
    const maskY = parseFloat((formData.get('maskY') as string) || '80');
    const maskW = parseFloat((formData.get('maskW') as string) || '80');
    const maskH = parseFloat((formData.get('maskH') as string) || '14');
    const blurRadius = parseInt((formData.get('blurRadius') as string) || '16', 10);

    if (!videoFile) {
      return NextResponse.json({ success: false, error: 'Thiếu file video' }, { status: 400 });
    }
    if (!subtitleContent || subtitleContent.trim() === '') {
      return NextResponse.json({ success: false, error: 'Thiếu nội dung phụ đề' }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const videoExt = videoFile.name.split('.').pop() || 'mp4';
    const timestamp = Date.now();
    const videoFileName = `burnin_${timestamp}_input.${videoExt}`;
    const videoPath = path.join(uploadsDir, videoFileName);
    await writeFile(videoPath, Buffer.from(await videoFile.arrayBuffer()));

    const job = await prisma.subtitleJob.create({
      data: {
        type: 'burn_in',
        status: 'queued',
        inputFile: videoPath,
        meta: JSON.stringify({
          subtitleContent,
          fontSizeOption,
          position,
          color,
          langCode,
          posX,
          posY,
          enableBlurMask,
          maskX,
          maskY,
          maskW,
          maskH,
          blurRadius,
        }),
        progressLog: JSON.stringify([]),
      },
    });
    jobQueueManager.addJob(job.id, () => processBurnInJob(job.id));

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (err: unknown) {
    console.error('POST /api/burn-in error:', err);
    return NextResponse.json({ success: false, error: 'Không thể tạo job burn-in' }, { status: 500 });
  }
}
