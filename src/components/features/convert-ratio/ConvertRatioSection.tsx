"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Smartphone,
  Sparkles,
  Crop,
  Square,
  CheckCircle2,
  Film,
  Play,
  Pause,
  Download,
  RefreshCw,
  AlertTriangle,
  FileVideo,
  Settings,
  Layers,
} from "lucide-react";

interface ConvertRatioSectionProps {
  showToast?: (msg: string, type: "success" | "error" | "info") => void;
}

export const ConvertRatioSection: React.FC<ConvertRatioSectionProps> = ({ showToast }) => {
  // Source Video State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Conversion Settings
  const [mode, setMode] = useState<"blur" | "crop" | "pad">("blur");
  const [resolution, setResolution] = useState<"1080p" | "720p" | "4k">("1080p");
  const [fps, setFps] = useState<number>(30);
  const [bitrate, setBitrate] = useState<"8mbps" | "16mbps">("8mbps");

  // Job & Processing State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [jobError, setJobError] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-create Object URL for uploaded video
  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [videoFile]);

  // Auto scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobLogs]);

  // Poll Job Status
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "error") {
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
            if (showToast) showToast("✨ Biến đổi video 16:9 ➔ 9:16 Dọc hoàn tất!", "success");
          } else if (data.data.status === "error") {
            setJobError(data.data.errorMessage || "Lỗi xử lý chuyển đổi video");
            if (showToast) showToast(`Gặp lỗi: ${data.data.errorMessage}`, "error");
          }
        }
      } catch (err) {
        console.error("Polling job status error:", err);
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 1500);
    checkStatus();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [jobId, jobStatus, showToast]);

  // Start Conversion Job
  const handleStartConversion = async () => {
    if (!videoFile) {
      if (showToast) showToast("Vui lòng tải lên video nguồn 16:9 trước", "error");
      return;
    }

    setIsSubmitting(true);
    setJobError("");
    setJobLogs([]);
    setProgressPercent(0);
    setJobStatus("processing");

    try {
      const fd = new FormData();
      fd.append("file", videoFile);
      fd.append("mode", mode);
      fd.append("resolution", resolution);
      fd.append("fps", fps.toString());
      fd.append("bitrate", bitrate);

      const res = await fetch("/api/convert-ratio", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setJobId(data.jobId);
        if (showToast) showToast("Đã khởi tạo tiến trình biến đổi 9:16 Dọc TikTok!", "info");
      } else {
        throw new Error(data.error || "Không thể tạo job biến đổi tỉ lệ");
      }
    } catch (err: any) {
      setJobStatus("error");
      setJobError(err.message || "Lỗi khi khởi chạy");
      if (showToast) showToast(err.message || "Lỗi khi khởi chạy", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      
      {/* HEADER SECTION */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "1.25rem 1.75rem", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ background: "linear-gradient(135deg, #EC4899, #8B5CF6)", width: "46px", height: "46px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", boxShadow: "0 4px 14px rgba(236,72,153,0.35)" }}>
            <Smartphone size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "#111827", letterSpacing: "-0.01em" }}>
              Biến đổi Tỷ lệ Video 16:9 ➔ 9:16 (TikTok / Reels / Shorts)
            </h1>
            <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "2px 0 0 0" }}>
              Công cụ chuyên dụng chuyển video Ngang (16:9 Youtube/TV) thành Video Dọc (9:16 TikTok) với hiệu ứng Nền mờ CapCut nghệ thuật
            </p>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "1.5rem", alignItems: "start" }}>
        
        {/* LEFT COLUMN: SOURCE UPLOAD + MODE SELECTOR + OUTPUT SETTINGS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* CARD 1: UPLOAD SOURCE VIDEO */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <FileVideo size={18} style={{ color: "#EC4899" }} /> 1. Upload Video Nguồn (16:9 Ngang)
            </div>

            {videoFile ? (
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div style={{ background: "#FCE7F3", padding: "10px", borderRadius: "10px", color: "#EC4899" }}>
                    <Film size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#111827", maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {videoFile.name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "2px" }}>
                      {(videoFile.size / (1024 * 1024)).toFixed(1)} MB {durationSec > 0 ? `· ${formatSec(durationSec)}` : ""}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: "#FFF", border: "1px solid #D1D5DB", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.78rem", fontWeight: 600, color: "#374151", cursor: "pointer" }}
                >
                  Đổi video
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setVideoFile(f);
                }}
                style={{
                  border: isDragOver ? "2px dashed #EC4899" : "2px dashed #E5E7EB",
                  background: isDragOver ? "#FDF2F8" : "#FAFAFA",
                  borderRadius: "12px",
                  padding: "2.5rem 1.5rem",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ background: "#FCE7F3", width: "54px", height: "54px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#EC4899", marginBottom: "0.75rem" }}>
                  <Upload size={26} />
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111827" }}>
                  Tải lên Video nguồn 16:9 (.MP4, .MOV, .MKV, .WEBM)
                </div>
                <div style={{ fontSize: "0.78rem", color: "#6B7280", marginTop: "0.25rem" }}>
                  Kéo thả tệp video vào đây hoặc bấm để chọn từ máy tính
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setVideoFile(f); }} />
          </div>

          {/* CARD 2: CONVERSION MODE SELECTOR */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Layers size={18} style={{ color: "#8B5CF6" }} /> 2. Chọn Chế độ Biến đổi Tỷ lệ (16:9 ➔ 9:16)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.85rem" }}>
              
              {/* Option A: Blur Background CapCut */}
              <div
                onClick={() => setMode("blur")}
                style={{
                  border: mode === "blur" ? "2px solid #EC4899" : "1px solid #E5E7EB",
                  background: mode === "blur" ? "#FDF2F8" : "#FFF",
                  borderRadius: "12px",
                  padding: "1rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  boxShadow: mode === "blur" ? "0 4px 14px rgba(236,72,153,0.15)" : "none",
                }}
              >
                {mode === "blur" && (
                  <div style={{ position: "absolute", top: "10px", right: "10px", color: "#EC4899" }}>
                    <CheckCircle2 size={18} />
                  </div>
                )}
                <div style={{ color: "#EC4899", marginBottom: "0.5rem" }}>
                  <Sparkles size={24} />
                </div>
                <div style={{ fontWeight: 800, fontSize: "0.86rem", color: "#111827" }}>
                  Nền mờ CapCut
                </div>
                <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: "4px", lineHeight: "1.35" }}>
                  Giữ 100% video ở giữa, làm mờ phần nền trên/dưới (Khuyên dùng)
                </div>
              </div>

              {/* Option B: Crop Center */}
              <div
                onClick={() => setMode("crop")}
                style={{
                  border: mode === "crop" ? "2px solid #8B5CF6" : "1px solid #E5E7EB",
                  background: mode === "crop" ? "#F5F3FF" : "#FFF",
                  borderRadius: "12px",
                  padding: "1rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  boxShadow: mode === "crop" ? "0 4px 14px rgba(139,92,246,0.15)" : "none",
                }}
              >
                {mode === "crop" && (
                  <div style={{ position: "absolute", top: "10px", right: "10px", color: "#8B5CF6" }}>
                    <CheckCircle2 size={18} />
                  </div>
                )}
                <div style={{ color: "#8B5CF6", marginBottom: "0.5rem" }}>
                  <Crop size={24} />
                </div>
                <div style={{ fontWeight: 800, fontSize: "0.86rem", color: "#111827" }}>
                  Cắt tràn màn hình
                </div>
                <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: "4px", lineHeight: "1.35" }}>
                  Phóng to cắt khít 9:16 (Phù hợp nhân vật chính ở trung tâm)
                </div>
              </div>

              {/* Option C: Fit Pad */}
              <div
                onClick={() => setMode("pad")}
                style={{
                  border: mode === "pad" ? "2px solid #3B82F6" : "1px solid #E5E7EB",
                  background: mode === "pad" ? "#EFF6FF" : "#FFF",
                  borderRadius: "12px",
                  padding: "1rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  boxShadow: mode === "pad" ? "0 4px 14px rgba(59,130,246,0.15)" : "none",
                }}
              >
                {mode === "pad" && (
                  <div style={{ position: "absolute", top: "10px", right: "10px", color: "#3B82F6" }}>
                    <CheckCircle2 size={18} />
                  </div>
                )}
                <div style={{ color: "#3B82F6", marginBottom: "0.5rem" }}>
                  <Square size={24} />
                </div>
                <div style={{ fontWeight: 800, fontSize: "0.86rem", color: "#111827" }}>
                  Viền đen chuẩn
                </div>
                <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: "4px", lineHeight: "1.35" }}>
                  Thu nhỏ vừa khung 9:16, thêm 2 thanh viền đen trên dưới
                </div>
              </div>

            </div>
          </div>

          {/* CARD 3: OUTPUT ENCODING SETTINGS */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#111827", marginBottom: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Settings size={18} style={{ color: "#10B981" }} /> 3. Thông số Mã hóa Xuất Video (Output Settings)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              
              {/* Resolution */}
              <div>
                <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: "0.35rem" }}>
                  Độ phân giải
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  style={{ width: "100%", height: "36px", padding: "0 8px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "0.8rem", color: "#111827", outline: "none" }}
                >
                  <option value="1080p">📱 1080x1920 (Full HD TikTok - Khuyên dùng)</option>
                  <option value="720p">⚡ 720x1280 (HD Chuẩn)</option>
                  <option value="4k">💎 2160x3840 (4K Ultra HD)</option>
                </select>
              </div>

              {/* FPS */}
              <div>
                <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: "0.35rem" }}>
                  Tốc độ khung hình (FPS)
                </label>
                <select
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                  style={{ width: "100%", height: "36px", padding: "0 8px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "0.8rem", color: "#111827", outline: "none" }}
                >
                  <option value={30}>🎞️ 30 FPS (Mượt màng tiêu chuẩn)</option>
                  <option value={60}>🚀 60 FPS (Cực mượt màng)</option>
                </select>
              </div>

              {/* Bitrate */}
              <div>
                <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: "0.35rem" }}>
                  Băng thông Bitrate
                </label>
                <select
                  value={bitrate}
                  onChange={(e) => setBitrate(e.target.value as any)}
                  style={{ width: "100%", height: "36px", padding: "0 8px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "0.8rem", color: "#111827", outline: "none" }}
                >
                  <option value="8mbps">⚡ 8 Mbps (Tiêu chuẩn)</option>
                  <option value="16mbps">🔥 16 Mbps (Chất lượng cao nét căng)</option>
                </select>
              </div>

            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: 9:16 VERTICAL VIDEO PREVIEW CANVAS & ACTION */}
        <div style={{ position: "sticky", top: "20px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* CANVAS 9:16 PREVIEW BOX */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Màn hình Xem trước 9:16 Dọc</span>
              <span style={{ fontSize: "0.72rem", background: "#FCE7F3", color: "#EC4899", padding: "0.15rem 0.55rem", borderRadius: "12px", fontWeight: 700 }}>
                TikTok / Shorts
              </span>
            </div>

            <div style={{ position: "relative", width: "100%", height: "380px", background: "#000", borderRadius: "12px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  onLoadedMetadata={(e) => setDurationSec(e.currentTarget.duration || 0)}
                  style={{ width: "100%", height: "100%", objectFit: mode === "crop" ? "cover" : "contain" }}
                />
              ) : (
                <div style={{ textAlign: "center", color: "#9CA3AF", padding: "1.5rem" }}>
                  <Smartphone size={42} style={{ color: "#EC4899", marginBottom: "0.5rem" }} />
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#FFF" }}>Xem trước Khung 9:16</div>
                  <div style={{ fontSize: "0.75rem", marginTop: "4px" }}>Tải video ở bên trái để xem trước</div>
                </div>
              )}
            </div>

            {/* ACTION RENDER BUTTON */}
            <button
              onClick={handleStartConversion}
              disabled={isSubmitting || !videoFile}
              style={{
                marginTop: "1rem",
                width: "100%",
                padding: "0.85rem",
                background: isSubmitting || !videoFile ? "#9CA3AF" : "linear-gradient(135deg, #EC4899, #8B5CF6)",
                color: "#FFF",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.92rem",
                fontWeight: 800,
                cursor: isSubmitting || !videoFile ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                boxShadow: isSubmitting || !videoFile ? "none" : "0 4px 16px rgba(236,72,153,0.35)",
                transition: "all 0.15s ease",
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={18} className="spin" /> Đang tạo tiến trình...
                </>
              ) : (
                <>
                  <Smartphone size={18} /> 🚀 Bắt đầu Chuyển đổi sang 9:16 Dọc
                </>
              )}
            </button>
          </div>

          {/* LOGS & RESULT CARD */}
          {(jobStatus === "processing" || jobStatus === "done" || jobStatus === "error") && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "1.25rem", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#111827", marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Tiến trình xử lý FFmpeg</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 800, color: jobStatus === "done" ? "#10B981" : jobStatus === "error" ? "#EF4444" : "#2563EB" }}>
                  {progressPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: "100%", height: "8px", background: "#E5E7EB", borderRadius: "4px", overflow: "hidden", marginBottom: "0.75rem" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    background: jobStatus === "done" ? "#10B981" : jobStatus === "error" ? "#EF4444" : "linear-gradient(90deg, #EC4899, #8B5CF6)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              {/* Terminal Logs Box */}
              <div
                ref={logRef}
                style={{
                  background: "#1E293B",
                  color: "#E2E8F0",
                  fontFamily: "monospace",
                  fontSize: "0.74rem",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  maxHeight: "150px",
                  overflowY: "auto",
                  lineHeight: "1.4",
                }}
              >
                {jobLogs.length > 0 ? (
                  jobLogs.map((log, i) => <div key={i}>{log}</div>)
                ) : (
                  <div>Đang khởi tạo FFmpeg...</div>
                )}
                {jobError && <div style={{ color: "#FCA5A5", fontWeight: 700 }}>✗ Error: {jobError}</div>}
              </div>

              {/* COMPLETED RESULT DOWNLOAD CARD */}
              {jobStatus === "done" && jobId && (
                <div style={{ marginTop: "1rem", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "0.85rem", textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#065F46", marginBottom: "0.5rem" }}>
                    🎉 Video 9:16 Dọc đã xuất thành công!
                  </div>
                  <a
                    href={`/api/download/${jobId}`}
                    download
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      background: "#10B981",
                      color: "#FFF",
                      padding: "0.5rem 1rem",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      textDecoration: "none",
                      boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
                    }}
                  >
                    <Download size={16} /> Tải Video 9:16 MP4 ngay
                  </a>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
