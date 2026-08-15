"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
    ChevronDown,
    ChevronRight,
    Building2,
    Home,
    PanelLeftClose,
    PanelLeft,
    Workflow,
} from "lucide-react";
import { neutral, palette, derived } from "@/styles/tokens/colors";
import {
    CANONICAL_ADMIN_BASE,
    CANONICAL_ADMIN_CONFIG_LANDING,
    CANONICAL_OPERATOR_BASE,
    CANONICAL_ORGANIZATION_BASE,
    CANONICAL_SETTINGS_BASE,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import { parseOperatorWorkUnitPath } from "@/lib/admin/canonicalOperatorRoutes";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    loadOperatorLifecycleLandingCards,
    peekOperatorLifecycleLandingCards,
} from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { warmOperatorWorkUnitNavEntry } from "@/lib/admin/warmOperatorWorkUnitNavEntry";
import { workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { requestWorkspaceReturn } from "@/lib/experience/surfaceHost/workspaceReturnIntent";
import {
    SidebarAnalyticsNavItem,
    SidebarInboxNavItem,
    SidebarProcessingNavItem,
    SidebarSchedulingNavItem,
    SidebarRosterNavItem,
    SidebarTasksNavItem,
} from "@/app/adminV2/components/SidebarModalNavItems";
import { appendWorkspaceSiteToPath, readStickyWorkspaceSiteIdForNavigation } from "@/lib/adminV2/workspaceSiteFilterClient";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    useWorkViewTotals,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "@/lib/presentation/runtime/useWorkViewTotals";
import { useActiveAdminV2WorkspaceModal } from "@/lib/adminV2/useActiveWorkspaceModal";
import SidebarConfigurationModeNav from "@/app/adminV2/components/SidebarConfigurationModeNav";
import { readInboxUnreadCountCache } from "@/lib/adminV2/inboxNavUnreadCache";
import { readOperationalTasksNavCountsCache } from "@/lib/adminV2/operationalTasksNavCountsCache";
import { composeShellNavigationSurfaceViewModel } from "@/lib/adminV2/runtime/surface/shellNavigationSurfaceViewModel";

const WORKSPACE = CANONICAL_OPERATOR_BASE;
const ORGANIZATION_HREF = CANONICAL_ADMIN_CONFIG_LANDING;

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
    if (path.startsWith(`${CANONICAL_ADMIN_BASE}/workspace`)) return false;
    return (
        path === CANONICAL_SETTINGS_BASE
        || path.startsWith(`${CANONICAL_SETTINGS_BASE}/`)
        // Productized Organization domains live under `/organization/{slug}` — must keep
        // Configuration Mode rail mounted (exact `/organization` alone is not enough).
        || path === CANONICAL_ORGANIZATION_BASE
        || path.startsWith(`${CANONICAL_ORGANIZATION_BASE}/`)
        || path === CANONICAL_ADMIN_BASE
        || path.startsWith(`${CANONICAL_ADMIN_BASE}/`)
    );
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
    // When an operational modal is open it is the active workspace; route-based highlights
    // (Workspace / lifecycle) defer to it so the rail shows a single active anchor.
    const activeModal = useActiveAdminV2WorkspaceModal();
    const modalOpen = activeModal != null;
    // Site scope: prefer the shell site-filter context (what WS/WU counts use) so the numbers
    // agree; fall back to the sticky nav site id when the sidebar renders outside the provider
    // (non-workspace shell branch), matching the scope hrefs already carry.
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter
        ? siteFilter.selectedSiteId
        : readStickyWorkspaceSiteIdForNavigation();

    const [lifecycleCards, setLifecycleCards] = useState<OperatorLifecycleLandingCard[]>(
        () => peekOperatorLifecycleLandingCards(selectedSiteId) ?? [],
    );
    const [lifecycleLoading, setLifecycleLoading] = useState(
        () => peekOperatorLifecycleLandingCards(selectedSiteId) == null,
    );
    const [expandedLifecycleIds, setExpandedLifecycleIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        let cancelled = false;
        void loadOperatorLifecycleLandingCards({ selectedSiteId })
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
    }, [selectedSiteId]);

    const toggleLifecycleExpanded = useCallback((id: string) => {
        setExpandedLifecycleIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Canonical Work View counts — the SAME source the Workspace tile list and Work Unit pill
    // strip resolve from (`useWorkViewTotals`: the view's `work_view_id` evaluated at its
    // canonical location — host work unit + base lane). Left-nav count == tile count == pill
    // count for the same view by construction. Fetches DEDUPE via `dedupeAdminFetch`, so calling
    // the hook here does not double-fetch what the WS/WU surfaces already request.

    const workViewTotalTargets = useMemo<WorkViewTotalTarget[]>(() => {
        const seen = new Set<string>();
        const out: WorkViewTotalTarget[] = [];
        for (const card of lifecycleCards) {
            for (const entry of card.workQueues) {
                const viewId = entry.work_view_id?.trim();
                const workUnitId = entry.host_work_unit_id?.trim();
                const baseQueueKey = entry.base_queue_key?.trim();
                if (!viewId || !workUnitId || !baseQueueKey) continue;
                const key = workViewTotalKey(workUnitId, viewId);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ viewId, workUnitId, baseQueueKey });
            }
        }
        return out;
    }, [lifecycleCards]);

    const workViewTotals = useWorkViewTotals({
        targets: workViewTotalTargets,
        selectedSiteId,
        enabled: lifecycleCards.length > 0,
    });

    // ShellNavigationSurfaceViewModel — the persistent left nav is mounted ABOVE the route (in
    // AdminV2Shell) so it commits once and never remounts across workspace/work-unit navigation.
    // This VM formalizes that ownership: items + active route + modal launchers compose one stable
    // surface; count badges are descriptive snapshots read from the SAME warm caches the reactive
    // badge hooks write (no duplicate fetch) and patch quietly in place. Diagnostics only — does not
    // gate nav rendering.
    const shellNavVm = useMemo(() => {
        const tasks = readOperationalTasksNavCountsCache("open");
        return composeShellNavigationSurfaceViewModel({
            // Standing items: home + settings + 4 modal launchers + one entry per lifecycle process.
            itemCount: 2 + 4 + lifecycleCards.length,
            activeRouteKey:
                activeModal != null
                    ? `modal:${activeModal}`
                    : workUnitSlug != null
                      ? `work_unit:${workUnitSlug}`
                      : path,
            activeRouteResolvable: path.length > 0,
            launcherKeys: ["inbox", "processing", "tasks", "analytics"],
            inboxUnread: readInboxUnreadCountCache(),
            workItems: tasks ? tasks.open + tasks.due_soon + tasks.overdue : null,
            processing: null,
            notifications: null,
            collapsed,
            warmFromSession: lifecycleCards.length > 0,
        });
    }, [path, workUnitSlug, activeModal, collapsed, lifecycleCards.length]);

    const homeHref = workspaceHref(WORKSPACE);
    const railWidth = collapsed ? 56 : 280;

    const homeLink = (
        <AdminV2NavLink
            href={homeHref}
            title="Workspace"
            aria-label="Workspace"
            active={!modalOpen && (path === WORKSPACE || path === `${WORKSPACE}/`)}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
            // Returning to the Workspace is an ATTENTION movement, not just a route change: the
            // committed work-unit Focus must yield or the Surface Host keeps the Work Unit on screen
            // (Kelly A2). The Sidebar sits above the kernel providers, so it forwards the intent to
            // the Surface Host (which owns the kernel) rather than moving attention itself. The href
            // stays for copy-link / open-in-new-tab; modifier clicks fall through to the browser.
            onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                requestWorkspaceReturn();
            }}
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

    const processingLink = <SidebarProcessingNavItem collapsed={collapsed} />;
    const schedulingLink = <SidebarSchedulingNavItem collapsed={collapsed} />;
    // Roster sits next to Assignments: the plan beside the commitments it derives from — and, since
    // the Records re-home, the durable Staff and Children the plan is made of. There is no separate
    // Records entry: a director looking for a person and a director looking at a room are the same
    // director, and the split asked them to decide which they were before they had looked.
    const rosterLink = <SidebarRosterNavItem collapsed={collapsed} />;

    const tasksLink = <SidebarTasksNavItem collapsed={collapsed} />;

    const inboxLink = <SidebarInboxNavItem collapsed={collapsed} />;

    const analyticsLink = <SidebarAnalyticsNavItem collapsed={collapsed} />;

    const organizationLink = (
        <AdminV2NavLink
            href={ORGANIZATION_HREF}
            title="Organization"
            aria-label="Organization"
            active={onSettings}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
        >
            {collapsed ? (
                <Building2 size={20} strokeWidth={1.75} />
            ) : (
                <span className="inline-flex items-center gap-2">
                    <Building2 size={16} strokeWidth={1.75} />
                    Organization
                </span>
            )}
        </AdminV2NavLink>
    );

    const lifecycleNavExpanded = (
        <>
            {lifecycleLoading ? (
                <p className="adminv2-sidebar-muted px-2 py-2 text-xs" aria-busy="true">
                    Loading processes…
                </p>
            ) : null}
            {!lifecycleLoading && lifecycleCards.length === 0 ? (
                <p className="adminv2-sidebar-muted px-2 py-2 text-xs">No processes configured.</p>
            ) : null}
            <div className="space-y-1">
                {lifecycleCards.map((lifecycle) => {
                    const isExpanded = expandedLifecycleIds.has(lifecycle.id);
                    const lifecycleEntryActive =
                        !modalOpen && path === lifecycle.entryHref && !workUnitSlug;
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
                                        warmOperatorWorkUnitNavEntry(
                                            lifecycle.entryHref,
                                            null,
                                            "sidebar_lifecycle_hover",
                                        )
                                    }
                                    onFocus={() =>
                                        warmOperatorWorkUnitNavEntry(
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
                                <div className="ml-8 border-l border-white/10 pl-2.5">
                                    <ul
                                        className="adminv2-sidebar-queue-list list-none space-y-0.5 pt-0.5"
                                        role="group"
                                        aria-label={`${lifecycle.label} work views`}
                                    >
                                    {lifecycle.workQueues.map((entry) => {
                                        const childHref = workspaceHref(entry.href);
                                        // Active match on the entry's ROUTE key (the slug its href
                                        // navigates to). Work-view entries carry `route_key` derived
                                        // from the configured LABEL; `platformKey` is the internal
                                        // view id, which diverges after a rename ("Hot List" can
                                        // carry id `new_work_view_2`) and must not drive highlighting.
                                        const childActive =
                                            !modalOpen &&
                                            workUnitSlug != null &&
                                            workUnitRouteSlugsEquivalent(
                                                workUnitSlug,
                                                entry.route_key ?? entry.platformKey,
                                            );
                                        const viewId = entry.work_view_id?.trim();
                                        const hostWorkUnitId = entry.host_work_unit_id?.trim();
                                        // Canonical count for this view (host-scoped key); null =
                                        // pending/unresolved → stable placeholder, never a wrong number.
                                        const count =
                                            viewId && hostWorkUnitId
                                                ? workViewTotals.get(
                                                      workViewTotalKey(hostWorkUnitId, viewId),
                                                  ) ?? null
                                                : null;
                                        // Only reserve the count slot for entries that HAVE a canonical
                                        // location (a real view total); label-only entries stay label-only.
                                        const hasCountSlot = Boolean(viewId && hostWorkUnitId);
                                        return (
                                            <li
                                                key={entry.platformKey}
                                                role="none"
                                                data-work-view-id={viewId ?? entry.platformKey}
                                            >
                                                <AdminV2NavLink
                                                    href={childHref}
                                                    active={childActive}
                                                    highlightFromActiveOnly
                                                    className={EXPANDED_QUEUE_LINK}
                                                    title={entry.label}
                                                    onMouseEnter={() =>
                                                        warmOperatorWorkUnitNavEntry(
                                                            entry.href,
                                                            null,
                                                            "sidebar_queue_hover",
                                                        )
                                                    }
                                                    onFocus={() =>
                                                        warmOperatorWorkUnitNavEntry(
                                                            entry.href,
                                                            null,
                                                            "sidebar_queue_focus",
                                                        )
                                                    }
                                                >
                                                    <span className="flex w-full items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {entry.label}
                                                        </span>
                                                        {hasCountSlot ? (
                                                            <span
                                                                className="adminv2-sidebar-queue-count shrink-0 text-right tabular-nums"
                                                                aria-hidden={count == null}
                                                            >
                                                                {count == null ? (
                                                                    <span
                                                                        className="adminv2-sidebar-queue-count-pending inline-block h-2.5 w-4 animate-pulse rounded-sm bg-white/20 align-middle"
                                                                        aria-hidden="true"
                                                                    />
                                                                ) : (
                                                                    count
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </AdminV2NavLink>
                                            </li>
                                        );
                                    })}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </>
    );

    return (
        <aside
            data-adminv2-sidebar="true"
            data-shell-nav-surface="true"
            data-shell-nav-ready={shellNavVm.reveal.canCommit ? "true" : "false"}
            data-shell-nav-source={shellNavVm.source}
            data-shell-nav-version={String(shellNavVm.version)}
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
                        className="adminv2-sidebar-toggle flex h-10 w-full flex-shrink-0 items-center justify-center motion-press hover:opacity-90"
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
                        className="adminv2-sidebar-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-md motion-press hover:opacity-90"
                        aria-label="Collapse sidebar"
                    >
                        <PanelLeftClose size={20} />
                    </button>
                </div>
            )}

            {collapsed ? (
                <nav className="flex min-h-0 flex-1 flex-col px-1.5 pb-2" aria-label="Workspace navigation">
                    <div className="flex shrink-0 flex-col items-stretch gap-1">
                        {!onSettings ? homeLink : null}
                        {onSettings ? null : (
                            <>
                                {inboxLink}
                                {processingLink}
                                {schedulingLink}
                                {rosterLink}
                                {tasksLink}
                                {analyticsLink}
                            </>
                        )}
                    </div>
                    {onSettings ? <SidebarConfigurationModeNav collapsed /> : <div className="min-h-0 flex-1" aria-hidden />}
                    <div className="adminv2-sidebar-footer flex shrink-0 flex-col items-stretch gap-1 border-t pt-1">
                        {organizationLink}
                    </div>
                </nav>
            ) : (
                <div className="adminv2-sidebar-body flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-3 text-[13px]">
                    <div className="min-h-0 flex-1 overflow-y-auto pt-1">
                        <div className="space-y-1">
                            {!onSettings ? homeLink : null}
                            {!onSettings ?
                                <>
                                    {inboxLink}
                                    {processingLink}
                                    {schedulingLink}
                                    {rosterLink}
                                    {tasksLink}
                                    {analyticsLink}
                                    {lifecycleNavExpanded}
                                </>
                            :   <SidebarConfigurationModeNav collapsed={false} />}
                        </div>
                    </div>
                    <div className="adminv2-sidebar-footer shrink-0 border-t pt-2">
                        {organizationLink}
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
