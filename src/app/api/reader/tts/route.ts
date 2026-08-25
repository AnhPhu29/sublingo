import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 120;

// Danh sách các mẫu tiêu đề / tên tác giả / số trang footer lặp lại ở cuối/đầu trang PDF
const KNOWN_FOOTER_PATTERNS = [
  /^\s*dale\s+carnegie\s*$/i,
  /^\s*how\s+to\s+win\s+friends\s*(?:&|and)\s*influence\s+people\s*$/i,
  /^\s*đắc\s+nhân\s+tâm\s*$/i,
  /^\s*first\s+news\s*$/i,
  /^\s*trí\s+việt\s*$/i,
  /^\s*nxb\s+.*$/i,
  /^\s*nhà\s+xuất\s+bản\s+.*$/i,
  /^[—\-\s]*\d+[—\-\s]*$/,
  /^(?:Trang\s+)?-?\s*\d+\s*-?$/i,
  /^\d+\s*\/\s*\d+$/,
];

// Hàm xử lý nối các chữ cái bị giãn cách & lọc bỏ header/footer/số trang rác
function cleanSpacedLettersAndArtifacts(rawText: string): string {
  if (!rawText) return '';

  // 1. Nối các từ bị gạch nối qua dòng (gạch nối ngắt dòng)
  let text = rawText
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // 2. Xử lý các dòng có chữ bị giãn cách nhiều khoảng trắng
  // Ví dụ: "Đ Ắ C  N H Â N  T Â M" -> "ĐẮC NHÂN TÂM"
  text = text.replace(/([^\n]+)/g, (line) => {
    if (/\b\p{L}\s+\p{L}/u.test(line)) {
      const segments = line.split(/\s{2,}/);
      const cleanedSegments = segments.map((seg) => {
        const tokens = seg.trim().split(/\s+/);
        if (tokens.length >= 2 && tokens.every((t) => t.length === 1 || /^\p{L}$/u.test(t))) {
          return tokens.join('');
        }
        return seg;
      });
      return cleanedSegments.join(' ');
    }
    return line;
  });

  // 3. Xử lý các cụm 3 chữ cái đơn lẻ liền kề (ví dụ: "Đ Ắ C N H Â N T Â M" cách đơn)
  text = text.replace(/(?:(?<=\s|^)\p{L}(?:\s+\p{L}){2,}(?=\s|$))/gu, (match) => {
    return match.replace(/\s+/g, '');
  });

  const lines = text.split('\n').map((l) => l.trim());

  // 4. Lọc bỏ các dòng Running Footer ở cuối trang (như DALE CARNEGIE, HOW TO WIN FRIENDS..., số trang)
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last) {
      lines.pop();
      continue;
    }
    const isFooter = KNOWN_FOOTER_PATTERNS.some((pattern) => pattern.test(last));
    if (isFooter) {
      lines.pop();
    } else {
      break;
    }
  }

  // 5. Lọc bỏ các dòng Running Header ở đầu trang
  while (lines.length > 0) {
    const first = lines[0];
    if (!first) {
      lines.shift();
      continue;
    }
    const isHeader = KNOWN_FOOTER_PATTERNS.some((pattern) => pattern.test(first));
    if (isHeader) {
      lines.shift();
    } else {
      break;
    }
  }

  // 6. Lọc các dòng chỉ chứa số trang đứng cô lập trong nội dung
  const filteredLines = lines.filter((l) => {
    if (!l) return true;
    return !KNOWN_FOOTER_PATTERNS.some((p) => p.test(l));
  });

  // 7. Chuẩn hóa khoảng trắng & ngắt câu
  return filteredLines
    .join('\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { text, voiceId = 'edge_hoaimy', speed = 1.0 } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { success: false, error: 'Không có nội dung văn bản để tạo giọng đọc.' },
        { status: 400 }
      );
    }

    // Tiền xử lý văn bản chuyên sâu (ghép từ giãn cách & lọc số trang rác)
    text = cleanSpacedLettersAndArtifacts(text);

    const uploadsDir = path.join(process.cwd(), 'uploads', 'reader_tts');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let refAudioPath: string | undefined = undefined;
    let refText: string | undefined = undefined;
    let backendVoiceId = voiceId;

    const isEdgeVoice = ['edge_hoaimy', 'edge_namminh', 'edge_female', 'edge_male', 'hoaimy', 'namminh'].includes(voiceId);

    // Nếu là Custom Voice
    if (!isEdgeVoice && voiceId !== 'female' && voiceId !== 'male') {
      try {
        const customVoice = await prisma.customVoice.findUnique({
          where: { id: voiceId },
        });
        if (customVoice && fs.existsSync(customVoice.refAudioPath)) {
          refAudioPath = customVoice.refAudioPath;
          refText = customVoice.refText;
          backendVoiceId = 'Mai Anh';
        }
      } catch (dbErr) {
        console.warn('Custom voice lookup error:', dbErr);
      }
    }

    // Tra cứu cache trên đĩa (trả về ngay sau 0.05s nếu đã từng nạp trang này)
    const ext = isEdgeVoice ? 'mp3' : 'wav';
    const contentType = isEdgeVoice ? 'audio/mpeg' : 'audio/wav';

    const cacheKey = crypto
      .createHash('md5')
      .update(`${text.trim()}:${voiceId}:${speed}:${refAudioPath || ''}`)
      .digest('hex');

    const cacheFilePath = path.join(uploadsDir, `tts_${cacheKey}.${ext}`);
    const timingsFilePath = path.join(uploadsDir, `tts_${cacheKey}.json`);

    if (fs.existsSync(cacheFilePath)) {
      const cachedBuffer = fs.readFileSync(cacheFilePath);
      let timingsHeader = '';
      if (fs.existsSync(timingsFilePath)) {
        try {
          timingsHeader = fs.readFileSync(timingsFilePath, 'utf-8');
        } catch {}
      }

      return new NextResponse(new Uint8Array(cachedBuffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Expose-Headers': 'X-Timings',
          'X-Timings': timingsHeader,
        },
      });
    }

    // Gọi trực tiếp Python TTS AI Service (Edge Neural / VieNeu Voice Clone)
    const pythonServiceUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const pythonRes = await fetch(`${pythonServiceUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        voiceId: isEdgeVoice
          ? (voiceId.includes('nam') || voiceId.includes('male') ? 'vi-VN-NamMinhNeural' : 'vi-VN-HoaiMyNeural')
          : backendVoiceId,
        speed: Number(speed) || 1.0,
        ref_audio: refAudioPath,
        ref_text: refText,
        denoise: false,
      }),
    });

    if (!pythonRes.ok) {
      const errData = await pythonRes.json().catch(() => ({}));
      throw new Error(errData.detail || `Lỗi từ Python TTS Service (HTTP ${pythonRes.status})`);
    }

    const pythonTimings = pythonRes.headers.get('x-timings') || '';
    const audioBuffer = Buffer.from(await pythonRes.arrayBuffer());

    // Lưu vào cache đĩa (cả audio lẫn metadata thời gian câu/từ)
    try {
      fs.writeFileSync(cacheFilePath, audioBuffer);
      if (pythonTimings) {
        fs.writeFileSync(timingsFilePath, pythonTimings, 'utf-8');
      }
    } catch (writeErr) {
      console.warn('Failed to write TTS cache file:', writeErr);
    }

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Expose-Headers': 'X-Timings',
        'X-Timings': pythonTimings,
      },
    });
  } catch (err: any) {
    console.error('Reader TTS API Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Không thể tạo giọng đọc cho trang sách.' },
      { status: 500 }
    );
  }
}
