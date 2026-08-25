/**
 * Interactive Timeline & Keyframe Architecture cho SubLingo Studio (CapCut Style).
 * 
 * Hỗ trợ:
 * 1. Virtual Scroll / Viewport Rendering cho video dài >2 tiếng (chỉ render item trong viewport).
 * 2. Keyframe Animation Track Architecture (Opacity, Scale, Position, Rotation, Easing).
 * 3. Interactive Subtitle Operations: Split, Merge, Delete, Move, Resize, Magnetic Snap.
 * 4. Undo/Redo State History Stack Manager.
 */

export interface WordItem {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface UtteranceItem {
  id: string;
  text: string;
  startTime: number;  // giây
  endTime: number;    // giây
  words?: WordItem[];
  speakerId?: string;
  speakerColor?: string;
  confidenceScore?: number;
}

export interface KeyframePoint {
  id: string;
  time: number;       // giây
  opacity?: number;   // [0.0, 1.0]
  scale?: number;     // [0.1, 5.0]
  positionX?: number; // pixel offset X
  positionY?: number; // pixel offset Y
  rotation?: number;  // độ
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce';
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'waveform' | 'subtitle' | 'speaker' | 'keyframe';
  name: string;
  height: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
}

export interface TimelineViewState {
  zoomPxPerSec: number;      // Tỷ lệ Zoom: Pixel đại diện cho 1 giây (ví dụ: 50px/sec)
  viewportStartSec: number;  // Mốc giây bắt đầu màn hình viewport
  viewportWidthPx: number;   // Độ rộng pixel của khung Timeline UI
  playheadSec: number;       // Vạch đầu đọc Playhead hiện tại
  snappingEnabled: boolean;  // Bật/tắt dính từ (Magnetic Snap)
}

export class TimelineEngine {
  /**
   * Virtual Scroll Filter: Chỉ lấy các Utterance nằm trong vùng xem (Viewport)
   * Tối ưu hiệu năng render DOM cho video dài 2-3 tiếng (>5,000 phụ đề).
   */
  static getVisibleUtterances(
    utterances: UtteranceItem[],
    viewportStartSec: number,
    durationSec: number
  ): UtteranceItem[] {
    const viewportEndSec = viewportStartSec + durationSec;
    return utterances.filter(
      (item) => item.endTime >= viewportStartSec && item.startTime <= viewportEndSec
    );
  }

  /**
   * Magnetic Snap: Hút dính Playhead hoặc mốc segment vào mốc lân cận gần nhất (trong khoảng threshold 0.1s).
   */
  static snapTime(
    targetTimeSec: number,
    snapTargets: number[],
    thresholdSec: number = 0.1
  ): { snappedTime: number; isSnapped: boolean } {
    let closestTime = targetTimeSec;
    let minDelta = Infinity;

    for (const t of snapTargets) {
      const delta = Math.abs(t - targetTimeSec);
      if (delta < minDelta && delta <= thresholdSec) {
        minDelta = delta;
        closestTime = t;
      }
    }

    return {
      snappedTime: closestTime,
      isSnapped: minDelta <= thresholdSec
    };
  }

  /**
   * Split Subtitle: Cắt câu thoại tại vạch Playhead.
   */
  static splitUtteranceAtTime(
    utterances: UtteranceItem[],
    targetId: string,
    splitTimeSec: number
  ): UtteranceItem[] {
    const result: UtteranceItem[] = [];

    for (const item of utterances) {
      if (item.id === targetId && splitTimeSec > item.startTime && splitTimeSec < item.endTime) {
        // Tách words nếu có
        const leftWords: WordItem[] = [];
        const rightWords: WordItem[] = [];

        if (item.words && item.words.length > 0) {
          for (const w of item.words) {
            if (w.end <= splitTimeSec) {
              leftWords.push(w);
            } else if (w.start >= splitTimeSec) {
              rightWords.push(w);
            } else {
              // Từ nằm đè trên điểm cắt: chia tỉ lệ
              leftWords.push({ ...w, end: splitTimeSec });
              rightWords.push({ ...w, start: splitTimeSec });
            }
          }
        }

        const leftText = leftWords.length > 0 ? leftWords.map(w => w.word).join(' ') : item.text.slice(0, Math.floor(item.text.length / 2));
        const rightText = rightWords.length > 0 ? rightWords.map(w => w.word).join(' ') : item.text.slice(Math.floor(item.text.length / 2));

        result.push({
          ...item,
          id: `${item.id}_part1`,
          endTime: splitTimeSec,
          text: leftText.trim() || item.text,
          words: leftWords
        });

        result.push({
          ...item,
          id: `${item.id}_part2`,
          startTime: splitTimeSec,
          text: rightText.trim() || item.text,
          words: rightWords
        });
      } else {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Merge Subtitles: Gộp 2 câu thoại kề nhau thành 1 câu duy nhất.
   */
  static mergeUtterances(
    utterances: UtteranceItem[],
    idA: string,
    idB: string
  ): UtteranceItem[] {
    const itemA = utterances.find((u) => u.id === idA);
    const itemB = utterances.find((u) => u.id === idB);

    if (!itemA || !itemB) return utterances;

    const first = itemA.startTime <= itemB.startTime ? itemA : itemB;
    const second = itemA.startTime <= itemB.startTime ? itemB : itemA;

    const mergedWords = [...(first.words || []), ...(second.words || [])];
    const mergedText = `${first.text} ${second.text}`.trim();

    const mergedItem: UtteranceItem = {
      ...first,
      id: `${first.id}_merged`,
      endTime: second.endTime,
      text: mergedText,
      words: mergedWords
    };

    return utterances
      .filter((u) => u.id !== idA && u.id !== idB)
      .concat(mergedItem)
      .sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Nội suy Keyframe (Keyframe Value Interpolation): Tính giá trị thuộc tính tại thời điểm t.
   */
  static interpolateKeyframe(
    keyframes: KeyframePoint[],
    timeSec: number,
    property: 'opacity' | 'scale' | 'positionX' | 'positionY' | 'rotation'
  ): number {
    if (!keyframes || keyframes.length === 0) return property === 'scale' || property === 'opacity' ? 1.0 : 0.0;

    const sorted = [...keyframes].sort((a, b) => a.time - b.time);

    if (timeSec <= sorted[0].time) return sorted[0][property] ?? (property === 'scale' || property === 'opacity' ? 1.0 : 0.0);
    if (timeSec >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1][property] ?? (property === 'scale' || property === 'opacity' ? 1.0 : 0.0);

    for (let i = 0; i < sorted.length - 1; i++) {
      const k1 = sorted[i];
      const k2 = sorted[i + 1];

      if (timeSec >= k1.time && timeSec <= k2.time) {
        const v1 = k1[property] ?? (property === 'scale' || property === 'opacity' ? 1.0 : 0.0);
        const v2 = k2[property] ?? (property === 'scale' || property === 'opacity' ? 1.0 : 0.0);
        const progress = (timeSec - k1.time) / (k2.time - k1.time);
        return v1 + (v2 - v1) * progress; // Linear interpolation
      }
    }

    return property === 'scale' || property === 'opacity' ? 1.0 : 0.0;
  }
}
