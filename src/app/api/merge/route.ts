import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUploadsDir, jobQueueManager } from "@/lib/queue";
import { processMergeJob } from "@/lib/merge-processor";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

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
    // 1. Kiểm tra session cookie nếu có cài PASSWORD
    if (process.env.ACCESS_PASSWORD) {
      const cookieHeader = request.headers.get("cookie") || "";
      if (!cookieHeader.includes("sublingo_session=")) {
        return NextResponse.json(
          {
            success: false,
            error: "Chưa đăng nhập hoặc phiên làm việc hết hạn.",
          },
          { status: 401 }
        );
      }
    }

    const contentType = request.headers.get("content-type") || "";
    const jobId =
      "merge_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    const uploadsDir = getUploadsDir();

    let resolution = "original";
    const savedFilePaths: string[] = [];
    const originalFileNames: string[] = [];
    const videoDurations: number[] = [];
    let totalEstimatedDuration = 0;

    // Nhánh 1: Nhận JSON payload chứa các file đã được upload đơn lẻ trước đó
    if (contentType.includes("application/json")) {
      const body = await request.json();
      resolution = body.resolution || "original";
      const fileItems: Array<{ filePath: string; originalName: string; duration?: number }> = body.files || [];

      if (!fileItems || fileItems.length < 2) {
        return NextResponse.json(
          { success: false, error: "Vui lòng cung cấp ít nhất 2 video để ghép nối." },
          { status: 400 }
        );
      }

      for (let i = 0; i < fileItems.length; i++) {
        const item = fileItems[i];
        if (!item.filePath || !fs.existsSync(item.filePath)) {
          return NextResponse.json(
            { success: false, error: `File video tạm không tồn tại: ${item.originalName}` },
            { status: 400 }
          );
        }

        // Đổi tên file tạm gắn jobId để dọn dẹp quy chuẩn
        const ext = item.originalName.split(".").pop()?.toLowerCase() || "mp4";
        const finalTempPath = path.join(uploadsDir, `${jobId}_part_${i}.${ext}`);
        fs.renameSync(item.filePath, finalTempPath);

        savedFilePaths.push(finalTempPath);
        originalFileNames.push(item.originalName);

        let dur = item.duration || 0;
        if (!dur) {
          try {
            const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalTempPath}"`;
            const durStr = await runCommandAsync(ffprobeCmd);
            dur = parseFloat(durStr) || 0;
          } catch (e) {}
        }
        videoDurations.push(dur);
        totalEstimatedDuration += dur;
      }
    } else {
      // Nhánh 2: Nhận FormData multipart trực tiếp (cho file nhỏ)
      const formData = await request.formData();
      resolution = (formData.get("resolution") as string) || "original";

      let files: File[] = formData.getAll("files") as File[];
      if (!files || files.length === 0) {
        files = [];
        let index = 0;
        while (formData.has(`file_${index}`)) {
          const f = formData.get(`file_${index}`) as File;
          if (f) files.push(f);
          index++;
        }
      }

      if (!files || files.length < 2) {
        return NextResponse.json(
          {
            success: false,
            error: "Vui lòng tải lên ít nhất 2 video để thực hiện ghép nối.",
          },
          { status: 400 }
        );
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const originalName = file.name || `video_${i + 1}.mp4`;
        const ext = originalName.split(".").pop()?.toLowerCase() || "mp4";

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return NextResponse.json(
            {
              success: false,
              error: `Định dạng file '.${ext}' của '${originalName}' không được hỗ trợ (${ALLOWED_EXTENSIONS.join(", ")}).`,
            },
            { status: 400 }
          );
        }

        const tempFileName = `${jobId}_part_${i}.${ext}`;
        const tempFilePath = path.join(uploadsDir, tempFileName);

        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(tempFilePath, buffer);

        savedFilePaths.push(tempFilePath);
        originalFileNames.push(originalName);

        let durationSec = 0;
        try {
          const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempFilePath}"`;
          const durStr = await runCommandAsync(ffprobeCmd);
          durationSec = parseFloat(durStr) || 0;
        } catch (ffErr) {
          console.warn(`[Merge API] Could not probe duration for ${originalName}`);
        }
        videoDurations.push(durationSec);
        totalEstimatedDuration += durationSec;
      }
    }

    const meta = JSON.stringify({
      resolution,
      filePaths: savedFilePaths,
      originalFileNames,
      videoDurations,
      totalEstimatedDuration,
      count: savedFilePaths.length,
    });

    const summaryTitle = `Ghép nối ${savedFilePaths.length} video (${originalFileNames.slice(0, 2).join(", ")}${savedFilePaths.length > 2 ? "..." : ""})`;

    await prisma.subtitleJob.create({
      data: {
        id: jobId,
        type: "merge",
        status: "queued",
        inputFile: summaryTitle,
        meta,
        costUsd: 0,
        progressLog: JSON.stringify([
          `[Queue] Đã nhận ${savedFilePaths.length} video để ghép nối.`,
          `[Queue] Tổng thời lượng ước tính: ${(totalEstimatedDuration / 60).toFixed(1)} phút. Đang chờ xử lý...`,
        ]),
      },
    });

    // Đưa vào hàng đợi xử lý chung của hệ thống
    jobQueueManager.addJob(jobId, () => processMergeJob(jobId), "general");

    return NextResponse.json({
      success: true,
      jobId,
      message: `Đã đưa ${savedFilePaths.length} video vào hàng đợi ghép nối thành công.`,
    });
  } catch (err: any) {
    console.error("POST /api/merge error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi xử lý yêu cầu ghép video" },
      { status: 500 }
    );
  }
}

export const maxDuration = 300;
