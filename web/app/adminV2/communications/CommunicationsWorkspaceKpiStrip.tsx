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
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { useCommunicationsWorkspaceKpi } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import { NEEDS_REVIEW_STATUS_LABEL } from "@/lib/communications/v2/commandCenterViewModel";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";
import type { KpiState } from "@/components/workspace/kpiSemantics";
import type { ProcessCardAccent, ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

function accentForState(state: KpiState): ProcessCardAccent {
    switch (state) {
        case "ready":
            return "pine";
        case "attention":
            return "gold";
        case "done":
            return "midnight";
        default:
            return "stone";
    }
}

function statusForState(state: KpiState): WorkspaceMetricStatus {
    switch (state) {
        case "ready":
            return "healthy";
        case "attention":
            return "warning";
        default:
            return "unknown";
    }
}

function metric(
    key: string,
    label: string,
    value: string,
    state: KpiState,
    icon: ProcessCardIcon
): WorkspaceMetricTileItem {
    return {
        key,
        label,
        value,
        icon,
        accent: accentForState(state),
        status: statusForState(state),
    };
}

const TAB_EYEBROW: Partial<Record<CommunicationsModalTab, string>> = {
    overview: "Overview",
    inbox: "Inbox",
    templates: "Templates",
    announcements: "Announcements",
    scheduled: "Scheduled",
    channels: "Channels",
    branding: "Branding",
};

export default function CommunicationsWorkspaceKpiStrip({ activeTab }: { activeTab: CommunicationsModalTab }) {
    const { inbox, templates, announcements } = useCommunicationsWorkspaceKpi();

    const inboxLoading = inbox.loading && inbox.metrics === null;
    const templatesLoading = !templates.listResolved;
    const announcementsLoading = !announcements.listResolved;

    let items: WorkspaceMetricTileItem[] = [];
    let loading = false;

    if (activeTab === "overview") {
        const m = inbox.metrics;
        const announcementKpis = computeAnnouncementWorkspaceKpis(announcements.rows);
        loading = inboxLoading || announcementsLoading;
        items = [
            metric("needs_reply", "Needs reply", String(m?.requiresResponse ?? 0), "pending", "message"),
            metric("unread", "Unread", String(m?.unread ?? 0), "attention", "book"),
            metric("scheduled", "Scheduled", String(announcementKpis.scheduled), "pending", "calendar"),
            metric("sent", "Sent (7d)", String(announcementKpis.sentRecently), "done", "book"),
        ];
    } else if (activeTab === "inbox") {
        const m = inbox.metrics;
        loading = inboxLoading;
        items = [
            metric("needs_reply", "Needs reply", String(m?.requiresResponse ?? 0), "pending", "message"),
            metric("overdue", "Overdue", String(m?.slaAtRisk ?? 0), "attention", "shield"),
            metric("unread", "Unread", String(m?.unread ?? 0), "attention", "book"),
            metric("needs_review", NEEDS_REVIEW_STATUS_LABEL, String(m?.unclassified ?? 0), "pending", "clipboard"),
        ];
    } else if (activeTab === "templates") {
        const k = computeTemplateWorkspaceKpis(templates.rows);
        loading = templatesLoading;
        items = [
            metric("active", "Active", String(k.active), "ready", "spark"),
            metric("draft", "Draft", String(k.draft), "pending", "layers"),
            metric("categories", "Categories", String(k.categories), "neutral", "grid"),
            metric("last_updated", "Last updated", k.lastUpdatedLabel, "done", "calendar"),
        ];
    } else if (activeTab === "announcements") {
        const k = computeAnnouncementWorkspaceKpis(announcements.rows);
        loading = announcementsLoading;
        items = [
            metric("draft", "Draft", String(k.draft), "pending", "layers"),
            metric("scheduled", "Scheduled", String(k.scheduled), "pending", "calendar"),
            metric("active", "Active", String(k.active), "ready", "spark"),
            metric("sent_recently", "Sent (7d)", String(k.sentRecently), "done", "book"),
        ];
    } else if (activeTab === "scheduled") {
        const k = computeAnnouncementWorkspaceKpis(announcements.rows);
        loading = announcementsLoading;
        items = [
            metric("scheduled", "Scheduled", String(k.scheduled), "pending", "calendar"),
            metric("draft", "Draft", String(k.draft), "neutral", "layers"),
            metric("active", "Active", String(k.active), "ready", "spark"),
            metric("sent_recently", "Sent (7d)", String(k.sentRecently), "done", "book"),
        ];
    } else if (activeTab === "channels") {
        items = [
            metric("email", "Email", "-", "ready", "message"),
            metric("sms", "SMS", "-", "ready", "message"),
            metric("in_app", "In-app", "Active", "ready", "spark"),
            metric("push", "Push", "Soon", "neutral", "bolt"),
        ];
    } else if (activeTab === "branding") {
        items = [
            metric("identity", "Identity", "-", "neutral", "grid"),
            metric("reply_to", "Reply-to", "-", "neutral", "message"),
            metric("signature", "Signature", "-", "neutral", "book"),
            metric("colors", "Colors", "-", "neutral", "layers"),
        ];
    }

    if (items.length === 0) return null;

    const eyebrowLabel = TAB_EYEBROW[activeTab] ?? "Status";

    return (
        <div data-comms-workspace-kpi-band="true" className="w-full min-w-0">
            <WorkspaceMetricTiles
                eyebrow={eyebrowLabel}
                items={items}
                size="md"
                align="start"
                loading={loading}
                ariaLabel="Communications status"
                className="w-full"
                data-testid="comms-workspace-kpi-band"
            />
        </div>
    );
}
