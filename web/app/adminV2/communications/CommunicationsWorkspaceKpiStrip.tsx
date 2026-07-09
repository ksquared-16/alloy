"use client";

/**
 * Communications → metrics band (Work + Studio tabs).
 *
 * Data-only adapter: renders canonical `WorkspaceMetricTiles` from already-loaded workspace KPI context.
 */

import WorkspaceMetricTiles, {
    type WorkspaceMetricStatus,
    type WorkspaceMetricTileItem,
} from "@/components/workspace/WorkspaceMetricTiles";
import { WS_METRIC_EYEBROW_INLINE } from "@/components/workspace/workspaceTokens";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { useCommunicationsWorkspaceKpi } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import { NEEDS_REVIEW_STATUS_LABEL } from "@/lib/communications/v2/commandCenterViewModel";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";
import type { KpiState } from "@/components/workspace/kpiSemantics";
import type { ProcessCardAccent } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

function accentForState(state?: KpiState): ProcessCardAccent {
    switch (state) {
        case "ready":
            return "pine";
        case "attention":
            return "gold";
        case "critical":
            return "ember";
        case "done":
            return "midnight";
        default:
            return "stone";
    }
}

function statusForState(state?: KpiState): WorkspaceMetricStatus {
    switch (state) {
        case "ready":
            return "healthy";
        case "attention":
            return "warning";
        case "critical":
            return "critical";
        default:
            return "unknown";
    }
}

export default function CommunicationsWorkspaceKpiStrip({ activeTab }: { activeTab: CommunicationsModalTab }) {
    const { inbox, templates, announcements } = useCommunicationsWorkspaceKpi();

    const inboxLoading = inbox.loading && inbox.metrics === null;
    const templatesLoading = !templates.listResolved;
    const announcementsLoading = !announcements.listResolved;

    let items: WorkspaceMetricTileItem[] = [];
    let loading = false;
    let eyebrow = "Status";

    if (activeTab === "inbox") {
        const m = inbox.metrics;
        loading = inboxLoading;
        eyebrow = "Inbox";
        items = [
            { key: "needs_reply", label: "Needs reply", value: String(m?.requiresResponse ?? 0), icon: "message", accent: accentForState("pending"), status: statusForState("pending") },
            { key: "overdue", label: "Overdue", value: String(m?.slaAtRisk ?? 0), icon: "shield", accent: accentForState("attention"), status: statusForState("attention") },
            { key: "unread", label: "Unread", value: String(m?.unread ?? 0), icon: "book", accent: accentForState("attention"), status: statusForState("attention") },
            { key: "needs_review", label: NEEDS_REVIEW_STATUS_LABEL, value: String(m?.unclassified ?? 0), icon: "clipboard", accent: accentForState("pending"), status: statusForState("pending") },
        ];
    } else if (activeTab === "templates") {
        const k = computeTemplateWorkspaceKpis(templates.rows);
        loading = templatesLoading;
        eyebrow = "Templates";
        items = [
            { key: "active", label: "Active", value: String(k.active), icon: "spark", accent: accentForState("ready"), status: statusForState("ready") },
            { key: "draft", label: "Draft", value: String(k.draft), icon: "layers", accent: accentForState("pending"), status: statusForState("pending") },
            { key: "categories", label: "Categories", value: String(k.categories), icon: "grid", accent: accentForState("neutral"), status: statusForState("neutral") },
            { key: "last_updated", label: "Last updated", value: k.lastUpdatedLabel, icon: "calendar", accent: accentForState("done"), status: statusForState("done") },
        ];
    } else if (activeTab === "announcements") {
        const k = computeAnnouncementWorkspaceKpis(announcements.rows);
        loading = announcementsLoading;
        eyebrow = "Announcements";
        items = [
            { key: "draft", label: "Draft", value: String(k.draft), icon: "layers", accent: accentForState("pending"), status: statusForState("pending") },
            { key: "scheduled", label: "Scheduled", value: String(k.scheduled), icon: "calendar", accent: accentForState("pending"), status: statusForState("pending") },
            { key: "active", label: "Active", value: String(k.active), icon: "spark", accent: accentForState("ready"), status: statusForState("ready") },
            { key: "sent_recently", label: "Sent (7d)", value: String(k.sentRecently), icon: "book", accent: accentForState("done"), status: statusForState("done") },
        ];
    }

    if (items.length === 0) return null;

    return (
        <div className="flex w-full min-w-0 items-center gap-3" data-comms-workspace-kpi-band="true" data-testid="comms-workspace-kpi-band">
            <p className={WS_METRIC_EYEBROW_INLINE}>
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-alloy-midnight/45" aria-hidden />
                {eyebrow}
            </p>
            <WorkspaceMetricTiles items={items} size="md" align="start" loading={loading} ariaLabel="Communications status" className="min-w-0 flex-1" />
        </div>
    );
}
