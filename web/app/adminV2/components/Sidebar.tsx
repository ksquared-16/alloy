"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
    Building2,
    ChevronDown,
    ChevronRight,
    GitBranch,
    Home,
    PanelLeftClose,
    PanelLeft,
    Settings,
} from "lucide-react";
import { neutral, brand } from "@/styles/tokens/colors";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { appendWorkspaceSiteToPath, readStickyWorkspaceSiteIdForNavigation } from "@/lib/adminV2/workspaceSiteFilterClient";
import {
    getInitialWorkspaceNavTreeState,
    getWorkspaceNavTreeSnapshot,
    hydrateWorkspaceNavTreeCache,
    loadWorkspaceNavTree,
    type WorkspaceNavTreeDept,
    type WorkspaceNavTreeWu,
} from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import {
    readExpandedDeptIds,
    writeExpandedDeptIds,
} from "@/lib/adminV2/navigation/adminV2SidebarDeptExpanded";
import {
    buildWorkspaceNavDeptChildren,
    isWorkspaceNavChildActive,
    workspaceNavChildHref,
} from "@/lib/adminV2/navigation/buildWorkspaceNavDeptChildren";

const WORKSPACE = "/adminV2/workspace";
const WORKFLOWS_HREF = "/adminV2/workflows";
const SETTINGS_HREF = "/adminV2/settings";

const EXPANDED_PRIMARY_LINK =
    "block w-full rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10";

/** Nested queue rows under a department — indented, no icon, quieter than dept row. */
const EXPANDED_QUEUE_LINK = "adminv2-sidebar-queue-link";

function normalizeAdminPath(pathname: string): string {
    if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
        if (pathname === "/admin/v2") return "/adminV2/workspace";
        return `/adminV2${pathname.slice("/admin/v2".length)}`;
    }
    if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
        return `/adminV2${pathname.slice("/adminv2".length)}`;
    }
    return pathname;
}

function parseWorkspaceRoute(path: string): { departmentId: string | null; workUnitId: string | null } {
    const m = /^\/adminV2\/workspace\/dept\/([^/]+)(?:\/work-unit\/([^/]+))?\/?$/.exec(path);
    if (!m) return { departmentId: null, workUnitId: null };
    return { departmentId: m[1] ?? null, workUnitId: m[2] ?? null };
}

function workspaceHref(path: string): string {
    return appendWorkspaceSiteToPath(path, readStickyWorkspaceSiteIdForNavigation());
}

function filterDepts(depts: WorkspaceNavTreeDept[]): WorkspaceNavTreeDept[] {
    return [...depts]
        .filter((d) => {
            const key = String(d.key ?? "").trim().toLowerCase();
            const name = String(d.name ?? "").trim().toLowerCase();
            return key !== "system" && name !== "system";
        })
        .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

const primaryLinkStyle = { color: brand.primary } as CSSProperties;

function SidebarNav({
    collapsed,
    onToggle,
}: {
    collapsed: boolean;
    onToggle: () => void;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const path = useMemo(() => normalizeAdminPath(pathname), [pathname]);
    const { departmentId, workUnitId } = parseWorkspaceRoute(path);
    const activeQueueKey = searchParams.get("queue")?.trim() || null;
    const onSettings = path.startsWith(SETTINGS_HREF);
    const onWorkflows = path.startsWith(WORKFLOWS_HREF);

    const initialTree = getInitialWorkspaceNavTreeState();
    const [depts, setDepts] = useState<WorkspaceNavTreeDept[]>(initialTree.depts);
    const [wus, setWus] = useState<WorkspaceNavTreeWu[]>(initialTree.wus);
    const [treeError, setTreeError] = useState<string | null>(initialTree.error);
    const [treeLoading, setTreeLoading] = useState(initialTree.showLoading);
    const [expandedDeptIds, setExpandedDeptIds] = useState<Set<string>>(() => readExpandedDeptIds());

    useEffect(() => {
        let cancelled = false;
        const applySnapshot = (snap: ReturnType<typeof getWorkspaceNavTreeSnapshot>) => {
            if (!snap || cancelled) return;
            setDepts(snap.depts);
            setWus(snap.wus);
            setTreeError(snap.error);
            setTreeLoading(false);
        };

        const snap = getWorkspaceNavTreeSnapshot() ?? hydrateWorkspaceNavTreeCache();
        if (snap?.depts.length) {
            applySnapshot(snap);
            void loadWorkspaceNavTree().then((fresh) => {
                if (!cancelled && fresh.depts.length) applySnapshot(fresh);
            });
            return () => {
                cancelled = true;
            };
        }

        if (!initialTree.depts.length) setTreeLoading(true);
        void loadWorkspaceNavTree().then((loaded) => {
            if (!cancelled) applySnapshot(loaded);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const toggleDeptExpanded = useCallback((deptId: string) => {
        setExpandedDeptIds((prev) => {
            const next = new Set(prev);
            if (next.has(deptId)) next.delete(deptId);
            else next.add(deptId);
            writeExpandedDeptIds(next);
            return next;
        });
    }, []);

    const deptsSorted = useMemo(() => filterDepts(depts), [depts]);
    const deptNavChildren = useMemo(() => {
        const m = new Map<string, ReturnType<typeof buildWorkspaceNavDeptChildren>>();
        for (const d of deptsSorted) {
            m.set(d.id, buildWorkspaceNavDeptChildren(d.id, wus));
        }
        return m;
    }, [deptsSorted, wus]);

    const homeHref = workspaceHref(WORKSPACE);
    const railWidth = collapsed ? 56 : 280;

    const homeLink = (
        <AdminV2NavLink
            href={homeHref}
            title="Home"
            aria-label="Home"
            active={path === WORKSPACE}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
            style={primaryLinkStyle}
        >
            {collapsed ? (
                <Home size={20} strokeWidth={1.75} />
            ) : (
                <span className="inline-flex items-center gap-2">
                    <Home size={16} strokeWidth={1.75} />
                    Home
                </span>
            )}
        </AdminV2NavLink>
    );

    const automationsLink = (
        <AdminV2NavLink
            href={WORKFLOWS_HREF}
            title="Automations"
            aria-label="Automations"
            active={onWorkflows}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
            style={primaryLinkStyle}
        >
            {collapsed ? (
                <GitBranch size={20} strokeWidth={1.75} />
            ) : (
                <span className="inline-flex items-center gap-2">
                    <GitBranch size={16} strokeWidth={1.75} />
                    Automations
                </span>
            )}
        </AdminV2NavLink>
    );

    const settingsLink = (
        <AdminV2NavLink
            href={SETTINGS_HREF}
            title="Settings"
            aria-label="Settings"
            active={onSettings}
            className={collapsed ? "adminv2-sidebar-rail-link" : EXPANDED_PRIMARY_LINK}
            style={primaryLinkStyle}
        >
            {collapsed ? (
                <Settings size={20} strokeWidth={1.75} />
            ) : (
                <span className="inline-flex items-center gap-2">
                    <Settings size={16} strokeWidth={1.75} />
                    Settings
                </span>
            )}
        </AdminV2NavLink>
    );

    const departmentTreeExpanded = (
        <div className="pt-2 min-h-0">
            <div
                className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold tracking-wide"
                style={{ color: neutral.textSecondary }}
            >
                <span>Departments</span>
                {treeError ? <span className="normal-case font-medium text-red-700/70">Unavailable</span> : null}
            </div>
            {treeLoading && !deptsSorted.length ? (
                <p className="px-2 py-2 text-xs text-alloy-midnight/50" aria-busy="true">
                    Loading departments…
                </p>
            ) : null}
            <div className="space-y-1">
                {deptsSorted.map((d) => {
                    const name = (d.name ?? "").trim() || "Untitled department";
                    const deptHref = workspaceHref(`${WORKSPACE}/dept/${d.id}`);
                    const deptActive = departmentId === d.id && !workUnitId;
                    const deptChildren = deptNavChildren.get(d.id) ?? [];
                    const hasChildren = deptChildren.length > 0;
                    const isExpanded = expandedDeptIds.has(d.id);
                    return (
                        <div key={d.id} className="space-y-0.5">
                            <div className="flex items-stretch gap-0.5">
                                {hasChildren ? (
                                    <button
                                        type="button"
                                        className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md hover:bg-alloy-stone/10"
                                        style={{ color: brand.primary }}
                                        aria-expanded={isExpanded}
                                        aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}
                                        onClick={() => toggleDeptExpanded(d.id)}
                                    >
                                        {isExpanded ? (
                                            <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
                                        ) : (
                                            <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                                        )}
                                    </button>
                                ) : (
                                    <span className="w-7 shrink-0" aria-hidden />
                                )}
                                <AdminV2NavLink
                                    href={deptHref}
                                    active={deptActive}
                                    className={`min-w-0 flex-1 ${EXPANDED_PRIMARY_LINK}`}
                                    style={primaryLinkStyle}
                                    title={name}
                                >
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                        <Building2 size={16} strokeWidth={1.75} className="shrink-0" />
                                        <span className="truncate">{name}</span>
                                    </span>
                                </AdminV2NavLink>
                            </div>
                            {hasChildren && isExpanded ? (
                                <ul
                                    className="adminv2-sidebar-queue-list ml-8 list-none space-y-0.5 border-l pl-2.5"
                                    style={{ borderColor: neutral.border }}
                                    role="group"
                                    aria-label={`${name} queues`}
                                >
                                    {deptChildren.map((child) => {
                                        const childHref = workspaceHref(
                                            workspaceNavChildHref(WORKSPACE, d.id, child)
                                        );
                                        const childActive = isWorkspaceNavChildActive({
                                            departmentId,
                                            workUnitId,
                                            activeQueueKey,
                                            child,
                                            deptId: d.id,
                                        });
                                        return (
                                            <li key={child.rowKey} role="none">
                                                <AdminV2NavLink
                                                    href={childHref}
                                                    active={childActive}
                                                    highlightFromActiveOnly
                                                    className={EXPANDED_QUEUE_LINK}
                                                    title={child.label}
                                                >
                                                    <span className="truncate">{child.label}</span>
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
            className="relative z-[100] flex flex-col flex-shrink-0 min-h-0 border-r transition-[width] duration-200 ease-out overflow-hidden"
            style={{
                width: railWidth,
                backgroundColor: neutral.surface,
                borderColor: neutral.border,
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                className="flex h-14 w-full flex-shrink-0 items-center justify-center hover:opacity-90 active:scale-[0.98] transition-transform"
                style={{ color: brand.primary }}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
                {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            </button>

            {collapsed ? (
                <nav className="flex min-h-0 flex-1 flex-col px-1.5 pb-2" aria-label="Workspace navigation">
                    <div className="flex shrink-0 flex-col items-stretch gap-1">
                        {homeLink}
                        {automationsLink}
                    </div>
                    <div className="min-h-0 flex-1" aria-hidden />
                    <div
                        className="flex shrink-0 flex-col items-stretch gap-1 border-t pt-1"
                        style={{ borderColor: neutral.border }}
                    >
                        {settingsLink}
                    </div>
                </nav>
            ) : (
                <div
                    className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-3 text-[13px]"
                    style={{ color: neutral.textSecondary }}
                >
                    <div className="shrink-0 space-y-1 pt-1">
                        {homeLink}
                        {automationsLink}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">{departmentTreeExpanded}</div>
                    <div className="shrink-0 border-t pt-2" style={{ borderColor: neutral.border }}>
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
                    className="relative z-[100] flex flex-shrink-0 flex-col border-r"
                    style={{ width: railWidth, backgroundColor: neutral.surface, borderColor: neutral.border }}
                    aria-hidden
                />
            }
        >
            <SidebarNav {...props} />
        </Suspense>
    );
}
