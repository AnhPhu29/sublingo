import { prisma } from './prisma';

export interface GeminiResponse {
  text: string;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  costUsd: number;
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

// Bảng giá Gemini 3 Flash / 1.5 Flash (USD per 1M tokens)
const GEMINI_PRICING = {
  inputPerMillion: 0.075,
  outputPerMillion: 0.30
};

let lastCallTimestamp = 0;

function isMultimodalModel(modelName: string): boolean {
  const m = modelName.toLowerCase();
  return (m.startsWith('gemini-') || m.includes('flash') || m.includes('pro')) &&
    !m.includes('gemma') &&
    !m.includes('embedding') &&
    !m.includes('imagen') &&
    !m.includes('veo') &&
    !m.includes('tts');
}

/**
 * Hàm gọi Gemini REST API trực tiếp với Rate Limiting và Exponential Backoff 429 Retry
 */
export async function callGeminiAPI(
  parts: GeminiPart[],
  systemInstruction?: string,
  overrideModel?: string
): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'Chưa cấu hình GEMINI_API_KEY trong file .env!\n' +
      'Vui lòng đăng ký lấy API Key miễn phí tại: https://aistudio.google.com/api-keys và thêm vào .env'
    );
  }

  const hasMultimodalPayload = parts.some(p => !!p.inlineData);
  let envModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  
  if (hasMultimodalPayload && !isMultimodalModel(envModel)) {
    envModel = 'gemini-2.0-flash';
  } else if (!isMultimodalModel(envModel)) {
    envModel = 'gemini-2.0-flash';
  }

  const model = overrideModel || envModel;
  const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES || '4', 10);
  const rateLimitRpm = parseInt(process.env.GEMINI_RATE_LIMIT_RPM || '10', 10);
  const baseDelayMs = parseInt(process.env.GEMINI_RETRY_BASE_DELAY_MS || '2000', 10);

  // 1. Rate Limiting giữa các lần gọi liên tiếp
  const minIntervalMs = Math.ceil(60000 / rateLimitRpm);
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTimestamp;
  if (timeSinceLastCall < minIntervalMs) {
    const waitTime = minIntervalMs - timeSinceLastCall;
    await new Promise((r) => setTimeout(r, waitTime));
  }
  lastCallTimestamp = Date.now();

  let currentModel = model;
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 429 || response.status === 503) {
        attempt++;
        if (attempt > maxRetries) {
          throw new Error(`Gemini API vượt quá giới hạn lượt gọi (429 Rate Limit Exceeded). Đã thử lại ${maxRetries} lần thất bại.`);
        }

        // Tự động chuyển model sang gemini-2.0-flash (RPM cao hơn 15x) nếu model hiện tại là pro hoặc dính 429
        if (currentModel.includes('pro') || currentModel !== 'gemini-2.0-flash') {
          console.warn(`[Gemini Auto-Switch] Phát hiện 429 Rate Limit ở model ${currentModel}. Tự động chuyển sang model siêu tốc 'gemini-2.0-flash'...`);
          currentModel = 'gemini-2.0-flash';
          url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        }

        const backoffMs = Math.min(3000, baseDelayMs * Math.pow(1.5, attempt - 1));
        console.warn(`[Gemini API] Bị 429 Rate Limit. Đang tự động chờ ${Math.round(backoffMs)}ms (Thử lại ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lỗi gọi Gemini API (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const resultText = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';

      const usage = data.usageMetadata || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0
      };

      const promptTokens = usage.promptTokenCount || 0;
      const responseTokens = usage.candidatesTokenCount || 0;

      const inputCost = (promptTokens / 1_000_000) * GEMINI_PRICING.inputPerMillion;
      const outputCost = (responseTokens / 1_000_000) * GEMINI_PRICING.outputPerMillion;
      const costUsd = Number((inputCost + outputCost).toFixed(6));

      return {
        text: resultText.trim(),
        usageMetadata: usage,
        costUsd
      };
    } catch (err: any) {
      if (err.name === 'FetchError' || err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
        throw new Error('Không thể kết nối tới máy chủ Gemini API — Vui lòng kiểm tra lại kết nối mạng internet của bạn.');
      }
      if (attempt >= maxRetries) {
        throw err;
      }
      attempt++;
      const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[Gemini API Error] ${err.message}. Thử lại ${attempt}/${maxRetries} sau ${backoffMs}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw new Error('Không thể hoàn thành yêu cầu tới Gemini API.');
}

/**
 * Ghi nhận CostLog cho Gemini API
 */
export async function logGeminiCost(jobId: string, costUsd: number): Promise<void> {
  try {
    await prisma.costLog.create({
      data: {
        jobId,
        provider: 'gemini',
        amountUsd: costUsd,
        costType: 'actual'
      }
    });
  } catch (err) {
    console.warn('[Gemini CostLog] Failed to write CostLog:', err);
  }
}
