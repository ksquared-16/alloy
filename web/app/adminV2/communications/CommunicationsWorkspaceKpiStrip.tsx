"use client";

import { OipKpiObjectCard, OipKpiObjectRow } from "@/components/admin/workspace/OipKpiObjectCard";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { useCommunicationsWorkspaceKpi } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import { oipKpiCommandSurfaceClass } from "@/lib/metrics/oipKpiCardVisualSystem";
import { NEEDS_REVIEW_STATUS_LABEL } from "@/lib/communications/v2/commandCenterViewModel";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
    inboxKpiStatusLine,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";

const COMMS_ACCENT = "communications" as const;

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
                {cards.map((c) => (
                    <OipKpiObjectCard
                        key={c.label}
                        label={c.label}
                        value={String(c.value)}
                        status={inboxKpiStatusLine(c.label, c.value) ?? undefined}
                        accent={COMMS_ACCENT}
                        layout="command"
                        loading={inboxLoading}
                        showTrendPlaceholder={false}
                    />
                ))}
            </OipKpiObjectRow>
        );
    } else if (activeTab === "templates") {
        const k = computeTemplateWorkspaceKpis(templates.rows);
        body = (
            <OipKpiObjectRow layout="command">
                <OipKpiObjectCard label="Active Templates" value={String(k.active)} accent={COMMS_ACCENT} layout="command" loading={templatesLoading} showTrendPlaceholder={false} />
                <OipKpiObjectCard label="Draft Templates" value={String(k.draft)} accent={COMMS_ACCENT} layout="command" loading={templatesLoading} showTrendPlaceholder={false} />
                <OipKpiObjectCard label="Categories" value={String(k.categories)} accent={COMMS_ACCENT} layout="command" loading={templatesLoading} showTrendPlaceholder={false} />
                <OipKpiObjectCard label="Last Updated" value={k.lastUpdatedLabel} accent={COMMS_ACCENT} layout="command" loading={templatesLoading} showTrendPlaceholder={false} />
            </OipKpiObjectRow>
        );
    } else if (activeTab === "announcements") {
        const k = computeAnnouncementWorkspaceKpis(announcements.rows);
        body = (
            <OipKpiObjectRow layout="command">
                <OipKpiObjectCard label="Draft" value={String(k.draft)} accent={COMMS_ACCENT} layout="command" loading={announcementsLoading} showTrendPlaceholder={false} />
                <OipKpiObjectCard label="Scheduled" value={String(k.scheduled)} accent={COMMS_ACCENT} layout="command" loading={announcementsLoading} showTrendPlaceholder={false} />
                <OipKpiObjectCard label="Active" value={String(k.active)} accent={COMMS_ACCENT} layout="command" loading={announcementsLoading} showTrendPlaceholder={false} />
                <OipKpiObjectCard label="Sent Recently" value={String(k.sentRecently)} accent={COMMS_ACCENT} layout="command" loading={announcementsLoading} showTrendPlaceholder={false} status="last 7 days" />
            </OipKpiObjectRow>
        );
    }

    if (!body) return null;

    return (
        <div className={oipKpiCommandSurfaceClass()} data-comms-workspace-kpi-band="true">
            <div className="border-b border-alloy-stone/12 px-3 py-2">{body}</div>
        </div>
    );
}
