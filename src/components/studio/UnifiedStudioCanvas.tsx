"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Clapperboard,
  ScanText,
  Subtitles,
  FileText,
  Mic,
  Sparkles,
  History,
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Copy,
  Download,
  Globe,
  Film,
  CheckCircle2,
  Radio,
  Clock,
  Settings,
  ChevronRight,
  Wand2,
  AlignLeft,
  Scissors,
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import { useSubLingo } from "@/context/SubLingoContext";
import { LANGUAGES } from "@/lib/constants";

export interface StudioBlock {
  id: number;
  startMs: number;
  endMs: number;
  originalText: string;
  translatedText: string;
}

export const UnifiedStudioCanvas: React.FC = () => {
  const subLingo = useSubLingo();

  // Unified State
  const [activeRightTab, setActiveRightTab] = useState<"stt" | "translate" | "style" | "dubbing">("stt");

  // Media Player State
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Subtitle Blocks State
  const [blocks, setBlocks] = useState<StudioBlock[]>([
    {
      id: 1,
      startMs: 1000,
      endMs: 3500,
      originalText: "Chào mừng bạn đến với SubLingo AI Studio!",
      translatedText: "Welcome to SubLingo AI Studio!",
    },
    {
      id: 2,
      startMs: 4000,
      endMs: 7000,
      originalText: "Tất cả công cụ được gộp chung trên 1 màn hình duy nhất.",
      translatedText: "All tools are merged into a single screen workspace.",
    },
  ]);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const activeBlockRef = useRef<HTMLDivElement | null>(null);

  // Subtitle Overlay Options
  const [displayLanguage, setDisplayLanguage] = useState<"both" | "translated" | "original">("both");
  const [subFontSize, setSubFontSize] = useState<number>(20);
  const [subColor, setSubColor] = useState<string>("#FFFFFF");
  const [subBgColor, setSubBgColor] = useState<string>("rgba(0,0,0,0.75)");

  // Tool Specific Settings
  const [sttModelSize, setSttModelSize] = useState<string>("medium");
  const [sttLang, setSttLang] = useState<string>("auto");
  const [transEngine, setTransEngine] = useState<"gemini" | "local" | "google_free">("gemini");
  const [transTargetLang, setTransTargetLang] = useState<string>("vi");
  const [dubVoiceId, setDubVoiceId] = useState<string>("ngoc_huyen_cloned");
  const [dubSpeed, setDubSpeed] = useState<number>(1.0);

  // Loading / Progress State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processMessage, setProcessMessage] = useState<string>("");

  // Handle Upload
  const handleFileUpload = (file: File) => {
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    subLingo.setSttFile(file);
    subLingo.setSttPreviewUrl(url);
    subLingo.showToast(`Đã tải media lên Studio: ${file.name}`, "success");
  };

  // Sync Active Block with Video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTime = () => {
      const currentMs = video.currentTime * 1000;
      setCurrentTimeSec(video.currentTime);
      setDurationSec(video.duration || 0);
      setIsPlaying(!video.paused);
      const active = blocks.find((b) => currentMs >= b.startMs && currentMs <= b.endMs);
      setActiveBlockId(active?.id ?? null);
    };
    video.addEventListener("timeupdate", handleTime);
    return () => video.removeEventListener("timeupdate", handleTime);
  }, [blocks]);

  // Auto scroll to active block
  useEffect(() => {
    if (activeBlockRef.current) {
      activeBlockRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeBlockId]);

  // Helper formatting
  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatMs = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const rem = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rem).padStart(3, "0")}`;
  };

  // Rebuild SRT
  const exportSrtContent = () => {
    return blocks
      .map(
        (b, i) =>
          `${i + 1}\n${formatMs(b.startMs)} --> ${formatMs(b.endMs)}\n${
            displayLanguage === "original"
              ? b.originalText
              : displayLanguage === "translated"
              ? b.translatedText || b.originalText
              : `${b.originalText}\n${b.translatedText}`
          }`
      )
      .join("\n\n");
  };

  // Trigger STT Execution
  const runSttJob = async () => {
    if (!mediaFile) {
      subLingo.showToast("Vui lòng tải Video/Audio lên Studio trước!", "error");
      return;
    }
    setIsProcessing(true);
    setProcessMessage("⚡ Whisper STT đang trích xuất lời thoại thành phụ đề...");

    try {
      const formData = new FormData();
      formData.append("file", mediaFile);
      formData.append("sourceLanguage", sttLang);
      formData.append("modelSize", sttModelSize);
      formData.append("wordTimestamps", "false");

      const res = await fetch("/api/stt", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok && data.success) {
        subLingo.showToast("Đã gửi job Whisper STT thành công!", "success");
      } else {
        throw new Error(data.error || "Lỗi xử lý Whisper");
      }
    } catch (err: any) {
      subLingo.showToast(err.message || "Không thể thực thi STT", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger Translate Execution
  const runTranslateJob = async () => {
    if (blocks.length === 0) {
      subLingo.showToast("Không có câu phụ đề nào để dịch!", "error");
      return;
    }
    setIsProcessing(true);
    setProcessMessage("🌐 Gemini AI đang biên dịch toàn bộ danh sách phụ đề...");

    try {
      const srtText = exportSrtContent();
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtitleContent: srtText,
          selectedLangs: [transTargetLang],
          engine: transEngine,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.results?.[transTargetLang]?.result) {
        const translatedSrt = data.results[transTargetLang].result;
        // Merge translated lines back to blocks
        const transLines = translatedSrt.trim().split(/\n\s*\n/);
        setBlocks((prev) =>
          prev.map((b, i) => {
            const raw = transLines[i];
            if (!raw) return b;
            const lines = raw.trim().split("\n");
            const text = lines.slice(2).join("\n").trim();
            return { ...b, translatedText: text || b.translatedText };
          })
        );
        subLingo.showToast("Dịch phụ đề hoàn tất!", "success");
      } else {
        throw new Error(data.error || "Lỗi gọi API dịch thuật");
      }
    } catch (err: any) {
      subLingo.showToast(err.message || "Không thể dịch phụ đề", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const activeBlock = blocks.find((b) => b.id === activeBlockId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", maxWidth: "1560px", margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      
      {/* HEADER BAR */}
      <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "14px", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
            <Clapperboard size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, color: "var(--text, #111827)", letterSpacing: "-0.01em" }}>
              SubLingo AI Studio All-in-One
            </h1>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted, #6B7280)", margin: 0 }}>
              Không gian tổng hợp duy nhất: Xem Video + Biên tập Timeline + STT/Dịch/Lồng tiếng trên 1 màn hình
            </p>
          </div>
        </div>

        {/* Action Header Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {mediaFile ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(59,130,246,0.1)", color: "#3B82F6", padding: "0.4rem 0.8rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>
              <Film size={15} />
              <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mediaFile.name}</span>
              <button onClick={() => fileInputRef.current?.click()} style={{ background: "transparent", border: "none", color: "#3B82F6", cursor: "pointer", fontSize: "0.72rem", textDecoration: "underline" }}>Đổi file</button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} style={{ background: "#3B82F6", color: "#FFF", border: "none", borderRadius: "8px", padding: "0.5rem 1rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
              <Upload size={15} /> Tải Video / Audio lên Studio
            </button>
          )}
          <input type="file" ref={fileInputRef} accept="video/*,audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />

          <button
            onClick={() => {
              const content = exportSrtContent();
              const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `studio_subtitle.srt`;
              a.click();
              subLingo.showToast("Đã tải file phụ đề SRT!", "success");
            }}
            style={{ background: "var(--bg, #F3F4F6)", color: "var(--text, #111827)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", padding: "0.5rem 0.85rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Download size={14} /> Xuất File SRT
          </button>
        </div>
      </div>

      {/* MAIN UNIFIED STUDIO WORKSPACE GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "20px", alignItems: "start" }}>
        
        {/* LEFT COLUMN: SHARED VIDEO PLAYER + TIMELINE SUBTITLE EDITOR */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          
          {/* 1. SHARED VIDEO PLAYER WITH REALTIME SUBTITLE OVERLAY */}
          <div style={{ background: "#000000", border: "1px solid var(--border, #E5E7EB)", borderRadius: "14px", overflow: "hidden", position: "relative", aspectRatio: "16/9", boxShadow: "0 12px 32px rgba(0,0,0,0.2)" }}>
            {mediaUrl ? (
              <video
                ref={videoRef}
                src={mediaUrl}
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#9CA3AF", gap: "12px", cursor: "pointer" }} onClick={() => fileInputRef.current?.click()}>
                <Film size={48} style={{ color: "#3B82F6" }} />
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#FFFFFF" }}>Chưa nạp Video vào Studio</div>
                <div style={{ fontSize: "0.8rem" }}>Click vào đây để tải tệp MP4, WEBM, MP3, WAV...</div>
              </div>
            )}

            {/* REALTIME SUBTITLE OVERLAY ON VIDEO */}
            {activeBlock && (
              <div style={{ position: "absolute", bottom: "8%", left: "50%", transform: "translateX(-50%)", maxWidth: "90%", textAlign: "center", pointerEvents: "none", zIndex: 10 }}>
                <span
                  style={{
                    display: "inline-block",
                    background: subBgColor,
                    color: subColor,
                    fontSize: `${subFontSize}px`,
                    fontWeight: 700,
                    padding: "0.4rem 1.2rem",
                    borderRadius: "8px",
                    lineHeight: 1.4,
                    textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {displayLanguage === "original"
                    ? activeBlock.originalText
                    : displayLanguage === "translated"
                    ? activeBlock.translatedText || activeBlock.originalText
                    : `${activeBlock.originalText}\n${activeBlock.translatedText || ""}`}
                </span>
              </div>
            )}
          </div>

          {/* VIDEO CONTROLS TOOLBAR */}
          <div style={{ background: "var(--bg-elevated, #FFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "10px", padding: "10px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={() => {
                  if (!videoRef.current) return;
                  if (videoRef.current.paused) {
                    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
                  } else {
                    videoRef.current.pause();
                    setIsPlaying(false);
                  }
                }}
                style={{ background: "#3B82F6", color: "#FFF", border: "none", borderRadius: "6px", padding: "0.4rem 0.8rem", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{isPlaying ? "Tạm dừng" : "Phát Video"}</span>
              </button>

              <input
                type="range"
                min={0}
                max={durationSec || 100}
                step={0.1}
                value={currentTimeSec}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setCurrentTimeSec(v);
                  if (videoRef.current) videoRef.current.currentTime = v;
                }}
                style={{ flex: 1, accentColor: "#3B82F6", cursor: "pointer" }}
              />

              <span style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "var(--text-muted, #6B7280)", whiteSpace: "nowrap" }}>
                <strong style={{ color: "var(--text, #111827)" }}>{formatSec(currentTimeSec)}</strong> / {formatSec(durationSec)}
              </span>
            </div>
          </div>

          {/* 2. TIMELINE SUBTITLE EDITOR LIST (DUAL COLUMN: ORIGINAL & TRANSLATED) */}
          <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "0.98rem", fontWeight: 800, margin: 0, color: "var(--text, #111827)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FileText size={17} style={{ color: "#3B82F6" }} /> Danh sách Phụ đề & Timeline Studio
                </h3>
                <span style={{ fontSize: "0.72rem", background: "rgba(59,130,246,0.1)", color: "#3B82F6", padding: "0.15rem 0.55rem", borderRadius: "12px", fontWeight: 700 }}>
                  {blocks.length} câu
                </span>
              </div>

              {/* Add New Line Button */}
              <button
                onClick={() => {
                  const lastBlock = blocks[blocks.length - 1];
                  const newStart = lastBlock ? lastBlock.endMs + 500 : 1000;
                  const newBlock: StudioBlock = {
                    id: blocks.length + 1,
                    startMs: newStart,
                    endMs: newStart + 2500,
                    originalText: "Câu thoại mới",
                    translatedText: "",
                  };
                  setBlocks([...blocks, newBlock]);
                }}
                style={{ background: "var(--bg, #F3F4F6)", color: "var(--text, #111827)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "6px", padding: "0.3rem 0.65rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <Plus size={13} /> Thêm câu thoại
              </button>
            </div>

            {/* BLOCK LIST */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "420px", overflowY: "auto", paddingRight: "4px" }}>
              {blocks.map((b) => {
                const isActive = b.id === activeBlockId;
                return (
                  <div
                    key={b.id}
                    ref={isActive ? activeBlockRef : null}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = b.startMs / 1000;
                        videoRef.current.play().catch(() => {});
                      }
                      setActiveBlockId(b.id);
                    }}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "12px",
                      borderRadius: "10px",
                      border: isActive ? "1.5px solid #3B82F6" : "1px solid var(--border, #E5E7EB)",
                      background: isActive ? "rgba(59,130,246,0.06)" : "var(--bg, #F9FAFB)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: isActive ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
                    }}
                  >
                    {/* Block ID */}
                    <div style={{ minWidth: "26px", textAlign: "center", fontSize: "0.75rem", fontWeight: 800, color: isActive ? "#3B82F6" : "var(--text-muted, #9CA3AF)", paddingTop: "4px" }}>
                      #{b.id}
                    </div>

                    {/* Content Columns */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.68rem", fontFamily: "monospace", color: isActive ? "#3B82F6" : "var(--text-muted, #6B7280)", background: isActive ? "rgba(59,130,246,0.1)" : "rgba(0,0,0,0.04)", padding: "0.1rem 0.45rem", borderRadius: "4px" }}>
                          {formatMs(b.startMs)} → {formatMs(b.endMs)}
                        </span>
                        <span style={{ fontSize: "0.65rem", color: "var(--text-muted, #9CA3AF)" }}>
                          {((b.endMs - b.startMs) / 1000).toFixed(1)}s
                        </span>
                      </div>

                      {/* Original & Translated Inputs */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <label style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted, #9CA3AF)", display: "block", marginBottom: 2 }}>CÂU GỐC</label>
                          <textarea
                            value={b.originalText}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBlocks((prev) => prev.map((item) => (item.id === b.id ? { ...item, originalText: val } : item)));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            rows={2}
                            style={{ width: "100%", border: "1px solid var(--border, #E5E7EB)", borderRadius: "6px", padding: "6px", fontSize: "0.82rem", background: "var(--bg-elevated, #FFF)", outline: "none", resize: "vertical", color: "var(--text, #111827)" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.65rem", fontWeight: 700, color: "#10B981", display: "block", marginBottom: 2 }}>CÂU DỊCH</label>
                          <textarea
                            value={b.translatedText}
                            placeholder="Nhập câu dịch hoặc bấm nút Dịch tự động..."
                            onChange={(e) => {
                              const val = e.target.value;
                              setBlocks((prev) => prev.map((item) => (item.id === b.id ? { ...item, translatedText: val } : item)));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            rows={2}
                            style={{ width: "100%", border: "1px solid var(--border, #E5E7EB)", borderRadius: "6px", padding: "6px", fontSize: "0.82rem", background: "var(--bg-elevated, #FFF)", outline: "none", resize: "vertical", color: "var(--text, #111827)" }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Delete Block */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBlocks((prev) => prev.filter((item) => item.id !== b.id));
                      }}
                      style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", opacity: 0.6, padding: "4px" }}
                      title="Xóa câu"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: UNIFIED TABBED CONTROL PANEL (STT / TRANSLATE / STYLE / DUBBING) */}
        <div style={{ position: "sticky", top: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          
          <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", gap: "18px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            
            {/* PANEL TABS SWITCHER */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", background: "var(--bg, #F3F4F6)", padding: "4px", borderRadius: "10px" }}>
              {[
                { id: "stt", label: "📥 Trích xuất", color: "#3B82F6" },
                { id: "translate", label: "🌐 Dịch thuật", color: "#10B981" },
                { id: "style", label: "✏️ Kiểu dáng", color: "#F59E0B" },
                { id: "dubbing", label: "🎙️ Lồng tiếng", color: "#EC4899" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveRightTab(tab.id as any)}
                  style={{
                    padding: "0.45rem 0.4rem",
                    borderRadius: "7px",
                    border: "none",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: activeRightTab === tab.id ? "#FFFFFF" : "transparent",
                    color: activeRightTab === tab.id ? tab.color : "var(--text-muted, #6B7280)",
                    boxShadow: activeRightTab === tab.id ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: TRÍCH XUẤT (WHISPER STT / OCR) */}
            {activeRightTab === "stt" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 800, margin: 0, color: "#3B82F6", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <ScanText size={16} /> Whisper STT Auto-Caption
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Whisper Model Size</label>
                  <select value={sttModelSize} onChange={(e) => setSttModelSize(e.target.value)} style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    <option value="tiny">⚡ tiny — Cực nhanh</option>
                    <option value="small">🚀 small — Cân bằng</option>
                    <option value="medium">⭐ medium — Chất lượng cao (Khuyên dùng)</option>
                    <option value="large-v3">💎 large-v3 — Chính xác nhất</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Ngôn ngữ phát âm</label>
                  <select value={sttLang} onChange={(e) => setSttLang(e.target.value)} style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    <option value="auto">🌐 Tự động nhận diện (CapCut)</option>
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="zh">🇨🇳 Tiếng Trung</option>
                    <option value="en">🇺🇸 Tiếng Anh</option>
                  </select>
                </div>

                <button
                  onClick={runSttJob}
                  disabled={isProcessing}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", background: "#3B82F6", color: "#FFF", fontSize: "0.85rem", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}
                >
                  {isProcessing ? "⏳ Đang trích xuất..." : "⚡ Trích xuất phụ đề ngay"}
                </button>
              </div>
            )}

            {/* TAB 2: DỊCH THUẬT (GEMINI / LOCAL / GOOGLE) */}
            {activeRightTab === "translate" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 800, margin: 0, color: "#10B981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Subtitles size={16} /> Dịch thuật AI (Translate)
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Engine Dịch</label>
                  <select value={transEngine} onChange={(e) => setTransEngine(e.target.value as any)} style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    <option value="gemini">⚡ Gemini 2.5 Flash API (Siêu chính xác)</option>
                    <option value="local">🛡️ Local Ollama (Qwen2.5 9B)</option>
                    <option value="google_free">🌐 Google Translate Free (Miễn phí)</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Ngôn ngữ đích</label>
                  <select value={transTargetLang} onChange={(e) => setTransTargetLang(e.target.value)} style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en">🇺🇸 Tiếng Anh</option>
                    <option value="zh">🇨🇳 Tiếng Trung</option>
                    <option value="ja">🇯🇵 Tiếng Nhật</option>
                  </select>
                </div>

                <button
                  onClick={runTranslateJob}
                  disabled={isProcessing}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", background: "#10B981", color: "#FFF", fontSize: "0.85rem", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}
                >
                  {isProcessing ? "⏳ Đang biên dịch..." : "🌐 Dịch toàn bộ phụ đề ngay"}
                </button>
              </div>
            )}

            {/* TAB 3: KIỂU DÁNG SUBTITLE (STYLE OVERLAY) */}
            {activeRightTab === "style" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 800, margin: 0, color: "#F59E0B", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Wand2 size={16} /> Kiểu dáng Subtitle Overlay
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Hiển thị ngôn ngữ trên Video</label>
                  <select value={displayLanguage} onChange={(e) => setDisplayLanguage(e.target.value as any)} style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    <option value="both">⇄ Song ngữ (Gốc + Dịch)</option>
                    <option value="translated">✅ Chỉ hiển thị Câu dịch</option>
                    <option value="original">📜 Chỉ hiển thị Câu gốc</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Cỡ chữ Subtitle:</span>
                    <strong style={{ color: "#F59E0B" }}>{subFontSize}px</strong>
                  </div>
                  <input type="range" min="14" max="36" value={subFontSize} onChange={(e) => setSubFontSize(Number(e.target.value))} style={{ width: "100%", accentColor: "#F59E0B", cursor: "pointer" }} />
                </div>
              </div>
            )}

            {/* TAB 4: LỒNG TIẾNG AI (DUBBING) */}
            {activeRightTab === "dubbing" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 800, margin: 0, color: "#EC4899", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Mic size={16} /> Lồng tiếng Video AI (Dubbing)
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)" }}>Giọng AI Lồng tiếng</label>
                  <select value={dubVoiceId} onChange={(e) => setDubVoiceId(e.target.value)} style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.8rem" }}>
                    <option value="cms8j2sq800003ov4hxutuw07">🎙️ Minh Quân (Giọng Nam trầm ấm)</option>
                    <option value="cms8kzkok00000ov4kh41hle9">🎙️ Cô Gái hoạt ngôn (Giọng Nữ CapCut)</option>
                    <option value="phuong">🎙️ Phương (VieNeu-TTS Standard)</option>
                  </select>
                </div>

                <button
                  onClick={() => subLingo.showToast("Bắt đầu khởi chạy tiến trình lồng tiếng AI...", "info")}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", background: "#EC4899", color: "#FFF", fontSize: "0.85rem", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(236,72,153,0.3)" }}
                >
                  🎙️ Chạy lồng tiếng Video ngay
                </button>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
