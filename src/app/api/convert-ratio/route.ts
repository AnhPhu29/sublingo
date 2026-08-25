import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUploadsDir, jobQueueManager } from "@/lib/queue";
import { processConvertRatioJob } from "@/lib/video-processor";
import * as fs from "fs";
import * as path from "path";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

export async function POST(request: Request) {
  try {
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

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mode = (formData.get("mode") as string) || "blur"; // 'blur' | 'crop' | 'pad'
    const resolution = (formData.get("resolution") as string) || "1080p"; // '1080p' | '720p' | '4k'
    const fpsStr = formData.get("fps") as string;
    const bitrate = (formData.get("bitrate") as string) || "8mbps";
    const fps = fpsStr ? parseInt(fpsStr) : 30;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Vui lòng tải lên tệp video nguồn (16:9)" },
        { status: 400 }
      );
    }

    const fileName = file.name || "video.mp4";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { success: false, error: "Định dạng file không được hỗ trợ. Vui lòng tải file MP4, MOV, MKV, WEBM" },
        { status: 400 }
      );
    }

    // 1. Tạo Job trong Database
    const job = await prisma.subtitleJob.create({
      data: {
        type: "convert_ratio",
        status: "queued",
        inputFile: fileName,
        outputFile: "",
        progressPercent: 0,
        progressLog: JSON.stringify([
          `[${new Date().toLocaleTimeString("vi-VN")}] Đã tiếp nhận yêu cầu chuyển đổi video 16:9 ➔ 9:16 Dọc...`,
        ]),
        meta: JSON.stringify({
          mode,
          resolution,
          fps,
          bitrate,
          originalName: fileName,
        }),
      },
    });

    const jobId = job.id;
    const uploadsDir = getUploadsDir();
    const saveFileName = `${jobId}_source.${ext}`;
    const saveFilePath = path.join(uploadsDir, saveFileName);

    // 2. Lưu file video vào uploads folder
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(saveFilePath, buffer);

    // Cập nhật mediaPath vào meta
    const currentMeta = JSON.parse(job.meta || "{}");
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        meta: JSON.stringify({
          ...currentMeta,
          mediaPath: saveFilePath,
        }),
      },
    });

    // 3. Đưa vào Queue Manager
    jobQueueManager.addJob(jobId, () => processConvertRatioJob(jobId));

    return NextResponse.json({
      success: true,
      jobId,
      message: "Đã tạo tiến trình chuyển đổi video 9:16 thành công",
    });
  } catch (err: any) {
    console.error("[API convert-ratio] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi xử lý chuyển đổi video" },
      { status: 500 }
    );
  }
}
