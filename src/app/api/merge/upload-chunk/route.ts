import { NextResponse } from "next/server";
import { getUploadsDir } from "@/lib/queue";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

export async function POST(request: Request) {
  let partFilePath = "";
  try {
    if (process.env.ACCESS_PASSWORD) {
      const cookieHeader = request.headers.get("cookie") || "";
      if (!cookieHeader.includes("sublingo_session=")) {
        return NextResponse.json(
          { success: false, error: "Chưa đăng nhập hoặc phiên làm việc hết hạn." },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get("uploadId");
    const chunkIndex = parseInt(searchParams.get("chunkIndex") || "0", 10);
    const totalChunks = parseInt(searchParams.get("totalChunks") || "1", 10);
    const rawFileName = searchParams.get("filename") || "video.mp4";
    const localPath = searchParams.get("localPath");

    const uploadsDir = getUploadsDir();

    // 🚀 TỐI ƯU CỰC ĐẠI #1: Nếu là tệp Local trên máy và Server có thể đọc trực tiếp -> DÙNG NGAY 0S UPLOAD!
    if (localPath && fs.existsSync(localPath)) {
      try {
        const stat = fs.statSync(localPath);
        if (stat.isFile() && stat.size > 0) {
          console.log(`[Merge Chunk API] Local file detected & accessible directly: ${localPath}`);
          return NextResponse.json({
            success: true,
            filePath: localPath,
            originalName: path.basename(localPath),
            isLocalDirect: true,
          });
        }
      } catch (e) {}
    }

    if (!uploadId) {
      return NextResponse.json(
        { success: false, error: "Thiếu uploadId" },
        { status: 400 }
      );
    }

    let originalName = rawFileName;
    try {
      originalName = decodeURIComponent(rawFileName);
    } catch {
      originalName = rawFileName;
    }
    const ext = originalName.split(".").pop()?.toLowerCase() || "mp4";

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: `Định dạng file '.${ext}' không được hỗ trợ (${ALLOWED_EXTENSIONS.join(", ")}).`,
        },
        { status: 400 }
      );
    }

    const chunkArrayBuffer = await request.arrayBuffer();
    if (!chunkArrayBuffer || chunkArrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { success: false, error: "Không nhận được dữ liệu chunk (khối trống)" },
        { status: 400 }
      );
    }

    partFilePath = path.join(uploadsDir, `chunk_${uploadId}.part`);
    if (chunkIndex === 0 && fs.existsSync(partFilePath)) {
      try {
        fs.unlinkSync(partFilePath);
      } catch (e) {}
    }

    // Ghi nối tiếp (Buffer append) từng chunk -> An toàn 100% trên Windows OS, không lỗi stream pipeline
    const chunkBuffer = Buffer.from(chunkArrayBuffer);
    fs.appendFileSync(partFilePath, chunkBuffer);

    // Nếu là chunk cuối cùng -> Đổi tên file part thành file temp hoàn chỉnh trong 1ms!
    if (chunkIndex >= totalChunks - 1) {
      const finalFileName = `temp_${uploadId}.${ext}`;
      const finalFilePath = path.join(uploadsDir, finalFileName);

      if (fs.existsSync(finalFilePath)) {
        fs.unlinkSync(finalFilePath);
      }
      fs.renameSync(partFilePath, finalFilePath);

      return NextResponse.json({
        success: true,
        isComplete: true,
        filePath: finalFilePath,
        originalName,
      });
    }

    return NextResponse.json({
      success: true,
      isComplete: false,
      chunkIndex,
      totalChunks,
    });
  } catch (err: any) {
    console.error("POST /api/merge/upload-chunk error:", err);
    if (partFilePath && fs.existsSync(partFilePath)) {
      try {
        fs.unlinkSync(partFilePath);
      } catch (e) {}
    }
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi tải lên chunk video" },
      { status: 500 }
    );
  }
}

export const maxDuration = 300;
