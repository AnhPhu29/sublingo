"use client";

import { useSubLingo } from "@/context/SubLingoContext";
import { TtsSection } from "@/components/features/tts/TtsSection";
import { ExploreFeatures } from "@/components/common/ExploreFeatures";

export default function TtsPage() {
  const ctx = useSubLingo();

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          {ctx.uiLang === "vi" ? "Chuyển văn bản thành giọng nói (TTS)" : "Text to Speech (TTS)"}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
          {ctx.uiLang === "vi"
            ? "Nhập hoặc tải file văn bản, chọn giọng AI đọc độc lập, xuất file âm thanh MP3"
            : "Convert text to audio with AI voices, export standalone MP3 files"}
        </p>
      </div>

      <TtsSection
        vbeeVoices={ctx.vbeeVoices}
        vbeeVoicesLoading={ctx.vbeeVoicesLoading}
        customVoices={ctx.customVoices}
        showToast={ctx.showToast}
      />

      <ExploreFeatures currentPath="/tts" uiLang={ctx.uiLang} />
    </div>
  );
}
