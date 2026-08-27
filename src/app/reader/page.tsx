"use client";

import { useSubLingo } from "@/context/SubLingoContext";
import { ReaderSection } from "@/components/features/reader/ReaderSection";
import { ExploreFeatures } from "@/components/common/ExploreFeatures";

export default function ReaderPage() {
  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <ReaderSection />
    </div>
  );
}
