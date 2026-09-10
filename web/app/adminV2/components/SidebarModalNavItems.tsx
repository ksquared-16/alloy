"use client";

import type { ReactNode } from "react";
// Forms lives inside the Digital Mailroom — no standalone Forms nav / /admin/forms (Mailroom doctrine).
import { Inbox, ListChecks, BarChart3, Layers, Contact, Banknote } from "lucide-react";

import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { useOperationalTasksNavCounts } from "@/lib/adminV2/useOperationalTasksNavCounts";
import { useInboxUnreadNavCount } from "@/lib/adminV2/useInboxUnreadNavCount";
import { useActiveAdminV2WorkspaceModal } from "@/lib/adminV2/useActiveWorkspaceModal";
import { useAdminAuthOptional } from "@/contexts/AdminAuthContext";
import { offersFinancialsSurface } from "@/lib/access/financialsSurfaceVisibility";
import { warmCommunicationsWorkspaceModal } from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import { warmOperationsWorkspace } from "@/lib/scheduling/operationsWorkspaceWarmCache";
import { dispatchAdminV2OpenFinancialsModal } from "@/lib/adminV2/workspaceModalEvents";
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
    dispatchAdminV2OpenOperationsModal,
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
/**
 * OPERATIONS — the operating day, the people it is made of, and its configuration.
 *
 * One rail entry where there were three. Roster answered "who is expected where", Records answered
 * "who are these people", and Assignments answered "what commitments is that derived from, and how
 * are they configured" — three doors onto the same day, which made an operator declare in advance
 * which question they were about to ask. They are now WORK and STUDIO inside one workspace.
 *
 * The ICON stays the people mark rather than a calendar. The name is broader now, but what an
 * operator is reaching for is unchanged — "where do I find Lennon", "is Toddler A short" — and the
 * mark they already learned to find in the rail should keep pointing at it.
 */
export function SidebarOperationsNavItem({ collapsed }: { collapsed: boolean }) {
    const activeModal = useActiveAdminV2WorkspaceModal();
    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title="Operations — the operating day, the people it is made of, and its configuration"
            label="Operations"
            icon={<Contact size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={null}
            active={activeModal === "operations"}
            dataAttr="operations"
            /*
             * Readiness on NAV INTENT, not on the click. Warming inside the modal's own open effect
             * runs at the same instant the workspace mounts, so a serial chain (configuration ->
             * section data) gains nothing from it. Hover/focus is the earliest honest signal, and it
             * is the seam Communications already uses.
             *
             * `warmOperationsWorkspace` reads the REMEMBERED position and prepares that destination —
             * bounded to the configuration class, never a full hydration of a closed workspace.
             */
            onMouseEnter={() => warmOperationsWorkspace()}
            onFocus={() => warmOperationsWorkspace()}
            onClick={() => {
                warmOperationsWorkspace();
                dispatchAdminV2OpenOperationsModal();
            }}
        />
    );
}

/**
 * Financials in the primary navigation, offered only to a principal who can read it.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──
 *
 * It is not the gate. `fin.read` is enforced by `assertFinancialsReadAllowed` on every Financials
 * read route, and every financial mutation is enforced by its own registered action; both refuse a
 * direct API call that never rendered a screen, and both would refuse if this component always drew
 * the button. Removing the item is a product decision about what to put in front of an operator,
 * and the doctrine is explicit that navigation hiding is never the security boundary.
 *
 * ── WHY IT IS THE ITEM AND NOT A DISABLED STATE ──
 *
 * A disabled control that never becomes enabled teaches an operator that the product is broken. A
 * role configured without Financials is not a temporary condition to wait out; it is the
 * organization's answer. The surface is simply not theirs, and the Access workspace is where that
 * changes.
 *
 * ── AND IT FAILS OPEN ──
 *
 * `permissionKeys` is `null` when the shell that mounted the context did not supply it, and
 * `offersFinancialsSurface` answers "offer" in that case. A missed mount must not hide Financials
 * from someone who holds the grant: that would recreate the operator report this work began with,
 * with a vanished nav item instead of a message that at least explained itself. The server gives the
 * real answer either way.
 */
export function SidebarFinancialsNavItem({ collapsed }: { collapsed: boolean }) {
    const activeModal = useActiveAdminV2WorkspaceModal();
    const auth = useAdminAuthOptional();
    if (!offersFinancialsSurface(auth?.permissionKeys)) return null;
    return (
        <SidebarModalNavButton
            collapsed={collapsed}
            title="Financials — the financial work waiting on an operator, and the accounts it belongs to"
            label="Financials"
            icon={<Banknote size={collapsed ? 20 : 16} strokeWidth={1.75} className="shrink-0" />}
            badge={null}
            active={activeModal === "financials"}
            dataAttr="financials"
            onClick={() => {
                dispatchAdminV2OpenFinancialsModal();
            }}
        />
    );
}
