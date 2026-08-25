// Cấu hình khoảng thời gian lấy mẫu khung hình (seconds) khi OCR video
// Lấy mẫu thưa giúp tiết kiệm chi phí API, lấy mẫu dày tăng độ chính xác
export const FRAME_INTERVAL_SECONDS = 1;

// ─── Hằng số Lồng tiếng (Dubbing) ────────────────────────────────────────────
/** Tốc độ đọc tự nhiên tối đa — vượt ngưỡng này sẽ kích hoạt logic tràn/rút ngắn */
export const MAX_NATURAL_TEMPO = 1.4;
/** Số dòng thoại TTS gọi song song tối đa cùng lúc (tránh bị rate limit API) */
export const TTS_CONCURRENCY_LIMIT = 3;

// ─── Bảng giá API ─────────────────────────────────────────────────────────────
// Bảng giá thật của các nhà cung cấp dịch vụ API (Đơn giá USD)
export const PRICING = {
  anthropic: {
    inputCostPerMillion: 3.00,   // $3.00 trên 1,000,000 input tokens
    outputCostPerMillion: 15.00  // $15.00 trên 1,000,000 output tokens
  },
  openai: {
    whisperPerMinute: 0.006,     // $0.006 trên 1 phút audio transcription
    ttsStandardPer1K: 0.015,     // $0.015 trên 1,000 ký tự (OpenAI TTS standard)
    ttsHdPer1K: 0.030,           // $0.030 trên 1,000 ký tự (OpenAI TTS HD)
  },
  vbee: {
    // ⚠️ PLACEHOLDER: đơn giá này là ước lượng, CHƯA xác nhận với bảng giá thật
    // tại studio.vbee.vn. Cần cập nhật lại giá trị chính xác trước khi tin tưởng
    // số liệu chi phí hiển thị ở trang "Chi phí".
    sttPerMinute: 0.04,          // ~$1,000 VND trên 1 phút audio transcription
    ttsPer1K: 0.80,              // ~$20,000 VND trên 1,000 ký tự (tương đương 20 VND/ký tự)
  }
};

// ─── Hàm tính chi phí ─────────────────────────────────────────────────────────

/**
 * Tính toán chi phí tiết kiệm ước tính (nhờ dùng Local Ollama/Tesseract thay vì Claude/API)
 * @param inputTokens Số lượng token đầu vào (bao gồm cả token hình ảnh OCR)
 * @param outputTokens Số lượng token đầu ra
 * @returns Chi phí USD tiết kiệm ước tính (saved)
 */
export function calculateLocalCostSaved(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.anthropic.inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * PRICING.anthropic.outputCostPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Tính toán chi phí ước tính cho Vbee STT
 * @param durationSeconds Độ dài của file âm thanh tính bằng giây
 * @returns Chi phí USD ước tính (estimated)
 */
export function calculateVbeeSttCost(durationSeconds: number): number {
  const durationMinutes = durationSeconds / 60;
  const cost = durationMinutes * PRICING.vbee.sttPerMinute;
  return Number(cost.toFixed(6));
}

/**
 * Tính toán chi phí ước tính cho Vbee TTS.
 * Tính theo công thức: (số ký tự / 1000) * đơn giá gốc * credit_factor của giọng.
 *
 * @param charCount Tổng số ký tự văn bản cần đọc
 * @param creditFactor Hệ số tính phí của giọng đọc cụ thể (mặc định 1.0)
 * @returns Chi phí USD ước tính (estimated)
 */
export function calculateVbeeTtsCost(charCount: number, creditFactor = 1.0): number {
  const cost = (charCount / 1000) * PRICING.vbee.ttsPer1K * creditFactor;
  return Number(cost.toFixed(6));
}

/**
 * Tính toán chi phí ước tính cho OpenAI Whisper STT (phòng hờ fallback)
 */
export function calculateWhisperCost(durationSeconds: number): number {
  const durationMinutes = durationSeconds / 60;
  const cost = durationMinutes * PRICING.openai.whisperPerMinute;
  return Number(cost.toFixed(6));
}

/**
 * Tính toán chi phí ước tính cho TTS (phòng hờ fallback)
 */
export function calculateTtsCost(provider: string, charCount: number): number {
  const per1K = provider === 'openai-tts-hd'
    ? PRICING.openai.ttsHdPer1K
    : PRICING.openai.ttsStandardPer1K;
  const cost = (charCount / 1000) * per1K;
  return Number(cost.toFixed(6));
}
