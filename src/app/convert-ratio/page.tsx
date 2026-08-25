"use client";

import { useSubLingo } from "@/context/SubLingoContext";
import { ConvertRatioSection } from "@/components/features/convert-ratio/ConvertRatioSection";
import { ExploreFeatures } from "@/components/common/ExploreFeatures";

export default function ConvertRatioPage() {
  const ctx = useSubLingo();

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          {ctx.uiLang === "vi" ? "Biến đổi Tỷ lệ Video 16:9 ➔ 9:16" : "Convert Video 16:9 to 9:16"}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
          {ctx.uiLang === "vi"
            ? "Biến video Ngang 16:9 thành Video Dọc 9:16 đăng TikTok / Facebook Reels / Youtube Shorts với hiệu ứng Nền mờ CapCut nghệ thuật"
            : "Convert 16:9 Landscape videos to 9:16 Vertical format for TikTok / Reels / Shorts with CapCut Blur Background"}
        </p>
      </div>

      <ConvertRatioSection showToast={ctx.showToast} />

      <ExploreFeatures currentPath="/convert-ratio" uiLang={ctx.uiLang} />
    </div>
  );
}
