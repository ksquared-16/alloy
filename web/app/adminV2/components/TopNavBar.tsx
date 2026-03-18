"use client";

import { palette, neutral, derived } from "@/styles/tokens/colors";

export default function TopNavBar() {
  return (
    <header
      className="flex items-center h-12 flex-shrink-0 px-4 gap-4 border-b"
      style={{
        backgroundColor: palette.midnightForge,
        borderColor: derived.topBarDivider,
        color: neutral.surface,
      }}
    >
      <div className="flex items-center shrink-0" aria-label="Alloy">
        <img
          src="/brand/alloy-brandmark-gradient.svg"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0"
        />
      </div>
      <div
        className="flex-1 max-w-md rounded-md px-3 py-1.5 text-sm"
        style={{
          backgroundColor: derived.searchBgOnPrimary,
          color: neutral.surface,
        }}
      >
        <span style={{ opacity: 0.92 }}>Search</span>
      </div>
      <nav className="flex items-center gap-1 shrink-0" aria-label="Perspective tabs">
        <span
          className="px-2 py-1 rounded text-xs font-medium"
          style={{ backgroundColor: derived.tabActiveOnPrimary, color: neutral.surface }}
        >
          Overview
        </span>
        <span className="px-2 py-1 rounded text-xs font-medium" style={{ opacity: 0.88, color: neutral.surface }}>
          AI Activity
        </span>
        <span className="px-2 py-1 rounded text-xs font-medium" style={{ opacity: 0.88, color: neutral.surface }}>
          Queue
        </span>
      </nav>
      <div
        className="shrink-0 w-8 h-8 rounded-full border"
        style={{ borderColor: derived.topBarDivider, backgroundColor: "rgba(255,255,255,0.08)" }}
        aria-hidden
      />
    </header>
  );
}
