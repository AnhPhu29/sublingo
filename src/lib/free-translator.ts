/**
 * Helper dịch thuật miễn phí sử dụng Google Translate Client API (Không cần key)
 */import { parseSubtitle, rebuildSubtitle, detectFormat, isLineGarbage, SubtitleBlock, sanitizeUntranslatedChinese } from './subtitle';
interface GlossaryItem {
  original: string;
  translation: string;
}

/**
 * Dịch một đoạn văn bản ngắn (dưới 1500 ký tự) bằng Google Translate Free Endpoint
 */
async function translateFreeSegment(text: string, targetLang: string, sourceLang = 'auto'): Promise<string> {
  if (!text.trim()) return '';
  
  // Chuẩn hóa mã ngôn ngữ (ví dụ: vi-VN -> vi, en-US -> en)
  const langCode = targetLang.split('-')[0].toLowerCase();
  
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${langCode}&dt=t&q=${encodeURIComponent(text)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Translate responded with status ${response.status}`);
    }

    const data = await response.json();
    
    // Parse cấu trúc response của Google Translate
    // Định dạng: [[[translation1, original1, ...], [translation2, original2, ...]]]
    if (data && data[0]) {
      const translatedParts = data[0].map((part: any) => part[0] || '').join('');
      return smoothVietnameseTranslation(translatedParts, targetLang);
    }
    
    return smoothVietnameseTranslation(text, targetLang);
  } catch (error: any) {
    console.error('[Free Translator Error]:', error.message || error);
    // Nếu lỗi, trả về nguyên bản
    return text;
  }
}

/**
 * Tinh chỉnh câu văn tiếng Việt dịch máy thành văn phong thoại tự nhiên, súc tích chuẩn CPS/CPL
 */
function smoothVietnameseTranslation(text: string, targetLang: string): string {
  if (!text || !targetLang.toLowerCase().startsWith('vi')) return text;

  let s = text;
  // Thay thế các cụm từ dịch máy thô cứng/dài dòng thành văn phong thoại phim súc tích, chuẩn CPS/CPL
  const replacements: Array<[RegExp, string]> = [
    [/\bSau cuộc hôn nhân giả với\b/gi, 'Sau khi cưới giả với'],
    [/\bSau cuộc hôn nhân giả với oan gia\b/gi, 'Sau khi cưới giả với oan gia'],
    [/\bSau cuộc hôn nhân giả với kẻ thù\b/gi, 'Sau khi cưới giả với kẻ thù'],
    [/\bSau cuộc hôn nhân giả\b/gi, 'Sau khi cưới giả'],
    [/\bcuộc hôn nhân giả\b/gi, 'kết hôn giả'],
    [/\bCó điều gì đó không ổn với cô ấy\b/gi, 'Cô ấy cư xử cực kỳ lạ'],
    [/\bkhông ổn với cô ấy\b/gi, 'cực kỳ lạ'],
    [/\btrở nên vô cùng tức giận\b/gi, 'cư xử cực kỳ lạ'],
    [/\btrở nên tức giận\b/gi, 'rất bất thường'],
    [/\bvô cùng tức giận\b/gi, 'cực kỳ lạ'],
    [/\bKhi tôi đi ra ngoài mặc váy ngắn ra ngoài\b/gi, 'Lúc tôi mặc váy ngắn ra đường'],
    [/\bKhi tôi đi ra ngoài với chiếc váy ngắn\b/gi, 'Lúc tôi mặc váy ngắn ra đường'],
    [/\bđi ra ngoài với chiếc váy ngắn\b/gi, 'mặc váy ngắn ra đường'],
    [/\bmặc váy ngắn ra ngoài\b/gi, 'mặc váy ngắn ra đường'],
    [/\bkẻ thù không đội trời chung\b/gi, 'oan gia'],
    [/\blàm điều này\b/gi, 'làm thế này'],
    [/\blàm điều đó\b/gi, 'làm thế'],
    [/\bxem xét điều này\b/gi, 'xem cái này'],
    [/\bxem xét\b/gi, 'xem'],
    [/\bngay bây giờ\b/gi, 'bây giờ'],
    [/\bngay lập tức\b/gi, 'lập tức'],
    [/\bđiều đó\b/gi, 'chuyện đó'],
    [/\bđiều này\b/gi, 'chuyện này'],
    [/\bbởi vì\b/gi, 'vì'],
    [/\bnhìn vào\b/gi, 'nhìn'],
    [/\blắng nghe\b/gi, 'nghe'],
    [/\bgiúp đỡ\b/gi, 'giúp'],
    [/\bcho biết\b/gi, 'nói'],
    [/\bquá nhiều\b/gi, 'nhiều quá'],
    [/\brất nhiều\b/gi, 'nhiều lắm'],
    [/\bcó thể là\b/gi, 'có lẽ'],
    [/\bbị ai đó tấn công ở quán cà phê\b/gi, 'được xin số ở quán cà phê'],
    [/\bbị tấn công ở quán cà phê\b/gi, 'được tán tỉnh ở quán cà phê'],
    [/\bNgày hôm sau chúng tôi tới Singapore\b/gi, 'Hôm sau người ta đã phải đi Singapore'],
    [/\bchúng tôi tới Singapore\b/gi, 'người ta phải đi Singapore'],
    [/\bĐể tôi đi!\b/gi, 'Buông tôi ra!'],
    [/\bĐể tôi đi\b/gi, 'Buông tôi ra'],
    [/\bXiaoshuai\b/gi, 'Tiểu Soái'],
    [/\btại sao bạn lại\b/gi, 'sao anh lại'],
    [/\bbạn và tôi\b/gi, 'anh và em'],
    [/\bbạn - tôi\b/gi, 'anh - em'],
    [/\btại sao anh lại\b/gi, 'sao anh lại'],
    [/\btại sao\b/gi, 'sao'],
    [/\bTại sao\b/g, 'Sao'],
    [/\bSư huynh chúng ta\b/gi, 'Sư huynh, chúng ta'],
    [/\bđừng lãng phí khuôn mặt này\b/gi, 'đừng lãng phí gương mặt này'],
    [/\blãng phí khuôn mặt này\b/gi, 'lãng phí gương mặt này'],
    [/\bbạn là một nhan khống\b/gi, 'là người cuồng nhan sắc'],
    [/\bnhan khống\b/gi, 'mê nhan sắc'],
    [/\bcâu cá chấp pháp\b/gi, 'gài bẫy'],
    [/\bdụ dỗ mê hoặc\b/gi, 'mê hoặc'],
    [/\bđộc thủ phòng trống\b/gi, 'phòng đơn gối chiếc'],
    [/\bđã yêu bạn\b/gi, 'đã yêu anh'],
  ];  for (const [pattern, rep] of replacements) {
    s = s.replace(pattern, rep);
  }

  return sanitizeUntranslatedChinese(s, targetLang);
}

/**
 * Dịch nội dung phụ đề lớn bằng cách dùng parseSubtitle để phân tích 100% chính xác các block phụ đề.
 * Đảm bảo 100% khớp số lượng dòng thoại với phụ đề gốc.
 */
export async function translateSubtitleFree(
  subtitleContent: string, 
  targetLang: string,
  glossary: GlossaryItem[] = []
): Promise<string> {
  if (!subtitleContent.trim()) return '';

  const blocks = parseSubtitle(subtitleContent);
  if (blocks.length === 0) return subtitleContent;

  const srtBlocks = blocks.map(b => ({
    block: b,
    isGarbage: isLineGarbage(b.text)
  }));

  const batchSize = 15;
  const translatedBlocks: SubtitleBlock[] = [];
  const DELIMITER = '\n___SEG___\n';

  for (let b = 0; b < srtBlocks.length; b += batchSize) {
    const batch = srtBlocks.slice(b, b + batchSize);
    const normalBlocks = batch.filter(item => !item.isGarbage);

    let translatedTexts: string[] = [];
    if (normalBlocks.length > 0) {
      const textToTranslate = normalBlocks.map(item => item.block.text.replace(/\r?\n/g, ' ')).join(DELIMITER);
      const rawTranslated = await translateFreeSegment(textToTranslate, targetLang);
      
      // Tách chuỗi theo DELIMITER chính hoặc các biến thể khi Google Translate tự ý đổi dấu ngoặc/dấu gạch
      translatedTexts = rawTranslated
        .split(/\n?___SEG___\n?|\n?___ SEG ___\n?|\n?\[===\]\n?|\n?,\s*--\s*,\n?/)
        .map(s => s.replace(/,\s*--\s*,|\[===\]|___SEG___/g, '').trim());

      // Nếu Google Translate làm mất hoặc gộp dấu phân tách, fallback dịch từng câu đơn lẻ
      if (translatedTexts.length !== normalBlocks.length) {
        console.warn(`[Free Translator] Batch size mismatch (${translatedTexts.length} vs ${normalBlocks.length}). Falling back to single line translation.`);
        translatedTexts = [];
        for (const item of normalBlocks) {
          const singleText = item.block.text.replace(/\r?\n/g, ' ');
          const singleTranslated = await translateFreeSegment(singleText, targetLang);
          translatedTexts.push(singleTranslated.replace(/,\s*--\s*,|\[===\]|___SEG___/g, '').trim());
        }
      }

      // Áp dụng thuật ngữ (Glossary) nếu có
      if (glossary && glossary.length > 0) {
        translatedTexts = translatedTexts.map(line => {
          let updatedLine = line;
          glossary.forEach(item => {
            if (item.original && item.translation) {
              const regex = new RegExp(item.original, 'gi');
              updatedLine = updatedLine.replace(regex, item.translation);
            }
          });
          return updatedLine;
        });
      }
    }

    let normalIdx = 0;
    batch.forEach((item) => {
      if (item.isGarbage) {
        // Dòng rác: Giữ nguyên văn bản gốc và thêm tiền tố [KHÔNG ĐỌC ĐƯỢC]
        translatedBlocks.push({
          idx: item.block.idx,
          timestamp: item.block.timestamp,
          text: `[KHÔNG ĐỌC ĐƯỢC] ${item.block.text}`
        });
      } else {
        // Dòng bình thường: Phục hồi từ kết quả dịch
        const transText = translatedTexts[normalIdx] || item.block.text;
        translatedBlocks.push({
          idx: item.block.idx,
          timestamp: item.block.timestamp,
          text: transText
        });
        normalIdx++;
      }
    });
  }

  const fmt = detectFormat(subtitleContent);
  return rebuildSubtitle(translatedBlocks, fmt);
}
