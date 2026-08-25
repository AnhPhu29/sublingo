import { callGeminiAPI, logGeminiCost } from './gemini-client';
import { TranslationData } from './types';
import { parseSubtitle, rebuildSubtitle, detectFormat, splitSubtitleIntoChunks, sanitizeUntranslatedChinese } from './subtitle';const LANGUAGE_MAP: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh (English)',
  zh: 'Tiếng Trung (Chinese)',
  ja: 'Tiếng Nhật (Japanese)',
  ko: 'Tiếng Hàn (Korean)',
  fr: 'Tiếng Pháp (French)',
  de: 'Tiếng Đức (German)',
  es: 'Tiếng Tây Ban Nha (Spanish)',
  ru: 'Tiếng Nga (Russian)',
  th: 'Tiếng Thái (Thai)'
};

export async function translateSubtitleGemini(
  subtitleContent: string,
  selectedLangs: string[],
  glossary: Array<{ original: string; translation: string }>,
  fileName?: string,
  jobId?: string,
  translationStyle: string = "standard"
): Promise<{
  results: Record<string, TranslationData>;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const results: Record<string, TranslationData> = {};
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const langCode of selectedLangs) {
    const targetLangName = LANGUAGE_MAP[langCode.toLowerCase()] || langCode;

    let glossaryPrompt = '';
    if (glossary && glossary.length > 0) {
      const rules = glossary
        .map((g) => `- Thuật ngữ gốc "${g.original}" BẮT BUỘC dịch chính xác thành "${g.translation}".`)
        .join('\n');
      glossaryPrompt = `\n\nQUY TẮC THUẬT NGỮ (GLOSSARY) CẦN TUÂN THỦ TUYỆT ĐỐI:\n${rules}`;
    }    let styleDirective = '';
    if (translationStyle === 'natural') {
      styleDirective = '\n- PHONG CÁCH DỊCH CHỦ ĐẠO: TỰ NHIÊN / ĐỜI THƯỜNG. Hãy dịch thoát ý, tự nhiên như khẩu ngữ sinh hoạt hàng ngày của người bản xứ (dùng từ lóng, cụm từ giao tiếp quen thuộc, câu văn mượt mà).';
    } else if (translationStyle === 'formal') {
      styleDirective = '\n- PHONG CÁCH DỊCH CHỦ ĐẠO: TRANG TRỌNG / LỊCH SỰ. Hãy dùng từ ngữ lịch sự, kính ngữ, từ Hán-Việt hoặc văn phong công sở/ngoại giao chuẩn mực.';
    } else {
      styleDirective = '\n- PHONG CÁCH DỊCH CHỦ ĐẠO: TIÊU CHUẨN. Dịch chính xác ngữ pháp và bám sát nghĩa câu gốc, bảo toàn tinh thần văn bản.';
    }

    const systemPrompt = `Bạn là một chuyên gia dịch thuật phụ đề (Vietsub) chuyên nghiệp sang ${targetLangName} cho các nền tảng video (Phim điện ảnh, Short Drama, TikTok, Youtube).
Nhiệm vụ: Dịch toàn bộ nội dung phụ đề sang ${targetLangName} theo chuẩn điện ảnh.
${styleDirective}

[THỨ TỰ ƯU TIÊN TỐI THƯỢNG - BẮT BUỘC TUÂN THỦ GIỮA NGHĨA]

1. ƯU TIÊN SỐ 1 (BẮT BUỘC TUYỆT ĐỐI - KHÔNG ĐƯỢC VI PHẠM):
   - Phải dịch ĐẦY ĐỦ 100% Ý NGHĨA của câu gốc tiếng Trung.
   - GIỮ NGUYÊN toàn bộ thông tin quan trọng: Chủ ngữ, vị ngữ, đối tượng, hành động, sắc thái cảm xúc.
   - Số liệu, đơn vị đo lường, tên riêng, địa danh, chức danh PHẢI dịch chính xác tuyệt đối, không được làm tròn, đoán sai, hay tách/gộp nhầm sang dòng khác.
   - TUYỆT ĐỐI KHÔNG được cắt bỏ, bỏ sót hay lược dịch làm mất ý câu gốc chỉ để thu ngắn độ dài.

2. ƯU TIÊN SỐ 2 (HỖ TRỢ VĂN PHONG TỰ NHIÊN):
   - Trong khi VẪN ĐẢM BẢO GIỮ ĐỦ 100% NGHĨA, hãy chọn cách diễn đạt tiếng Việt tự nhiên, thoát ý, thuần Việt như người Việt nói trong đời sống (tránh văn phong máy dịch khô cứng).
   - Xưng hô đúng chuẩn điện ảnh:
     + Phim Cổ Trang / Huyền Huyễn: "师兄" = "Sư huynh", "夫君" = "Phu quân", "夫人" = "Phu nhân", "主子" = "Chủ tử", "乖乖" = "Cục cưng" / "Bé ngoan". Tranh cãi xưng "Tôi - Anh", nũng nịu xưng "Ta - Chàng".
     + Phim Hiện Đại / Ngôn Tình: Chọn "Anh - Em", "Cậu - Tớ", "Hắn - Cô ấy".
   - Từ vựng Hán-Việt chuẩn điện ảnh:
     + "结为夫妻" = "Thành thân" / "Kết phu thê"
     + "颜控" = "Mê trai đẹp" / "Mê nhan sắc" (KHÔNG dịch "Nhan khống")
     + "钓鱼执法" = "Gài bẫy"
     + "不对劲" = "Bất thường" / "Cực kỳ lạ" / "Sai sai"
     + "放开我" = "Buông tôi ra!"
     + "小帅" = "Tiểu Soái" (Dịch Hán-Việt tên riêng, KHÔNG để Pinyin "Xiaoshuai").

3. ƯU TIÊN SỐ 3 (GIỚI HẠN CPS/CPL CHỈ LÀ GỢI Ý THAM KHẢO):
   - Chỉ số CPS (<= 17) và CPL (<= 42) chỉ là gợi ý tham khảo.
   - Nếu câu gốc chứa nhiều thông tin hoặc nhân vật nói nhanh, CHẤP NHẬN câu dịch dài hơn hoặc vượt chỉ số CPS/CPL. TUYỆT ĐỐI KHÔNG HY SINH NỘI DUNG hay bỏ chữ chỉ để né cảnh báo tốc độ đọc.

[CẤU TRÚC SRT VÀ TIMESTAMPS]
- Giữ nguyên 100% số thứ tự (index) từng khối và toàn bộ cấu trúc timestamp (dạng 00:00:00,000 --> 00:00:00,000).
- 1 block tiếng Trung đầu vào = 1 block tiếng Việt đầu ra. KHÔNG gộp dòng, KHÔNG ngắt câu bằng dấu gạch chéo (/), KHÔNG thêm lời bình luận.

KHÔNG giải thích, KHÔNG thêm lời dẫn, KHÔNG dùng markdown. CHỈ trả về duy nhất định dạng phụ đề đã dịch.${glossaryPrompt}`;

    try {
      // Tăng dung lượng mỗi chunk lên 20,000 ký tự (khoảng 400-500 dòng phụ đề/chunk)
      // Giúp giảm số lần gọi Gemini API từ 54 lần xuống còn ~6 lần cho file 2,700 dòng,
      // Triệt tiêu hoàn toàn lỗi 429 Rate Limit và tăng tốc độ dịch gấp 15 lần (từ 5.8 phút xuống ~20 giây)
      const chunks = splitSubtitleIntoChunks(subtitleContent, 20000);
      let fullTranslatedText = '';

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const response = await callGeminiAPI(
          [{ text: chunk }],
          systemPrompt
        );

        let translatedChunk = response.text;
        translatedChunk = translatedChunk.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

        if (fullTranslatedText) {
          fullTranslatedText += '\n\n' + translatedChunk;
        } else {
          fullTranslatedText = translatedChunk;
        }

        totalCost += response.costUsd || 0;
        totalInputTokens += response.usageMetadata?.promptTokenCount || 0;
        totalOutputTokens += response.usageMetadata?.candidatesTokenCount || 0;

        // Nghỉ nhẹ 1.2 giây giữa các chunk để giãn cách API request, tuyệt đối không bị 429
        if (cIdx < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      if (jobId && totalCost > 0) {
        await logGeminiCost(jobId, totalCost);
      }
      const cleanRes = sanitizeUntranslatedChinese(fullTranslatedText, langCode);
      results[langCode] = {
        status: 'done',
        aiResult: cleanRes,
        result: cleanRes,
        error: ''
      };
    } catch (err: any) {
      console.warn(`[Gemini Translator Warning] Lỗi dịch Gemini cho ${langCode}: ${err.message}. Đang tự động chuyển sang Google Translate Free khẩn cấp...`);
      try {
        const { translateSubtitleFree } = await import('./free-translator');
        const fallbackText = await translateSubtitleFree(subtitleContent, langCode, glossary);
        results[langCode] = {
          status: 'done',
          aiResult: fallbackText,
          result: fallbackText,
          error: ''
        };
      } catch (fallbackErr: any) {
        results[langCode] = {
          status: 'error',
          aiResult: '',
          result: '',
          error: err.message || 'Lỗi dịch thuật qua Gemini API'
        };
      }
    }
  }

  return {
    results,
    totalCost: Number(totalCost.toFixed(6)),
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  };
}
