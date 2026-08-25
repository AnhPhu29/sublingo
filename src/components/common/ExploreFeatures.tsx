"use client";

import React from "react";
import Link from "next/link";
import { ScanText, Subtitles, Mic, History, Sparkles, Smartphone } from "lucide-react";

interface ExploreFeaturesProps {
  currentPath: string;
  uiLang: "vi" | "en";
}

export const ExploreFeatures: React.FC<ExploreFeaturesProps> = ({ currentPath, uiLang }) => {
  const allFeatures = [
    {
      href: "/reader",
      label: uiLang === "vi" ? "Đọc sách PDF & Scan OCR" : "PDF Book Reader & OCR",
      desc: uiLang === "vi" ? "Đọc sách bản in 1:1, lật trang 3D và nghe giọng đọc AI" : "Read 1:1 PDF book, 3D flip and AI audiobook",
      icon: ScanText,
    },
    {
      href: "/editor",
      label: uiLang === "vi" ? "Trình soạn thảo Phụ đề" : "Subtitle Editor Studio",
      desc: uiLang === "vi" ? "Chỉnh sửa phụ đề Timeline sóng âm thanh chuyên nghiệp" : "Professional waveform audio subtitle timeline",
      icon: Subtitles,
    },
    {
      href: "/convert-ratio",
      label: uiLang === "vi" ? "Biến đổi 16:9 ➔ 9:16" : "Convert 16:9 to 9:16",
      desc: uiLang === "vi" ? "Biến video Ngang thành Video Dọc TikTok/Reels với nền mờ CapCut" : "Convert landscape videos to 9:16 TikTok with blur background",
      icon: Smartphone,
    },
    {
      href: "/tts",
      label: uiLang === "vi" ? "Tạo giọng đọc AI (TTS)" : "Text to Speech (TTS)",
      desc: uiLang === "vi" ? "Chuyển văn bản thành giọng nói truyền cảm" : "Convert text to realistic AI speech",
      icon: Mic,
    },
    {
      href: "/extract",
      label: uiLang === "vi" ? "Trích xuất phụ đề" : "Extract Subtitle",
      desc: uiLang === "vi" ? "Trích xuất chữ từ video/âm thanh bằng AI" : "Extract text from video/audio using AI",
      icon: ScanText,
    },
    {
      href: "/voice-clone",
      label: uiLang === "vi" ? "Nhân bản giọng" : "Voice Cloning",
      desc: uiLang === "vi" ? "Tạo bản sao giọng nói phòng thu chỉ từ 5s audio" : "Create studio voice clones from 5s audio sample",
      icon: Sparkles,
    },
  ];

  const featuresToDisplay = allFeatures.filter((f) => f.href !== currentPath).slice(0, 3);

  return (
    <div style={{ marginTop: "3rem", borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
        {uiLang === "vi" ? "Khám phá các tính năng khác" : "Explore Other Features"}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        {featuresToDisplay.map((feat) => (
          <Link
            key={feat.href}
            href={feat.href}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "1rem",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "inherit",
              textDecoration: "none",
              transition: "all 0.2s ease",
            }}
            className="explore-card"
          >
            <div
              style={{
                background: "var(--accent-gold-dim)",
                color: "var(--accent-gold)",
                padding: "0.5rem",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <feat.icon size={18} />
            </div>
            <div>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 600, margin: "0 0 0.15rem 0" }}>{feat.label}</h4>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0, lineHeight: "1.3" }}>
                {feat.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
