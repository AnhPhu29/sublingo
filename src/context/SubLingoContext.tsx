"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, Trash2, X, Mic, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useJobPolling } from "@/hooks/useJobPolling";
import { useGlossary } from "@/hooks/useGlossary";
import { useCustomVoices } from "@/hooks/useCustomVoices";
import { TranslationData, FileQueueItem } from "@/lib/types";

interface SubLingoContextType {
  // Global Dialog & Toast
  confirmDialog: any;
  setConfirmDialog: (val: any) => void;
  isGeminiKeyModalOpen: boolean;
  setIsGeminiKeyModalOpen: (val: boolean) => void;
  toasts: any[];
  showToast: (msg: string, type?: string) => void;
  pythonServiceHealthy: boolean | null;

  // Subtitle States
  subtitleContent: string;
  setSubtitleContent: (val: string) => void;
  fileName: string;
  setFileName: (val: string) => void;
  selectedLangs: string[];
  setSelectedLangs: React.Dispatch<React.SetStateAction<string[]>>;
  translationResults: Record<string, TranslationData>;
  setTranslationResults: React.Dispatch<React.SetStateAction<Record<string, TranslationData>>>;
  confidenceScores: number[];
  setConfidenceScores: (val: number[]) => void;
  activeResultTab: string;
  setActiveResultTab: (val: string) => void;
  exportFormat: string;
  setExportFormat: (val: string) => void;

  // Video States
  videoFile: File | null;
  setVideoFile: (val: File | null) => void;
  videoUrl: string;
  setVideoUrl: (val: string) => void;
  trackUrls: Record<string, string>;
  setTrackUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  clearVideo: () => void;

  // Batch
  fileQueue: FileQueueItem[];
  setFileQueue: React.Dispatch<React.SetStateAction<FileQueueItem[]>>;
  isBatchTranslating: boolean;
  setIsBatchTranslating: (val: boolean) => void;

  // Glossary
  glossary: any[];
  setGlossary: React.Dispatch<React.SetStateAction<any[]>>;
  glossInputOriginal: string;
  setGlossInputOriginal: (val: string) => void;
  glossInputTranslation: string;
  setGlossInputTranslation: (val: string) => void;
  addGlossaryItem: () => void;
  removeGlossaryItem: (id: string) => void;

  // OCR Video & STT States
  extractionMode: "image" | "video_ocr" | "stt";
  setExtractionMode: (val: "image" | "video_ocr" | "stt") => void;
  ocrImage: { base64: string; mediaType: string } | null;
  setOcrImage: (val: any) => void;
  ocrImagePreview: string;
  setOcrImagePreview: (val: string) => void;
  ocrResult: string;
  setOcrResult: (val: string) => void;
  ocrLoading: boolean;
  setOcrLoading: (val: boolean) => void;
  ocrError: string;
  setOcrError: (val: string) => void;
  ocrImageConfidence: number | null;
  setOcrImageConfidence: (val: number | null) => void;
  isOcrDragOver: boolean;
  setIsOcrDragOver: (val: boolean) => void;
  ocrVideoFile: File | null;
  setOcrVideoFile: (val: File | null) => void;
  ocrVideoPreviewUrl: string;
  setOcrVideoPreviewUrl: (val: string) => void;
  ocrSourceLang: string;
  setOcrSourceLang: (val: string) => void;
  removeWatermark: boolean;
  setRemoveWatermark: (val: boolean) => void;
  autoTranslateAfterExtract: boolean;
  setAutoTranslateAfterExtract: (val: boolean) => void;
  syncAudio: boolean;
  setSyncAudio: (val: boolean) => void;
  cropX: number;
  setCropX: (val: number) => void;
  cropY: number;
  setCropY: (val: number) => void;
  cropWidth: number;
  setCropWidth: (val: number) => void;
  cropHeight: number;
  setCropHeight: (val: number) => void;
  sttFile: File | null;
  setSttFile: (val: File | null) => void;
  sttPreviewUrl: string;
  setSttPreviewUrl: (val: string) => void;
  sttSourceLang: string;
  setSttSourceLang: (val: string) => void;

  // Cost
  estimatedCost: any;
  setEstimatedCost: (val: any) => void;
  estimating: boolean;

  // Polling Job
  activeJobId: string | null;
  activeJobStatus: string;
  activeJobLogs: string[];
  activeJobError: string;
  jobProgressPercent: number;
  startActiveJobPolling: (jobId: string) => void;
  cancelActiveJob: () => void;
  retryActiveJob: () => void;
  setActiveJobId: (val: string | null) => void;
  setActiveJobStatus: (val: any) => void;
  setJobProgressPercent: (val: number) => void;
  setActiveJobLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setActiveJobError: (val: string) => void;

  // Dubbing
  dubVideoFile: File | null;
  setDubVideoFile: (val: File | null) => void;
  dubSubtitleContent: string;
  setDubSubtitleContent: (val: string) => void;
  dubSubtitleFileName: string;
  setDubSubtitleFileName: (val: string) => void;
  dubVoiceId: string;
  setDubVoiceId: (val: string) => void;
  playingVoiceCode: string | null;
  setPlayingVoiceCode: (val: string | null) => void;
  audioPlayer: HTMLAudioElement | null;
  setAudioPlayer: (val: HTMLAudioElement | null) => void;
  dubClientPause: any;
  setDubClientPause: (val: any) => void;
  dubStyle: string;
  setDubStyle: (val: string) => void;
  dubTargetLang: string;
  setDubTargetLang: (val: string) => void;
  dubEstimatedCost: any;
  setDubEstimatedCost: (val: any) => void;
  dubEstimating: boolean;
  setDubEstimating: (val: boolean) => void;
  dubIsDragOverVideo: boolean;
  setDubIsDragOverVideo: (val: boolean) => void;
  dubIsDragOverSrt: boolean;
  setDubIsDragOverSrt: (val: boolean) => void;
  // New Phase 1 dub states
  dubSubSource: string;
  setDubSubSource: (val: string) => void;
  dubOriginalLang: string;
  setDubOriginalLang: (val: string) => void;
  dubVideoQueue: Array<{ id: string; file: File; subtitleContent: string; subtitleFileName: string }>;
  setDubVideoQueue: React.Dispatch<React.SetStateAction<Array<{ id: string; file: File; subtitleContent: string; subtitleFileName: string }>>>;
  dubProcessingMode: 'auto' | 'editor';
  setDubProcessingMode: (val: 'auto' | 'editor') => void;
  customVoices: any[];
  vbeeVoices: any[];
  vbeeVoicesLoading: boolean;
  showAddVoiceModal: boolean;
  setShowAddVoiceModal: (val: boolean) => void;
  newVoiceName: string;
  setNewVoiceName: (val: string) => void;
  newVoiceText: string;
  setNewVoiceText: (val: string) => void;
  newVoiceAudio: File | null;
  setNewVoiceAudio: (val: File | null) => void;
  isAddingVoice: boolean;
  fetchVoices: () => void;
  deleteCustomVoice: (id: string) => void;
  addCustomVoice: () => void;
  dubJobId: string | null;
  setDubJobId: (val: string | null) => void;
  dubJobStatus: string;
  setDubJobStatus: (val: string) => void;
  dubJobLogs: string[];
  setDubJobLogs: React.Dispatch<React.SetStateAction<string[]>>;
  dubJobError: string;
  setDubJobError: (val: string) => void;

  // Editor
  editorBlocks: any[];
  setEditorBlocks: React.Dispatch<React.SetStateAction<any[]>>;
  editorUndoStack: any[][];
  setEditorUndoStack: React.Dispatch<React.SetStateAction<any[][]>>;
  editorVideoFile: File | null;
  setEditorVideoFile: (val: File | null) => void;
  editorVideoUrl: string;
  setEditorVideoUrl: (val: string) => void;
  editorActiveLineIdx: string | null;
  setEditorActiveLineIdx: (val: string | null) => void;
  editorSrtFileName: string;
  setEditorSrtFileName: (val: string) => void;
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

  // History & Costs
  historyItems: any[];
  setHistoryItems: React.Dispatch<React.SetStateAction<any[]>>;
  historyLoading: boolean;
  setHistoryLoading: (val: boolean) => void;
  expandedHistory: string | null;
  setExpandedHistory: (val: string | null) => void;
  historyDetailTab: string;
  setHistoryDetailTab: (val: string) => void;
  costSummary: any;
  costLoading: boolean;
  fetchHistory: () => Promise<void>;
  loadCostSummary: () => Promise<void>;

  // Callbacks
  estimateExtractionCost: (file: File | null, mode: "stt" | "ocr") => Promise<void>;
  useOcrForTranslation: () => void;
  downloadResult: (langCode: string, content: string) => void;
  toggleLang: (code: string) => void;

  // Settings & Theme
  uiLang: "vi" | "en";
  setUiLang: (lang: "vi" | "en") => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

const SubLingoContext = createContext<SubLingoContextType | undefined>(undefined);

export const SubLingoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();

  // Settings states
  const [uiLang, setUiLang] = useState<"vi" | "en">("vi");
  const [theme, setThemeState] = useState<"light" | "dark">("dark");

  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("sublingo-theme") as "light" | "dark" || "dark";
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sublingo-theme", theme);
    }
  }, [theme]);

  // Global Dialog State
  const [confirmDialog, setConfirmDialog] = useState<any>(null);
  const [isGeminiKeyModalOpen, setIsGeminiKeyModalOpen] = useState(false);

  // Services Hooks
  const { toasts, showToast } = useToast();
  const toastService = { showToast };
  const [pythonServiceHealthy, setPythonServiceHealthy] = useState<boolean | null>(null);

  // ======================== SUBTITLE STATE ========================
  const [subtitleContent, setSubtitleContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [translationResults, setTranslationResults] = useState<Record<string, TranslationData>>({});
  const [confidenceScores, setConfidenceScores] = useState<number[]>([]);
  const [activeResultTab, setActiveResultTab] = useState("");
  const [exportFormat, setExportFormat] = useState("srt");

  // Video preview state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [trackUrls, setTrackUrls] = useState<Record<string, string>>({});

  // Batch translate state
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);

  // Glossary Hook
  const {
    glossary,
    setGlossary,
    glossInputOriginal,
    setGlossInputOriginal,
    glossInputTranslation,
    setGlossInputTranslation,
    fetchGlossary,
    addGlossaryItem,
    removeGlossaryItem,
  } = useGlossary({ showToast });

  // ======================== EXTRACTION (OCR / STT) STATE ========================
  const [extractionMode, setExtractionMode] = useState<"image" | "video_ocr" | "stt">("video_ocr");

  // OCR Video settings
  const [ocrVideoFile, setOcrVideoFile] = useState<File | null>(null);
  const [ocrVideoPreviewUrl, setOcrVideoPreviewUrl] = useState("");
  const [ocrSourceLang, setOcrSourceLang] = useState("auto");
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const [autoTranslateAfterExtract, setAutoTranslateAfterExtract] = useState(false);
  const [syncAudio, setSyncAudio] = useState(true);

  // Crop region states (tỷ lệ %) - Default initialized to typical subtitle area
  const [cropX, setCropX] = useState(10);
  const [cropY, setCropY] = useState(80);
  const [cropWidth, setCropWidth] = useState(80);
  const [cropHeight, setCropHeight] = useState(15);

  // STT settings
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [sttPreviewUrl, setSttPreviewUrl] = useState("");
  const [sttSourceLang, setSttSourceLang] = useState("auto");

  // Cost estimation state
  const [estimatedCost, setEstimatedCost] = useState<{
    total: number;
    breakdown: Record<string, number>;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Polling Job Hook for OCR Video & STT
  const logContainerRef = useRef<HTMLDivElement>(null);
  const {
    jobId: activeJobId,
    status: activeJobStatus,
    logs: activeJobLogs,
    errorMessage: activeJobError,
    progressPercent: jobProgressPercent,
    startPolling: startActiveJobPolling,
    cancelJob: cancelActiveJob,
    retryJob: retryActiveJob,
    setJobId: setActiveJobId,
    setStatus: setActiveJobStatus,
    setProgressPercent: setJobProgressPercent,
    setLogs: setActiveJobLogs,
    setErrorMessage: setActiveJobError,
  } = useJobPolling({
    toastService,
    onSuccess: (jobData) => {
      setJobProgressPercent(100);
      showToast("Đã trích xuất xong phụ đề!", "success");

      const { meta, inputFile } = jobData;
      const originalText = typeof meta?.originalText === "string" ? meta.originalText : "";
      const fallbackBaseName = (() => {
        const rawInput = typeof inputFile === "string" ? inputFile.trim() : "";
        const rawMetaName = typeof meta?.originalFileName === "string" ? meta.originalFileName.trim() : "";
        const candidate = rawInput || rawMetaName || "extracted";
        return candidate.replace(/\.[^/.]+$/, "") || "extracted";
      })();

      if (originalText) {
        setSubtitleContent(originalText);
        setFileName(`${fallbackBaseName}_extracted.srt`);
        setActiveResultTab("");
        if (meta?.confidenceScores) {
          setConfidenceScores(meta.confidenceScores);
        } else {
          setConfidenceScores([]);
        }
      } else {
        setSubtitleContent("");
        setFileName(`${fallbackBaseName}_extracted.srt`);
        setActiveResultTab("");
        setConfidenceScores([]);
      }

      if (meta?.autoTranslate && meta?.translations) {
        const transData: Record<string, TranslationData> = {};
        Object.entries(meta.translations).forEach(([lc, text]: [string, any]) => {
          transData[lc] = {
            status: "done",
            aiResult: text,
            result: text,
            error: "",
          };
        });
        setTranslationResults(transData);
        if (selectedLangs.length > 0) setActiveResultTab(selectedLangs[0]);
      } else {
        setTranslationResults({});
      }

      // Close modal log and navigate to translation route
      setTimeout(() => {
        setActiveJobId(null);
        router.push("/translate");
      }, 1000);
    },
    onError: (err) => {
      setActiveJobStatus("error");
    },
  });

  // OCR Image state (Giai đoạn 1)
  const [ocrImage, setOcrImage] = useState<{ base64: string; mediaType: string } | null>(null);
  const [ocrImagePreview, setOcrImagePreview] = useState("");
  const [ocrResult, setOcrResult] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrImageConfidence, setOcrImageConfidence] = useState<number | null>(null);
  const [isOcrDragOver, setIsOcrDragOver] = useState(false);

  // ======================== DUBBING STATE & HOOK ========================
  const [dubVideoFile, setDubVideoFile] = useState<File | null>(null);
  const [dubSubtitleContent, setDubSubtitleContent] = useState("");
  const [dubSubtitleFileName, setDubSubtitleFileName] = useState("");
  const [dubVoiceId, setDubVoiceId] = useState("Mai Anh");
  const [playingVoiceCode, setPlayingVoiceCode] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [dubClientPause, setDubClientPause] = useState({
    majorBreak: 0.5,
    mediumBreak: 0.3,
    paragraphBreak: 1.0,
    sentenceBreak: 0.5,
  });
  const [dubStyle, setDubStyle] = useState("voiceover");
  const [dubTargetLang, setDubTargetLang] = useState("vi");
  const [dubEstimatedCost, setDubEstimatedCost] = useState<{
    total: number;
    breakdown: Record<string, number>;
  } | null>(null);
  const [dubEstimating, setDubEstimating] = useState(false);
  const [dubIsDragOverVideo, setDubIsDragOverVideo] = useState(false);
  const [dubIsDragOverSrt, setDubIsDragOverSrt] = useState(false);
  // New Phase 1 dub states
  const [dubSubSource, setDubSubSource] = useState<string>('srt_translated');
  const [dubOriginalLang, setDubOriginalLang] = useState<string>('zh');
  const [dubVideoQueue, setDubVideoQueue] = useState<Array<{ id: string; file: File; subtitleContent: string; subtitleFileName: string }>>([]);
  const [dubProcessingMode, setDubProcessingMode] = useState<'auto' | 'editor'>('auto');

  // Custom Cloned Voices Hook
  const {
    customVoices,
    vbeeVoices,
    vbeeVoicesLoading,
    showAddVoiceModal,
    setShowAddVoiceModal,
    newVoiceName,
    setNewVoiceName,
    newVoiceText,
    setNewVoiceText,
    newVoiceAudio,
    setNewVoiceAudio,
    isAddingVoice,
    fetchVoices,
    deleteCustomVoice,
    addCustomVoice,
  } = useCustomVoices({
    showToast,
    setConfirmDialog,
    dubVoiceId,
    setDubVoiceId,
  });

  const [dubJobId, setDubJobId] = useState<string | null>(null);
  const [dubJobStatus, setDubJobStatus] = useState<string>("idle");
  const [dubJobLogs, setDubJobLogs] = useState<string[]>([]);
  const [dubJobError, setDubJobError] = useState("");

  // ======================== EDITOR & BURN-IN STATE ========================
  const [editorBlocks, setEditorBlocks] = useState<any[]>([]);
  const [editorUndoStack, setEditorUndoStack] = useState<any[][]>([]);
  const [editorVideoFile, setEditorVideoFile] = useState<File | null>(null);
  const [editorVideoUrl, setEditorVideoUrl] = useState("");
  const [editorActiveLineIdx, setEditorActiveLineIdx] = useState<string | null>(null);
  const [editorSrtFileName, setEditorSrtFileName] = useState("");
  const [editorHasAdvancedEffects, setEditorHasAdvancedEffects] = useState(false);
  const [editorGlobalShiftVal, setEditorGlobalShiftVal] = useState("0");
  const [editorScaleVal, setEditorScaleVal] = useState("1.0");
  const [editorIsDragOverVideo, setEditorIsDragOverVideo] = useState(false);
  const [editorIsDragOverSrt, setEditorIsDragOverSrt] = useState(false);

  // Burn-in settings
  const [burnInFontSizeOption, setBurnInFontSizeOption] = useState("medium");
  const [burnInPosition, setBurnInPosition] = useState("bottom");
  const [burnInColor, setBurnInColor] = useState("white");
  const [burnInLangCode, setBurnInLangCode] = useState("vi");

  // Burn-in job polling state
  const [burnInJobId, setBurnInJobId] = useState<string | null>(null);
  const [burnInJobStatus, setBurnInJobStatus] = useState("idle");
  const [burnInJobLogs, setBurnInJobLogs] = useState<string[]>([]);
  const [burnInJobError, setBurnInJobError] = useState("");
  const [burnInProgressPercent, setBurnInProgressPercent] = useState(0);

  // ======================== HISTORY & COSTS STATE ========================
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [historyDetailTab, setHistoryDetailTab] = useState("");

  const [costSummary, setCostSummary] = useState<any>(null);
  const [costLoading, setCostLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(false);
    setHistoryItems([]);
  }, []);

  const loadCostSummary = useCallback(async () => {
    setCostLoading(true);
    try {
      const res = await fetch("/api/costs/summary");
      const data = await res.json();
      if (res.ok && data.success) {
        setCostSummary(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCostLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlossary();
    fetchVoices();
  }, [fetchGlossary, fetchVoices]);

  // Auto-restore active jobs from localStorage on app mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Restore Dubbing job
    const savedDubJobId = localStorage.getItem("sublingo_active_dub_job_id");
    if (savedDubJobId && !dubJobId) {
      fetch(`/api/jobs/${savedDubJobId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setDubJobId(savedDubJobId);
            setDubJobStatus(data.data.status);
            if (Array.isArray(data.data.progressLog)) {
              setDubJobLogs(data.data.progressLog);
            }
          }
        })
        .catch(() => {});
    }

    // Restore Extract/STT job
    const savedExtractJobId = localStorage.getItem("sublingo_active_extract_job_id");
    if (savedExtractJobId && !activeJobId) {
      fetch(`/api/jobs/${savedExtractJobId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            if (data.data.status === "processing" || data.data.status === "queued") {
              startActiveJobPolling(savedExtractJobId);
            }
          }
        })
        .catch(() => {});
    }

    // Restore Burn-in job
    const savedBurnInJobId = localStorage.getItem("sublingo_active_burnin_job_id");
    if (savedBurnInJobId && !burnInJobId) {
      fetch(`/api/jobs/${savedBurnInJobId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setBurnInJobId(savedBurnInJobId);
            setBurnInJobStatus(data.data.status);
            if (Array.isArray(data.data.progressLog)) {
              setBurnInJobLogs(data.data.progressLog);
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Save dubJobId to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dubJobId) {
      localStorage.setItem("sublingo_active_dub_job_id", dubJobId);
    } else {
      localStorage.removeItem("sublingo_active_dub_job_id");
    }
  }, [dubJobId]);

  // Save activeJobId to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeJobId) {
      localStorage.setItem("sublingo_active_extract_job_id", activeJobId);
    } else {
      localStorage.removeItem("sublingo_active_extract_job_id");
    }
  }, [activeJobId]);

  // Save burnInJobId to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (burnInJobId) {
      localStorage.setItem("sublingo_active_burnin_job_id", burnInJobId);
    } else {
      localStorage.removeItem("sublingo_active_burnin_job_id");
    }
  }, [burnInJobId]);

  // Poll Python AI Service health — check every 15s, only setState when value actually changes
  const pythonHealthyRef = useRef<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch("/api/health/python");
        if (!mounted) return;
        const isHealthy = res.ok;
        if (pythonHealthyRef.current !== isHealthy) {
          pythonHealthyRef.current = isHealthy;
          setPythonServiceHealthy(isHealthy);
        }
      } catch (e) {
        if (!mounted) return;
        if (pythonHealthyRef.current !== false) {
          pythonHealthyRef.current = false;
          setPythonServiceHealthy(false);
        }
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Video duration auto calculation
  const estimateExtractionCost = async (file: File | null, mode: "stt" | "ocr") => {
    if (!file) return;
    setEstimating(true);
    try {
      const durationSeconds = 600; // Mock 10 mins if metadata cannot be read
      const res = await fetch("/api/estimate-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          durationSeconds,
          removeWatermark,
          autoTranslate: autoTranslateAfterExtract,
          selectedLangs,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEstimatedCost({
          total: data.totalCostUsd,
          breakdown: data.breakdown,
        });
      }
    } catch {
      /* ignore */
    } finally {
      setEstimating(false);
    }
  };

  useEffect(() => {
    if (extractionMode === "video_ocr" && ocrVideoFile) {
      estimateExtractionCost(ocrVideoFile, "ocr");
    } else if (extractionMode === "stt" && sttFile) {
      estimateExtractionCost(sttFile, "stt");
    } else {
      setEstimatedCost(null);
    }
  }, [
    extractionMode,
    ocrVideoFile,
    sttFile,
    removeWatermark,
    autoTranslateAfterExtract,
    selectedLangs,
    syncAudio,
  ]);

  const clearVideo = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl("");
    setTrackUrls({});
  };

  const useOcrForTranslation = useCallback(() => {
    const textToUse = ocrResult || subtitleContent;
    if (!textToUse || textToUse === "KHONG_TIM_THAY_CHU") return;
    setSubtitleContent(textToUse);
    setFileName("");
    setTranslationResults({});
    setConfidenceScores([]);
    router.push("/translate");
  }, [ocrResult, subtitleContent, router]);

  // Download logic helper
  const downloadResult = useCallback(
    (langCode: string, content: string) => {
      const baseName = fileName ? fileName.replace(/\.(srt|vtt)$/i, "") : "subtitle";
      let formattedContent = content;
      let finalExt = ".srt";

      if (exportFormat === "vtt") {
        const { convertSrtToVtt } = require("@/lib/subtitle");
        formattedContent = convertSrtToVtt(content);
        finalExt = ".vtt";
      } else if (exportFormat === "srt") {
        const { convertVttToSrt } = require("@/lib/subtitle");
        formattedContent = convertVttToSrt(content);
        finalExt = ".srt";
      } else if (exportFormat === "txt") {
        const { convertToTxt } = require("@/lib/subtitle");
        formattedContent = convertToTxt(content);
        finalExt = ".txt";
      }

      const blob = new Blob([formattedContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}_${langCode}${finalExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Đã tải ${baseName}_${langCode}${finalExt}`, "success");
    },
    [fileName, exportFormat, showToast]
  );

  const toggleLang = useCallback((code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);


  // Scroll to bottom of logs in progress modal
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeJobLogs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contextValue = useMemo(() => ({
    uiLang,
    setUiLang,
    theme,
    setTheme,
    confirmDialog,
    setConfirmDialog,
    isGeminiKeyModalOpen,
    setIsGeminiKeyModalOpen,
    toasts,
    showToast,
    pythonServiceHealthy,
    subtitleContent,
    setSubtitleContent,
    fileName,
    setFileName,
    selectedLangs,
    setSelectedLangs,
    translationResults,
    setTranslationResults,
    confidenceScores,
    setConfidenceScores,
    activeResultTab,
    setActiveResultTab,
    exportFormat,
    setExportFormat,
    videoFile,
    setVideoFile,
    videoUrl,
    setVideoUrl,
    trackUrls,
    setTrackUrls,
    clearVideo,
    fileQueue,
    setFileQueue,
    isBatchTranslating,
    setIsBatchTranslating,
    glossary,
    setGlossary,
    glossInputOriginal,
    setGlossInputOriginal,
    glossInputTranslation,
    setGlossInputTranslation,
    addGlossaryItem,
    removeGlossaryItem,
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
    estimatedCost,
    setEstimatedCost,
    estimating,
    activeJobId,
    activeJobStatus,
    activeJobLogs,
    activeJobError,
    jobProgressPercent,
    startActiveJobPolling,
    cancelActiveJob,
    retryActiveJob,
    setActiveJobId,
    setActiveJobStatus,
    setJobProgressPercent,
    setActiveJobLogs,
    setActiveJobError,
    dubVideoFile,
    setDubVideoFile,
    dubSubtitleContent,
    setDubSubtitleContent,
    dubSubtitleFileName,
    setDubSubtitleFileName,
    dubVoiceId,
    setDubVoiceId,
    playingVoiceCode,
    setPlayingVoiceCode,
    audioPlayer,
    setAudioPlayer,
    dubClientPause,
    setDubClientPause,
    dubStyle,
    setDubStyle,
    dubTargetLang,
    setDubTargetLang,
    dubEstimatedCost,
    setDubEstimatedCost,
    dubEstimating,
    setDubEstimating,
    dubIsDragOverVideo,
    setDubIsDragOverVideo,
    dubIsDragOverSrt,
    setDubIsDragOverSrt,
    dubSubSource,
    setDubSubSource,
    dubOriginalLang,
    setDubOriginalLang,
    dubVideoQueue,
    setDubVideoQueue,
    dubProcessingMode,
    setDubProcessingMode,
    customVoices,
    vbeeVoices,
    vbeeVoicesLoading,
    showAddVoiceModal,
    setShowAddVoiceModal,
    newVoiceName,
    setNewVoiceName,
    newVoiceText,
    setNewVoiceText,
    newVoiceAudio,
    setNewVoiceAudio,
    isAddingVoice,
    fetchVoices,
    deleteCustomVoice,
    addCustomVoice,
    dubJobId,
    setDubJobId,
    dubJobStatus,
    setDubJobStatus,
    dubJobLogs,
    setDubJobLogs,
    dubJobError,
    setDubJobError,
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
    editorIsDragOverVideo,
    setEditorIsDragOverVideo,
    editorIsDragOverSrt,
    setEditorIsDragOverSrt,
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
    historyItems,
    setHistoryItems,
    historyLoading,
    setHistoryLoading,
    expandedHistory,
    setExpandedHistory,
    historyDetailTab,
    setHistoryDetailTab,
    costSummary,
    costLoading,
    fetchHistory,
    loadCostSummary,
    estimateExtractionCost,
    useOcrForTranslation,
    downloadResult,
    toggleLang,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    uiLang, theme, confirmDialog, isGeminiKeyModalOpen, toasts, pythonServiceHealthy,
    subtitleContent, fileName, selectedLangs, translationResults, confidenceScores,
    activeResultTab, exportFormat, videoFile, videoUrl, trackUrls, fileQueue, isBatchTranslating,
    glossary, glossInputOriginal, glossInputTranslation, addGlossaryItem, removeGlossaryItem,
    extractionMode, ocrImage, ocrImagePreview, ocrResult, ocrLoading, ocrError,
    ocrImageConfidence, isOcrDragOver, ocrVideoFile, ocrVideoPreviewUrl, ocrSourceLang,
    removeWatermark, autoTranslateAfterExtract, syncAudio, cropX, cropY, cropWidth, cropHeight,
    sttFile, sttPreviewUrl, sttSourceLang, estimatedCost, estimating,
    activeJobId, activeJobStatus, activeJobLogs, activeJobError, jobProgressPercent,
    startActiveJobPolling, cancelActiveJob, retryActiveJob,
    dubVideoFile, dubSubtitleContent, dubSubtitleFileName, dubVoiceId, playingVoiceCode,
    audioPlayer, dubClientPause, dubStyle, dubTargetLang, dubEstimatedCost, dubEstimating,
    dubIsDragOverVideo, dubIsDragOverSrt, dubSubSource, dubOriginalLang, dubVideoQueue, dubProcessingMode,
    customVoices, vbeeVoices, vbeeVoicesLoading, showAddVoiceModal, newVoiceName, newVoiceText,
    newVoiceAudio, isAddingVoice, fetchVoices, deleteCustomVoice, addCustomVoice,
    dubJobId, dubJobStatus, dubJobLogs, dubJobError,
    editorBlocks, editorUndoStack, editorVideoFile, editorVideoUrl, editorActiveLineIdx,
    editorSrtFileName, editorHasAdvancedEffects, editorGlobalShiftVal, editorScaleVal,
    editorIsDragOverVideo, editorIsDragOverSrt,
    burnInFontSizeOption, burnInPosition, burnInColor, burnInLangCode,
    burnInJobId, burnInJobStatus, burnInJobLogs, burnInJobError, burnInProgressPercent,
    historyItems, historyLoading, expandedHistory, historyDetailTab, costSummary, costLoading,
    fetchHistory, loadCostSummary, estimateExtractionCost, useOcrForTranslation, downloadResult,
    showToast, clearVideo, toggleLang,
    setUiLang, setTheme, setConfirmDialog, setIsGeminiKeyModalOpen,
  ]);

  return (
    <SubLingoContext.Provider value={contextValue}>
      {children}

      {/* Global Shared Toasts Overlay */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === "success" ? "toast-success" : ""}`}>
            {t.type === "success" && <Check size={14} style={{ color: "var(--accent-mint)" }} />}
            {t.type === "error" && <AlertCircle size={14} style={{ color: "var(--accent-rose)" }} />}
            {t.message}
          </div>
        ))}
      </div>

      {/* Global Shared Confirm Dialog */}
      {confirmDialog && (
        <div className="dialog-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.message}</p>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setConfirmDialog(null)} style={{ cursor: "pointer" }}>
                Huỷ
              </button>
              <button className="btn btn-danger" onClick={confirmDialog.onConfirm} style={{ cursor: "pointer" }}>
                <Trash2 size={14} /> Xoá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Shared Progress Polling Modal for OCR & STT */}
      {(activeJobId !== null || activeJobStatus !== "idle") && (
        <div className="dialog-overlay" style={{ zIndex: 1000 }}>
          <div
            className="dialog"
            style={{
              width: "90%",
              maxWidth: "600px",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {activeJobStatus === "queued" && (
                <>
                  <div className="spinner" /> ⏳ Job đang chờ xử lý...
                </>
              )}
              {activeJobStatus === "processing" && (
                <>
                  <div className="spinner" /> ⏳ Đang xử lý video/audio...
                </>
              )}
              {activeJobStatus === "done" && (
                <>
                  <Check size={18} className="mint" /> ✓ Xử lý thành công!
                </>
              )}
              {activeJobStatus === "error" && (
                <>
                  <AlertCircle size={18} className="rose" /> ✗ Gặp lỗi khi xử lý
                </>
              )}
            </h3>

            <div
              style={{
                width: "100%",
                height: "8px",
                background: "rgba(252,248,240,0.05)",
                borderRadius: "4px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: activeJobStatus === "error" ? "var(--accent-rose)" : "var(--accent-gold)",
                  width: `${activeJobStatus === "queued" ? 5 : activeJobStatus === "done" ? 100 : jobProgressPercent}%`,
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            {activeJobError && (
              <div className="alert alert-error" style={{ padding: "0.75rem", fontSize: "0.8rem" }}>
                <AlertCircle size={14} className="alert-icon" />
                <div className="alert-content">{activeJobError}</div>
              </div>
            )}

            <div
              ref={logContainerRef}
              style={{
                background: "#09080b",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem",
                height: "200px",
                overflowY: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "#ece8e1",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              {activeJobLogs.length === 0 ? (
                <div style={{ color: "var(--text-muted)" }}>Đang nạp tiến trình...</div>
              ) : (
                activeJobLogs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      color:
                        log.includes("Lỗi") || log.includes("✗")
                          ? "var(--accent-rose)"
                          : log.includes("✓")
                          ? "var(--accent-mint)"
                          : undefined,
                    }}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                borderTop: "1px solid var(--border)",
                paddingTop: "1rem",
              }}
            >
              {activeJobStatus === "error" && (
                <button className="btn" onClick={retryActiveJob} style={{ cursor: "pointer" }}>
                  <RefreshCw size={13} /> Thử lại
                </button>
              )}
              {activeJobStatus === "done" ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setActiveJobId(null);
                    setActiveJobStatus("idle");
                  }}
                  style={{ cursor: "pointer" }}
                >
                  Xem kết quả
                </button>
              ) : (
                <button
                  className={`btn ${activeJobStatus === "error" ? "btn-danger" : ""}`}
                  onClick={cancelActiveJob}
                  style={{ cursor: "pointer" }}
                >
                  {activeJobStatus === "error" ? "Đóng & Xoá nháp" : "Huỷ Job"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shared Cloned Voice Adding Modal */}
      {showAddVoiceModal && (
        <div
          className="dialog-overlay"
          onClick={() => setShowAddVoiceModal(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="dialog"
            style={{
              width: "90%",
              maxWidth: "500px",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Mic size={18} className="gold" /> Thêm giọng nói nhân bản mới
              </h3>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "0.25rem",
                }}
                onClick={() => setShowAddVoiceModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                background: "rgba(52,211,153,0.06)",
                border: "1px solid rgba(52,211,153,0.2)",
                borderRadius: "var(--radius-sm)",
                padding: "0.65rem 0.85rem",
                fontSize: "0.78rem",
                color: "var(--accent-mint)",
                lineHeight: "1.4",
              }}
            >
              💡 <strong>Để giọng nhân bản chất lượng tốt nhất:</strong> ghi âm ở nơi yên tĩnh, không có tiếng ồn/nhạc nền, phát âm rõ ràng, tốc độ nói bình thường, dài 3-5 giây.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>
                  Tên giọng nói (Gợi nhớ):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Giọng chị Mai, Giọng anh Nam..."
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>
                  Kịch bản đọc mẫu (Tùy chọn):
                </label>
                <textarea
                  rows={2}
                  placeholder="Đọc đoạn này khi ghi âm..."
                  value={newVoiceText}
                  onChange={(e) => setNewVoiceText(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text)",
                    fontSize: "0.85rem",
                    resize: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>
                  File âm thanh ghi âm mẫu (.mp3, .wav, .m4a):
                </label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setNewVoiceAudio(e.target.files[0]);
                    }
                  }}
                  style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <button className="btn" onClick={() => setShowAddVoiceModal(false)} style={{ cursor: "pointer" }}>
                Hủy
              </button>
              <button
                className="btn btn-primary"
                onClick={addCustomVoice}
                disabled={isAddingVoice || !newVoiceName || !newVoiceAudio}
                style={{ cursor: "pointer" }}
              >
                {isAddingVoice ? "Đang tải lên..." : "Tải lên & Khởi tạo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SubLingoContext.Provider>
  );
};

export const useSubLingo = () => {
  const context = useContext(SubLingoContext);
  if (context === undefined) {
    throw new Error("useSubLingo must be used within a SubLingoProvider");
  }
  return context;
};
