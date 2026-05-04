"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { createClient } from "@/lib/supabaseClient";
import { palette, neutral, derived } from "@/styles/tokens/colors";
import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";

function normalizeAdminPath(pathname: string): string {
  if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
    if (pathname === "/admin/v2") return "/adminV2/workspace";
    return `/adminV2${pathname.slice("/admin/v2".length)}`;
  }
  if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
    return `/adminV2${pathname.slice("/adminv2".length)}`;
  }
  return pathname;
}

const WORK_UNIT_QUEUE_PATH = /^\/adminV2\/workspace\/dept\/[^/]+\/work-unit\/[^/]+\/?$/;

export default function TopNavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const normalizedPath = useMemo(() => normalizeAdminPath(pathname), [pathname]);

  const isQueueContext = WORK_UNIT_QUEUE_PATH.test(normalizedPath);
  const isWorkspaceOverview =
    (normalizedPath === "/adminV2/workspace" ||
      /^\/adminV2\/workspace\/dept\/[^/]+\/?$/.test(normalizedPath)) &&
    !isQueueContext;
  const isAiActivity = normalizedPath === "/adminV2/ai-activity";
  const isMessaging = normalizedPath === "/adminV2/messages";

  const queueHref = useMemo(() => {
    if (isQueueContext) {
      const qs = searchParams?.toString() ?? "";
      return qs ? `${normalizedPath}?${qs}` : normalizedPath;
    }
    return "/adminV2/workspace";
  }, [isQueueContext, normalizedPath, searchParams]);

  const tabStyle = (active: boolean) =>
    active
      ? { backgroundColor: derived.tabActiveOnPrimary, color: neutral.surface }
      : { opacity: 0.88, color: neutral.surface };

  const secondaryTabStyle = (active: boolean) =>
    active
      ? { backgroundColor: "rgba(255,255,255,0.14)", color: neutral.surface, opacity: 1 }
      : { opacity: 0.55, color: neutral.surface };

  const onSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

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
        <AdminV2NavLink
          href="/adminV2/workspace"
          active={isWorkspaceOverview}
          className="px-2 py-1 rounded text-xs font-medium"
          style={tabStyle(isWorkspaceOverview)}
        >
          Overview
        </AdminV2NavLink>
        <AdminV2NavLink
          href={queueHref}
          active={isQueueContext}
          className="px-2 py-1 rounded text-xs font-medium"
          style={tabStyle(isQueueContext)}
          title="Opens the current work unit queue when you are in workspace queue context; otherwise Workspace."
          onClick={() => {
            if (queueHref.includes("/work-unit/")) markWorkUnitNavigationStart();
          }}
        >
          Queue
        </AdminV2NavLink>
        <AdminV2NavLink
          href="/adminV2/messages"
          active={isMessaging}
          className="px-2 py-1 rounded text-[11px] font-normal"
          style={secondaryTabStyle(isMessaging)}
          title="Messaging (V1 scaffold — global inbox deferred)"
        >
          Messages
        </AdminV2NavLink>
        <AdminV2NavLink
          href="/adminV2/ai-activity"
          active={isAiActivity}
          className="px-2 py-1 rounded text-[11px] font-normal"
          style={secondaryTabStyle(isAiActivity)}
          title="Full AI apply history (recent actions also appear above the command bar)"
        >
          AI log
        </AdminV2NavLink>
      </nav>
      <button
        type="button"
        onClick={onSignOut}
        className="px-2 py-1 rounded text-[11px] font-medium"
        style={{ opacity: 0.78, color: neutral.surface, border: `1px solid ${derived.topBarDivider}` }}
      >
        Sign out
      </button>
    </header>
  );
}
