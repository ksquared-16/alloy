"use client";

import { neutral, derived } from "@/styles/tokens/colors";

/**
 * Placeholder for KPI strip(s) above the canvas.
 * Future: AIKPIStrip, BusinessKPIStrip, KPIStatCard.
 */
export default function KPIStripPlaceholder() {
  return (
    <div
      className="flex items-center flex-shrink-0 h-12 px-4 gap-6 border-b"
      style={{
        backgroundColor: neutral.surface,
        borderColor: derived.border,
      }}
    >
      <span className="text-sm" style={{ color: derived.textSecondary }}>
        KPI strip
      </span>
    </div>
  );
}
