import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUploadsDir, jobQueueManager } from "@/lib/queue";
import { processSttJob } from "@/lib/video-processor";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Whitelist các định dạng media được hỗ trợ
const ALLOWED_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "mp3",
  "wav",
  "m4a",
  "aac",
  "flac",
  "ogg",
];
const ALLOWED_MIME_PREFIXES = ["video/", "audio/", "application/octet-stream"];

function runCommandAsync(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

export async function POST(request: Request) {
  try {
    // 11. Áp dụng bảo vệ ACCESS_PASSWORD / Session cookie đồng bộ
    if (process.env.ACCESS_PASSWORD) {
      const cookieHeader = request.headers.get("cookie") || "";
      if (!cookieHeader.includes("sublingo_session=")) {
        return NextResponse.json(
          {
            success: false,
            error: "Chưa đăng nhập hoặc phiên làm việc hết hạn.",
          },
          { status: 401 },
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sourceLanguage = (formData.get("sourceLanguage") as string) || "auto";
    const modelSize = (formData.get("modelSize") as string) || "medium";
    const autoTranslate = formData.get("autoTranslate") === "true";
    const selectedLangsStr = formData.get("selectedLangs") as string;
    const glossaryStr = formData.get("glossary") as string;
    const engine = (formData.get("engine") as string) || "local";
    const wordTimestamps = formData.get("wordTimestamps") === "true";
    const cleanVocal = formData.get("cleanVocal") === "true";
    const sttAiRefiner = formData.get("sttAiRefiner") === "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Thiếu file audio/video tải lên" },
        { status: 400 },
      );
    }

    // 6. Validate extension & mime type của file đầu vào
    const originalName = file.name || "";
    const ext = originalName.split(".").pop()?.toLowerCase() || "";
    const mimeType = file.type || "";

    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
    const isMimeAllowed =
      ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
      mimeType === "";

    if (!isExtAllowed || !isMimeAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Định dạng file '.${ext}' không được hỗ trợ. Vui lòng tải lên file media hợp lệ (${ALLOWED_EXTENSIONS.slice(0, 6).join(", ")}...).`,
        },
        { status: 400 },
      );
    }

    const MAX_SIZE = 500 * 1024 * 1024; // 500MB (đồng bộ Proxy max body size)
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Dung lượng file vượt quá giới hạn cho phép (tối đa 500MB)",
        },
        { status: 400 },
      );
    }

    const selectedLangs = JSON.parse(selectedLangsStr || "[]");
    const glossary = JSON.parse(glossaryStr || "[]");

    // Tạo Job ID mới
    const jobId =
      "job_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();

    // 2. Lưu file tạm thời và lấy mediaPath chính xác
    const uploadsDir = getUploadsDir();
    const tempFileName = `${jobId}_media.${ext}`;
    const tempFilePath = path.join(uploadsDir, tempFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Sử dụng ffprobe lấy thời lượng âm thanh
    let durationSeconds = 0;
    try {
      const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempFilePath}"`;
      const durationStr = await runCommandAsync(ffprobeCmd);
      durationSeconds = parseFloat(durationStr) || 0;
    } catch (ffErr) {
      console.warn("[STT Upload] Failed to probe duration:", ffErr);
    }

    // 5. Giới hạn độ dài audio trước khi xử lý (MAX_STT_DURATION_SECONDS, mặc định 1800 giây = 30 phút)
    const MAX_STT_DURATION_SECONDS = parseInt(
      process.env.MAX_STT_DURATION_SECONDS || "1800",
      10,
    );
    if (durationSeconds > MAX_STT_DURATION_SECONDS) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      const maxMinutes = (MAX_STT_DURATION_SECONDS / 60).toFixed(0);
      const fileMinutes = (durationSeconds / 60).toFixed(1);
      return NextResponse.json(
        {
          success: false,
          error: `Thời lượng âm thanh (${fileMinutes} phút) vượt quá giới hạn tối đa cho phép (${maxMinutes} phút).`,
        },
        { status: 400 },
      );
    }

    // 14. Ước tính thời gian xử lý dựa trên modelSize và durationSeconds
    const speedFactors: Record<string, number> = {
      tiny: 0.05,
      base: 0.1,
      small: 0.2,
      medium: 0.5,
      "large-v3": 1.0,
    };
    const factor = speedFactors[modelSize] || 0.2;
    const estimatedProcessingSeconds = Math.max(
      5,
      Math.ceil(durationSeconds * factor),
    );

    // 2. Lưu đường dẫn mediaPath chính xác vào meta
    const meta = JSON.stringify({
      sourceLanguage,
      modelSize,
      autoTranslate,
      wordTimestamps,
      cleanVocal,
      sttAiRefiner,
      selectedLangs,
      glossary,
      engine,
      originalFileName: originalName,
      durationSeconds,
      mediaPath: tempFilePath,
      estimatedProcessingSeconds,
    });

    // Tạo bản ghi job trong SQLite
    await prisma.subtitleJob.create({
      data: {
        id: jobId,
        type: "stt",
        status: "queued",
        inputFile: originalName,
        meta,
        costUsd: 0,
        progressLog: JSON.stringify([
          `[Queue] Đã nhận file media: ${originalName}`,
          `[Queue] Thời lượng: ${durationSeconds.toFixed(1)}s. Dự kiến thời gian xử lý: ~${estimatedProcessingSeconds}s (${modelSize}). Đang chờ đến lượt...`,
        ]),
      },
    });

    // 9. Đưa vào hàng đợi với type 'stt'
    jobQueueManager.addJob(jobId, () => processSttJob(jobId), "stt");

    return NextResponse.json({
      success: true,
      jobId,
      estimatedProcessingSeconds,
      message: "Đã tải lên media và thêm vào hàng đợi Whisper STT thành công",
    });
  } catch (err: any) {
    console.error("STT upload API error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi xử lý tải lên file" },
      { status: 500 },
    );
  }
}
export const maxDuration = 300;
