"use client";

/**
 * Communications KPI band — compact, glanceable status strip.
 *
 * Refactored (Work/Studio parity) to render the SHARED `CompactKpiStrip` with platform
 * KPI color semantics, so Communications and Processing read as siblings. Data is
 * unchanged: real inbox metrics + derived template/announcement KPIs from already-loaded
 * workspace data. No new fetches, no fabricated counts.
 */

import CompactKpiStrip, { type CompactKpiItem } from "@/components/workspace/CompactKpiStrip";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { useCommunicationsWorkspaceKpi } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import { NEEDS_REVIEW_STATUS_LABEL } from "@/lib/communications/v2/commandCenterViewModel";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";

export default function CommunicationsWorkspaceKpiStrip({ activeTab }: { activeTab: CommunicationsModalTab }) {
    const { inbox, templates, announcements } = useCommunicationsWorkspaceKpi();

    const inboxLoading = inbox.loading && inbox.metrics === null;
    const templatesLoading = !templates.listResolved;
    const announcementsLoading = !announcements.listResolved;

    let items: CompactKpiItem[] = [];
    let loading = false;

    if (activeTab === "inbox") {
        const m = inbox.metrics;
        loading = inboxLoading;
        items = [
            { key: "needs_reply", label: "Needs reply", value: String(m?.requiresResponse ?? 0), state: "pending" },
            { key: "overdue", label: "Overdue", value: String(m?.slaAtRisk ?? 0), state: "attention" },
            { key: "unread", label: "Unread", value: String(m?.unread ?? 0), state: "attention" },
            { key: "needs_review", label: NEEDS_REVIEW_STATUS_LABEL, value: String(m?.unclassified ?? 0), state: "pending" },
        ];
    } else if (activeTab === "templates") {
        const k = computeTemplateWorkspaceKpis(templates.rows);
        loading = templatesLoading;
        items = [
            { key: "active", label: "Active", value: String(k.active), state: "ready" },
            { key: "draft", label: "Draft", value: String(k.draft), state: "pending" },
            { key: "categories", label: "Categories", value: String(k.categories), state: "neutral" },
            { key: "last_updated", label: "Last updated", value: k.lastUpdatedLabel, state: "done" },
        ];
    } else if (activeTab === "announcements") {
        const k = computeAnnouncementWorkspaceKpis(announcements.rows);
        loading = announcementsLoading;
        items = [
            { key: "draft", label: "Draft", value: String(k.draft), state: "pending" },
            { key: "scheduled", label: "Scheduled", value: String(k.scheduled), state: "pending" },
            { key: "active", label: "Active", value: String(k.active), state: "ready" },
            { key: "sent_recently", label: "Sent (7d)", value: String(k.sentRecently), state: "done" },
        ];
    }

    if (items.length === 0) return null;

    return <CompactKpiStrip items={items} loading={loading} ariaLabel="Communications status" data-comms-workspace-kpi-band="true" />;
}
