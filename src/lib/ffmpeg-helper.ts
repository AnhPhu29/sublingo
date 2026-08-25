/**
 * ffmpeg-helper.ts
 * Các hàm tiện ích để làm việc an toàn với ffmpeg trên Windows:
 * - escapeFfmpegPath: escape đường dẫn cho filter subtitles
 * - selectFontForLanguage: chọn font CJK phù hợp theo ngôn ngữ
 * - parseFfmpegProgressLine: parse stderr của ffmpeg lấy % hoàn thành
 */

import path from 'path';

/**
 * Escape đường dẫn file để dùng an toàn trong ffmpeg filter string.
 *
 * Trên Windows, ffmpeg filter dùng dấu `:` làm phân tách tham số.
 * Đường dẫn `D:\path\to\file.srt` phải được biến thành `D\:/path/to/file.srt`
 * để không bị parser của ffmpeg hiểu nhầm dấu `:` sau ký tự ổ đĩa.
 *
 * Quy tắc escape (theo thứ tự):
 *  1. Đổi `\` thành `/`
 *  2. Escape dấu `:` thành `\:` (trên Windows, ổ đĩa kiểu `D:/` → `D\:/`)
 *  3. Escape dấu `'` thành `'\''` (để không phá vỡ chuỗi trong shell)
 *  4. Escape dấu `,` thành `\,` (dấu phân cách trong force_style)
 *  5. Escape dấu `[` và `]` thành `\[` và `\]`
 */
export function escapeFfmpegPath(rawPath: string): string {
  // 1. Đổi toàn bộ backslash → forward slash
  let p = rawPath.replace(/\\/g, '/');
  // 2. Escape dấu hai chấm (ổ đĩa Windows: C:/ → C\:/)
  p = p.replace(/:/g, '\\:');
  // 3. Escape dấu nháy đơn
  p = p.replace(/'/g, "\\'");
  // 4. Escape dấu khoảng trắng trong đường dẫn (ví dụ: "Web srt" → "Web\ srt")
  p = p.replace(/ /g, '\\ ');
  // 5. Escape dấu phẩy
  p = p.replace(/,/g, '\\,');
  // 6. Escape dấu ngoặc tròn và ngoặc vuông
  p = p.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  p = p.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  return p;
}

// ─── Font Mappings ────────────────────────────────────────────────────────────

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

/** Bản đồ mã ngôn ngữ → tên file font tương ứng trong public/fonts/ */
const FONT_MAP: Record<string, string> = {
  // CJK — phải có font chuyên dụng mới hiển thị đúng ký tự
  ja: 'NotoSansJP-Regular.otf',
  ko: 'NotoSansKR-Regular.otf',
  zh: 'NotoSansSC-Regular.otf',
  'zh-tw': 'NotoSansTC-Regular.otf',
  'zh-hant': 'NotoSansTC-Regular.otf',
  // Tất cả các ngôn ngữ Latin, Việt, và mặc định
  _default: 'NotoSans-Regular.ttf',
};

/**
 * Trả về đường dẫn tuyệt đối đến font phù hợp với `langCode`.
 * Nếu không tìm thấy mapping cụ thể, dùng font Latin mặc định.
 */
export function selectFontForLanguage(langCode: string): string {
  const normalized = (langCode || '').toLowerCase().trim();
  const fontFile = FONT_MAP[normalized] ?? FONT_MAP['_default'];
  return path.join(FONTS_DIR, fontFile);
}

/**
 * Trả về tên font (tên hiển thị trong ffmpeg force_style=FontName=...)
 * tương ứng với langCode.
 */
export function getFontNameForLanguage(langCode: string): string {
  const normalized = (langCode || '').toLowerCase().trim();
  const fontNames: Record<string, string> = {
    ja: 'Noto Sans JP',
    ko: 'Noto Sans KR',
    zh: 'Noto Sans SC',
    'zh-tw': 'Noto Sans TC',
    'zh-hant': 'Noto Sans TC',
    _default: 'Noto Sans',
  };
  return fontNames[normalized] ?? fontNames['_default'];
}

// ─── ffmpeg Progress Parsing ──────────────────────────────────────────────────

/**
 * Parse một dòng output stderr của ffmpeg để lấy thời gian đã xử lý (ms).
 * ffmpeg in ra dạng: `frame=  123 fps= 30 q=28.0 size=   512kB time=00:00:04.10 ...`
 * hoặc với -progress pipe:1: `out_time_ms=4100000`
 *
 * Trả về milliseconds đã xử lý, hoặc -1 nếu không parse được.
 */
export function parseFfmpegProgressLine(line: string): number {
  // Ưu tiên dạng -progress pipe:1
  const outTimeMatch = line.match(/out_time_ms=(\d+)/);
  if (outTimeMatch) {
    return Math.round(parseInt(outTimeMatch[1]) / 1000); // microseconds → ms
  }

  // Fallback: parse time= từ stderr thông thường
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2]);
    const s = parseInt(timeMatch[3]);
    const centis = parseInt(timeMatch[4]);
    const ms = centis.toString().length === 2 ? centis * 10 : centis;
    return (h * 3600 + m * 60 + s) * 1000 + ms;
  }

  return -1;
}

/**
 * Tính tỉ lệ hoàn thành (0–100) từ thời gian đã xử lý và tổng thời lượng.
 * @param processedMs - ms đã xử lý (từ parseFfmpegProgressLine)
 * @param totalMs     - tổng thời lượng video tính bằng ms
 */
export function calcProgressPercent(processedMs: number, totalMs: number): number {
  if (totalMs <= 0 || processedMs < 0) return 0;
  return Math.min(100, Math.round((processedMs / totalMs) * 100));
}
