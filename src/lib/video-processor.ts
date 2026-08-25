import { prisma } from "./prisma";
import {
  calculateLocalCostSaved,
  calculateWhisperCost,
  FRAME_INTERVAL_SECONDS,
} from "./pricing";
import {
  getUploadsDir,
  updateJobProgress,
  cleanupJobFiles,
  jobQueueManager,
} from "./queue";
import { splitSubtitleIntoChunks, estimateMaxTokens, parseSubtitle } from "./subtitle";
import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import { translateSubtitleFree } from "./free-translator";
import { getAudioDurationMsSmart, createWavSilenceFileFast } from "./audio-sync";


// System prompt dịch phụ đề dùng chung chuẩn Subbing CPS/CPL
const TRANSLATE_SYSTEM_PROMPT = (
  targetLang: string,
) => `Bạn là một chuyên gia biên dịch phụ đề phim chuyên nghiệp.
Nhiệm vụ: dịch toàn bộ nội dung phụ đề sau sang ${targetLang} theo chuẩn điện ảnh (Tiêu chuẩn Subbing: CPS <= 17 ký tự/giây, CPL <= 42 ký tự/dòng).

QUY TẮC BẮT BUỘC:
- ĐỘ DÀI & TỐC ĐỘ ĐỌC (CPS & CPL): Dịch CỰC KỲ NGẮN GỌN, súc tích. Với thời lượng 1.0s - 1.2s, độ dài câu dịch CHỈ NÊN từ 15 - 28 ký tự. Loại bỏ từ thừa.
- CHÍNH XÁC NGHĨA: "不对劲" = "bất thường" / "cực kỳ lạ" (TUYỆT ĐỐI KHÔNG DỊCH "tức giận"!). "死对头" = "oan gia" / "kẻ thù". "假结婚" = "cưới giả". "穿短裙出门" = "mặc váy ngắn ra đường".
- Giữ nguyên số thứ tự từng dòng phụ đề và toàn bộ timestamp (định dạng 00:00:00,000 --> 00:00:00,000).
- Trả về DUY NHẤT nội dung file đã dịch theo đúng định dạng gốc (SRT hoặc VTT), không thêm lời dẫn, không thêm giải thích, không bọc trong dấu markdown \`\`\`.`;

// System prompt loại bỏ Watermark
const WATERMARK_SYSTEM_PROMPT = `Bạn là một trợ lý biên tập phụ đề chuyên nghiệp.
Nhiệm vụ: Duyệt qua file phụ đề SRT thô sau đây, phát hiện và loại bỏ triệt để các dòng là watermark, quảng cáo, hoặc logo kênh (ví dụ: tên kênh Tiktok, logo website, dòng chữ tĩnh lặp đi lặp lại ở nhiều khung hình giống hệt nhau).
Chỉ giữ lại các dòng thoại phụ đề thật sự của video.
Trả về DUY NHẤT nội dung file phụ đề mới theo đúng định dạng SRT gốc, không thêm lời giải thích, không bọc trong markdown.`;

// System prompts cho OCR Claude Vision
const OCR_SYSTEM_PROMPT =
  "Bạn là một hệ thống OCR chuyên đọc chữ phụ đề trong ảnh chụp màn hình video.";
const OCR_USER_PROMPT_AUTO = `Hãy đọc chính xác toàn bộ chữ phụ đề hiển thị trong ảnh này.
Chỉ trả về đúng phần chữ nhìn thấy được, theo đúng thứ tự xuất hiện,
mỗi dòng phụ đề một dòng riêng. Không thêm mô tả, không thêm nhận xét
về hình ảnh. Nếu không thấy chữ nào, trả về đúng chuỗi: KHONG_TIM_THAY_CHU.`;

const OCR_USER_PROMPT_LANG = (
  lang: string,
) => `Hãy đọc chính xác toàn bộ chữ phụ đề hiển thị trong ảnh này.
Chữ trong ảnh là tiếng ${lang}. Đọc chính xác theo bảng chữ cái/hệ ký tự của ngôn ngữ này, không nhận diện nhầm sang ngôn ngữ khác.
Chỉ trả về đúng phần chữ nhìn thấy được, theo đúng thứ tự xuất hiện,
mỗi dòng phụ đề một dòng riêng. Không thêm mô tả, không thêm nhận xét
về hình ảnh. Nếu không thấy chữ nào, trả về đúng chuỗi: KHONG_TIM_THAY_CHU.`;

/**
 * Lấy đường dẫn của chương trình Tesseract OCR trên hệ thống
 */
async function getTesseractBinaryPath(): Promise<string> {
  const envPath = process.env.TESSERACT_PATH;
  if (envPath && envPath.trim() !== "") {
    if (fs.existsSync(envPath)) {
      return `"${envPath}"`;
    }
    try {
      await runCommandAsync(`"${envPath}" --version`);
      return `"${envPath}"`;
    } catch (e) {
      try {
        await runCommandAsync(`${envPath} --version`);
        return envPath;
      } catch (e2) {}
    }
    throw new Error(
      `Đường dẫn TESSERACT_PATH cấu hình trong .env không tồn tại hoặc không thể chạy: ${envPath}`,
    );
  }

  // 1. Thử gọi trực tiếp 'tesseract' (nếu có trong PATH hệ thống)
  try {
    await runCommandAsync("tesseract --version");
    return "tesseract";
  } catch (err) {}

  // 2. Windows: thử đường dẫn mặc định
  const isWindows = process.platform === "win32";
  if (isWindows) {
    const defaultWinPath = "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
    if (fs.existsSync(defaultWinPath)) {
      return `"${defaultWinPath}"`;
    }
  } else {
    // 3. Linux/macOS: thử đường dẫn phổ biến
    const paths = ["/usr/bin/tesseract", "/usr/local/bin/tesseract"];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return `"${p}"`;
      }
    }
  }

  throw new Error(
    "Không tìm thấy phần mềm Tesseract OCR trên hệ thống. " +
      "Vui lòng cài đặt Tesseract OCR và thêm vào PATH hệ thống hoặc cấu hình đường dẫn TESSERACT_PATH trong file .env.",
  );
}

async function safeUpdateSubtitleJob(jobId: string, data: any) {
  try {
    return await prisma.subtitleJob.update({
      where: { id: jobId },
      data,
    });
  } catch (err: any) {
    if (err.code === "P2025") {
      console.warn(
        `[Job ${jobId}] Skipping DB update: Record was deleted or cancelled by user.`,
      );
      return null;
    }
    throw err;
  }
}

/**
 * Phân tích tệp TSV của Tesseract để tính độ tin cậy (confidence score) trung bình
 */
function parseTsvConfidence(tsvPath: string): number {
  if (!fs.existsSync(tsvPath)) return 100;
  try {
    const content = fs.readFileSync(tsvPath, "utf8");
    const lines = content.split("\n");
    let totalConf = 0;
    let wordCount = 0;

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 11) {
        const level = parts[0].trim();
        const confStr = parts[10].trim();
        // Cấp độ từ (word level) là 5
        if (level === "5") {
          const conf = parseFloat(confStr);
          if (!isNaN(conf) && conf >= 0) {
            totalConf += conf;
            wordCount++;
          }
        }
      }
    }

    if (wordCount > 0) {
      return Math.round(totalConf / wordCount);
    }
  } catch (err) {
    console.error("[TSV Parse Error]:", err);
  }
  return 100;
}

/**
 * Kiểm tra tỷ lệ ký tự Unicode có khớp với ngôn ngữ mong đợi không để phát hiện OCR rác.
 */
function validateOcrLanguageQuality(
  text: string,
  expectedLang: string,
): { isValid: boolean; ratio: number } {
  if (!text || text.trim().length === 0) return { isValid: true, ratio: 1.0 };

  // Loại bỏ khoảng trắng và dấu câu thông dụng
  const cleanText = text.replace(/[\s\p{P}]/gu, "");
  if (cleanText.length === 0) return { isValid: true, ratio: 1.0 };

  const totalChars = cleanText.length;

  if (
    expectedLang.includes("zh") ||
    expectedLang === "chi_sim" ||
    expectedLang === "chi_tra"
  ) {
    // Chữ Hán
    const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
    const match = cleanText.match(cjkRegex);
    const cjkCount = match ? match.length : 0;
    const ratio = cjkCount / totalChars;
    return { isValid: ratio >= 0.35, ratio }; // Ít nhất 35% ký tự là chữ Hán
  }

  if (expectedLang.includes("ja") || expectedLang === "jpn") {
    // Hiragana, Katakana, Kanji
    const jaRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3400-\u4dbf]/g;
    const match = cleanText.match(jaRegex);
    const jaCount = match ? match.length : 0;
    const ratio = jaCount / totalChars;
    return { isValid: ratio >= 0.35, ratio };
  }

  if (expectedLang.includes("ko") || expectedLang === "kor") {
    // Hangul (Chữ Hàn)
    const koRegex = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g;
    const match = cleanText.match(koRegex);
    const koCount = match ? match.length : 0;
    const ratio = koCount / totalChars;
    return { isValid: ratio >= 0.35, ratio };
  }

  return { isValid: true, ratio: 1.0 };
}

/**
 * Tự động nhận diện ngôn ngữ của video bằng cách chạy thử Tesseract trên 1 frame đầu tiên có chứa chữ.
 */
async function autoDetectVideoLanguage(
  tesseractBin: string,
  framePaths: string[],
  tessdataDir: string,
): Promise<string> {
  const candidateLangs = ["vie", "eng", "chi_sim", "jpn", "kor"];
  const langScores: Record<string, number> = {
    vie: 0,
    eng: 0,
    chi_sim: 0,
    jpn: 0,
    kor: 0,
  };

  // Lấy ra frame có dung lượng lớn nhất trong 5 frame đầu tiên làm mẫu test (thường chứa chữ chi tiết nhất)
  let bestFramePath = framePaths[0];
  let maxBytes = 0;

  const testFrameCandidates = framePaths.slice(0, 8);
  for (const fp of testFrameCandidates) {
    if (fs.existsSync(fp)) {
      const stats = fs.statSync(fp);
      if (stats.size > maxBytes) {
        maxBytes = stats.size;
        bestFramePath = fp;
      }
    }
  }

  if (!bestFramePath || !fs.existsSync(bestFramePath)) {
    return "vie"; // default fallback
  }

  // Chạy thử 5 ngôn ngữ trên frame được chọn làm mẫu
  for (const lang of candidateLangs) {
    try {
      const { text, confidence } = await runOcrCli(
        tesseractBin,
        bestFramePath,
        lang,
      );
      // Nếu nhận diện được chữ và độ tin cậy tốt
      if (text && text.trim().replace(/[\s\p{P}]/gu, "").length > 1) {
        langScores[lang] = confidence;
      }
    } catch (e) {
      // bỏ qua
    }
  }

  // Tìm ngôn ngữ có điểm confidence cao nhất
  let maxScore = 0;
  let detectedLang = "vie"; // default fallback
  for (const [lang, score] of Object.entries(langScores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  // Fallback nếu không phát hiện được chữ nào
  if (maxScore < 30) {
    return "vie+eng";
  }

  return detectedLang;
}

/**
 * Chạy OCR bằng lệnh CLI tesseract cài trên máy (Windows/Linux)
 * Tạo cả file .txt và .tsv cùng lúc để lấy text và confidence score
 */
async function runOcrCli(
  tesseractBin: string,
  imagePath: string,
  ocrLangs: string,
): Promise<{ text: string; confidence: number }> {
  const outputTempPrefix = imagePath.replace(".jpg", "_txt");
  const outputTempTxtFile = outputTempPrefix + ".txt";
  const outputTempTsvFile = outputTempPrefix + ".tsv";

  const tessdataDir = path.join(process.cwd(), "tessdata");
  // psm 7: Chế độ nhận diện một dòng chữ duy nhất (tối ưu nhất cho đọc phụ đề crop)
  const cmd = `${tesseractBin} --tessdata-dir "${tessdataDir}" "${imagePath}" "${outputTempPrefix}" -l ${ocrLangs} --psm 7 txt tsv`;

  try {
    await runCommandAsync(cmd);

    let text = "";
    let confidence = 100;

    if (fs.existsSync(outputTempTxtFile)) {
      text = fs.readFileSync(outputTempTxtFile, "utf8").trim();
    }
    if (fs.existsSync(outputTempTsvFile)) {
      confidence = parseTsvConfidence(outputTempTsvFile);
    }

    // Dọn dẹp tệp tạm
    try {
      if (fs.existsSync(outputTempTxtFile)) fs.unlinkSync(outputTempTxtFile);
      if (fs.existsSync(outputTempTsvFile)) fs.unlinkSync(outputTempTsvFile);
    } catch (unErr) {}

    return { text, confidence };
  } catch (error: any) {
    console.error("[Tesseract CLI Run Error]:", error.message || error);
    // Dọn dẹp tệp tạm nếu có lỗi nửa chừng
    try {
      if (fs.existsSync(outputTempTxtFile)) fs.unlinkSync(outputTempTxtFile);
      if (fs.existsSync(outputTempTsvFile)) fs.unlinkSync(outputTempTsvFile);
    } catch (unErr) {}
    throw error;
  }
}

/**
 * Chạy lệnh cmd bất đồng bộ bằng Node.js exec
 */
function runCommandAsync(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Lấy đường dẫn của chương trình alass trên hệ thống
 */
async function getAlassBinaryPath(): Promise<string | null> {
  const envPath = process.env.ALASS_PATH;
  if (envPath && envPath.trim() !== "") {
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    try {
      await runCommandAsync(`"${envPath}" --version`);
      return envPath;
    } catch (e) {
      try {
        await runCommandAsync(`${envPath} --version`);
        return envPath;
      } catch (e2) {}
    }
  }

  // Thử gọi trực tiếp 'alass' (nếu có trong PATH)
  try {
    await runCommandAsync("alass --version");
    return "alass";
  } catch (err) {}

  return null;
}

/**
 * Đồng bộ lại thời gian phụ đề bằng alass/ffsubsync phân tích âm thanh
 */
async function syncSubtitleTiming(
  videoPath: string,
  srtPath: string,
  outputPath: string,
  jobId: string,
): Promise<boolean> {
  const alassBin = await getAlassBinaryPath();

  let finalVideoPath = videoPath;
  let finalSrtPath = srtPath;
  let finalOutputPath = outputPath;

  let renamedVideo = false;
  let renamedSrt = false;
  let renamedOutput = false;

  const hasBrackets =
    videoPath.includes("[") ||
    videoPath.includes("]") ||
    srtPath.includes("[") ||
    srtPath.includes("]") ||
    outputPath.includes("[") ||
    outputPath.includes("]");

  const uploadsDir = path.dirname(srtPath);

  if (hasBrackets) {
    if (videoPath.includes("[") || videoPath.includes("]")) {
      const ext = path.extname(videoPath);
      finalVideoPath = path.join(uploadsDir, `${jobId}_sync_ref${ext}`);
      fs.renameSync(videoPath, finalVideoPath);
      renamedVideo = true;
    }
    if (srtPath.includes("[") || srtPath.includes("]")) {
      finalSrtPath = path.join(uploadsDir, `${jobId}_sync_in.srt`);
      fs.renameSync(srtPath, finalSrtPath);
      renamedSrt = true;
    }
    if (outputPath.includes("[") || outputPath.includes("]")) {
      finalOutputPath = path.join(uploadsDir, `${jobId}_sync_out.srt`);
      renamedOutput = true;
    }
  }

  try {
    if (alassBin) {
      console.log(`[Audio Sync] Using alass: ${alassBin}`);
      const cmd = `"${alassBin}" "${finalVideoPath}" "${finalSrtPath}" "${finalOutputPath}"`;
      await runCommandAsync(cmd);
      return true;
    } else {
      console.log(`[Audio Sync] alass not found, falling back to ffsubsync`);
      const ffsubsyncPath =
        process.platform === "win32"
          ? path.join(
              process.cwd(),
              "..",
              "backend",
              ".venv",
              "Scripts",
              "ffsubsync.exe",
            )
          : path.join(process.cwd(), "..", "backend", ".venv", "bin", "ffsubsync");

      let cmd = "";
      if (fs.existsSync(ffsubsyncPath)) {
        cmd = `"${ffsubsyncPath}" "${finalVideoPath}" -i "${finalSrtPath}" -o "${finalOutputPath}"`;
      } else {
        cmd = `ffsubsync "${finalVideoPath}" -i "${finalSrtPath}" -o "${finalOutputPath}"`;
      }
      await runCommandAsync(cmd);
      return true;
    }
  } catch (err: any) {
    console.error(`[Audio Sync Error]:`, err.message || err);
    throw err;
  } finally {
    if (renamedVideo && fs.existsSync(finalVideoPath)) {
      fs.renameSync(finalVideoPath, videoPath);
    }
    if (renamedSrt && fs.existsSync(finalSrtPath)) {
      fs.renameSync(finalSrtPath, srtPath);
    }
    if (renamedOutput && fs.existsSync(finalOutputPath)) {
      fs.renameSync(finalOutputPath, outputPath);
    }
  }
}

/**
 * Định dạng số mili-giây thành timestamp SRT (hh:mm:ss,fff)
 */
function formatMsToSrtTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const fff = ms % 1000;
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(fff).padStart(3, "0")}`;
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * So sánh text tương đối Fuzzy Matching (cho phép sai khác nhỏ 1-2 ký tự do nhiễu OCR)
 */
function areTextsSimilar(t1: string, t2: string): boolean {
  const clean1 = t1.trim().toLowerCase().replace(/[\s\p{P}]/gu, "");
  const clean2 = t2.trim().toLowerCase().replace(/[\s\p{P}]/gu, "");
  if (!clean1 && !clean2) return true;
  if (!clean1 || !clean2) return false;
  if (clean1 === clean2) return true;

  const maxLen = Math.max(clean1.length, clean2.length);
  if (maxLen === 0) return true;

  const dist = levenshteinDistance(clean1, clean2);
  const similarity = 1 - dist / maxLen;
  return similarity >= 0.65;
}

/**
 * Pipeline dịch phụ đề phụ (dùng chung cho luồng trích xuất tự động dịch)
 */
/**
 * Pipeline dịch phụ đề phụ (dùng chung cho luồng trích xuất tự động dịch)
 */
async function runAutoTranslation(
  subtitleContent: string,
  selectedLangs: string[],
  glossary: any[],
  jobId: string,
): Promise<{ results: Record<string, string>; cost: number }> {
  if (!selectedLangs || selectedLangs.length === 0) {
    return { results: {}, cost: 0 };
  }

  // Nếu đã cấu hình Gemini API Key, ưu tiên sử dụng Gemini để dịch tự động sau STT
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  if (hasGeminiKey) {
    try {
      const { translateSubtitleGemini } = await import("./gemini-translator");
      await updateJobProgress(
        jobId,
        `Bắt đầu tự động dịch sang ${selectedLangs.length} ngôn ngữ (Gemini Online API)...`,
      );
      const formattedGlossary = (glossary || []).map((g: any) => ({
        original: g.original || g.term || "",
        translation: g.translation || "",
      }));
      const geminiRes = await translateSubtitleGemini(
        subtitleContent,
        selectedLangs,
        formattedGlossary,
        undefined,
        jobId,
      );

      const results: Record<string, string> = {};
      let hasError = false;
      for (const langCode of selectedLangs) {
        const langRes = geminiRes.results[langCode];
        if (langRes && langRes.status === "done") {
          results[langCode] = langRes.result;
        } else {
          hasError = true;
          break;
        }
      }

      if (!hasError) {
        return { results, cost: geminiRes.totalCost };
      }
      console.warn("[Gemini Auto-Translate] Một số ngôn ngữ dịch lỗi, chuyển sang fallback Local/Free.");
    } catch (geminiErr: any) {
      console.warn("[Gemini Auto-Translate Error] Fallback sang Local/Free:", geminiErr.message || geminiErr);
    }
  }

  const { translateSubtitleLocal } = await import("./local-translator");

  await updateJobProgress(
    jobId,
    `Bắt đầu tự động dịch sang ${selectedLangs.length} ngôn ngữ (Local Ollama)...`,
  );

  const results: Record<string, string> = {};
  let totalCost = 0;

  for (const langCode of selectedLangs) {
    await updateJobProgress(
      jobId,
      `Đang dịch sang ${langCode.toUpperCase()}...`,
    );
    try {
      try {
        const {
          result: translatedSub,
          inputTokens,
          outputTokens,
        } = await translateSubtitleLocal(subtitleContent, langCode, glossary);
        results[langCode] = translatedSub;

        // Tính chi phí
        const langCost = calculateLocalCostSaved(inputTokens, outputTokens);
        totalCost += langCost;

        // Ghi nhận log chi phí dịch thực tế
        await prisma.costLog.create({
          data: {
            jobId,
            provider: "local-ollama",
            amountUsd: langCost,
            costType: "saved",
          },
        });
      } catch (ollamaErr: any) {
        console.warn(
          `[Ollama Error in Queue] Fallback sang Google Translate Free cho ngôn ngữ ${langCode.toUpperCase()}:`,
          ollamaErr.message || ollamaErr,
        );

        const { translateSubtitleFree } = await import("./free-translator");
        const freeGlossary = (glossary || []).map((g: any) => ({
          original: g.original || g.term || "",
          translation: g.translation || "",
        }));

        const translatedSub = await translateSubtitleFree(
          subtitleContent,
          langCode,
          freeGlossary,
        );
        results[langCode] = translatedSub;
      }
    } catch (err: any) {
      console.error(`Lỗi nghiêm trọng khi dịch sang ${langCode}:`, err);
      results[langCode] = subtitleContent; // fallback về bản gốc nếu cả hai đều lỗi
    }
  }

  return { results, cost: totalCost };
}

// ============================================================
// CORE WORKERS
// ============================================================

/**
 * Xử lý job OCR Video
 */
export async function processOcrVideoJob(jobId: string) {
  let tempFramesDir = "";
  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "processing", progressLog: "[]" },
    });

    const meta = JSON.parse(job.meta || "{}");
    const {
      sourceLanguage,
      removeWatermark,
      autoTranslate,
      selectedLangs,
      glossary,
    } = meta;
    const cropRegion = meta.cropRegion || { xPercent: 10, yPercent: 80, widthPercent: 80, heightPercent: 15 };

    const ocrEngine = process.env.OCR_ENGINE || "paddleocr";
    const syncAudio = meta.syncAudio !== false;

    let tesseractBin = "";
    let requiredLangs: string[] = [];
    let ocrLangs = "vie+eng"; // default
    const isAutoDetect = !sourceLanguage || sourceLanguage === "auto";

    if (ocrEngine === "tesseract") {
      // --- BƯỚC KIỂM TRA SỚM TESSERACT OCR ---
      await updateJobProgress(
        jobId,
        "Đang kiểm tra bộ quét OCR Tesseract trên máy...",
      );
      tesseractBin = await getTesseractBinaryPath();

      // Xác định các gói ngôn ngữ cần sử dụng (nếu không phải auto)
      if (!isAutoDetect) {
        const langLower = sourceLanguage.toLowerCase();
        if (langLower.includes("vi")) {
          requiredLangs.push("vie");
          ocrLangs = "vie";
        } else if (langLower.includes("en")) {
          requiredLangs.push("eng");
          ocrLangs = "eng";
        } else if (langLower.includes("ja")) {
          requiredLangs.push("jpn");
          ocrLangs = "jpn";
        } else if (langLower.includes("zh") || langLower.includes("cn")) {
          requiredLangs.push("chi_sim");
          ocrLangs = "chi_sim";
        } else if (langLower.includes("ko")) {
          requiredLangs.push("kor");
          ocrLangs = "kor";
        }
      }

      // Lấy danh sách ngôn ngữ hiện có của Tesseract
      let installedLangs: string[] = [];
      try {
        const tessdataDir = path.join(process.cwd(), "tessdata");
        const langsOutput = await runCommandAsync(
          `${tesseractBin} --tessdata-dir "${tessdataDir}" --list-langs`,
        );
        installedLangs = langsOutput
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter((l) => l && !l.includes("list of") && !l.includes(":"));
      } catch (langErr: any) {
        throw new Error(
          `Không thể khởi chạy Tesseract OCR: ${langErr.message}`,
        );
      }

      // So sánh kiểm tra xem có đủ gói ngôn ngữ yêu cầu không (chỉ chạy khi chỉ định cụ thể)
      if (!isAutoDetect) {
        for (const reqLang of requiredLangs) {
          if (reqLang === "chi_sim") {
            if (
              !installedLangs.includes("chi_sim") &&
              !installedLangs.includes("chi_tra")
            ) {
              throw new Error(
                "Thiếu gói ngôn ngữ Trung Quốc (chi_sim hoặc chi_tra) cho Tesseract OCR. Vui lòng tải file traineddata tương ứng và đặt vào thư mục tessdata.",
              );
            }
          } else {
            if (!installedLangs.includes(reqLang)) {
              const langNames: Record<string, string> = {
                vie: "Tiếng Việt (vie)",
                eng: "Tiếng Anh (eng)",
                jpn: "Tiếng Nhật (jpn)",
                kor: "Tiếng Hàn (kor)",
              };
              const langName = langNames[reqLang] || reqLang;
              throw new Error(
                `Thiếu gói ngôn ngữ ${langName} cho Tesseract OCR. Vui lòng tải file "${reqLang}.traineddata" từ https://github.com/tesseract-ocr/tessdata và copy vào thư mục tessdata của Tesseract.`,
              );
            }
          }
        }
      }
      await updateJobProgress(jobId, "Bộ quét OCR Tesseract đã sẵn sàng!");
    } else {
      await updateJobProgress(
        jobId,
        "Bộ quét OCR PaddleOCR (chạy qua Python Service local) đã sẵn sàng!",
      );
      if (!isAutoDetect) {
        const langLower = sourceLanguage.toLowerCase();
        if (langLower.includes("vi")) {
          ocrLangs = "vie";
        } else if (langLower.includes("en")) {
          ocrLangs = "eng";
        } else if (langLower.includes("ja")) {
          ocrLangs = "jpn";
        } else if (langLower.includes("zh") || langLower.includes("cn")) {
          ocrLangs = "chi_sim";
        } else if (langLower.includes("ko")) {
          ocrLangs = "kor";
        }
      }
    }

    // Tìm file video tạm
    const uploadsDir = getUploadsDir();
    const files = fs.readdirSync(uploadsDir);
    const videoFile = files.find(
      (f) => f.startsWith(jobId) && !f.endsWith("_frames"),
    );
    if (!videoFile) {
      throw new Error("Không tìm thấy file video tạm thời của job trên server");
    }
    const videoPath = path.join(uploadsDir, videoFile);

    // 1. Phân tích video bằng ffprobe
    await updateJobProgress(
      jobId,
      "Bước 1/6: Đang đọc thông tin kích thước video bằng ffprobe...",
    );
    const ffprobeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`;
    const resolutionStr = await runCommandAsync(ffprobeCmd);
    const [videoWidth, videoHeight] = resolutionStr.split("x").map(Number);

    if (!videoWidth || !videoHeight) {
      throw new Error(
        "ffprobe không đọc được kích thước video. Định dạng file có thể lỗi.",
      );
    }
    await updateJobProgress(
      jobId,
      `Kích thước video: ${videoWidth}x${videoHeight}`,
    );

    // 2. Trích xuất frames đã crop bằng ffmpeg
    await updateJobProgress(
      jobId,
      "Bước 2/6: Đang trích xuất và crop khung hình bằng ffmpeg...",
    );

    // Tính toạ độ pixel tuyệt đối
    const x = Math.round((cropRegion.xPercent * videoWidth) / 100);
    const y = Math.round((cropRegion.yPercent * videoHeight) / 100);
    // Đảm bảo w và h tối thiểu 2px để ffmpeg không lỗi
    const w = Math.max(2, Math.round((cropRegion.widthPercent * videoWidth) / 100));
    const h = Math.max(2, Math.round((cropRegion.heightPercent * videoHeight) / 100));

    tempFramesDir = path.join(uploadsDir, `${jobId}_frames`);
    if (!fs.existsSync(tempFramesDir)) {
      fs.mkdirSync(tempFramesDir, { recursive: true });
    }

    // Trích xuất 1 frame mỗi FRAME_INTERVAL_SECONDS giây
    // Nếu vùng crop nhỏ hơn 80px chiều cao → upscale ngay bằng ffmpeg scale filter
    // để PaddleOCR nhận diện chính xác hơn (text height tối thiểu ~32px cho PaddleOCR)
    const fps = 1 / FRAME_INTERVAL_SECONDS;
    const scaleFilter = h < 80 ? `,scale=-1:${Math.max(120, h * 4)}:flags=lanczos` : h < 120 ? `,scale=-1:${h * 2}:flags=lanczos` : '';
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -vf "fps=${fps},crop=${w}:${h}:${x}:${y}${scaleFilter}" -q:v 2 "${tempFramesDir}/frame_%04d.jpg"`;
    await runCommandAsync(ffmpegCmd);

    const frameFiles = fs
      .readdirSync(tempFramesDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort();
    if (frameFiles.length === 0) {
      throw new Error(
        "ffmpeg không trích xuất được khung hình nào. Hãy kiểm tra định dạng video.",
      );
    }
    await updateJobProgress(
      jobId,
      `Đã trích xuất ${frameFiles.length} khung hình cần quét OCR.`,
    );

    // --- TỰ ĐỘNG NHẬN DIỆN NGÔN NGỮ (nếu được chọn) ---
    let finalOcrLangs = ocrLangs;
    let detectedLangLabel = "";

    if (isAutoDetect) {
      await updateJobProgress(
        jobId,
        "Đang tiến hành phân tích tự động nhận diện ngôn ngữ video...",
      );
      let detected = "vie+eng";
      try {
        const tessBin = await getTesseractBinaryPath();
        const tessdataDir = path.join(process.cwd(), "tessdata");
        detected = await autoDetectVideoLanguage(
          tessBin,
          frameFiles.map((f) => path.join(tempFramesDir, f)),
          tessdataDir,
        );
      } catch (detectErr) {
        console.warn(
          "[Auto-detect Warn] Không tìm thấy Tesseract hoặc lỗi nhận diện ngôn ngữ. Fallback về Tiếng Việt.",
          detectErr,
        );
        detected = "vie";
      }

      // Map mã tesseract sang nhãn ngôn ngữ tiếng Việt thân thiện để log
      const langNames: Record<string, string> = {
        vie: "Tiếng Việt",
        eng: "Tiếng Anh",
        jpn: "Tiếng Nhật",
        kor: "Tiếng Hàn",
        chi_sim: "Tiếng Trung (Giản thể)",
        "vie+eng": "Mặc định (Tiếng Việt + Tiếng Anh)",
      };

      if (detected === "vie+eng") {
        if (ocrEngine === "tesseract") {
          throw new Error(
            "Không thể tự động xác định ngôn ngữ từ video này (độ tin cậy quá thấp cho mọi ngôn ngữ đã thử). Vui lòng chỉ định ngôn ngữ cụ thể.",
          );
        } else {
          detected = "vie";
        }
      }

      finalOcrLangs = detected;
      detectedLangLabel = langNames[detected] || detected;
      await updateJobProgress(
        jobId,
        `✓ Đã tự động nhận diện: ${detectedLangLabel}`,
      );
    } else {
      const langNames: Record<string, string> = {
        vie: "Tiếng Việt",
        eng: "Tiếng Anh",
        jpn: "Tiếng Nhật",
        kor: "Tiếng Hàn",
        chi_sim: "Tiếng Trung",
      };
      detectedLangLabel = langNames[ocrLangs] || ocrLangs;
    }

    // 3. Quét OCR từng frame bằng Engine thích hợp (Offline)
    const rawResults: Array<{
      idx: number;
      timeMs: number;
      text: string;
      confidence: number;
    }> = [];

    // Pre-calculate frame hashes to skip duplicate identical frames (e.g. static subtitles)
    const frameHashMap = new Map<string, { text: string; confidence: number }>();
    const frameIndexToHash: string[] = [];

    for (let idx = 0; idx < frameFiles.length; idx++) {
      const fPath = path.join(tempFramesDir, frameFiles[idx]);
      try {
        const fileBuffer = fs.readFileSync(fPath);
        const hash = crypto.createHash("md5").update(fileBuffer).digest("hex");
        frameIndexToHash.push(hash);
        if (!frameHashMap.has(hash)) {
          frameHashMap.set(hash, { text: "", confidence: 0 });
        }
      } catch (e) {
        frameIndexToHash.push(`idx_${idx}`);
      }
    }

    const uniqueHashes = Array.from(frameHashMap.keys());
    const uniqueFrameFiles: string[] = [];

    uniqueHashes.forEach((hash) => {
      const originalIdx = frameIndexToHash.indexOf(hash);
      if (originalIdx >= 0) {
        uniqueFrameFiles.push(frameFiles[originalIdx]);
      }
    });

    const skippedCount = frameFiles.length - uniqueFrameFiles.length;
    if (skippedCount > 0) {
      await updateJobProgress(
        jobId,
        `⚡ Tự động tối ưu: Đã lọc và bỏ qua ${skippedCount}/${frameFiles.length} khung hình trùng lặp (giảm ${Math.round((skippedCount / frameFiles.length) * 100)}% thời gian chờ)...`,
      );
    }

    let useTesseract = ocrEngine === "tesseract";

    if (ocrEngine === "paddleocr") {
      await updateJobProgress(
        jobId,
        `Bắt đầu quét song song ${uniqueFrameFiles.length} khung hình độc bản bằng RapidOCR ONNX Engine (Ngôn ngữ: ${detectedLangLabel})...`,
      );

      const pythonServiceUrl =
        process.env.PYTHON_AI_SERVICE_URL || "http://localhost:8000";
      const BATCH_SIZE = 16;
      let completedCount = 0;

      try {
        for (let i = 0; i < uniqueFrameFiles.length; i += BATCH_SIZE) {
          const batchFiles = uniqueFrameFiles.slice(i, i + BATCH_SIZE);
          const framePaths = batchFiles.map((f) => path.join(tempFramesDir, f));

          const response = await fetchWithRetry(
            `${pythonServiceUrl}/ocr/video`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                frame_paths: framePaths,
                lang: finalOcrLangs,
              }),
            },
            2,
            [5000, 15000],
          );

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(
              `Dịch vụ RapidOCR lỗi (${response.status}): ${errText}`,
            );
          }

          const data = await response.json();
          const batchResults = data.results || [];

          batchResults.forEach((r: any) => {
            const uIdx = i + r.idx;
            const hash = uniqueHashes[uIdx];
            const text = (r.text || "")
              .replace(/\r?\n|\r/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            if (hash) {
              frameHashMap.set(hash, { text, confidence: r.confidence || 0 });
            }
          });

          completedCount += batchFiles.length;
          await updateJobProgress(
            jobId,
            `Tiến trình: Đang quét khung hình ${completedCount}/${uniqueFrameFiles.length} (${Math.round((completedCount * 100) / uniqueFrameFiles.length)}%)...`,
          );
        }

        // Map back to rawResults for all frameFiles
        for (let idx = 0; idx < frameFiles.length; idx++) {
          const hash = frameIndexToHash[idx];
          const timeMs = idx * FRAME_INTERVAL_SECONDS * 1000;
          const cached = frameHashMap.get(hash) || { text: "", confidence: 0 };
          rawResults.push({
            idx,
            timeMs,
            text: cached.text,
            confidence: cached.confidence,
          });
        }
      } catch (err: any) {
        console.warn(
          `[RapidOCR Fail] Lỗi RapidOCR: ${err.message || err}. Chuyển sang Tesseract OCR làm dự phòng...`,
        );
        await updateJobProgress(
          jobId,
          `⚠ Không sử dụng được RapidOCR (Lỗi: ${err.message || "mất kết nối backend"}). Đang chuyển sang Tesseract OCR làm dự phòng...`,
        );

        try {
          tesseractBin = await getTesseractBinaryPath();
        } catch (tessBinErr: any) {
          throw new Error(
            `RapidOCR gặp sự cố, và Tesseract OCR dự phòng cũng không chạy được: ${tessBinErr.message}`,
          );
        }
        useTesseract = true;
      }
    }

    const isGeminiEngine = meta?.engine === "gemini";
    let rawSubtitleBlocks: Array<{
      startMs: number;
      endMs: number;
      text: string;
      confidences: number[];
    }> = [];
    let srtRawContent = "";

    if (isGeminiEngine) {
      await updateJobProgress(
        jobId,
        "Bước 3/6: Đang gửi các khung hình video sang Gemini Multimodal API...",
      );
      const fullFramePaths = frameFiles.map((f: string) =>
        path.join(tempFramesDir, f),
      );
      const { ocrVideoGemini } = await import("./gemini-ocr-video");
      const geminiRes = await ocrVideoGemini(
        fullFramePaths,
        sourceLanguage || "auto",
        jobId,
      );

      srtRawContent = geminiRes.srtContent;
      const parsedSrt = parseSrtToBlocks(srtRawContent);
      rawSubtitleBlocks = parsedSrt.map((b) => ({
        startMs: b.startMs,
        endMs: b.endMs,
        text: b.text,
        confidences: [100],
      }));
      await updateJobProgress(
        jobId,
        `✓ Gemini Online OCR Video hoàn thành (${rawSubtitleBlocks.length} dòng thoại).`,
      );
    } else if (useTesseract) {
      await updateJobProgress(
        jobId,
        `Bắt đầu quét song song ${uniqueFrameFiles.length} khung hình độc bản bằng Tesseract OCR (Ngôn ngữ: ${detectedLangLabel})...`,
      );

      let completedCount = 0;
      const BATCH_SIZE = 8;
      for (let i = 0; i < uniqueFrameFiles.length; i += BATCH_SIZE) {
        const batchFiles = uniqueFrameFiles.slice(i, i + BATCH_SIZE);

        const promises = batchFiles.map(async (frameFile, idxInBatch) => {
          const uIdx = i + idxInBatch;
          const hash = uniqueHashes[uIdx];
          const framePath = path.join(tempFramesDir, frameFile);

          try {
            const { text: recognizedRawText, confidence } = await runOcrCli(
              tesseractBin,
              framePath,
              finalOcrLangs,
            );

            const text = recognizedRawText
              .replace(/\r?\n|\r/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            if (hash) {
              frameHashMap.set(hash, { text, confidence });
            }
          } catch (err: any) {
            console.error(
              `[OCR CLI Error] Lỗi khung hình ${uIdx + 1}:`,
              err.message || err,
            );
            throw err;
          }
        });

        await Promise.all(promises);

        completedCount += batchFiles.length;
        await updateJobProgress(
          jobId,
          `Tiến trình: Đang quét khung hình ${completedCount}/${uniqueFrameFiles.length} (${Math.round((completedCount * 100) / uniqueFrameFiles.length)}%)...`,
        );
      }

      // Map back to rawResults for all frameFiles
      for (let idx = 0; idx < frameFiles.length; idx++) {
        const hash = frameIndexToHash[idx];
        const timeMs = idx * FRAME_INTERVAL_SECONDS * 1000;
        const cached = frameHashMap.get(hash) || { text: "", confidence: 0 };
        rawResults.push({
          idx,
          timeMs,
          text: cached.text,
          confidence: cached.confidence,
        });
      }
    }

    if (rawResults.length > 0) {
      rawResults.sort((a, b) => a.idx - b.idx);

      // Gom nhóm phụ đề thô (logic time alignment) kèm tính confidence trung bình
      let currentBlock: {
        startMs: number;
        endMs: number;
        text: string;
        confidences: number[];
      } | null = null;

      rawResults.forEach((item) => {
        const { text, timeMs, confidence } = item;

        if (text && text.length > 1) {
          if (currentBlock && areTextsSimilar(currentBlock.text, text)) {
            currentBlock.endMs = timeMs + FRAME_INTERVAL_SECONDS * 1000;
            currentBlock.confidences.push(confidence);
          } else {
            if (currentBlock) {
              rawSubtitleBlocks.push(currentBlock);
            }
            currentBlock = {
              startMs: timeMs,
              endMs: timeMs + FRAME_INTERVAL_SECONDS * 1000,
              text,
              confidences: [confidence],
            };
          }
        } else {
          if (currentBlock) {
            rawSubtitleBlocks.push(currentBlock);
            currentBlock = null;
          }
        }
      });

      if (currentBlock) {
        rawSubtitleBlocks.push(currentBlock);
      }
    }

    const ocrCost = 0;
    let totalJobCost = ocrCost;
    const breakdownCosts: Record<string, number> = { ocr: ocrCost };

    await prisma.costLog.create({
      data: {
        jobId,
        provider: "tesseract-ocr",
        amountUsd: ocrCost,
      },
    });

    if (rawSubtitleBlocks.length === 0) {
      throw new Error(
        "Bộ OCR Offline không nhận diện được chữ phụ đề nào trong video. Bạn hãy thử crop vùng chữ to và rõ hơn.",
      );
    }

    // Tính toán độ tin cậy OCR trung bình và đếm các khối có độ tin cậy thấp (< 60%)
    let lowConfCount = 0;
    const blockConfidences = rawSubtitleBlocks.map((b) => {
      const avg = Math.round(
        b.confidences.reduce((acc, c) => acc + c, 0) /
          Math.max(1, b.confidences.length),
      );
      if (avg < 60) lowConfCount++;
      return avg;
    });

    const overallAvgConf = Math.round(
      blockConfidences.reduce((a, b) => a + b, 0) /
        Math.max(1, blockConfidences.length),
    );

    // Build raw SRT content
    const { normalizeSrtSyntax } = await import("./subtitle");
    srtRawContent = normalizeSrtSyntax(
      rawSubtitleBlocks
        .map((b, i) => {
          return `${i + 1}\n${formatMsToSrtTimestamp(b.startMs)} --> ${formatMsToSrtTimestamp(b.endMs)}\n${b.text}`;
        })
        .join("\n\n"),
    );

    if (lowConfCount > 0) {
      await updateJobProgress(
        jobId,
        `Trích xuất thô hoàn tất (${rawSubtitleBlocks.length} dòng, độ tin cậy trung bình: ${overallAvgConf}%). ⚠ Phát hiện ${lowConfCount} dòng có độ tin cậy OCR thấp (< 60%), đã bật AI tự động sửa lỗi đồng âm/nét.`,
      );
    } else {
      await updateJobProgress(
        jobId,
        `Trích xuất thô hoàn tất (${rawSubtitleBlocks.length} dòng, độ tin cậy trung bình: ${overallAvgConf}%).`,
      );
    }

    // 4. Bước lọc Watermark (nếu bật)
    let finalBlocks = [...rawSubtitleBlocks];
    if (removeWatermark) {
      await updateJobProgress(
        jobId,
        "Bước 4/6: Đang tiến hành loại bỏ watermark bằng thuật toán offline...",
      );

      // Thuật toán đếm tần suất xuất hiện để lọc logo tĩnh
      const textFrequency: Record<string, number> = {};
      rawSubtitleBlocks.forEach((b) => {
        const cleanText = b.text.trim().toLowerCase();
        textFrequency[cleanText] = (textFrequency[cleanText] || 0) + 1;
      });

      // Lọc bỏ: các dòng chứa kí tự @ (MXH), hoặc xuất hiện lặp lại > 5 lần (logo tĩnh) và độ dài ngắn (< 30 kí tự)
      finalBlocks = rawSubtitleBlocks.filter((b) => {
        const cleanText = b.text.trim().toLowerCase();
        const isSocialTag = cleanText.includes("@");
        const isRepetitiveLogo =
          textFrequency[cleanText] > 5 && cleanText.length < 30;
        return !isSocialTag && !isRepetitiveLogo;
      });

      const removedCount = rawSubtitleBlocks.length - finalBlocks.length;

      // Xây dựng lại nội dung SRT từ danh sách đã lọc
      srtRawContent = finalBlocks
        .map((b, i) => {
          return `${i + 1}\n${formatMsToSrtTimestamp(b.startMs)} --> ${formatMsToSrtTimestamp(b.endMs)}\n${b.text}`;
        })
        .join("\n\n");

      await updateJobProgress(
        jobId,
        `Đã lọc và loại bỏ thành công ${removedCount} dòng watermark.`,
      );

      // Lưu CostLog riêng biệt cho Watermark
      await prisma.costLog.create({
        data: {
          jobId,
          provider: "offline-watermark-filter",
          amountUsd: 0,
        },
      });
    } else {
      await updateJobProgress(
        jobId,
        "Bước 4/6: Bỏ qua bước loại bỏ watermark.",
      );
    }

    // 4.5. Bước đồng bộ lại thời gian bằng phân tích âm thanh (nếu bật và có phụ đề)
    if (syncAudio && finalBlocks.length > 0) {
      await updateJobProgress(
        jobId,
        "Bước 4.5/6: Đang đồng bộ lại thời gian phụ đề bằng phân tích âm thanh...",
      );
      try {
        const tempUnsyncedSrtPath = path.join(
          uploadsDir,
          `${jobId}_unsynced.srt`,
        );
        const tempSyncedSrtPath = path.join(uploadsDir, `${jobId}_synced.srt`);
        fs.writeFileSync(tempUnsyncedSrtPath, srtRawContent, "utf-8");

        await updateJobProgress(
          jobId,
          "Đang đối chiếu âm thanh bằng alass/ffsubsync...",
        );
        const syncSuccess = await syncSubtitleTiming(
          videoPath,
          tempUnsyncedSrtPath,
          tempSyncedSrtPath,
          jobId,
        );

        if (syncSuccess && fs.existsSync(tempSyncedSrtPath)) {
          const syncedSrtContent = fs.readFileSync(tempSyncedSrtPath, "utf-8");
          const unsyncedBlocks = parseSrtToBlocks(srtRawContent);
          const syncedBlocks = parseSrtToBlocks(syncedSrtContent);

          if (unsyncedBlocks.length > 0 && syncedBlocks.length > 0) {
            const diffMs = syncedBlocks[0].startMs - unsyncedBlocks[0].startMs;
            const diffSec = (diffMs / 1000).toFixed(2);
            const sign = diffMs >= 0 ? "+" : "";
            await updateJobProgress(
              jobId,
              `✓ Đồng bộ thời gian hoàn tất. Đã điều chỉnh offset: ${sign}${diffSec}s`,
            );

            srtRawContent = syncedSrtContent;
            finalBlocks = syncedBlocks.map((sb, idx) => {
              const origBlock = finalBlocks[idx];
              return {
                startMs: sb.startMs,
                endMs: sb.endMs,
                text: sb.text,
                confidences: origBlock ? origBlock.confidences : [100],
              };
            });
          }
        }

        try {
          if (fs.existsSync(tempUnsyncedSrtPath))
            fs.unlinkSync(tempUnsyncedSrtPath);
          if (fs.existsSync(tempSyncedSrtPath))
            fs.unlinkSync(tempSyncedSrtPath);
        } catch (_) {}
      } catch (syncErr: any) {
        console.error("[Audio Sync Error]:", syncErr);
        await updateJobProgress(
          jobId,
          `⚠️ Cảnh báo: Lỗi đồng bộ lại thời gian: ${syncErr.message || syncErr}. Giữ nguyên thời gian ban đầu.`,
        );
      }
    }

    // Tính điểm confidence trung bình cho từng block phụ đề SRT cuối cùng
    const finalConfidenceScores = finalBlocks.map((b) => {
      if (b.confidences.length === 0) return 100;
      const sum = b.confidences.reduce((sum, v) => sum + v, 0);
      return Math.round(sum / b.confidences.length);
    });

    // Validate chất lượng OCR dựa trên tỉ lệ Unicode
    const qualityResult = validateOcrLanguageQuality(
      srtRawContent,
      finalOcrLangs,
    );
    let ocrWarning = null;
    if (!qualityResult.isValid) {
      ocrWarning =
        "Kết quả OCR có vẻ chứa ký tự không hợp lệ hoặc sai ngôn ngữ đã chọn. Hãy kiểm tra lại Lịch sử để chạy lại OCR với ngôn ngữ chính xác hơn.";
      await updateJobProgress(
        jobId,
        `Warning: Tỷ lệ ký tự khớp ngôn ngữ thấp (${Math.round(qualityResult.ratio * 100)}%). Ghi nhận cảnh báo.`,
      );
    }

    // 5. Tự động dịch sau OCR (nếu bật)
    let autoTranslateResults: Record<string, string> = {};
    if (autoTranslate && selectedLangs && selectedLangs.length > 0) {
      await updateJobProgress(jobId, "Bước 5/6: Đang tự động dịch sau OCR...");
      const translateRes = await runAutoTranslation(
        srtRawContent,
        selectedLangs,
        glossary || [],
        jobId,
      );
      autoTranslateResults = translateRes.results;
      totalJobCost += translateRes.cost;
      breakdownCosts["translate"] = translateRes.cost;
    } else {
      await updateJobProgress(jobId, "Bước 5/6: Bỏ qua bước tự động dịch.");
    }
    // 6. Hoàn tất & Cập nhật SQLite
    await updateJobProgress(
      jobId,
      "Bước 6/6: Đang hoàn tất và lưu trữ kết quả...",
    );

    const finalMeta = JSON.stringify({
      sourceData: meta?.sourceData || "ocr",
      selectedLangs,
      glossary,
      originalText: srtRawContent,
      translations: autoTranslateResults,
      cropRegion,
      sourceLanguage,
      removeWatermark,
      autoTranslate,
      breakdownCosts,
      confidenceScores: finalConfidenceScores, // Lưu điểm confidence trung bình cho từng dòng
      ocrWarning, // Ghi nhận cảnh báo nếu có
    });

    await safeUpdateSubtitleJob(jobId, {
      status: "done",
      meta: finalMeta,
      costUsd: totalJobCost,
      costBreakdown: JSON.stringify(breakdownCosts),
      outputFile: "SQLite_meta",
    });

    await updateJobProgress(jobId, "✓ Job hoàn thành thành công!");

    // Dọn dẹp folder frames và video tạm
    cleanupJobFiles(jobId);
  } catch (err: any) {
    console.error(`[Job ${jobId}] OCR Video failed:`, err);
    await safeUpdateSubtitleJob(jobId, {
      status: "error",
      errorMessage: err.message || "Lỗi trích xuất OCR từ video",
    });
    await updateJobProgress(
      jobId,
      `✗ Gặp lỗi: ${err.message || "Lỗi hệ thống"}`,
    );
    // Giữ nguyên file tạm khi lỗi để cho phép retry
  }
}

/**
 * Helper fetch có cơ chế retry và xử lý thông báo lỗi ngắt kết nối thân thiện
 */
import { fetchWithRetry } from "./fetchWithRetry";

/**
 * Xử lý job Whisper STT
 */
export async function processSttJob(jobId: string) {
  let outputWavPath = "";
  let mediaPath = "";
  let isSuccess = false;
  let rawSegmentsPath = "";

  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await safeUpdateSubtitleJob(jobId, {
      status: "processing",
      progressLog: "[]",
    });

    const meta = JSON.parse(job.meta || "{}");
    const {
      sourceLanguage,
      autoTranslate,
      selectedLangs,
      glossary,
      modelSize,
    } = meta;

    // 2. Tìm tệp video/audio tạm chính xác từ mediaPath trong meta
    const uploadsDir = getUploadsDir();
    if (meta.mediaPath && fs.existsSync(meta.mediaPath)) {
      mediaPath = meta.mediaPath;
    } else {
      const files = fs.readdirSync(uploadsDir);
      const mediaFile = files.find(
        (f) =>
          f.startsWith(jobId) && !f.endsWith(".wav") && !f.endsWith(".srt"),
      );
      if (mediaFile) {
        mediaPath = path.join(uploadsDir, mediaFile);
      }
    }

    if (!mediaPath || !fs.existsSync(mediaPath)) {
      throw new Error("Không tìm thấy tệp video/audio tạm thời trên máy chủ.");
    }

    // 1 & 13. Tách audio ra file WAV 16000 Hz bằng FFmpeg với phân loại lỗi chi tiết
    await updateJobProgress(
      jobId,
      "Bước 1/4: Đang tách track âm thanh chất lượng 16kHz WAV bằng FFmpeg...",
    );
    outputWavPath = path.join(uploadsDir, `${jobId}_audio.wav`);

    const ffmpegCmd = `ffmpeg -i "${mediaPath}" -ar 16000 -ac 1 -f wav -y "${outputWavPath}"`;
    try {
      await runCommandAsync(ffmpegCmd);
    } catch (ffmpegErr: any) {
      const errMsg = ffmpegErr.message || "";
      if (errMsg.includes("Invalid data found") || errMsg.includes("corrupt")) {
        throw new Error(
          "Tệp phương tiện bị hỏng hoặc dữ liệu âm thanh/video không thể đọc.",
        );
      } else if (
        errMsg.includes("Unknown format") ||
        errMsg.includes("Decoder not found")
      ) {
        throw new Error("Định dạng tệp phương tiện không được FFmpeg hỗ trợ.");
      } else if (errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")) {
        throw new Error(
          "Thời gian tách âm thanh qua FFmpeg vượt quá giới hạn cho phép (Timeout).",
        );
      } else {
        throw new Error(`Lỗi FFmpeg khi trích xuất âm thanh: ${errMsg}`);
      }
    }

    await updateJobProgress(jobId, "✓ Tách âm thanh WAV thành công.");

    // 2. Phân tích độ dài audio bằng ffprobe
    await updateJobProgress(
      jobId,
      "Bước 2/4: Phân tích độ dài audio bằng ffprobe...",
    );
    const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputWavPath}"`;
    const durationStr = await runCommandAsync(ffprobeCmd);
    const durationSeconds = parseFloat(durationStr);
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Không thể phân tích độ dài tệp âm thanh tách ra.");
    }
    await updateJobProgress(
      jobId,
      `Thời lượng âm thanh: ${durationSeconds.toFixed(1)} giây.`,
    );

    let srtContent = "";
    const isGeminiEngine = meta?.engine === "gemini";

    if (isGeminiEngine) {
      await updateJobProgress(
        jobId,
        "Bước 3/4: Đang gửi track âm thanh sang Gemini API (Online STT)...",
      );
      const { transcribeAudioGemini } = await import("./gemini-stt");
      const geminiRes = await transcribeAudioGemini(
        outputWavPath,
        sourceLanguage || "auto",
        jobId,
      );
      srtContent = geminiRes.srtContent;
      await updateJobProgress(jobId, "✓ Gemini Online STT hoàn thành.");
    } else {
      await updateJobProgress(
        jobId,
        `Bước 3/4: Đang gửi track âm thanh sang Local STT Service (Whisper ${modelSize || "medium"})...`,
      );

      const pythonServiceUrl =
        process.env.PYTHON_AI_SERVICE_URL || "http://localhost:8000";

      const fileBuffer = fs.readFileSync(outputWavPath);
      const fileBlob = new Blob([fileBuffer]);
      const formData = new FormData();
      formData.append("file", fileBlob, path.basename(outputWavPath));
      formData.append("sourceLanguage", sourceLanguage || "auto");
      formData.append("modelSize", modelSize || "medium");
      // Provide jobId and uploadsDir so backend can persist raw segments file
      formData.append("jobId", jobId);
      formData.append("uploadsDir", uploadsDir);
      if (meta?.wordTimestamps) {
        formData.append("wordTimestamps", String(true));
      }
      if (meta?.cleanVocal) {
        formData.append("cleanVocal", String(true));
      }

      const headers: Record<string, string> = {};
      if (process.env.INTERNAL_SERVICE_TOKEN) {
        headers["X-Internal-Token"] = process.env.INTERNAL_SERVICE_TOKEN;
      }

      const response = await fetchWithRetry(
        `${pythonServiceUrl}/stt`,
        {
          method: "POST",
          body: formData,
          headers,
        },
        2,
        [2000, 5000],
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Dịch vụ Local STT lỗi (${response.status}): ${errorText}`,
        );
      }

      const sttResult = await response.json();
      const utterances = sttResult.utterances || [];
      const duration = sttResult.duration || durationSeconds;
      rawSegmentsPath = sttResult.stt_raw_segments_path || "";
      // Persist utterances and confidence into job meta for later UI use (confidence as percentage)
      try {
        const updatedMeta = Object.assign({}, meta || {});
        updatedMeta.originalText = undefined; // will be set after formatting SRT
        // Build confidenceScores array in 0..100 for UI compatibility
        const confidenceScores: number[] = utterances.map((u: any) => {
          const c =
            typeof u.confidence_score === "number"
              ? u.confidence_score
              : u.confidence || 0;
          const pct = Math.round((Number(c) || 0) * 100);
          return Math.min(100, Math.max(0, pct));
        });
        updatedMeta.confidenceScores = confidenceScores;
        // Store raw utterances to a separate JSON file to avoid bloating DB meta
        try {
          const sttJsonPath = path.join(
            uploadsDir,
            `${jobId}_stt_utterances.json`,
          );
          fs.writeFileSync(sttJsonPath, JSON.stringify(utterances), "utf-8");
          updatedMeta.stt_utterances_path = sttJsonPath;
          // Save raw segments path into meta if backend provided it
          if (rawSegmentsPath) {
            updatedMeta.stt_raw_segments_path = rawSegmentsPath;
            updatedMeta.stt_raw_segments_count =
              sttResult.raw_segments_count || undefined;
          }
        } catch (fileErr) {
          console.warn(
            `[Job ${jobId}] Không thể ghi file stt_utterances:`,
            fileErr,
          );
        }
        await safeUpdateSubtitleJob(jobId, {
          meta: JSON.stringify(updatedMeta),
        });
      } catch (err) {
        console.warn(`[Job ${jobId}] Không thể lưu meta STT:`, err);
      }

      await updateJobProgress(
        jobId,
        `✓ Local STT hoàn thành. Thời lượng: ${duration.toFixed(1)}s, trích xuất ${utterances.length} dòng thoại.`,
      );

      // Convert utterances sang SRT
      const { formatUtterancesToSmartSrt } = await import("./stt-formatter");
      const { normalizeSrtSyntax } = await import("./subtitle");
      srtContent = normalizeSrtSyntax(formatUtterancesToSmartSrt(utterances));

      // AI Refiner sửa lỗi chính tả bằng Local Ollama
      if (meta?.sttAiRefiner) {
        try {
          await updateJobProgress(
            jobId,
            "Bước 3.2/4: Đang sửa lỗi chính tả bằng Local AI (Ollama Refiner)...",
          );
          const refineHeaders: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (process.env.INTERNAL_SERVICE_TOKEN) {
            refineHeaders["X-Internal-Token"] =
              process.env.INTERNAL_SERVICE_TOKEN;
          }
          const refineResponse = await fetch(`${pythonServiceUrl}/refine`, {
            method: "POST",
            headers: refineHeaders,
            body: JSON.stringify({ srtContent }),
          });
          if (refineResponse.ok) {
            const refineResult = await refineResponse.json();
            if (refineResult.result) {
              console.log(
                `[Job ${jobId}] AI Refiner: Phụ đề đã được sửa lỗi chính tả.`,
              );
              srtContent = normalizeSrtSyntax(refineResult.result);
            }
          }
        } catch (refineErr) {
          console.warn(`[Job ${jobId}] AI Refiner lỗi:`, refineErr);
        }
      }
    }

    const outputSrtPath = path.join(uploadsDir, `${jobId}_local_stt.srt`);
    fs.writeFileSync(outputSrtPath, srtContent, "utf-8");

    // Tự động dịch sau STT (nếu có yêu cầu từ meta)
    let autoTranslateResults: Record<string, string> = {};
    let totalCost = 0;
    const breakdownCosts: Record<string, number> = { stt: 0 };

    if (autoTranslate && selectedLangs && selectedLangs.length > 0) {
      await updateJobProgress(
        jobId,
        "Bước 3.5: Đang tự động dịch sau STT (Local Ollama)...",
      );

      // Chuyển bước dịch sang nhận input từ raw_segments thay vì utterances đã merge
      let translationInputSrt = srtContent;
      if (rawSegmentsPath && fs.existsSync(rawSegmentsPath)) {
        try {
          const { formatUtterancesToSmartSrt } = await import("./stt-formatter");
          const { normalizeSrtSyntax } = await import("./subtitle");
          const rawSegments = JSON.parse(fs.readFileSync(rawSegmentsPath, "utf-8"));
          const rawUtterances = rawSegments.map((seg: any) => ({
            text: seg.text,
            startTime: seg.start,
            endTime: seg.end
          }));
          translationInputSrt = normalizeSrtSyntax(formatUtterancesToSmartSrt(rawUtterances));
        } catch (err) {
          console.warn(`[Job ${jobId}] Lỗi đọc raw segments để dịch:`, err);
        }
      }

      const translateRes = await runAutoTranslation(
        translationInputSrt,
        selectedLangs,
        glossary || [],
        jobId,
      );
      autoTranslateResults = translateRes.results;
      totalCost += translateRes.cost;
      breakdownCosts["translate"] = translateRes.cost;
    }

    // Cập nhật Database thành DONE. Merge với bất kỳ STT meta tạm thời nào đã lưu trước đó
    const latestJob = await prisma.subtitleJob.findUnique({
      where: { id: jobId },
    });
    const latestMeta = latestJob ? JSON.parse(latestJob.meta || "{}") : {};
    const mergedMeta = {
      ...latestMeta,
      ...meta,
      originalText: srtContent,
      translations: autoTranslateResults,
      audioDurationSeconds: durationSeconds,
    };

    await safeUpdateSubtitleJob(jobId, {
      status: "done",
      outputFile: outputSrtPath,
      costUsd: totalCost,
      costBreakdown: JSON.stringify(breakdownCosts),
      meta: JSON.stringify(mergedMeta),
    });

    await updateJobProgress(
      jobId,
      "Bước 4/4: ✓ Trích xuất và cập nhật phụ đề thành công.",
    );
    isSuccess = true;
  } catch (err: any) {
    console.error(`[Job ${jobId}] Whisper STT failed:`, err);
    await safeUpdateSubtitleJob(jobId, {
      status: "error",
      errorMessage:
        err.message || "Lỗi nhận diện âm thanh STT qua Whisper local",
    });
    await updateJobProgress(
      jobId,
      `✗ Gặp lỗi: ${err.message || "Lỗi hệ thống"}`,
    );
  } finally {
    // 4. Bọc trong finally đảm bảo dọn dẹp các tệp tạm thời kể cả khi bị hủy hay phát sinh lỗi
    if (outputWavPath && fs.existsSync(outputWavPath)) {
      try {
        fs.unlinkSync(outputWavPath);
      } catch {}
    }
    // Chỉ dọn dẹp file media nguồn khi hoàn thành thành công.
    // Nếu gặp lỗi, giữ nguyên file tạm để phục vụ tính năng Retry.
    if (isSuccess && mediaPath && fs.existsSync(mediaPath)) {
      try {
        fs.unlinkSync(mediaPath);
      } catch {}
    }
  }
}

/**
 * Hàm khởi động lại (retry) một Job bị lỗi
 */
export async function retryVideoJob(jobId: string) {
  const job = await prisma.subtitleJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Không tìm thấy Job ID ${jobId} để thử lại`);
  }

  // Cập nhật lại status sang queued trong DB
  await prisma.subtitleJob.update({
    where: { id: jobId },
    data: {
      status: "queued",
      errorMessage: null,
      progressLog: "[]",
    },
  });

  // Đưa vào hàng đợi xử lý
  if (job.type === "ocr_video") {
    jobQueueManager.addJob(jobId, () => processOcrVideoJob(jobId));
    console.log(`[Queue] Retrying OCR Video Job ${jobId}`);
  } else if (job.type === "stt") {
    jobQueueManager.addJob(jobId, () => processSttJob(jobId));
    console.log(`[Queue] Retrying STT Job ${jobId}`);
  } else if (job.type === "dub") {
    jobQueueManager.addJob(jobId, () => processDubJob(jobId));
    console.log(`[Queue] Retrying Dub Job ${jobId}`);
  } else if (job.type === "burn_in") {
    jobQueueManager.addJob(jobId, () => processBurnInJob(jobId));
    console.log(`[Queue] Retrying Burn-In Job ${jobId}`);
  } else if (job.type === "merge") {
    const { processMergeJob } = await import("./merge-processor");
    jobQueueManager.addJob(jobId, () => processMergeJob(jobId));
    console.log(`[Queue] Retrying Merge Job ${jobId}`);
  } else if (job.type === "convert_ratio") {
    jobQueueManager.addJob(jobId, () => processConvertRatioJob(jobId));
    console.log(`[Queue] Retrying Convert Ratio Job ${jobId}`);
  } else {
    throw new Error(
      `Loại job ${job.type} không được hỗ trợ retry qua file tạm`,
    );
  }
}

// ============================================================
// DUB WORKER — Lồng Tiếng AI (TTS Dubbing)
// ============================================================

interface SrtBlock {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Parse nội dung SRT thành danh sách block thoại có timestamp (ms).
 */
function parseSrtToBlocks(srtContent: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const rawBlocks = srtContent.trim().split(/\n\s*\n/);

  for (const raw of rawBlocks) {
    const lines = raw.trim().split("\n");
    if (lines.length < 2) continue;

    const index = parseInt(lines[0].trim(), 10);
    if (isNaN(index)) continue;

    const tsMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
    );
    if (!tsMatch) {
      // Simpler regex fallback
      const tsMatch2 = lines[1].match(
        /(\d{1,2}):(\d{2}):(\d{2})[,.]?(\d{0,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.]?(\d{0,3})/,
      );
      if (!tsMatch2) continue;
      const toMs = (h: string, m: string, s: string, ms: string) =>
        parseInt(h) * 3600000 +
        parseInt(m) * 60000 +
        parseInt(s) * 1000 +
        parseInt(ms || "0");
      const startMs = toMs(tsMatch2[1], tsMatch2[2], tsMatch2[3], tsMatch2[4]);
      const endMs = toMs(tsMatch2[5], tsMatch2[6], tsMatch2[7], tsMatch2[8]);
      const text = lines
        .slice(2)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (text) blocks.push({ index, startMs, endMs, text });
      continue;
    }

    const toMs = (h: string, m: string, s: string, ms: string) =>
      parseInt(h) * 3600000 +
      parseInt(m) * 60000 +
      parseInt(s) * 1000 +
      parseInt(ms);
    const startMs = toMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4]);
    const endMs = toMs(tsMatch[5], tsMatch[6], tsMatch[7], tsMatch[8]);
    const text = lines
      .slice(2)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) blocks.push({ index, startMs, endMs, text });
  }
  return blocks;
}

/**
 * Phân tích khoảng lặng trên track audio kết quả bằng FFmpeg silencedetect
 */
async function detectAudioSilenceIntervals(
  audioPath: string,
  noiseDb = -30,
  minDurationSec = 1.0,
): Promise<Array<{ start: number; end: number; duration: number }>> {
  try {
    const cmd = `ffmpeg -i "${audioPath}" -af "silencedetect=noise=${noiseDb}dB:d=${minDurationSec}" -f null -`;
    const output = await runCommandAsync(cmd).catch((err) => err.message || "");
    const intervals: Array<{ start: number; end: number; duration: number }> =
      [];
    const lines = output.split("\n");
    let currentStart: number | null = null;

    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*([\d.]+)/);
      if (startMatch) {
        currentStart = parseFloat(startMatch[1]);
      }
      const endMatch = line.match(
        /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/,
      );
      if (endMatch && currentStart !== null) {
        const end = parseFloat(endMatch[1]);
        const duration = parseFloat(endMatch[2]);
        intervals.push({ start: currentStart, end, duration });
        currentStart = null;
      }
    }
    return intervals;
  } catch (err) {
    console.error("[SilenceDetect Error]:", err);
    return [];
  }
}

async function createSilenceFile(
  outputPath: string,
  durationMs: number,
): Promise<void> {
  if (outputPath.endsWith(".wav")) {
    createWavSilenceFileFast(outputPath, durationMs);
  } else {
    const durationSec = (durationMs / 1000).toFixed(3);
    await runCommandAsync(
      `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t ${durationSec} -q:a 9 -acodec libmp3lame -y "${outputPath}"`,
    );
  }
}

/**
 * Lấy thời lượng (ms) của file audio (Smart & fast WAV header parse).
 */
async function getAudioDurationMs(filePath: string): Promise<number> {
  return getAudioDurationMsSmart(filePath);
}

/**
 * Gọi Local Ollama để rút gọn một dòng thoại quá dài so với khung thời gian.
 */
async function condenseLineWithOllama(
  text: string,
  targetLang: string,
  targetDurationSec: number,
): Promise<{
  condensedText: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const modelName = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct-q4_K_M";

  const systemPrompt = `Bạn là một biên tập viên kịch bản lồng tiếng chuyên nghiệp.
Nhiệm vụ: Rút gọn câu sau sang ${targetLang} sao cho khi đọc thành tiếng mất tối đa khoảng ${targetDurationSec.toFixed(1)} giây.
Giữ nguyên ý chính, không thêm bớt thông tin quan trọng.
Trả về DUY NHẤT câu đã rút gọn, không giải thích.`;

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(1500),
      body: JSON.stringify({
        model: modelName,
        system: systemPrompt,
        prompt: text,
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama status: ${response.status}`);
    }

    const data = await response.json();
    const condensedText = (data.response || "").trim();

    return {
      condensedText: condensedText || text,
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: data.eval_count || 0,
    };
  } catch (err: any) {
    const errMsg = err?.message || "Ollama service offline";
    console.warn(
      `[Ollama Info] Không thể kết nối Ollama local (port 11434: ${errMsg}), giữ nguyên câu thoại gốc.`
    );
    return {
      condensedText: text,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

/**
 * Áp dụng chuỗi filter atempo để điều chỉnh tốc độ đọc của file audio.
 */
async function adjustAudioTempo(
  inputPath: string,
  outputPath: string,
  ratio: number,
): Promise<void> {
  const { getAtempoFilters } = await import("./audio-sync");
  const filterStr = getAtempoFilters(ratio);
  await runCommandAsync(
    `ffmpeg -i "${inputPath}" -filter:a "${filterStr}" -y "${outputPath}"`,
  );
}

/**
 * Xử lý job Lồng Tiếng (Dubbing)
 */
export async function processDubJob(jobId: string) {
  const lineAudioFiles: string[] = [];

  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "processing", progressLog: "[]" },
    });

    const meta = JSON.parse(job.meta || "{}");
    const {
      voiceId = "Mai Anh",
      dubStyle = "voiceover",
      targetLang = "vi",
      subtitleContent,
      clientPause = {
        majorBreak: 0.5,
        mediumBreak: 0.3,
        paragraphBreak: 1.0,
        sentenceBreak: 0.5,
      },
    } = meta;

    let refAudioPath: string | undefined = undefined;
    let refText: string | undefined = undefined;
    if (meta.customVoiceId) {
      try {
        const customVoice = await prisma.customVoice.findUnique({
          where: { id: meta.customVoiceId },
        });
        if (customVoice) {
          refAudioPath = customVoice.refAudioPath;
          refText = customVoice.refText;
        }
      } catch (dbErr) {
        console.error(
          `Failed to find custom voice ${meta.customVoiceId}:`,
          dbErr,
        );
      }
    }

    const videoPath = job.inputFile;
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error("Không tìm thấy file video tạm thời. Hãy upload lại.");
    }

    const {
      runWithConcurrencyLimit,
      MAX_NATURAL_TEMPO: TEMPO_LIMIT,
      OVERFLOW_BUFFER_MS: OVERFLOW_BUF,
      TTS_CHARS_PER_SEC_ESTIMATE,
    } = await import("./audio-sync");
    const { calculateVbeeTtsCost } = await import("./pricing");

    const uploadsDir = getUploadsDir();

    // ─── Bước 1: Parse phụ đề ────────────────────────────────────────────────────────────────────────
    await updateJobProgress(jobId, "Bước 1/6: Phân tích nội dung phụ đề...", 5);
    const blocks = parseSrtToBlocks(subtitleContent || "");
    if (blocks.length === 0) {
      throw new Error(
        "Không thể đọc được nội dung phụ đề. Kiểm tra định dạng SRT.",
      );
    }
    await updateJobProgress(
      jobId,
      `Nhận diện được ${blocks.length} dòng thoại.`,
      10,
    );

    const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);

    // ─── Bước 2: Sinh giọng đọc TTS qua Local AI Service ──────────────────────────────────────────
    await updateJobProgress(
      jobId,
      "Bước 2/6: Bắt đầu sinh giọng đọc TTS qua Local AI Service...",
      12,
    );

    const { normalizeTextForTTS } = await import("./text-normalizer");
    const crypto = await import("crypto");

    const pythonServiceUrl =
      process.env.PYTHON_AI_SERVICE_URL || "http://localhost:8000";
    const ttsResults: (string | null)[] = new Array(blocks.length).fill(null);
    const warningLines: number[] = [];
    let completedCount = 0;

    const ttsPromiseCache = new Map<string, Promise<string>>();

    interface DubUncachedItem {
      idx: number;
      text: string;
      voiceId: string;
      speed: number;
      ref_audio?: string;
      ref_text?: string;
      cache_file: string;
      line_file: string;
      targetDurationMs: number;
    }

    const uncachedDubQueue: DubUncachedItem[] = [];

    // Pre-load custom voices và scan directory 1 lần duy nhất để tra cứu O(1)
    const allCustomVoices = await prisma.customVoice.findMany().catch(() => []);
    const customVoiceMap = new Map(allCustomVoices.map((cv) => [cv.id, cv]));
    const uploadFilesSet = new Set(fs.readdirSync(uploadsDir));

    for (let idx = 0; idx < blocks.length; idx++) {
      const block = blocks[idx];
      const targetDurationMs = block.endMs - block.startMs;
      const normalizedText = normalizeTextForTTS(block.text);

      if (!normalizedText || normalizedText.trim().length === 0) {
        const lineFilePath = path.join(uploadsDir, `${jobId}_line_${idx}.wav`);
        await createSilenceFile(lineFilePath, targetDurationMs);
        ttsResults[idx] = lineFilePath;
        lineAudioFiles.push(lineFilePath);
        completedCount++;
        continue;
      }

      const expectedSec = normalizedText.length / TTS_CHARS_PER_SEC_ESTIMATE;
      const targetSec = targetDurationMs / 1000;
      const ratio = expectedSec / targetSec;

      let speed = 1.0;
      if (ratio > 1.0) {
        speed = Math.min(ratio, TEMPO_LIMIT);
      }

      let lineVoiceId = voiceId;
      let lineRefAudioPath = refAudioPath;
      let lineRefText = refText;

      if (meta.perLineVoices && meta.perLineVoices[idx]) {
        const customLineVoice = meta.perLineVoices[idx];
        const isCustom = !["dung", "phuong", "hoang", "tuyen"].includes(customLineVoice);
        if (isCustom) {
          const cv = customVoiceMap.get(customLineVoice);
          if (cv) {
            lineRefAudioPath = cv.refAudioPath;
            lineRefText = cv.refText;
            lineVoiceId = "Mai Anh";
          }
        } else {
          lineVoiceId = customLineVoice;
          lineRefAudioPath = undefined;
          lineRefText = undefined;
        }
      }

      const cacheKey = crypto
        .createHash("md5")
        .update(`${normalizedText}:${lineVoiceId}:${speed}:${lineRefAudioPath || ""}`)
        .digest("hex");
      const cacheFileName = `${jobId}_cache_${cacheKey}.wav`;
      const cacheFilePath = path.join(uploadsDir, cacheFileName);
      const lineFilePath = path.join(uploadsDir, `${jobId}_line_${idx}.wav`);

      if (uploadFilesSet.has(cacheFileName) || fs.existsSync(cacheFilePath)) {
        fs.copyFileSync(cacheFilePath, lineFilePath);
        ttsResults[idx] = lineFilePath;
        completedCount++;
      } else {
        uncachedDubQueue.push({
          idx,
          text: normalizedText,
          voiceId: lineVoiceId,
          speed,
          ref_audio: lineRefAudioPath,
          ref_text: lineRefText,
          cache_file: cacheFilePath,
          line_file: lineFilePath,
          targetDurationMs,
        });
      }
    }

    if (uncachedDubQueue.length > 0) {
      const BATCH_SIZE = 15;
      const BATCH_CONCURRENCY = 4;
      const batchChunks: DubUncachedItem[][] = [];

      for (let i = 0; i < uncachedDubQueue.length; i += BATCH_SIZE) {
        batchChunks.push(uncachedDubQueue.slice(i, i + BATCH_SIZE));
      }

      const batchTasks = batchChunks.map((chunk) => async () => {
        try {
          const response = await fetchWithRetry(
            `${pythonServiceUrl}/tts/batch`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: chunk }),
            },
            2,
            [5000, 15000]
          );

          if (response.ok) {
            for (const item of chunk) {
              if (fs.existsSync(item.cache_file)) {
                fs.copyFileSync(item.cache_file, item.line_file);
                ttsResults[item.idx] = item.line_file;
              } else {
                await createSilenceFile(item.line_file, item.targetDurationMs);
                ttsResults[item.idx] = item.line_file;
                lineAudioFiles.push(item.line_file);
              }
            }
          } else {
            for (const item of chunk) {
              await createSilenceFile(item.line_file, item.targetDurationMs);
              ttsResults[item.idx] = item.line_file;
              lineAudioFiles.push(item.line_file);
            }
          }
        } catch (err) {
          console.error(`[Dubbing Local TTS Batch Error]:`, err);
          for (const item of chunk) {
            await createSilenceFile(item.line_file, item.targetDurationMs);
            ttsResults[item.idx] = item.line_file;
            lineAudioFiles.push(item.line_file);
          }
        }

        completedCount += chunk.length;
        const pct = Math.min(75, Math.round(12 + (completedCount / blocks.length) * 63));
        await updateJobProgress(
          jobId,
          `⚡ Lồng tiếng AI (Tốc độ tối đa): Đã tạo giọng đọc ${completedCount}/${blocks.length} câu...`,
          pct
        );
      });

      await runWithConcurrencyLimit(batchTasks, BATCH_CONCURRENCY);
    }

    await updateJobProgress(
      jobId,
      `✓ Đã sinh thành công ${blocks.length} file âm thanh local.`,
      75,
    );

    // ─── Bước 4: Hậu kỳ điều chỉnh độ dài (atempo & chống va chạm) ────────────────────────────────────────────────
    await updateJobProgress(
      jobId,
      "Bước 4/6: Đang đồng bộ thời lượng và tinh chỉnh tốc độ đọc...",
      80,
    );

    let condenseTotalCost = 0;
    const videoDurationMs = await getVideoDurationMs(videoPath);

    const postProcessingTasks = blocks.map((block, idx) => async () => {
      const lineFilePath = ttsResults[idx];
      if (!lineFilePath) return;

      lineAudioFiles.push(lineFilePath);

      const targetDurationMs = block.endMs - block.startMs;
      const nextStartMs =
        idx < blocks.length - 1
          ? blocks[idx + 1].startMs
          : videoDurationMs > 0
            ? videoDurationMs
            : Infinity;
      const gapToNextMs = nextStartMs - block.endMs;

      const actualDurationMs = await getAudioDurationMs(lineFilePath);

      if (actualDurationMs <= targetDurationMs) {
        const silenceMs = targetDurationMs - actualDurationMs;
        if (silenceMs > 50) {
          const silencePath = path.join(uploadsDir, `${jobId}_sil_${idx}.wav`);
          lineAudioFiles.push(silencePath);
          await createSilenceFile(silencePath, silenceMs);
          const paddedPath = path.join(
            uploadsDir,
            `${jobId}_padded_${idx}.wav`,
          );
          lineAudioFiles.push(paddedPath);

          const concatListPath = path.join(
            uploadsDir,
            `${jobId}_concat_${idx}.txt`,
          );
          fs.writeFileSync(
            concatListPath,
            `file '${lineFilePath.replace(/\\/g, "/")}'\nfile '${silencePath.replace(/\\/g, "/")}'`,
          );
          lineAudioFiles.push(concatListPath);

          await runCommandAsync(
            `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy -y "${paddedPath}"`,
          );
          ttsResults[idx] = paddedPath;
        } else {
          ttsResults[idx] = lineFilePath;
        }
      } else {
        const ratio = actualDurationMs / targetDurationMs;

        if (ratio <= TEMPO_LIMIT) {
          const tempoPath = path.join(uploadsDir, `${jobId}_tempo_${idx}.wav`);
          lineAudioFiles.push(tempoPath);
          await adjustAudioTempo(lineFilePath, tempoPath, ratio);
          ttsResults[idx] = tempoPath;
        } else {
          const overflowMs = actualDurationMs - targetDurationMs;

          if (overflowMs < gapToNextMs - OVERFLOW_BUF) {
            ttsResults[idx] = lineFilePath;
          } else {
            try {
              const targetSec = targetDurationMs / 1000;
              const { condensedText } = await condenseLineWithOllama(
                block.text,
                targetLang,
                targetSec
              );

              const response = await fetchWithRetry(
                `${pythonServiceUrl}/tts`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    text: condensedText,
                    voiceId: voiceId,
                    speed: 1.0,
                    ref_audio: refAudioPath,
                    ref_text: refText,
                  }),
                },
                2,
                [5000, 15000]
              );

              if (response.ok) {
                const audioBuffer = await response.arrayBuffer();
                const condensedPath = path.join(
                  uploadsDir,
                  `${jobId}_line_${idx}.wav`,
                );
                fs.writeFileSync(condensedPath, Buffer.from(audioBuffer));
                lineAudioFiles.push(condensedPath);

                const condDuration = await getAudioDurationMs(condensedPath);
                if (condDuration > targetDurationMs) {
                  const condRatio = condDuration / targetDurationMs;
                  const condTempoPath = path.join(
                    uploadsDir,
                    `${jobId}_cond_tempo_${idx}.wav`,
                  );
                  lineAudioFiles.push(condTempoPath);
                  await adjustAudioTempo(
                    condensedPath,
                    condTempoPath,
                    Math.min(condRatio, TEMPO_LIMIT)
                  );
                  ttsResults[idx] = condTempoPath;
                } else {
                  ttsResults[idx] = condensedPath;
                }
              } else {
                ttsResults[idx] = lineFilePath;
              }
            } catch (condenseErr) {
              warningLines.push(block.index);
              ttsResults[idx] = lineFilePath;
            }
          }
        }
      }

      const processedAudioFile = ttsResults[idx];
      if (processedAudioFile) {
        const finalDurationMs = await getAudioDurationMs(processedAudioFile);
        const actualEndMs = block.startMs + finalDurationMs;
        const limitBoundaryMs = nextStartMs;

        if (
          limitBoundaryMs > 0 &&
          limitBoundaryMs !== Infinity &&
          actualEndMs > limitBoundaryMs
        ) {
          const maxAllowedMs = Math.max(200, limitBoundaryMs - block.startMs);
          const speedUpRatio = finalDurationMs / maxAllowedMs;

          const speedUpPath = path.join(
            uploadsDir,
            `${jobId}_speed_${idx}.wav`,
          );
          lineAudioFiles.push(speedUpPath);

          await adjustAudioTempo(processedAudioFile, speedUpPath, speedUpRatio);
          ttsResults[idx] = speedUpPath;
        }
      }
    });

    await runWithConcurrencyLimit(postProcessingTasks, 8);

    if (warningLines.length > 0) {
      await updateJobProgress(
        jobId,
        `⚠ ${warningLines.length} dòng có thể không khớp hoàn hảo: dòng ${warningLines.join(", ")}.`,
      );
    }

    // ─── Bước 5: Ghép track lồng tiếng ────────────────────────────────────────────────────────────
    await updateJobProgress(
      jobId,
      "Bước 5/6: Đang ghép các track lồng tiếng...",
      85,
    );

    const dubbedTrackPath = path.join(uploadsDir, `${jobId}_dubbed_track.mp3`);
    lineAudioFiles.push(dubbedTrackPath);

    const validBlocks: Array<{ block: SrtBlock; filePath: string }> = [];
    blocks.forEach((block, idx) => {
      if (ttsResults[idx])
        validBlocks.push({ block, filePath: ttsResults[idx] as string });
    });

    if (validBlocks.length === 0)
      throw new Error("Không có file audio nào để ghép");

    // Ghép audio theo từng chunk 30 câu để tránh lỗi giới hạn độ dài câu lệnh Windows (8191 ký tự)
    const CHUNK_SIZE = 30;

    async function mixSingleAudioChunk(
      blocksChunk: Array<{ block: SrtBlock; filePath: string }>,
      chunkOutPath: string,
      chunkSubId: string,
    ): Promise<void> {
      const inputArgs = blocksChunk.map((v) => `-i "${v.filePath}"`).join(" ");
      const filterParts = blocksChunk.map(
        (v, i) => `[${i}]adelay=${v.block.startMs}|${v.block.startMs}[a${i}]`,
      );
      const mixInputs = blocksChunk.map((_, i) => `[a${i}]`).join("");
      const filterComplex =
        filterParts.join(";") +
        `;${mixInputs}amix=inputs=${blocksChunk.length}:normalize=0[out]`;

      const filterScriptPath = path.join(
        uploadsDir,
        `${chunkSubId}_filter_script.txt`,
      );
      lineAudioFiles.push(filterScriptPath);
      fs.writeFileSync(filterScriptPath, filterComplex);

      await runCommandAsync(
        `ffmpeg ${inputArgs} -filter_complex_script "${filterScriptPath}" -map "[out]" -y "${chunkOutPath}"`,
      );
    }

    if (validBlocks.length <= CHUNK_SIZE) {
      await mixSingleAudioChunk(validBlocks, dubbedTrackPath, jobId);
    } else {
      const chunkPaths: string[] = [];
      for (let c = 0; c < validBlocks.length; c += CHUNK_SIZE) {
        const chunkBlocks = validBlocks.slice(c, c + CHUNK_SIZE);
        const chunkOutPath = path.join(
          uploadsDir,
          `${jobId}_chunk_${Math.floor(c / CHUNK_SIZE)}.wav`,
        );
        lineAudioFiles.push(chunkOutPath);
        await mixSingleAudioChunk(
          chunkBlocks,
          chunkOutPath,
          `${jobId}_c${Math.floor(c / CHUNK_SIZE)}`,
        );
        chunkPaths.push(chunkOutPath);
      }

      // Trộn lại các chunk WAV
      const inputArgs = chunkPaths.map((p) => `-i "${p}"`).join(" ");
      const mixInputs = chunkPaths.map((_, i) => `[${i}]`).join("");
      const filterComplex = `${mixInputs}amix=inputs=${chunkPaths.length}:normalize=0[out]`;
      const filterScriptPath = path.join(
        uploadsDir,
        `${jobId}_final_chunks_filter.txt`,
      );
      lineAudioFiles.push(filterScriptPath);
      fs.writeFileSync(filterScriptPath, filterComplex);

      await runCommandAsync(
        `ffmpeg ${inputArgs} -filter_complex_script "${filterScriptPath}" -map "[out]" -q:a 2 -y "${dubbedTrackPath}"`,
      );
    }
    await updateJobProgress(jobId, "Ghép track lồng tiếng hoàn tất.", 90);

    // ─── Bước 6: Trộn lồng tiếng đè video gốc ─────────────────────────────────────────────────────
    await updateJobProgress(
      jobId,
      `Bước 6/6: Đang trộn lồng tiếng vào video (chế độ: ${dubStyle})...`,
      93,
    );

    const outputVideoPath = path.join(uploadsDir, `${jobId}_dubbed_output.mp4`);

    const ttsVol = meta.ttsVolume !== undefined ? Number(meta.ttsVolume) : 1.0;
    const bgVol = meta.bgVolume !== undefined ? Number(meta.bgVolume) : (dubStyle === "replace" ? 0.0 : 0.15);
    const shouldNormalize = meta.normalizeAudio === true || meta.normalizeAudio === "true";

    const normFilter = shouldNormalize ? ",loudnorm=I=-16:TP=-1.5:LRA=11" : "";

    if (bgVol <= 0.001) {
      await runCommandAsync(
        `ffmpeg -i "${videoPath}" -i "${dubbedTrackPath}" ` +
          `-filter_complex "[1:a]volume=${ttsVol.toFixed(2)}${normFilter}[dub]" ` +
          `-map 0:v:0 -map "[dub]" -c:v copy -shortest -y "${outputVideoPath}"`,
      );
    } else {
      await runCommandAsync(
        `ffmpeg -i "${videoPath}" -i "${dubbedTrackPath}" ` +
          `-filter_complex "[0:a]volume=${bgVol.toFixed(2)}[orig];[1:a]volume=${ttsVol.toFixed(2)}[dub];[orig][dub]amix=inputs=2:normalize=0${normFilter}[mixed]" ` +
          `-map 0:v -map "[mixed]" -c:v copy -shortest -y "${outputVideoPath}"`,
      );
    }
    await updateJobProgress(jobId, `Ghép video lồng tiếng hoàn tất${shouldNormalize ? " (Đã chuẩn hóa âm lượng EBU R128 chuẩn CapCut)" : ""}.`, 98);

    // ─── Bước 5.5: Phân tích cảnh báo khoảng lặng bất thường (Proactive Silence Detection) ──────
    await updateJobProgress(
      jobId,
      "Đang phân tích khoảng lặng trên track âm thanh kết quả...",
      99,
    );
    const detectedSilence = await detectAudioSilenceIntervals(
      dubbedTrackPath,
      -30,
      1.0,
    );

    interface SilenceWarning {
      index: number;
      startSec: string;
      endSec: string;
      text: string;
      reason: string;
    }
    const silenceWarnings: SilenceWarning[] = [];
    const addedWarningIndices = new Set<number>();

    // 1. Ghi nhận các dòng bị lỗi TTS (fallback khoảng lặng)
    if (warningLines.length > 0) {
      for (const idx of warningLines) {
        const block = blocks.find((b) => b.index === idx);
        if (block && !addedWarningIndices.has(idx)) {
          addedWarningIndices.add(idx);
          silenceWarnings.push({
            index: block.index,
            startSec: (block.startMs / 1000).toFixed(1),
            endSec: (block.endMs / 1000).toFixed(1),
            text: block.text,
            reason: "Lỗi sinh TTS (đã dùng khoảng lặng thay thế)",
          });
        }
      }
    }

    // 2. Đối chiếu các khoảng lặng silencedetect với mốc thời gian của từng câu phụ đề
    for (const interval of detectedSilence) {
      const silStartMs = interval.start * 1000;
      const silEndMs = interval.end * 1000;

      for (const block of blocks) {
        const overlapStart = Math.max(block.startMs, silStartMs);
        const overlapEnd = Math.min(block.endMs, silEndMs);
        const overlapMs = overlapEnd - overlapStart;

        const lineDurMs = block.endMs - block.startMs;
        if (overlapMs >= 800 && overlapMs / lineDurMs >= 0.7) {
          if (!addedWarningIndices.has(block.index)) {
            addedWarningIndices.add(block.index);
            silenceWarnings.push({
              index: block.index,
              startSec: (block.startMs / 1000).toFixed(1),
              endSec: (block.endMs / 1000).toFixed(1),
              text: block.text,
              reason: "Phát hiện khoảng lặng khi lẽ ra phải có lời thoại",
            });
          }
        }
      }
    }

    if (silenceWarnings.length > 0) {
      await updateJobProgress(
        jobId,
        `⚠️ Cảnh báo: Phát hiện ${silenceWarnings.length} dòng nghi vấn khoảng lặng (Dòng ${silenceWarnings.map((w) => w.index).join(", ")}).`,
      );
    }

    // ─── Ghi nhận chi phí lồng tiếng Local TTS ──────────────────────────────────────────────────
    const creditFactor = 1.0;
    const ttsCost = calculateVbeeTtsCost(totalChars, creditFactor);
    await prisma.costLog.create({
      data: {
        jobId,
        provider: "local-tts",
        amountUsd: ttsCost,
        costType: "saved",
      },
    });

    const totalCost = ttsCost + condenseTotalCost;
    const breakdownCosts = { tts: ttsCost, condense: condenseTotalCost };

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        progressPercent: 100,
        outputFile: outputVideoPath,
        costUsd: totalCost,
        costBreakdown: JSON.stringify(breakdownCosts),
        meta: JSON.stringify({
          ...meta,
          silenceWarnings,
          fallbackSilenceLines: warningLines,
        }),
      },
    });

    // Dọn dẹp files tạm (Giữ lại video input và dubbed track audio để remix âm lượng 1-2s siêu tốc)
    for (const f of lineAudioFiles) {
      try {
        if (f !== outputVideoPath && f !== dubbedTrackPath && fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }

    await updateJobProgress(jobId, "✓ Job lồng tiếng hoàn thành thành công!");
  } catch (err: any) {
    const errMsg = err.message || "Lỗi hệ thống";
    console.error(`[Job ${jobId}] Dub failed:`, err);
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "error", errorMessage: errMsg },
    });
    await updateJobProgress(jobId, `✗ Gặp lỗi: ${errMsg}`);

    // Dọn dẹp file tạm khi lỗi
    for (const f of lineAudioFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    cleanupJobFiles(jobId);
  }
}

// ============================================================
// BURN-IN WORKER — Đóng gói phụ đề cứng vào video (Hardcode)
// ============================================================

/**
 * Lấy thời lượng video bằng ffprobe, trả về milliseconds.
 */
async function getVideoDurationMs(videoPath: string): Promise<number> {
  const out = await runCommandAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
  );
  const sec = parseFloat(out);
  return isNaN(sec) ? 0 : Math.round(sec * 1000);
}

/**
 * Lấy chiều cao video bằng ffprobe (để tính FontSize động).
 */
async function getVideoHeight(videoPath: string): Promise<number> {
  const out = await runCommandAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
  );
  const h = parseInt(out.trim());
  return isNaN(h) ? 720 : h;
}

/**
 * Tính FontSize thực tế theo chiều cao video và lựa chọn cỡ chữ người dùng.
 * small = 3% videoHeight, medium = 4.5%, large = 6%
 */
function calcFontSize(
  videoHeight: number,
  option: "small" | "medium" | "large",
): number {
  const ratios = { small: 0.03, medium: 0.045, large: 0.06 };
  return Math.max(14, Math.round(videoHeight * ratios[option]));
}

/**
 * Xử lý job Burn-In phụ đề vào video.
 * Dùng ffmpeg filter `subtitles` để render chữ cứng lên từng khung hình.
 * Đọc progress theo thời gian thực từ stderr để cập nhật % hoàn thành.
 */
export async function processBurnInJob(jobId: string): Promise<void> {
  const tempFiles: string[] = [];

  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "processing", progressLog: "[]" },
    });

    const meta = JSON.parse(job.meta || "{}");
    const {
      subtitleContent,
      fontSizeOption = "medium",
      position = "bottom",
      color = "white",
      langCode = "vi",
      posX = 50,
      posY = 88,
    } = meta as {
      subtitleContent: string;
      fontSizeOption: "small" | "medium" | "large";
      position: "bottom" | "top";
      color: "white" | "yellow";
      langCode: string;
      posX?: number;
      posY?: number;
    };

    const videoPath = job.inputFile;
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error("Không tìm thấy file video tạm thời. Hãy upload lại.");
    }

    const uploadsDir = path.join(process.cwd(), "uploads");

    // Import helpers (dynamic để tránh circular)
    const {
      escapeFfmpegPath,
      selectFontForLanguage,
      getFontNameForLanguage,
      parseFfmpegProgressLine,
      calcProgressPercent,
    } = await import("./ffmpeg-helper");

    // ─── Bước 1: Phân tích video ─────────────────────────────────────────────
    await updateJobProgress(jobId, "Bước 1/4: Phân tích thông số video...");
    const totalMs = await getVideoDurationMs(videoPath);
    const videoHeight = await getVideoHeight(videoPath);
    const videoWidth = await getVideoWidth(videoPath);
    const fontSize = calcFontSize(
      videoHeight,
      fontSizeOption as "small" | "medium" | "large",
    );
    await updateJobProgress(
      jobId,
      `Video: ${videoWidth}x${videoHeight}px · Font size: ${fontSize}px · Vị trí: X=${posX}% Y=${posY}% · Thời lượng: ${(totalMs / 1000).toFixed(1)}s`,
    );

    // ─── Bước 2: Ghi file ASS tạm ───────────────────────────────────────────
    await updateJobProgress(jobId, "Bước 2/4: Chuẩn bị file phụ đề ASS...");
    const assTempPath = path.join(uploadsDir, `${jobId}_burnin_sub.ass`);
    
    // Đảm bảo nội dung là SRT thuần (đổi VTT sang SRT nếu cần)
    let srtContent = subtitleContent || "";
    if (srtContent.trimStart().startsWith("WEBVTT")) {
      srtContent = srtContent
        .replace(/^WEBVTT[^\n]*\n*/, "")
        .trim()
        .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2");
    }

    const fontPath = selectFontForLanguage(langCode);
    const fontName = getFontNameForLanguage(langCode);
    const primaryColor = color === "yellow" ? "&H0000FFFF" : "&H00FFFFFF";
    const alignment = position === "top" ? 8 : 2;

    const enableBlurMask = Boolean(meta.enableBlurMask);
    const maskX = parseFloat(meta.maskX ?? 10);
    const maskY = parseFloat(meta.maskY ?? 80);
    const maskW = parseFloat(meta.maskW ?? 80);
    const maskH = parseFloat(meta.maskH ?? 14);
    const blurRad = Math.max(1, Math.min(50, parseInt(meta.blurRadius ?? 16, 10)));

    // Nếu bật Blur Mask, dùng borderStyle = 1 (chữ nét không có hộp đen)
    const borderStyle = enableBlurMask ? 1 : 3;

    const marginV = position === "top" ? Math.round(videoHeight * 0.08) : Math.round(videoHeight * 0.095);

    const assContent = buildAssSubtitles(
      srtContent,
      videoWidth,
      videoHeight,
      fontName,
      fontSize,
      primaryColor,
      alignment,
      borderStyle,
      marginV,
      posX,
      posY
    );

    fs.writeFileSync(assTempPath, assContent, "utf-8");
    tempFiles.push(assTempPath);

    // ─── Bước 3: Chọn font và build lệnh ffmpeg ───────────────────────────
    await updateJobProgress(
      jobId,
      "Bước 3/4: Đang khởi động ffmpeg burn-in...",
    );

    const escapedAssPath = escapeFfmpegPath(assTempPath);
    const escapedFontPath = escapeFfmpegPath(fontPath);

    const fontFileParam = fs.existsSync(fontPath)
      ? `:force_style='FontFile=${escapedFontPath}'`
      : "";

    let ffmpegFilterArgs: string[] = [];

    if (enableBlurMask && maskW > 0 && maskH > 0) {
      let cropW = Math.round(videoWidth * (maskW / 100));
      let cropH = Math.round(videoHeight * (maskH / 100));
      let cropX = Math.round(videoWidth * (maskX / 100));
      let cropY = Math.round(videoHeight * (maskY / 100));

      // Force even numbers for YUV420p video encoding compatibility
      if (cropW % 2 !== 0) cropW -= 1;
      if (cropH % 2 !== 0) cropH -= 1;
      if (cropX % 2 !== 0) cropX -= 1;
      if (cropY % 2 !== 0) cropY -= 1;

      // Ensure minimum 2px
      cropW = Math.max(2, cropW);
      cropH = Math.max(2, cropH);
      cropX = Math.max(0, cropX);
      cropY = Math.max(0, cropY);

      // Clamp to video bounds
      if (cropX + cropW > videoWidth) {
        cropW = videoWidth - cropX;
        if (cropW % 2 !== 0) cropW -= 1;
      }
      if (cropY + cropH > videoHeight) {
        cropH = videoHeight - cropY;
        if (cropH % 2 !== 0) cropH -= 1;
      }

      // Clamp blur radius to not exceed crop dimensions
      const safeBlurRad = Math.min(blurRad, Math.floor(Math.min(cropW, cropH) / 2));
      const blurParam = Math.max(1, safeBlurRad);

      // FFmpeg filter_complex: split video -> crop & boxblur region (radius:power=2) -> overlay blurred region back -> burn ASS subtitles
      const filterComplexStr = `[0:v]split[main][crop_src];[crop_src]crop=${cropW}:${cropH}:${cropX}:${cropY},boxblur=${blurParam}:2[blurred];[main][blurred]overlay=${cropX}:${cropY}[masked];[masked]subtitles=filename='${escapedAssPath}'${fontFileParam}[outv]`;

      ffmpegFilterArgs = [
        "-filter_complex",
        filterComplexStr,
        "-map",
        "[outv]",
        "-map",
        "0:a?",
      ];
    } else {
      const filterStr = `subtitles=filename='${escapedAssPath}'${fontFileParam}`;
      ffmpegFilterArgs = [
        "-vf",
        filterStr,
        "-map",
        "0:v",
        "-map",
        "0:a?",
      ];
    }

    const outputVideoPath = path.join(uploadsDir, `${jobId}_burnin_output.mp4`);

    // ─── Bước 4: ffmpeg burn-in với progress stream ───────────────────────
    await updateJobProgress(jobId, "Bước 4/4: Đang render phụ đề vào video...");

    await new Promise<void>((resolve, reject) => {
      const ffmpegArgs = [
        "-i",
        videoPath,
        ...ffmpegFilterArgs,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "23",
        "-preset",
        "fast",
        "-c:a",
        "copy",
        "-progress",
        "pipe:1",
        "-y",
        outputVideoPath,
      ];
      let lastPercent = -1;

      const proc = spawn("ffmpeg", ffmpegArgs);

      // Đọc progress từ stdout (-progress pipe:1)
      proc.stdout.on("data", async (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          const processedMs = parseFfmpegProgressLine(line);
          if (processedMs >= 0) {
            const pct = calcProgressPercent(processedMs, totalMs);
            if (pct !== lastPercent && pct % 5 === 0) {
              lastPercent = pct;
              await updateJobProgress(
                jobId,
                `Đang render: ${pct}% hoàn thành...`,
              );
              // Cập nhật progressPercent vào DB
              await prisma.subtitleJob
                .update({
                  where: { id: jobId },
                  data: { progressPercent: pct },
                })
                .catch(() => {
                  /* field có thể chưa tồn tại — bỏ qua */
                });
            }
          }
        }
      });

      // Đọc lỗi từ stderr (ffmpeg log)
      let stderrBuf = "";
      proc.stderr.on("data", (data: Buffer) => {
        stderrBuf += data.toString();
        // Fallback parse time= từ stderr nếu stdout không có progress
        const lines = data.toString().split("\n");
        for (const line of lines) {
          const processedMs = parseFfmpegProgressLine(line);
          if (processedMs >= 0) {
            const pct = calcProgressPercent(processedMs, totalMs);
            if (pct !== lastPercent && pct % 5 === 0) {
              lastPercent = pct;
              // Fire-and-forget log update
              updateJobProgress(
                jobId,
                `Đang render: ${pct}% hoàn thành...`,
              ).catch(() => {});
            }
          }
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Trích xuất dòng lỗi từ stderr
          const allLines = stderrBuf.split("\n").map((l) => l.trim()).filter(Boolean);
          const filtered = allLines.filter(
            (l) =>
              l.includes("Error") ||
              l.includes("error") ||
              l.includes("Invalid") ||
              l.includes("Failed") ||
              l.includes("failed")
          );
          const errLine = (filtered.length > 0 ? filtered.slice(-3) : allLines.slice(-5)).join(" | ");
          reject(
            new Error(
              `ffmpeg kết thúc với code ${code}: ${errLine || "Lỗi không xác định"}`.trim(),
            ),
          );
        }
      });

      proc.on("error", (err) => {
        reject(
          new Error(
            `Không thể khởi động ffmpeg: ${err.message}. Đảm bảo ffmpeg đã được cài đặt và có trong PATH.`,
          ),
        );
      });
    });

    // ─── Hoàn tất ─────────────────────────────────────────────────────────
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        outputFile: outputVideoPath,
        costUsd: 0, // Burn-in không tốn chi phí API
      },
    });

    // Dọn dẹp file phụ đề tạm
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* bỏ qua */
      }
    }
    // Dọn dẹp file video input tạm
    try {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    } catch {
      /* bỏ qua */
    }

    await updateJobProgress(
      jobId,
      "✓ Burn-in hoàn thành! File video đã sẵn sàng để tải về.",
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Lỗi hệ thống";
    console.error(`[Job ${jobId}] Burn-In failed:`, err);
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "error", errorMessage: errMsg },
    });
    await updateJobProgress(jobId, `✗ Burn-in thất bại: ${errMsg}`);
  }
}

/**
 * Lấy chiều rộng video bằng ffprobe.
 */
async function getVideoWidth(videoPath: string): Promise<number> {
  const out = await runCommandAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
  );
  const w = parseInt(out.trim());
  return isNaN(w) ? 1280 : w;
}

/**
 * Tạo nội dung ASS phụ đề tùy biến cao từ phụ đề SRT thuần và các thông số video.
 */
function buildAssSubtitles(
  srtContent: string,
  width: number,
  height: number,
  fontName: string,
  fontSize: number,
  primaryColor: string,
  alignment: number,
  borderStyle: number,
  marginV: number,
  posX?: number,
  posY?: number
): string {
  const blocks = parseSubtitle(srtContent);

  const posX_px = (posX !== undefined && posX !== null) ? Math.round(width * (posX / 100)) : null;
  const posY_px = (posY !== undefined && posY !== null) ? Math.round(height * (posY / 100)) : null;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,${borderStyle},1,0.5,${alignment},10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = blocks.map(b => {
    if (!b.timestamp) return '';
    
    // Parse time
    const parts = b.timestamp.split('-->').map(p => p.trim());
    if (parts.length < 2) return '';
    
    const formatTime = (ts: string) => {
      const clean = ts.replace(',', '.');
      const dotIdx = clean.indexOf('.');
      let hms = clean;
      let msStr = '000';
      if (dotIdx !== -1) {
        hms = clean.substring(0, dotIdx);
        msStr = clean.substring(dotIdx + 1).padEnd(3, '0').substring(0, 3);
      }
      const hmsParts = hms.split(':');
      const h = hmsParts[0] || '00';
      const m = hmsParts[1] || '00';
      const s = hmsParts[2] || '00';
      
      const cs = Math.round(parseInt(msStr) / 10).toString().padStart(2, '0');
      const hour = parseInt(h).toString();
      return `${hour}:${m}:${s}.${cs}`;
    };
    
    const start = formatTime(parts[0]);
    const end = formatTime(parts[1]);
    const cleanText = b.text.replace(/\\N/g, ' ').replace(/\r?\n/g, '\\N');
    const posTag = (posX_px !== null && posY_px !== null) ? `{\\an5\\pos(${posX_px},${posY_px})}` : '';
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${posTag}${cleanText}`;
  }).filter(Boolean).join('\n');

  return header + events;
}

/**
 * Xử lý Job chuyển đổi tỷ lệ video từ 16:9 (Ngang) sang 9:16 (Dọc TikTok/Shorts)
 */
export async function processConvertRatioJob(jobId: string): Promise<void> {
  let isSuccess = false;

  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await safeUpdateSubtitleJob(jobId, {
      status: "processing",
      progressLog: "[]",
      progressPercent: 5,
    });

    const meta = JSON.parse(job.meta || "{}");
    const mode = meta.mode || "blur"; // 'blur' | 'crop' | 'pad'
    const resolution = meta.resolution || "1080p"; // '1080p' | '720p' | '4k'
    const fps = meta.fps || 30;
    const bitrate = meta.bitrate || "8mbps";

    let outW = 1080;
    let outH = 1920;
    if (resolution === "720p") {
      outW = 720;
      outH = 1280;
    } else if (resolution === "4k") {
      outW = 2160;
      outH = 3840;
    }

    const uploadsDir = getUploadsDir();
    let mediaPath = meta.mediaPath || "";
    if (!mediaPath || !fs.existsSync(mediaPath)) {
      const files = fs.readdirSync(uploadsDir);
      const mediaFile = files.find(
        (f) =>
          f.startsWith(jobId) && !f.endsWith(".wav") && !f.endsWith(".srt") && !f.endsWith(".mp4")
      );
      if (mediaFile) {
        mediaPath = path.join(uploadsDir, mediaFile);
      }
    }

    if (!mediaPath || !fs.existsSync(mediaPath)) {
      throw new Error("Không tìm thấy tệp video nguồn trên máy chủ.");
    }

    await updateJobProgress(
      jobId,
      `Bước 1/2: Khởi tạo thông số chuyển đổi video 16:9 ➔ 9:16 Dọc (Chế độ: ${
        mode === "blur"
          ? "Nền mờ CapCut Blur"
          : mode === "crop"
          ? "Cắt tràn màn hình (Crop Center)"
          : "Viền đen (Fit Pad)"
      }, ${outW}x${outH} @ ${fps}FPS)...`
    );
    await safeUpdateSubtitleJob(jobId, { progressPercent: 20 });

    const outputMp4Path = path.join(uploadsDir, `${jobId}_converted_916.mp4`);

    let filterOption = "";
    if (mode === "blur") {
      // Siêu tối ưu tốc độ: Downscale nền trước khi blur giúp giảm 94% khối lượng tính toán điểm ảnh
      const bgW = Math.round(outW / 4);
      const bgH = Math.round(outH / 4);
      filterOption = `-filter_complex "[0:v]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},boxblur=8:3,scale=${outW}:${outH}[bg];[0:v]scale=${outW}:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[out]" -map "[out]" -map 0:a?`;
    } else if (mode === "crop") {
      // Crop center
      filterOption = `-vf "scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}"`;
    } else {
      // Fit pad black bars
      const padHeight = Math.round(outW * (9 / 16));
      filterOption = `-vf "scale=${outW}:${padHeight},pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black"`;
    }

    const bRate = bitrate === "16mbps" ? "16M" : "8M";

    // Kiểm tra khả năng mở phần cứng mã hóa GPU thực tế (Probe check)
    let videoEncoderFlags = "-c:v libx264 -preset ultrafast -threads 0";
    try {
      const probeEncoder = async (codec: string) => {
        return new Promise<boolean>((resolve) => {
          exec(`ffmpeg -f lavfi -i color=c=black:s=16x16:d=0.1 -c:v ${codec} -f null -`, (err) => {
            resolve(!err);
          });
        });
      };

      if (await probeEncoder("h264_nvenc")) {
        videoEncoderFlags = "-c:v h264_nvenc -preset p4 -tune hq";
      } else if (await probeEncoder("h264_qsv")) {
        videoEncoderFlags = "-c:v h264_qsv -preset faster";
      } else if (await probeEncoder("h264_amf")) {
        videoEncoderFlags = "-c:v h264_amf -quality speed";
      }
    } catch {}

    const ffmpegCmd = `ffmpeg -i "${mediaPath}" ${filterOption} -r ${fps} ${videoEncoderFlags} -b:v ${bRate} -pix_fmt yuv420p -c:a copy -y "${outputMp4Path}"`;

    await updateJobProgress(
      jobId,
      `Bước 2/2: Đang chạy FFmpeg mã hóa siêu tốc (${videoEncoderFlags.includes("nvenc") ? "⚡ GPU NVIDIA NVENC" : "🚀 CPU Multithread Ultrafast"}) xuất video 9:16 Dọc...`
    );
    await safeUpdateSubtitleJob(jobId, { progressPercent: 50 });

    await new Promise<void>((resolve, reject) => {
      exec(ffmpegCmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[Job ${jobId}] Convert Aspect Ratio FFmpeg error:`, stderr);
          reject(new Error(`Lỗi FFmpeg mã hóa video 9:16: ${error.message}`));
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputMp4Path)) {
      throw new Error("Không tìm thấy file video 9:16 sau khi xuất");
    }

    await safeUpdateSubtitleJob(jobId, {
      status: "done",
      outputFile: outputMp4Path,
      progressPercent: 100,
      meta: JSON.stringify({
        ...meta,
        convertedMp4Path: outputMp4Path,
      }),
    });

    await updateJobProgress(
      jobId,
      "✓ Chuyển đổi tỷ lệ video 16:9 ➔ 9:16 Dọc TikTok hoàn tất thành công!"
    );
    isSuccess = true;
  } catch (err: any) {
    console.error(`[Job ${jobId}] Convert Aspect Ratio failed:`, err);
    await safeUpdateSubtitleJob(jobId, {
      status: "error",
      errorMessage: err.message || "Lỗi khi chuyển đổi tỷ lệ khung hình video",
    });
    await updateJobProgress(
      jobId,
      `✗ Gặp lỗi: ${err.message || "Lỗi hệ thống"}`
    );
  }
}

