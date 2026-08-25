/**
 * srt-validator.ts
 * Module kiểm tra và validate cú pháp, timestamp, thứ tự block trong file phụ đề SRT
 */

export interface SrtValidationError {
  lineIndex?: number; // Số thứ tự block (1-indexed)
  rawTimestamp?: string; // Chuỗi timestamp gốc (ví dụ: 00:00:05,200 --> 00:00:03,100)
  textSnippet?: string; // Nội dung câu thoại trích dẫn
  errorType:
    | 'time_reversed'
    | 'invalid_timestamp'
    | 'non_sequential_index'
    | 'empty_block'
    | 'invalid_file_type'
    | 'file_too_large';
  message: string;
}

export interface SrtValidationResult {
  isValid: boolean;
  errors: SrtValidationError[];
}

/** Chuyển timestamp HH:MM:SS,mmm hoặc HH:MM:SS.mmm sang mili-giây */
export function parseTsToMs(tsStr: string): number {
  if (!tsStr) return -1;
  const clean = tsStr.trim().replace('.', ',');
  const match = clean.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return -1;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3], 10);
  const ms = parseInt(match[4], 10);

  return (h * 3600 + m * 60 + s) * 1000 + ms;
}

/**
 * Validate file SRT/TXT client-side
 */
export function validateSrtContent(
  content: string,
  fileName?: string,
  fileSize?: number
): SrtValidationResult {
  const errors: SrtValidationError[] = [];

  // 1. Kiểm tra dung lượng & định dạng file nếu có thông tin file
  if (fileSize !== undefined && fileSize > 50 * 1024 * 1024) {
    errors.push({
      errorType: 'file_too_large',
      message: `Dung lượng file vượt quá giới hạn tối đa (50MB). Dung lượng hiện tại: ${(fileSize / (1024 * 1024)).toFixed(1)}MB.`,
    });
  }

  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const validExts = ['srt', 'txt', 'vtt', 'docx', 'pdf'];
    if (!ext || !validExts.includes(ext)) {
      errors.push({
        errorType: 'invalid_file_type',
        message: `Định dạng file .${ext} không được hỗ trợ. Vui lòng tải file .SRT, .TXT, .VTT, .DOCX hoặc .PDF.`,
      });
    }
  }

  if (!content || !content.trim()) {
    return { isValid: errors.length === 0, errors };
  }

  // Nếu file là plain text thông thường (không chứa timestamp -->) thì bỏ qua validate SRT timestamp
  if (!content.includes('-->')) {
    return { isValid: errors.length === 0, errors };
  }

  // Parse từng block trong file SRT
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocksRaw = normalized.split(/\n\n+/);

  let expectedIndex = 1;

  blocksRaw.forEach((blockStr, blockPos) => {
    const lines = blockStr.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;

    let indexLine = '';
    let timestampLine = '';
    let textLines: string[] = [];

    // Kiểm tra xem dòng 1 có phải là số thứ tự không
    if (/^\d+$/.test(lines[0])) {
      indexLine = lines[0];
      timestampLine = lines[1] || '';
      textLines = lines.slice(2);
    } else if (lines[0].includes('-->')) {
      timestampLine = lines[0];
      textLines = lines.slice(1);
    } else {
      textLines = lines;
    }

    const currentIndex = indexLine ? parseInt(indexLine, 10) : expectedIndex;
    const textContent = textLines.join('\n').trim();

    // 2. Kiểm tra số thứ tự block có tăng dần liên tục không
    if (indexLine) {
      if (currentIndex !== expectedIndex) {
        errors.push({
          lineIndex: currentIndex,
          rawTimestamp: timestampLine,
          textSnippet: textContent,
          errorType: 'non_sequential_index',
          message: `Số thứ tự block không liên tục (Kỳ vọng #${expectedIndex}, hiện tại #${currentIndex}).`,
        });
      }
    }

    // 3. Kiểm tra cú pháp timestamp
    if (timestampLine) {
      const parts = timestampLine.split(/-->/).map((p) => p.trim());
      if (parts.length !== 2) {
        errors.push({
          lineIndex: currentIndex,
          rawTimestamp: timestampLine,
          textSnippet: textContent,
          errorType: 'invalid_timestamp',
          message: `Định dạng timestamp sai cú pháp: "${timestampLine}". Cú pháp chuẩn: HH:MM:SS,mmm --> HH:MM:SS,mmm`,
        });
      } else {
        const startMs = parseTsToMs(parts[0]);
        const endMs = parseTsToMs(parts[1]);

        if (startMs < 0 || endMs < 0) {
          errors.push({
            lineIndex: currentIndex,
            rawTimestamp: timestampLine,
            textSnippet: textContent,
            errorType: 'invalid_timestamp',
            message: `Timestamp không đúng định dạng thời gian: "${timestampLine}".`,
          });
        } else if (startMs >= endMs) {
          // 4. Lỗi thời gian bắt đầu phải bé hơn thời gian kết thúc
          errors.push({
            lineIndex: currentIndex,
            rawTimestamp: timestampLine,
            textSnippet: textContent,
            errorType: 'time_reversed',
            message: 'Thời gian bắt đầu phải bé hơn thời gian kết thúc.',
          });
        }
      }
    }

    // 5. Kiểm tra block rỗng (không có văn bản)
    if (timestampLine && textContent.length === 0) {
      errors.push({
        lineIndex: currentIndex,
        rawTimestamp: timestampLine,
        textSnippet: '(Đoạn rỗng)',
        errorType: 'empty_block',
        message: `Block #${currentIndex} bị rỗng (có timestamp nhưng không có câu thoại).`,
      });
    }

    expectedIndex = currentIndex + 1;
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
