"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ClipboardList, Inbox, ListChecks } from "lucide-react";

import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { ADMIN_FORMS_HREF, isCanonicalFormsPath, normalizeToCanonicalAdminPath } from "@/lib/admin/canonicalAdminRoutes";
import { useOperationalTasksNavCounts } from "@/lib/adminV2/useOperationalTasksNavCounts";
import { useInboxUnreadNavCount } from "@/lib/adminV2/useInboxUnreadNavCount";
import {
    dispatchAdminV2OpenInboxModal,
    dispatchAdminV2OpenTasksPanel,
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

    if (!enabled) return null;

    const title =
        alertCount > 0 ?
            `Tasks — ${alertCount} due soon or overdue (${open} open)`
        :   `Tasks — ${open} open`;

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
                    <span className="adminv2-sidebar-nav-badge adminv2-sidebar-nav-badge--inbox" data-adminv2-inbox-unread-badge="true">
                        {formatSidebarBadgeCount(unread, collapsed)}
                    </span>
                :   null
            }
            dataAttr="inbox"
            onClick={() => dispatchAdminV2OpenInboxModal()}
        />
    );
}

function SidebarRouteNavItem({
    collapsed,
    href,
    title,
    label,
    active,
    icon,
    badge,
}: {
    collapsed: boolean;
    href: string;
    title: string;
    label: string;
    active?: boolean;
    icon: ReactNode;
    badge?: ReactNode;
}) {
    return (
        <AdminV2NavLink
            href={href}
            title={title}
            aria-label={title}
            active={active}
            className={collapsed ? "adminv2-sidebar-rail-link relative" : `${EXPANDED_PRIMARY_LINK} relative`}
        >
            {collapsed ?
                <>
                    <span className={badge ? "adminv2-sidebar-rail-icon-with-badge" : undefined}>{icon}</span>
                    {badge ? <span className="adminv2-sidebar-nav-badge-anchor">{badge}</span> : null}
                </>
            :   <span className="inline-flex w-full items-center gap-2">
                    {icon}
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    {badge}
                </span>
            }
        </AdminV2NavLink>
    );
}

export function SidebarFormsNavItem({ collapsed }: { collapsed: boolean }) {
    const pathname = usePathname();
    const active = isCanonicalFormsPath(normalizeToCanonicalAdminPath(pathname));

    return (
        <SidebarRouteNavItem
            collapsed={collapsed}
            href={ADMIN_FORMS_HREF}
            title="Forms — definitions, submissions, and packets"
            label="Forms"
            active={active}
            icon={<ClipboardList size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
        />
    );
}
