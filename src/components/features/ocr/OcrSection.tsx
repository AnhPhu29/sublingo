import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ScanText,
  Image as ImageIcon,
  Film,
  Radio,
  Eye,
  RefreshCw,
  AlertCircle,
  Copy,
  ArrowRight,
  X,
  Settings,
  Send,
  Maximize,
  Globe,
  FileText,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Sparkles,
  Sliders,
  Clock,
  Cpu,
  Check,
  Mic,
  SkipForward,
  Wand2,
  AlignLeft,
} from "lucide-react";
import { LANGUAGES } from "@/lib/constants";
import { GlossaryItem } from "@/lib/types";

interface OcrSectionProps {
  // Mode selection
  extractionMode: "image" | "video_ocr" | "stt";
  setExtractionMode: (mode: "image" | "video_ocr" | "stt") => void;

  // Image OCR state
  ocrImage: { base64: string; mediaType: string } | null;
  setOcrImage: (img: any) => void;
  ocrImagePreview: string;
  setOcrImagePreview: (url: string) => void;
  ocrResult: string;
  setOcrResult: (text: string) => void;
  ocrLoading: boolean;
  setOcrLoading: (loading: boolean) => void;
  ocrError: string;
  setOcrError: (err: string) => void;
  ocrImageConfidence: number | null;
  setOcrImageConfidence: (conf: number | null) => void;
  isOcrDragOver: boolean;
  setIsOcrDragOver: (over: boolean) => void;

  // Video OCR state
  ocrVideoFile: File | null;
  setOcrVideoFile: (file: File | null) => void;
  ocrVideoPreviewUrl: string;
  setOcrVideoPreviewUrl: (url: string) => void;
  ocrSourceLang: string;
  setOcrSourceLang: (lang: string) => void;
  removeWatermark: boolean;
  setRemoveWatermark: (val: boolean) => void;
  autoTranslateAfterExtract: boolean;
  setAutoTranslateAfterExtract: (val: boolean) => void;
  syncAudio: boolean;
  setSyncAudio: (val: boolean) => void;
  cropX: number;
  setCropX: (x: number) => void;
  cropY: number;
  setCropY: (y: number) => void;
  cropWidth: number;
  setCropWidth: (w: number) => void;
  cropHeight: number;
  setCropHeight: (h: number) => void;

  // STT state
  sttFile: File | null;
  setSttFile: (file: File | null) => void;
  sttPreviewUrl: string;
  setSttPreviewUrl: (url: string) => void;
  sttSourceLang: string;
  setSttSourceLang: (lang: string) => void;

  // Shared state & callbacks
  selectedLangs: string[];
  toggleLang: (code: string) => void;
  glossary: GlossaryItem[];

  // Cost estimation state
  estimatedCost: { total: number; breakdown: Record<string, number> } | null;
  setEstimatedCost: (cost: any) => void;
  estimating: boolean;

  // Job Polling control
  activeJobId: string | null;
  startPolling: (jobId: string) => void;
  setActiveJobStatus: (status: any) => void;
  setActiveJobError: (err: string) => void;
  setActiveJobLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setJobProgressPercent: (pct: number) => void;

  // Global services
  showToast: (msg: string, type?: string) => void;
  useOcrForTranslation: () => void;
  onOpenGeminiKeyModal?: () => void;
  rawExtractedSubtitle?: string;
}

export const OcrSection: React.FC<OcrSectionProps> = ({
  onOpenGeminiKeyModal,
  extractionMode,
  setExtractionMode,
  ocrImage,
  setOcrImage,
  ocrImagePreview,
  setOcrImagePreview,
  ocrResult,
  setOcrResult,
  ocrLoading,
  setOcrLoading,
  ocrError,
  setOcrError,
  ocrImageConfidence,
  setOcrImageConfidence,
  isOcrDragOver,
  setIsOcrDragOver,
  ocrVideoFile,
  setOcrVideoFile,
  ocrVideoPreviewUrl,
  setOcrVideoPreviewUrl,
  ocrSourceLang,
  setOcrSourceLang,
  removeWatermark,
  setRemoveWatermark,
  autoTranslateAfterExtract,
  setAutoTranslateAfterExtract,
  syncAudio,
  setSyncAudio,
  cropX,
  setCropX,
  cropY,
  setCropY,
  cropWidth,
  setCropWidth,
  cropHeight,
  setCropHeight,
  sttFile,
  setSttFile,
  sttPreviewUrl,
  setSttPreviewUrl,
  sttSourceLang,
  setSttSourceLang,
  selectedLangs,
  toggleLang,
  glossary,
  estimatedCost,
  setEstimatedCost,
  estimating,
  activeJobId,
  startPolling,
  setActiveJobStatus,
  setActiveJobError,
  setActiveJobLogs,
  setJobProgressPercent,
  showToast,
  useOcrForTranslation,
  rawExtractedSubtitle,
}) => {
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const ocrVideoInputRef = useRef<HTMLInputElement>(null);
  const sttInputRef = useRef<HTMLInputElement>(null);

  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16 / 9);

  // Video player control states
  const videoRef = useRef<HTMLVideoElement>(null);
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedTimer, setElapsedTimer] = useState(0);

  // Elapsed extraction timer effect
  useEffect(() => {
    let timer: any = null;
    if (activeJobId) {
      timer = setInterval(() => setElapsedTimer((prev) => prev + 1), 1000);
    } else {
      setElapsedTimer(0);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [activeJobId]);

  // Auto-scroll subtitle result box on text change
  useEffect(() => {
    if (subtitleListRef.current) {
      subtitleListRef.current.scrollTop = subtitleListRef.current.scrollHeight;
    }
  }, [ocrResult, rawExtractedSubtitle]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    setIsMuted(v === 0);
    if (videoRef.current) videoRef.current.volume = v;
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (videoRef.current && videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatSec = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Drag and resize crop region states
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, cropX, cropY, cropWidth, cropHeight });

  // Reset aspect ratio when video URL changes/clears
  React.useEffect(() => {
    if (!ocrVideoPreviewUrl) {
      setVideoAspectRatio(16 / 9);
    }
  }, [ocrVideoPreviewUrl]);

  // Handle crop region dragging/resizing
  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      cropX,
      cropY,
      cropWidth,
      cropHeight
    };
    setActiveHandle(handle);
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent, handle: string) => {
    e.stopPropagation();
    const touch = e.touches[0];
    dragStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      cropX,
      cropY,
      cropWidth,
      cropHeight
    };
    setActiveHandle(handle);
    setIsDragging(true);
  };

  React.useEffect(() => {
    if (!isDragging || !activeHandle || !containerRef.current) return;

    const container = containerRef.current;

    const handleMove = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const containerWidth = rect.width;
      const containerHeight = rect.height;

      const deltaX = ((clientX - dragStart.current.x) / containerWidth) * 100;
      const deltaY = ((clientY - dragStart.current.y) / containerHeight) * 100;

      let newX = dragStart.current.cropX;
      let newY = dragStart.current.cropY;
      let newW = dragStart.current.cropWidth;
      let newH = dragStart.current.cropHeight;

      if (activeHandle === "move") {
        newX = Math.max(0, Math.min(100 - newW, dragStart.current.cropX + deltaX));
        newY = Math.max(0, Math.min(100 - newH, dragStart.current.cropY + deltaY));
      } else {
        if (activeHandle.includes("top")) {
          const bottomY = dragStart.current.cropY + dragStart.current.cropHeight;
          newY = Math.max(0, Math.min(bottomY - 5, dragStart.current.cropY + deltaY));
          newH = bottomY - newY;
        }
        if (activeHandle.includes("bottom")) {
          newH = Math.max(5, Math.min(100 - dragStart.current.cropY, dragStart.current.cropHeight + deltaY));
        }
        if (activeHandle.includes("left")) {
          const rightX = dragStart.current.cropX + dragStart.current.cropWidth;
          newX = Math.max(0, Math.min(rightX - 5, dragStart.current.cropX + deltaX));
          newW = rightX - newX;
        }
        if (activeHandle.includes("right")) {
          newW = Math.max(5, Math.min(100 - dragStart.current.cropX, dragStart.current.cropWidth + deltaX));
        }
      }

      setCropX(Math.round(newX * 10) / 10);
      setCropY(Math.round(newY * 10) / 10);
      setCropWidth(Math.round(newW * 10) / 10);
      setCropHeight(Math.round(newH * 10) / 10);
    };

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      setActiveHandle(null);
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      setActiveHandle(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, activeHandle, setCropX, setCropY, setCropWidth, setCropHeight]);

  // GIAI ĐOẠN 1: IMAGE OCR
  const handleOcrImage = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("Chỉ hỗ trợ file ảnh (PNG, JPG, WEBP, GIF)", "error");
        return;
      }

      setOcrResult("");
      setOcrError("");
      setOcrImageConfidence(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        setOcrImagePreview(preview);
        setOcrImage({
          base64: preview.split(",")[1],
          mediaType: file.type,
        });
      };
      reader.readAsDataURL(file);
    },
    [
      setOcrResult,
      setOcrError,
      setOcrImageConfidence,
      setOcrImagePreview,
      setOcrImage,
      showToast,
    ],
  );

  const performOCR = useCallback(async () => {
    if (!ocrImage) return;
    setOcrLoading(true);
    setOcrError("");
    setOcrResult("");
    setOcrImageConfidence(null);

    try {
      const res = await fetch("/api/ocr/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: ocrImage.base64,
          mediaType: ocrImage.mediaType,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setOcrResult(data.text);
        setOcrImageConfidence(
          data.confidence !== undefined ? data.confidence : 100,
        );
        showToast("Trích xuất chữ thành công", "success");
      } else {
        throw new Error(data.error || "Trích xuất thất bại");
      }
    } catch (err: any) {
      setOcrError(err.message || "Lỗi hệ thống");
      showToast(err.message || "Lỗi trích xuất", "error");
    }
    setOcrLoading(false);
  }, [
    ocrImage,
    setOcrLoading,
    setOcrError,
    setOcrResult,
    setOcrImageConfidence,
    showToast,
  ]);

  // GIAI ĐOẠN 2: VIDEO OCR WORKFLOW
  const startVideoOcr = async () => {
    if (!ocrVideoFile) return;

    // Pre-submit health check for Python AI Service
    try {
      const ping = await fetch("/api/health/python");
      if (!ping.ok) {
        setActiveJobStatus("error");
        setActiveJobError(
          "Python AI Service chưa sẵn sàng. Vui lòng khởi động trước khi gửi job.",
        );
        showToast(
          "Python AI Service unreachable — không thể submit job",
          "error",
        );
        return;
      }
    } catch (e) {
      setActiveJobStatus("error");
      setActiveJobError(
        "Python AI Service chưa sẵn sàng. Vui lòng khởi động trước khi gửi job.",
      );
      showToast(
        "Python AI Service unreachable — không thể submit job",
        "error",
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", ocrVideoFile);
    formData.append(
      "cropRegion",
      JSON.stringify({
        xPercent: cropX,
        yPercent: cropY,
        widthPercent: cropWidth,
        heightPercent: cropHeight,
      }),
    );
    formData.append("sourceLanguage", ocrSourceLang);
    formData.append("removeWatermark", String(removeWatermark));
    formData.append("autoTranslate", String(autoTranslateAfterExtract));
    formData.append("syncAudio", String(syncAudio));
    formData.append("selectedLangs", JSON.stringify(selectedLangs));
    formData.append(
      "glossary",
      JSON.stringify(
        glossary.map((g) => ({ original: g.term, translation: g.translation })),
      ),
    );
    formData.append("engine", aiEngine);

    setActiveJobStatus("queued");
    setActiveJobError("");
    setActiveJobLogs(["[System] Đang tải video lên server..."]);
    setJobProgressPercent(0);

    try {
      const res = await fetch("/api/ocr/video", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        startPolling(data.jobId);
        showToast("Đã upload video và đưa vào hàng đợi", "success");
      } else {
        throw new Error(data.error || "Lỗi tải video lên server");
      }
    } catch (err: any) {
      setActiveJobStatus("error");
      setActiveJobError(err.message || "Không thể upload video");
    }
  };

  const [sttModelSize, setSttModelSize] = useState<string>("medium");
  const [sttWordTimestamps, setSttWordTimestamps] = useState<boolean>(false);
  const [sttCleanVocal, setSttCleanVocal] = useState<boolean>(false);
  const [sttAiRefiner, setSttAiRefiner] = useState<boolean>(false);

  // CapCut-style: parsed SRT blocks for interactive editor
  interface SrtBlock { id: number; startMs: number; endMs: number; text: string; }
  const [parsedSrtBlocks, setParsedSrtBlocks] = useState<SrtBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const activeBlockRef = useRef<HTMLDivElement | null>(null);

  // Parse SRT text into block array whenever result changes
  useEffect(() => {
    const srt = rawExtractedSubtitle || ocrResult || "";
    if (extractionMode !== "stt" || !srt.trim()) { setParsedSrtBlocks([]); return; }
    const blocks: SrtBlock[] = [];
    const rawBlocks = srt.trim().split(/\n\s*\n/);
    for (const raw of rawBlocks) {
      const lines = raw.trim().split("\n");
      if (lines.length < 2) continue;
      const idLine = lines[0].trim();
      const tsLine = lines[1]?.trim() || "";
      const tsMatch = tsLine.match(/(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})/);
      if (!tsMatch) continue;
      const toMs = (h: string, m: string, s: string, ms: string) =>
        parseInt(h)*3600000 + parseInt(m)*60000 + parseInt(s)*1000 + parseInt(ms);
      const startMs = toMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4]);
      const endMs = toMs(tsMatch[5], tsMatch[6], tsMatch[7], tsMatch[8]);
      const text = lines.slice(2).join("\n").trim();
      blocks.push({ id: parseInt(idLine) || blocks.length + 1, startMs, endMs, text });
    }
    setParsedSrtBlocks(blocks);
  }, [rawExtractedSubtitle, ocrResult, extractionMode]);

  // Sync active block with video playback
  useEffect(() => {
    if (extractionMode !== "stt" || parsedSrtBlocks.length === 0) return;
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      const ms = video.currentTime * 1000;
      const active = parsedSrtBlocks.find(b => ms >= b.startMs && ms <= b.endMs);
      setActiveBlockId(active?.id ?? null);
    };
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [parsedSrtBlocks, extractionMode]);

  // Auto-scroll active block into view
  useEffect(() => {
    if (activeBlockRef.current) {
      activeBlockRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeBlockId]);

  // Helper: rebuild SRT from parsedSrtBlocks for export
  const rebuildSrtFromBlocks = (blocks: SrtBlock[]) => {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    const msToTs = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const rem = ms % 1000;
      return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
    };
    return blocks.map((b, i) =>
      `${i + 1}\n${msToTs(b.startMs)} --> ${msToTs(b.endMs)}\n${b.text}`
    ).join("\n\n");
  };

  // GIAI ĐOẠN 2: WHISPER STT WORKFLOW
  const startStt = async () => {
    if (!sttFile) return;

    // Pre-submit health check for Python AI Service
    try {
      const ping = await fetch("/api/health/python");
      if (!ping.ok) {
        setActiveJobStatus("error");
        setActiveJobError(
          "Python AI Service chưa sẵn sàng. Vui lòng khởi động trước khi gửi job.",
        );
        showToast(
          "Python AI Service unreachable — không thể submit job",
          "error",
        );
        return;
      }
    } catch (e) {
      setActiveJobStatus("error");
      setActiveJobError(
        "Python AI Service chưa sẵn sàng. Vui lòng khởi động trước khi gửi job.",
      );
      showToast(
        "Python AI Service unreachable — không thể submit job",
        "error",
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", sttFile);
    formData.append("sourceLanguage", sttSourceLang);
    formData.append("modelSize", sttModelSize);
    formData.append("wordTimestamps", String(sttWordTimestamps));
    formData.append("cleanVocal", String(sttCleanVocal));
    formData.append("sttAiRefiner", String(sttAiRefiner));
    formData.append("autoTranslate", String(autoTranslateAfterExtract));
    formData.append("selectedLangs", JSON.stringify(selectedLangs));
    formData.append(
      "glossary",
      JSON.stringify(
        glossary.map((g) => ({ original: g.term, translation: g.translation })),
      ),
    );
    formData.append("engine", aiEngine);

    setActiveJobStatus("queued");
    setActiveJobError("");
    setActiveJobLogs(["[System] Đang tải tệp âm thanh lên server..."]);
    setJobProgressPercent(0);

    try {
      const res = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        startPolling(data.jobId);
        showToast("Đã upload media và đưa vào hàng đợi Whisper", "success");
      } else {
        throw new Error(data.error || "Lỗi tải media lên server");
      }
    } catch (err: any) {
      setActiveJobStatus("error");
      setActiveJobError(err.message || "Không thể upload media");
    }
  };

  const [aiEngine, setAiEngine] = useState<"local" | "gemini">("local");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(540px, 70%) 1fr", gap: "24px", alignItems: "start", fontFamily: "Inter, system-ui, sans-serif" }}>
      
      {/* 1. LEFT COLUMN (70%) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 }}>
        
        {/* SECTION 1: HEADER */}
        <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "12px", padding: "20px 24px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--text, #111827)", letterSpacing: "-0.01em" }}>Trích xuất phụ đề</h1>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted, #6B7280)", margin: "0.2rem 0 0 0" }}>
                Tự động trích xuất phụ đề từ chữ in màn hình (OCR) hoặc lời thoại giọng nói (Whisper STT).
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div style={{ display: "flex", background: "var(--bg, #F3F4F6)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border, #E5E7EB)" }}>
              {[
                { id: "video_ocr", label: "OCR Video", icon: Film },
                { id: "stt", label: "Whisper STT", icon: Radio },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    setExtractionMode(mode.id as any);
                    setEstimatedCost(null);
                  }}
                  style={{
                    padding: "0.45rem 1rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "all 0.2s ease",
                    background: extractionMode === mode.id ? "#3B82F6" : "transparent",
                    color: extractionMode === mode.id ? "#FFFFFF" : "var(--text-muted, #6B7280)",
                    boxShadow: extractionMode === mode.id ? "0 2px 8px rgba(59,130,246,0.35)" : "none",
                  }}
                >
                  <mode.icon size={15} />
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: VIDEO PREVIEW & CROP CANVAS */}
        <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "12px", padding: "20px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text, #111827)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Film size={16} style={{ color: "#3B82F6" }} /> Video Preview & Crop Overlay
            </h3>
            {ocrVideoFile && (
              <span style={{ fontSize: "0.75rem", background: "rgba(59,130,246,0.1)", color: "#3B82F6", padding: "0.2rem 0.6rem", borderRadius: "12px", fontWeight: 700 }}>
                {ocrVideoFile.name}
              </span>
            )}
          </div>

          {/* Video Dropzone or Interactive Canvas */}
          {extractionMode === "video_ocr" && !ocrVideoPreviewUrl ? (
            <div
              style={{
                border: "2px dashed var(--border, #E5E7EB)",
                borderRadius: "12px",
                padding: "3rem 2rem",
                textAlign: "center",
                cursor: "pointer",
                background: "var(--bg, #F9FAFB)",
                transition: "all 0.2s",
              }}
              onClick={() => ocrVideoInputRef.current?.click()}
            >
              <input
                type="file"
                ref={ocrVideoInputRef}
                accept="video/mp4,video/webm"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setOcrVideoFile(file);
                    setOcrVideoPreviewUrl(URL.createObjectURL(file));
                  }
                }}
              />
              <Film size={40} style={{ color: "#3B82F6", marginBottom: "0.75rem" }} />
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text, #111827)" }}>Tải Video lên để quét OCR phụ đề</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #6B7280)", marginTop: "0.25rem" }}>Kéo thả hoặc click để mở MP4, WEBM (Tối đa 500MB)</div>
            </div>
          ) : extractionMode === "stt" && !sttPreviewUrl ? (
            <div
              style={{
                border: "2px dashed var(--border, #E5E7EB)",
                borderRadius: "12px",
                padding: "3rem 2rem",
                textAlign: "center",
                cursor: "pointer",
                background: "var(--bg, #F9FAFB)",
                transition: "all 0.2s",
              }}
              onClick={() => sttInputRef.current?.click()}
            >
              <input
                type="file"
                ref={sttInputRef}
                accept="video/*,audio/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSttFile(file);
                    setSttPreviewUrl(URL.createObjectURL(file));
                  }
                }}
              />
              <Radio size={40} style={{ color: "#3B82F6", marginBottom: "0.75rem" }} />
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text, #111827)" }}>Tải tệp Video / Audio lên để chạy Whisper STT</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #6B7280)", marginTop: "0.25rem" }}>Hỗ trợ MP4, WEBM, MP3, WAV, M4A</div>
            </div>
          ) : (
            /* Media Player with Interactive Crop Overlay */
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                ref={containerRef}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16/9",
                  background: "#000000",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  userSelect: "none",
                }}
              >
                <video
                  ref={videoRef}
                  src={ocrVideoPreviewUrl || sttPreviewUrl}
                  playsInline
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTimeSec(videoRef.current.currentTime);
                      setDurationSec(videoRef.current.duration || 0);
                      setIsPlaying(!videoRef.current.paused);
                    }
                  }}
                  onLoadedMetadata={(e) => {
                    if (e.currentTarget.videoWidth && e.currentTarget.videoHeight) {
                      setVideoAspectRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
                    }
                    setDurationSec(e.currentTarget.duration || 0);
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />

                {/* OCR Crop Overlay */}
                {extractionMode === "video_ocr" && (
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: `${cropX}%`,
                        top: `${cropY}%`,
                        width: `${cropWidth}%`,
                        height: `${cropHeight}%`,
                        border: "2px dashed #3B82F6",
                        background: "rgba(59, 130, 246, 0.2)",
                        boxShadow: "0 0 15px rgba(59,130,246,0.4)",
                        cursor: "move",
                        pointerEvents: "auto",
                        boxSizing: "border-box",
                      }}
                      onMouseDown={(e) => handleMouseDown(e, "move")}
                      onTouchStart={(e) => handleTouchStart(e, "move")}
                    >
                      <div style={{ position: "absolute", top: -5, left: -5, width: 10, height: 10, borderRadius: "50%", background: "#3B82F6", cursor: "nwse-resize" }} onMouseDown={(e) => handleMouseDown(e, "top-left")} />
                      <div style={{ position: "absolute", top: -5, right: -5, width: 10, height: 10, borderRadius: "50%", background: "#3B82F6", cursor: "nesw-resize" }} onMouseDown={(e) => handleMouseDown(e, "top-right")} />
                      <div style={{ position: "absolute", bottom: -5, left: -5, width: 10, height: 10, borderRadius: "50%", background: "#3B82F6", cursor: "nesw-resize" }} onMouseDown={(e) => handleMouseDown(e, "bottom-left")} />
                      <div style={{ position: "absolute", bottom: -5, right: -5, width: 10, height: 10, borderRadius: "50%", background: "#3B82F6", cursor: "nwse-resize" }} onMouseDown={(e) => handleMouseDown(e, "bottom-right")} />
                      <div style={{ position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)", background: "#3B82F6", color: "#FFF", fontSize: "0.65rem", fontWeight: 800, padding: "0.1rem 0.5rem", borderRadius: "4px", whiteSpace: "nowrap" }}>
                        Vùng quét OCR: {Math.round(cropWidth)}% x {Math.round(cropHeight)}%
                      </div>
                    </div>
                  </div>
                )}

                {/* CapCut-style Subtitle Overlay on Video (STT mode) */}
                {extractionMode === "stt" && (() => {
                  const ms = currentTimeSec * 1000;
                  const activeBlock = parsedSrtBlocks.find(b => ms >= b.startMs && ms <= b.endMs);
                  return activeBlock ? (
                    <div style={{
                      position: "absolute", bottom: "8%", left: "50%", transform: "translateX(-50%)",
                      maxWidth: "90%", textAlign: "center", pointerEvents: "none",
                    }}>
                      <span style={{
                        display: "inline-block",
                        background: "rgba(0,0,0,0.78)",
                        color: "#FFFFFF",
                        fontSize: "1.05rem",
                        fontWeight: 600,
                        padding: "0.4rem 1.1rem",
                        borderRadius: "8px",
                        lineHeight: 1.5,
                        backdropFilter: "blur(4px)",
                        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                        whiteSpace: "pre-wrap",
                      }}>
                        {activeBlock.text}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Video Controls Below Preview */}
              <div style={{ background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Timeline Scrubber Slider */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                  <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted, #6B7280)", whiteSpace: "nowrap" }}>
                    <strong style={{ color: "var(--text, #111827)" }}>{formatSec(currentTimeSec)}</strong> / {formatSec(durationSec)}
                  </span>
                </div>

                {/* Play/Pause, Volume, Fullscreen Controls */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={togglePlayPause}
                      style={{ background: "#3B82F6", color: "#FFF", border: "none", borderRadius: "6px", padding: "0.35rem 0.75rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      <span>{isPlaying ? "Pause" : "Play"}</span>
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", background: "var(--bg-elevated, #FFF)", padding: "0.2rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border, #E5E7EB)" }}>
                      <button onClick={toggleMute} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #6B7280)", display: "flex", alignItems: "center" }}>
                        {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <input
                        type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        style={{ width: "60px", accentColor: "#3B82F6", cursor: "pointer" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={() => {
                        if (ocrVideoPreviewUrl) { URL.revokeObjectURL(ocrVideoPreviewUrl); setOcrVideoPreviewUrl(""); setOcrVideoFile(null); }
                        if (sttPreviewUrl) { URL.revokeObjectURL(sttPreviewUrl); setSttPreviewUrl(""); setSttFile(null); }
                      }}
                      style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "none", borderRadius: "6px", padding: "0.35rem 0.65rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                    >
                      Đổi video khác
                    </button>

                    <button
                      onClick={toggleFullscreen}
                      style={{ background: "var(--bg-elevated, #FFF)", color: "var(--text, #111827)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "6px", padding: "0.35rem 0.55rem", cursor: "pointer" }}
                      title="Fullscreen"
                    >
                      <Maximize size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: RESULT (OCR textarea OR CapCut STT block editor) */}
        <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "12px", padding: "20px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text, #111827)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                {extractionMode === "stt" ? <><Mic size={15} style={{ color: "#8B5CF6" }} /> Phụ đề STT</> : <>Kết quả OCR</>}
              </h3>
              {Boolean(rawExtractedSubtitle || ocrResult) && (
                <span style={{ fontSize: "0.72rem", background: extractionMode === "stt" ? "rgba(139,92,246,0.1)" : "rgba(59,130,246,0.1)", color: extractionMode === "stt" ? "#8B5CF6" : "#3B82F6", padding: "0.15rem 0.55rem", borderRadius: "12px", fontWeight: 700 }}>
                  {extractionMode === "stt" ? `${parsedSrtBlocks.length} đoạn` : `${(rawExtractedSubtitle || ocrResult).split('\n').length} dòng`}
                </span>
              )}
            </div>

            {/* Action Buttons Toolbar */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const content = extractionMode === "stt" && parsedSrtBlocks.length > 0
                    ? rebuildSrtFromBlocks(parsedSrtBlocks)
                    : (rawExtractedSubtitle || ocrResult || "");
                  navigator.clipboard.writeText(content);
                  showToast("Đã sao chép vào bộ nhớ tạm!", "success");
                }}
                style={{ background: "var(--bg, #F3F4F6)", color: "var(--text, #111827)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "6px", padding: "0.35rem 0.7rem", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Copy size={13} /> Copy
              </button>

              <button
                onClick={() => {
                  const content = extractionMode === "stt" && parsedSrtBlocks.length > 0
                    ? rebuildSrtFromBlocks(parsedSrtBlocks)
                    : (rawExtractedSubtitle || ocrResult || "");
                  if (!content) return;
                  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = `subtitle_${extractionMode === "stt" ? "stt" : "ocr"}.srt`;
                  link.click();
                }}
                style={{ background: "var(--bg, #F3F4F6)", color: "var(--text, #111827)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "6px", padding: "0.35rem 0.7rem", fontSize: '0.76rem', fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Download size={13} /> Download SRT
              </button>

              <button
                onClick={useOcrForTranslation}
                style={{ background: "#3B82F6", color: "#FFF", border: "none", borderRadius: "6px", padding: "0.35rem 0.75rem", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Globe size={13} /> Translate
              </button>
            </div>
          </div>

          {/* CapCut-style STT Block Editor */}
          {extractionMode === "stt" && parsedSrtBlocks.length > 0 ? (
            <div ref={subtitleListRef} style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "360px", overflowY: "auto", padding: "4px 2px" }}>
              {parsedSrtBlocks.map((block, idx) => {
                const isActive = block.id === activeBlockId;
                const formatMs = (ms: number) => {
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  const s = Math.floor((ms % 60000) / 1000);
                  const rem = ms % 1000;
                  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(rem).padStart(3,"0")}`;
                };
                return (
                  <div
                    key={block.id}
                    ref={isActive ? activeBlockRef : null}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = block.startMs / 1000;
                        videoRef.current.play().catch(() => {});
                        setIsPlaying(true);
                      }
                      setActiveBlockId(block.id);
                    }}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: isActive ? "1.5px solid #8B5CF6" : "1px solid var(--border, #E5E7EB)",
                      background: isActive ? "rgba(139,92,246,0.07)" : "var(--bg, #F9FAFB)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: isActive ? "0 0 0 3px rgba(139,92,246,0.12)" : "none",
                    }}
                  >
                    {/* Block Index + Seek Icon */}
                    <div style={{ minWidth: 28, textAlign: "center", paddingTop: "2px" }}>
                      {isActive ? (
                        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#8B5CF6", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <SkipForward size={13} />
                          <span>{block.id}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted, #9CA3AF)" }}>{block.id}</span>
                      )}
                    </div>

                    {/* Timestamp + Text Editor */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ fontSize: "0.68rem", fontFamily: "monospace", color: isActive ? "#8B5CF6" : "var(--text-muted, #6B7280)", background: isActive ? "rgba(139,92,246,0.1)" : "rgba(0,0,0,0.04)", padding: "0.1rem 0.4rem", borderRadius: "4px", whiteSpace: "nowrap" }}>
                          {formatMs(block.startMs)} → {formatMs(block.endMs)}
                        </span>
                        <span style={{ fontSize: "0.65rem", color: "var(--text-muted, #9CA3AF)" }}>
                          {((block.endMs - block.startMs) / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <textarea
                        value={block.text}
                        onChange={(e) => {
                          const newText = e.target.value;
                          setParsedSrtBlocks(prev => prev.map(b => b.id === block.id ? { ...b, text: newText } : b));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        rows={Math.max(1, block.text.split("\n").length)}
                        style={{
                          width: "100%", resize: "none", border: "none",
                          background: "transparent", outline: "none",
                          fontSize: "0.85rem", lineHeight: 1.5,
                          color: "var(--text, #111827)", fontFamily: "inherit",
                          padding: 0, cursor: "text",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback: plain textarea for OCR mode or empty STT */
            <div ref={subtitleListRef} style={{ background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", padding: "12px", maxHeight: "320px", overflowY: "auto" }}>
              <textarea
                className="paste-area"
                value={rawExtractedSubtitle || ocrResult || ""}
                onChange={(e) => setOcrResult(e.target.value)}
                placeholder="Kết quả phụ đề trích xuất sẽ tự động hiển thị ở đây (hỗ trợ chỉnh sửa từng dòng thoại)..."
                style={{
                  width: "100%", minHeight: "220px", fontFamily: "monospace",
                  fontSize: "0.82rem", lineHeight: 1.5, border: "none",
                  background: "transparent", resize: "vertical", outline: "none",
                  color: "var(--text, #111827)"
                }}
              />
            </div>
          )}
        </div>

        {/* SECTION 4: STATUS BAR */}
        <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "12px", padding: "16px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", fontWeight: 700 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Clock size={16} style={{ color: "#3B82F6" }} />
              <span>Trạng thái OCR:</span>
              <span style={{ color: activeJobId ? "#3B82F6" : ocrResult ? "#10B981" : "var(--text-muted, #6B7280)" }}>
                {activeJobId ? "Đang trích xuất..." : ocrResult ? "Hoàn thành" : "Đang chờ gửi job"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.78rem", color: "var(--text-muted, #6B7280)" }}>
              <span>Thời gian chạy: <strong style={{ color: "var(--text, #111827)" }}>{formatSec(elapsedTimer)}</strong></span>
              <span>Tiến độ: <strong style={{ color: "#3B82F6" }}>{activeJobId ? "Running" : "Idle"}</strong></span>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: "100%", height: "8px", background: "var(--bg, #F3F4F6)", borderRadius: "4px", overflow: "hidden" }}>
            <div
              style={{
                width: activeJobId ? `65%` : ocrResult ? `100%` : `0%`,
                height: "100%",
                background: "#3B82F6",
                transition: "width 0.4s ease"
              }}
            />
          </div>
        </div>

      </div>

      {/* 2. RIGHT COLUMN (30% Sticky Configuration Panel) */}
      <div style={{ position: "sticky", top: "24px", display: "flex", flexDirection: "column", gap: "20px", height: "fit-content" }}>
        
        <div style={{ background: "var(--bg-elevated, #FFFFFF)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "20px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
          
          {/* Panel Title */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border, #E5E7EB)", paddingBottom: "12px" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text, #111827)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Settings size={18} style={{ color: "#3B82F6" }} /> Cài đặt OCR
            </h2>
            <span style={{ fontSize: "0.72rem", background: "rgba(59,130,246,0.1)", color: "#3B82F6", padding: "0.15rem 0.5rem", borderRadius: "12px", fontWeight: 700 }}>
              CapCut Engine
            </span>
          </div>

          {/* Group ①: AI Engine */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>① AI Engine</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setAiEngine("local")}
                style={{
                  flex: 1, padding: "0.5rem", borderRadius: "8px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                  border: aiEngine === "local" ? "1px solid #3B82F6" : "1px solid var(--border, #E5E7EB)",
                  background: aiEngine === "local" ? "rgba(59,130,246,0.1)" : "var(--bg, #F9FAFB)",
                  color: aiEngine === "local" ? "#3B82F6" : "var(--text, #111827)"
                }}
              >
                🛡️ Local AI
              </button>
              <button
                type="button"
                onClick={() => setAiEngine("gemini")}
                style={{
                  flex: 1, padding: "0.5rem", borderRadius: "8px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                  border: aiEngine === "gemini" ? "1px solid #3B82F6" : "1px solid var(--border, #E5E7EB)",
                  background: aiEngine === "gemini" ? "rgba(59,130,246,0.1)" : "var(--bg, #F9FAFB)",
                  color: aiEngine === "gemini" ? "#3B82F6" : "var(--text, #111827)"
                }}
              >
                ⚡ Gemini API
              </button>
            </div>
          </div>

          {/* Group ②: Language */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>② Source Language</label>
            <select
              value={ocrSourceLang}
              onChange={(e) => setOcrSourceLang(e.target.value)}
              style={{ width: "100%", height: "36px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", fontSize: "0.82rem", color: "var(--text, #111827)", outline: "none" }}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Group ③: Crop Settings (OCR only) | STT Settings */}
          {extractionMode !== "stt" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--bg, #F9FAFB)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border, #E5E7EB)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>③ Crop Settings</label>
                <button
                  onClick={() => { setCropX(0); setCropY(75); setCropWidth(100); setCropHeight(22); }}
                  style={{ fontSize: "0.68rem", background: "rgba(59,130,246,0.1)", color: "#3B82F6", border: "none", padding: "0.15rem 0.45rem", borderRadius: "4px", cursor: "pointer", fontWeight: 600 }}
                >
                  Bottom Sub (20%)
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.72rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)", marginBottom: "0.15rem" }}><span>Crop X:</span><strong style={{ color: "#3B82F6" }}>{cropX}%</strong></div>
                  <input type="range" min="0" max="100" value={cropX} onChange={(e) => setCropX(Number(e.target.value))} style={{ width: "100%", accentColor: "#3B82F6", cursor: "pointer" }} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)", marginBottom: "0.15rem" }}><span>Crop Y:</span><strong style={{ color: "#3B82F6" }}>{cropY}%</strong></div>
                  <input type="range" min="0" max="100" value={cropY} onChange={(e) => setCropY(Number(e.target.value))} style={{ width: "100%", accentColor: "#3B82F6", cursor: "pointer" }} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)", marginBottom: "0.15rem" }}><span>Width:</span><strong style={{ color: "#3B82F6" }}>{cropWidth}%</strong></div>
                  <input type="range" min="5" max="100" value={cropWidth} onChange={(e) => setCropWidth(Number(e.target.value))} style={{ width: "100%", accentColor: "#3B82F6", cursor: "pointer" }} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)", marginBottom: "0.15rem" }}><span>Height:</span><strong style={{ color: "#3B82F6" }}>{cropHeight}%</strong></div>
                  <input type="range" min="5" max="100" value={cropHeight} onChange={(e) => setCropHeight(Number(e.target.value))} style={{ width: "100%", accentColor: "#3B82F6", cursor: "pointer" }} />
                </div>
              </div>
            </div>
          ) : (
            /* STT-specific settings panel */
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(139,92,246,0.04)", padding: "14px", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.2)" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Mic size={13} /> ③ Cài đặt Whisper STT
              </label>

              {/* Model Size */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "0.73rem", color: "var(--text-muted, #6B7280)", fontWeight: 600 }}>Model Whisper</label>
                <select
                  value={sttModelSize}
                  onChange={(e) => setSttModelSize(e.target.value)}
                  style={{ width: "100%", height: "34px", padding: "0 10px", background: "var(--bg, #F9FAFB)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "7px", fontSize: "0.8rem", color: "var(--text, #111827)", outline: "none", cursor: "pointer" }}
                >
                  <option value="tiny">⚡ tiny — Cực nhanh</option>
                  <option value="base">🚀 base — Nhanh</option>
                  <option value="small">✅ small — Cân bằng</option>
                  <option value="medium">⭐ medium — Chất lượng cao (Khuyên dùng)</option>
                  <option value="large-v3">💎 large-v3 — Chính xác nhất</option>
                </select>
              </div>

              {/* STT Toggles */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", cursor: "pointer", color: "var(--text, #111827)" }}>
                  <input type="checkbox" checked={sttWordTimestamps} onChange={(e) => setSttWordTimestamps(e.target.checked)} style={{ accentColor: "#8B5CF6" }} />
                  <AlignLeft size={13} style={{ color: "#8B5CF6" }} /> Word-level timestamps
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", cursor: "pointer", color: "var(--text, #111827)" }}>
                  <input type="checkbox" checked={sttCleanVocal} onChange={(e) => setSttCleanVocal(e.target.checked)} style={{ accentColor: "#8B5CF6" }} />
                  <Wand2 size={13} style={{ color: "#8B5CF6" }} /> Tách nhạc nền (Clean Vocal)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", cursor: "pointer", color: "var(--text, #111827)" }}>
                  <input type="checkbox" checked={sttAiRefiner} onChange={(e) => setSttAiRefiner(e.target.checked)} style={{ accentColor: "#8B5CF6" }} />
                  <Sparkles size={13} style={{ color: "#8B5CF6" }} /> AI sửa chính tả sau STT
                </label>
              </div>
            </div>
          )}

          {/* Group ④: Advanced Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>④ Advanced Options</label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", cursor: "pointer", color: "var(--text, #111827)" }}>
              <input type="checkbox" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} style={{ accentColor: "#3B82F6" }} />
              Remove watermark & noise
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", cursor: "pointer", color: "var(--text, #111827)" }}>
              <input type="checkbox" checked={autoTranslateAfterExtract} onChange={(e) => setAutoTranslateAfterExtract(e.target.checked)} style={{ accentColor: "#3B82F6" }} />
              Auto translate after extraction
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", cursor: "pointer", color: "var(--text, #111827)" }}>
              <input type="checkbox" checked={syncAudio} onChange={(e) => setSyncAudio(e.target.checked)} style={{ accentColor: "#3B82F6" }} />
              Extract synced audio
            </label>
          </div>

          {/* Group ⑤: Processing Information */}
          <div style={{ background: "var(--bg, #F9FAFB)", border: "1px solid var(--border, #E5E7EB)", borderRadius: "8px", padding: "12px", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted, #6B7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>⑤ Processing Info</label>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)" }}>
              <span>Est. Processing Time:</span>
              <strong style={{ color: "var(--text, #111827)" }}>~ 30-90 seconds</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)" }}>
              <span>OCR Engine:</span>
              <strong style={{ color: "#3B82F6" }}>{aiEngine === "local" ? "PaddleOCR GPU v4" : "Gemini 2.5 Flash"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted, #6B7280)" }}>
              <span>Hardware Acceleration:</span>
              <strong style={{ color: "#10B981" }}>🟢 CUDA GPU Enabled</strong>
            </div>
          </div>

          {/* Group ⑥: Primary Action Button (Always Visible at Bottom) */}
          <button
            onClick={extractionMode === "video_ocr" ? startVideoOcr : startStt}
            disabled={activeJobId !== null || (extractionMode === "video_ocr" ? !ocrVideoFile : !sttFile)}
            style={{
              width: "100%",
              padding: "0.85rem",
              borderRadius: "8px",
              background: (extractionMode === "video_ocr" ? ocrVideoFile : sttFile) ? "#3B82F6" : "var(--border, #E5E7EB)",
              color: (extractionMode === "video_ocr" ? ocrVideoFile : sttFile) ? "#FFFFFF" : "var(--text-muted, #6B7280)",
              fontSize: "0.9rem",
              fontWeight: 700,
              border: "none",
              cursor: (extractionMode === "video_ocr" ? ocrVideoFile : sttFile) ? "pointer" : "not-allowed",
              boxShadow: (extractionMode === "video_ocr" ? ocrVideoFile : sttFile) ? "0 4px 14px rgba(59,130,246,0.4)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem"
            }}
          >
            {activeJobId ? (
              <>⏳ Đang trích xuất phụ đề...</>
            ) : (
              <>
                <ScanText size={18} /> Trích xuất phụ đề
              </>
            )}
          </button>

        </div>
      </div>

    </div>
  );
};
