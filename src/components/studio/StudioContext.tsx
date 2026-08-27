import React, { createContext, useContext, useState, useEffect } from "react";

export type StudioTab = "stt" | "translate" | "editor" | "dub" | "voice-clone" | "history";

export interface SubtitleBlock {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
  translatedText?: string;
}

interface StudioContextType {
  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;

  // Shared Media File & Preview
  mediaFile: File | null;
  setMediaFile: (file: File | null) => void;
  mediaPreviewUrl: string;
  setMediaPreviewUrl: (url: string) => void;

  // Subtitle Data
  originalSrt: string;
  setOriginalSrt: (srt: string) => void;
  translatedSrt: string;
  setTranslatedSrt: (srt: string) => void;
  subtitleBlocks: SubtitleBlock[];
  setSubtitleBlocks: React.Dispatch<React.SetStateAction<SubtitleBlock[]>>;

  // Active Block Tracking
  activeBlockId: number | null;
  setActiveBlockId: (id: number | null) => void;

  // Selected Target Languages
  selectedLangs: string[];
  setSelectedLangs: React.Dispatch<React.SetStateAction<string[]>>;

  // Dubbing & Custom Voice
  selectedVoiceId: string;
  setSelectedVoiceId: (id: string) => void;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export const StudioProvider: React.FC<{ children: React.ReactNode; initialTab?: StudioTab }> = ({
  children,
  initialTab = "stt",
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string>("");
  const [originalSrt, setOriginalSrt] = useState<string>("");
  const [translatedSrt, setTranslatedSrt] = useState<string>("");
  const [subtitleBlocks, setSubtitleBlocks] = useState<SubtitleBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["vi"]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("ngoc_huyen_cloned");

  // Parse SRT to blocks whenever originalSrt or translatedSrt updates
  useEffect(() => {
    const srt = originalSrt || "";
    if (!srt.trim()) {
      setSubtitleBlocks([]);
      return;
    }
    const blocks: SubtitleBlock[] = [];
    const rawBlocks = srt.trim().split(/\n\s*\n/);
    for (const raw of rawBlocks) {
      const lines = raw.trim().split("\n");
      if (lines.length < 2) continue;
      const idLine = lines[0].trim();
      const tsLine = lines[1]?.trim() || "";
      const tsMatch = tsLine.match(/(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})/);
      if (!tsMatch) continue;
      const toMs = (h: string, m: string, s: string, ms: string) =>
        parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
      const startMs = toMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4]);
      const endMs = toMs(tsMatch[5], tsMatch[6], tsMatch[7], tsMatch[8]);
      const text = lines.slice(2).join("\n").trim();
      blocks.push({ id: parseInt(idLine) || blocks.length + 1, startMs, endMs, text });
    }

    // Merge translated SRT lines if available
    if (translatedSrt.trim()) {
      const transRaw = translatedSrt.trim().split(/\n\s*\n/);
      transRaw.forEach((raw, i) => {
        const lines = raw.trim().split("\n");
        if (lines.length >= 3 && blocks[i]) {
          blocks[i].translatedText = lines.slice(2).join("\n").trim();
        }
      });
    }

    setSubtitleBlocks(blocks);
  }, [originalSrt, translatedSrt]);

  return (
    <StudioContext.Provider
      value={{
        activeTab,
        setActiveTab,
        mediaFile,
        setMediaFile,
        mediaPreviewUrl,
        setMediaPreviewUrl,
        originalSrt,
        setOriginalSrt,
        translatedSrt,
        setTranslatedSrt,
        subtitleBlocks,
        setSubtitleBlocks,
        activeBlockId,
        setActiveBlockId,
        selectedLangs,
        setSelectedLangs,
        selectedVoiceId,
        setSelectedVoiceId,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
};

export const useStudio = () => {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error("useStudio must be used within StudioProvider");
  }
  return ctx;
};
