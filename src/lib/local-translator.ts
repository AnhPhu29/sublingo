import { splitSubtitleIntoChunks, sanitizeUntranslatedChinese } from "./subtitle";interface GlossaryItem {
  term: string;
  translation: string;
}

/**
 * Dịch nội dung phụ đề sử dụng Local Ollama API (thông qua Python service)
 */
export async function translateSubtitleLocal(
  subtitleContent: string,
  targetLang: string,
  glossary: GlossaryItem[] = [],
): Promise<{ result: string; inputTokens: number; outputTokens: number }> {
  const LANGUAGE_MAP: Record<string, string> = {
    vi: "Tiếng Việt",
    en: "English",
    ja: "Tiếng Nhật (日本語)",
    ko: "Tiếng Hàn (한국어)",
    zh: "Tiếng Trung (中文)",
    fr: "Tiếng Pháp (Français)",
    es: "Tiếng Tây Ban Nha (Español)",
    de: "Tiếng Đức (Deutsch)",
    pt: "Tiếng Bồ Đào Nha (Português)",
    ru: "Tiếng Nga (Русский)",
    th: "Tiếng Thái (ภาษาไทย)",
    id: "Tiếng Indonesia (Bahasa Indonesia)",
  };
  const targetLangLabel =
    LANGUAGE_MAP[targetLang.split("-")[0].toLowerCase()] || targetLang;

  // Chia nhỏ phụ đề thành các chunk để không vượt quá giới hạn token sinh ra của AI (tối đa ~35-40 block/chunk)
  const chunks = splitSubtitleIntoChunks(subtitleContent, 2500);
  let resultSrt = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const pythonServiceUrl =
    process.env.PYTHON_AI_SERVICE_URL || "http://localhost:8000";

  // use fetchWithRetry to handle transient python service outages
  const { fetchWithRetry } = await import("./fetchWithRetry");
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(
      `[Local Translator] Đang dịch chunk ${i + 1}/${chunks.length} sang ${targetLangLabel}...`,
    );

    try {
      const response = await fetchWithRetry(
        `${pythonServiceUrl}/translate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subtitleContent: chunk,
            targetLang,
            glossary: glossary.map((g) => ({
              term: g.term,
              translation: g.translation,
            })),
          }),
        },
        2,
        [5000, 15000],
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Dịch vụ Local AI lỗi (${response.status}): ${errorText}`,
        );
      }

      const data = await response.json();
      resultSrt += (resultSrt ? "\n\n" : "") + data.result;
      totalInputTokens += data.input_tokens || 0;
      totalOutputTokens += data.output_tokens || 0;
    } catch (err: any) {
      if (
        err.code === "ECONNREFUSED" ||
        err.message?.includes("fetch failed")
      ) {
        throw new Error(
          "Không kết nối được tới AI service local. Hãy chắc chắn đã chạy `npm run dev:all` " +
            "(hoặc khởi động Python service riêng bằng `uvicorn app.main:app --port 8000`).",
        );
      }
      throw err;
    }
  }

  return {
    result: sanitizeUntranslatedChinese(resultSrt, targetLang),
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
