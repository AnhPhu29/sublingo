"use client";

import React, { useRef, useState } from "react";
import {
  Clapperboard,
  ScanText,
  Subtitles,
  FileText,
  Mic,
  Sparkles,
  History,
  Upload,
  Film,
  ArrowRight,
  CheckCircle2,
  Download,
  Copy,
} from "lucide-react";
import { OcrSection } from "@/components/features/ocr/OcrSection";
import { VoiceCloneSection } from "@/components/features/voice-clone/VoiceCloneSection";
import { useSubLingo } from "@/context/SubLingoContext";

export type StudioTab = "stt" | "voice-clone";

export const UnifiedStudioWorkspace: React.FC<{ initialTab?: any }> = ({ initialTab = "stt" }) => {
  const subLingo = useSubLingo();
  const [activeTab, setActiveTab] = useState<StudioTab>(
    initialTab === "voice-clone" ? "voice-clone" : "stt"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs: { id: StudioTab; label: string; sublabel: string; icon: any; color: string }[] = [
    { id: "stt", label: "Trích xuất Whisper STT", sublabel: "Whisper AI / PaddleOCR", icon: ScanText, color: "#3B82F6" },
    { id: "voice-clone", label: "Quản lý Voice Clone", sublabel: "Tạo giọng đọc tùy chỉnh", icon: Sparkles, color: "#8B5CF6" },
  ];

  const activeMediaFile = subLingo.sttFile || subLingo.ocrVideoFile || subLingo.videoFile || subLingo.dubVideoFile || subLingo.editorVideoFile;

  const handleGlobalMediaUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    // Auto populate to ALL tool sections at once!
    subLingo.setSttFile(file);
    subLingo.setSttPreviewUrl(url);
    subLingo.setOcrVideoFile(file);
    subLingo.setOcrVideoPreviewUrl(url);
    subLingo.setVideoFile(file);
    subLingo.setVideoUrl(url);
    subLingo.setDubVideoFile(file);
    subLingo.setEditorVideoFile(file);
    subLingo.setEditorVideoUrl(url);
    subLingo.showToast(`🚀 Đã đồng bộ video "${file.name}" sang TẤT CẢ công cụ Studio!`, "success");
  };

  // Synchronize extracted / translated SRT across all tool sections
  const syncSrtToAllTools = (srtText: string) => {
    subLingo.setOcrResult(srtText);
    subLingo.setSubtitleContent(srtText);
    subLingo.setDubSubtitleContent(srtText);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      
      {/* 1. COMPACT UNIFIED STUDIO HEADER & STEPPER TABS */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "14px",
          padding: "10px 18px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left: Branding Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "linear-gradient(135deg, #2563EB, #8B5CF6)", width: 36, height: 36, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", boxShadow: "0 3px 10px rgba(37,99,235,0.3)" }}>
            <Clapperboard size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "#111827", letterSpacing: "-0.01em" }}>
              Trình soạn thảo Ghép Video &amp; Giọng đọc AI
            </h1>
            <p style={{ fontSize: "0.74rem", color: "#6B7280", margin: 0 }}>
              Biên tập &amp; hòa trộn Video với Voice AI, khớp thời gian &amp; chuẩn hóa âm thanh CapCut
            </p>
          </div>
        </div>

        {/* Center: Stepper Tabs */}
        <div style={{ display: "flex", gap: "6px", background: "#F9FAFB", padding: "4px", borderRadius: "10px", border: "1px solid #E5E7EB" }}>
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "8px",
                  border: "none",
                  background: isActive ? t.color : "transparent",
                  color: isActive ? "#FFFFFF" : "#6B7280",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  transition: "all 0.15s ease",
                  boxShadow: isActive ? `0 2px 8px ${t.color}40` : "none",
                }}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Quick Media Loader Button */}
        <div>
          {activeMediaFile ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(37,99,235,0.08)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.25)", padding: "0.35rem 0.75rem", borderRadius: "8px", fontSize: "0.76rem", fontWeight: 700 }}>
              <Film size={14} />
              <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeMediaFile.name}
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ background: "transparent", border: "none", color: "#2563EB", cursor: "pointer", fontSize: "0.72rem", textDecoration: "underline" }}
              >
                Đổi video
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "#2563EB", color: "#FFF", border: "none", borderRadius: "8px", padding: "0.45rem 0.9rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" }}
            >
              <Upload size={14} /> Nạp Video cho Studio
            </button>
          )}
          <input type="file" ref={fileInputRef} accept="video/*,audio/*" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleGlobalMediaUpload(file); }} />
        </div>
      </div>

      {/* 3. FULL UNCOMPROMISED FEATURE PANELS */}
      <div style={{ background: "transparent" }}>
        {activeTab === "stt" && (
          <OcrSection
            extractionMode={subLingo.extractionMode}
            setExtractionMode={subLingo.setExtractionMode}
            ocrImage={subLingo.ocrImage} setOcrImage={subLingo.setOcrImage} ocrImagePreview={subLingo.ocrImagePreview} setOcrImagePreview={subLingo.setOcrImagePreview}
            ocrResult={subLingo.ocrResult} setOcrResult={(text) => { subLingo.setOcrResult(text); syncSrtToAllTools(text); }}
            ocrLoading={subLingo.ocrLoading} setOcrLoading={subLingo.setOcrLoading} ocrError={subLingo.ocrError} setOcrError={subLingo.setOcrError}
            ocrImageConfidence={subLingo.ocrImageConfidence} setOcrImageConfidence={subLingo.setOcrImageConfidence}
            isOcrDragOver={subLingo.isOcrDragOver} setIsOcrDragOver={subLingo.setIsOcrDragOver}
            ocrVideoFile={subLingo.ocrVideoFile} setOcrVideoFile={subLingo.setOcrVideoFile} ocrVideoPreviewUrl={subLingo.ocrVideoPreviewUrl} setOcrVideoPreviewUrl={subLingo.setOcrVideoPreviewUrl}
            ocrSourceLang={subLingo.ocrSourceLang} setOcrSourceLang={subLingo.setOcrSourceLang} removeWatermark={subLingo.removeWatermark} setRemoveWatermark={subLingo.setRemoveWatermark}
            autoTranslateAfterExtract={subLingo.autoTranslateAfterExtract} setAutoTranslateAfterExtract={subLingo.setAutoTranslateAfterExtract} syncAudio={subLingo.syncAudio} setSyncAudio={subLingo.setSyncAudio}
            cropX={subLingo.cropX} setCropX={subLingo.setCropX} cropY={subLingo.cropY} setCropY={subLingo.setCropY} cropWidth={subLingo.cropWidth} setCropWidth={subLingo.setCropWidth} cropHeight={subLingo.cropHeight} setCropHeight={subLingo.setCropHeight}
            sttFile={subLingo.sttFile} setSttFile={(f) => { subLingo.setSttFile(f); if (f) handleGlobalMediaUpload(f); }}
            sttPreviewUrl={subLingo.sttPreviewUrl} setSttPreviewUrl={subLingo.setSttPreviewUrl}
            sttSourceLang={subLingo.sttSourceLang} setSttSourceLang={subLingo.setSttSourceLang}
            selectedLangs={subLingo.selectedLangs} toggleLang={(code) => subLingo.setSelectedLangs([code])} glossary={subLingo.glossary}
            estimatedCost={subLingo.estimatedCost} setEstimatedCost={subLingo.setEstimatedCost} estimating={subLingo.estimating}
            activeJobId={subLingo.activeJobId} startPolling={subLingo.startActiveJobPolling} setActiveJobStatus={subLingo.setActiveJobStatus} setActiveJobError={subLingo.setActiveJobError} setActiveJobLogs={subLingo.setActiveJobLogs} setJobProgressPercent={subLingo.setJobProgressPercent}
            showToast={subLingo.showToast} useOcrForTranslation={() => { syncSrtToAllTools(subLingo.ocrResult); }} onOpenGeminiKeyModal={() => subLingo.setIsGeminiKeyModalOpen(true)} rawExtractedSubtitle={subLingo.ocrResult}
          />
        )}


        {activeTab === "voice-clone" && (
          <VoiceCloneSection />
        )}
      </div>

    </div>
  );
};
