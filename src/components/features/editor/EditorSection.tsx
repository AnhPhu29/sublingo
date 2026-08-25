import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Scissors,
  Film,
  Upload,
  FileText,
  Undo,
  Redo,
  Save,
  Plus,
  X,
  Download,
  Play,
  Pause,
  Maximize,
  Search,
  Sliders,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Copy,
  Volume2,
  VolumeX,
  Folder,
  Music,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Globe,
  SlidersHorizontal,
  Type,
  Palette,
  Layers,
  Box,
  Shield,
  Eye,
} from "lucide-react";
import {
  SubtitleBlock,
  parseTimestampToMs,
  applyGlobalShift,
  applyTimeScale,
  rebuildSubtitle,
} from "@/lib/subtitle";
import { CapCutSubtitleStudio } from "./CapCutSubtitleStudio";

interface EditorSectionProps {
  editorBlocks: SubtitleBlock[];
  setEditorBlocks: React.Dispatch<React.SetStateAction<SubtitleBlock[]>>;
  editorUndoStack: SubtitleBlock[][];
  setEditorUndoStack: React.Dispatch<React.SetStateAction<SubtitleBlock[][]>>;
  editorVideoFile: File | null;
  setEditorVideoFile: (file: File | null) => void;
  editorVideoUrl: string;
  setEditorVideoUrl: (url: string) => void;
  editorActiveLineIdx: string | null;
  setEditorActiveLineIdx: (idx: string | null) => void;
  editorSrtFileName: string;
  setEditorSrtFileName: (name: string) => void;
  editorHasAdvancedEffects: boolean;
  setEditorHasAdvancedEffects: (val: boolean) => void;
  editorGlobalShiftVal: string;
  setEditorGlobalShiftVal: (val: string) => void;
  editorScaleVal: string;
  setEditorScaleVal: (val: string) => void;

  editorIsDragOverVideo: boolean;
  setEditorIsDragOverVideo: (val: boolean) => void;
  editorIsDragOverSrt: boolean;
  setEditorIsDragOverSrt: (val: boolean) => void;

  burnInFontSizeOption: string;
  setBurnInFontSizeOption: (val: string) => void;
  burnInPosition: string;
  setBurnInPosition: (val: string) => void;
  burnInColor: string;
  setBurnInColor: (val: string) => void;
  burnInLangCode: string;
  setBurnInLangCode: (val: string) => void;

  burnInJobId: string | null;
  setBurnInJobId: (val: string | null) => void;
  burnInJobStatus: string;
  setBurnInJobStatus: (val: string) => void;
  burnInJobLogs: string[];
  setBurnInJobLogs: React.Dispatch<React.SetStateAction<string[]>>;
  burnInJobError: string;
  setBurnInJobError: (val: string) => void;
  burnInProgressPercent: number;
  setBurnInProgressPercent: (val: number) => void;

  showToast: (msg: string, type?: string) => void;
}

export const EditorSection: React.FC<EditorSectionProps> = ({
  editorBlocks,
  setEditorBlocks,
  editorUndoStack,
  setEditorUndoStack,
  editorVideoFile,
  setEditorVideoFile,
  editorVideoUrl,
  setEditorVideoUrl,
  editorActiveLineIdx,
  setEditorActiveLineIdx,
  editorSrtFileName,
  setEditorSrtFileName,
  editorHasAdvancedEffects,
  setEditorHasAdvancedEffects,
  editorGlobalShiftVal,
  setEditorGlobalShiftVal,
  editorScaleVal,
  setEditorScaleVal,
  burnInFontSizeOption,
  setBurnInFontSizeOption,
  burnInPosition,
  setBurnInPosition,
  burnInColor,
  setBurnInColor,
  burnInLangCode,
  setBurnInLangCode,
  burnInJobId,
  setBurnInJobId,
  burnInJobStatus,
  setBurnInJobStatus,
  burnInJobLogs,
  setBurnInJobLogs,
  burnInJobError,
  setBurnInJobError,
  burnInProgressPercent,
  setBurnInProgressPercent,
  showToast,
}) => {
  const editorLogRef = useRef<HTMLDivElement>(null);
  const editorVideoRef = useRef<HTMLVideoElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);

  // Refs for timeupdate handler to avoid stale closures and unnecessary setState
  const editorBlocksRef = useRef<typeof editorBlocks>(editorBlocks);
  const editorActiveLineIdxRef = useRef<string | null>(editorActiveLineIdx);
  useEffect(() => { editorBlocksRef.current = editorBlocks; }, [editorBlocks]);
  useEffect(() => { editorActiveLineIdxRef.current = editorActiveLineIdx; }, [editorActiveLineIdx]);

  const [redoStack, setRedoStack] = useState<SubtitleBlock[][]>([]);
  const [subPos, setSubPos] = useState<{ x: number; y: number }>({
    x: 50,
    y: 85,
  });
  const [rotationDeg, setRotationDeg] = useState(0);
  const [textScale, setTextScale] = useState(100);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 50,
    originY: 85,
  });
  const [selectedLineIdx, setSelectedLineIdx] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Right Panel Tab State: 'list' | 'blur' | 'inspector'
  const [rightPanelTab, setRightPanelTab] = useState<"list" | "blur" | "inspector">("list");

  // Blur Mask States
  const [enableBlurMask, setEnableBlurMask] = useState(false);
  const [blurMaskPos, setBlurMaskPos] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 10,
    y: 80,
    w: 80,
    h: 14,
  });
  const [blurRadius, setBlurRadius] = useState(16);
  const [isDraggingMask, setIsDraggingMask] = useState(false);
  const [activeResizeHandle, setActiveResizeHandle] = useState<string | null>(null);

  const maskDragState = useRef<{
    dragging: boolean;
    handle: string | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
  }>({
    dragging: false,
    handle: null,
    startX: 0,
    startY: 0,
    originX: 10,
    originY: 80,
    originW: 80,
    originH: 14,
  });  // Inspector States (Subtitle Properties)
  const [fontFamily, setFontFamily] = useState("Inter");
  const [fontSizePx, setFontSizePx] = useState(24);
  const [fontWeight, setFontWeight] = useState("700");
  const [lineHeight, setLineHeight] = useState("1.4");
  const [letterSpacing, setLetterSpacing] = useState("0px");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">(
    "center",
  );

  const [fontColorHex, setFontColorHex] = useState("#FFFFFF");
  const [strokeOption, setStrokeOption] = useState("medium");
  const [strokeColorHex, setStrokeColorHex] = useState("#000000");
  const [bgColorHex, setBgColorHex] = useState("rgba(0,0,0,0.4)");
  const [opacityVal, setOpacityVal] = useState(100);

  const [borderWidth, setBorderWidth] = useState(0);
  const [borderRadius, setBorderRadius] = useState(8);

  const [shadowOption, setShadowOption] = useState("soft");
  const [shadowBlur, setShadowBlur] = useState(8);
  const [shadowOffset, setShadowOffset] = useState(2);
  const [shadowSpread, setShadowSpread] = useState(0);

  const [animationType, setAnimationType] = useState("fadeIn");
  const [safeArea, setSafeArea] = useState(true);
  const [layerZIndex, setLayerZIndex] = useState(25);
  const [anchorPos, setAnchorPos] = useState("bottom-center");

  // Resizable vertical divider (Video Preview vs Subtitle List)
  const [videoPreviewPct, setVideoPreviewPct] = useState(42);
  const [isVertDividerHover, setIsVertDividerHover] = useState(false);
  const isDraggingVertDivider = useRef(false);

  // Resizable horizontal divider (Top Workspace vs Bottom Inspector)
  const [bottomInspectorHeight, setBottomInspectorHeight] = useState(220);
  const [isHorizDividerHover, setIsHorizDividerHover] = useState(false);
  const isDraggingHorizDivider = useRef(false);

  // Accordion Section Toggles
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    position: true,
    typography: true,
    colors: true,
    outline: true,
    shadow: true,
    animation: true,
    advanced: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Drag Vertical Divider Handler (Left/Right)
  const handleVertDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingVertDivider.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingVertDivider.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const leftWidth = 260; // left panel fixed width ~260px
      const totalWidth = rect.width - leftWidth;
      const relativeLeft = me.clientX - rect.left - leftWidth;
      const pct = (relativeLeft / totalWidth) * 100;
      setVideoPreviewPct(Math.min(65, Math.max(25, pct)));
    };
    const onMouseUp = () => {
      isDraggingVertDivider.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Drag Horizontal Divider Handler (Up/Down)
  const handleHorizDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHorizDivider.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const startY = e.clientY;
    const startHeight = bottomInspectorHeight;

    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingHorizDivider.current) return;
      const deltaY = startY - me.clientY; // dragging up increases inspector height
      const newHeight = Math.min(400, Math.max(140, startHeight + deltaY));
      setBottomInspectorHeight(newHeight);
    };

    const onMouseUp = () => {
      isDraggingHorizDivider.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const togglePlayPause = () => {
    if (!editorVideoRef.current) return;
    if (editorVideoRef.current.paused) {
      editorVideoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      editorVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!editorVideoRef.current) return;
    const newMuted = !isMuted;
    editorVideoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    if (editorVideoRef.current) {
      editorVideoRef.current.volume = v;
      editorVideoRef.current.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (editorVideoRef.current) {
      editorVideoRef.current.playbackRate = rate;
    }
  };

  const formatSecondsStr = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "00:00:00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const f = Math.floor((sec % 1) * 30);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (editorLogRef.current) {
      editorLogRef.current.scrollTop = editorLogRef.current.scrollHeight;
    }
  }, [burnInJobLogs]);

  useEffect(() => {
    if (
      burnInJobId &&
      (burnInJobStatus === "queued" || burnInJobStatus === "processing")
    ) {
      const poll = setInterval(async () => {
        try {
          const r = await fetch(`/api/jobs/${burnInJobId}`);
          const d = await r.json();
          if (d.success && d.data) {
            setBurnInJobStatus(d.data.status);
            setBurnInJobLogs(
              Array.isArray(d.data.progressLog) ? d.data.progressLog : [],
            );
            setBurnInProgressPercent(d.data.progressPercent || 0);

            if (d.data.status === "done" || d.data.status === "error") {
              clearInterval(poll);
              if (d.data.status === "error")
                setBurnInJobError(d.data.errorMessage || "Unknown error");
            }
          }
        } catch {
          /* ignore */
        }
      }, 2000);
      return () => clearInterval(poll);
    }
  }, [burnInJobId, burnInJobStatus]);

  const pushUndoState = (currentBlocks: SubtitleBlock[]) => {
    setEditorUndoStack((prev) => {
      const nextStack = [...prev, JSON.parse(JSON.stringify(currentBlocks))];
      if (nextStack.length > 20) nextStack.shift();
      return nextStack;
    });
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (editorUndoStack.length === 0) return;
    const prevBlocks = editorUndoStack[editorUndoStack.length - 1];
    setRedoStack((prev) => [...prev, JSON.parse(JSON.stringify(editorBlocks))]);
    setEditorUndoStack((prev) => prev.slice(0, -1));
    setEditorBlocks(prevBlocks);
    showToast("Hoàn tác thành công (Undo)", "success");
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextBlocks = redoStack[redoStack.length - 1];
    setEditorUndoStack((prev) => [
      ...prev,
      JSON.parse(JSON.stringify(editorBlocks)),
    ]);
    setRedoStack((prev) => prev.slice(0, -1));
    setEditorBlocks(nextBlocks);
    showToast("Làm lại thành công (Redo)", "success");
  };

  const handleSrtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditorSrtFileName(file.name);
    const text = await file.text();

    const { isAssFormat, parseAss, parseSubtitle } =
      await import("@/lib/subtitle");
    if (isAssFormat(text)) {
      const assRes = parseAss(text);
      setEditorBlocks(assRes.blocks);
      setEditorHasAdvancedEffects(assRes.hasAdvancedEffects);
      showToast("Đã tải file phụ đề ASS", "success");
    } else {
      const parsed = parseSubtitle(text);
      setEditorBlocks(parsed);
      setEditorHasAdvancedEffects(false);
      showToast("Đã tải file phụ đề SRT", "success");
    }
    setEditorUndoStack([]);
    setRedoStack([]);
  };

  const handleEditorVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditorVideoFile(file);
    setEditorVideoUrl(URL.createObjectURL(file));
    showToast("Đã tải file Video", "success");
  };

  const updateBlock = (
    index: number,
    field: "timestamp" | "text" | "start" | "end",
    value: string,
  ) => {
    pushUndoState(editorBlocks);
    setEditorBlocks((prev) => {
      const next = [...prev];
      if (field === "start" || field === "end") {
        const parts = next[index].timestamp.split("-->");
        let startStr = parts[0]?.trim() || "00:00:00,000";
        let endStr = parts[1]?.trim() || "00:00:02,000";
        if (field === "start") startStr = value;
        if (field === "end") endStr = value;
        next[index] = {
          ...next[index],
          timestamp: `${startStr} --> ${endStr}`,
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const addLine = (index: number) => {
    pushUndoState(editorBlocks);
    setEditorBlocks((prev) => {
      const next = [...prev];
      let newTs = "00:00:00,000 --> 00:00:01,000";
      if (next[index]) {
        const parts = next[index].timestamp.split("-->");
        if (parts.length === 2) {
          const startStr = parts[1].trim();
          newTs = `${startStr} --> ${startStr}`;
        }
      }
      next.splice(index + 1, 0, {
        idx: String(next.length + 1),
        timestamp: newTs,
        text: "Dòng phụ đề mới",
      });
      return next.map((b, i) => ({ ...b, idx: String(i + 1) }));
    });
  };

  const duplicateLine = (index: number) => {
    pushUndoState(editorBlocks);
    setEditorBlocks((prev) => {
      const next = [...prev];
      const target = next[index];
      if (!target) return next;
      next.splice(index + 1, 0, {
        ...target,
        idx: String(next.length + 1),
      });
      return next.map((b, i) => ({ ...b, idx: String(i + 1) }));
    });
    showToast("Đã nhân bản dòng phụ đề", "info");
  };

  const splitLine = (index: number) => {
    pushUndoState(editorBlocks);
    const target = editorBlocks[index];
    if (!target) return;
    const parts = target.timestamp.split("-->");
    const startMs = parseTimestampToMs(parts[0]?.trim() || "00:00:00,000");
    const endMs = parseTimestampToMs(parts[1]?.trim() || "00:00:02,000");
    const midMs = Math.round((startMs + endMs) / 2);

    const msToTs = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const rem = ms % 1000;
      const pad = (n: number, len = 2) => String(n).padStart(len, "0");
      return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
    };

    const textWords = target.text.split(" ");
    const halfLen = Math.max(1, Math.ceil(textWords.length / 2));
    const text1 = textWords.slice(0, halfLen).join(" ") || target.text;
    const text2 = textWords.slice(halfLen).join(" ") || "...";

    setEditorBlocks((prev) => {
      const next = [...prev];
      next[index] = {
        ...target,
        timestamp: `${parts[0]?.trim()} --> ${msToTs(midMs)}`,
        text: text1,
      };
      next.splice(index + 1, 0, {
        idx: String(next.length + 1),
        timestamp: `${msToTs(midMs)} --> ${parts[1]?.trim()}`,
        text: text2,
      });
      return next.map((b, i) => ({ ...b, idx: String(i + 1) }));
    });
    showToast("✂️ Đã tách câu phụ đề thành 2 đoạn!", "success");
  };

  const mergeLine = (index: number) => {
    if (index >= editorBlocks.length - 1) {
      showToast("Không có câu kế tiếp để gộp!", "warning");
      return;
    }
    pushUndoState(editorBlocks);
    const current = editorBlocks[index];
    const nextLine = editorBlocks[index + 1];
    const startTs = current.timestamp.split("-->")[0]?.trim();
    const endTs = nextLine.timestamp.split("-->")[1]?.trim();

    setEditorBlocks((prev) => {
      const next = [...prev];
      next[index] = {
        ...current,
        timestamp: `${startTs} --> ${endTs}`,
        text: `${current.text} ${nextLine.text}`,
      };
      next.splice(index + 1, 1);
      return next.map((b, i) => ({ ...b, idx: String(i + 1) }));
    });
    showToast("🔗 Đã gộp 2 câu phụ đề!", "success");
  };

  const removeLine = (index: number) => {
    pushUndoState(editorBlocks);
    setEditorBlocks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((b, i) => ({ ...b, idx: String(i + 1) }));
    });
    showToast("Đã xóa dòng phụ đề", "info");
  };

  const handleGlobalShift = () => {
    const shiftMs = parseInt(editorGlobalShiftVal, 10);
    if (isNaN(shiftMs) || shiftMs === 0) {
      showToast("Vui lòng nhập ms hợp lệ (vd: 500 hoặc -500)", "error");
      return;
    }
    pushUndoState(editorBlocks);
    const shifted = applyGlobalShift(editorBlocks, shiftMs);
    setEditorBlocks(shifted);
    showToast(`Đã dịch thời gian ${shiftMs}ms`, "success");
  };

  const handleScale = () => {
    const factor = parseFloat(editorScaleVal);
    if (isNaN(factor) || factor <= 0) {
      showToast("Vui lòng nhập tỉ lệ hợp lệ (vd: 1.1 hoặc 0.9)", "error");
      return;
    }
    pushUndoState(editorBlocks);
    const scaled = applyTimeScale(editorBlocks, factor);
    setEditorBlocks(scaled);
    showToast(`Đã nhân tỉ lệ thời gian ${factor}x`, "success");
  };

  const exportFile = (format: "srt" | "vtt") => {
    if (editorBlocks.length === 0) return;
    const out = rebuildSubtitle(editorBlocks, format);
    const blob = new Blob([out], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `phude_dadiuchinh.${format}`;
    link.click();
    showToast(`Đã xuất file .${format.toUpperCase()}`, "success");
  };

  const startBurnInJob = async () => {
    if (editorBlocks.length === 0 || !editorVideoFile) {
      showToast("Vui lòng tải video và phụ đề trước", "error");
      return;
    }
    const subtitleContent = rebuildSubtitle(editorBlocks, "srt");
    const fd = new FormData();
    fd.append("video", editorVideoFile);
    fd.append("subtitleContent", subtitleContent);
    fd.append("enableBlurMask", String(enableBlurMask));
    fd.append("maskX", String(blurMaskPos.x));
    fd.append("maskY", String(blurMaskPos.y));
    fd.append("maskW", String(blurMaskPos.w));
    fd.append("maskH", String(blurMaskPos.h));
    fd.append("blurRadius", String(blurRadius));
    fd.append("posX", String(subPos.x));
    fd.append("posY", String(subPos.y));

    try {
      const res = await fetch("/api/burn-in", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setBurnInJobId(data.jobId);
        setBurnInJobStatus("queued");
        setBurnInJobLogs([]);
        setBurnInJobError("");
        setBurnInProgressPercent(0);
        showToast("🚀 Đang bắt đầu ghép phụ đề cứng vào MP4!", "success");
      } else {
        showToast(data.error || "Lỗi ghép phụ đề cứng", "error");
      }
    } catch {
    }
  };

  // Optimized: only setState when active line actually changes; uses refs to avoid stale closure
  const handleVideoTimeUpdate = useCallback(() => {
    if (!editorVideoRef.current || editorBlocksRef.current.length === 0) return;
    const currentTimeMs = Math.round(editorVideoRef.current.currentTime * 1000);
    setCurrentTimeSec(currentTimeMs / 1000);
    const active = editorBlocksRef.current.find((b) => {
      const parts = b.timestamp.split("-->");
      if (parts.length !== 2) return false;
      const start = parseTimestampToMs(parts[0]);
      const end = parseTimestampToMs(parts[1]);
      return currentTimeMs >= start && currentTimeMs <= end;
    });
    const nextIdx = active ? active.idx : null;
    if (nextIdx !== editorActiveLineIdxRef.current) {
      editorActiveLineIdxRef.current = nextIdx;
      setEditorActiveLineIdx(nextIdx);
      if (nextIdx !== null) {
        setTimeout(() => {
          activeLineRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }, 50);
      }
    }
  }, [setEditorActiveLineIdx]);

  const seekVideoTo = (tsString: string) => {
    const parts = tsString.split("-->");
    if (parts.length > 0 && editorVideoRef.current) {
      const ms = parseTimestampToMs(parts[0].trim());
      editorVideoRef.current.currentTime = ms / 1000;
      setCurrentTimeSec(ms / 1000);
    }
  };

  const onSubtitleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = subtitleContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setIsDraggingSub(true);
      dragState.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        originX: subPos.x,
        originY: subPos.y,
      };
      const onMouseMove = (me: MouseEvent) => {
        if (!dragState.current.dragging) return;
        const dx = ((me.clientX - dragState.current.startX) / rect.width) * 100;
        const dy = ((me.clientY - dragState.current.startY) / rect.height) * 100;
        const nx = Math.max(5, Math.min(95, dragState.current.originX + dx));
        const ny = Math.max(5, Math.min(95, dragState.current.originY + dy));
        setSubPos({ x: nx, y: ny });
      };
      const onMouseUp = () => {
        dragState.current.dragging = false;
        setIsDraggingSub(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [subPos],
  );

  const onBlurMaskMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, handle: string = "center") => {
      e.stopPropagation();
      const container = subtitleContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      setIsDraggingMask(true);
      setActiveResizeHandle(handle);

      maskDragState.current = {
        dragging: true,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        originX: blurMaskPos.x,
        originY: blurMaskPos.y,
        originW: blurMaskPos.w,
        originH: blurMaskPos.h,
      };

      const onMouseMove = (me: MouseEvent) => {
        if (!maskDragState.current.dragging) return;
        const dx = ((me.clientX - maskDragState.current.startX) / rect.width) * 100;
        const dy = ((me.clientY - maskDragState.current.startY) / rect.height) * 100;

        const h = maskDragState.current.handle;
        let nx = maskDragState.current.originX;
        let ny = maskDragState.current.originY;
        let nw = maskDragState.current.originW;
        let nh = maskDragState.current.originH;

        if (h === "center") {
          nx = Math.max(0, Math.min(100 - nw, maskDragState.current.originX + dx));
          ny = Math.max(0, Math.min(100 - nh, maskDragState.current.originY + dy));
        } else {
          if (h?.includes("l")) {
            const maxRight = maskDragState.current.originX + maskDragState.current.originW - 5;
            nx = Math.max(0, Math.min(maxRight, maskDragState.current.originX + dx));
            nw = maskDragState.current.originW + (maskDragState.current.originX - nx);
          }
          if (h?.includes("r")) {
            nw = Math.max(5, Math.min(100 - maskDragState.current.originX, maskDragState.current.originW + dx));
          }
          if (h?.includes("t")) {
            const maxBottom = maskDragState.current.originY + maskDragState.current.originH - 5;
            ny = Math.max(0, Math.min(maxBottom, maskDragState.current.originY + dy));
            nh = maskDragState.current.originH + (maskDragState.current.originY - ny);
          }
          if (h?.includes("b")) {
            nh = Math.max(5, Math.min(100 - maskDragState.current.originY, maskDragState.current.originH + dy));
          }
        }

        setBlurMaskPos({
          x: Math.round(nx * 10) / 10,
          y: Math.round(ny * 10) / 10,
          w: Math.round(nw * 10) / 10,
          h: Math.round(nh * 10) / 10,
        });
      };

      const onMouseUp = () => {
        maskDragState.current.dragging = false;
        setIsDraggingMask(false);
        setActiveResizeHandle(null);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [blurMaskPos],
  );

  const [useCapCutStudio, setUseCapCutStudio] = useState(true);

  if (useCapCutStudio) {
    const utterances = editorBlocks.map((b, i) => {
      const parts = b.timestamp.split("-->");
      const s = parts[0] ? parseTimestampToMs(parts[0]) / 1000 : i * 2;
      const e = parts[1] ? parseTimestampToMs(parts[1]) / 1000 : s + 2;
      return {
        id: b.idx || `sub_${i}`,
        text: b.text,
        startTime: s,
        endTime: e,
      };
    });

    return (
      <div className="flex flex-col w-full h-full">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-xs">
          <span className="text-pink-400 font-bold">✨ Trình Biên Tập Phụ Đề CapCut Pro (CapCut Desktop Mode)</span>
          <button
            onClick={() => setUseCapCutStudio(false)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
          >
            Chuyển sang Giao diện Cổ điển
          </button>
        </div>
        <CapCutSubtitleStudio
          videoUrl={editorVideoUrl}
          videoPath={editorVideoFile ? (editorVideoFile as any).path || editorVideoFile.name : ""}
          utterances={utterances}
          showToast={showToast}
        />
      </div>
    );
  }

  return (
    <section
      ref={outerContainerRef}
      style={{
        maxWidth: "100%",
        height: "calc(100vh - 100px)",
        maxHeight: "calc(100vh - 100px)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#FFFFFF",
        background: "#111315",
        boxSizing: "border-box",
        padding: "14px",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div className="flex items-center justify-end">
        <button
          onClick={() => setUseCapCutStudio(true)}
          className="px-3 py-1 rounded bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold"
        >
          ✨ Mở Trình Biên Tập CapCut Desktop Pro
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. TOP TOOLBAR (CapCut Desktop Dark Style - Fixed Height)                 */}
      {/* ========================================================================= */}
      <div
        style={{
          background: "#1D2025",
          border: "1px solid #313640",
          borderRadius: "12px",
          padding: "8px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          width: "100%",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        {/* Left: Project Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#3B82F6",
            }}
          >
            <Scissors size={15} />
          </div>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "#FFFFFF",
              whiteSpace: "nowrap",
            }}
          >
            {editorSrtFileName || editorVideoFile?.name || "Dự án Phụ đề mới"}
          </span>
          {editorBlocks.length > 0 && (
            <span
              style={{
                fontSize: "11px",
                background: "rgba(59,130,246,0.15)",
                color: "#3B82F6",
                padding: "2px 8px",
                borderRadius: "10px",
                fontWeight: 700,
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              {editorBlocks.length} dòng
            </span>
          )}
        </div>

        {/* Center: Undo & Redo */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={handleUndo}
            disabled={editorUndoStack.length === 0}
            style={{
              background: "#2A2E35",
              border: "1px solid #353B45",
              color: editorUndoStack.length > 0 ? "#FFFFFF" : "#7E8794",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: editorUndoStack.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "all 150ms ease",
            }}
          >
            <Undo size={13} /> Hoàn tác
          </button>

          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            style={{
              background: "#2A2E35",
              border: "1px solid #353B45",
              color: redoStack.length > 0 ? "#FFFFFF" : "#7E8794",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: redoStack.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "all 150ms ease",
            }}
          >
            <Redo size={13} /> Làm lại
          </button>
        </div>

        {/* Right: Save, Preview, Export SRT, Export MP4 */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => showToast("Đã lưu dự án!", "success")}
            style={{
              background: "#2A2E35",
              border: "1px solid #353B45",
              color: "#FFFFFF",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Save size={13} style={{ color: "#3B82F6" }} /> Lưu
          </button>

          <button
            onClick={togglePlayPause}
            style={{
              background: "#2A2E35",
              border: "1px solid #353B45",
              color: "#FFFFFF",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Play size={13} style={{ color: "#22C55E" }} /> Xem trước
          </button>

          <button
            onClick={() => exportFile("srt")}
            disabled={editorBlocks.length === 0}
            style={{
              background: "#2A2E35",
              border: "1px solid #353B45",
              color: editorBlocks.length > 0 ? "#FFFFFF" : "#7E8794",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: editorBlocks.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Download size={13} /> Xuất SRT
          </button>

          <button
            onClick={startBurnInJob}
            disabled={!editorVideoFile || editorBlocks.length === 0}
            style={{
              background:
                editorVideoFile && editorBlocks.length > 0
                  ? "#3B82F6"
                  : "#2A2E35",
              color:
                editorVideoFile && editorBlocks.length > 0
                  ? "#FFFFFF"
                  : "#7E8794",
              border: "none",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor:
                editorVideoFile && editorBlocks.length > 0
                  ? "pointer"
                  : "not-allowed",
              boxShadow:
                editorVideoFile && editorBlocks.length > 0
                  ? "0 4px 14px rgba(59,130,246,0.3)"
                  : "none",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "all 150ms ease",
            }}
          >
            <Film size={13} /> {burnInJobStatus === "processing" || burnInJobStatus === "queued" ? "Đang xuất video..." : "Xuất Video MP4"}
          </button>

          {burnInJobStatus === "done" && burnInJobId && (
            <a
              href={`/api/burn-in/download/${burnInJobId}`}
              download
              style={{
                background: "#10B981",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(16,185,129,0.4)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                textDecoration: "none",
                transition: "all 150ms ease",
              }}
              title="Tải video MP4 đã ghép phụ đề cứng và mặt nạ mờ về máy"
            >
              <Download size={13} /> Tải Video MP4 Đã Ghép
            </a>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TOP WORKSPACE (Fills remaining space, flex: 1, minHeight: 0)           */}
      {/* ========================================================================= */}
      <div
        ref={workspaceRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: "0",
          width: "100%",
          boxSizing: "border-box",
          alignItems: "stretch",
          background: "#17191D",
          borderRadius: "12px",
          padding: "10px",
          border: "1px solid #2A2E35",
          overflow: "hidden",
        }}
      >

        {/* --------------------------------------------------------------------- */}
        {/* COLUMN 1: LEFT PANEL (Project Explorer - Fixed Width ~260px)           */}
        {/* --------------------------------------------------------------------- */}
        <div
          style={{
            width: "260px",
            height: "100%",
            flexShrink: 0,
            background: "#1D2025",
            border: "1px solid #313640",
            borderRadius: "12px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "10px",
            boxSizing: "border-box",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                borderBottom: "1px solid #313640",
                paddingBottom: "6px",
              }}
            >
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Folder size={14} style={{ color: "#3B82F6" }} /> Tệp Dự án
              </h3>
            </div>

            {/* Video File Card */}
            <div
              style={{
                background: "#1F2329",
                border: "1px solid #353B45",
                borderRadius: "8px",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#3B82F6",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Film size={12} /> Video File
                </span>
                {editorVideoFile && (
                  <button
                    onClick={() => {
                      setEditorVideoFile(null);
                      setEditorVideoUrl("");
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#EF4444",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {editorVideoFile ? (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#B8BEC8",
                    background: "#17191D",
                    border: "1px solid #2A2E35",
                    padding: "5px 8px",
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#FFFFFF",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {editorVideoFile.name}
                  </div>
                  <div
                    style={{
                      color: "#7E8794",
                      fontSize: "10px",
                      marginTop: "2px",
                    }}
                  >
                    {(editorVideoFile.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#7E8794",
                    fontStyle: "italic",
                  }}
                >
                  Chưa nạp video
                </div>
              )}
            </div>

            {/* Subtitle File Card */}
            <div
              style={{
                background: "#1F2329",
                border: "1px solid #353B45",
                borderRadius: "8px",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#22C55E",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <FileText size={12} /> Subtitle File
                </span>
                {editorBlocks.length > 0 && (
                  <button
                    onClick={() => setEditorBlocks([])}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#EF4444",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {editorBlocks.length > 0 ? (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#B8BEC8",
                    background: "#17191D",
                    border: "1px solid #2A2E35",
                    padding: "5px 8px",
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#FFFFFF",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {editorSrtFileName || "phude.srt"}
                  </div>
                  <div
                    style={{
                      color: "#7E8794",
                      fontSize: "10px",
                      marginTop: "2px",
                    }}
                  >
                    {editorBlocks.length} dòng phụ đề
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#7E8794",
                    fontStyle: "italic",
                  }}
                >
                  Chưa nạp phụ đề
                </div>
              )}
            </div>

            {/* Audio Track Card */}
            <div
              style={{
                background: "#1F2329",
                border: "1px solid #353B45",
                borderRadius: "8px",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#F59E0B",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Music size={12} /> Audio Track
              </span>
              <div
                style={{
                  fontSize: "10px",
                  color: "#7E8794",
                  fontStyle: "italic",
                }}
              >
                Âm thanh gốc video
              </div>
            </div>

            {/* Assets & Fonts Card */}
            <div
              style={{
                background: "#1F2329",
                border: "1px solid #353B45",
                borderRadius: "8px",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#B8BEC8",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <ImageIcon size={12} style={{ color: "#3B82F6" }} /> Assets &
                Fonts
              </span>
              <div style={{ fontSize: "11px", color: "#B8BEC8" }}>
                {fontFamily} Font Active
              </div>
            </div>
          </div>

          {/* Import Media Button */}
          <button
            onClick={() =>
              document
                .getElementById("editor-file-import-btn-dark")
                ?.click()
            }
            style={{
              width: "100%",
              background: "#3B82F6",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: "0 4px 14px rgba(59,130,246,0.3)",
              transition: "all 150ms ease",
              marginTop: "auto",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#2563EB")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "#3B82F6")
            }
          >
            <Upload size={13} /> Nạp Tệp Media
          </button>
          <input
            id="editor-file-import-btn-dark"
            type="file"
            accept="video/*,.srt,.vtt,.ass"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              file.type.startsWith("video/")
                ? handleEditorVideoUpload(e)
                : handleSrtUpload(e);
            }}
          />
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* COLUMN 2: CENTER PANEL (Video Preview ~42% width - FIXED)             */}
        {/* --------------------------------------------------------------------- */}
        <div
          style={{
            width: `${videoPreviewPct}%`,
            height: "100%",
            flexShrink: 0,
            background: "#1D2025",
            border: "1px solid #313640",
            borderRadius: "12px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            boxSizing: "border-box",
            overflow: "hidden",
            marginLeft: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 700,
                margin: 0,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Film size={14} style={{ color: "#3B82F6" }} /> Xem trước Video
            </h3>
            {editorVideoFile && (
              <span
                style={{
                  fontSize: "10px",
                  background: "rgba(59,130,246,0.15)",
                  color: "#3B82F6",
                  padding: "1px 6px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  border: "1px solid rgba(59,130,246,0.3)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "130px",
                }}
              >
                {editorVideoFile.name}
              </span>
            )}
          </div>

          {/* Video Screen Container */}
          <div
            ref={subtitleContainerRef}
            style={{
              position: "relative",
              width: "100%",
              flex: 1,
              minHeight: 0,
              background: "#000000",
              borderRadius: "8px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              margin: "0 auto",
            }}
          >
            {editorVideoUrl ? (
              <video
                ref={editorVideoRef}
                src={
                  burnInJobStatus === "done"
                    ? `/api/burn-in/download/${burnInJobId}`
                    : editorVideoUrl
                }
                playsInline
                onTimeUpdate={handleVideoTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={() => {
                  if (editorVideoRef.current) {
                    setDurationSec(editorVideoRef.current.duration || 0);
                    setIsPlaying(!editorVideoRef.current.paused);
                  }
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  outline: "none",
                  transform: `scale(${zoomLevel / 100})`,
                  transition: "transform 200ms ease",
                }}
              />
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "#7E8794",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  document
                    .getElementById("editor-file-import-btn-dark")
                    ?.click()
                }
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "#17191D",
                    border: "1px solid #313640",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Film size={20} style={{ color: "#3B82F6" }} />
                </div>
                <div
                  style={{ fontSize: "13px", fontWeight: 700, color: "#FFFFFF" }}
                >
                  Chưa Nạp Video
                </div>
                <div style={{ fontSize: "11px", color: "#7E8794" }}>
                  Bấm để tải tệp video MP4/WebM
                </div>
              </div>
            )}
            {/* Blur Mask Layer (CapCut Style Resizable Box) */}
            {enableBlurMask && (
              (() => {
                const isBlurEditing = rightPanelTab === "blur" || isDraggingMask;
                return (
                  <div
                    onMouseDown={(e) => onBlurMaskMouseDown(e, "center")}
                    style={{
                      position: "absolute",
                      left: `${blurMaskPos.x}%`,
                      top: `${blurMaskPos.y}%`,
                      width: `${blurMaskPos.w}%`,
                      height: `${blurMaskPos.h}%`,
                      zIndex: isBlurEditing ? 25 : 15,
                      cursor: isBlurEditing ? (isDraggingMask ? "grabbing" : "grab") : "default",
                      userSelect: "none",
                      touchAction: "none",
                      border: isBlurEditing ? "2px dashed #F59E0B" : "1px dashed rgba(245, 158, 11, 0.3)",
                      borderRadius: "6px",
                      background: "rgba(0, 0, 0, 0.35)",
                      backdropFilter: `blur(${blurRadius}px)`,
                      WebkitBackdropFilter: `blur(${blurRadius}px)`,
                      boxShadow: isBlurEditing ? "0 0 12px rgba(245, 158, 11, 0.4)" : "none",
                      transition: isDraggingMask ? "none" : "all 150ms ease",
                    }}
                    title="Kéo thả để di chuyển hoặc kéo 4 góc để đổi kích thước vùng mờ phụ đề gốc"
                  >
                    {/* Badge Header - Only when editing Blur Mask */}
                    {isBlurEditing && (
                      <div
                        style={{
                          position: "absolute",
                          top: -22,
                          left: 0,
                          background: "#F59E0B",
                          color: "#000000",
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "1px 7px",
                          borderRadius: "4px",
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Eye size={11} />
                        Mặt Nạ Mờ (X:{blurMaskPos.x}% Y:{blurMaskPos.y}% W:{blurMaskPos.w}% H:{blurMaskPos.h}%)
                      </div>
                    )}

                    {/* 4 Corner Resize Handles - Only when editing Blur Mask */}
                    {isBlurEditing &&
                      [
                        { handle: "tl", style: { top: "-5px", left: "-5px", cursor: "nwse-resize" } },
                        { handle: "tr", style: { top: "-5px", right: "-5px", cursor: "nesw-resize" } },
                        { handle: "bl", style: { bottom: "-5px", left: "-5px", cursor: "nesw-resize" } },
                        { handle: "br", style: { bottom: "-5px", right: "-5px", cursor: "nwse-resize" } },
                      ].map((item) => (
                        <div
                          key={item.handle}
                          onMouseDown={(e) => onBlurMaskMouseDown(e, item.handle)}
                          style={{
                            position: "absolute",
                            width: "10px",
                            height: "10px",
                            background: "#F59E0B",
                            border: "2px solid #FFFFFF",
                            borderRadius: "2px",
                            zIndex: 30,
                            ...item.style,
                          }}
                        />
                      ))}
                  </div>
                );
              })()
            )}

            {/* Subtitle Overlay Element */}
            {editorBlocks.length > 0 &&
              (() => {
                const currentTimeMs = Math.round(currentTimeSec * 1000);
                const activeBlock = editorBlocks.find((b) => {
                  const parts = b.timestamp.split("-->");
                  if (parts.length !== 2) return false;
                  return (
                    currentTimeMs >= parseTimestampToMs(parts[0]) &&
                    currentTimeMs <= parseTimestampToMs(parts[1])
                  );
                });

                const displayBlock =
                  activeBlock ||
                  editorBlocks.find(
                    (b) => b.idx === (editorActiveLineIdx || selectedLineIdx)
                  ) ||
                  editorBlocks[0];

                if (!displayBlock) return null;

                const isSubEditing = rightPanelTab !== "blur" || isDraggingSub;

                const strokeCss =
                  strokeOption === "thin"
                    ? "1px #000"
                    : strokeOption === "medium"
                      ? "2px #000"
                      : strokeOption === "thick"
                        ? "3px #000"
                        : "none";
                const shadowCss =
                  shadowOption === "soft"
                    ? "0 2px 8px rgba(0,0,0,0.9)"
                    : shadowOption === "strong"
                      ? "0 4px 16px #000000"
                      : "none";

                return (
                  <div
                    onMouseDown={onSubtitleMouseDown}
                    style={{
                      position: "absolute",
                      left: `${subPos.x}%`,
                      top: `${subPos.y}%`,
                      transform: `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${textScale / 100})`,
                      zIndex: isSubEditing ? 26 : 20,
                      maxWidth: safeArea ? "80%" : "95%",
                      textAlign: textAlign,
                      cursor: isSubEditing ? (isDraggingSub ? "grabbing" : "grab") : "default",
                      userSelect: "none",
                      touchAction: "none",
                      border: isSubEditing
                        ? borderWidth > 0
                          ? `${borderWidth}px solid ${strokeColorHex}`
                          : "1.5px solid #00F0FF"
                        : "none",
                      borderRadius: `${borderRadius}px`,
                      padding: "4px 8px",
                      background: bgColorHex,
                      opacity: opacityVal / 100,
                      boxShadow: isSubEditing
                        ? shadowOption !== "none"
                          ? `${shadowOffset}px ${shadowOffset}px ${shadowBlur}px ${shadowSpread}px rgba(0,0,0,0.6), 0 0 8px rgba(0, 240, 255, 0.4)`
                          : "0 0 8px rgba(0, 240, 255, 0.4)"
                        : shadowOption !== "none"
                          ? `${shadowOffset}px ${shadowOffset}px ${shadowBlur}px ${shadowSpread}px rgba(0,0,0,0.6)`
                          : "none",
                      transition: isDraggingSub
                        ? "none"
                        : "box-shadow 200ms ease, border-color 200ms ease",
                    }}
                    title="Kéo thả phụ đề trên video để chỉnh vị trí"
                  >
                    {/* CapCut Position Badge - Shown only while dragging */}
                    {isDraggingSub && (
                      <div
                        style={{
                          position: "absolute",
                          top: -26,
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "rgba(10, 15, 26, 0.88)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                          border: "1px solid rgba(0, 240, 255, 0.5)",
                          color: "#00F0FF",
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "10px",
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
                        }}
                      >
                        📍 X:{Math.round(subPos.x)}% Y:{Math.round(subPos.y)}%
                      </div>
                    )}

                    {/* CapCut 4 Corner Control Dots */}
                    {isSubEditing &&
                      [
                        { top: "-4px", left: "-4px" },
                        { top: "-4px", right: "-4px" },
                        { bottom: "-4px", left: "-4px" },
                        { bottom: "-4px", right: "-4px" },
                      ].map((pos, i) => (
                        <div
                          key={i}
                          style={{
                            position: "absolute",
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: "#FFFFFF",
                            border: "1.5px solid #00F0FF",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                            pointerEvents: "none",
                            ...pos,
                          }}
                        />
                      ))}
                    <div
                      style={{
                        color: fontColorHex,
                        fontFamily: fontFamily,
                        fontSize: `${fontSizePx}px`,
                        fontWeight: fontWeight,
                        lineHeight: lineHeight,
                        letterSpacing: letterSpacing,
                        WebkitTextStroke: strokeCss,
                        textShadow: shadowCss,
                        wordBreak: "break-word",
                        pointerEvents: "none",
                      }}
                    >
                      {displayBlock.text}
                    </div>
                  </div>
                );
              })()}
          </div>

          {/* Under Video Controls: Scrubber, Play, Volume, Zoom */}
          <div
            style={{
              background: "#1F2329",
              border: "1px solid #353B45",
              borderRadius: "8px",
              padding: "6px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              flexShrink: 0,
            }}
          >
            {/* Scrubber */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="range"
                min={0}
                max={durationSec || 100}
                step={0.1}
                value={currentTimeSec}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setCurrentTimeSec(v);
                  if (editorVideoRef.current)
                    editorVideoRef.current.currentTime = v;
                }}
                style={{ flex: 1, accentColor: "#3B82F6", cursor: "pointer" }}
              />
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "monospace",
                  color: "#B8BEC8",
                  whiteSpace: "nowrap",
                }}
              >
                <strong style={{ color: "#FFFFFF" }}>
                  {formatSecondsStr(currentTimeSec)}
                </strong>{" "}
                / {formatSecondsStr(durationSec)}
              </span>
            </div>

            {/* Controls row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "4px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <button
                  onClick={togglePlayPause}
                  style={{
                    background: "#3B82F6",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "5px",
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}{" "}
                  {isPlaying ? "Tạm dừng" : "Phát"}
                </button>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#17191D",
                    padding: "2px 5px",
                    borderRadius: "4px",
                    border: "1px solid #2A2E35",
                  }}
                >
                  <button
                    onClick={toggleMute}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: isMuted ? "#EF4444" : "#B8BEC8",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                    }}
                  >
                    {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) =>
                      handleVolumeChange(parseFloat(e.target.value))
                    }
                    style={{
                      width: "40px",
                      accentColor: "#3B82F6",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>

              <div
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <select
                  value={playbackRate}
                  onChange={(e) =>
                    handlePlaybackRateChange(parseFloat(e.target.value))
                  }
                  style={{
                    background: "#17191D",
                    color: "#FFFFFF",
                    border: "1px solid #353B45",
                    borderRadius: "4px",
                    fontSize: "10px",
                    padding: "2px 4px",
                    outline: "none",
                    cursor: "pointer",
                  }}
                  title="Tốc độ phát"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1.0}>1.0x (Tự nhiên)</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>

                <select
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(parseInt(e.target.value))}
                  style={{
                    background: "#17191D",
                    color: "#3B82F6",
                    border: "1px solid #353B45",
                    borderRadius: "4px",
                    fontSize: "10px",
                    padding: "2px 4px",
                    outline: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <option value={100}>Fit</option>
                  <option value={125}>125%</option>
                  <option value={150}>150%</option>
                </select>

                <button
                  onClick={() => {
                    if (editorVideoRef.current)
                      editorVideoRef.current.requestFullscreen();
                  }}
                  style={{
                    background: "#17191D",
                    color: "#FFFFFF",
                    border: "1px solid #353B45",
                    borderRadius: "4px",
                    padding: "3px 5px",
                    cursor: "pointer",
                    display: "flex",
                  }}
                  title="Toàn màn hình"
                >
                  <Maximize size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ VERTICAL DRAGGABLE DIVIDER ═══ */}
        <div
          onMouseDown={handleVertDividerMouseDown}
          onMouseEnter={() => setIsVertDividerHover(true)}
          onMouseLeave={() => setIsVertDividerHover(false)}
          style={{
            width: "10px",
            flexShrink: 0,
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
          title="Kéo để thay đổi chiều rộng"
        >
          <div
            style={{
              width: isVertDividerHover ? "4px" : "2px",
              height: "60%",
              background: isVertDividerHover ? "#3B82F6" : "#353B45",
              borderRadius: "4px",
              transition: "all 150ms ease",
              boxShadow: isVertDividerHover
                ? "0 0 8px rgba(59,130,246,0.4)"
                : "none",
            }}
          />
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* COLUMN 3: RIGHT PANEL (Subtitle List - INDEPENDENT INTERNAL SCROLL)    */}
        {/* --------------------------------------------------------------------- */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            background: "#1D2025",
            border: "1px solid #313640",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            overflow: "hidden",
          }}
        >          {/* Subtitle List / Blur Mask / Inspector Tab Header */}
          <div
            style={{
              background: "#191B20",
              borderBottom: "1px solid #313640",
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexShrink: 0,
            }}
          >
            {[
              { id: "list", label: "Phụ đề", icon: <FileText size={13} />, color: "#3B82F6" },
              { id: "blur", label: "Mặt nạ Mờ", icon: <Eye size={13} />, color: "#F59E0B" },
              { id: "inspector", label: "Kiểu dáng", icon: <Sliders size={13} />, color: "#22C55E" },
            ].map((tab) => {
              const active = rightPanelTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightPanelTab(tab.id as any)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: active ? `1px solid ${tab.color}` : "1px solid #2A2E35",
                    background: active ? `${tab.color}22` : "#1F2329",
                    color: active ? tab.color : "#B8BEC8",
                    fontSize: "11px",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    transition: "all 150ms ease",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Subtitle List Toolbar (Fixed Header) */}
          <div
            style={{
              background: "#1D2025",
              borderBottom: "1px solid #313640",
              padding: "8px 12px",
              display: rightPanelTab === "list" ? "flex" : "none",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 700,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
              }}
            >
              <FileText size={14} style={{ color: "#3B82F6" }} /> Danh sách Phụ đề
            </h3>
            <span
              style={{
                fontSize: "11px",
                background: "rgba(59,130,246,0.15)",
                color: "#3B82F6",
                padding: "1px 6px",
                borderRadius: "8px",
                fontWeight: 700,
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              {editorBlocks.length} Dòng
            </span>

            {/* Search, Replace, Replace All */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minWidth: 0,
              }}
            >
              <div style={{ position: "relative", flex: 1, minWidth: "80px" }}>
                <Search
                  size={12}
                  style={{
                    position: "absolute",
                    left: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#7E8794",
                  }}
                />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    height: "26px",
                    padding: "0 8px 0 24px",
                    background: "#1F2329",
                    border: "1px solid #353B45",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "#FFFFFF",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <input
                type="text"
                placeholder="Thay thế..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                style={{
                  width: "90px",
                  height: "26px",
                  padding: "0 8px",
                  background: "#1F2329",
                  border: "1px solid #353B45",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "#FFFFFF",
                  outline: "none",
                  flexShrink: 0,
                }}
              />
              <button
                onClick={() => {
                  if (!searchQuery.trim()) return;
                  pushUndoState(editorBlocks);
                  setEditorBlocks((prev) =>
                    prev.map((b) => ({
                      ...b,
                      text: b.text.replaceAll(searchQuery, replaceQuery),
                    })),
                  );
                  showToast(`Đã thay thế "${searchQuery}"`, "success");
                }}
                style={{
                  background: "#2A2E35",
                  border: "1px solid #353B45",
                  color: "#FFFFFF",
                  borderRadius: "6px",
                  padding: "0 8px",
                  height: "26px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Thay thế
              </button>
            </div>

            {/* Copy & Add Line */}
            <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
              <button
                onClick={() => {
                  const fullText = rebuildSubtitle(editorBlocks, "srt");
                  navigator.clipboard.writeText(fullText);
                  showToast("Đã sao chép toàn bộ phụ đề!", "success");
                }}
                style={{
                  background: "#2A2E35",
                  border: "1px solid #353B45",
                  color: "#FFFFFF",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Copy size={12} /> Copy
              </button>

              <button
                onClick={() => addLine(editorBlocks.length - 1)}
                style={{
                  background: "#3B82F6",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Plus size={12} /> Thêm Dòng
              </button>
            </div>
          </div>

          {/* Subtitle Rows List Container (INDEPENDENT INTERNAL VERTICAL SCROLLBAR) */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "8px 12px",
              display: rightPanelTab === "list" ? "flex" : "none",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {editorBlocks.length === 0 ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#7E8794",
                  fontSize: "12px",
                }}
              >
                Chưa có dữ liệu phụ đề. Vui lòng tải file hoặc bấm &quot;Thêm Dòng&quot;.
              </div>
            ) : (
              editorBlocks
                .filter(
                  (b) =>
                    searchQuery.trim() === "" ||
                    b.text.toLowerCase().includes(searchQuery.toLowerCase()),
                )
                .map((block, idx) => {
                  const isActive = block.idx === editorActiveLineIdx;
                  const isSelected =
                    block.idx === (editorActiveLineIdx ?? selectedLineIdx);
                  const parts = block.timestamp.split("-->");
                  const startTs = parts[0]?.trim() || "";
                  const endTs = parts[1]?.trim() || "";

                  return (
                    <div
                      key={block.idx || idx}
                      ref={isActive ? activeLineRef : null}
                      onClick={() => setSelectedLineIdx(block.idx)}
                      style={{
                        borderRadius: "8px",
                        border: isSelected
                          ? "1px solid #3B82F6"
                          : "1px solid #2A2E35",
                        background: isSelected ? "#242830" : "#1F2329",
                        padding: "8px 10px",
                        cursor: "pointer",
                        transition: "all 150ms ease",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        boxShadow: isSelected
                          ? "0 2px 8px rgba(59,130,246,0.2)"
                          : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <strong
                            style={{
                              color: isSelected ? "#3B82F6" : "#7E8794",
                              fontSize: "12px",
                              minWidth: "22px",
                            }}
                          >
                            #{block.idx}
                          </strong>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <input
                              type="text"
                              value={startTs}
                              onChange={(e) =>
                                updateBlock(idx, "start", e.target.value)
                              }
                              onClick={() => seekVideoTo(block.timestamp)}
                              style={{
                                width: "82px",
                                background: "#17191D",
                                color: "#3B82F6",
                                border: "1px solid #353B45",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontFamily: "monospace",
                                textAlign: "center",
                                outline: "none",
                                cursor: "pointer",
                              }}
                              title="Bấm để nhảy video tới mốc thời gian"
                            />
                            <span
                              style={{ color: "#7E8794", fontSize: "10px" }}
                            >
                              ➔
                            </span>
                            <input
                              type="text"
                              value={endTs}
                              onChange={(e) =>
                                updateBlock(idx, "end", e.target.value)
                              }
                              style={{
                                width: "82px",
                                background: "#17191D",
                                color: "#22C55E",
                                border: "1px solid #353B45",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontFamily: "monospace",
                                textAlign: "center",
                                outline: "none",
                              }}
                            />
                          </div>
                        </div>

                        {/* Actions: Duplicate, Add Below, Delete */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              splitLine(idx);
                            }}
                            style={{
                              background: "#17191D",
                              border: "1px solid #353B45",
                              color: "#F59E0B",
                              borderRadius: "4px",
                              padding: "3px 5px",
                              cursor: "pointer",
                              display: "flex",
                            }}
                            title="Tách câu (CapCut Split)"
                          >
                            <Scissors size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              mergeLine(idx);
                            }}
                            style={{
                              background: "#17191D",
                              border: "1px solid #353B45",
                              color: "#10B981",
                              borderRadius: "4px",
                              padding: "3px 5px",
                              cursor: "pointer",
                              display: "flex",
                            }}
                            title="Gộp câu kế tiếp (CapCut Merge)"
                          >
                            <Layers size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateLine(idx);
                            }}
                            style={{
                              background: "#17191D",
                              border: "1px solid #353B45",
                              color: "#B8BEC8",
                              borderRadius: "4px",
                              padding: "3px 5px",
                              cursor: "pointer",
                              display: "flex",
                            }}
                            title="Nhân bản"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addLine(idx);
                            }}
                            style={{
                              background: "#17191D",
                              border: "1px solid #353B45",
                              color: "#3B82F6",
                              borderRadius: "4px",
                              padding: "3px 5px",
                              cursor: "pointer",
                              display: "flex",
                            }}
                            title="Thêm dòng dưới"
                          >
                            <Plus size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLine(idx);
                            }}
                            style={{
                              background: "#17191D",
                              border: "1px solid #353B45",
                              color: "#EF4444",
                              borderRadius: "4px",
                              padding: "3px 5px",
                              cursor: "pointer",
                              display: "flex",
                            }}
                            title="Xóa dòng"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Editable Text Area */}
                      <textarea
                        value={block.text}
                        onChange={(e) =>
                          updateBlock(idx, "text", e.target.value)
                        }
                        rows={Math.max(1, block.text.split("\n").length)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          minHeight: "34px",
                          resize: "vertical",
                          padding: "5px 8px",
                          borderRadius: "5px",
                          border: "1px solid #353B45",
                          fontSize: "12px",
                          lineHeight: "1.5",
                          outline: "none",
                          background: "#17191D",
                          color: "#FFFFFF",
                          fontFamily: fontFamily,
                        }}
                      />
                    </div>
                  );
                })
            )}
          </div>
          {/* TAB 2: BLUR MASK SETTINGS PANEL */}
          {rightPanelTab === "blur" && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {/* Toggle Switch Card */}
              <div
                style={{
                  background: "#1F2329",
                  border: "1px solid #353B45",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Eye size={15} style={{ color: "#F59E0B" }} /> Bật Mặt Nạ Làm Mờ (Blur Mask)
                  </div>
                  <div style={{ fontSize: "11px", color: "#7E8794", marginTop: "2px" }}>
                    Làm mờ phụ đề gốc cứng trên video bằng FFmpeg boxblur
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enableBlurMask}
                  onChange={(e) => {
                    setEnableBlurMask(e.target.checked);
                    showToast(
                      e.target.checked ? "Đã bật Mặt nạ mờ phụ đề gốc" : "Đã tắt Mặt nạ mờ",
                      "info",
                    );
                  }}
                  style={{ width: "18px", height: "18px", accentColor: "#F59E0B", cursor: "pointer" }}
                />
              </div>

              {/* Blur Radius Slider Card */}
              <div
                style={{
                  background: "#1F2329",
                  border: "1px solid #353B45",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  opacity: enableBlurMask ? 1 : 0.5,
                  pointerEvents: enableBlurMask ? "auto" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#FFFFFF" }}>
                    Cường độ làm mờ (Blur Radius):
                  </span>
                  <strong style={{ fontSize: "12px", color: "#F59E0B" }}>{blurRadius}px</strong>
                </div>
                <input
                  type="range"
                  min={5}
                  max={40}
                  value={blurRadius}
                  onChange={(e) => setBlurRadius(parseInt(e.target.value))}
                  style={{ width: "100%", accentColor: "#F59E0B", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#7E8794" }}>
                  <span>Mờ nhẹ (5px)</span>
                  <span>Vừa (16px)</span>
                  <span>Mờ mạnh (40px)</span>
                </div>
              </div>

              {/* Mask Position Sliders & Quick Presets Card */}
              <div
                style={{
                  background: "#1F2329",
                  border: "1px solid #353B45",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  opacity: enableBlurMask ? 1 : 0.5,
                  pointerEvents: enableBlurMask ? "auto" : "none",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#FFFFFF" }}>
                  Tọa độ & Kích thước Vùng Mờ (%):
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#B8BEC8" }}>
                      <span>Vị trí X:</span>
                      <strong style={{ color: "#F59E0B" }}>{blurMaskPos.x}%</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100 - blurMaskPos.w}
                      value={blurMaskPos.x}
                      onChange={(e) => setBlurMaskPos((p) => ({ ...p, x: parseFloat(e.target.value) }))}
                      style={{ width: "100%", accentColor: "#F59E0B" }}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#B8BEC8" }}>
                      <span>Vị trí Y:</span>
                      <strong style={{ color: "#F59E0B" }}>{blurMaskPos.y}%</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100 - blurMaskPos.h}
                      value={blurMaskPos.y}
                      onChange={(e) => setBlurMaskPos((p) => ({ ...p, y: parseFloat(e.target.value) }))}
                      style={{ width: "100%", accentColor: "#F59E0B" }}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#B8BEC8" }}>
                      <span>Rộng W:</span>
                      <strong style={{ color: "#F59E0B" }}>{blurMaskPos.w}%</strong>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100 - blurMaskPos.x}
                      value={blurMaskPos.w}
                      onChange={(e) => setBlurMaskPos((p) => ({ ...p, w: parseFloat(e.target.value) }))}
                      style={{ width: "100%", accentColor: "#F59E0B" }}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#B8BEC8" }}>
                      <span>Cao H:</span>
                      <strong style={{ color: "#F59E0B" }}>{blurMaskPos.h}%</strong>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100 - blurMaskPos.y}
                      value={blurMaskPos.h}
                      onChange={(e) => setBlurMaskPos((p) => ({ ...p, h: parseFloat(e.target.value) }))}
                      style={{ width: "100%", accentColor: "#F59E0B" }}
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div style={{ marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", color: "#7E8794", marginBottom: "6px" }}>Mẫu vị trí nhanh:</div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => setBlurMaskPos({ x: 10, y: 78, w: 80, h: 16 })}
                      style={{
                        flex: 1,
                        padding: "5px",
                        background: "#2A2E35",
                        border: "1px solid #353B45",
                        color: "#FFFFFF",
                        borderRadius: "5px",
                        fontSize: "10px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Phụ đề Đáy (Bottom)
                    </button>
                    <button
                      onClick={() => setBlurMaskPos({ x: 10, y: 6, w: 80, h: 14 })}
                      style={{
                        flex: 1,
                        padding: "5px",
                        background: "#2A2E35",
                        border: "1px solid #353B45",
                        color: "#FFFFFF",
                        borderRadius: "5px",
                        fontSize: "10px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Phụ đề Đỉnh (Top)
                    </button>
                    <button
                      onClick={() => setBlurMaskPos({ x: 10, y: 80, w: 80, h: 14 })}
                      style={{
                        padding: "5px 10px",
                        background: "#3A2A25",
                        border: "1px solid #7E3525",
                        color: "#EF4444",
                        borderRadius: "5px",
                        fontSize: "10px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Đặt lại
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ HORIZONTAL DRAGGABLE DIVIDER ═══ */}
      <div
        onMouseDown={handleHorizDividerMouseDown}
        style={{
          height: "8px",
          width: "100%",
          cursor: "row-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          flexShrink: 0,
        }}
        title="Kéo để thay đổi chiều cao Inspector"
      >
        <div
          style={{
            height: isHorizDividerHover ? "4px" : "2px",
            width: "30%",
            background: isHorizDividerHover ? "#3B82F6" : "#313640",
            borderRadius: "4px",
            transition: "all 150ms ease",
            boxShadow: isHorizDividerHover
              ? "0 0 8px rgba(59,130,246,0.4)"
              : "none",
          }}
        />
      </div>

      {/* ========================================================================= */}
      {/* 3. BOTTOM INSPECTOR PANEL (Full Width Fixed Bottom - Resizable Height)   */}
      {/* ========================================================================= */}
      <div
        style={{
          background: "#1D2025",
          border: "1px solid #313640",
          borderRadius: "12px",
          padding: "12px 18px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          width: "100%",
          boxSizing: "border-box",
          height: `${bottomInspectorHeight}px`,
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #313640",
            paddingBottom: "8px",
            marginBottom: "10px",
          }}
        >
          <h3
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#FFFFFF",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Sliders size={14} style={{ color: "#3B82F6" }} /> Thuộc tính phụ đề (Inspector)
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => {
                showToast("⚡ Đã áp dụng thuộc tính kiểu dáng này cho toàn bộ phụ đề trong dự án!", "success");
              }}
              style={{
                background: "linear-gradient(135deg, #10B981, #059669)",
                border: "none",
                color: "#FFFFFF",
                borderRadius: "6px",
                padding: "3px 10px",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
              }}
            >
              ⚡ Áp dụng cho TẤT CẢ phụ đề
            </button>
            <span
              style={{
                fontSize: "11px",
                background: "rgba(59,130,246,0.15)",
                color: "#3B82F6",
                padding: "2px 8px",
                borderRadius: "6px",
                fontWeight: 700,
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              CapCut Engine
            </span>
            <button
              onClick={() => {
                setSubPos({ x: 50, y: 85 });
                setFontFamily("Inter");
                setFontSizePx(24);
                setFontWeight("700");
                setFontColorHex("#FFFFFF");
                setStrokeOption("medium");
                setShadowOption("soft");
                setOpacityVal(100);
                showToast("Đã khôi phục thuộc tính mặc định", "info");
              }}
              style={{
                background: "#2A2E35",
                border: "1px solid #353B45",
                color: "#B8BEC8",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Đặt lại
            </button>
          </div>
        </div>

        {/* CapCut Presets Cards Gallery */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "4px" }}>
          {[
            { name: "Neon Vàng", fontColor: "#FFE600", strokeColor: "#000000", strokeOpt: "heavy", shadowOpt: "soft", bg: "transparent" },
            { name: "Cyber Cyan", fontColor: "#00F0FF", strokeColor: "#001A33", strokeOpt: "heavy", shadowOpt: "glow", bg: "transparent" },
            { name: "Bubble Hồng", fontColor: "#FF3399", strokeColor: "#FFFFFF", strokeOpt: "medium", shadowOpt: "soft", bg: "transparent" },
            { name: "Hoàng Kim Gold", fontColor: "#FFD700", strokeColor: "#3E2723", strokeOpt: "heavy", shadowOpt: "soft", bg: "transparent" },
            { name: "Dark Box", fontColor: "#FFFFFF", strokeColor: "#000000", strokeOpt: "none", shadowOpt: "none", bg: "rgba(0,0,0,0.75)" },
            { name: "Cartoon Red", fontColor: "#FF3333", strokeColor: "#FFFFFF", strokeOpt: "heavy", shadowOpt: "soft", bg: "transparent" },
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                setFontColorHex(preset.fontColor);
                setStrokeColorHex(preset.strokeColor);
                setStrokeOption(preset.strokeOpt);
                setShadowOption(preset.shadowOpt);
                setBgColorHex(preset.bg);
                showToast(`🎨 Đã áp dụng mẫu chữ CapCut ${preset.name}!`, "success");
              }}
              style={{
                flexShrink: 0,
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid #353B45",
                background: preset.bg !== "transparent" ? preset.bg : "#191B20",
                color: preset.fontColor,
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Collapsible Inspector Grid Sections */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1px 1.2fr 1px 1fr 1px 1fr 1px 1.1fr 1px 1fr",
            gap: "0 14px",
            alignItems: "start",
          }}
        >

          {/* ▼ Position */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => toggleSection("position")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>▼ Position</span>
              {openSections.position ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            {openSections.position && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#B8BEC8",
                    }}
                  >
                    <span>Vị trí X:</span>
                    <strong style={{ color: "#3B82F6" }}>
                      {Math.round(subPos.x)}%
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={subPos.x}
                    onChange={(e) =>
                      setSubPos((p) => ({
                        ...p,
                        x: parseFloat(e.target.value),
                      }))
                    }
                    style={{ width: "100%", accentColor: "#3B82F6" }}
                  />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#B8BEC8",
                    }}
                  >
                    <span>Vị trí Y:</span>
                    <strong style={{ color: "#3B82F6" }}>
                      {Math.round(subPos.y)}%
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={subPos.y}
                    onChange={(e) =>
                      setSubPos((p) => ({
                        ...p,
                        y: parseFloat(e.target.value),
                      }))
                    }
                    style={{ width: "100%", accentColor: "#3B82F6" }}
                  />
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#B8BEC8",
                    }}
                  >
                    <span>Xoay:</span>
                    <strong style={{ color: "#3B82F6" }}>{rotationDeg}°</strong>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={rotationDeg}
                    onChange={(e) => setRotationDeg(parseInt(e.target.value))}
                    style={{ width: "100%", accentColor: "#3B82F6" }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "#313640", alignSelf: "stretch" }} />

          {/* ▼ Typography */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => toggleSection("typography")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>▼ Typography</span>
              {openSections.typography ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            {openSections.typography && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        fontSize: "9px",
                        color: "#7E8794",
                        display: "block",
                        marginBottom: "2px",
                      }}
                    >
                      FONT
                    </label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                      style={{
                        width: "100%",
                        height: "24px",
                        background: "#1F2329",
                        border: "1px solid #353B45",
                        borderRadius: "5px",
                        fontSize: "10px",
                        color: "#FFFFFF",
                        outline: "none",
                      }}
                    >
                      <option value="Inter">Inter</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Arial">Arial</option>
                      <option value="Montserrat">Montserrat</option>
                      <option value="Courier New">Courier</option>
                    </select>
                  </div>
                  <div style={{ width: "65px" }}>
                    <label
                      style={{
                        fontSize: "9px",
                        color: "#7E8794",
                        display: "block",
                        marginBottom: "2px",
                      }}
                    >
                      WEIGHT
                    </label>
                    <select
                      value={fontWeight}
                      onChange={(e) => setFontWeight(e.target.value)}
                      style={{
                        width: "100%",
                        height: "24px",
                        background: "#1F2329",
                        border: "1px solid #353B45",
                        borderRadius: "5px",
                        fontSize: "10px",
                        color: "#FFFFFF",
                        outline: "none",
                      }}
                    >
                      <option value="400">Regular</option>
                      <option value="600">Medium</option>
                      <option value="700">Bold</option>
                      <option value="900">Black</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#B8BEC8",
                    }}
                  >
                    <span>Cỡ chữ:</span>
                    <strong style={{ color: "#3B82F6" }}>{fontSizePx}px</strong>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={72}
                    value={fontSizePx}
                    onChange={(e) => setFontSizePx(parseInt(e.target.value))}
                    style={{ width: "100%", accentColor: "#3B82F6" }}
                  />
                </div>

                {/* Alignment buttons */}
                <div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[
                      { align: "left" as const, icon: <AlignLeft size={11} /> },
                      {
                        align: "center" as const,
                        icon: <AlignCenter size={11} />,
                      },
                      {
                        align: "right" as const,
                        icon: <AlignRight size={11} />,
                      },
                    ].map((item) => (
                      <button
                        key={item.align}
                        onClick={() => setTextAlign(item.align)}
                        style={{
                          flex: 1,
                          padding: "3px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          border:
                            textAlign === item.align
                              ? "1px solid #3B82F6"
                              : "1px solid #353B45",
                          background:
                            textAlign === item.align ? "#3B82F6" : "#1F2329",
                          color: "#FFFFFF",
                          display: "flex",
                          justifyContent: "center",
                        }}
                      >
                        {item.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "#313640", alignSelf: "stretch" }} />

          {/* ▼ Colors */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => toggleSection("colors")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>▼ Colors</span>
              {openSections.colors ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            {openSections.colors && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "10px", color: "#B8BEC8" }}>
                    Màu chữ:
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <input
                      type="color"
                      value={fontColorHex}
                      onChange={(e) => setFontColorHex(e.target.value)}
                      style={{
                        width: "24px",
                        height: "22px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "monospace",
                        color: "#FFFFFF",
                      }}
                    >
                      {fontColorHex}
                    </span>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#B8BEC8",
                    }}
                  >
                    <span>Trong suốt:</span>
                    <strong style={{ color: "#3B82F6" }}>{opacityVal}%</strong>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={opacityVal}
                    onChange={(e) => setOpacityVal(parseInt(e.target.value))}
                    style={{ width: "100%", accentColor: "#3B82F6" }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "#313640", alignSelf: "stretch" }} />

          {/* ▼ Outline */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => toggleSection("outline")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>▼ Outline (Viền)</span>
              {openSections.outline ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            {openSections.outline && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div>
                  <select
                    value={strokeOption}
                    onChange={(e) => setStrokeOption(e.target.value)}
                    style={{
                      width: "100%",
                      height: "24px",
                      background: "#1F2329",
                      border: "1px solid #353B45",
                      borderRadius: "5px",
                      fontSize: "10px",
                      color: "#FFFFFF",
                      outline: "none",
                    }}
                  >
                    <option value="none">Không viền</option>
                    <option value="thin">Mỏng (1px)</option>
                    <option value="medium">Vừa (2px)</option>
                    <option value="thick">Dày (3px)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "#313640", alignSelf: "stretch" }} />

          {/* ▼ Shadow */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => toggleSection("shadow")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>▼ Shadow</span>
              {openSections.shadow ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            {openSections.shadow && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div>
                  <select
                    value={shadowOption}
                    onChange={(e) => setShadowOption(e.target.value)}
                    style={{
                      width: "100%",
                      height: "24px",
                      background: "#1F2329",
                      border: "1px solid #353B45",
                      borderRadius: "5px",
                      fontSize: "10px",
                      color: "#FFFFFF",
                      outline: "none",
                    }}
                  >
                    <option value="none">Không bóng</option>
                    <option value="soft">Bóng nhẹ (Soft)</option>
                    <option value="strong">Bóng đậm (Strong)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: "#313640", alignSelf: "stretch" }} />

          {/* ▼ Animation & Advanced */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => toggleSection("animation")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "transparent",
                border: "none",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span>▼ Animation</span>
              {openSections.animation ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
            {openSections.animation && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div>
                  <select
                    value={animationType}
                    onChange={(e) => setAnimationType(e.target.value)}
                    style={{
                      width: "100%",
                      height: "24px",
                      background: "#1F2329",
                      border: "1px solid #353B45",
                      borderRadius: "5px",
                      fontSize: "10px",
                      color: "#FFFFFF",
                      outline: "none",
                    }}
                  >
                    <option value="fadeIn">Fade In</option>
                    <option value="popIn">Pop In</option>
                    <option value="slideUp">Slide Up</option>
                    <option value="typewriter">Typewriter</option>
                  </select>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    marginTop: "2px",
                  }}
                >
                  <span style={{ fontSize: "10px", color: "#7E8794" }}>
                    Dịch ms:
                  </span>
                  <input
                    type="text"
                    value={editorGlobalShiftVal}
                    onChange={(e) => setEditorGlobalShiftVal(e.target.value)}
                    style={{
                      flex: 1,
                      height: "20px",
                      background: "#1F2329",
                      border: "1px solid #353B45",
                      borderRadius: "4px",
                      fontSize: "10px",
                      color: "#FFFFFF",
                      textAlign: "center",
                    }}
                    placeholder="ms"
                  />
                  <button
                    onClick={handleGlobalShift}
                    style={{
                      background: "#3B82F6",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "9px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Set
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

