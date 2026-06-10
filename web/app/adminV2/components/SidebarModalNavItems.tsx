"use client";

import type { ReactNode } from "react";
import { Inbox, ListChecks } from "lucide-react";

import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { useOperationalTasksNavCounts } from "@/lib/adminV2/useOperationalTasksNavCounts";
import { useInboxUnreadNavCount } from "@/lib/adminV2/useInboxUnreadNavCount";
import {
    dispatchAdminV2OpenInboxModal,
    dispatchAdminV2OpenTasksPanel,
} from "@/lib/adminV2/workspaceModalEvents";

const EXPANDED_PRIMARY_LINK = "adminv2-sidebar-primary-link block w-full rounded-md px-2 py-1.5 font-medium";

function SidebarModalNavButton({
    collapsed,
    title,
    label,
    icon,
    badge,
    onClick,
    dataAttr,
}: {
    collapsed: boolean;
    title: string;
    label: string;
    icon: ReactNode;
    badge: ReactNode;
    onClick: () => void;
    dataAttr: string;
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={collapsed ? "adminv2-sidebar-rail-link relative" : `${EXPANDED_PRIMARY_LINK} relative`}
            data-adminv2-sidebar-modal-nav={dataAttr}
        >
            {collapsed ?
                <>
                    {icon}
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

    if (!enabled) return null;

    const title =
        alertCount > 0 ?
            `Tasks — ${alertCount} due soon or overdue (${open} open)`
        :   `Tasks — ${open} open`;

    const badge =
        alertCount > 0 ?
            <span
                className="adminv2-sidebar-nav-badge inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-400/95 px-1 text-[9px] font-bold text-alloy-midnight"
                data-adminv2-operational-tasks-badge="true"
            >
                {alertCount > 99 ? "99+" : alertCount}
            </span>
        : open > 0 ?
            <span
                className="adminv2-sidebar-nav-badge inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-white/20 px-1 text-[9px] font-bold text-white"
                data-adminv2-operational-tasks-open-count="true"
            >
                {open > 99 ? "99+" : open}
            </span>
        :   null;

    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title={title}
            label="Tasks"
            icon={<ListChecks size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={badge}
            dataAttr="tasks"
            onClick={() => {
                prefetchWorkspaceOperationalTasks("open");
                dispatchAdminV2OpenTasksPanel();
            }}
        />
    );
}

export function SidebarInboxNavItem({ collapsed }: { collapsed: boolean }) {
    const { unread } = useInboxUnreadNavCount();
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
                    <span
                        className="adminv2-sidebar-nav-badge inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[#00A283]/95 px-1 text-[9px] font-bold text-white"
                        data-adminv2-inbox-unread-badge="true"
                    >
                        {unread > 99 ? "99+" : unread}
                    </span>
                :   null
            }
            dataAttr="inbox"
            onClick={() => dispatchAdminV2OpenInboxModal()}
        />
    );
}
