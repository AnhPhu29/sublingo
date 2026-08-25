import * as fs from 'fs';
import * as path from 'path';
import { callGeminiAPI, logGeminiCost } from './gemini-client';

/**
 * Nhận diện giọng nói âm thanh (STT) sang phụ đề SRT qua Gemini Multimodal API
 */
export async function transcribeAudioGemini(
  audioPath: string,
  sourceLanguage: string = 'auto',
  jobId?: string
): Promise<{
  srtContent: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`File âm thanh không tồn tại: ${audioPath}`);
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const base64Audio = audioBuffer.toString('base64');

  const ext = path.extname(audioPath).toLowerCase().replace('.', '');
  let mimeType = 'audio/wav';
  if (ext === 'mp3') mimeType = 'audio/mp3';
  else if (ext === 'm4a' || ext === 'aac') mimeType = 'audio/aac';
  else if (ext === 'ogg') mimeType = 'audio/ogg';

  const langInstruction = sourceLanguage && sourceLanguage !== 'auto'
    ? `Ngôn ngữ giọng nói trong file là ${sourceLanguage}.`
    : 'Hãy tự nhận diện ngôn ngữ nói trong file âm thanh.';

  const systemInstruction = `Bạn là chuyên gia chuyển đổi giọng nói thành phụ đề (Speech-To-Text Subtitle Transcriber).
Nhiệm vụ: Lắng nghe kĩ âm thanh từ giây đầu tiên (0:00) và trích xuất TOÀN BỘ lời thoại thành định dạng phụ đề chuẩn SRT.

QUY TẮC BẮT BUỘC (TUÂN THỦ TUYỆT ĐỐI):
1. BẮT TRỌN LỜI MỞ ĐẦU & TỪ CẢM THÁN:
   - Chú ý nghe kĩ ngay từ mốc 0:00 (đặc biệt là câu thoại drama/phim ngắn mở đầu cực nhanh).
   - Giữ lại 100% các từ cảm thán, tiếng thốt, tiếng mắng (ví dụ: "Á!", "Trời ơi!", "啊！", "神经病！").
2. ĐỒNG BỘ THỜI GIAN & TÁCH CÂU CHUẨN CAPCUT:
   - Mốc thời gian (00:00:00,000 --> 00:00:00,000) PHẢI KHỚP CHÍNH XÁC tính bằng miligiây với lúc người nói cất giọng và dừng giọng.
   - Mỗi dòng phụ đề tiếng Trung chỉ dài 6 - 12 ký tự chữ Hán (thời lượng 1.0 đến 2.0 giây/dòng). Tách riêng từng vế câu theo nhịp nói thật, tạo ra khoảng 40 - 45 dòng phụ đề cho 90-100 giây âm thanh. KHÔNG gộp 2-3 vế câu dài vào 1 dòng.
3. CHÍNH XÁC NGHĨA & TỪ NGỮ:
   - ${langInstruction}
   - Đảm bảo ghi lại đúng 100% từ ngữ người nói (đặc biệt các danh từ xưng hô drama như 夫君, 师兄, 颜控, 钓鱼执法, 成规), không tự ý suy đoán hay dịch chệch âm (tránh viết nhầm thành 五劫 hay 楚乖乖).
4. Trả về DUY NHẤT nội dung định dạng SRT chuẩn, không thêm lời dẫn, không bọc trong dấu markdown \`\`\`.`;

  const promptText = `Hãy nghe file âm thanh này và tạo file phụ đề SRT hoàn chỉnh với mốc thời gian timestamp chính xác.`;

  const response = await callGeminiAPI(
    [
      { text: promptText },
      { inlineData: { mimeType, data: base64Audio } }
    ],
    systemInstruction
  );

  let srtContent = response.text;
  srtContent = srtContent.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

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
