"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Volume2,
  Upload,
  RefreshCw,
  Trash2,
  Copy,
  Download,
  AlertTriangle,
  FileText,
  Mic,
  Play,
  Pause,
  Languages,
  Check,
  Search,
  Plus,
  Sparkles,
} from "lucide-react";
import { parseSubtitle, rebuildSubtitle } from "@/lib/subtitle";
import { LANGUAGES } from "@/lib/constants";
import { validateSrtContent, SrtValidationResult, parseTsToMs } from "@/lib/srt-validator";

export interface TtsSegmentItem {
  id: string;
  idx: number;
  text: string;
  voiceId?: string;
  selected: boolean;
  startMs?: number;
  endMs?: number;
  rawTimestamp?: string;
}

interface TtsSectionProps {
  vbeeVoices: Array<{ code: string; name: string; gender: string }>;
  vbeeVoicesLoading: boolean;
  customVoices: Array<{ id: string; name: string; refAudioPath: string }>;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export const TtsSection: React.FC<TtsSectionProps> = ({
  vbeeVoices,
  vbeeVoicesLoading,
  customVoices,
  showToast,
}) => {
  // Input raw text
  const [rawText, setRawText] = useState("");
  const [segments, setSegments] = useState<TtsSegmentItem[]>([]);
  const [globalVoiceId, setGlobalVoiceId] = useState("Mai Anh");
  const [translateLang, setTranslateLang] = useState("none");
  const [isTranslating, setIsTranslating] = useState(false);

  // File Upload & Validation states
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [uploadedFileSize, setUploadedFileSize] = useState<number | undefined>(undefined);
  const [validationResult, setValidationResult] = useState<SrtValidationResult | null>(null);

  // Filters & Search
  const [filterVoice, setFilterVoice] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Job states
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [jobError, setJobError] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // State quản lý nghe thử giọng đọc
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayVoicePreview = async (vId: string, sampleText?: string) => {
    if (playingVoiceId === vId) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    setPlayingVoiceId(vId);
    showToast(`🔊 Đang kết nối phát nghe thử...`, "info");

    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: vId,
          text: sampleText || "Xin chào, đây là giọng đọc thử nghiệm của SubLingo AI.",
        }),
      });

      if (!res.ok) {
        throw new Error("Không thể tạo audio nghe thử. Hãy đảm bảo Python AI service đã bật.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;

      audio.play().catch(() => {
        showToast("Không thể tự động phát audio nghe thử", "error");
        setPlayingVoiceId(null);
      });

      audio.onended = () => {
        setPlayingVoiceId(null);
        audioPlayerRef.current = null;
      };
    } catch (e: any) {
      showToast(e.message || "Lỗi khi phát nghe thử", "error");
      setPlayingVoiceId(null);
    }
  };

  // Tự động đồng bộ giọng mặc định hợp lệ khi danh sách giọng AI tải xong
  useEffect(() => {
    if (vbeeVoices && vbeeVoices.length > 0) {
      const exists = vbeeVoices.some((v) => v.code === globalVoiceId);
      if (!exists) {
        setGlobalVoiceId(vbeeVoices[0].code);
      }
    }
  }, [vbeeVoices, globalVoiceId]);

  // Handle Stop / Cancel active TTS job
  const handleStopJob = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (jobId) {
      try {
        await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      } catch (e) {
        /* ignore */
      }
    }
    setJobStatus("cancelled");
    setJobError("Tiến trình tạo giọng đọc đã bị dừng bởi người dùng.");
    if (typeof window !== "undefined") {
      localStorage.removeItem("sublingo_tts_active_job_id");
    }
    showToast("🛑 Đã dừng tiến trình tạo giọng đọc AI!", "info");
  };

  // Run client-side validation
  const runValidation = (content: string, fName?: string, fSize?: number) => {
    if (!content || !content.trim()) {
      setValidationResult(null);
      return true;
    }
    const result = validateSrtContent(content, fName, fSize);
    setValidationResult(result);
    return result.isValid;
  };

  // Split raw text into natural segments
  const splitTextIntoSegments = (textToSplit: string, fName?: string, fSize?: number) => {
    if (!textToSplit || !textToSplit.trim()) {
      setSegments([]);
      setValidationResult(null);
      return;
    }

    const isValid = runValidation(textToSplit, fName || uploadedFileName, fSize || uploadedFileSize);
    if (!isValid) {
      showToast("⚠️ Phát hiện lỗi trong file SRT! Vui lòng sửa lỗi trước khi tiếp tục.", "error");
      setSegments([]);
      return;
    }
    // Neu la srt/vtt
    if (textToSplit.includes("-->")) {
      const blocks = parseSubtitle(textToSplit);
      const segs: TtsSegmentItem[] = blocks.map((b, i) => {
        let startMs: number | undefined = undefined;
        let endMs: number | undefined = undefined;
        if (b.timestamp && b.timestamp.includes("-->")) {
          const parts = b.timestamp.split("-->").map((p) => p.trim());
          const s = parseTsToMs(parts[0]);
          const e = parseTsToMs(parts[1]);
          if (s >= 0 && e >= 0) {
            startMs = s;
            endMs = e;
          }
        }
        return {
          id: `seg_${Date.now()}_${i}`,
          idx: i + 1,
          text: b.text,
          voiceId: undefined,
          selected: false,
          startMs,
          endMs,
          rawTimestamp: b.timestamp,
        };
      });
      setSegments(segs);
      showToast(`Đã nhận diện ${segs.length} đoạn văn bản từ phụ đề!`, "success");
      return;
    }

    // Split plain text by newlines or sentence punctuation (. ! ? ;)
    const rawParagraphs = textToSplit.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const resultSegs: string[] = [];

    for (const para of rawParagraphs) {
      if (para.length <= 150) {
        resultSegs.push(para);
      } else {
        const sentences = para
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);

        let currentGroup = "";
        for (const sentence of sentences) {
          if (!currentGroup) {
            currentGroup = sentence;
          } else if ((currentGroup + " " + sentence).length <= 180) {
            currentGroup += " " + sentence;
          } else {
            resultSegs.push(currentGroup);
            currentGroup = sentence;
          }
        }
        if (currentGroup) resultSegs.push(currentGroup);
      }
    }

    const items: TtsSegmentItem[] = resultSegs.map((txt, i) => ({
      id: `seg_${Date.now()}_${i}`,
      idx: i + 1,
      text: txt,
      voiceId: undefined,
      selected: false,
    }));

    setSegments(items);
    showToast(`⚡ Đã phân đoạn tự động thành ${items.length} đoạn văn bản!`, "success");
  };

  // Handle file upload (.txt or .srt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setUploadedFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        splitTextIntoSegments(content, file.name, file.size);
      }
    };
    reader.readAsText(file);
  };

  // Poll Job Status
  const startPollingStatus = (jId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jId}`);
        const data = await res.json();
        if (data.success && data.data) {
          setJobStatus(data.data.status);
          if (Array.isArray(data.data.progressLog)) {
            setJobLogs(data.data.progressLog);
          }
          if (data.data.progressPercent !== undefined) {
            setProgressPercent(data.data.progressPercent);
          }
          if (data.data.status === "done" || data.data.status === "error" || data.data.status === "cancelled") {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (data.data.status === "done") {
              setProgressPercent(100);
              showToast("🎉 Đã tạo giọng đọc audio hoàn tất!", "success");
            }
            if (data.data.status === "error") {
              setJobError(data.data.errorMessage || "Lỗi không xác định khi tạo giọng đọc.");
              showToast("❌ Không thể tạo giọng đọc", "error");
            }
            if (data.data.status === "cancelled") {
              setJobError(data.data.errorMessage || "Tiến trình đã bị dừng bởi người dùng.");
              showToast("🛑 Tiến trình đã bị dừng", "info");
            }
          }
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      } catch (e) {
        /* ignore */
      }
    }, 2000);
  };

  // Restore active job state from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedJobId = localStorage.getItem("sublingo_tts_active_job_id");
    const savedRawText = localStorage.getItem("sublingo_tts_raw_text");
    const savedSegmentsStr = localStorage.getItem("sublingo_tts_segments");

    if (savedRawText && !rawText) {
      setRawText(savedRawText);
    }

    if (savedSegmentsStr && segments.length === 0) {
      try {
        const parsedSegs = JSON.parse(savedSegmentsStr);
        if (Array.isArray(parsedSegs)) setSegments(parsedSegs);
      } catch (e) {
        /* ignore */
      }
    }

    if (savedJobId) {
      setJobId(savedJobId);
      fetch(`/api/jobs/${savedJobId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setJobStatus(data.data.status);
            if (typeof data.data.progressPercent === "number") {
              setProgressPercent(data.data.progressPercent);
            }
            if (Array.isArray(data.data.progressLog)) {
              setJobLogs(data.data.progressLog);
            }
            if (data.data.status === "processing" || data.data.status === "queued") {
              startPollingStatus(savedJobId);
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Submit TTS job
  const handleGenerateAudio = async () => {
    if (segments.length === 0) {
      if (rawText.trim()) {
        splitTextIntoSegments(rawText);
      } else {
        showToast("Vui lòng nhập hoặc tải lên văn bản trước", "error");
        return;
      }
    }

    const hasOriginalTimestamps = segments.some(
      (s) => typeof s.startMs === "number" && typeof s.endMs === "number"
    );

    const payloadSegments = segments.map((s, i) => ({
      idx: i + 1,
      text: s.text,
      voiceId: s.voiceId || globalVoiceId,
      startMs: s.startMs,
      endMs: s.endMs,
    }));

    try {
      setJobStatus("queued");
      setProgressPercent(0);
      setJobLogs([]);
      setJobError("");

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: payloadSegments,
          globalVoiceId,
          ttsVolume: 1.0,
          pauseDurationMs: 400,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setJobId(data.jobId);
        if (typeof window !== "undefined") {
          localStorage.setItem("sublingo_tts_active_job_id", data.jobId);
          localStorage.setItem("sublingo_tts_raw_text", rawText);
          localStorage.setItem("sublingo_tts_segments", JSON.stringify(segments));
        }
        showToast("🚀 Đã gửi yêu cầu tạo giọng đọc TTS!", "success");
        startPollingStatus(data.jobId);
      } else {
        setJobStatus("idle");
        showToast(data.error || "Không thể tạo job đọc văn bản", "error");
      }
    } catch (err: any) {
      setJobStatus("idle");
      showToast(err.message || "Lỗi kết nối server", "error");
    }
  };

  // Optional: Translate text before reading
  const handleTranslateAllSegments = async () => {
    if (translateLang === "none") return;
    if (segments.length === 0) return;

    setIsTranslating(true);
    showToast(`Đang dịch văn bản sang ${translateLang.toUpperCase()}...`, "info");

    try {
      const { translateSubtitleFree } = await import("@/lib/free-translator");
      const srtText = segments.map((s, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\n${s.text}`).join("\n\n");
      const translatedSrt = await translateSubtitleFree(srtText, translateLang);
      const blocks = parseSubtitle(translatedSrt);

      setSegments((prev) =>
        prev.map((s, i) => ({
          ...s,
          text: blocks[i] ? blocks[i].text : s.text,
        }))
      );
      showToast("✓ Đã dịch toàn bộ các đoạn văn bản thành công!", "success");
    } catch (err: any) {
      showToast("Không thể dịch tự động", "error");
    } finally {
      setIsTranslating(false);
    }
  };

  /** Ước tính thời lượng (HH:MM:SS,mmm) dựa trên ~14 ký tự/giây */
  const formatEstimatedTime = (charCount: number, startSecAcc: number): { display: string; endSecAcc: number } => {
    const durSec = Math.max(0.8, charCount / 14.0);
    const endSecAcc = startSecAcc + durSec;

    const fmt = (sTotal: number) => {
      const h = Math.floor(sTotal / 3600);
      const m = Math.floor((sTotal % 3600) / 60);
      const s = Math.floor(sTotal % 60);
      const ms = Math.floor((sTotal % 1) * 1000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    };

    return {
      display: `${fmt(startSecAcc)} - ${fmt(endSecAcc)}`,
      endSecAcc,
    };
  };

  return (
    <div style={{ background: "#F7F8FA", borderRadius: "12px", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* SECTION 1: RAW INPUT & FILE IMPORT */}
      <div
        style={{
          background: validationResult && !validationResult.isValid ? "#FEF2F2" : "#FFFFFF",
          border: validationResult && !validationResult.isValid ? "2px dashed #EF4444" : "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "20px 24px",
          boxShadow: validationResult && !validationResult.isValid ? "0 4px 20px rgba(239,68,68,0.15)" : "0 4px 20px rgba(0,0,0,0.04)",
          marginBottom: "24px",
          transition: "all 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: validationResult && !validationResult.isValid ? "1px solid #FCA5A5" : "1px solid #E5E7EB",
            paddingBottom: "14px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                margin: 0,
                color: "#111827",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Volume2 size={22} style={{ color: validationResult && !validationResult.isValid ? "#EF4444" : "#2563EB" }} /> Chuyển Văn Bản Thành Giọng Nói (Text-to-Speech)
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#6B7280", margin: "0.25rem 0 0 0" }}>
              Nhập/dán văn bản tự do hoặc tải file .TXT/.SRT (Tối đa 50MB) để sinh giọng đọc AI đa ngôn ngữ chất lượng cao.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: validationResult && !validationResult.isValid ? "#FEE2E2" : "#EFF6FF",
                color: validationResult && !validationResult.isValid ? "#DC2626" : "#2563EB",
                border: validationResult && !validationResult.isValid ? "1px solid #EF4444" : "1px solid #2563EB",
                borderRadius: "8px",
                padding: "0.45rem 0.9rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <Upload size={15} /> Tải file .TXT / .SRT
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.srt,.vtt,.docx,.pdf"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* GIAO DIỆN HIỂN THỊ LỖI SRT (VALIDATION ERROR DISPLAY) */}
        {validationResult && !validationResult.isValid && (
          <div
            style={{
              background: "#FFF",
              border: "1px solid #FCA5A5",
              borderRadius: "10px",
              padding: "16px",
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: "0.92rem",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <AlertTriangle size={18} style={{ color: "#EF4444" }} />
              <span>Đã phát hiện {validationResult.errors.length} lỗi trong file phụ đề SRT của bạn. Vui lòng sửa lại trước khi tiếp tục:</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "300px", overflowY: "auto" }}>
              {validationResult.errors.map((err, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.82rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {err.lineIndex !== undefined && (
                        <span style={{ fontWeight: 800, color: "#DC2626" }}>#{err.lineIndex}.</span>
                      )}
                      {err.rawTimestamp && (
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color: err.errorType === "time_reversed" || err.errorType === "invalid_timestamp" ? "#DC2626" : "#4B5563",
                            background: "#FFF",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid #FCA5A5",
                          }}
                        >
                          {err.rawTimestamp}
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#EF4444", textTransform: "uppercase" }}>
                      {err.errorType}
                    </span>
                  </div>

                  <div style={{ fontWeight: 700, color: "#DC2626", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    ⚠️ {err.message}
                  </div>

                  {err.textSnippet && (
                    <div
                      style={{
                        fontSize: "0.78rem",
                        color: "#374151",
                        background: "#FFF",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "6px",
                        border: "1px solid #E5E7EB",
                        fontStyle: "italic",
                      }}
                    >
                      "{err.textSnippet}"
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: "0.78rem", color: "#B91C1C", fontWeight: 600 }}>
              💡 Nút "Tiếp tục" và "Tạo giọng đọc" tạm thời bị khóa cho đến khi file hết lỗi.
            </div>
          </div>
        )}

        {/* Big Textarea Input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <textarea
            value={rawText}
            onChange={(e) => {
              const val = e.target.value;
              setRawText(val);
              runValidation(val, uploadedFileName, uploadedFileSize);
            }}
            rows={5}
            style={{
              width: "100%",
              background: validationResult && !validationResult.isValid ? "#FFF" : "#F9FAFB",
              border: validationResult && !validationResult.isValid ? "1px solid #FCA5A5" : "1px solid #E5E7EB",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              fontSize: "0.85rem",
              lineHeight: "1.5",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
            placeholder="Dán hoặc nhập toàn bộ nội dung văn bản cần chuyển thành giọng đọc tại đây..."
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.76rem", color: "#6B7280" }}>
              📝 Tổng số ký tự: <strong>{rawText.length.toLocaleString()}</strong> ký tự
              {uploadedFileName && <span> · 📁 File: {uploadedFileName}</span>}
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => {
                  setRawText("");
                  setSegments([]);
                  setUploadedFileName("");
                  setUploadedFileSize(undefined);
                  setValidationResult(null);
                  setJobId(null);
                  setJobStatus("idle");
                  setProgressPercent(0);
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("sublingo_tts_active_job_id");
                    localStorage.removeItem("sublingo_tts_raw_text");
                    localStorage.removeItem("sublingo_tts_segments");
                  }
                  showToast("Đã xóa sạch văn bản và tiến trình!", "info");
                }}
                style={{
                  background: "#FFF",
                  color: "#EF4444",
                  border: "1px solid #E5E7EB",
                  borderRadius: "6px",
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <Trash2 size={13} /> Xóa sạch
              </button>

              <button
                onClick={() => splitTextIntoSegments(rawText)}
                disabled={!rawText.trim() || !!(validationResult && !validationResult.isValid)}
                style={{
                  background: rawText.trim() && !(validationResult && !validationResult.isValid) ? "#2563EB" : "#E5E7EB",
                  color: rawText.trim() && !(validationResult && !validationResult.isValid) ? "#FFF" : "#9CA3AF",
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.35rem 0.9rem",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: rawText.trim() && !(validationResult && !validationResult.isValid) ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Sparkles size={14} /> Tự động phân đoạn ({segments.length} đoạn)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: INTERACTIVE TOOLBAR & SEGMENT EDITING AREA */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "20px 24px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
          marginBottom: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Header Title */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            borderBottom: "1px solid #E5E7EB",
            paddingBottom: "12px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "#111827" }}>
              Danh Sách Các Đoạn Thoại ({segments.length} đoạn)
            </h3>
            <p style={{ fontSize: "0.78rem", color: "#6B7280", margin: "0.2rem 0 0 0" }}>
              Mỗi đoạn có thể gán giọng đọc riêng (Multi-Voice), chỉnh sửa văn bản inline và xem thời lượng ước tính.
            </p>
          </div>

          {/* Default Voice Selection */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151" }}>Giọng đọc mặc định:</span>
            <select
              value={globalVoiceId}
              onChange={(e) => setGlobalVoiceId(e.target.value)}
              style={{
                height: "34px",
                minWidth: "190px",
                padding: "0 10px",
                background: "#FFF",
                border: "1px solid #2563EB",
                borderRadius: "6px",
                fontSize: "0.8rem",
                color: "#2563EB",
                fontWeight: 700,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {vbeeVoicesLoading ? (
                <option value={globalVoiceId}>⏳ Đang tải danh sách giọng...</option>
              ) : vbeeVoices.length === 0 ? (
                <>
                  <option value="female">🎙 Giọng Nữ (Chuẩn)</option>
                  <option value="male">🎙 Giọng Nam (Chuẩn)</option>
                </>
              ) : (
                vbeeVoices.map((v) => (
                  <option key={v.code} value={v.code}>
                    🎙 {v.name} {v.gender === "female" ? "(Nữ)" : v.gender === "male" ? "(Nam)" : v.gender === "cloned" ? "(Nhân bản)" : ""}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => handlePlayVoicePreview(globalVoiceId)}
              style={{
                height: "34px",
                padding: "0 12px",
                background: playingVoiceId === globalVoiceId ? "#EFF6FF" : "#F3F4F6",
                color: playingVoiceId === globalVoiceId ? "#2563EB" : "#374151",
                border: playingVoiceId === globalVoiceId ? "1px solid #2563EB" : "1px solid #D1D5DB",
                borderRadius: "6px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                transition: "all 0.15s ease",
              }}
              title="Phát âm thanh nghe thử cho giọng đọc đã chọn"
            >
              {playingVoiceId === globalVoiceId ? (
                <>
                  <Pause size={14} style={{ color: "#2563EB" }} /> Đang phát...
                </>
              ) : (
                <>
                  <Volume2 size={14} style={{ color: "#2563EB" }} /> Nghe thử
                </>
              )}
            </button>
          </div>
        </div>

        {/* 1. THANH CÔNG CỤ TRÊN CÙNG (Toolbar theo ảnh mẫu) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            background: "#F9FAFB",
            padding: "0.75rem 1rem",
            borderRadius: "10px",
            border: "1px solid #E5E7EB",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            {/* Checkbox Select All */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={segments.length > 0 && segments.every((s) => s.selected)}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSegments((prev) => prev.map((s) => ({ ...s, selected: val })));
                }}
                style={{ width: "16px", height: "16px", accentColor: "#2563EB", cursor: "pointer" }}
              />
              <span>Chọn tất cả ({segments.filter((s) => s.selected).length}/{segments.length})</span>
            </label>

            {/* Dropdown Dịch ngôn ngữ (Tùy chọn) */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Languages size={14} style={{ color: "#6B7280" }} />
              <span style={{ fontSize: "0.76rem", color: "#6B7280", fontWeight: 600 }}>Dịch ngôn ngữ:</span>
              <select
                value={translateLang}
                onChange={(e) => {
                  setTranslateLang(e.target.value);
                }}
                style={{
                  height: "32px",
                  padding: "0 8px",
                  background: "#FFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  color: "#111827",
                  outline: "none",
                }}
              >
                <option value="none">Giữ nguyên gốc</option>
                <option value="vi">🇻🇳 Dịch sang Tiếng Việt</option>
                <option value="en">🇺🇸 Dịch sang Tiếng Anh</option>
                <option value="zh">🇨🇳 Dịch sang Tiếng Trung</option>
                <option value="ja">🇯🇵 Dịch sang Tiếng Nhật</option>
              </select>
              {translateLang !== "none" && (
                <button
                  onClick={handleTranslateAllSegments}
                  disabled={isTranslating}
                  style={{
                    background: "#2563EB",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "6px",
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {isTranslating ? "Đang dịch..." : "Dịch ngay"}
                </button>
              )}
            </div>

            {/* Dropdown Lọc người đọc */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.76rem", color: "#6B7280", fontWeight: 600 }}>Lọc người đọc:</span>
              <select
                value={filterVoice}
                onChange={(e) => setFilterVoice(e.target.value)}
                style={{
                  height: "32px",
                  padding: "0 8px",
                  background: "#FFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  color: "#111827",
                  outline: "none",
                  minWidth: "150px",
                }}
              >
                <option value="all">Tất cả người đọc</option>
                <option value="default">Giọng chung (Mặc định)</option>
                {vbeeVoices.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name} ({v.gender === "female" ? "Nữ" : "Nam"})
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown Tất cả trạng thái */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.76rem", color: "#6B7280", fontWeight: 600 }}>Trạng thái:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  height: "32px",
                  padding: "0 8px",
                  background: "#FFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  color: "#111827",
                  outline: "none",
                }}
              >
                <option value="all">Tất cả trạng thái ({segments.length})</option>
                <option value="ok">✅ Bình thường (&le; 300 ký tự)</option>
                <option value="warning">⚠️ Cảnh báo đoạn dài (&gt; 300 ký tự)</option>
              </select>
            </div>
          </div>

          {/* Reset / Refresh Button */}
          <div>
            <button
              onClick={() => {
                setFilterVoice("all");
                setFilterStatus("all");
                setSearchQuery("");
                setTranslateLang("none");
                if (rawText) splitTextIntoSegments(rawText);
                showToast("Đã làm mới danh sách!", "info");
              }}
              style={{
                background: "#FFF",
                color: "#374151",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
                padding: "0.35rem 0.75rem",
                fontSize: "0.76rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <RefreshCw size={13} /> Reset / Refresh
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: "0.6rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#6B7280",
              }}
            />
            <input
              type="text"
              placeholder="Tìm kiếm từ khóa trong các đoạn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "32px",
                padding: "0 0.5rem 0 2rem",
                background: "#FFF",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
                fontSize: "0.78rem",
                outline: "none",
              }}
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                background: "#F3F4F6",
                border: "none",
                borderRadius: "6px",
                padding: "0.35rem 0.6rem",
                fontSize: "0.74rem",
                cursor: "pointer",
              }}
            >
              Xóa tìm kiếm
            </button>
          )}
        </div>

        {/* 2. KHU VỰC DANH SÁCH CÁC ĐOẠN THOẠI (Card list) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            maxHeight: "520px",
            overflowY: "auto",
            paddingRight: "0.25rem",
          }}
        >
          {(() => {
            if (segments.length === 0) {
              return (
                <div
                  style={{
                    padding: "3rem 1rem",
                    textAlign: "center",
                    color: "#6B7280",
                    background: "#F9FAFB",
                    borderRadius: "8px",
                    border: "1px dashed #E5E7EB",
                  }}
                >
                  <FileText size={36} style={{ color: "#9CA3AF", marginBottom: "0.5rem" }} />
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#374151" }}>
                    Chưa phân đoạn văn bản
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#6B7280", marginTop: "0.25rem" }}>
                    Nhập văn bản ở trên rồi bấm <strong>"Tự động phân đoạn"</strong> để tạo danh sách câu thoại.
                  </div>
                </div>
              );
            }

            // Filter segments
            const filtered = segments.filter((s) => {
              if (filterVoice === "default" && s.voiceId) return false;
              if (filterVoice !== "all" && filterVoice !== "default" && s.voiceId !== filterVoice) return false;

              if (filterStatus === "warning" && s.text.length <= 300) return false;
              if (filterStatus === "ok" && s.text.length > 300) return false;

              if (searchQuery.trim() && !s.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;

              return true;
            });

            if (filtered.length === 0) {
              return (
                <div style={{ padding: "2rem", textAlign: "center", color: "#6B7280", fontSize: "0.82rem" }}>
                  Không tìm thấy đoạn thoại nào khớp với bộ lọc.
                </div>
              );
            }

            // Pagination calculations
            const totalPages = Math.ceil(filtered.length / pageSize) || 1;
            const safePage = Math.min(currentPage, totalPages);
            const startIndex = (safePage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filtered.length);
            const paginatedList = filtered.slice(startIndex, endIndex);

            // Cumulative startSecAcc up to startIndex for accurate time display
            let startSecAcc = 0;
            for (let i = 0; i < startIndex; i++) {
              const durSec = Math.max(0.8, filtered[i].text.length / 14.0);
              startSecAcc += durSec + 0.4;
            }

            const renderPaginationToolbar = () => (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  background: "#F3F4F6",
                  padding: "0.5rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  color: "#374151",
                  margin: "0.25rem 0",
                }}
              >
                <div>
                  Hiển thị <strong>{startIndex + 1} - {endIndex}</strong> / <strong>{filtered.length}</strong> đoạn
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    style={{
                      padding: "0.25rem 0.6rem",
                      background: safePage > 1 ? "#FFF" : "#E5E7EB",
                      border: "1px solid #D1D5DB",
                      borderRadius: "5px",
                      cursor: safePage > 1 ? "pointer" : "not-allowed",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                    }}
                  >
                    ◄ Trang trước
                  </button>

                  <span style={{ fontWeight: 700 }}>
                    Trang {safePage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    style={{
                      padding: "0.25rem 0.6rem",
                      background: safePage < totalPages ? "#FFF" : "#E5E7EB",
                      border: "1px solid #D1D5DB",
                      borderRadius: "5px",
                      cursor: safePage < totalPages ? "pointer" : "not-allowed",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                    }}
                  >
                    Trang sau ►
                  </button>

                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      height: "28px",
                      padding: "0 6px",
                      background: "#FFF",
                      border: "1px solid #D1D5DB",
                      borderRadius: "5px",
                      fontSize: "0.74rem",
                      outline: "none",
                    }}
                  >
                    <option value={50}>50 đoạn/trang</option>
                    <option value={100}>100 đoạn/trang</option>
                    <option value={200}>200 đoạn/trang</option>
                    <option value={500}>500 đoạn/trang</option>
                    <option value={999999}>Tất cả ({filtered.length})</option>
                  </select>
                </div>
              </div>
            );

            return (
              <>
                {filtered.length > pageSize && renderPaginationToolbar()}
                {paginatedList.map((seg, arrayIdx) => {
                  const fullIdx = segments.findIndex((s) => s.id === seg.id);
                  const targetIdx = fullIdx >= 0 ? fullIdx : startIndex + arrayIdx;

                  const isWarning = seg.text.length > 300;
                  const isSelected = seg.selected;
                  const isMenuOpen = openMenuIdx === seg.idx;

                  const { display: estTimeDisplay, endSecAcc } = formatEstimatedTime(seg.text.length, startSecAcc);
                  startSecAcc = endSecAcc + 0.4; // + 400ms pause

                  return (
                    <div
                      key={seg.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        padding: "0.85rem 1rem",
                        borderRadius: "10px",
                        background: isSelected ? "#EFF6FF" : isWarning ? "#FFFBEB" : "#F9FAFB",
                        border: isSelected ? "1px solid #2563EB" : isWarning ? "1px solid #F59E0B" : "1px solid #E5E7EB",
                        boxShadow: isSelected ? "0 0 12px rgba(37,99,235,0.12)" : "none",
                        position: "relative",
                      }}
                    >
                      {/* Card Header: [STT] [Thời lượng ước tính] [Checkbox] [Dropdown Giọng Đọc] [Menu 3 chấm] */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={!!seg.selected}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setSegments((prev) =>
                                prev.map((s) => (s.id === seg.id ? { ...s, selected: val } : s))
                              );
                            }}
                            style={{ width: "16px", height: "16px", accentColor: "#2563EB", cursor: "pointer" }}
                          />

                          {/* STT */}
                          <span style={{ fontWeight: 800, fontSize: "0.82rem", color: isSelected ? "#2563EB" : "#374151" }}>
                            #{targetIdx + 1}.
                          </span>
                          {/* Thời lượng timestamp */}
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: "0.74rem",
                              color: seg.rawTimestamp ? "#2563EB" : "#4B5563",
                              background: "#FFF",
                              padding: "0.15rem 0.55rem",
                              borderRadius: "4px",
                              border: seg.rawTimestamp ? "1px solid #93C5FD" : "1px solid #E5E7EB",
                              fontWeight: seg.rawTimestamp ? 700 : 400,
                            }}
                            title={seg.rawTimestamp ? "Thời gian gốc từ file phụ đề SRT" : "Thời lượng ước tính dựa trên tốc độ đọc trung bình (~14 ký tự/giây)"}
                          >
                            ⏱ {seg.rawTimestamp || estTimeDisplay}
                          </span>
                        </div>

                        {/* Right Controls: Voice Select + Warning Icon + 3 Dots Menu */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {isWarning && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                background: "#FEF3C7",
                                color: "#D97706",
                                padding: "0.15rem 0.55rem",
                                borderRadius: "12px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                              title="Đoạn thoại dài (> 300 ký tự). Bạn có thể tách làm đôi để đọc ngắt nghỉ tự nhiên hơn."
                            >
                              <AlertTriangle size={13} style={{ color: "#D97706" }} />
                              <span>Đoạn dài</span>
                            </div>
                          )}

                          {/* Dropdown chọn "Người đọc" riêng cho đoạn này */}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <Mic size={13} style={{ color: seg.voiceId ? "#2563EB" : "#9CA3AF" }} />
                            <select
                              value={seg.voiceId || "default"}
                              onChange={(e) => {
                                const val = e.target.value === "default" ? undefined : e.target.value;
                                setSegments((prev) =>
                                  prev.map((s) => (s.id === seg.id ? { ...s, voiceId: val } : s))
                                );
                                showToast(`Đã gán giọng đọc riêng cho đoạn #${targetIdx + 1}`, "info");
                              }}
                              style={{
                                height: "28px",
                                padding: "0 6px",
                                background: seg.voiceId ? "#EFF6FF" : "#FFF",
                                border: seg.voiceId ? "1px solid #2563EB" : "1px solid #E5E7EB",
                                borderRadius: "6px",
                                fontSize: "0.74rem",
                                color: seg.voiceId ? "#2563EB" : "#374151",
                                fontWeight: seg.voiceId ? 700 : 500,
                                outline: "none",
                                cursor: "pointer",
                                minWidth: "140px",
                              }}
                            >
                              <option value="default">
                                🎙 Mặc định ({vbeeVoices.find((v) => v.code === globalVoiceId)?.name || globalVoiceId})
                              </option>
                              {vbeeVoices.map((v) => (
                                <option key={v.code} value={v.code}>
                                  {v.name} ({v.gender === "female" ? "Nữ" : v.gender === "male" ? "Nam" : "Nhân bản"})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handlePlayVoicePreview(seg.voiceId || globalVoiceId, seg.text)}
                              style={{
                                height: "28px",
                                width: "28px",
                                padding: 0,
                                background: playingVoiceId === (seg.voiceId || globalVoiceId) ? "#EFF6FF" : "#F3F4F6",
                                border: playingVoiceId === (seg.voiceId || globalVoiceId) ? "1px solid #2563EB" : "1px solid #E5E7EB",
                                borderRadius: "6px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                              title="Nghe thử giọng đọc cho đoạn này"
                            >
                              {playingVoiceId === (seg.voiceId || globalVoiceId) ? (
                                <Pause size={13} style={{ color: "#2563EB" }} />
                              ) : (
                                <Volume2 size={13} style={{ color: "#2563EB" }} />
                              )}
                            </button>
                          </div>

                          {/* Menu 3 chấm (...) */}
                          <div style={{ position: "relative" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuIdx(isMenuOpen ? null : seg.idx);
                              }}
                              style={{
                                background: "#FFF",
                                border: "1px solid #E5E7EB",
                                borderRadius: "6px",
                                padding: "0.2rem 0.45rem",
                                fontSize: "0.85rem",
                                fontWeight: 800,
                                cursor: "pointer",
                                color: "#4B5563",
                              }}
                              title="Tùy chọn đoạn thoại"
                            >
                              •••
                            </button>

                            {/* Menu Popover */}
                            {isMenuOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: "100%",
                                  marginTop: "4px",
                                  background: "#FFFFFF",
                                  border: "1px solid #E5E7EB",
                                  borderRadius: "8px",
                                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                                  zIndex: 100,
                                  minWidth: "160px",
                                  padding: "4px 0",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setOpenMenuIdx(null);
                                    const half = Math.ceil(seg.text.length / 2);
                                    const text1 = seg.text.substring(0, half).trim();
                                    const text2 = seg.text.substring(half).trim();

                                    const newSegs = [...segments];
                                    newSegs[targetIdx].text = text1;

                                    const newSeg: TtsSegmentItem = {
                                      id: `seg_${Date.now()}_${targetIdx}`,
                                      idx: newSegs.length + 1,
                                      text: text2 || "Đoạn mới",
                                      voiceId: seg.voiceId,
                                      selected: false,
                                    };
                                    newSegs.splice(targetIdx + 1, 0, newSeg);
                                    setSegments(newSegs);
                                    showToast(`Đã tách đoạn #${targetIdx + 1} làm đôi!`, "success");
                                  }}
                                  style={{
                                    width: "100%",
                                    textAlign: "left",
                                    background: "none",
                                    border: "none",
                                    padding: "0.45rem 0.85rem",
                                    fontSize: "0.78rem",
                                    color: "#111827",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✂️ Tách đoạn (Split)
                                </button>

                                {targetIdx < segments.length - 1 && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuIdx(null);
                                      const newSegs = [...segments];
                                      const nextSeg = newSegs[targetIdx + 1];
                                      newSegs[targetIdx].text = `${newSegs[targetIdx].text} ${nextSeg.text}`.trim();
                                      newSegs.splice(targetIdx + 1, 1);
                                      setSegments(newSegs);
                                      showToast(`Đã gộp đoạn #${targetIdx + 1} với đoạn kế tiếp!`, "success");
                                    }}
                                    style={{
                                      width: "100%",
                                      textAlign: "left",
                                      background: "none",
                                      border: "none",
                                      padding: "0.45rem 0.85rem",
                                      fontSize: "0.78rem",
                                      color: "#111827",
                                      cursor: "pointer",
                                    }}
                                  >
                                    🔗 Gộp với đoạn kế tiếp (Merge)
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setOpenMenuIdx(null);
                                    const newSegs = segments.filter((s) => s.id !== seg.id);
                                    setSegments(newSegs);
                                    showToast(`Đã xóa đoạn #${targetIdx + 1}`, "info");
                                  }}
                                  style={{
                                    width: "100%",
                                    textAlign: "left",
                                    background: "none",
                                    border: "none",
                                    padding: "0.45rem 0.85rem",
                                    fontSize: "0.78rem",
                                    color: "#EF4444",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Trash2 size={13} /> Xóa đoạn này
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Textarea với Bộ đếm ký tự dạng "X/1000" */}
                      <div style={{ position: "relative", width: "100%" }}>
                        <textarea
                          value={seg.text}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setSegments((prev) =>
                              prev.map((s) => (s.id === seg.id ? { ...s, text: txt } : s))
                            );
                          }}
                          rows={Math.max(1, seg.text.split("\n").length)}
                          style={{
                            width: "100%",
                            background: "#FFF",
                            border: "1px solid #E5E7EB",
                            borderRadius: "8px",
                            padding: "0.5rem 3.5rem 1.4rem 0.65rem",
                            fontSize: "0.84rem",
                            lineHeight: "1.45",
                            outline: "none",
                            resize: "vertical",
                            boxSizing: "border-box",
                            fontFamily: "inherit",
                          }}
                          placeholder="Nhập nội dung đoạn thoại..."
                        />

                        {/* Bộ đếm ký tự dạng X/1000 */}
                        <div
                          style={{
                            position: "absolute",
                            right: "10px",
                            bottom: "8px",
                            fontSize: "0.68rem",
                            color: seg.text.length > 300 ? "#D97706" : "#9CA3AF",
                            fontFamily: "monospace",
                            background: "rgba(255,255,255,0.9)",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            pointerEvents: "none",
                          }}
                        >
                          {seg.text.length}/1000
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filtered.length > pageSize && renderPaginationToolbar()}
              </>
            );
          })()}
        </div>

        {/* 3. NÚT HÀNH ĐỘNG CUỐI: "Tạo giọng đọc" */}
        <div
          style={{
            borderTop: "1px solid #E5E7EB",
            paddingTop: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ fontSize: "0.78rem", color: "#6B7280" }}>
            💡 Hệ thống tự động ghép các đoạn audio theo đúng thứ tự với khoảng nghỉ tự nhiên (~400ms) giữa các đoạn.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            {(jobStatus === "processing" || jobStatus === "queued") && (
              <button
                onClick={handleStopJob}
                style={{
                  padding: "0.75rem 1.25rem",
                  borderRadius: "8px",
                  background: "#FEF2F2",
                  color: "#DC2626",
                  border: "1px solid #EF4444",
                  fontSize: "0.88rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  boxShadow: "0 2px 8px rgba(239,68,68,0.15)",
                }}
                title="Dừng ngay lập tức tiến trình tạo giọng đọc AI đang chạy"
              >
                🛑 Dừng tiến trình
              </button>
            )}

            <button
              onClick={handleGenerateAudio}
              disabled={segments.length === 0 || jobStatus === "processing" || jobStatus === "queued" || !!(validationResult && !validationResult.isValid)}
              style={{
                padding: "0.75rem 2rem",
                borderRadius: "8px",
                background: segments.length > 0 && jobStatus !== "processing" && jobStatus !== "queued" && !(validationResult && !validationResult.isValid) ? "#2563EB" : "#E5E7EB",
                color: segments.length > 0 && jobStatus !== "processing" && jobStatus !== "queued" && !(validationResult && !validationResult.isValid) ? "#FFFFFF" : "#9CA3AF",
                fontSize: "0.95rem",
                fontWeight: 800,
                border: "none",
                cursor: segments.length > 0 && jobStatus !== "processing" && jobStatus !== "queued" && !(validationResult && !validationResult.isValid) ? "pointer" : "not-allowed",
                boxShadow: segments.length > 0 && jobStatus !== "processing" && jobStatus !== "queued" && !(validationResult && !validationResult.isValid) ? "0 4px 14px rgba(37,99,235,0.4)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {jobStatus === "processing" || jobStatus === "queued" ? (
                <>⏳ Đang tạo giọng đọc AI ({progressPercent}%)...</>
              ) : (
                <>
                  <Volume2 size={18} /> Tạo giọng đọc (Generate Audio)
                </>
              )}
            </button>
          </div>
        </div>

        {/* PROGRESS LOGS & RESULT PLAYER */}
        {(jobStatus === "processing" || jobStatus === "queued" || jobStatus === "done" || jobStatus === "error" || jobStatus === "cancelled") && (
          <div
            style={{
              background: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: "10px",
              padding: "16px",
              marginTop: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#111827" }}>
                Trạng thái tạo giọng đọc:{" "}
                <span
                  style={{
                    color:
                      jobStatus === "done"
                        ? "#10B981"
                        : jobStatus === "error" || jobStatus === "cancelled"
                        ? "#EF4444"
                        : "#2563EB",
                  }}
                >
                  {jobStatus === "done"
                    ? "✓ Hoàn thành (Done)"
                    : jobStatus === "cancelled"
                    ? "🛑 Đã dừng tiến trình (Cancelled)"
                    : jobStatus === "error"
                    ? "❌ Lỗi (Error)"
                    : `Đang xử lý (${progressPercent}%)`}
                </span>
              </div>

              {(jobStatus === "processing" || jobStatus === "queued") && (
                <button
                  onClick={handleStopJob}
                  style={{
                    background: "#FEF2F2",
                    color: "#DC2626",
                    border: "1px solid #EF4444",
                    borderRadius: "6px",
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  🛑 Dừng tiến trình
                </button>
              )}
            </div>

            {/* Progress bar */}
            {(jobStatus === "processing" || jobStatus === "queued") && (
              <div
                style={{
                  width: "100%",
                  height: "6px",
                  background: "#E5E7EB",
                  borderRadius: "3px",
                  overflow: "hidden",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    background: "#2563EB",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            )}

            {/* Audio Result Player */}
            {jobStatus === "done" && jobId && (
              <div
                style={{
                  background: "#FFF",
                  border: "1px solid #10B981",
                  borderRadius: "8px",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#10B981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Check size={18} /> Kết quả âm thanh đã sẵn sàng:
                </div>

                <audio
                  controls
                  src={`/api/tts/download/${jobId}`}
                  style={{ width: "100%" }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      window.open(`/api/tts/download/${jobId}`, "_blank");
                    }}
                    style={{
                      background: "#10B981",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "6px",
                      padding: "0.45rem 1rem",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Download size={15} /> Tải file MP3 về máy
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {jobStatus === "error" && (
              <div style={{ color: "#EF4444", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                ⚠️ Lỗi: {jobError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
