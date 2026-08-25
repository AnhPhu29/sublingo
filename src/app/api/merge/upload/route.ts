import { NextResponse } from "next/server";
import { getUploadsDir } from "@/lib/queue";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

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
  let tempFilePath = "";
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

    const { searchParams } = new URL(request.url);
    const contentType = request.headers.get("content-type") || "";

    let originalName = "video.mp4";
    let ext = "mp4";
    const uploadsDir = getUploadsDir();

    // 🚀 Stream trực tiếp bằng Readable.fromWeb + pipeline (Không tạo Buffer tập trung -> Không bao giờ bị RangeError 2GB)
    if (contentType.includes("application/octet-stream") || searchParams.has("filename")) {
      const rawFileName = searchParams.get("filename") || "video.mp4";
      originalName = decodeURIComponent(rawFileName);
      ext = originalName.split(".").pop()?.toLowerCase() || "mp4";

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          {
            success: false,
            error: `Định dạng file '.${ext}' không được hỗ trợ (${ALLOWED_EXTENSIONS.join(", ")}).`,
          },
          { status: 400 }
        );
      }

      if (!request.body) {
        return NextResponse.json(
          { success: false, error: "Không nhận được dữ liệu file tải lên" },
          { status: 400 }
        );
      }

      const tempFileName = `temp_${Math.random().toString(36).substring(2, 9)}_${Date.now()}.${ext}`;
      tempFilePath = path.join(uploadsDir, tempFileName);

      const writeStream = fs.createWriteStream(tempFilePath);
      const nodeStream = Readable.fromWeb(request.body as any);
      await pipeline(nodeStream, writeStream);
    } else {
      // Fallback FormData: dùng file.stream() thay vì file.arrayBuffer()
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (parseErr: any) {
        console.error("[Merge Upload API] Failed to parse formData stream:", parseErr);
        return NextResponse.json(
          {
            success: false,
            error: "Không thể đọc dữ liệu file video. Vui lòng kiểm tra lại dung lượng hoặc kết nối mạng.",
          },
          { status: 400 }
        );
      }

      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json(
          { success: false, error: "Thiếu file video tải lên" },
          { status: 400 }
        );
      }

      originalName = file.name || "video.mp4";
      ext = originalName.split(".").pop()?.toLowerCase() || "mp4";

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          {
            success: false,
            error: `Định dạng file '.${ext}' không được hỗ trợ (${ALLOWED_EXTENSIONS.join(", ")}).`,
          },
          { status: 400 }
        );
      }

      const tempFileName = `temp_${Math.random().toString(36).substring(2, 9)}_${Date.now()}.${ext}`;
      tempFilePath = path.join(uploadsDir, tempFileName);

      const writeStream = fs.createWriteStream(tempFilePath);
      const nodeStream = Readable.fromWeb(file.stream() as any);
      await pipeline(nodeStream, writeStream);
    }

    return NextResponse.json({
      success: true,
      filePath: tempFilePath,
      originalName,
      duration: 0,
    });
  } catch (err: any) {
    console.error("POST /api/merge/upload error:", err);
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi tải lên file video" },
      { status: 500 }
    );
  }
}

export const maxDuration = 300;
