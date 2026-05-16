"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { createClient } from "@/lib/supabaseClient";
import { palette, neutral, derived } from "@/styles/tokens/colors";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import MyTasksModal from "@/app/adminV2/components/MyTasksModal";
import OperationalTasksNavBadge from "@/app/adminV2/components/OperationalTasksNavBadge";
import QuickMessageModal from "@/app/adminV2/components/QuickMessageModal";
import { MessageSquare } from "lucide-react";

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

function WorkspaceSiteFilterStrip({ normalizedPath }: { normalizedPath: string }) {
  const wf = useWorkspaceSiteFilter();
  if (!normalizedPath.startsWith("/adminV2/workspace")) return null;
  if (!wf?.bootstrap) return null;

  const { bootstrap, selectedSiteId, setSelectedSiteId } = wf;

  if (bootstrap.show_dropdown && bootstrap.sites.length > 1) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 min-w-0 max-w-[min(240px,28vw)]">
        <label htmlFor="adminv2-workspace-site-filter" className="sr-only">
          Site filter
        </label>
        <select
          id="adminv2-workspace-site-filter"
          value={selectedSiteId ?? ""}
          onChange={(e) => setSelectedSiteId(e.target.value === "" ? null : e.target.value)}
          className="min-w-0 flex-1 truncate rounded border px-2 py-1 text-[11px] font-medium outline-none focus:ring-1 focus:ring-white/35"
          style={{
            backgroundColor: derived.searchBgOnPrimary,
            borderColor: derived.topBarDivider,
            color: neutral.surface,
          }}
          title="View filter — narrows workspace data to one campus within your allowed sites (queue wiring deferred; see docs/sprints/05_2026/site_filter_workspace_card.md)."
        >
          <option value="">All locations</option>
          {bootstrap.sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (bootstrap.single_site_label) {
    return (
      <span
        className="shrink-0 truncate max-w-[min(200px,26vw)] text-[11px] font-medium opacity-90"
        title="Your access is scoped to this site."
      >
        {bootstrap.single_site_label}
      </span>
    );
  }

  return null;
}

export default function TopNavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [quickMessageOpen, setQuickMessageOpen] = useState(false);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  // NOTE:
  // Header-level unread indicators removed in V1.
  // Future notification system will use a dedicated bell icon with aggregated counts.

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/admin/communications/unread-count", { credentials: "include" });
        if (cancelled) return;
        await r.json().catch(() => ({}));
        // Response intentionally unused in UI; polling retained for a future header bell.
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 120_000);
    const onRefresh = () => void load();
    window.addEventListener("alloy-comms-unread-refresh", onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("alloy-comms-unread-refresh", onRefresh);
    };
  }, []);

  const normalizedPath = useMemo(() => normalizeAdminPath(pathname), [pathname]);

  const isQueueContext = WORK_UNIT_QUEUE_PATH.test(normalizedPath);
  const isWorkspaceOverviewExact = normalizedPath === "/adminV2/workspace";
  const isWorkspaceOverviewSection =
    (isWorkspaceOverviewExact ||
      /^\/adminV2\/workspace\/dept\/[^/]+\/?$/.test(normalizedPath)) &&
    !isQueueContext;
  const isAiActivity = normalizedPath === "/adminV2/ai-activity";
  const isMessaging = normalizedPath === "/adminV2/messages";

  /** Pathname only — avoids stale Next `searchParams` re-navigating work-unit queue tabs. */
  const queueHref = isQueueContext ? normalizedPath : "/adminV2/workspace";

  const tabStyle = (active: boolean) =>
    active
      ? { backgroundColor: derived.tabActiveOnPrimary, color: neutral.surface }
      : { opacity: 0.88, color: neutral.surface };

  const secondaryTabStyle = (active: boolean) =>
    active
      ? { backgroundColor: "rgba(255,255,255,0.16)", color: neutral.surface, opacity: 1 }
      : { opacity: 0.62, color: neutral.surface };

  const onSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header
      className="flex items-center h-12 flex-shrink-0 px-4 gap-3 border-b"
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
      <WorkspaceSiteFilterStrip normalizedPath={normalizedPath} />
      <div
        className="flex-1 max-w-md rounded-md px-3 py-1.5 text-sm"
        style={{
          backgroundColor: derived.searchBgOnPrimary,
          color: neutral.surface,
        }}
      >
        <span style={{ opacity: 0.92 }}>Search</span>
      </div>
      <nav className="flex items-center gap-1.5 shrink-0 pl-1" aria-label="Perspective tabs">
        <AdminV2NavLink
          href="/adminV2/workspace"
          active={isWorkspaceOverviewSection}
          className="px-2 py-1 rounded text-xs font-medium"
          style={tabStyle(isWorkspaceOverviewSection)}
        >
          Overview
        </AdminV2NavLink>
        {isQueueContext ? (
          <span
            className="adminv2-nav-link adminv2-nav-link--active px-2 py-1 rounded text-xs font-medium"
            style={tabStyle(true)}
            aria-current="page"
            title="Current work unit queue"
          >
            <span className="adminv2-nav-link__inner">Queue</span>
          </span>
        ) : (
          <AdminV2NavLink
            href={queueHref}
            active={false}
            className="px-2 py-1 rounded text-xs font-medium"
            style={tabStyle(false)}
            title="Workspace queue context"
          >
            Queue
          </AdminV2NavLink>
        )}
        <OperationalTasksNavBadge tabStyle={secondaryTabStyle} onOpenModal={() => setTasksModalOpen(true)} />
        <button
          type="button"
          onClick={() => setQuickMessageOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium leading-none"
          style={secondaryTabStyle(isMessaging || quickMessageOpen)}
          title="Send a quick email or SMS (opens modal)"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden strokeWidth={2} />
          Messages
        </button>
        <AdminV2NavLink
          href="/adminV2/ai-activity"
          active={isAiActivity}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium"
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
      <QuickMessageModal open={quickMessageOpen} onClose={() => setQuickMessageOpen(false)} />
      <MyTasksModal open={tasksModalOpen} onClose={() => setTasksModalOpen(false)} />
    </header>
  );
}
