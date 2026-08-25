import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function runCommandAsync(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

function parseTsvConfidence(tsvPath: string): number {
  if (!fs.existsSync(tsvPath)) return 100;
  try {
    const content = fs.readFileSync(tsvPath, 'utf8');
    const lines = content.split('\n');
    let totalConf = 0;
    let wordCount = 0;
    
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 11) {
        const level = parts[0].trim();
        const confStr = parts[10].trim();
        if (level === '5') {
          const conf = parseFloat(confStr);
          if (!isNaN(conf) && conf >= 0) {
            totalConf += conf;
            wordCount++;
          }
        }
      }
    }
    
    if (wordCount > 0) {
      return Math.round(totalConf / wordCount);
    }
  } catch (err) {
    console.error('[TSV Parse Error]:', err);
  }
  return 100;
}

async function getTesseractBinaryPath(): Promise<string> {
  const envPath = process.env.TESSERACT_PATH;
  if (envPath && envPath.trim() !== '') {
    if (fs.existsSync(envPath)) return `"${envPath}"`;
    try {
      await runCommandAsync(`"${envPath}" --version`);
      return `"${envPath}"`;
    } catch {
      try {
        await runCommandAsync(`${envPath} --version`);
        return envPath;
      } catch {}
    }
  }

  try {
    await runCommandAsync('tesseract --version');
    return 'tesseract';
  } catch {}

  const isWindows = process.platform === 'win32';
  if (isWindows) {
    const defaultWinPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
    if (fs.existsSync(defaultWinPath)) return `"${defaultWinPath}"`;
  } else {
    const paths = ['/usr/bin/tesseract', '/usr/local/bin/tesseract'];
    for (const p of paths) {
      if (fs.existsSync(p)) return `"${p}"`;
    }
  }
  throw new Error('Không tìm thấy Tesseract OCR cài đặt trên máy.');
}

export async function POST(request: Request) {
  let tempImagePath = '';
  let outputTempPrefix = '';
  let outputTempTxtFile = '';
  let outputTempTsvFile = '';
  
  try {
    const { imageBase64, mediaType } = await request.json();

    if (!imageBase64 || !mediaType) {
      return NextResponse.json(
        { success: false, error: 'Thiếu dữ liệu hình ảnh hoặc định dạng ảnh' },
        { status: 400 }
      );
    }

    // Tạo job trong DB
    const job = await prisma.subtitleJob.create({
      data: {
        type: 'ocr_image',
        status: 'processing',
        meta: JSON.stringify({ mediaType }),
      },
    });

    // Giải mã Base64 và ghi vào file tạm
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = mediaType.split('/')[1] || 'png';
    tempImagePath = path.join(uploadsDir, `ocr_${job.id}_temp.${ext}`);
    const buffer = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(tempImagePath, buffer);

    // Chạy Tesseract CLI (sản sinh cả txt và tsv)
    const tesseractBin = await getTesseractBinaryPath();
    outputTempPrefix = tempImagePath.replace(`_temp.${ext}`, '_txt');
    outputTempTxtFile = outputTempPrefix + '.txt';
    outputTempTsvFile = outputTempPrefix + '.tsv';

    const tessdataDir = path.join(process.cwd(), 'tessdata');
    const cmd = `${tesseractBin} --tessdata-dir "${tessdataDir}" "${tempImagePath}" "${outputTempPrefix}" -l vie+eng --psm 3 txt tsv`;

    await runCommandAsync(cmd);

    let extractedText = '';
    if (fs.existsSync(outputTempTxtFile)) {
      extractedText = fs.readFileSync(outputTempTxtFile, 'utf8').trim();
    }

    let confidence = 100;
    if (fs.existsSync(outputTempTsvFile)) {
      confidence = parseTsvConfidence(outputTempTsvFile);
    }

    // Dọn dẹp tệp tạm ngay lập tức
    try {
      if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
      if (fs.existsSync(outputTempTxtFile)) fs.unlinkSync(outputTempTxtFile);
      if (fs.existsSync(outputTempTsvFile)) fs.unlinkSync(outputTempTsvFile);
    } catch {}

    // Ghi nhận log chi phí local (0 USD)
    await prisma.costLog.create({
      data: {
        jobId: job.id,
        provider: 'tesseract-ocr',
        amountUsd: 0,
      },
    });

    await prisma.subtitleJob.update({
      where: { id: job.id },
      data: {
        status: 'done',
        costUsd: 0,
      },
    });

    return NextResponse.json({ success: true, text: extractedText || 'KHONG_TIM_THAY_CHU', confidence });
  } catch (err: any) {
    console.error('Image OCR error:', err);
    // Dọn dẹp tệp tạm nếu lỗi
    try {
      if (tempImagePath && fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
      if (outputTempTxtFile && fs.existsSync(outputTempTxtFile)) fs.unlinkSync(outputTempTxtFile);
      if (outputTempTsvFile && fs.existsSync(outputTempTsvFile)) fs.unlinkSync(outputTempTsvFile);
    } catch {}

    return NextResponse.json(
      { success: false, error: err.message || 'Lỗi xử lý trích xuất văn bản từ hình ảnh cục bộ' },
      { status: 500 }
    );
  }
}
export const maxDuration = 60;
