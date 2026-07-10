"use client";

/**
 * Communications operational health — Work + Studio contextual metrics (Doctrine V3).
 *
 * Data-only adapter: derives counts from workspace KPI context and renders
 * canonical `WorkspaceOperationalHealth`. No layout or trend styling lives here.
 */

import { useMemo } from "react";
import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
    type WorkspaceOperationalHealthTrend,
} from "@/components/workspace/WorkspaceOperationalHealth";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import { useCommunicationsWorkspaceKpi } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import {
    computeAnnouncementOperationalHealth,
    computeInboxOperationalHealth,
    computeTemplateOperationalHealth,
} from "@/lib/communications/v2/communicationsOperationalHealthModel";

/** Static trend placeholders until historical comparison APIs exist. */
const PLACEHOLDER_TREND: WorkspaceOperationalHealthTrend = { direction: "none", label: "—" };

const INBOX_TRENDS = {
    needs_reply: PLACEHOLDER_TREND,
    unread: PLACEHOLDER_TREND,
    scheduled: PLACEHOLDER_TREND,
    needs_review: { direction: "none" as const, label: "—", tone: "ember" as const },
};

const ANNOUNCEMENT_TRENDS = {
    draft: PLACEHOLDER_TREND,
    scheduled: PLACEHOLDER_TREND,
    sent_today: { direction: "none" as const, label: "—", tone: "gold" as const },
    failed: { direction: "none" as const, label: "—", tone: "ember" as const },
};

const TEMPLATE_TRENDS = {
    active: PLACEHOLDER_TREND,
    draft: PLACEHOLDER_TREND,
    needs_review: { direction: "none" as const, label: "—", tone: "ember" as const },
    recently_updated: { direction: "none" as const, label: "—", tone: "gold" as const },
};

const SECTION_EYEBROW: Partial<Record<CommunicationsModalTab, string>> = {
    inbox: "Inbox",
    announcements: "Announcements",
    scheduled: "Scheduled",
    templates: "Templates",
};

export default function CommunicationsWorkspaceKpiStrip({ activeTab }: { activeTab: CommunicationsModalTab }) {
    const { inbox, templates, announcements } = useCommunicationsWorkspaceKpi();

    const announcementHealth = computeAnnouncementOperationalHealth(announcements.rows);
    const inboxHealth = computeInboxOperationalHealth(inbox.metrics, announcementHealth.scheduled);
    const templateHealth = computeTemplateOperationalHealth(templates.rows);

    const inboxLoading = inbox.loading && inbox.metrics === null;
    const templatesLoading = !templates.listResolved;
    const announcementsLoading = !announcements.listResolved;

    let items: WorkspaceOperationalHealthItem[] = [];
    let loading = false;
    let eyebrow = SECTION_EYEBROW[activeTab];

    if (activeTab === "inbox") {
        loading = inboxLoading;
        items = [
            {
                key: "needs_reply",
                label: "Needs Reply",
                value: String(inboxHealth.needsReply),
                tone: "ember",
                trend: INBOX_TRENDS.needs_reply,
            },
            {
                key: "unread",
                label: "Unread",
                value: String(inboxHealth.unread),
                tone: "gold",
                trend: INBOX_TRENDS.unread,
            },
            {
                key: "scheduled",
                label: "Scheduled",
                value: String(inboxHealth.scheduled),
                tone: "pine",
                trend: INBOX_TRENDS.scheduled,
            },
            {
                key: "needs_review",
                label: "Needs Review",
                value: String(inboxHealth.needsReview),
                tone: "ember",
                trend: INBOX_TRENDS.needs_review,
            },
        ];
    } else if (activeTab === "announcements" || activeTab === "scheduled") {
        loading = announcementsLoading;
        items = [
            {
                key: "draft",
                label: "Draft",
                value: String(announcementHealth.draft),
                tone: "midnight",
                trend: ANNOUNCEMENT_TRENDS.draft,
            },
            {
                key: "scheduled",
                label: "Scheduled",
                value: String(announcementHealth.scheduled),
                tone: "pine",
                trend: ANNOUNCEMENT_TRENDS.scheduled,
            },
            {
                key: "sent_today",
                label: "Sent Today",
                value: String(announcementHealth.sentToday),
                tone: "gold",
                trend: ANNOUNCEMENT_TRENDS.sent_today,
            },
            {
                key: "failed",
                label: "Failed",
                value: String(announcementHealth.failed),
                tone: "ember",
                trend: ANNOUNCEMENT_TRENDS.failed,
            },
        ];
    } else if (activeTab === "templates") {
        loading = templatesLoading;
        items = [
            {
                key: "active",
                label: "Active",
                value: String(templateHealth.active),
                tone: "pine",
                trend: TEMPLATE_TRENDS.active,
            },
            {
                key: "draft",
                label: "Draft",
                value: String(templateHealth.draft),
                tone: "midnight",
                trend: TEMPLATE_TRENDS.draft,
            },
            {
                key: "needs_review",
                label: "Needs Review",
                value: String(templateHealth.needsReview),
                tone: "ember",
                trend: TEMPLATE_TRENDS.needs_review,
            },
            {
                key: "recently_updated",
                label: "Recently Updated",
                value: String(templateHealth.recentlyUpdated),
                tone: "gold",
                trend: TEMPLATE_TRENDS.recently_updated,
            },
        ];
    }

    if (items.length === 0 || !eyebrow) return null;

    const ariaLabel = `${eyebrow} operational health`;

    return (
        <div data-comms-workspace-kpi-band="true" className="w-full min-w-0">
            <WorkspaceOperationalHealth
                eyebrow={eyebrow}
                items={items}
                loading={loading}
                ariaLabel={ariaLabel}
                className="w-full"
                data-testid="comms-workspace-health-band"
            />
        </div>
    );
}
