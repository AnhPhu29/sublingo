"use client";

import { useSubLingo } from "@/context/SubLingoContext";
import { ReaderSection } from "@/components/features/reader/ReaderSection";
import { ExploreFeatures } from "@/components/common/ExploreFeatures";

export default function ReaderPage() {
  const ctx = useSubLingo();

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text)" }}>
          {ctx.uiLang === "vi" ? "Đọc Sách PDF & Scan OCR" : "PDF Book Reader & OCR"}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
          {ctx.uiLang === "vi"
            ? "Tải lên hoặc dán link URL file PDF để trích xuất văn bản sắc nét, tự động OCR nhận diện trang scan và lưu tiến trình đọc"
            : "Upload or paste PDF URL to extract clean text, auto-OCR scanned pages, and save your reading progress"}
        </p>
      </div>

      <ReaderSection />

      <ExploreFeatures currentPath="/reader" uiLang={ctx.uiLang} />
    </div>
  );
}
