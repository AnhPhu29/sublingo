"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Combine,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Check,
  Download,
  AlertTriangle,
  Play,
  Film,
  Clock,
  HardDrive,
  RefreshCw,
  X,
} from "lucide-react";

export interface MergeVideoFileItem {
  id: string;
  file: File;
  name: string;
  size: number; // in bytes
  duration: number; // in seconds
  thumbnailUrl?: string;
}

interface MergeSectionProps {
  showToast?: (msg: string, type: "success" | "error" | "info") => void;
}

export const MergeSection: React.FC<MergeSectionProps> = ({ showToast }) => {
  const [videoList, setVideoList] = useState<MergeVideoFileItem[]>([]);
  const [resolution, setResolution] = useState<"original" | "720p" | "1080p" | "2k" | "4k">("original");

  // Drag and drop state for ordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Job states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [jobError, setJobError] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cuộn log tự động xuống cuối khi có log mới
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobLogs]);

  // Polling Job status
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "error" || jobStatus === "cancelled") {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        if (data.success && data.data) {
          setJobStatus(data.data.status);
          setProgressPercent(data.data.progressPercent || 0);
          if (Array.isArray(data.data.progressLog)) {
            setJobLogs(data.data.progressLog);
          }

          if (data.data.status === "done") {
            if (showToast) showToast("Ghép video hoàn tất thành công!", "success");
          } else if (data.data.status === "error") {
            setJobError(data.data.errorMessage || "Lỗi xử lý ghép video");
            if (showToast) showToast(`Ghép video thất bại: ${data.data.errorMessage}`, "error");
          }
        }
      } catch (err) {
        console.error("Polling job error:", err);
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 1500);
    checkStatus();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [jobId, jobStatus, showToast]);

  // Helper đọc duration và tạo thumbnail bằng canvas
  const processVideoMetadata = (file: File): Promise<{ duration: number; thumbnailUrl?: string }> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const url = URL.createObjectURL(file);
      video.src = url;
      let durationSec = 0;
      let settled = false;

      // Timeout fallback: nếu onseeked/onerror không bắn sau 5s, vẫn resolve để không treo vòng lặp
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          URL.revokeObjectURL(url);
          resolve({ duration: durationSec });
        }
      }, 5000);

      const cleanup = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      };

      video.onloadedmetadata = () => {
        durationSec = video.duration || 0;
        // Chụp thumbnail ở mốc 1 giây (hoặc 0 nếu video ngắn)
        video.currentTime = Math.min(1.0, durationSec / 2);
      };

      video.onseeked = () => {
        if (settled) return;
        settled = true;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.7);
            cleanup();
            resolve({ duration: durationSec, thumbnailUrl });
            return;
          }
        } catch (e) {
          /* ignore canvas error */
        }
        cleanup();
        resolve({ duration: durationSec });
      };

      video.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ duration: 0 });
      };
    });
  };

  // Thêm file video mới — xử lý song song bằng Promise.all
  const handleAddFiles = async (files: FileList | File[]) => {
    const validExtensions = ["mp4", "mov", "mkv", "avi", "webm"];
    const fileArray = Array.from(files);

    const validFiles = fileArray.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!validExtensions.includes(ext)) {
        if (showToast) showToast(`File '.${ext}' không được hỗ trợ.`, "error");
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Xử lý metadata tất cả file song song (không tuần tự) để không bị treo
    const metaResults = await Promise.all(validFiles.map((file) => processVideoMetadata(file)));

    const newItems: MergeVideoFileItem[] = validFiles.map((file, i) => ({
      id: "vid_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now() + "_" + i,
      file,
      name: file.name,
      size: file.size,
      duration: metaResults[i].duration,
      thumbnailUrl: metaResults[i].thumbnailUrl,
    }));

    if (newItems.length > 0) {
      setVideoList((prev) => [...prev, ...newItems]);
    }
  };


  // Xóa video khỏi danh sách
  const handleRemoveItem = (id: string) => {
    setVideoList((prev) => prev.filter((item) => item.id !== id));
  };

  // Di chuyển thứ tự (Move Up / Down)
  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= videoList.length) return;

    const updated = [...videoList];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setVideoList(updated);
  };

  // Drag & Drop reordering logic
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...videoList];
    const draggedItem = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setVideoList(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Tính tổng thời lượng (giây)
  const totalDurationSeconds = videoList.reduce((acc, item) => acc + item.duration, 0);

  // Format thời lượng mm:ss hoặc hh:mm:ss
  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return "00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Helper upload file siêu tốc dạng Chunked 50MB & Local Direct Path
  const uploadFileChunkedWithProgress = async (
    file: File,
    filename: string,
    onProgress: (pct: number, loadedMB: string, totalMB: string, chunkInfo?: string) => void
  ): Promise<any> => {
    const totalSize = file.size;
    const fileTotalMB = (totalSize / (1024 * 1024)).toFixed(1);
    const localPath = (file as any).path || "";

    // 1. Kiểm tra nếu là file Local trên Windows -> thử gửi đường dẫn trực tiếp (0s upload)
    if (localPath) {
      try {
        const filenameParam = encodeURIComponent(filename);
        const localParam = encodeURIComponent(localPath);
        const checkRes = await fetch(`/api/merge/upload-chunk?filename=${filenameParam}&localPath=${localParam}`, {
          method: "POST",
        });
        const checkData = await checkRes.json();
        if (checkData.success && checkData.isLocalDirect) {
          onProgress(100, fileTotalMB, fileTotalMB, "Đọc trực tiếp từ ổ đĩa local");
          return checkData;
        }
      } catch (e) {}
    }

    // 2. Tải lên theo các khối 20MB (Chunked Stream) mượt mà, tránh lỗi Payload Too Large
    const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB per chunk
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    const uploadId = "up_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();

    let uploadedBytes = 0;
    let finalResult: any = null;

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkBlob = file.slice(start, end);

      const filenameParam = encodeURIComponent(filename);
      const url = `/api/merge/upload-chunk?uploadId=${uploadId}&chunkIndex=${chunkIdx}&totalChunks=${totalChunks}&filename=${filenameParam}`;

      const chunkRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: chunkBlob,
      });

      let chunkData: any;
      const responseText = await chunkRes.text();
      try {
        chunkData = JSON.parse(responseText);
      } catch (jsonErr) {
        throw new Error(
          chunkRes.status === 413
            ? `Dung lượng khối quá lớn (413). Vui lòng thử lại.`
            : `Máy chủ phản hồi lỗi (${chunkRes.status}): ${responseText.slice(0, 120) || "Không thể phân tích dữ liệu"}`
        );
      }

      if (!chunkRes.ok || !chunkData.success) {
        throw new Error(chunkData.error || `Lỗi tải lên khối ${chunkIdx + 1}/${totalChunks}`);
      }

      uploadedBytes += (end - start);
      const pct = Math.round((uploadedBytes / totalSize) * 100);
      const loadedMB = (uploadedBytes / (1024 * 1024)).toFixed(1);

      onProgress(pct, loadedMB, fileTotalMB, `Gói ${chunkIdx + 1}/${totalChunks}`);

      if (chunkData.isComplete) {
        finalResult = chunkData;
      }
    }

    return finalResult;
  };

  // Gửi request Ghép Video
  const handleStartMerge = async () => {
    if (videoList.length < 2) {
      if (showToast) showToast("Vui lòng thêm ít nhất 2 video để ghép nối.", "error");
      return;
    }

    setIsSubmitting(true);
    setJobError("");
    setJobLogs(["[Upload] Bắt đầu tải lên các tệp video (kích hoạt luồng Chunked 50MB siêu tốc)..."]);
    setJobStatus("queued");
    setProgressPercent(0);

    try {
      const uploadedFileItems: Array<{ filePath: string; originalName: string; duration: number }> = [];

      for (let i = 0; i < videoList.length; i++) {
        const item = videoList[i];
        const fileTotalMB = (item.size / (1024 * 1024)).toFixed(1);

        const initialLog = `[Upload ${i + 1}/${videoList.length}] Đang tải lên "${item.name}" (0 / ${fileTotalMB} MB - 0%)...`;
        setJobLogs((prev) => [...prev, initialLog]);

        const upData = await uploadFileChunkedWithProgress(
          item.file,
          item.name,
          (pct, loadedMB, totalMB, chunkInfo) => {
            const uploadPartPct = Math.round(((i + pct / 100) / videoList.length) * 15);
            setProgressPercent(uploadPartPct);

            setJobLogs((prev) => {
              const updated = [...prev];
              const infoTag = chunkInfo ? ` (${chunkInfo})` : "";
              updated[updated.length - 1] = `[Upload ${i + 1}/${videoList.length}] Đang tải lên "${item.name}" (${loadedMB} / ${totalMB} MB - ${pct}%)${infoTag}...`;
              return updated;
            });
          }
        );

        if (!upData || !upData.success) {
          throw new Error(upData?.error || `Lỗi tải lên tệp: ${item.name}`);
        }

        setJobLogs((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = `[Upload ${i + 1}/${videoList.length}] ✓ Tải lên hoàn tất "${item.name}" (${fileTotalMB} MB)`;
          return updated;
        });

        uploadedFileItems.push({
          filePath: upData.filePath,
          originalName: item.name,
          duration: upData.duration || item.duration,
        });
      }

      setJobLogs((prev) => [...prev, "[Upload] ✓ Tất cả video đã tải lên thành công. Đang kích hoạt tiến trình ghép nối..."]);

      const res = await fetch("/api/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resolution,
          files: uploadedFileItems,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể khởi tạo job ghép video.");
      }

      setJobId(data.jobId);
      if (showToast) showToast("Đã tạo tiến trình ghép video thành công!", "info");
    } catch (err: any) {
      console.error("Start merge error:", err);
      setJobStatus("error");
      setJobError(err.message || "Lỗi khởi tạo job");
      if (showToast) showToast(err.message || "Lỗi khởi tạo ghép video", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hủy / Dừng job
  const handleStopJob = async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      setJobStatus("cancelled");
      if (showToast) showToast("Đã dừng tiến trình ghép video.", "info");
    } catch (err) {
      console.error("Stop job error:", err);
    }
  };

  // Trạng thái reset
  const handleReset = () => {
    setVideoList([]);
    setJobId(null);
    setJobStatus("idle");
    setProgressPercent(0);
    setJobLogs([]);
    setJobError("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", width: "100%", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header Banner Card */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(212, 175, 55, 0.08) 0%, rgba(30, 41, 59, 0.4) 100%)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "1.5rem 1.75rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "var(--accent-soft)",
              color: "var(--accent-gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Combine size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.35rem 0" }}>
              Ghép nhiều Video thành 1 Video hoàn chỉnh
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
              Nối các video ngắn nối đuôi nhau theo thứ tự tùy chỉnh. Tự động chuẩn hóa độ phân giải và tỷ lệ khung hình chuẩn nét.
            </p>
          </div>
        </div>

        {videoList.length > 0 && (
          <button
            onClick={handleReset}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-light)",
              color: "var(--text-muted)",
              borderRadius: "var(--radius-sm)",
              padding: "0.5rem 1rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              transition: "all 0.15s ease",
            }}
          >
            <RefreshCw size={15} /> Làm mới
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="merge-workspace-grid" style={{ gap: "1.75rem" }}>
        {/* Left Column: Upload Zone & Video Ordering List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleAddFiles(e.dataTransfer.files);
              }
            }}
            style={{
              border: "2px dashed var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              background: "var(--bg-elevated)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.85rem",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-gold)";
              e.currentTarget.style.background = "var(--accent-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "var(--bg-elevated)";
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,.mp4,.mov,.mkv,.avi,.webm"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent-gold)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Upload size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 650, fontSize: "0.98rem", marginBottom: "0.25rem" }}>
                Kéo & thả hoặc chọn NHIỀU file video cùng lúc
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Hỗ trợ: Giữ Ctrl/Shift để chọn nhiều file .mp4, .mov, .mkv, .avi, .webm cùng lúc
              </div>
            </div>
          </div>

          {/* Video List & Ordering Cards */}
          {videoList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.25rem" }}>
                <span style={{ fontSize: "0.92rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Film size={18} style={{ color: "var(--accent-gold)" }} />
                  Danh sách ghép nối ({videoList.length} video)
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: "var(--accent-gold)",
                    color: "#000",
                    border: "none",
                    borderRadius: "var(--radius-xs)",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 650,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <Upload size={14} /> + Thêm video khác
                </button>
              </div>

              {videoList.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    background: draggedIndex === idx ? "var(--accent-soft)" : "var(--bg-elevated)",
                    border: draggedIndex === idx ? "1px solid var(--accent-gold)" : "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.85rem 1rem",
                    transition: "all 0.15s ease",
                    cursor: "grab",
                    boxShadow: "var(--shadow-xs)",
                  }}
                >
                  {/* Order Index & Drag Handle */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)" }}>
                    <GripVertical size={18} style={{ cursor: "grab", flexShrink: 0 }} />
                    <span
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "var(--bg-elevated-2)",
                        color: "var(--accent-gold)",
                        fontSize: "0.78rem",
                        fontWeight: 750,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                  </div>

                  {/* Thumbnail */}
                  <div
                    style={{
                      width: "80px",
                      height: "45px",
                      borderRadius: "6px",
                      background: "#000",
                      overflow: "hidden",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Film size={20} style={{ color: "#6B7280" }} />
                    )}
                  </div>

                  {/* File Info */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    <span
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", fontSize: "0.76rem", color: "var(--text-muted)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <HardDrive size={13} /> {formatFileSize(item.size)}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <Clock size={13} /> {formatDuration(item.duration)}
                      </span>
                    </div>
                  </div>

                  {/* Order Controls (Move Up/Down) & Delete */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <button
                      onClick={() => handleMove(idx, "up")}
                      disabled={idx === 0}
                      title="Di chuyển lên trên"
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: idx === 0 ? "var(--border)" : "var(--text)",
                        cursor: idx === 0 ? "default" : "pointer",
                        padding: "0.35rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      onClick={() => handleMove(idx, "down")}
                      disabled={idx === videoList.length - 1}
                      title="Di chuyển xuống dưới"
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: idx === videoList.length - 1 ? "var(--border)" : "var(--text)",
                        cursor: idx === videoList.length - 1 ? "default" : "pointer",
                        padding: "0.35rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      title="Xóa khỏi danh sách"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#EF4444",
                        cursor: "pointer",
                        padding: "0.35rem",
                        marginLeft: "0.25rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "4px",
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Settings & Execution Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Summary Card */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "1.25rem 1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, borderBottom: "1px solid var(--border-light)", paddingBottom: "0.75rem" }}>
              Cấu hình ghép nối
            </h3>

            {/* Resolution dropdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
                Độ phân giải đầu ra:
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as any)}
                style={{
                  background: "var(--bg-elevated-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--text)",
                  padding: "0.6rem 0.85rem",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="original">Giữ nguyên độ phân giải video đầu tiên</option>
                <option value="720p">720p HD (1280x720 / 720x1280)</option>
                <option value="1080p">1080p Full HD (1920x1080 / 1080x1920)</option>
                <option value="2k">2K QHD (2560x1440 / 1440x2560 - Siêu nét)</option>
                <option value="4k">4K Ultra HD (3840x2160 / 2160x3840 - Nét đỉnh cao)</option>
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                * Hệ thống tự động nhận diện video Dọc (9:16) hoặc Ngang (16:9) để xuất độ phân giải chuẩn nét tương ứng.
              </span>
            </div>

            {/* Total Duration Overview */}
            <div
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-xs)",
                padding: "0.85rem 1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                <span>Tổng số lượng:</span>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{videoList.length} video</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                <span>Tổng thời lượng ước tính:</span>
                <span style={{ fontWeight: 750, color: "var(--accent-gold)" }}>{formatDuration(totalDurationSeconds)}</span>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleStartMerge}
              disabled={isSubmitting || videoList.length < 2 || (jobStatus === "processing" || jobStatus === "queued")}
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #B58A28 100%)",
                color: "#1E293B",
                border: "none",
                borderRadius: "var(--radius-xs)",
                padding: "0.85rem 1rem",
                fontSize: "0.95rem",
                fontWeight: 750,
                cursor: videoList.length < 2 || isSubmitting || jobStatus === "processing" ? "not-allowed" : "pointer",
                opacity: videoList.length < 2 || isSubmitting || jobStatus === "processing" ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                boxShadow: "0 4px 12px rgba(212, 175, 55, 0.25)",
                transition: "all 0.2s ease",
              }}
            >
              {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Combine size={18} />}
              <span>{isSubmitting ? "Đang gửi dữ liệu..." : "Ghép Video"}</span>
            </button>
          </div>

          {/* Job Status & Realtime Progress */}
          {(jobId || jobStatus !== "idle") && (
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Clock size={16} /> Tiến trình ghép nối:
                </span>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                    background:
                      jobStatus === "done"
                        ? "#D1FAE5"
                        : jobStatus === "error"
                        ? "#FEE2E2"
                        : "var(--accent-soft)",
                    color:
                      jobStatus === "done"
                        ? "#059669"
                        : jobStatus === "error"
                        ? "#DC2626"
                        : "var(--accent-gold)",
                  }}
                >
                  {jobStatus === "queued" && "Đang chờ..."}
                  {jobStatus === "processing" && `Đang xử lý (${progressPercent}%)`}
                  {jobStatus === "done" && "Hoàn tất!"}
                  {jobStatus === "error" && "Gặp lỗi"}
                  {jobStatus === "cancelled" && "Đã dừng"}
                </span>
              </div>

              {/* Progress Bar */}
              {(jobStatus === "processing" || jobStatus === "queued") && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "var(--bg-elevated-2)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progressPercent}%`,
                        height: "100%",
                        background: "var(--accent-gold)",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleStopJob}
                      style={{
                        background: "#FEF2F2",
                        color: "#DC2626",
                        border: "1px solid #EF4444",
                        borderRadius: "4px",
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Dừng tiến trình
                    </button>
                  </div>
                </div>
              )}

              {/* Log Window */}
              <div
                ref={logRef}
                style={{
                  background: "#0F172A",
                  color: "#94A3B8",
                  borderRadius: "6px",
                  padding: "0.75rem 0.85rem",
                  fontFamily: "monospace",
                  fontSize: "0.76rem",
                  maxHeight: "150px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {jobLogs.length === 0 ? (
                  <div>[Log] Đang chuẩn bị dữ liệu...</div>
                ) : (
                  jobLogs.map((log, lIdx) => (
                    <div key={lIdx} style={{ color: log.includes("✓") ? "#34D399" : log.includes("✗") ? "#F87171" : "#94A3B8" }}>
                      {log}
                    </div>
                  ))
                )}
              </div>

              {/* Error Alert */}
              {jobStatus === "error" && (
                <div style={{ color: "#EF4444", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <AlertTriangle size={15} /> ⚠️ Lỗi: {jobError}
                </div>
              )}

              {/* Result Preview & Download */}
              {jobStatus === "done" && jobId && (
                <div
                  style={{
                    background: "var(--bg-elevated-2)",
                    border: "1px solid #10B981",
                    borderRadius: "8px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.85rem",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#10B981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Check size={18} /> Video ghép nối đã sẵn sàng:
                  </div>

                  <video
                    controls
                    src={`/api/merge/download/${jobId}`}
                    style={{ width: "100%", borderRadius: "6px", background: "#000", maxHeight: "200px" }}
                  />

                  <button
                    onClick={() => {
                      window.open(`/api/merge/download/${jobId}`, "_blank");
                    }}
                    style={{
                      background: "#10B981",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "6px",
                      padding: "0.55rem 1rem",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Download size={16} /> Tải Video Về Máy
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
