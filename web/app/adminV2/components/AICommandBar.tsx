"use client";

import { neutral, brand, derived } from "@/styles/tokens/colors";

const BAR_MAX_WIDTH = 720;

export default function AICommandBar() {
  return (
    <footer
      className="flex justify-center items-center flex-shrink-0 h-14 px-4 border-t"
      style={{
        backgroundColor: neutral.surface,
        borderColor: derived.border,
        boxShadow: derived.panelShadow,
      }}
    >
      <div
        className="flex items-center gap-3 w-full justify-center"
        style={{ maxWidth: BAR_MAX_WIDTH }}
      >
        <div
          className="flex-1 min-w-0 rounded-lg px-4 py-2.5 flex items-center gap-2 border"
          style={{
            backgroundColor: neutral.background,
            borderColor: derived.border,
            color: derived.textSecondary,
            maxWidth: BAR_MAX_WIDTH - 48,
          }}
        >
          <span className="text-sm truncate">Ask or command…</span>
        </div>
        <span className="text-xs font-semibold shrink-0" style={{ color: brand.primary, letterSpacing: "0.04em" }}>
          AI
        </span>
      </div>
    </footer>
  );
}
