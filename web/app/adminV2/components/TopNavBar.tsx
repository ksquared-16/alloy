"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { usePathname } from "next/navigation";
import { palette, neutral, derived } from "@/styles/tokens/colors";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import MyTasksModal from "@/app/adminV2/components/MyTasksModal";
import OperationalTasksNavBadge from "@/app/adminV2/components/OperationalTasksNavBadge";
import QuickMessageModal, { type QuickMessageModalSeed } from "@/app/adminV2/components/QuickMessageModal";
import {
    ADMINV2_OPEN_QUICK_MESSAGE_EVENT,
    type QuickMessageLaunchSeed,
} from "@/lib/adminV2/quickMessageLaunch";
import AdminV2ProfileMenu from "@/app/adminV2/components/AdminV2ProfileMenu";
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

const HEADER_UTILITY_BTN =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[15px] font-medium leading-none";

/** Fixed-width reserve so location chrome does not jump when bootstrap revalidates. */
function WorkspaceSiteFilterLocationReserve() {
  return (
    <div
      className="flex shrink-0 items-center min-w-[min(280px,34vw)] max-w-[min(280px,34vw)] h-[2.375rem]"
      aria-hidden
    >
      <div className="h-[2.375rem] w-full rounded-md opacity-40" style={{ backgroundColor: derived.searchBgOnPrimary }} />
    </div>
  );
}

function WorkspaceSiteFilterStrip({ normalizedPath }: { normalizedPath: string }) {
  const wf = useWorkspaceSiteFilter();
  if (!normalizedPath.startsWith("/adminV2/workspace")) return null;

  const bootstrap = wf?.displayBootstrap ?? wf?.bootstrap ?? null;
  if (!bootstrap || !wf) {
    return <WorkspaceSiteFilterLocationReserve />;
  }

  const { selectedSiteId, setSelectedSiteId } = wf;

  if (bootstrap.show_dropdown && bootstrap.sites.length > 1) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 min-w-0 max-w-[min(280px,34vw)]">
        <label htmlFor="adminv2-workspace-site-filter" className="sr-only">
          Site filter
        </label>
        <select
          id="adminv2-workspace-site-filter"
          value={selectedSiteId ?? ""}
          onChange={(e) => setSelectedSiteId(e.target.value === "" ? null : e.target.value)}
          className="min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-[15px] font-medium outline-none focus:ring-1 focus:ring-white/35"
          style={{
            backgroundColor: derived.searchBgOnPrimary,
            borderColor: derived.topBarDivider,
            color: neutral.surface,
          }}
          title="View filter — narrows workspace data to one campus within your allowed sites. Selection persists across workspace navigation."
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
        className="shrink-0 truncate max-w-[min(240px,32vw)] text-[15px] font-medium opacity-90"
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
  const [quickMessageOpen, setQuickMessageOpen] = useState(false);
  const [quickMessageSeed, setQuickMessageSeed] = useState<QuickMessageModalSeed | null>(null);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);

  useEffect(() => {
    const onLaunch = (ev: Event) => {
      const detail = (ev as CustomEvent<QuickMessageLaunchSeed>).detail;
      const personId = detail?.personId?.trim() || null;
      const opportunityId = detail?.opportunityId?.trim() || null;
      if (!personId && !opportunityId) return;
      setQuickMessageSeed({
        personId: personId ?? undefined,
        opportunityId,
        recordDisplayName: detail.recordDisplayName ?? detail.displayName ?? null,
        displayName: detail.displayName,
        email: detail.email,
        phone: detail.phone,
        contextualOnly: Boolean(opportunityId && !personId),
      });
      setQuickMessageOpen(true);
    };
    window.addEventListener(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, onLaunch);
    return () => window.removeEventListener(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, onLaunch);
  }, []);

  useEffect(() => {
    if (!isTaskAssistV1UiEnabled()) return;
    const cancelDefer = runWhenAdminV2PrimarySurfaceReady(
      () => prefetchWorkspaceOperationalTasks("open"),
      "operational_tasks_topnav_prefetch"
    );
    return cancelDefer;
  }, []);

  const openTasksModal = useCallback(() => {
    prefetchWorkspaceOperationalTasks("open");
    setTasksModalOpen(true);
  }, []);

  const normalizedPath = useMemo(() => normalizeAdminPath(pathname), [pathname]);
  const isMessaging = normalizedPath === "/adminV2/messages";

  const utilityBtnStyle = (active: boolean) =>
    active
      ? { backgroundColor: "rgba(255,255,255,0.16)", color: neutral.surface, opacity: 1 }
      : { opacity: 0.82, color: neutral.surface };

  return (
    <header
      className="adminv2-shell-header flex h-[3.75rem] flex-shrink-0 items-center gap-3 border-b px-4"
      style={{
        backgroundColor: palette.midnightForge,
        borderColor: derived.topBarDivider,
        color: neutral.surface,
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 items-center" aria-label="Alloy">
          <img
            src="/brand/alloy-brandmark-gradient.svg"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0"
          />
        </div>
        <div
          className="min-w-0 flex-1 max-w-xl rounded-md px-3.5 py-2.5 text-[15px]"
          style={{
            backgroundColor: derived.searchBgOnPrimary,
            color: neutral.surface,
          }}
        >
          <span className="opacity-90">Search</span>
        </div>
        <div className="hidden items-center gap-2 shrink-0 md:flex" aria-label="Quick actions">
          <OperationalTasksNavBadge
            tabStyle={utilityBtnStyle}
            buttonClassName={HEADER_UTILITY_BTN}
            onOpenModal={openTasksModal}
          />
          <button
            type="button"
            onClick={() => {
              setQuickMessageSeed(null);
              setQuickMessageOpen(true);
            }}
            className={HEADER_UTILITY_BTN}
            style={utilityBtnStyle(isMessaging || quickMessageOpen)}
            title="Send a quick email or SMS (opens modal)"
          >
            <MessageSquare className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden strokeWidth={2} />
            <span className="hidden lg:inline">Messages</span>
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <WorkspaceSiteFilterStrip normalizedPath={normalizedPath} />
        <AdminV2ProfileMenu />
      </div>

      <QuickMessageModal
        open={quickMessageOpen}
        seed={quickMessageSeed}
        onClose={() => {
          setQuickMessageOpen(false);
          setQuickMessageSeed(null);
        }}
      />
      <MyTasksModal open={tasksModalOpen} onClose={() => setTasksModalOpen(false)} />
    </header>
  );
}
