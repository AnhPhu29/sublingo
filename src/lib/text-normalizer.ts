/**
 * text-normalizer.ts — Chuẩn hóa văn bản tiếng Việt trước khi đưa vào TTS.
 *
 * Xử lý:
 *  - Số nguyên, số thập phân, phần trăm sang chữ tiếng Việt.
 *  - Đơn vị đo lường phổ biến (°C, km/h, kg, m2...).
 *  - Ký hiệu đặc biệt (&, +, =, $, @...).
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/**
 * Chuyển một nhóm 3 chữ số (0-999) thành chữ tiếng Việt
 */
function readThreeDigits(n: number, full: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;

  if (hundreds === 0 && tens === 0 && units === 0) return '';

  let res = '';

  if (hundreds > 0 || full) {
    res += `${DIGITS[hundreds]} trăm `;
  }

  if (tens === 0 && units > 0) {
    if (hundreds > 0 || full) res += 'lẻ ';
    res += DIGITS[units];
  } else if (tens === 1) {
    res += 'mười ';
    if (units === 1) res += 'một';
    else if (units === 5) res += 'lăm';
    else if (units > 0) res += DIGITS[units];
  } else if (tens > 1) {
    res += `${DIGITS[tens]} mươi `;
    if (units === 1) res += 'mốt';
    else if (units === 4) res += 'tư';
    else if (units === 5) res += 'lăm';
    else if (units > 0) res += DIGITS[units];
  }

  return res.trim();
}

/**
 * Chuyển số nguyên dương n thành chữ đọc tiếng Việt
 */
export function numberToVietnameseWords(n: number): string {
  if (isNaN(n)) return '';
  if (n === 0) return 'không';

  let num = Math.abs(Math.floor(n));
  if (num === 0) return 'không';

  const unitsScale = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups: number[] = [];

  while (num > 0) {
    groups.push(num % 1000);
    num = Math.floor(num / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g > 0) {
      const full = i < groups.length - 1;
      const str = readThreeDigits(g, full);
      const scale = unitsScale[i];
      parts.push(scale ? `${str} ${scale}` : str);
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Chuẩn hóa chuỗi văn bản đầu vào cho TTS
 */
export function normalizeTextForTTS(text: string): string {
  if (!text) return '';

  let s = text;

  // 1. Ký hiệu đặc biệt phổ biến
  s = s.replace(/&/g, ' và ');
  s = s.replace(/\+/g, ' cộng ');
  s = s.replace(/=/g, ' bằng ');
  s = s.replace(/\$/g, ' đô la ');
  s = s.replace(/@/g, ' a còng ');

  // 2. Đơn vị đo lường đứng sau số
  s = s.replace(/(\d+)\s*°C\b/gi, '$1 độ C');
  s = s.replace(/(\d+)\s*°F\b/gi, '$1 độ F');
  s = s.replace(/(\d+)\s*km\/h\b/gi, '$1 ki lô mét trên giờ');
  s = s.replace(/(\d+)\s*km\b/gi, '$1 ki lô mét');
  s = s.replace(/(\d+)\s*kg\b/gi, '$1 ki lô gam');
  s = s.replace(/(\d+)\s*m2\b/gi, '$1 mét vuông');
  s = s.replace(/(\d+)\s*m²\b/gi, '$1 mét vuông');
  s = s.replace(/(\d+)\s*m3\b/gi, '$1 mét khối');
  s = s.replace(/(\d+)\s*m³\b/gi, '$1 mét khối');

  // 3. Phần trăm (%)
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 phần trăm');

  // 4. Số thập phân (vd: 3.5 hoặc 3,5)
  s = s.replace(/(\b\d+)[.,](\d+\b)/g, (_match, p1, p2) => {
    const w1 = numberToVietnameseWords(parseInt(p1, 10));
    const w2 = numberToVietnameseWords(parseInt(p2, 10));
    return `${w1} phẩy ${w2}`;
  });

  // 5. Số nguyên độc lập
  s = s.replace(/\b\d+\b/g, (match) => {
    const num = parseInt(match, 10);
    return numberToVietnameseWords(num);
  });

  // Dọn dẹp khoảng trắng thừa
  return s.replace(/\s+/g, ' ').trim();
}
