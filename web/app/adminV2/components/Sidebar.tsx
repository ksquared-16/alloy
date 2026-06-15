"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
    ChevronDown,
    ChevronRight,
    Home,
    PanelLeftClose,
    PanelLeft,
    Settings,
    Workflow,
} from "lucide-react";
import { neutral, palette, derived } from "@/styles/tokens/colors";
import {
    CANONICAL_ADMIN_BASE,
    CANONICAL_OPERATOR_BASE,
    isCanonicalFormsPath,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import { parseOperatorWorkUnitPath } from "@/lib/admin/canonicalOperatorRoutes";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    loadOperatorLifecycleLandingCards,
    peekOperatorLifecycleLandingCards,
} from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import { workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import {
    SidebarFormsNavItem,
    SidebarInboxNavItem,
    SidebarTasksNavItem,
} from "@/app/adminV2/components/SidebarModalNavItems";
import { appendWorkspaceSiteToPath, readStickyWorkspaceSiteIdForNavigation } from "@/lib/adminV2/workspaceSiteFilterClient";

const WORKSPACE = CANONICAL_OPERATOR_BASE;
const SETTINGS_HREF = CANONICAL_ADMIN_BASE;

const EXPANDED_PRIMARY_LINK = "adminv2-sidebar-primary-link block w-full rounded-md px-2 py-1.5 font-medium";
const EXPANDED_QUEUE_LINK = "adminv2-sidebar-queue-link";

function normalizeAdminPath(pathname: string): string {
    return normalizeToCanonicalAdminPath(pathname);
}

function parseWorkUnitSlug(path: string): string | null {
    return parseOperatorWorkUnitPath(normalizeToCanonicalAdminPath(path)).workUnitSlug;
}

function workspaceHref(path: string): string {
    return appendWorkspaceSiteToPath(path, readStickyWorkspaceSiteIdForNavigation());
}

function isAdminConfigPath(path: string): boolean {
    if (path === CANONICAL_OPERATOR_BASE || path.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
        return false;
    }
    if (path.startsWith("/admin/tasks") || path.startsWith("/admin/messages")) return false;
    if (isCanonicalFormsPath(path)) return false;
    if (path.startsWith(`${CANONICAL_ADMIN_BASE}/workspace`)) return false;
    return path === CANONICAL_ADMIN_BASE || path.startsWith(`${CANONICAL_ADMIN_BASE}/`);
}

function SidebarNav({
    collapsed,
    onToggle,
}: {
    collapsed: boolean;
    onToggle: () => void;
}) {
    const pathname = usePathname();
    const path = useMemo(() => normalizeAdminPath(pathname), [pathname]);
    const workUnitSlug = parseWorkUnitSlug(path);
    const onSettings = isAdminConfigPath(path);

    const [lifecycleCards, setLifecycleCards] = useState<OperatorLifecycleLandingCard[]>(
        () => peekOperatorLifecycleLandingCards() ?? [],
    );
    const [lifecycleLoading, setLifecycleLoading] = useState(
        () => peekOperatorLifecycleLandingCards() == null,
    );
    const [expandedLifecycleIds, setExpandedLifecycleIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        let cancelled = false;
        if (!peekOperatorLifecycleLandingCards()) {
            setLifecycleLoading(true);
        }
        void loadOperatorLifecycleLandingCards()
            .then((cards) => {
                if (cancelled) return;
                setLifecycleCards(cards);
                if (cards.length === 1) {
                    setExpandedLifecycleIds(new Set([cards[0]!.id]));
                } else if (cards.length > 1) {
                    setExpandedLifecycleIds(new Set(cards.map((c) => c.id)));
                }
            })
            .finally(() => {
                if (!cancelled) setLifecycleLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const toggleLifecycleExpanded = useCallback((id: string) => {
        setExpandedLifecycleIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const homeHref = workspaceHref(WORKSPACE);
    const railWidth = collapsed ? 56 : 280;

    const homeLink = (
        <AdminV2NavLink
            href={homeHref}
            title="Workspace"
            aria-label="Workspace"
            active={path === WORKSPACE || path === `${WORKSPACE}/`}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
        >
            {collapsed ? (
                <Home size={20} strokeWidth={1.75} />
            ) : (
                <span className="inline-flex items-center gap-2">
                    <Home size={16} strokeWidth={1.75} />
                    Workspace
                </span>
            )}
        </AdminV2NavLink>
    );

    const tasksLink = <SidebarTasksNavItem collapsed={collapsed} />;

    const inboxLink = <SidebarInboxNavItem collapsed={collapsed} />;

    const formsLink = <SidebarFormsNavItem collapsed={collapsed} />;

    const settingsLink = (
        <AdminV2NavLink
            href={SETTINGS_HREF}
            title="Admin"
            aria-label="Admin"
            active={onSettings}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
        >
            {collapsed ? (
                <Settings size={20} strokeWidth={1.75} />
            ) : (
                <span className="inline-flex items-center gap-2">
                    <Settings size={16} strokeWidth={1.75} />
                    Admin
                </span>
            )}
        </AdminV2NavLink>
    );

    const lifecycleNavExpanded = (
        <div className="pt-2 min-h-0">
            <div className="adminv2-sidebar-section-label mb-1 px-2 text-[11px] font-semibold tracking-wide">
                Lifecycles
            </div>
            {lifecycleLoading ? (
                <p className="adminv2-sidebar-muted px-2 py-2 text-xs" aria-busy="true">
                    Loading lifecycles…
                </p>
            ) : null}
            {!lifecycleLoading && lifecycleCards.length === 0 ? (
                <p className="adminv2-sidebar-muted px-2 py-2 text-xs">No lifecycles configured.</p>
            ) : null}
            <div className="space-y-1">
                {lifecycleCards.map((lifecycle) => {
                    const isExpanded = expandedLifecycleIds.has(lifecycle.id);
                    const lifecycleEntryActive =
                        path === lifecycle.entryHref && !workUnitSlug;
                    return (
                        <div key={lifecycle.id} className="space-y-0.5">
                            <div className="flex items-stretch gap-0.5">
                                <button
                                    type="button"
                                    className="adminv2-sidebar-expand-btn flex h-8 w-7 shrink-0 items-center justify-center rounded-md"
                                    aria-expanded={isExpanded}
                                    aria-label={
                                        isExpanded
                                            ? `Collapse ${lifecycle.label}`
                                            : `Expand ${lifecycle.label}`
                                    }
                                    onClick={() => toggleLifecycleExpanded(lifecycle.id)}
                                >
                                    {isExpanded ? (
                                        <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
                                    ) : (
                                        <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                                    )}
                                </button>
                                <AdminV2NavLink
                                    href={workspaceHref(lifecycle.entryHref)}
                                    active={lifecycleEntryActive}
                                    className={`min-w-0 flex-1 ${EXPANDED_PRIMARY_LINK}`}
                                    title={lifecycle.label}
                                    onMouseEnter={() =>
                                        warmOperatorWorkUnitEntryFromHref(
                                            lifecycle.entryHref,
                                            null,
                                            "sidebar_lifecycle_hover",
                                        )
                                    }
                                    onFocus={() =>
                                        warmOperatorWorkUnitEntryFromHref(
                                            lifecycle.entryHref,
                                            null,
                                            "sidebar_lifecycle_focus",
                                        )
                                    }
                                >
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                        <Workflow size={16} strokeWidth={1.75} className="shrink-0" />
                                        <span className="truncate">{lifecycle.label}</span>
                                    </span>
                                </AdminV2NavLink>
                            </div>
                            {isExpanded && lifecycle.workQueues.length ? (
                                <ul
                                    className="adminv2-sidebar-queue-list ml-8 list-none space-y-0.5 border-l pl-2.5"
                                    role="group"
                                    aria-label={`${lifecycle.label} work queues`}
                                >
                                    {lifecycle.workQueues.map((entry) => {
                                        const childHref = workspaceHref(entry.href);
                                        const childActive =
                                            workUnitSlug != null &&
                                            workUnitRouteSlugsEquivalent(workUnitSlug, entry.platformKey);
                                        return (
                                            <li key={entry.platformKey} role="none">
                                                <AdminV2NavLink
                                                    href={childHref}
                                                    active={childActive}
                                                    highlightFromActiveOnly
                                                    className={EXPANDED_QUEUE_LINK}
                                                    title={entry.label}
                                                    onMouseEnter={() =>
                                                        warmOperatorWorkUnitEntryFromHref(
                                                            entry.href,
                                                            null,
                                                            "sidebar_queue_hover",
                                                        )
                                                    }
                                                    onFocus={() =>
                                                        warmOperatorWorkUnitEntryFromHref(
                                                            entry.href,
                                                            null,
                                                            "sidebar_queue_focus",
                                                        )
                                                    }
                                                >
                                                    <span className="truncate">{entry.label}</span>
                                                </AdminV2NavLink>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <aside
            data-adminv2-sidebar="true"
            className="adminv2-sidebar-shell relative z-[100] flex flex-col flex-shrink-0 min-h-0 border-r transition-[width] duration-200 ease-out overflow-hidden"
            style={{
                width: railWidth,
                backgroundColor: palette.midnightForge,
                borderColor: derived.topBarDivider,
                color: neutral.surface,
            }}
        >
            {collapsed ? (
                <>
                    <div className="adminv2-sidebar-brand flex shrink-0 items-center px-2 pt-3 pb-1" aria-label="Alloy">
                        <img
                            src="/brand/alloy-brandmark-gradient.svg"
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="adminv2-sidebar-toggle flex h-10 w-full flex-shrink-0 items-center justify-center hover:opacity-90 active:scale-[0.98] transition-transform"
                        aria-label="Expand sidebar"
                    >
                        <PanelLeft size={20} />
                    </button>
                </>
            ) : (
                <div className="adminv2-sidebar-brand-row flex h-14 w-full flex-shrink-0 items-center gap-2 px-2">
                    <div className="adminv2-sidebar-brand flex min-w-0 flex-1 items-center" aria-label="Alloy">
                        <img
                            src="/brand/alloy-brandmark-gradient.svg"
                            alt=""
                            width={36}
                            height={36}
                            className="h-9 w-9 shrink-0"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="adminv2-sidebar-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:opacity-90 active:scale-[0.98] transition-transform"
                        aria-label="Collapse sidebar"
                    >
                        <PanelLeftClose size={20} />
                    </button>
                </div>
            )}

            {collapsed ? (
                <nav className="flex min-h-0 flex-1 flex-col px-1.5 pb-2" aria-label="Workspace navigation">
                    <div className="flex shrink-0 flex-col items-stretch gap-1">
                        {homeLink}
                        {tasksLink}
                        {inboxLink}
                        {formsLink}
                    </div>
                    <div className="min-h-0 flex-1" aria-hidden />
                    <div className="adminv2-sidebar-footer flex shrink-0 flex-col items-stretch gap-1 border-t pt-1">
                        {settingsLink}
                    </div>
                </nav>
            ) : (
                <div className="adminv2-sidebar-body flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-3 text-[13px]">
                    <div className="shrink-0 space-y-1 pt-1">
                        {homeLink}
                        {tasksLink}
                        {inboxLink}
                        {formsLink}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">{lifecycleNavExpanded}</div>
                    <div className="adminv2-sidebar-footer shrink-0 border-t pt-2">
                        {settingsLink}
                    </div>
                </div>
            )}
        </aside>
    );
}

export default function Sidebar(props: { collapsed: boolean; onToggle: () => void }) {
    const railWidth = props.collapsed ? 56 : 280;
    return (
        <Suspense
            fallback={
                <aside
                    data-adminv2-sidebar="true"
                    className="adminv2-sidebar-shell relative z-[100] flex flex-shrink-0 flex-col border-r"
                    style={{ width: railWidth, backgroundColor: palette.midnightForge, borderColor: derived.topBarDivider }}
                    aria-hidden
                />
            }
        >
            <SidebarNav {...props} />
        </Suspense>
    );
}
