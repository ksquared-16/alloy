"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Building2, Boxes, GitBranch, LayoutGrid, PanelLeftClose, PanelLeft, Settings } from "lucide-react";
import { neutral, brand } from "@/styles/tokens/colors";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";

const WORKSPACE = "/adminV2/workspace";
const SETTINGS_HREF = "/adminV2/settings";

type Dept = { id: string; name: string | null; key?: string | null };
type WU = { id: string; name: string | null; department_id: string };

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

export default function Sidebar({
    collapsed,
    onToggle,
}: {
    collapsed: boolean;
    onToggle: () => void;
}) {
    const pathname = usePathname();
    const path = useMemo(() => normalizeAdminPath(pathname), [pathname]);
    const { departmentId, workUnitId } = parseWorkspaceRoute(path);
    const onWorkspace = path === WORKSPACE || path.startsWith(`${WORKSPACE}/`);
    const onSettings = path.startsWith(SETTINGS_HREF);
    const onWorkflows = path.startsWith("/adminV2/workflows");

    const [depts, setDepts] = useState<Dept[]>([]);
    const [wus, setWus] = useState<WU[]>([]);
    const [treeError, setTreeError] = useState<string | null>(null);

    useEffect(() => {
        if (collapsed) return;
        let cancelled = false;
        (async () => {
            try {
                const init = workspaceDataFetchInit();
                const [dRes, wRes] = await Promise.all([
                    dedupeAdminFetch("/api/admin/departments", init),
                    dedupeAdminFetch("/api/admin/work-units", init),
                ]);
                const dj = (await dRes.json().catch(() => ({}))) as { items?: Dept[] };
                const wj = (await wRes.json().catch(() => ({}))) as { items?: WU[] };
                if (cancelled) return;
                setTreeError(null);
                if (dRes.ok) setDepts(dj.items ?? []);
                else setTreeError("Departments unavailable");
                if (wRes.ok) setWus(wj.items ?? []);
            } catch {
                if (!cancelled) setTreeError("Navigation data unavailable");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [collapsed]);

    const deptsSorted = useMemo(() => {
        return [...depts]
            .filter((d) => {
                const key = String(d.key ?? "").trim().toLowerCase();
                const name = String(d.name ?? "").trim().toLowerCase();
                return key !== "system" && name !== "system";
            })
            .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    }, [depts]);

    const wusByDept = useMemo(() => {
        const m = new Map<string, WU[]>();
        for (const w of wus) {
            const k = w.department_id;
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(w);
        }
        for (const arr of m.values()) {
            arr.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
        }
        return m;
    }, [wus]);

    const railWidth = collapsed ? 56 : 280;

    return (
        <aside
            className="flex flex-col flex-shrink-0 min-h-0 border-r transition-[width] duration-200 ease-out overflow-hidden"
            style={{
                width: railWidth,
                backgroundColor: neutral.surface,
                borderColor: neutral.border,
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center justify-center h-12 w-full flex-shrink-0 hover:opacity-90 active:scale-[0.98] transition-transform"
                style={{ color: brand.primary }}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
                {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
            </button>

            {collapsed ? (
                <nav
                    className="flex flex-col flex-1 min-h-0 px-1.5 pb-2"
                    aria-label="Workspace navigation"
                >
                    <div className="flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto">
                        <AdminV2NavLink
                            href={WORKSPACE}
                            title="Workspace"
                            aria-label="Workspace"
                            active={path === WORKSPACE}
                            className="adminv2-sidebar-rail-link"
                            style={{ color: brand.primary }}
                        >
                            <LayoutGrid size={20} strokeWidth={1.75} />
                        </AdminV2NavLink>
                        {departmentId ? (
                            <AdminV2NavLink
                                href={`${WORKSPACE}/dept/${departmentId}`}
                                title="Department"
                                aria-label="Department"
                                active={Boolean(departmentId && !workUnitId)}
                                className="adminv2-sidebar-rail-link"
                                style={{ color: brand.primary }}
                            >
                                <Building2 size={20} strokeWidth={1.75} />
                            </AdminV2NavLink>
                        ) : null}
                        {departmentId && workUnitId ? (
                            <AdminV2NavLink
                                href={`${WORKSPACE}/dept/${departmentId}/work-unit/${workUnitId}`}
                                title="Work unit"
                                aria-label="Work unit"
                                active
                                className="adminv2-sidebar-rail-link"
                                style={{ color: brand.primary }}
                            >
                                <Boxes size={20} strokeWidth={1.75} />
                            </AdminV2NavLink>
                        ) : null}
                    </div>
                    <div className="mt-auto flex flex-shrink-0 flex-col items-stretch gap-1 border-t pt-1" style={{ borderColor: neutral.border }}>
                        <AdminV2NavLink
                            href="/adminV2/workflows"
                            title="Automations"
                            aria-label="Automations"
                            active={onWorkflows}
                            className="adminv2-sidebar-rail-link"
                            style={{ color: brand.primary }}
                        >
                            <GitBranch size={20} strokeWidth={1.75} />
                        </AdminV2NavLink>
                        <AdminV2NavLink
                            href={SETTINGS_HREF}
                            title="Settings"
                            aria-label="Settings"
                            active={onSettings}
                            className="adminv2-sidebar-rail-link"
                            style={{ color: brand.primary }}
                        >
                            <Settings size={20} strokeWidth={1.75} />
                        </AdminV2NavLink>
                    </div>
                </nav>
            ) : (
                <div
                    className="flex flex-col flex-1 min-h-0 px-2 pb-3 gap-2 text-[13px] overflow-y-auto"
                    style={{ color: neutral.textSecondary }}
                >
                    <div className="pt-1 font-semibold text-[11px] tracking-wide" style={{ color: neutral.textSecondary }}>
                        Navigate
                    </div>
                    <AdminV2NavLink
                        href={WORKSPACE}
                        active={path === WORKSPACE}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <LayoutGrid size={16} strokeWidth={1.75} />
                            Workspace
                        </span>
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/workflows"
                        active={onWorkflows}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <GitBranch size={16} strokeWidth={1.75} />
                            Automations
                        </span>
                    </AdminV2NavLink>

                    <div className="pt-2">
                        <div
                            className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold tracking-wide"
                            style={{ color: neutral.textSecondary }}
                        >
                            <span>Departments</span>
                            {treeError ? <span className="normal-case font-medium text-red-700/70">Unavailable</span> : null}
                        </div>
                        <div className="space-y-1">
                            {deptsSorted.map((d) => {
                                const name = (d.name ?? "").trim() || "Untitled department";
                                const deptHref = `${WORKSPACE}/dept/${d.id}`;
                                const deptActive = departmentId === d.id && !workUnitId;
                                return (
                                    <div key={d.id} className="space-y-1">
                                        <AdminV2NavLink
                                            href={deptHref}
                                            active={deptActive}
                                            className="rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10"
                                            style={{ color: brand.primary }}
                                            title={name}
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                <Building2 size={16} strokeWidth={1.75} />
                                                <span className="truncate">{name}</span>
                                            </span>
                                        </AdminV2NavLink>
                                        {(wusByDept.get(d.id) ?? []).length ? (
                                            <div className="ml-6 space-y-1">
                                                {(wusByDept.get(d.id) ?? []).map((wu) => {
                                                    const wuName = (wu.name ?? "").trim() || "Untitled work unit";
                                                    const wuHref = `${WORKSPACE}/dept/${d.id}/work-unit/${wu.id}`;
                                                    const wuActive = departmentId === d.id && workUnitId === wu.id;
                                                    return (
                                                        <AdminV2NavLink
                                                            key={wu.id}
                                                            href={wuHref}
                                                            active={wuActive}
                                                            className="rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10"
                                                            style={{ color: brand.primary }}
                                                            title={wuName}
                                                        >
                                                            <span className="inline-flex items-center gap-2">
                                                                <Boxes size={15} strokeWidth={1.75} />
                                                                <span className="truncate">{wuName}</span>
                                                            </span>
                                                        </AdminV2NavLink>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-auto pt-2 border-t" style={{ borderColor: neutral.border }}>
                        <AdminV2NavLink
                            href={SETTINGS_HREF}
                            active={onSettings}
                            className="rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10"
                            style={{ color: brand.primary }}
                        >
                            <span className="inline-flex items-center gap-2">
                                <Settings size={16} strokeWidth={1.75} />
                                Settings
                            </span>
                        </AdminV2NavLink>
                    </div>
                </div>
            )}
        </aside>
    );
}
