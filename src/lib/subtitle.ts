export interface SubtitleBlock {
  idx: string;
  timestamp: string;
  text: string;
}

/**
 * Phát hiện một chuỗi văn bản có phải là ký tự rác vô nghĩa hay không.
 */
export function isLineGarbage(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  
  const clean = text.replace(/[\s\p{P}]/gu, '');
  if (clean.length === 0) return false;
  
  // 1. Sử dụng regex để đếm các ký tự extended Latin có dấu lạ kì
  const strangeCharsRegex = /[\u0100-\u017f\u0180-\u024f\u1e00-\u1eff]/g;
  const strangeMatches = clean.match(strangeCharsRegex);
  const strangeCount = strangeMatches ? strangeMatches.length : 0;
  
  if (strangeCount >= 2 && (strangeCount / clean.length) > 0.15) {
    return true;
  }

  // 2. Kiểm tra chuỗi Latin vô nghĩa không có nguyên âm (ví dụ: FBGEREFIRIV, XTHE7TRIV)
  const words = text.toLowerCase().split(/[\s\p{P}]+/gu).filter(w => w.length >= 4);
  const vowels = /[aeiouyàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/;
  for (const w of words) {
    if (!vowels.test(w) && /^[a-z0-9]+$/.test(w)) {
      return true;
    }
  }

  return false;
}

export function detectFormat(content: string): 'srt' | 'vtt' {
  const clean = content.replace(/^\ufeff/, '').trim();
  if (clean.startsWith('WEBVTT')) return 'vtt';
  return 'srt';
}

export function parseSubtitle(content: string): SubtitleBlock[] {
  const cleanBOM = content.replace(/^\ufeff/, '');
  const format = detectFormat(cleanBOM);
  let cleanContent = cleanBOM.trim();
  if (format === 'vtt' && cleanContent.startsWith('WEBVTT')) {
    cleanContent = cleanContent.replace(/^WEBVTT[^\n]*\n*/, '').trim();
  }
  const blocks = cleanContent.split(/\n\s*\n/).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    let idx = '';
    let timestamp = '';
    let textLines: string[] = [];
    
    if (lines[0].includes('-->')) {
      timestamp = lines[0].trim();
      textLines = lines.slice(1);
    } else if (lines[1] && lines[1].includes('-->')) {
      idx = lines[0].trim();
      timestamp = lines[1].trim();
      textLines = lines.slice(2);
    } else {
      timestamp = '';
      textLines = lines;
    }
    return { idx, timestamp, text: textLines.join('\n').trim() };
  });
}

export function rebuildSubtitle(blocks: SubtitleBlock[], format: 'srt' | 'vtt'): string {
  if (format === 'vtt') {
    return 'WEBVTT\n\n' + blocks.map((b) => {
      const lines = [];
      if (b.idx) lines.push(b.idx);
      lines.push(b.timestamp);
      lines.push(b.text);
      return lines.join('\n');
    }).join('\n\n');
  } else {
    return blocks.map((b) => {
      const lines = [];
      if (b.idx) lines.push(b.idx);
      lines.push(b.timestamp);
      lines.push(b.text);
      return lines.join('\n');
    }).join('\n\n');
  }
}

export function convertSrtToVtt(srtContent: string): string {
  let vtt = srtContent.trim();
  vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  vtt = vtt.replace(/(\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  if (!vtt.startsWith('WEBVTT')) {
    vtt = 'WEBVTT\n\n' + vtt;
  }
  return vtt;
}

export function convertVttToSrt(vttContent: string): string {
  let srt = vttContent.trim();
  if (srt.startsWith('WEBVTT')) {
    srt = srt.replace(/^WEBVTT[^\n]*\n*/, '').trim();
  }
  srt = srt.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
  srt = srt.replace(/(\d{2}:\d{2})\.(\d{3})/g, '$1,$2');
  return srt;
}

export function convertToTxt(subtitleContent: string): string {
  const parsed = parseSubtitle(subtitleContent);
  return parsed.map((b) => b.text).filter(Boolean).join('\n');
}

export function countSubtitleLines(content: string): number {
  return parseSubtitle(content).length;
}

export function parseTimestampToMs(timeStr: string): number {
  // Loại bỏ BOM, khoảng trắng và strip phần styling coordinates phía sau (ví dụ: position:10% align:middle)
  const cleanedTimeStr = timeStr.trim().replace(/^\ufeff/, '').match(/^[\d:.,]+/)?.[0] || timeStr.trim();
  const parts = cleanedTimeStr.replace(',', '.').split(':');
  if (parts.length < 2) return 0;
  
  let hours = 0;
  let minutes = 0;
  let secondsWithMs = '';
  
  if (parts.length === 3) {
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
    secondsWithMs = parts[2];
  } else {
    minutes = parseInt(parts[0], 10) || 0;
    secondsWithMs = parts[1];
  }
  
  const secParts = secondsWithMs.split('.');
  const seconds = parseInt(secParts[0], 10) || 0;
  let ms = 0;
  if (secParts[1]) {
    const msStr = secParts[1].padEnd(3, '0').slice(0, 3);
    ms = parseInt(msStr, 10) || 0;
  }
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
}

export function getDurationFromTimestamp(timestampStr: string): number {
  const times = timestampStr.split('-->');
  if (times.length !== 2) return 1;
  const start = parseTimestampToMs(times[0]);
  const end = parseTimestampToMs(times[1]);
  return Math.max(0.1, (end - start) / 1000); // return seconds, min 0.1s
}

export function splitSubtitleIntoChunks(content: string, maxCharsPerChunk: number = 8000): string[] {
  const fmt = detectFormat(content);
  let header = '';
  let body = content;

  if (fmt === 'vtt') {
    const headerEnd = content.indexOf('\n\n');
    if (headerEnd !== -1) {
      header = content.substring(0, headerEnd + 2);
      body = content.substring(headerEnd + 2);
    }
  }

  const blocks = body.split(/\n\s*\n/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const block of blocks) {
    if (currentLen + block.length > maxCharsPerChunk && current.length > 0) {
      chunks.push((chunks.length === 0 ? header : '') + current.join('\n\n'));
      current = [];
      currentLen = 0;
    }
    current.push(block);
    currentLen += block.length;
  }

  if (current.length > 0) {
    chunks.push((chunks.length === 0 ? header : '') + current.join('\n\n'));
  }

  return chunks.length > 0 ? chunks : [content];
}

export function estimateMaxTokens(charCount: number): number {
  const estimated = Math.ceil(charCount / 2.5);
  return Math.max(4096, Math.min(estimated, 64000));
}

// ─── ASS / SSA Parser ─────────────────────────────────────────────────────────

export interface AssParseResult {
  blocks: SubtitleBlock[];
  /** true nếu file có chứa override codes phức tạp như karaoke, move, fad */
  hasAdvancedEffects: boolean;
}

/**
 * Danh sách override code regex báo hiệu hiệu ứng đặc biệt cần cảnh báo người dùng.
 * Chỉ cần detect sự tồn tại, không cần parse chúng.
 */
const ADVANCED_EFFECT_PATTERNS = [
  /\\k\d/i,     // karaoke
  /\\kf\d/i,    // karaoke fill
  /\\ko\d/i,    // karaoke outline
  /\\move\(/i,  // move
  /\\fad\(/i,   // fade
  /\\fade\(/i,  // fade (extended)
  /\\t\(/i,     // transform animation
  /\\org\(/i,   // origin point
  /\\clip\(/i,  // clip region
];

/**
 * Parse định dạng ASS/SSA thành danh sách SubtitleBlock tương thích với hệ thống hiện tại.
 * Mỗi dòng Dialogue trong section [Events] được trích xuất Start, End và Text.
 * Override codes `{...}` được loại bỏ khỏi Text, giữ lại nội dung thuần.
 */
export function parseAss(content: string): AssParseResult {
  const blocks: SubtitleBlock[] = [];
  let hasAdvancedEffects = false;
  let idx = 1;

  // Chỉ xử lý section [Events]
  const eventsMatch = content.match(/\[Events\]([\s\S]*?)(?:\[|$)/i);
  if (!eventsMatch) return { blocks, hasAdvancedEffects };

  const eventsSection = eventsMatch[1];

  // Lấy thứ tự cột từ dòng Format:
  // Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
  const formatMatch = eventsSection.match(/^Format:\s*(.+)$/m);
  let startIdx = 1;
  let endIdx = 2;
  let textIdx = 9;
  if (formatMatch) {
    const cols = formatMatch[1].split(',').map(c => c.trim().toLowerCase());
    startIdx = cols.indexOf('start');
    endIdx = cols.indexOf('end');
    textIdx = cols.indexOf('text');
    if (startIdx < 0) startIdx = 1;
    if (endIdx < 0) endIdx = 2;
    if (textIdx < 0) textIdx = 9;
  }

  // Iterate qua từng dòng Dialogue:
  const dialogueRegex = /^Dialogue:\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = dialogueRegex.exec(eventsSection)) !== null) {
    const rawCols = match[1].split(',');
    // Text có thể chứa dấu phẩy — ghép lại phần còn thừa
    const colCount = Math.max(startIdx, endIdx, textIdx) + 1;
    const cols: string[] = rawCols.slice(0, colCount - 1);
    cols.push(rawCols.slice(colCount - 1).join(','));

    const startTime = (cols[startIdx] || '').trim();
    const endTime = (cols[endIdx] || '').trim();
    const rawText = (cols[textIdx] || '').trim();

    if (!startTime || !endTime) continue;

    // Detect hiệu ứng đặc biệt trong override codes
    const overrideCodes = rawText.match(/\{[^}]*\}/g) || [];
    for (const code of overrideCodes) {
      if (!hasAdvancedEffects) {
        for (const pattern of ADVANCED_EFFECT_PATTERNS) {
          if (pattern.test(code)) {
            hasAdvancedEffects = true;
            break;
          }
        }
      }
    }

    // Loại bỏ toàn bộ override codes `{...}` khỏi text
    const cleanText = rawText
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/g, '\n')  // ASS line break
      .replace(/\\n/g, '\n')  // soft line break
      .replace(/\\h/g, ' ')   // hard space
      .trim();

    if (!cleanText) continue;

    // Chuyển định dạng timestamp ASS (h:mm:ss.cs) → SRT (hh:mm:ss,ms)
    const toSrtTs = (assTs: string): string => {
      // ASS: 0:00:01.00 (centiseconds)
      const m = assTs.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
      if (!m) return assTs;
      const h = m[1].padStart(2, '0');
      const min = m[2];
      const sec = m[3];
      const ms = (parseInt(m[4]) * 10).toString().padStart(3, '0');
      return `${h}:${min}:${sec},${ms}`;
    };

    const timestamp = `${toSrtTs(startTime)} --> ${toSrtTs(endTime)}`;
    blocks.push({ idx: String(idx++), timestamp, text: cleanText });
  }

  return { blocks, hasAdvancedEffects };
}

/**
 * Parse timestamp string SRT/VTT sang milliseconds.
 * Hỗ trợ `hh:mm:ss,ms` (SRT) và `hh:mm:ss.ms` (VTT).
 */
function tsToMs(ts: string): number {
  return parseTimestampToMs(ts.trim());
}

/**
 * Định dạng milliseconds thành timestamp SRT `hh:mm:ss,ms`.
 */
function msToSrtTs(ms: number): string {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  ms %= 3600000;
  const m = Math.floor(ms / 60000);
  ms %= 60000;
  const s = Math.floor(ms / 1000);
  const msPart = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
}

/**
 * Rebuild timestamp string sau khi đã chỉnh sửa start/end ms.
 * Giữ nguyên định dạng VTT (dấu `.`) hay SRT (dấu `,`) dựa theo chuỗi timestamp gốc.
 */
function buildTimestamp(originalTs: string, startMs: number, endMs: number): string {
  const isVtt = originalTs.includes('.');
  const startStr = msToSrtTs(startMs);
  const endStr = msToSrtTs(endMs);
  if (isVtt) {
    return `${startStr.replace(',', '.')} --> ${endStr.replace(',', '.')}`;
  }
  return `${startStr} --> ${endStr}`;
}

/**
 * Chuẩn hóa cú pháp file SRT về dạng chuẩn 100%: HH:MM:SS,mmm --> HH:MM:SS,mmm
 * Sửa các lỗi thiếu dấu hai chấm (:), sai dấu mũi tên (-- thành -->), v.v.
 */
export function normalizeSrtSyntax(rawContent: string): string {
  if (!rawContent || !rawContent.trim()) return '';

  // Sửa các dấu mũi tên lỗi như --, ->, => thành -->
  let cleaned = rawContent.replace(/(\d{2,6}[,.]?\d{0,3})\s*(?:--|->|=>|~>)\s*(\d{2,6}[,.]?\d{0,3})/g, '$1 --> $2');

  const blocks = parseSubtitle(cleaned);
  if (blocks.length === 0) return rawContent;

  return blocks.map((b, i) => {
    const parts = b.timestamp.split('-->');
    if (parts.length !== 2) {
      return `${i + 1}\n00:00:00,000 --> 00:00:01,000\n${b.text}`;
    }
    const startMs = parseTimestampToMs(parts[0].trim());
    const endMs = parseTimestampToMs(parts[1].trim());

    const formatTs = (ms: number) => {
      ms = Math.max(0, Math.round(ms));
      const h = Math.floor(ms / 3600000);
      ms %= 3600000;
      const m = Math.floor(ms / 60000);
      ms %= 60000;
      const s = Math.floor(ms / 1000);
      const msPart = ms % 1000;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
    };

    return `${i + 1}\n${formatTs(startMs)} --> ${formatTs(endMs)}\n${b.text}`;
  }).join('\n\n');
}

/**
 * Dịch chuyển toàn bộ timestamp của danh sách block theo `shiftMs` milli-giây.
 * shiftMs > 0: đẩy muộn hơn (phụ đề xuất hiện trễ hơn).
 * shiftMs < 0: kéo sớm hơn (phụ đề xuất hiện sớm hơn, tối thiểu 0).
 */
export function applyGlobalShift(blocks: SubtitleBlock[], shiftMs: number): SubtitleBlock[] {
  return blocks.map(b => {
    const parts = b.timestamp.split('-->');
    if (parts.length !== 2) return b;
    const startMs = Math.max(0, tsToMs(parts[0]) + shiftMs);
    const endMs = Math.max(startMs + 100, tsToMs(parts[1]) + shiftMs);
    return { ...b, timestamp: buildTimestamp(b.timestamp, startMs, endMs) };
  });
}

/**
 * Co/giãn toàn bộ timestamp theo hệ số `factor`.
 * factor > 1: giãn ra (phụ đề kéo dài hơn).
 * factor < 1: thu lại (phụ đề xuất hiện sớm hơn và kết thúc sớm hơn).
 * Hữu ích khi video bị thay đổi tốc độ phát hoặc phụ đề được tạo từ bản video khác tỷ lệ FPS.
 */
export function applyTimeScale(blocks: SubtitleBlock[], factor: number): SubtitleBlock[] {
  if (factor <= 0) return blocks;
  return blocks.map(b => {
    const parts = b.timestamp.split('-->');
    if (parts.length !== 2) return b;
    const startMs = Math.max(0, Math.round(tsToMs(parts[0]) * factor));
    const endMs = Math.max(startMs + 100, Math.round(tsToMs(parts[1]) * factor));
    return { ...b, timestamp: buildTimestamp(b.timestamp, startMs, endMs) };
  });
}

/**
 * Detect nhanh nếu content là định dạng ASS/SSA dựa trên marker đặc trưng.
 */
export function isAssFormat(content: string): boolean {
  const trimmed = content.trimStart();
  return (
    trimmed.startsWith('[Script Info]') ||
    trimmed.startsWith('[V4+ Styles]') ||
    /^\[Script Info\]/m.test(trimmed)
  );
}
/**
 * Tự động phân tách các khối phụ đề THỰC SỰ Quá Dài (> maxCpl)
 * thành các khối phụ đề đơn 1 dòng ngắn gọn theo chuẩn CapCut / Subbing (CPL <= 42 cho Latin, <= 25 cho CJK).
 * GIỮ NGUYÊN các khối phụ đề đã ngắn sẵn, không xé lẻ theo từng phẩy nhỏ làm nát câu.
 */
export function splitLongSubtitleBlocks(rawContent: string, maxCplOverride?: number): string {
  if (!rawContent || !rawContent.trim()) return '';

  const blocks = parseSubtitle(normalizeSrtSyntax(rawContent));
  if (blocks.length === 0) return rawContent;

  const sampleText = blocks.slice(0, 5).map(b => b.text).join(' ');
  const isCjk = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(sampleText);
  const maxCpl = maxCplOverride || (isCjk ? 10 : 42);

  const newBlocks: Array<{ startMs: number; endMs: number; text: string }> = [];

  for (const b of blocks) {
    const parts = b.timestamp.split('-->');
    if (parts.length !== 2) {
      newBlocks.push({ startMs: 0, endMs: 1000, text: b.text });
      continue;
    }
    const startMs = parseTimestampToMs(parts[0]);
    const endMs = parseTimestampToMs(parts[1]);
    const durationMs = Math.max(200, endMs - startMs);

    const cleanText = b.text.trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');

    // Nếu văn bản đã ngắn hơn maxCpl ➔ GIỮ NGUYÊN 100%
    if (cleanText.length <= maxCpl) {
      newBlocks.push({ startMs, endMs, text: cleanText });
      continue;
    }

    // Nếu văn bản THỰC SỰ quá dài (> maxCpl) ➔ tiến hành chia vế
    const subParts: string[] = [];

    // Tạm thời bảo vệ các con số có dấu phân cách hàng nghìn (ví dụ 5,000, 3,000, 50,000) để không bị tách nhầm
    const maskedText = cleanText.replace(/(\d)[,.，](\d)/g, '$1__NUMSEP__$2');

    if (isCjk) {
      // Tách theo toàn bộ dấu chấm/phẩy/hỏi/chấm cảm tiếng Trung/Nhật
      const clauses = maskedText
        .split(/(?<=[，。！？,.?!])/)
        .filter(c => c.trim().length > 0 && !/^[.?,;!，。！？]+$/.test(c.trim()))
        .map(c => c.replace(/(\d)__NUMSEP__(\d)/g, '$1,$2'));
      let currentGroup = '';

      for (const c of clauses) {
        if (!currentGroup) {
          currentGroup = c;
        } else if ((currentGroup + c).length <= maxCpl) {
          currentGroup += c;
        } else {
          subParts.push(currentGroup.trim());
          currentGroup = c;
        }
      }
      if (currentGroup) subParts.push(currentGroup.trim());
    } else {
      // Tiếng Việt / Anh
      const clauses = maskedText
        .split(/(?<=[.?!,;])\s+/)
        .filter(c => c.trim().length > 0)
        .map(c => c.replace(/(\d)__NUMSEP__(\d)/g, '$1,$2'));
      let currentGroup = '';

      for (const c of clauses) {
        if (!currentGroup) {
          currentGroup = c;
        } else if ((currentGroup + ' ' + c).length <= maxCpl) {
          currentGroup += ' ' + c;
        } else {
          subParts.push(currentGroup.trim());
          currentGroup = c;
        }
      }
      if (currentGroup) subParts.push(currentGroup.trim());
    }

    if (subParts.length <= 1) {
      newBlocks.push({ startMs, endMs, text: cleanText });
    } else {
      const totalChars = subParts.reduce((acc, s) => acc + s.length, 0);
      let currStart = startMs;

      subParts.forEach((sText, idx) => {
        const segRatio = sText.length / Math.max(1, totalChars);
        const segDuration = idx === subParts.length - 1
          ? (endMs - currStart)
          : Math.round(durationMs * segRatio);

        const segEnd = currStart + segDuration;
        newBlocks.push({
          startMs: currStart,
          endMs: segEnd,
          text: sText.trim()
        });
        currStart = segEnd;
      });
    }
  }

  const formatTs = (ms: number) => {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000);
    ms %= 3600000;
    const m = Math.floor(ms / 60000);
    ms %= 60000;
    const s = Math.floor(ms / 1000);
    const msPart = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
  };

  return newBlocks.map((nb, i) => {
    return `${i + 1}\n${formatTs(nb.startMs)} --> ${formatTs(nb.endMs)}\n${nb.text}`;
  }).join('\n\n');
}

const COMMON_HANZI_VIET_MAP: Record<string, string> = {
  '碎': 'toái',
  '震': 'chấn',
  '斩': 'trảm',
  '斬': 'trảm',
  '杀': 'sát',
  '殺': 'sát',
  '神': 'thần',
  '魔': 'ma',
  '尊': 'tôn',
  '剑': 'kiếm',
  '劍': 'kiếm',
  '龍': 'long',
  '龙': 'long',
  '帝': 'đế',
  '宗': 'tông',
  '门': 'môn',
  '門': 'môn',
  '城': 'thành',
  '家': 'gia',
  '天': 'thiên',
  '地': 'địa',
  '道': 'đạo',
  '破': 'phá',
  '灭': 'diệt',
  '滅': 'diệt',
  '死': 'tử',
  '生': 'sinh',
  '心': 'tâm',
  '血': 'huyết',
  '王': 'vương',
  '皇': 'hoàng',
  '圣': 'thánh',
  '聖': 'thánh',
  '仙': 'tiên',
  '佛': 'phật',
  '妖': 'yêu',
  '鬼': 'quỷ',
  '法': 'pháp',
  '印': 'ấn',
  '符': 'phù',
  '阵': 'trận',
  '陣': 'trận',
  '鼎': 'đỉnh',
  '丹': 'đan',
  '灵': 'linh',
  '靈': 'linh',
  '气': 'khí',
  '氣': 'khí',
  '力': 'lực',
  '体': 'thể',
  '體': 'thể',
  '魂': 'hồn',
  '魄': 'phách',
  '爆': 'bộc',
  '轰': 'oanh',
  '轟': 'oanh',
  '撕': 'tư',
  '裂': 'liệt',
  '粉': 'phấn',
  '绝': 'tuyệt',
  '絕': 'tuyệt',
  '无': 'vô',
  '無': 'vô',
  '极': 'cực',
  '極': 'cực',
  '阴': 'âm',
  '陰': 'âm',
  '阳': 'dương',
  '陽': 'dương',
  '九': 'cửu',
  '重': 'trùng',
  '三': 'tam',
  '千': 'thiên',
  '万': 'vạn',
  '萬': 'vạn',
};

/**
 * Xử lý & dọn dẹp các ký tự chữ Hán còn sót lại trong bản dịch sang Tiếng Việt.
 * Tự động chuyển đổi các chữ Hán thường gặp sang âm Hán-Việt tương ứng,
 * và loại bỏ hoàn toàn mọi chữ Hán rác còn sót lại.
 */
export function sanitizeUntranslatedChinese(text: string, targetLang: string = 'vi'): string {
  if (!text) return text;
  
  if (targetLang.toLowerCase().startsWith('zh')) return text;

  let clean = text;
  for (const [hanzi, viet] of Object.entries(COMMON_HANZI_VIET_MAP)) {
    clean = clean.replaceAll(hanzi, viet);
  }

  // Lọc bỏ bất kỳ ký tự chữ Hán CJK còn sót lại
  const cjkRegex = /[\u3400-\u4dbf\u4e00-\u9fa5\u9fcf\uf900-\ufaff\u20000-\u2a6df]/g;
  clean = clean.replace(cjkRegex, '');

  return clean.replace(/ {2,}/g, ' ');
}

