"use client";

import { brand, neutral, derived } from "@/styles/tokens/colors";

export default function TopNavBar() {
  return (
    <header
      className="flex items-center h-12 flex-shrink-0 px-4 gap-4 border-b"
      style={{
        backgroundColor: brand.primary,
        borderColor: derived.topBarDivider,
        color: neutral.surface,
      }}
    >
      <div className="flex items-center gap-2 shrink-0" aria-hidden>
        <span className="text-sm font-semibold">Alloy</span>
      </div>
      <div
        className="flex-1 max-w-md rounded-md px-3 py-1.5 text-sm"
        style={{
          backgroundColor: derived.searchBgOnPrimary,
          color: neutral.surface,
        }}
      >
        <span style={{ opacity: 0.9 }}>Search</span>
      </div>
      <nav className="flex items-center gap-1 shrink-0" aria-label="Perspective tabs">
        <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: derived.tabActiveOnPrimary }}>
          Overview
        </span>
        <span className="px-2 py-1 rounded text-xs font-medium" style={{ opacity: 0.85 }}>
          AI Activity
        </span>
        <span className="px-2 py-1 rounded text-xs font-medium" style={{ opacity: 0.85 }}>
          Queue
        </span>
      </nav>
      <div className="shrink-0 w-8 h-8 rounded-full border" style={{ borderColor: derived.topBarDivider }} aria-hidden />
    </header>
  );
}
