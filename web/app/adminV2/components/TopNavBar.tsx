"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
import { usePathname } from "next/navigation";
import {
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
import AnalyticsModal from "@/app/adminV2/components/AnalyticsModal";
import ProcessingModal from "@/app/adminV2/processing/ProcessingModal";
import SchedulingModal from "@/app/adminV2/components/SchedulingModal";
import { warmCommunicationsWorkspaceModal } from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import QuickMessageModal, { type QuickMessageModalSeed } from "@/app/adminV2/components/QuickMessageModal";
import {
    ADMINV2_OPEN_QUICK_MESSAGE_EVENT,
    type QuickMessageLaunchSeed,
} from "@/lib/adminV2/quickMessageLaunch";
import type { OpenProcessingModalDetail, ProcessingModalIntent } from "@/lib/adminV2/workspaceModalEvents";
import {
    closeWorkspaceModal,
    openWorkspaceModal,
    subscribeAdminV2WorkspaceModal,
    getAdminV2WorkspaceModalSnapshot,
} from "@/lib/adminV2/workspaceModalCoordinator";
import {
  parseWorkspaceModalIntent,
  WORKSPACE_MODAL_INTENT_PARAM,
} from "@/lib/adminV2/workspaceModalIntent";
import { AlloySelect } from "@/components/workspace/AlloySelect";

function normalizeAdminPath(pathname: string): string {
  return normalizeToCanonicalAdminPath(pathname);
}

function isWorkspaceOperatorPath(normalizedPath: string): boolean {
  return isCanonicalWorkspacePath(normalizedPath);
}

/** Fixed-width reserve so location chrome does not jump when bootstrap revalidates. */
function WorkspaceSiteFilterLocationReserve() {
  return (
    <div
      className="flex shrink-0 items-center min-w-[min(280px,34vw)] max-w-[min(280px,34vw)] h-[2.375rem]"
      aria-hidden
    >
      <div className="h-[2.375rem] w-full rounded-md border border-alloy-stone/30 bg-white opacity-70" />
    </div>
  );
}

function useClientHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function WorkspaceSiteFilterStrip({ normalizedPath }: { normalizedPath: string }) {
  const hydrated = useClientHydrated();
  const wf = useWorkspaceSiteFilter();
  const showSiteFilter = isWorkspaceOperatorPath(normalizedPath);
  if (!showSiteFilter) return null;

  const bootstrap = wf?.displayBootstrap ?? wf?.bootstrap ?? null;
  // Client-only bootstrap cache must not render select before hydration — SSR and first client paint match reserve.
  if (!hydrated || !bootstrap || !wf) {
    return <WorkspaceSiteFilterLocationReserve />;
  }

  const { selectedSiteId, setSelectedSiteId } = wf;

  if (bootstrap.show_dropdown && bootstrap.sites.length > 1) {
    const siteOptions = bootstrap.sites.map((s) => ({
      value: s.id,
      label: s.label?.trim() || s.id,
    }));
    return (
      <div
        className="flex shrink-0 items-center gap-1.5 min-w-0 max-w-[min(280px,34vw)]"
        data-adminv2-site-filter="true"
        title="View filter — narrows workspace data to one campus within your allowed sites. Selection persists across workspace navigation."
      >
        <AlloySelect
          id="adminv2-workspace-site-filter"
          aria-label="Site filter"
          value={selectedSiteId ?? ""}
          onChange={(next) => setSelectedSiteId(next === "" ? null : next)}
          options={siteOptions}
          placeholder="All locations"
          className="min-w-0 flex-1"
        />
      </div>
    );
  }

  if (bootstrap.single_site_label) {
    return (
      <span
        className="shrink-0 truncate max-w-[min(240px,32vw)] rounded-md border border-alloy-stone/30 bg-white px-3 py-2 text-[15px] font-medium text-alloy-bend-pine"
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
  const [quickMessageSeed, setQuickMessageSeed] = useState<QuickMessageModalSeed | null>(null);
  const [processingIntent, setProcessingIntent] = useState<ProcessingModalIntent | null>(null);
  const activeWorkspaceModal = useSyncExternalStore(
    subscribeAdminV2WorkspaceModal,
    () => getAdminV2WorkspaceModalSnapshot().active,
    () => null
  );
  const tasksModalOpen = activeWorkspaceModal === "tasks";
  const inboxModalOpen = activeWorkspaceModal === "inbox";
  const quickMessageOpen = activeWorkspaceModal === "quick_message";
  const analyticsModalOpen = activeWorkspaceModal === "analytics";
  const processingModalOpen = activeWorkspaceModal === "processing";
  const schedulingModalOpen = activeWorkspaceModal === "scheduling";

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
        draftSubject: detail.draftSubject ?? null,
        draftBody: detail.draftBody ?? null,
        tourInvitationId: detail.tourInvitationId ?? null,
      });
      openWorkspaceModal("quick_message");
    };
    window.addEventListener(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, onLaunch);
    return () => window.removeEventListener(ADMINV2_OPEN_QUICK_MESSAGE_EVENT, onLaunch);
  }, []);

  useEffect(() => {
    const onOpenTasks = () => {
      if (!isOperationalWorkV1Enabled()) return;
      prefetchWorkspaceOperationalTasks("open");
      openWorkspaceModal("tasks");
    };
    const onOpenInbox = () => {
      if (isCommsV2FlagEnabled("comms_v2_command_center")) {
        void warmCommunicationsWorkspaceModal();
      }
      openWorkspaceModal("inbox");
    };
    const onOpenAnalytics = () => {
      openWorkspaceModal("analytics");
    };
    const onOpenProcessing = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenProcessingModalDetail>).detail;
      setProcessingIntent(detail?.intent ?? null);
      void warmProcessingQueueCache();
      openWorkspaceModal("processing");
    };
    window.addEventListener("adminv2:open-tasks-panel", onOpenTasks);
    window.addEventListener("adminv2:open-inbox-modal", onOpenInbox);
    window.addEventListener("adminv2:open-analytics-modal", onOpenAnalytics);
    window.addEventListener("adminv2:open-processing-modal", onOpenProcessing);
    return () => {
      window.removeEventListener("adminv2:open-tasks-panel", onOpenTasks);
      window.removeEventListener("adminv2:open-inbox-modal", onOpenInbox);
      window.removeEventListener("adminv2:open-analytics-modal", onOpenAnalytics);
      window.removeEventListener("adminv2:open-processing-modal", onOpenProcessing);
    };
  }, []);

  // Deep-link bridge: `?workspaceModal=analytics` opens the Operational Intelligence
  // modal (e.g. from Surfaces → "Open in Workspace"), then cleans the URL. The modal
  // itself is client state — the param is an implementation detail, not a product URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const intent = parseWorkspaceModalIntent(params);
    if (intent) {
      openWorkspaceModal(intent);
      params.delete(WORKSPACE_MODAL_INTENT_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, []);

  // The open operational-tasks LIST is a detail resource forbidden as /workspace boot work, and it
  // is already warmed on real intent — the Tasks nav badge hover/focus, the sidebar Work Items click,
  // and the `adminv2:open-tasks-panel` handler above. The speculative mount-time prefetch was an
  // extra boot request with no interaction behind it, so it is removed. The nav badge COUNT
  // (useOperationalTasksNavCounts → summary) still loads — that is an allowed badge count.

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
          closeWorkspaceModal("quick_message");
          setQuickMessageSeed(null);
        }}
      />
      <MyTasksModal open={tasksModalOpen} onClose={() => closeWorkspaceModal("tasks")} />
      <InboxModal open={inboxModalOpen} onClose={() => closeWorkspaceModal("inbox")} />
      <AnalyticsModal open={analyticsModalOpen} onClose={() => closeWorkspaceModal("analytics")} />
      <ProcessingModal
        open={processingModalOpen}
        intent={processingIntent}
        onClose={() => {
          closeWorkspaceModal("processing");
          setProcessingIntent(null);
        }}
      />
      <SchedulingModal open={schedulingModalOpen} onClose={() => closeWorkspaceModal("scheduling")} />
    </header>
  );
}
