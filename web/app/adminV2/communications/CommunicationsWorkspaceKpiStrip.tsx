"use client";

import { OipKpiObjectCard, OipKpiObjectRow } from "@/components/admin/workspace/OipKpiObjectCard";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { COMMS_KPI_STRIP_SURFACE_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import { useCommunicationsWorkspaceKpi } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import { NEEDS_REVIEW_STATUS_LABEL } from "@/lib/communications/v2/commandCenterViewModel";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
    inboxKpiStatusLine,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";
import {
    commsAnnouncementKpiVisual,
    commsInboxKpiVisual,
    commsTemplateKpiVisual,
} from "@/lib/communications/v2/communicationsWorkspaceKpiVisualModel";

export default function CommunicationsWorkspaceKpiStrip({ activeTab }: { activeTab: CommunicationsModalTab }) {
    const { inbox, templates, announcements } = useCommunicationsWorkspaceKpi();

    const inboxLoading = inbox.loading && inbox.metrics === null;
    const templatesLoading = !templates.listResolved;
    const announcementsLoading = !announcements.listResolved;

    let body: React.ReactNode = null;

    if (activeTab === "inbox") {
        const m = inbox.metrics;
        const cards = [
            { label: "Needs reply", value: m?.requiresResponse ?? 0 },
            { label: "Overdue", value: m?.slaAtRisk ?? 0 },
            { label: "Unread", value: m?.unread ?? 0 },
            { label: NEEDS_REVIEW_STATUS_LABEL, value: m?.unclassified ?? 0 },
        ];
        body = (
            <OipKpiObjectRow layout="command">
                {cards.map((c) => {
                    const visual = commsInboxKpiVisual(c.label);
                    return (
                        <OipKpiObjectCard
                            key={c.label}
                            label={c.label}
                            value={String(c.value)}
                            status={inboxKpiStatusLine(c.label, c.value) ?? undefined}
                            accent={visual.accent}
                            iconKey={visual.iconKey}
                            layout="command"
                            loading={inboxLoading}
                            showTrendPlaceholder={false}
                        />
                    );
                })}
            </OipKpiObjectRow>
        );
    } else if (activeTab === "templates") {
        const k = computeTemplateWorkspaceKpis(templates.rows);
        const cards = [
            { label: "Active Templates", value: String(k.active) },
            { label: "Draft Templates", value: String(k.draft) },
            { label: "Categories", value: String(k.categories) },
            { label: "Last Updated", value: k.lastUpdatedLabel },
        ];
        body = (
            <OipKpiObjectRow layout="command">
                {cards.map((c) => {
                    const visual = commsTemplateKpiVisual(c.label);
                    return (
                        <OipKpiObjectCard
                            key={c.label}
                            label={c.label}
                            value={c.value}
                            accent={visual.accent}
                            iconKey={visual.iconKey}
                            layout="command"
                            loading={templatesLoading}
                            showTrendPlaceholder={false}
                        />
                    );
                })}
            </OipKpiObjectRow>
        );
    } else if (activeTab === "announcements") {
        const k = computeAnnouncementWorkspaceKpis(announcements.rows);
        const cards = [
            { label: "Draft", value: String(k.draft) },
            { label: "Scheduled", value: String(k.scheduled) },
            { label: "Active", value: String(k.active) },
            { label: "Sent Recently", value: String(k.sentRecently), status: "last 7 days" },
        ];
        body = (
            <OipKpiObjectRow layout="command">
                {cards.map((c) => {
                    const visual = commsAnnouncementKpiVisual(c.label);
                    return (
                        <OipKpiObjectCard
                            key={c.label}
                            label={c.label}
                            value={c.value}
                            status={"status" in c ? c.status : undefined}
                            accent={visual.accent}
                            iconKey={visual.iconKey}
                            layout="command"
                            loading={announcementsLoading}
                            showTrendPlaceholder={false}
                        />
                    );
                })}
            </OipKpiObjectRow>
        );
    }

    if (!body) return null;

    return (
        <div className={COMMS_KPI_STRIP_SURFACE_CLASS} data-comms-workspace-kpi-band="true">
            {body}
        </div>
    );
}
