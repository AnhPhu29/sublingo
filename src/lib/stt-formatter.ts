import { normalizeSrtSyntax } from './subtitle';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface UtteranceInput {
  text: string;
  startTime: number;
  endTime: number;
  words?: WordTiming[];
}

export interface SttFormatOptions {
  maxCpl?: number; // Characters per line
  maxLinesPerBlock?: number; // Max lines per subtitle cue (default 1 for CJK / short video)
  pauseThresholdSec?: number; // Natural pause threshold between words (default 0.20s)
}

function formatTimeSrt(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Thuật toán chia phụ đề cấp từ (Word-level Subtitle Builder)
 * Gom nhóm và chia dòng phụ đề cực kỳ mịn màng và ngắn gọn theo đúng nhịp CapCut.
 */
export function formatWordsToSmartSrt(
  utterances: UtteranceInput[],
  options: SttFormatOptions = {}
): string {
  const allWords: WordTiming[] = [];
  for (const utt of utterances) {
    if (utt.words && utt.words.length > 0) {
      allWords.push(...utt.words);
    }
  }

  if (allWords.length === 0) return '';

  // Sắp xếp các từ theo thứ tự thời gian tăng dần
  allWords.sort((a, b) => a.start - b.start);

  const maxCpl = options.maxCpl || 42; 
  const pauseThreshold = options.pauseThresholdSec || 0.25; 
  const maxDuration = 3.0; // Giới hạn thời lượng mỗi dòng tối đa 3.0s

  const blocks: Array<{ start: number; end: number; text: string }> = [];
  let currentBlockWords: WordTiming[] = [];
  let currentBlockText = "";

  const isCjkChar = (char: string) => {
    const code = char.charCodeAt(0);
    return code >= 0x4e00 && code <= 0x9fff;
  };

  const getLanguageType = (text: string): "cjk" | "alphabet" => {
    let cjkCount = 0;
    const clean = text.replace(/\s+/g, "");
    if (!clean.length) return "alphabet";
    for (let i = 0; i < clean.length; i++) {
      if (isCjkChar(clean[i])) cjkCount++;
    }
    return cjkCount / clean.length > 0.3 ? "cjk" : "alphabet";
  };

  const finalizeBlock = () => {
    if (currentBlockWords.length === 0) return;
    const start = currentBlockWords[0].start;
    let end = currentBlockWords[currentBlockWords.length - 1].end;
    
    if (end - start < 0.4) {
      end = Number((start + 0.4).toFixed(3));
    }

    blocks.push({
      start,
      end,
      text: currentBlockText.trim()
    });

    currentBlockWords = [];
    currentBlockText = "";
  };

  for (let i = 0; i < allWords.length; i++) {
    const w = allWords[i];
    const wordText = w.word.trim();
    if (!wordText) continue;

    if (currentBlockWords.length === 0) {
      currentBlockWords.push(w);
      currentBlockText = wordText;
      continue;
    }

    const prevW = currentBlockWords[currentBlockWords.length - 1];
    const isCjk = getLanguageType(currentBlockText + wordText) === "cjk";
    const limitCpl = isCjk ? 14 : maxCpl; // CJK giới hạn 14 ký tự (nhỏ hơn 16 để chia dòng rất thoáng)

    const futureText = currentBlockText + (isCjk ? "" : " ") + wordText;
    const duration = w.end - currentBlockWords[0].start;
    const gap = w.start - prevW.end;

    // Ngắt dòng nếu từ trước kết thúc bằng các dấu câu ngắt hơi
    const hasPunctuation = /[。？！，、.?!,]/.test(prevW.word);

    if (
      futureText.length > limitCpl ||
      gap > pauseThreshold ||
      duration > maxDuration ||
      hasPunctuation
    ) {
      finalizeBlock();
      currentBlockWords.push(w);
      currentBlockText = wordText;
    } else {
      currentBlockWords.push(w);
      currentBlockText += (isCjk ? "" : " ") + wordText;
    }
  }

  finalizeBlock();

  // Chống đè dòng (Overlap Protection)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const nextB = blocks[i + 1];
    if (nextB && b.end > nextB.start) {
      b.end = nextB.start;
    }
  }

  const rawSrt = blocks.map((b, idx) => {
    return `${idx + 1}\n${formatTimeSrt(b.start)} --> ${formatTimeSrt(b.end)}\n${b.text}`;
  }).join('\n\n');

  return normalizeSrtSyntax(rawSrt);
}

/**
 * Tự động chuyển đổi các phân đoạn giọng nói (Whisper VAD Speech Segments)
 * thành định dạng phụ đề SRT chuẩn 100% theo nhịp CapCut.
 * Rẽ nhánh sang Word-level splitting nếu có dữ liệu word timestamps.
 */
export function formatUtterancesToSmartSrt(
  utterances: UtteranceInput[],
  options: SttFormatOptions = {}
): string {
  if (!utterances || utterances.length === 0) return '';

  // Rẽ nhánh sang thuật toán Word-level nếu bất kỳ utterance nào có chứa danh sách từ (words)
  const hasWordTimestamps = utterances.some(u => u.words && u.words.length > 0);
  if (hasWordTimestamps) {
    const wordSrt = formatWordsToSmartSrt(utterances, options);
    if (wordSrt) return wordSrt;
  }

  const blocks: Array<{ start: number; end: number; text: string }> = [];

  for (let i = 0; i < utterances.length; i++) {
    const utt = utterances[i];
    const cleanText = utt.text.trim();
    if (!cleanText) continue;

    // Đảm bảo thời lượng tối thiểu 0.4s cho các phân đoạn quá ngắn (tránh CPS vọt quá cao)
    let endSec = utt.endTime;
    if (endSec - utt.startTime < 0.4) {
      endSec = Number((utt.startTime + 0.4).toFixed(3));
    }

    // Đảm bảo không đè lên câu thoại kế tiếp (Overlap Protection)
    const nextUtt = utterances[i + 1];
    if (nextUtt && nextUtt.startTime > utt.startTime && endSec > nextUtt.startTime) {
      endSec = Number(nextUtt.startTime.toFixed(3));
    }

    if (endSec <= utt.startTime) {
      endSec = Number((utt.startTime + 0.4).toFixed(3));
    }

    blocks.push({
      start: utt.startTime,
      end: endSec,
      text: cleanText
    });
  }

  // Chống đè và đảm bảo thời gian tăng dần giữa các khối
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].end > blocks[i + 1].start && blocks[i + 1].start > blocks[i].start) {
      blocks[i].end = blocks[i + 1].start;
    }
    if (blocks[i].end <= blocks[i].start) {
      blocks[i].end = Number((blocks[i].start + 0.4).toFixed(3));
    }
  }

  const rawSrt = blocks.map((b, idx) => {
    return `${idx + 1}\n${formatTimeSrt(b.start)} --> ${formatTimeSrt(b.end)}\n${b.text}`;
  }).join('\n\n');

  return normalizeSrtSyntax(rawSrt);
}
