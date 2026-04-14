"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { palette, neutral, derived } from "@/styles/tokens/colors";

export default function TopNavBar() {
  const pathname = usePathname();
  const isWorkspace =
    pathname === "/adminV2/workspace" ||
    pathname.startsWith("/adminV2/workspace/") ||
    pathname === "/admin/v2" ||
    pathname === "/admin/v2/workspace" ||
    pathname.startsWith("/admin/v2/workspace/");
  const isAiActivity = pathname === "/adminV2/ai-activity" || pathname === "/admin/v2/ai-activity";

  const tabStyle = (active: boolean) =>
    active
      ? { backgroundColor: derived.tabActiveOnPrimary, color: neutral.surface }
      : { opacity: 0.88, color: neutral.surface };

  const secondaryTabStyle = (active: boolean) =>
    active
      ? { backgroundColor: "rgba(255,255,255,0.14)", color: neutral.surface, opacity: 1 }
      : { opacity: 0.55, color: neutral.surface };

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
        <Link
          href="/admin/v2/workspace"
          className="px-2 py-1 rounded text-xs font-medium"
          style={tabStyle(isWorkspace)}
        >
          Overview
        </Link>
        <Link
          href="/admin/v2/ai-activity"
          className="px-2 py-1 rounded text-[11px] font-normal"
          style={secondaryTabStyle(isAiActivity)}
          title="Full AI apply history (recent actions also appear above the command bar)"
        >
          AI log
        </Link>
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
