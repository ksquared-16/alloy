"use client";

import { neutral, brand, derived } from "@/styles/tokens/colors";

/**
 * AI command bar — pinned to bottom, persistent, visually distinct from top search.
 * Search lives in TopNavBar; this is for natural language commands only.
 */
export default function AICommandBar() {
  return (
    <footer
      className="flex items-center flex-shrink-0 h-14 px-4 border-t"
      style={{
        backgroundColor: neutral.surface,
        borderColor: derived.border,
        boxShadow: derived.panelShadow,
      }}
    >
      <div
        className="flex-1 max-w-2xl rounded-lg px-4 py-2.5 flex items-center gap-2 border"
        style={{
          backgroundColor: neutral.background,
          borderColor: derived.border,
          color: derived.textSecondary,
        }}
      >
        <span className="text-sm">Ask or command…</span>
      </div>
      <span className="text-xs ml-2" style={{ color: derived.textSecondary }}>
        AI
      </span>
    </footer>
  );
}
