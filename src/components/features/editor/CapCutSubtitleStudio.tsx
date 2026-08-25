import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Scissors,
  Download,
  Volume2,
  VolumeX,
  Trash2,
  Undo,
  Redo,
  Sparkles,
  Type,
  Palette,
  Sliders,
  Maximize,
  Copy,
  ChevronRight,
  ChevronDown,
  Globe,
  Music,
  Film,
  UserCheck,
  Zap,
  SkipBack,
  SkipForward,
  MousePointer,
  FileText,
  Save,
  ZoomIn,
  ZoomOut,
  Sticker,
  Wand2,
  Eye,
  Settings,
  Layers,
  Folder,
  Plus,
  Grid,
} from "lucide-react";
import { TimelineEngine, UtteranceItem } from "@/lib/timeline/timeline-engine";
import { ShortcutManager } from "@/lib/shortcuts/shortcut-manager";

interface CapCutSubtitleStudioProps {
  videoUrl?: string;
  videoPath?: string;
  utterances?: UtteranceItem[];
  onUtterancesChange?: (newUtterances: UtteranceItem[]) => void;
  showToast?: (msg: string, type?: string) => void;
}

export const CapCutSubtitleStudio: React.FC<CapCutSubtitleStudioProps> = ({
  videoUrl = "",
  videoPath = "",
  utterances = [],
  onUtterancesChange,
  showToast,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // States
  const [items, setItems] = useState<UtteranceItem[]>(utterances);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(6.38);
  const [durationSec, setDurationSec] = useState(60.0);
  const [zoomPxPerSec, setZoomPxPerSec] = useState(50); // 50px = 1 sec
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isDiarizing, setIsDiarizing] = useState(false);
  const [isExportingHardSub, setIsExportingHardSub] = useState(false);
  const [volume, setVolume] = useState(1.0);

  // Active Left Sidebar Subtab
  const [activeLeftTab, setActiveLeftTab] = useState<
    "captions" | "media" | "text" | "stickers" | "effects" | "audio"
  >("captions");

  // Active Right Inspector Subtab
  const [activeRightTab, setActiveRightTab] = useState<
    "text" | "font" | "animation" | "speaker" | "export"
  >("text");

  // Style Presets & Font Properties
  const [selectedPreset, setSelectedPreset] = useState("capcut_default");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [fontSize, setFontSize] = useState(24);
  const [primaryColor, setPrimaryColor] = useState("#FFFFFF");
  const [secondaryColor, setSecondaryColor] = useState("#FF4081");
  const [outlineColor, setOutlineColor] = useState("#000000");
  const [shadowColor, setShadowColor] = useState("#000000");
  const [outlineWidth, setOutlineWidth] = useState(2);
  const [selectedAnimation, setSelectedAnimation] = useState("fade_in");

  // Speakers List
  const [speakers] = useState([
    { id: "SPEAKER_01", name: "Speaker 1", color: "#FF4081" },
    { id: "SPEAKER_02", name: "Speaker 2", color: "#A855F7" },
    { id: "SPEAKER_03", name: "Speaker 3", color: "#00D4FF" },
    { id: "SPEAKER_04", name: "Speaker 4", color: "#EAB308" },
  ]);

  // Sync props utterances
  useEffect(() => {
    if (utterances && utterances.length > 0) {
      setItems(utterances);
    } else {
      // Default dummy items if empty for CapCut preview
      setItems([
        {
          id: "sub_1",
          text: "Welcome to CapCut Subtitle Studio.",
          startTime: 1.0,
          endTime: 4.0,
          speakerId: "SPEAKER_01",
          speakerColor: "#FF4081",
        },
        {
          id: "sub_2",
          text: "Editing is seamless.",
          startTime: 4.2,
          endTime: 7.5,
          speakerId: "SPEAKER_02",
          speakerColor: "#A855F7",
        },
        {
          id: "sub_3",
          text: "AI Auto Caption & Word-level Forced Alignment.",
          startTime: 7.8,
          endTime: 12.0,
          speakerId: "SPEAKER_03",
          speakerColor: "#00D4FF",
        },
      ]);
    }
  }, [utterances]);

  const updateItems = useCallback(
    (newItems: UtteranceItem[]) => {
      setItems(newItems);
      if (onUtterancesChange) onUtterancesChange(newItems);
    },
    [onUtterancesChange]
  );

  // 1. Fetch Waveform API
  useEffect(() => {
    if (!videoPath) return;

    fetch("/api/waveform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioPath: videoPath, pointsPerSecond: 100 }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.peaks_max && data.peaks_max.length > 0) {
          setWaveformPeaks(data.peaks_max);
          if (showToast) showToast("✓ Đã nạp Waveform âm thanh thực tế!", "success");
        }
      })
      .catch((err) => console.error("Waveform API error:", err));
  }, [videoPath, showToast]);

  // 2. Render 60fps Real Audio Waveform Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Track Background
    ctx.fillStyle = "#101924";
    ctx.fillRect(0, 0, width, height);

    // Waveform Bars (CapCut Cyan Waveform)
    ctx.fillStyle = "#00D4FF";
    const barWidth = 2;
    const gap = 1;
    const midY = height / 2;

    const peaks =
      waveformPeaks.length > 0
        ? waveformPeaks
        : Array.from({ length: 400 }, () => Math.random() * 0.8 + 0.1);

    for (let i = 0; i < peaks.length; i++) {
      const x = i * (barWidth + gap);
      if (x > width) break;
      const peak = peaks[i] * (height / 2 - 4);
      ctx.fillRect(x, midY - peak, barWidth, Math.max(2, peak * 2));
    }

    // White Playhead Vertical Line
    const playheadX = currentTimeSec * zoomPxPerSec;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Playhead Knob
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 8);
    ctx.closePath();
    ctx.fill();
  }, [waveformPeaks, currentTimeSec, zoomPxPerSec]);

  // 3. Playback Toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleStepFrame = useCallback(
    (deltaSec: number) => {
      if (!videoRef.current) return;
      const newTime = Math.max(0, Math.min(durationSec, currentTimeSec + deltaSec));
      videoRef.current.currentTime = newTime;
      setCurrentTimeSec(newTime);
    },
    [currentTimeSec, durationSec]
  );

  // 4. Split Subtitle (S key)
  const handleSplit = useCallback(() => {
    if (!selectedId) {
      if (showToast) showToast("Vui lòng chọn câu phụ đề để cắt!", "warning");
      return;
    }
    const updated = TimelineEngine.splitUtteranceAtTime(items, selectedId, currentTimeSec);
    updateItems(updated);
    if (showToast) showToast("✓ Đã cắt câu phụ đề tại vạch Playhead (Phím S)!", "info");
  }, [items, selectedId, currentTimeSec, updateItems, showToast]);

  // 5. Delete Subtitle (Delete key)
  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    const updated = items.filter((it) => it.id !== selectedId);
    updateItems(updated);
    setSelectedId(null);
    if (showToast) showToast("✓ Đã xóa câu phụ đề chọn!", "info");
  }, [items, selectedId, updateItems, showToast]);

  // 6. Speaker Diarization (/api/diarize)
  const handleDiarize = useCallback(async () => {
    if (!videoPath || items.length === 0) return;

    setIsDiarizing(true);
    try {
      const res = await fetch("/api/diarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioPath: videoPath, utterances: items }),
      });
      const data = await res.json();
      if (data.utterances) {
        updateItems(data.utterances);
        if (showToast) showToast("✓ Phân biệt Người nói thành công!", "success");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Lỗi phân biệt người nói!", "error");
    } finally {
      setIsDiarizing(false);
    }
  }, [videoPath, items, updateItems, showToast]);

  // 7. HardSub Export MP4 (/api/export/video)
  const handleExportHardSub = useCallback(async () => {
    if (!videoPath || items.length === 0) return;

    setIsExportingHardSub(true);
    if (showToast) showToast("Đang render nhúng phụ đề cứng (HardSub MP4) qua FFmpeg...", "info");

    try {
      const res = await fetch("/api/export/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPath,
          utterances: items,
          preset: selectedPreset,
          customStyle: {
            fontName: fontFamily,
            fontSize,
            primaryColor,
            secondaryColor,
            outlineColor,
          },
        }),
      });
      const data = await res.json();
      if (data.output_mp4) {
        if (showToast) showToast(`✓ Render HardSub MP4 thành công! File: ${data.output_mp4}`, "success");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Lỗi render HardSub Video!", "error");
    } finally {
      setIsExportingHardSub(false);
    }
  }, [videoPath, items, selectedPreset, fontFamily, fontSize, primaryColor, secondaryColor, outlineColor, showToast]);

  // 8. Shortcuts Registration
  useEffect(() => {
    ShortcutManager.register("PLAY_PAUSE", togglePlay);
    ShortcutManager.register("SPLIT_SUBTITLE", handleSplit);
    ShortcutManager.register("DELETE_SUBTITLE", handleDelete);

    const onKeyDown = (e: KeyboardEvent) => {
      ShortcutManager.handleKeyDown(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      ShortcutManager.unregister("PLAY_PAUSE");
      ShortcutManager.unregister("SPLIT_SUBTITLE");
      ShortcutManager.unregister("DELETE_SUBTITLE");
    };
  }, [togglePlay, handleSplit, handleDelete]);

  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#121214",
        color: "#FFFFFF",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 99999,
      }}
    >
      {/* ─── 1. TOP CAPCUT APP HEADER ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: "44px",
          backgroundColor: "#17191D",
          borderBottom: "1px solid #2D3038",
          flexShrink: 0,
        }}
      >
        {/* CapCut Brand & File Menus */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, fontSize: "14px", color: "#3B82F6" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: "linear-gradient(135deg, #3B82F6, #00D4FF)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontWeight: 900, fontSize: "12px" }}>
              C
            </div>
            <span style={{ color: "#FFFFFF", fontWeight: 800, letterSpacing: "-0.01em" }}>CapCut Subtitle Studio</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "#9CA3AF" }}>
            <span style={{ cursor: "pointer" }}>File</span>
            <span style={{ cursor: "pointer" }}>Edit</span>
            <span style={{ cursor: "pointer" }}>View</span>
            <span style={{ cursor: "pointer" }}>Tools</span>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleDiarize}
            disabled={isDiarizing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              background: "rgba(168,85,247,0.2)",
              color: "#E9D5FF",
              border: "1px solid rgba(168,85,247,0.4)",
              cursor: "pointer",
            }}
          >
            <UserCheck style={{ width: 14, height: 14 }} />
            <span>{isDiarizing ? "Đang xử lý..." : "Phân biệt Người nói"}</span>
          </button>

          <button
            onClick={handleExportHardSub}
            disabled={isExportingHardSub}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 16px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 700,
              background: "#3B82F6",
              color: "#FFFFFF",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(59,130,246,0.4)",
            }}
          >
            <Download style={{ width: 14, height: 14 }} />
            <span>{isExportingHardSub ? "Đang Render..." : "Export MP4"}</span>
          </button>
        </div>
      </div>

      {/* ─── 2. MIDDLE REGION: LEFT PANEL + CENTER PREVIEW + RIGHT INSPECTOR ─── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        
        {/* A. LEFT SIDEBAR TOOLBAR (CapCut Icon Navigation) */}
        <div
          style={{
            width: "56px",
            backgroundColor: "#17191D",
            borderRight: "1px solid #2D3038",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: "12px",
            gap: "16px",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveLeftTab("captions")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: activeLeftTab === "captions" ? "#3B82F6" : "transparent",
              color: activeLeftTab === "captions" ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              cursor: "pointer",
            }}
            title="Phụ đề & Auto Captions"
          >
            <FileText style={{ width: 18, height: 18 }} />
          </button>

          <button
            onClick={() => setActiveLeftTab("text")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: activeLeftTab === "text" ? "#3B82F6" : "transparent",
              color: activeLeftTab === "text" ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              cursor: "pointer",
            }}
            title="Văn bản (Text)"
          >
            <Type style={{ width: 18, height: 18 }} />
          </button>

          <button
            onClick={() => setActiveLeftTab("media")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: activeLeftTab === "media" ? "#3B82F6" : "transparent",
              color: activeLeftTab === "media" ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              cursor: "pointer",
            }}
            title="Media Thư viện"
          >
            <Folder style={{ width: 18, height: 18 }} />
          </button>

          <button
            onClick={() => setActiveLeftTab("stickers")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: activeLeftTab === "stickers" ? "#3B82F6" : "transparent",
              color: activeLeftTab === "stickers" ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              cursor: "pointer",
            }}
            title="Nhãn dán Stickers"
          >
            <Sticker style={{ width: 18, height: 18 }} />
          </button>

          <button
            onClick={() => setActiveLeftTab("effects")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: activeLeftTab === "effects" ? "#3B82F6" : "transparent",
              color: activeLeftTab === "effects" ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              cursor: "pointer",
            }}
            title="Hiệu ứng Subtitle"
          >
            <Wand2 style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* B. LEFT SUB-PANEL (CAPTION CARDS & SPEAKER PALETTE) */}
        <div
          style={{
            width: "240px",
            backgroundColor: "#1D2025",
            borderRight: "1px solid #2D3038",
            display: "flex",
            flexDirection: "column",
            padding: "12px",
            gap: "12px",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#E5E7EB", borderBottom: "1px solid #2D3038", paddingBottom: "8px" }}>
            Captions & Speaker Palette
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ background: "#252830", borderRadius: "8px", border: "1px solid #3B82F6", padding: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <Plus style={{ width: 18, height: 18, color: "#3B82F6" }} />
              <span style={{ fontSize: "11px", color: "#FFF", fontWeight: 600 }}>Thêm Subtitle</span>
            </div>

            <div style={{ background: "#252830", borderRadius: "8px", border: "1px solid #2D3038", padding: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <UserCheck style={{ width: 18, height: 18, color: "#A855F7" }} />
              <span style={{ fontSize: "11px", color: "#FFF", fontWeight: 600 }}>Speakers</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
            {items.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: item.id === selectedId ? "rgba(59,130,246,0.2)" : "#17191D",
                  border: item.id === selectedId ? "1px solid #3B82F6" : "1px solid #2D3038",
                  cursor: "pointer",
                  fontSize: "11px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: item.speakerColor || "#3B82F6", fontWeight: 700 }}>
                    {item.speakerId || `Speaker ${idx + 1}`}
                  </span>
                  <span style={{ color: "#6B7280", fontFamily: "monospace" }}>
                    {item.startTime.toFixed(1)}s
                  </span>
                </div>
                <div style={{ color: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* C. CENTER VIDEO PREVIEW PLAYER (CAPCUT CENTER STAGE) */}
        <div style={{ flex: 1, backgroundColor: "#111315", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "relative",
              maxWidth: "100%",
              maxHeight: "80%",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid #2D3038",
              backgroundColor: "#000000",
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
            }}
          >
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                style={{ maxHeight: "52vh", objectFit: "contain", display: "block" }}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTimeSec(videoRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setDurationSec(videoRef.current.duration);
                }}
              />
            ) : (
              <div style={{ width: "640px", height: "360px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", background: "#0D0E10" }}>
                <Film style={{ width: 48, height: 48, strokeWidth: 1, color: "#4B5563" }} />
                <span style={{ fontSize: "13px", color: "#9CA3AF" }}>Preview Video (CapCut Studio Stage)</span>
              </div>
            )}

            {/* REAL-TIME OVERLAY SUBTITLE PREVIEW */}
            {items.map((item) => {
              if (currentTimeSec >= item.startTime && currentTimeSec <= item.endTime) {
                return (
                  <div
                    key={item.id}
                    style={{
                      position: "absolute",
                      bottom: "36px",
                      left: 0,
                      right: 0,
                      textAlign: "center",
                      fontWeight: 800,
                      padding: "0 24px",
                      fontFamily,
                      fontSize: `${fontSize * 0.75}px`,
                      color: primaryColor,
                      WebkitTextStroke: `${outlineWidth}px ${outlineColor}`,
                      textShadow: `0 2px 4px ${shadowColor}`,
                      pointerEvents: "none",
                    }}
                  >
                    {item.text}
                  </div>
                );
              }
              return null;
            })}
          </div>

          {/* CAPCUT VIDEO PLAYER CONTROL BAR */}
          <div
            style={{
              marginTop: "14px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "6px 20px",
              borderRadius: "999px",
              backgroundColor: "#17191D",
              border: "1px solid #2D3038",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              fontSize: "12px",
            }}
          >
            <button onClick={() => handleStepFrame(-0.1)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer" }}>
              <SkipBack style={{ width: 14, height: 14 }} />
            </button>

            <button
              onClick={togglePlay}
              style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#3B82F6", color: "#FFF", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              {isPlaying ? <Pause style={{ width: 14, height: 14 }} /> : <Play style={{ width: 14, height: 14, marginLeft: "2px" }} />}
            </button>

            <button onClick={() => handleStepFrame(0.1)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer" }}>
              <SkipForward style={{ width: 14, height: 14 }} />
            </button>

            <span style={{ fontFamily: "monospace", color: "#00D4FF", fontWeight: 700, fontSize: "13px" }}>
              {formatTimecode(currentTimeSec)}
            </span>

            <div style={{ height: "12px", width: "1px", background: "#2D3038" }} />

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Volume2 style={{ width: 14, height: 14, color: "#9CA3AF" }} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (videoRef.current) videoRef.current.volume = val;
                }}
                style={{ width: "60px", accentColor: "#3B82F6", cursor: "pointer" }}
              />
            </div>
          </div>
        </div>

        {/* D. RIGHT INSPECTOR PANEL (FONT SETTINGS, ANIMATION, PRESETS) */}
        <div
          style={{
            width: "320px",
            backgroundColor: "#17191D",
            borderLeft: "1px solid #2D3038",
            display: "flex",
            flexDirection: "column",
            padding: "16px",
            gap: "14px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #2D3038", paddingBottom: "8px" }}>
            <span style={{ fontWeight: 800, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#E5E7EB" }}>
              Font Settings & Inspector
            </span>
          </div>

          {/* INSPECTOR TABS */}
          <div style={{ display: "flex", background: "#111315", padding: "3px", borderRadius: "8px", border: "1px solid #2D3038", fontSize: "11px" }}>
            <button
              onClick={() => setActiveRightTab("text")}
              style={{ flex: 1, padding: "5px 0", borderRadius: "6px", border: "none", background: activeRightTab === "text" ? "#3B82F6" : "transparent", color: activeRightTab === "text" ? "#FFF" : "#9CA3AF", fontWeight: 700, cursor: "pointer" }}
            >
              Style Presets
            </button>
            <button
              onClick={() => setActiveRightTab("font")}
              style={{ flex: 1, padding: "5px 0", borderRadius: "6px", border: "none", background: activeRightTab === "font" ? "#3B82F6" : "transparent", color: activeRightTab === "font" ? "#FFF" : "#9CA3AF", fontWeight: 700, cursor: "pointer" }}
            >
              Font Chữ
            </button>
            <button
              onClick={() => setActiveRightTab("animation")}
              style={{ flex: 1, padding: "5px 0", borderRadius: "6px", border: "none", background: activeRightTab === "animation" ? "#3B82F6" : "transparent", color: activeRightTab === "animation" ? "#FFF" : "#9CA3AF", fontWeight: 700, cursor: "pointer" }}
            >
              Animation
            </button>
          </div>

          {/* TAB 1: PRESETS */}
          {activeRightTab === "text" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
              <div>
                <label style={{ color: "#9CA3AF", fontWeight: 600, display: "block", marginBottom: "6px" }}>CapCut Preset Style</label>
                <select
                  value={selectedPreset}
                  onChange={(e) => setSelectedPreset(e.target.value)}
                  style={{ width: "100%", background: "#111315", border: "1px solid #2D3038", borderRadius: "8px", padding: "8px 10px", color: "#FFF", fontSize: "12px", cursor: "pointer" }}
                >
                  <option value="capcut_default">CapCut Default (Trắng / Karaoke Vàng)</option>
                  <option value="tiktok">TikTok Yellow (Impact Chữ Nổi)</option>
                  <option value="netflix">Netflix Style (Viền Đen Đổ Bóng)</option>
                  <option value="youtube">YouTube CC (Nền Hộp Đen)</option>
                  <option value="movie">Movie Cinematic (Chữ Nghiêng)</option>
                  <option value="anime">Anime Fancy (Nổi Bật Hồng)</option>
                </select>
              </div>

              {/* SPEAKER LEGEND */}
              <div style={{ borderTop: "1px solid #2D3038", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ color: "#9CA3AF", fontWeight: 600 }}>Speaker Color Palette</label>
                {speakers.map((spk) => (
                  <div key={spk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "6px", background: "#111315", border: "1px solid #2D3038" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: spk.color }} />
                      <span style={{ fontWeight: 600, color: "#E5E7EB" }}>{spk.name}</span>
                    </div>
                    <span style={{ fontSize: "10px", color: "#6B7280", fontFamily: "monospace" }}>{spk.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: DETAILED FONT CONTROLS */}
          {activeRightTab === "font" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "11px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ color: "#9CA3AF" }}>Font Family</label>
                  <input
                    type="text"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    style={{ width: "100%", marginTop: "4px", background: "#111315", border: "1px solid #2D3038", borderRadius: "6px", padding: "6px 8px", color: "#FFF" }}
                  />
                </div>
                <div>
                  <label style={{ color: "#9CA3AF" }}>Font Size (px)</label>
                  <input
                    type="number"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    style={{ width: "100%", marginTop: "4px", background: "#111315", border: "1px solid #2D3038", borderRadius: "6px", padding: "6px 8px", color: "#FFF" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                <div>
                  <label style={{ color: "#9CA3AF" }}>Color</label>
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: "100%", height: "28px", background: "none", border: "none", cursor: "pointer" }} />
                </div>
                <div>
                  <label style={{ color: "#9CA3AF" }}>Karaoke</label>
                  <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} style={{ width: "100%", height: "28px", background: "none", border: "none", cursor: "pointer" }} />
                </div>
                <div>
                  <label style={{ color: "#9CA3AF" }}>Outline</label>
                  <input type="color" value={outlineColor} onChange={(e) => setOutlineColor(e.target.value)} style={{ width: "100%", height: "28px", background: "none", border: "none", cursor: "pointer" }} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ANIMATIONS */}
          {activeRightTab === "animation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "11px" }}>
              <label style={{ color: "#9CA3AF", fontWeight: 600 }}>Animation Presets</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {["Fade In", "Typewriter", "Bounce", "Slide Up", "Blur", "Pop"].map((anim) => (
                  <div
                    key={anim}
                    onClick={() => setSelectedAnimation(anim)}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      background: selectedAnimation === anim ? "rgba(59,130,246,0.2)" : "#111315",
                      border: selectedAnimation === anim ? "1px solid #3B82F6" : "1px solid #2D3038",
                      color: selectedAnimation === anim ? "#60A5FA" : "#9CA3AF",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    ✨ {anim}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── 3. BOTTOM MULTI-TRACK INTERACTIVE TIMELINE & AUDIO WAVEFORM ────── */}
      <div
        style={{
          height: "280px",
          backgroundColor: "#17191D",
          borderTop: "1px solid #2D3038",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* TIMELINE TOOLBAR */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", backgroundColor: "#1D2025", borderBottom: "1px solid #2D3038", fontSize: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={handleSplit}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", background: "#111315", border: "1px solid #2D3038", color: "#FFF", fontSize: "11px", cursor: "pointer" }}
              title="Cắt câu phụ đề tại vạch Playhead (Phím S)"
            >
              <Scissors style={{ width: 12, height: 12, color: "#3B82F6" }} />
              <span>Split (S)</span>
            </button>

            <button
              onClick={handleDelete}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", background: "#111315", border: "1px solid #2D3038", color: "#FFF", fontSize: "11px", cursor: "pointer" }}
              title="Xóa câu phụ đề chọn (Phím Delete)"
            >
              <Trash2 style={{ width: 12, height: 12, color: "#EF4444" }} />
              <span>Delete</span>
            </button>

            <span style={{ fontFamily: "monospace", color: "#9CA3AF" }}>
              Timecode: <span style={{ color: "#00D4FF", fontWeight: 700 }}>00:00:06:38:24</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#9CA3AF" }}>Scale:</span>
            <input
              type="range"
              min="20"
              max="120"
              value={zoomPxPerSec}
              onChange={(e) => setZoomPxPerSec(Number(e.target.value))}
              style={{ width: "100px", accentColor: "#3B82F6", cursor: "pointer" }}
            />
          </div>
        </div>

        {/* TRACKS CONTAINER */}
        <div style={{ flex: 1, overflowX: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "6px", position: "relative" }}>
          
          {/* TRACK 1: SUBTITLE TRACK (PINK / PURPLE BLOCKS) */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "45px", fontSize: "10px", color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase" }}>Sub1</div>
            <div style={{ flex: 1, height: "32px", background: "#111315", borderRadius: "6px", border: "1px solid #2D3038", position: "relative", overflow: "hidden" }}>
              {items.map((item) => {
                const left = item.startTime * zoomPxPerSec;
                const width = Math.max(30, (item.endTime - item.startTime) * zoomPxPerSec);
                const isSelected = item.id === selectedId;
                const spkColor = item.speakerColor || "#FF4081";

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      position: "absolute",
                      top: "3px",
                      bottom: "3px",
                      left: `${left}px`,
                      width: `${width}px`,
                      backgroundColor: isSelected ? "#3B82F6" : spkColor,
                      borderRadius: "6px",
                      padding: "0 8px",
                      display: "flex",
                      alignItems: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#FFFFFF",
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      border: isSelected ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    {item.text}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 2: AUDIO WAVEFORM CANVAS TRACK */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "45px", fontSize: "10px", color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase" }}>Audio</div>
            <div style={{ flex: 1, height: "48px", borderRadius: "6px", border: "1px solid #2D3038", overflow: "hidden" }}>
              <canvas ref={canvasRef} width={2400} height={48} style={{ width: "100%", height: "100%", display: "block" }} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
