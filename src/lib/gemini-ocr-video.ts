import * as fs from 'fs';
import { callGeminiAPI, logGeminiCost, GeminiPart } from './gemini-client';
import { normalizeSrtSyntax } from './subtitle';

/**
 * Trích xuất phụ đề in cứng từ chuỗi khung hình video qua Gemini Multimodal API
 */
export async function ocrVideoGemini(
  framePaths: string[],
  sourceLanguage: string = 'auto',
  jobId?: string
): Promise<{
  srtContent: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}> {
  if (!framePaths || framePaths.length === 0) {
    throw new Error('Không có khung hình video để trích xuất OCR.');
  }

  const parts: GeminiPart[] = [
    {
      text: `Dưới đây là ${framePaths.length} khung hình mẫu được trích xuất từ video (theo thứ tự thời gian). Hãy đọc toàn bộ chữ phụ đề in cứng xuất hiện trong các khung hình này và ghép thành file phụ đề SRT hoàn chỉnh với mốc thời gian timestamp (dạng 00:00:00,000 --> 00:00:00,000).`
    }
  ];

  // Đọc tối đa 15-20 frames để không làm quá tải payload Gemini REST API
  const maxFrames = Math.min(framePaths.length, 20);
  const step = Math.max(1, Math.floor(framePaths.length / maxFrames));

  for (let i = 0; i < framePaths.length && parts.length <= maxFrames + 1; i += step) {
    const fp = framePaths[i];
    if (fs.existsSync(fp)) {
      const buffer = fs.readFileSync(fp);
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: buffer.toString('base64')
        }
      });
    }
  }

  const langInstruction = sourceLanguage && sourceLanguage !== 'auto'
    ? `Chữ phụ đề gốc là tiếng ${sourceLanguage}.`
    : 'Hãy tự nhận diện ngôn ngữ của chữ phụ đề gốc.';

  const systemInstruction = `Bạn là một chuyên gia OCR phụ đề phim (Video Subtitle OCR Specialist).
Nhiệm vụ: Phân tích các khung hình video và đọc chính xác chữ phụ đề in cứng.

QUY TẮC BẮT BUỘC:
1. ${langInstruction}
2. Loại bỏ các chữ logo, watermark tĩnh không phải lời thoại.
3. Ghép các dòng thoại trùng khớp ở nhiều khung hình liên tiếp thành 1 khối phụ đề duy nhất với thời lượng bắt đầu từ khung đầu tiên và kết thúc ở khung cuối cùng xuất hiện chữ đó.
4. Trả về DUY NHẤT định dạng phụ đề SRT chuẩn (00:00:00,000 --> 00:00:00,000), không thêm lời dẫn, không bọc dấu markdown \`\`\`.`;

  const response = await callGeminiAPI(parts, systemInstruction);

  let srtContent = response.text;
  srtContent = srtContent.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  srtContent = normalizeSrtSyntax(srtContent);

  if (jobId) {
    await logGeminiCost(jobId, response.costUsd);
  }

  return {
    srtContent,
    costUsd: response.costUsd,
    inputTokens: response.usageMetadata.promptTokenCount,
    outputTokens: response.usageMetadata.candidatesTokenCount
  };
}
