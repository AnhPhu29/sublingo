/**
 * audio-sync.ts — Các tiện ích đồng bộ âm thanh cho module Lồng Tiếng (Dubbing).
 *
 * Hàm chính:
 *  - getAtempoFilters: Tính chuỗi hệ số atempo cho ffmpeg khi tỉ lệ vượt giới hạn 2.0x.
 *  - runWithConcurrencyLimit: Thực thi danh sách task bất đồng bộ với giới hạn song song.
 */

import * as fs from 'fs';
import { exec } from 'child_process';

/** Tốc độ đọc tự nhiên tối đa trước khi tràn hoặc gọi rút ngắn thoại qua Local Ollama */
export const MAX_NATURAL_TEMPO = 1.4;
/** Số dòng thoại TTS được xử lý song song tối đa cùng lúc */
export const TTS_CONCURRENCY_LIMIT = 3;

/** Khoảng thời gian đệm tối thiểu (ms) cần có giữa hai dòng thoại để cho phép tràn */
export const OVERFLOW_BUFFER_MS = 100;

/** Trần tốc độ tối đa dành riêng cho TTS nguồn SRT (1.8x - chấp nhận gấp nhưng nghe hiểu được) */
export const TTS_SRT_MAX_TEMPO = 1.8;

export const TTS_CHARS_PER_SEC_ESTIMATE = 14.0;

/** Ngưỡng CPS cảnh báo dành cho LỒNG TIẾNG (cao hơn ngưỡng phụ đề vì nói tự nhiên nhanh hơn đọc chữ) */
export const DUBBING_CPS_WARN_THRESHOLD = 22;

/** Ngưỡng CPS chuẩn Netflix/Subbing dành cho HIỂN THỊ PHỤ ĐỀ (đọc chữ trên màn hình) */
export const SUBTITLE_CPS_DISPLAY_THRESHOLD = 17;

/** Giới hạn kỹ thuật của một bộ lọc atempo đơn lẻ trong ffmpeg */
const ATEMPO_MAX = 2.0;
const ATEMPO_MIN = 0.5;

// ─── Hàm tính chuỗi atempo ────────────────────────────────────────────────────

/**
 * Tính chuỗi các hệ số `atempo` cho ffmpeg khi tỉ lệ tốc độ vượt giới hạn [0.5, 2.0].
 *
 * ffmpeg chỉ chấp nhận một hệ số atempo trong phạm vi [0.5, 2.0] mỗi lần.
 * Khi cần tỉ lệ lớn hơn (ví dụ 2.6x), ta phải ghép chuỗi: atempo=2.0,atempo=1.3.
 * Tích của các hệ số phải bằng đúng `ratio` mục tiêu.
 *
 * @param ratio Tỉ lệ tốc độ mong muốn (D_actual / D_target), phải > 0
 * @returns Chuỗi các tham số filter ffmpeg, ví dụ: "atempo=2.0,atempo=1.3"
 *
 * @example
 * getAtempoFilters(1.5)  // → "atempo=1.5"
 * getAtempoFilters(2.0)  // → "atempo=2.0"
 * getAtempoFilters(2.6)  // → "atempo=2.0,atempo=1.3"
 * getAtempoFilters(4.0)  // → "atempo=2.0,atempo=2.0"
 * getAtempoFilters(0.4)  // → "atempo=0.5,atempo=0.8"  (giảm tốc cũng áp dụng tương tự)
 */
export function getAtempoFilters(ratio: number): string {
  if (ratio <= 0) throw new Error(`getAtempoFilters: ratio phải > 0, nhận được ${ratio}`);

  const filters: string[] = [];
  let remaining = ratio;

  if (ratio >= 1.0) {
    // Tăng tốc: tách thành các bước tối đa ATEMPO_MAX
    while (remaining > ATEMPO_MAX + 1e-9) {
      filters.push(`atempo=${ATEMPO_MAX.toFixed(1)}`);
      remaining = remaining / ATEMPO_MAX;
    }
    filters.push(`atempo=${remaining.toFixed(4).replace(/\.?0+$/, '')}`);
  } else {
    // Giảm tốc: tách thành các bước tối thiểu ATEMPO_MIN
    while (remaining < ATEMPO_MIN - 1e-9) {
      filters.push(`atempo=${ATEMPO_MIN.toFixed(1)}`);
      remaining = remaining / ATEMPO_MIN;
    }
    filters.push(`atempo=${remaining.toFixed(4).replace(/\.?0+$/, '')}`);
  }

  return filters.join(',');
}

// ─── Concurrency Limit ────────────────────────────────────────────────────────

/**
 * Thực thi danh sách các task bất đồng bộ với giới hạn song song tối đa `limit`.
 *
 * Không yêu cầu thư viện ngoài (p-limit...) — tự xây dựng bằng semaphore đơn giản.
 *
 * @param tasks Mảng các factory function trả về Promise<T>
 * @param limit Số task được chạy song song tối đa cùng lúc
 * @returns Promise<T[]> — Kết quả theo đúng thứ tự ban đầu (Promise.allSettled semantics)
 */
export async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = currentIndex++;
      if (index >= tasks.length) break;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (err) {
        results[index] = { status: 'rejected', reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Fast Audio Utilities ──────────────────────────────────────────────────────

/**
 * Đọc độ dài file WAV siêu tốc trong RAM bằng cách parse RIFF header (< 0.1ms).
 * Trả về duration tính bằng ms. Nếu không phải WAV hoặc lỗi header, trả về null để fallback sang ffprobe.
 */
export function getWavDurationMsFast(filePath: string): number | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(100);
    const bytesRead = fs.readSync(fd, header, 0, 100, 0);
    fs.closeSync(fd);

    if (bytesRead < 44) return null;
    if (header.toString('utf8', 0, 4) !== 'RIFF' || header.toString('utf8', 8, 12) !== 'WAVE') {
      return null;
    }

    const fmtIdx = header.indexOf('fmt ');
    if (fmtIdx === -1 || fmtIdx + 24 > bytesRead) return null;

    const numChannels = header.readUInt16LE(fmtIdx + 10);
    const sampleRate = header.readUInt32LE(fmtIdx + 12);
    const byteRate = header.readUInt32LE(fmtIdx + 16);

    if (byteRate <= 0) return null;

    const dataIdx = header.indexOf('data');
    let dataSize = 0;
    if (dataIdx !== -1 && dataIdx + 8 <= bytesRead) {
      dataSize = header.readUInt32LE(dataIdx + 4);
    } else {
      const stats = fs.statSync(filePath);
      dataSize = stats.size - 44;
    }

    const durationSec = dataSize / byteRate;
    return Math.round(durationSec * 1000);
  } catch (err) {
    return null;
  }
}

/**
 * Lấy độ dài file audio (ưu tiên đọc WAV RIFF header siêu tốc < 0.1ms, fallback sang ffprobe nếu cần).
 */
export async function getAudioDurationMsSmart(filePath: string): Promise<number> {
  const fastDur = getWavDurationMsFast(filePath);
  if (fastDur !== null) return fastDur;

  try {
    const out = await new Promise<string>((resolve, reject) => {
      exec(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        (error, stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve(stdout.trim());
        }
      );
    });
    const sec = parseFloat(out);
    return isNaN(sec) ? 0 : Math.round(sec * 1000);
  } catch (e) {
    return 0;
  }
}

/**
 * Sinh file WAV silence (khoảng lặng) siêu tốc trực tiếp bằng Node.js Buffer trong RAM (< 1ms),
 * không cần gọi tiến trình ffmpeg.
 */
export function createWavSilenceFileFast(
  outputPath: string,
  durationMs: number,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): void {
  const cleanDur = Math.max(50, Math.round(durationMs));
  const numSamples = Math.floor((cleanDur / 1000) * sampleRate);
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(outputPath, buffer);
}


// ─── Inline Unit Tests ────────────────────────────────────────────────────────
// Chạy: npx ts-node src/lib/audio-sync.ts (chỉ dùng để kiểm tra nhanh, không phải jest)

if (require.main === module) {
  const testCases: [number, string][] = [
    [1.5,  'atempo=1.5'],
    [2.0,  'atempo=2.0'],
    [2.6,  'atempo=2.0,atempo=1.3'],   // 2.0 * 1.3 = 2.6
    [4.0,  'atempo=2.0,atempo=2.0'],   // 2.0 * 2.0 = 4.0
    [0.5,  'atempo=0.5'],
    [0.3,  'atempo=0.5,atempo=0.6'],   // 0.5 * 0.6 = 0.3
  ];

  let passed = 0;
  for (const [ratio, expected] of testCases) {
    const result = getAtempoFilters(ratio);
    // Kiểm tra tích của các hệ số trong chuỗi kết quả có xấp xỉ ratio không
    const product = result.split(',').reduce((acc, f) => {
      const val = parseFloat(f.replace('atempo=', ''));
      return acc * val;
    }, 1);
    const ok = Math.abs(product - ratio) < 0.01;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ratio=${ratio} → "${result}" (tích=${product.toFixed(4)}) expected≈"${expected}"`);
    if (ok) passed++;
  }
  console.log(`\n${passed}/${testCases.length} test cases passed.`);
}
