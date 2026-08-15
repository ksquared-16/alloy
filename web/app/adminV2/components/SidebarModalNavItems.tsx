"use client";

import type { ReactNode } from "react";
// Forms lives inside the Digital Mailroom — no standalone Forms nav / /admin/forms (Mailroom doctrine).
// Scheduling (CalendarRange) is a staging improvement kept during reconciliation.
import { Inbox, ListChecks, BarChart3, Layers, CalendarRange, Contact } from "lucide-react";

import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { useOperationalTasksNavCounts } from "@/lib/adminV2/useOperationalTasksNavCounts";
import { useInboxUnreadNavCount } from "@/lib/adminV2/useInboxUnreadNavCount";
import { useActiveAdminV2WorkspaceModal } from "@/lib/adminV2/useActiveWorkspaceModal";
import { warmCommunicationsWorkspaceModal } from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import { warmOipAnalyticsModal } from "@/lib/metrics/oipWorkspaceWarmCache";
import { warmOperationalIntelligence } from "@/lib/analytics/runtime/operationalIntelligenceWarmCache";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import { warmProcessingFormsCache } from "@/lib/pos/processingFormsWarmCache";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import {
    dispatchAdminV2OpenInboxModal,
    dispatchAdminV2OpenTasksPanel,
    dispatchAdminV2OpenAnalyticsModal,
    dispatchAdminV2OpenProcessingModal,
    dispatchAdminV2OpenSchedulingModal,
    dispatchAdminV2OpenRosterModal,
} from "@/lib/adminV2/workspaceModalEvents";

const EXPANDED_PRIMARY_LINK = "adminv2-sidebar-primary-link block w-full rounded-md px-2 py-1.5 font-medium";

function formatSidebarBadgeCount(count: number, collapsed: boolean): string {
    if (count <= 0) return "0";
    if (collapsed && count > 9) return "9+";
    if (count > 99) return "99+";
    return String(count);
}

function SidebarModalNavButton({
    collapsed,
    title,
    label,
    icon,
    badge,
    active = false,
    onClick,
    onMouseEnter,
    onFocus,
    dataAttr,
}: {
    collapsed: boolean;
    title: string;
    label: string;
    icon: ReactNode;
    badge: ReactNode;
    /** Active when this item's workspace modal is open (reuses the nav-link active style). */
    active?: boolean;
    onClick: () => void;
    onMouseEnter?: () => void;
    onFocus?: () => void;
    dataAttr: string;
}) {
    const base = collapsed ? "adminv2-sidebar-rail-link relative" : `${EXPANDED_PRIMARY_LINK} relative`;
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            aria-current={active ? "page" : undefined}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onFocus={onFocus}
            className={active ? `${base} adminv2-nav-link--active` : base}
            data-adminv2-sidebar-modal-nav={dataAttr}
        >
            {collapsed ?
                <>
                    <span className="adminv2-sidebar-rail-icon-with-badge">{icon}</span>
                    {badge ? <span className="adminv2-sidebar-nav-badge-anchor">{badge}</span> : null}
                </>
            :   <span className="inline-flex w-full items-center gap-2">
                    {icon}
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    {badge}
                </span>
            }
        </button>
    );
}

export function SidebarTasksNavItem({ collapsed }: { collapsed: boolean }) {
    const { alertCount, open, enabled } = useOperationalTasksNavCounts();
    const activeModal = useActiveAdminV2WorkspaceModal();

    if (!enabled) return null;

    const title =
        alertCount > 0 ?
            `Work Items — ${alertCount} due soon or overdue (${open} open)`
        :   `Work Items — ${open} open`;

    const badge =
        alertCount > 0 ?
            <span
                className="adminv2-sidebar-nav-badge adminv2-sidebar-nav-badge--alert"
                data-adminv2-operational-tasks-badge="true"
            >
                {formatSidebarBadgeCount(alertCount, collapsed)}
            </span>
        : open > 0 ?
            <span
                className="adminv2-sidebar-nav-badge adminv2-sidebar-nav-badge--neutral"
                data-adminv2-operational-tasks-open-count="true"
            >
                {formatSidebarBadgeCount(open, collapsed)}
            </span>
        :   null;

    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title={title}
            label="Work Items"
            icon={<ListChecks size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={badge}
            active={activeModal === "tasks"}
            dataAttr="tasks"
            onMouseEnter={() => {
                prefetchWorkspaceOperationalTasks("open");
            }}
            onFocus={() => {
                prefetchWorkspaceOperationalTasks("open");
            }}
            onClick={() => {
                prefetchWorkspaceOperationalTasks("open");
                dispatchAdminV2OpenTasksPanel();
            }}
        />
    );
}

export function SidebarInboxNavItem({ collapsed }: { collapsed: boolean }) {
    const { unread } = useInboxUnreadNavCount();
    const activeModal = useActiveAdminV2WorkspaceModal();
    const title =
        unread > 0 ? `Inbox — ${unread} unread message${unread === 1 ? "" : "s"}` : "Inbox — conversations";

    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title={title}
            label="Inbox"
            icon={<Inbox size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={
                unread > 0 ?
                    <span className="adminv2-sidebar-nav-badge adminv2-sidebar-nav-badge--inbox" data-adminv2-inbox-unread-badge="true">
                        {formatSidebarBadgeCount(unread, collapsed)}
                    </span>
                :   null
            }
            active={activeModal === "inbox"}
            dataAttr="inbox"
            onMouseEnter={() => {
                if (isCommsV2FlagEnabled("comms_v2_command_center")) {
                    void warmCommunicationsWorkspaceModal();
                }
            }}
            onFocus={() => {
                if (isCommsV2FlagEnabled("comms_v2_command_center")) {
                    void warmCommunicationsWorkspaceModal();
                }
            }}
            onClick={() => {
                if (isCommsV2FlagEnabled("comms_v2_command_center")) {
                    void warmCommunicationsWorkspaceModal();
                }
                dispatchAdminV2OpenInboxModal();
            }}
        />
    );
}

export function SidebarAnalyticsNavItem({ collapsed }: { collapsed: boolean }) {
    const activeModal = useActiveAdminV2WorkspaceModal();
    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title="Analytics — operational intelligence metrics"
            label="Analytics"
            icon={<BarChart3 size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={null}
            active={activeModal === "analytics"}
            dataAttr="analytics"
            onMouseEnter={() => {
                void warmOipAnalyticsModal();
                void warmOperationalIntelligence({ siteId: null, window: "rolling_30d", compare: false });
            }}
            onFocus={() => {
                void warmOipAnalyticsModal();
                void warmOperationalIntelligence({ siteId: null, window: "rolling_30d", compare: false });
            }}
            onClick={() => {
                void warmOipAnalyticsModal();
                void warmOperationalIntelligence({ siteId: null, window: "rolling_30d", compare: false });
                dispatchAdminV2OpenAnalyticsModal();
            }}
        />
    );
}

/** POS intake workspace — operator application alongside Tasks, Inbox, and Analytics. */
export function SidebarProcessingNavItem({ collapsed }: { collapsed: boolean }) {
    const activeModal = useActiveAdminV2WorkspaceModal();
    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title="Processing — intake, documents, and forms"
            label="Processing"
            icon={<Layers size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={null}
            active={activeModal === "processing"}
            dataAttr="processing"
            onMouseEnter={() => {
                void warmProcessingQueueCache();
                void warmProcessingFormsCache();
            }}
            onFocus={() => {
                void warmProcessingQueueCache();
                void warmProcessingFormsCache();
            }}
            onClick={() => {
                void warmProcessingQueueCache();
                void warmProcessingFormsCache();
                dispatchAdminV2OpenProcessingModal();
            }}
        />
    );
}
/** Assignments — operational placement command center; opens as a workspace modal. */
export function SidebarSchedulingNavItem({ collapsed }: { collapsed: boolean }) {
    const activeModal = useActiveAdminV2WorkspaceModal();
    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title="Assignments — rooms, types, and operational placement"
            label="Assignments"
            icon={<CalendarRange size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={null}
            active={activeModal === "scheduling"}
            dataAttr="scheduling"
            onClick={() => {
                dispatchAdminV2OpenSchedulingModal();
            }}
        />
    );
}

/**
 * Roster — the operating day AND the people it is made of; opens as a workspace modal.
 *
 * Peer of Assignments, not a tab inside it: Assignments owns the durable commitments, Roster answers
 * who is expected where and when given them — and, since the Records re-home, who those people ARE.
 *
 * The ICON is the people mark rather than a calendar. The workspace keeps the name Roster, but its
 * sections are Roster / Attendance / Staff / Children and a calendar names only the first two. An
 * operator reaching for "where do I find Lennon" has to recognise this entry in the rail.
 */
export function SidebarRosterNavItem({ collapsed }: { collapsed: boolean }) {
    const activeModal = useActiveAdminV2WorkspaceModal();
    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title="Roster — the operating day, and the staff and children it is made of"
            label="Roster"
            icon={<Contact size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={null}
            active={activeModal === "roster"}
            dataAttr="roster"
            onClick={() => {
                dispatchAdminV2OpenRosterModal();
            }}
        />
    );
}

