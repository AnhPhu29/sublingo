"use client";

import { useSubLingo } from "@/context/SubLingoContext";
import { MergeSection } from "@/components/features/merge/MergeSection";
import { ExploreFeatures } from "@/components/common/ExploreFeatures";

export default function MergePage() {
  const ctx = useSubLingo();

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          {ctx.uiLang === "vi" ? "Ghép nối nhiều Video" : "Merge Multiple Videos"}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
          {ctx.uiLang === "vi"
            ? "Tải lên các video ngắn, sắp xếp thứ tự và ghép nối thành 1 video hoàn chỉnh"
            : "Upload short clips, reorder them, and concatenate into one final video"}
        </p>
      </div>

      <MergeSection showToast={ctx.showToast} />

      <ExploreFeatures currentPath="/merge" uiLang={ctx.uiLang} />
    </div>
  );
}
