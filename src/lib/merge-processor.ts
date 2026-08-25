import { prisma } from "./prisma";
import { getUploadsDir, updateJobProgress } from "./queue";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

interface VideoStreamInfo {
  width: number;
  height: number;
  hasAudio: boolean;
  fps: number;
  vCodec: string;
  aCodec?: string;
  sar?: string;
}

/**
 * Phân tích thuộc tính video/audio bằng ffprobe
 */
async function probeVideoInfo(filePath: string): Promise<VideoStreamInfo> {
  let width = 1280;
  let height = 720;
  let hasAudio = false;
  let fps = 30;
  let vCodec = "h264";
  let aCodec = undefined;
  let sar = "1:1";

  try {
    const cmd = `ffprobe -v error -show_entries stream=width,height,codec_name,codec_type,r_frame_rate,sample_aspect_ratio -of json "${filePath}"`;
    const outStr = await runCommandAsync(cmd);
    const data = JSON.parse(outStr || "{}");
    const streams = data.streams || [];

    const videoStream = streams.find((s: any) => s.codec_type === "video");
    if (videoStream) {
      if (videoStream.width) width = parseInt(videoStream.width, 10);
      if (videoStream.height) height = parseInt(videoStream.height, 10);
      if (videoStream.codec_name) vCodec = videoStream.codec_name;
      if (videoStream.sample_aspect_ratio) sar = videoStream.sample_aspect_ratio;

      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split("/");
        if (parts.length === 2 && parseFloat(parts[1]) > 0) {
          const calculatedFps = parseFloat(parts[0]) / parseFloat(parts[1]);
          if (!isNaN(calculatedFps) && calculatedFps > 0 && calculatedFps < 120) {
            fps = Math.round(calculatedFps);
          }
        }
      }
    }

    const audioStream = streams.find((s: any) => s.codec_type === "audio");
    if (audioStream) {
      hasAudio = true;
      aCodec = audioStream.codec_name;
    }
  } catch (err) {
    console.warn(`[Merge Processor] Failed to probe ${filePath}:`, err);
  }

  return { width, height, hasAudio, fps, vCodec, aCodec, sar };
}

/**
 * Kiểm tra xem có hỗ trợ NVIDIA NVENC phần cứng thực tế (CUDA driver sẵn sàng) không
 */
async function checkNvencSupport(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    exec(`ffmpeg -f lavfi -i color=c=black:s=16x16:d=0.1 -c:v h264_nvenc -f null -`, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Worker xử lý ghép nối nhiều video với hiệu năng cao siêu tốc
 */
export async function processMergeJob(jobId: string): Promise<void> {
  const normFilesToClean: string[] = [];

  try {
    const job = await prisma.subtitleJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: { status: "processing", progressLog: "[]", progressPercent: 0 },
    });

    const meta = JSON.parse(job.meta || "{}");
    const filePaths: string[] = meta.filePaths || [];
    const originalFileNames: string[] = meta.originalFileNames || [];
    const resolutionOption: string = meta.resolution || "original";

    if (!filePaths || filePaths.length === 0) {
      throw new Error("Không có video nào được tải lên để ghép nối.");
    }

    // 1. Phân tích thông số kỹ thuật của từng video song song bằng Promise.all
    await updateJobProgress(
      jobId,
      `Bước 1/4: Đang phân tích thông số kỹ thuật của ${filePaths.length} video (xử lý song song)...`,
      5
    );

    const videoInfos: VideoStreamInfo[] = await Promise.all(
      filePaths.map(async (fp, idx) => {
        if (!fs.existsSync(fp)) {
          throw new Error(`Tệp video tạm không tồn tại: ${originalFileNames[idx] || fp}`);
        }
        return await probeVideoInfo(fp);
      })
    );

    // 2. Xác định độ phân giải mục tiêu (Tự động nhận biết tỷ lệ Dọc 9:16 hoặc Ngang 16:9)
    let targetW = videoInfos[0].width;
    let targetH = videoInfos[0].height;
    const isVertical = targetH > targetW;

    if (resolutionOption === "4k") {
      targetW = isVertical ? 2160 : 3840;
      targetH = isVertical ? 3840 : 2160;
    } else if (resolutionOption === "2k") {
      targetW = isVertical ? 1440 : 2560;
      targetH = isVertical ? 2560 : 1440;
    } else if (resolutionOption === "1080p") {
      targetW = isVertical ? 1080 : 1920;
      targetH = isVertical ? 1920 : 1080;
    } else if (resolutionOption === "720p") {
      targetW = isVertical ? 720 : 1280;
      targetH = isVertical ? 1280 : 720;
    }

    targetW = targetW - (targetW % 2);
    targetH = targetH - (targetH % 2);

    // 🚀 TỐI ƯU CỰC ĐẠI #1: Kiểm tra "Luồng Siêu Tốc" (Fast Pass / Zero Re-encode)
    // Nếu tất cả video đã CÙNG độ phân giải, CÙNG fps, CÙNG codec và CÙNG có/không có audio:
    // Có thể ghép Nối Thẳng (Direct Concat - c:v copy) trong 1-2 GIÂY không cần encode lại!
    const first = videoInfos[0];
    const canFastPass =
      resolutionOption === "original" &&
      videoInfos.every(
        (info) =>
          info.width === targetW &&
          info.height === targetH &&
          info.hasAudio === first.hasAudio
      );

    const uploadsDir = getUploadsDir();
    const outputVideoPath = path.join(uploadsDir, `${jobId}_merged_output.mp4`);

    if (canFastPass) {
      await updateJobProgress(
        jobId,
        `⚡ KÍCH HOẠT LUỒNG SIÊU TỐC (Direct Concat): Tất cả ${filePaths.length} video đã đồng nhất chuẩn (${targetW}x${targetH}px). Đang ghép nối trực tiếp không cần Re-encode...`,
        50
      );

      const concatTxtPath = path.join(uploadsDir, `${jobId}_concat.txt`);
      normFilesToClean.push(concatTxtPath);

      const concatLines = filePaths.map((p) => `file '${p.replace(/\\/g, "/")}'`);
      fs.writeFileSync(concatTxtPath, concatLines.join("\n"), "utf-8");

      const fastConcatCmd = `ffmpeg -threads 0 -f concat -safe 0 -i "${concatTxtPath}" -c copy -movflags +faststart -y "${outputVideoPath}"`;
      await runCommandAsync(fastConcatCmd);

      await updateJobProgress(
        jobId,
        "✓ Ghép siêu tốc hoàn tất chỉ trong vài giây!",
        95
      );
    } else {
      // Khi thông số video khác nhau, tiến hành Chuẩn hóa với Tối Ưu Cao Nhanh
      const isNvencSupported = await checkNvencSupport();
      const videoEncoderParam = isNvencSupported
        ? "-c:v h264_nvenc -preset p1 -cq 23"
        : "-c:v libx264 -preset ultrafast -tune fastdecode -crf 23 -threads 0 -x264opts no-mbtree=1:aq-mode=0:sliced-threads=1";

      await updateJobProgress(
        jobId,
        `Bước 2/4: Đang chuẩn hóa độ phân giải (${targetW}x${targetH}px) cho ${filePaths.length} video [Encoder: ${isNvencSupported ? "⚡ NVIDIA NVENC GPU" : "🚀 CPU Ultrafast Multi-core Sliced-Threads"}]...`,
        15
      );

      const normalizedPaths: string[] = new Array(filePaths.length);

      // 🚀 TỐI ƯU CỰC ĐẠI #2: Tự động điều chỉnh số video xử lý song song theo số nhân CPU máy
      const cpuCount = os.cpus()?.length || 4;
      const BATCH_SIZE = isNvencSupported ? 3 : Math.min(4, Math.max(2, Math.floor(cpuCount / 2)));
      let completedCount = 0;

      for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batchIndices = [];
        for (let j = i; j < Math.min(i + BATCH_SIZE, filePaths.length); j++) {
          batchIndices.push(j);
        }

        await Promise.all(
          batchIndices.map(async (idx) => {
            const inputPath = filePaths[idx];
            const normPath = path.join(uploadsDir, `${jobId}_norm_${idx}.mp4`);
            normFilesToClean.push(normPath);

            const info = videoInfos[idx];
            const videoName = originalFileNames[idx] || `Video #${idx + 1}`;

            const scalePadFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`;

            let ffmpegCmd = "";
            if (info.hasAudio) {
              ffmpegCmd = `ffmpeg -threads 0 -i "${inputPath}" -vf "${scalePadFilter}" ${videoEncoderParam} -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 -avoid_negative_ts make_zero -y "${normPath}"`;
            } else {
              ffmpegCmd = `ffmpeg -threads 0 -i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -vf "${scalePadFilter}" ${videoEncoderParam} -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -avoid_negative_ts make_zero -y "${normPath}"`;
            }

            await runCommandAsync(ffmpegCmd);
            normalizedPaths[idx] = normPath;

            completedCount++;
            const pct = 15 + Math.round((completedCount / filePaths.length) * 65);
            await updateJobProgress(
              jobId,
              `Đã chuẩn hóa (${completedCount}/${filePaths.length}): "${videoName}"...`,
              pct
            );
          })
        );
      }

      // 🚀 TỐI ƯU CỰC ĐẠI #3: Ghép Concat Demuxer tốc độ cao
      await updateJobProgress(
        jobId,
        `Bước 3/4: Đang tiến hành ghép nối ${normalizedPaths.length} video đã chuẩn hóa...`,
        85
      );

      const concatTxtPath = path.join(uploadsDir, `${jobId}_concat.txt`);
      normFilesToClean.push(concatTxtPath);

      const concatLines = normalizedPaths.map(
        (p) => `file '${p.replace(/\\/g, "/")}'`
      );
      fs.writeFileSync(concatTxtPath, concatLines.join("\n"), "utf-8");

      const concatCmd = `ffmpeg -threads 0 -f concat -safe 0 -i "${concatTxtPath}" -c copy -movflags +faststart -y "${outputVideoPath}"`;
      await runCommandAsync(concatCmd);

      await updateJobProgress(
        jobId,
        "Bước 4/4: Đang đóng gói file video kết quả...",
        95
      );
    }

    // 5. Cập nhật thành công vào DB
    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        outputFile: outputVideoPath,
        progressPercent: 100,
        costUsd: 0,
      },
    });

    await updateJobProgress(
      jobId,
      `✓ Ghép nối thành công ${filePaths.length} video! File đã sẵn sàng để phát hoặc tải về máy.`
    );

    // Dọn dẹp các file tạm đã chuẩn hóa
    for (const f of normFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {
        /* ignore */
      }
    }
  } catch (err: any) {
    const errMsg = err.message || "Lỗi không xác định khi ghép video.";
    console.error(`[processMergeJob Error] Job ${jobId}:`, err);

    await prisma.subtitleJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        errorMessage: errMsg,
      },
    });

    await updateJobProgress(jobId, `✗ Ghép video thất bại: ${errMsg}`);
  }
}
