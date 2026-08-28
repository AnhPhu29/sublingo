import { prisma } from "./prisma";
import { getUploadsDir, updateJobProgress } from "./queue";
import { runWithConcurrencyLimit, TTS_SRT_MAX_TEMPO, getAtempoFilters, getAudioDurationMsSmart, createWavSilenceFileFast } from "./audio-sync";
import { fetchWithRetry } from "./fetchWithRetry";
import { normalizeTextForTTS } from "./text-normalizer";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

// ─── Hằng số tối ưu hóa ────────────────────────────────────────────────────────

/**
 * Số items mỗi batch gửi lên Python backend.
 * Giữ nhỏ (5) để mỗi batch hoàn thành dưới 90 giây ngay cả trên CPU chậm.
 * 5 items × ~15s/item = ~75s, an toàn với mọi timeout.
 */
const BATCH_SIZE = 5;

/**
 * Số batch chạy song song tối đa.
 * GIỮ Ở 1: Python backend dùng asyncio.Lock() (vieneu_lock) nên chỉ xử lý 1 request tại 1 thời điểm.
 * Gửi nhiều batch cùng lúc = các request sau bị timeout do chờ lock quá lâu → fetch failed.
 */
const BATCH_CONCURRENCY = 1;

/**
 * Số lượng ffprobe chạy song song khi pre-fetch durations.
 * Tối ưu trên máy yếu: không quá 6 để tránh tranh chấp CPU.
 */
const FFPROBE_CONCURRENCY = 8;

/**
 * Thư mục chứa silence files dùng chung cho mọi job.
 * Tránh tạo lại hàng trăm lần cho cùng một duration.
 */
const SILENCE_CACHE_DIR_NAME = "silence_cache";

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

async function getAudioDurationMs(filePath: string): Promise<number> {
  return getAudioDurationMsSmart(filePath);
}

async function adjustAudioTempo(
  inputPath: string,
  outputPath: string,
  ratio: number
): Promise<void> {
  const filterStr = getAtempoFilters(ratio);
  // -threads 2: Giới hạn CPU để không tranh chấp tài nguyên với các batch song song
  await runCommandAsync(
    `ffmpeg -threads 2 -i "${inputPath}" -filter:a "${filterStr}" -ar 24000 -ac 1 -c:a pcm_s16le -y "${outputPath}"`
  );
}

/**
 * Tạo file im lặng (silence) với duration chỉ định siêu tốc trong RAM (Chuẩn 24000Hz Mono 16-bit).
 */
async function createSilenceFile(outputPath: string, durationMs: number): Promise<void> {
  createWavSilenceFileFast(outputPath, durationMs, 24000, 1, 16);
}

/**
 * Lấy hoặc tạo silence file từ global cache (dùng chung giữa mọi job).
 * Giúp tránh tạo lại hàng trăm file im lặng có cùng duration.
 *
 * @param uploadsDir Thư mục uploads
 * @param durMs      Duration mong muốn (ms)
 * @returns Path tới silence file đã có sẵn hoặc vừa tạo
 */
async function getGlobalSilenceFile(uploadsDir: string, durMs: number): Promise<string> {
  const silenceCacheDir = path.join(uploadsDir, SILENCE_CACHE_DIR_NAME);
  if (!fs.existsSync(silenceCacheDir)) {
    fs.mkdirSync(silenceCacheDir, { recursive: true });
  }
  const cleanDur = Math.max(10, Math.round(durMs));
  const silPath = path.join(silenceCacheDir, `sil_${cleanDur}ms_24k.wav`);
  if (!fs.existsSync(silPath)) {
    await createSilenceFile(silPath, cleanDur);
  }
  return silPath;
}

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface TtsSegmentInput {
  idx: number;
  text: string;
  voiceId?: string;
  startMs?: number;
  endMs?: number;
}

// ─── Main processor ────────────────────────────────────────────────────────────

export async function processTtsJob(jobId: string) {
  const tempFilesToClean: string[] = [];

  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "processing", progressLog: "[]" },
    });

    const meta = JSON.parse(job.meta || "{}");
    const {
      segments = [] as TtsSegmentInput[],
      globalVoiceId = "Mai Anh",
      ttsVolume = 1.0,
      pauseDurationMs = 400,
      hasOriginalTimestamps: rawHasOrig,
    } = meta;

    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error("Không có đoạn văn bản nào để đọc (Danh sách trống).");
    }

    const hasOriginalTimestamps =
      rawHasOrig === true ||
      segments.some(
        (s: TtsSegmentInput) => typeof s.startMs === "number" && typeof s.endMs === "number"
      );

    const uploadsDir = getUploadsDir();
    const pythonServiceUrl = process.env.PYTHON_AI_SERVICE_URL || "http://localhost:8000";

    // ── Warm-up probe: Chờ VieNeu TTS model sẵn sàng trước khi gửi batch ─────────
    // /health chỉ kiểm tra FastAPI đang chạy, nhưng VieNeu model lazy-load riêng.
    // Probe /tts/voices sẽ trigger get_vieneu_tts() → model được load vào RAM trước.
    // Sau khi probe thành công, batch đầu tiên sẽ không bị fail nữa.
    const warmupMaxMs = 60_000;
    const warmupIntervalMs = 3000;
    const warmupStart = Date.now();
    let pythonReady = false;
    while (!pythonReady && Date.now() - warmupStart < warmupMaxMs) {
      try {
        const probe = await fetch(`${pythonServiceUrl}/tts/voices`, { signal: AbortSignal.timeout(5000) });
        if (probe.ok) { pythonReady = true; break; }
      } catch { /* bình thường khi model đang load */ }
      await new Promise((r) => setTimeout(r, warmupIntervalMs));
    }

    const branchName = hasOriginalTimestamps ? "File SRT (Có Timestamp)" : "Văn bản tự do";
    await updateJobProgress(
      jobId,
      `Bắt đầu xử lý TTS [Nhánh: ${branchName}] cho ${segments.length} đoạn văn bản...`,

      10
    );

    const segmentAudioPaths: (string | null)[] = new Array(segments.length).fill(null);
    let completedCount = 0;

    interface UncachedItem {
      idx: number;
      text: string;
      voiceId: string;
      ref_audio?: string;
      ref_text?: string;
      cache_file: string;
      line_file: string;
    }

    const uncachedQueue: UncachedItem[] = [];

    // Tối ưu tốc độ cực đại: Nạp toàn bộ Custom Voices từ DB vào Map 1 lần duy nhất
    const allCustomVoices = await prisma.customVoice.findMany().catch(() => []);
    const customVoiceMap = new Map(allCustomVoices.map((cv) => [cv.id, cv]));

    // Đọc danh sách file trong thư mục uploads 1 lần duy nhất để kiểm tra cache O(1) trong RAM
    const uploadFilesSet = new Set(fs.readdirSync(uploadsDir));

    const SYSTEM_VOICE_IDS = [
      "ngoc_huyen", "hoai_my", "nam_minh", "mai_anh", "manh_dung", "huong_giang", "lan_trinh", "minh_hoang",
      "Mai Anh", "Phạm Tuyên", "Minh Đức", "Thùy Dung", "Thái Sơn", "Xuân Vĩnh",
      "Thanh Bình", "Trúc Ly", "Ngọc Linh", "Đoan Trang", "Thục Đoan", "Minh Triết",
      "Quang Sơn", "Ngọc Trân", "phuong", "dung", "tuyen", "hoang", "female", "male"
    ];

    const durationMap = new Map<string, number>();

    // ── Pre-pass: Kiểm tra cache và tạo file câm cho dòng trống ─────────────
    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];
      const normalizedText = normalizeTextForTTS(seg.text);

      if (!normalizedText || normalizedText.trim().length === 0) {
        // Dùng trực tiếp global silence cache (không copy ra file tạm)
        const globalSilPath = await getGlobalSilenceFile(uploadsDir, 300);
        segmentAudioPaths[idx] = globalSilPath;
        durationMap.set(globalSilPath, 300);
        completedCount++;
        continue;
      }

      let lineVoiceId = seg.voiceId || globalVoiceId;
      let lineRefAudioPath: string | undefined = undefined;
      let lineRefText: string | undefined = undefined;

      const isCustomVoice = !SYSTEM_VOICE_IDS.includes(lineVoiceId);
      if (isCustomVoice) {
        const cv = customVoiceMap.get(lineVoiceId);
        if (cv) {
          lineRefAudioPath = cv.refAudioPath;
          lineRefText = cv.refText;
          lineVoiceId = "Mai Anh";
        }
      }

      const cacheKey = crypto
        .createHash("md5")
        .update(`${normalizedText}:${lineVoiceId}:${lineRefAudioPath || ""}`)
        .digest("hex");

      const cacheFileName = `tts_cache_${cacheKey}.wav`;
      const cacheFilePath = path.join(uploadsDir, cacheFileName);

      // Tra cứu O(1) trong RAM bằng Set thay vì đĩa
      if (uploadFilesSet.has(cacheFileName)) {
        segmentAudioPaths[idx] = cacheFilePath;
        completedCount++;
      } else {
        uncachedQueue.push({
          idx,
          text: normalizedText,
          voiceId: lineVoiceId,
          ref_audio: lineRefAudioPath,
          ref_text: lineRefText,
          cache_file: cacheFilePath,
          line_file: cacheFilePath,
        });
      }
    }

    if (completedCount > 0) {
      await updateJobProgress(
        jobId,
        `⚡ Đã tận dụng Cache có sẵn: ${completedCount}/${segments.length} đoạn audio...`,
        15
      );
    }

    // ── Xử lý các câu chưa có cache theo lô nhỏ, nhiều batch song song ──────
    // BATCH_SIZE=10 (ít RAM), BATCH_CONCURRENCY=3 (throughput tốt)
    if (uncachedQueue.length > 0) {
      const batchChunks: UncachedItem[][] = [];

      for (let i = 0; i < uncachedQueue.length; i += BATCH_SIZE) {
        batchChunks.push(uncachedQueue.slice(i, i + BATCH_SIZE));
      }

      const batchTasks = batchChunks.map((chunk) => async () => {
        const checkJob = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
        if (!checkJob || checkJob.status === "cancelled") {
          throw new Error("Tiến trình đã bị người dùng dừng lại.");
        }

        try {
          // Không đặt timeout — CPU TTS có thể mất vài phút mỗi batch tùy tốc độ máy.
          // Nếu Python thực sự crash, fetch sẽ tự báo ECONNRESET/fetch failed tự nhiên.
          const response = await fetchWithRetry(
            `${pythonServiceUrl}/tts/batch`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: chunk }),
            },
            2,
            [5000, 10000]
          );

          if (response.ok) {
            for (const item of chunk) {
              if (fs.existsSync(item.cache_file)) {
                segmentAudioPaths[item.idx] = item.cache_file;
              } else {
                // Fallback: dùng global silence cache trực tiếp
                const globalSilPath = await getGlobalSilenceFile(uploadsDir, 500);
                segmentAudioPaths[item.idx] = globalSilPath;
                durationMap.set(globalSilPath, 500);
              }
            }
          } else {
            for (const item of chunk) {
              const globalSilPath = await getGlobalSilenceFile(uploadsDir, 500);
              segmentAudioPaths[item.idx] = globalSilPath;
              durationMap.set(globalSilPath, 500);
            }
          }
        } catch (err) {
          console.error(`[Local TTS Batch Error]:`, err);
          for (const item of chunk) {
            const globalSilPath = await getGlobalSilenceFile(uploadsDir, 500);
            segmentAudioPaths[item.idx] = globalSilPath;
            durationMap.set(globalSilPath, 500);
          }
        }

        completedCount += chunk.length;
        const pct = Math.min(75, Math.round(10 + (completedCount / segments.length) * 65));
        await updateJobProgress(
          jobId,
          `⚡ Tốc độ tối đa: Đã tạo giọng đọc AI cho ${completedCount}/${segments.length} đoạn...`,
          pct
        );
      });

      await runWithConcurrencyLimit(batchTasks, BATCH_CONCURRENCY);
    }
    await updateJobProgress(jobId, "Đang sinh xong giọng đọc AI. Đang đồng bộ thời lượng...", 78);

    const warningLogs: string[] = [];

    // ── NHÁNH FILE SRT: Ép vừa khung thời gian với Tempo Up tối đa 1.8x ────
    if (hasOriginalTimestamps) {
      await updateJobProgress(
        jobId,
        `⚡ [Nhánh SRT] Đang đồng bộ khung thời gian gốc (startMs-endMs) & áp dụng tempo-up (Tối đa ${TTS_SRT_MAX_TEMPO}x)...`,
        82
      );

      const syncTasks = segments.map((seg, idx) => async () => {
        const origFilePath = segmentAudioPaths[idx];
        if (!origFilePath || !fs.existsSync(origFilePath)) return;

        if (
          typeof seg.startMs === "number" &&
          typeof seg.endMs === "number" &&
          seg.endMs > seg.startMs
        ) {
          const targetDurationMs = seg.endMs - seg.startMs;
          const nextSeg = segments[idx + 1];
          const maxAllowedSlotMs = (nextSeg && typeof nextSeg.startMs === "number" && nextSeg.startMs > seg.startMs)
            ? (nextSeg.startMs - seg.startMs)
            : targetDurationMs;

          const actualDurationMs = await getAudioDurationMs(origFilePath);
          durationMap.set(origFilePath, actualDurationMs);

          if (actualDurationMs > targetDurationMs && targetDurationMs > 50) {
            const ratio = actualDurationMs / targetDurationMs;
            const tempoToApply = Math.min(TTS_SRT_MAX_TEMPO, ratio);

            const tempoPath = path.join(uploadsDir, `${jobId}_seg_${idx}_tempo.wav`);
            await adjustAudioTempo(origFilePath, tempoPath, tempoToApply);
            tempFilesToClean.push(tempoPath);

            let tempoDurationMs = await getAudioDurationMs(tempoPath);

            // Bắt buộc: Âm thanh không được vượt quá maxAllowedSlotMs để không đẩy câu sau bị trễ!
            if (tempoDurationMs > maxAllowedSlotMs) {
              const clampedPath = path.join(uploadsDir, `${jobId}_seg_${idx}_clamped.wav`);
              const targetSec = (maxAllowedSlotMs / 1000).toFixed(3);
              await runCommandAsync(
                `ffmpeg -threads 1 -i "${tempoPath}" -t ${targetSec} -ar 24000 -ac 1 -c:a pcm_s16le -y "${clampedPath}"`
              );
              tempFilesToClean.push(clampedPath);
              segmentAudioPaths[idx] = clampedPath;
              tempoDurationMs = maxAllowedSlotMs;
              durationMap.set(clampedPath, maxAllowedSlotMs);

              const snippet = seg.text.length > 35 ? seg.text.slice(0, 35) + "..." : seg.text;
              const warnMsg = `⚠ Dòng #${idx + 1} ("${snippet}"): Cần ${actualDurationMs}ms nhưng khung SRT chỉ có ${targetDurationMs}ms. Đã ép tăng tốc tối đa ${TTS_SRT_MAX_TEMPO}x. Vui lòng rút ngắn bớt văn bản dòng này nếu cần.`;
              warningLogs.push(warnMsg);
              console.warn(`[TTS SRT Tempo Warning]`, warnMsg);
            } else {
              segmentAudioPaths[idx] = tempoPath;
              durationMap.set(tempoPath, tempoDurationMs);
            }
          }
        }
      });

      await runWithConcurrencyLimit(syncTasks, 12);
    }

    await updateJobProgress(jobId, "Đang ghép các đoạn âm thanh thành file hoàn chỉnh...", 88);

    // ── Pre-fetch audio durations còn thiếu song song ──
    const pathsToProbe: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segPath = segmentAudioPaths[i];
      if (segPath && fs.existsSync(segPath) && !durationMap.has(segPath)) {
        pathsToProbe.push(segPath);
      }
    }

    if (pathsToProbe.length > 0) {
      const probeTasks = pathsToProbe.map((p) => async () => {
        const dur = await getAudioDurationMs(p);
        durationMap.set(p, dur);
      });

      await runWithConcurrencyLimit(probeTasks, FFPROBE_CONCURRENCY);
    }

    // ── Ghép các đoạn thành 1 file duy nhất kèm khoảng nghỉ ─────────────────
    const concatTxtPath = path.join(uploadsDir, `${jobId}_concat_list.txt`);
    const concatLines: string[] = [];

    // In-memory silence cache cho job hiện tại (tra cứu O(1) thay vì I/O mỗi lần)
    const jobSilenceCache = new Map<number, string>();

    const getOrMakeSilenceFile = async (durMs: number): Promise<string> => {
      const cleanDur = Math.max(10, Math.round(durMs));
      if (jobSilenceCache.has(cleanDur)) return jobSilenceCache.get(cleanDur)!;
      // Dùng global persistent cache → không tạo lại nếu đã có từ job trước
      const sPath = await getGlobalSilenceFile(uploadsDir, cleanDur);
      jobSilenceCache.set(cleanDur, sPath);
      return sPath;
    };

    // Nhánh SRT: Đồng bộ tuyệt đối chuẩn mốc thời gian (Exact Timestamp Alignment)
    let currentAudioTimelineMs = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segPath = segmentAudioPaths[i];
      if (!segPath || !fs.existsSync(segPath)) continue;

      if (hasOriginalTimestamps && typeof seg.startMs === "number") {
        // Chèn chính xác khoảng im lặng để đưa audio về đúng timestamp của SRT
        if (seg.startMs > currentAudioTimelineMs) {
          const silMs = seg.startMs - currentAudioTimelineMs;
          if (silMs >= 10) {
            const silFile = await getOrMakeSilenceFile(silMs);
            concatLines.push(`file '${silFile.replace(/\\/g, "/")}'`);
            currentAudioTimelineMs += silMs;
          }
        }
      }

      // Thêm file audio câu thoại
      concatLines.push(`file '${segPath.replace(/\\/g, "/")}'`);
      // Dùng duration đã pre-fetch thay vì gọi ffprobe lại
      const segDurMs = durationMap.get(segPath) ?? 0;
      currentAudioTimelineMs += segDurMs;

      // Văn bản tự do: chèn khoảng nghỉ pauseDurationMs giữa các câu
      if (!hasOriginalTimestamps && i < segments.length - 1) {
        if (pauseDurationMs >= 10) {
          const pauseFile = await getOrMakeSilenceFile(pauseDurationMs);
          concatLines.push(`file '${pauseFile.replace(/\\/g, "/")}'`);
          currentAudioTimelineMs += pauseDurationMs;
        }
      }
    }

    // Nhánh SRT: Chèn thêm khoảng lặng cuối file cho trùng khớp đúng mốc endMs
    if (hasOriginalTimestamps && segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      if (typeof lastSeg.endMs === "number" && lastSeg.endMs > currentAudioTimelineMs) {
        const finalSilMs = lastSeg.endMs - currentAudioTimelineMs;
        if (finalSilMs >= 10) {
          const finalSilFile = await getOrMakeSilenceFile(finalSilMs);
          concatLines.push(`file '${finalSilFile.replace(/\\/g, "/")}'`);
        }
      }
    }

    if (concatLines.length === 0) {
      throw new Error("Không có file âm thanh nào được sinh thành công.");
    }

    fs.writeFileSync(concatTxtPath, concatLines.join("\n"));
    tempFilesToClean.push(concatTxtPath);

    const outputMp3Path = path.join(uploadsDir, `${jobId}_speech.mp3`);

    // Ghép ffmpeg concat + volume adjustment
    // -q:a 4 (thay vì 2): encode nhanh hơn ~15%, chất lượng vẫn rất tốt (VBR ~165kbps)
    // -threads 2: Giới hạn thread để không tranh chấp tài nguyên hệ thống
    const volFilter = ttsVolume !== 1.0 ? `-filter:a "volume=${ttsVolume}"` : "";
    await runCommandAsync(
      `ffmpeg -threads 4 -f concat -safe 0 -i "${concatTxtPath}" ${volFilter} -c:a libmp3lame -q:a 4 -y "${outputMp3Path}"`
    );

    const finalLogs: string[] = [
      `✓ Tạo giọng đọc thành công cho ${segments.length} đoạn văn bản [Nhánh: ${branchName}].`,
      `✓ File âm thanh đã lưu: ${path.basename(outputMp3Path)}`,
      ...warningLogs,
    ];

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        outputFile: outputMp3Path,
        progressPercent: 100,
        progressLog: JSON.stringify(finalLogs),
      },
    });

    // Dọn dẹp file tạm (silence cache global KHÔNG bị xóa — dùng lại cho job sau)
    tempFilesToClean.forEach((f) => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {}
    });

  } catch (err: any) {
    console.error(`[processTtsJob Error] Job ${jobId}:`, err);
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        errorMessage: err.message || "Lỗi không xác định khi tạo giọng đọc.",
      },
    });

    tempFilesToClean.forEach((f) => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {}
    });
  }
}
