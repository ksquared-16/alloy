"use client";

import { neutral, brand, derived } from "@/styles/tokens/colors";

const BAR_MAX_WIDTH = 720;

export default function AICommandBar() {
  return (
    <footer
      data-adminv2-ai-command-bar
      role="contentinfo"
      aria-label="AI command bar"
      className="flex justify-center items-center flex-shrink-0 min-h-[52px] py-2 px-4 border-t-2 rounded-t-xl"
      style={{
        background: `linear-gradient(180deg, ${derived.adminV2AiBarPineWash} 0%, ${neutral.surface} 38%, ${neutral.surface} 100%)`,
        borderColor: derived.adminV2AiBarPineBorder,
        boxShadow: `0 -4px 18px rgba(0, 162, 131, 0.07), ${derived.panelShadow}`,
      }}
    >
      <div
        className="flex items-center gap-3 w-full justify-center"
        style={{ maxWidth: BAR_MAX_WIDTH }}
      >
        <div
          className="flex-1 min-w-0 rounded-xl px-4 py-3 flex items-center gap-2 border-2 bg-white"
          style={{
            borderColor: derived.adminV2AiInputPineRing,
            color: derived.textSecondary,
            maxWidth: BAR_MAX_WIDTH - 52,
            boxShadow: `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
          }}
        >
          <span className="text-sm truncate font-medium" style={{ color: neutral.textPrimary, opacity: 0.88 }}>
            Ask or command…
          </span>
        </div>
        <span
          className="text-[11px] font-bold shrink-0 tracking-widest px-3 py-2 rounded-lg text-white"
          style={{
            backgroundColor: brand.secondary,
            letterSpacing: "0.14em",
            boxShadow: `0 2px 8px rgba(0, 162, 131, 0.35)`,
          }}
        >
          AI
        </span>
      </div>
    </footer>
  );
}
