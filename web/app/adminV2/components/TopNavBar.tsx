"use client";

import { useEffect, useMemo, useState } from "react";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { usePathname } from "next/navigation";
import {
    ADMIN_FORMS_HREF,
    isCanonicalFormsPath,
    isCanonicalWorkspacePath,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import { palette, neutral, derived } from "@/styles/tokens/colors";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import AdminV2ProfileMenu from "@/app/adminV2/components/AdminV2ProfileMenu";
import TopNavNotificationsLink from "@/app/adminV2/components/TopNavNotificationsLink";
import GlobalSearchBox from "@/app/adminV2/components/GlobalSearchBox";
import MyTasksModal from "@/app/adminV2/components/MyTasksModal";
import InboxModal from "@/app/adminV2/components/InboxModal";
import ProcessingModal from "@/app/adminV2/processing/ProcessingModal";
import QuickMessageModal, { type QuickMessageModalSeed } from "@/app/adminV2/components/QuickMessageModal";
import {
    ADMINV2_OPEN_QUICK_MESSAGE_EVENT,
    type QuickMessageLaunchSeed,
} from "@/lib/adminV2/quickMessageLaunch";

function normalizeAdminPath(pathname: string): string {
  return normalizeToCanonicalAdminPath(pathname);
}

function isWorkspaceOperatorPath(normalizedPath: string): boolean {
  return isCanonicalWorkspacePath(normalizedPath) || isCanonicalFormsPath(normalizedPath);
}

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
  const showSiteFilter = isWorkspaceOperatorPath(normalizedPath);
  if (!showSiteFilter) return null;

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
  const [inboxModalOpen, setInboxModalOpen] = useState(false);
  const [processingModalOpen, setProcessingModalOpen] = useState(false);

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
        recordScoped: detail.recordScoped ?? Boolean(opportunityId),
        defaultChannel: detail.defaultChannel,
      });
      setQuickMessageOpen(true);
    };
    window.addEventListener(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, onLaunch);
    return () => window.removeEventListener(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, onLaunch);
  }, []);

  useEffect(() => {
    const onOpenTasks = () => {
      if (!isOperationalWorkV1Enabled()) return;
      prefetchWorkspaceOperationalTasks("open");
      setTasksModalOpen(true);
    };
    const onOpenInbox = () => setInboxModalOpen(true);
    const onOpenProcessing = () => setProcessingModalOpen(true);
    window.addEventListener("adminv2:open-tasks-panel", onOpenTasks);
    window.addEventListener("adminv2:open-inbox-modal", onOpenInbox);
    window.addEventListener("adminv2:open-processing-modal", onOpenProcessing);
    return () => {
      window.removeEventListener("adminv2:open-tasks-panel", onOpenTasks);
      window.removeEventListener("adminv2:open-inbox-modal", onOpenInbox);
      window.removeEventListener("adminv2:open-processing-modal", onOpenProcessing);
    };
  }, []);

  useEffect(() => {
    if (!isOperationalWorkV1Enabled()) return;
    const cancelDefer = runWhenAdminV2PrimarySurfaceReady(
      () => prefetchWorkspaceOperationalTasks("open"),
      "operational_tasks_topnav_prefetch"
    );
    return cancelDefer;
  }, []);

  const normalizedPath = useMemo(() => normalizeAdminPath(pathname), [pathname]);

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
        <GlobalSearchBox />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <WorkspaceSiteFilterStrip normalizedPath={normalizedPath} />
        <TopNavNotificationsLink />
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
      <InboxModal open={inboxModalOpen} onClose={() => setInboxModalOpen(false)} />
      <ProcessingModal open={processingModalOpen} onClose={() => setProcessingModalOpen(false)} />
    </header>
  );
}
