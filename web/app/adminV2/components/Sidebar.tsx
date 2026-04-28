"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
    Building2,
    Boxes,
    GitBranch,
    LayoutGrid,
    PanelLeftClose,
    PanelLeft,
    Settings,
    DollarSign,
    ShieldCheck,
    Wrench,
    ClipboardCheck,
} from "lucide-react";
import { neutral, brand } from "@/styles/tokens/colors";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";

const WORKSPACE = "/adminV2/workspace";

type Dept = { id: string; name: string | null };
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
    const onSettings = path.startsWith("/adminV2/settings");
    const onWorkflows = path.startsWith("/adminV2/workflows");
    const onFinance = path.startsWith("/admin/financials");
    const onOps = path.startsWith("/admin/operations");
    const onSystem = path.startsWith("/admin/system");
    const onCompliance = path.startsWith("/admin/system/access-control");

    const [depts, setDepts] = useState<Dept[]>([]);
    const [wus, setWus] = useState<WU[]>([]);
    const [treeError, setTreeError] = useState<string | null>(null);

    useEffect(() => {
        if (collapsed) return;
        if (!path.startsWith("/adminV2/workspace")) {
            return;
        }
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
    }, [collapsed, path]);

    const deptsSorted = useMemo(() => {
        return [...depts].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
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
                    className="flex flex-col items-stretch gap-1 px-1.5 pb-3 flex-1 min-h-0 overflow-y-auto"
                    aria-label="Workspace navigation"
                >
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
                    <div className="flex-1 min-h-[8px]" />
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
                        href="/admin/opportunities"
                        title="Inquiries"
                        aria-label="Inquiries"
                        active={path.startsWith("/admin/opportunities")}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <ClipboardCheck size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/financials"
                        title="Finance"
                        aria-label="Finance"
                        active={onFinance}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <DollarSign size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/operations/recurrence"
                        title="Operations"
                        aria-label="Operations"
                        active={onOps}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <Wrench size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/system/access-control"
                        title="Compliance"
                        aria-label="Compliance"
                        active={onCompliance}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <ShieldCheck size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/system"
                        title="System"
                        aria-label="System"
                        active={onSystem}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <Settings size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/settings"
                        title="Settings"
                        aria-label="Settings"
                        active={onSettings}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <Settings size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                </nav>
            ) : (
                <div className="flex flex-col flex-1 min-h-0 px-2 pb-3 gap-2 text-[13px]" style={{ color: neutral.textSecondary }}>
                    <div className="font-semibold text-[11px] uppercase tracking-wide" style={{ color: neutral.textSecondary }}>
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
                    <AdminV2NavLink
                        href="/admin/opportunities"
                        active={path.startsWith("/admin/opportunities")}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <ClipboardCheck size={16} strokeWidth={1.75} />
                            Inquiries
                        </span>
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/financials"
                        active={onFinance}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <DollarSign size={16} strokeWidth={1.75} />
                            Finance
                        </span>
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/operations/recurrence"
                        active={onOps}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <Wrench size={16} strokeWidth={1.75} />
                            Operations
                        </span>
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/system/access-control"
                        active={onCompliance}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <ShieldCheck size={16} strokeWidth={1.75} />
                            Compliance
                        </span>
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/admin/system"
                        active={onSystem}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <Settings size={16} strokeWidth={1.75} />
                            System
                        </span>
                    </AdminV2NavLink>

                    {path.startsWith("/adminV2/workspace") ? (
                        <div className="flex flex-col gap-1 min-h-0 flex-1 overflow-y-auto">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Departments</div>
                            {treeError ? <p className="text-[11px] text-amber-800">{treeError}</p> : null}
                            {deptsSorted.length === 0 && !treeError ? (
                                <p className="text-[11px] text-alloy-midnight/45">No departments yet.</p>
                            ) : (
                                <ul className="space-y-0.5 pl-0 list-none m-0">
                                    {deptsSorted.map((d) => {
                                        const activeDept = departmentId === d.id;
                                        const childWus = wusByDept.get(d.id) ?? [];
                                        return (
                                            <li key={d.id} className="min-w-0">
                                                <AdminV2NavLink
                                                    href={`${WORKSPACE}/dept/${d.id}`}
                                                    active={activeDept && !workUnitId}
                                                    className="block truncate rounded-md px-2 py-1 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                                                    style={{ color: brand.primary }}
                                                    title={d.name ?? d.id}
                                                >
                                                    {d.name?.trim() || d.id.slice(0, 8)}
                                                </AdminV2NavLink>
                                                {childWus.length > 0 ? (
                                                    <ul className="mt-0.5 mb-1 ml-2 pl-2 border-l space-y-0.5 list-none" style={{ borderColor: neutral.border }}>
                                                        {childWus.map((wu) => (
                                                            <li key={wu.id} className="min-w-0">
                                                                <AdminV2NavLink
                                                                    href={`${WORKSPACE}/dept/${d.id}/work-unit/${wu.id}`}
                                                                    active={workUnitId === wu.id}
                                                                    className="block truncate rounded px-2 py-0.5 text-[12px] text-alloy-midnight/75 hover:bg-alloy-stone/10"
                                                                    style={{ color: brand.primary }}
                                                                    title={wu.name ?? wu.id}
                                                                >
                                                                    {wu.name?.trim() || wu.id.slice(0, 8)}
                                                                </AdminV2NavLink>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 min-h-[8px]" />
                    )}

                    <div className="mt-auto pt-2 border-t" style={{ borderColor: neutral.border }}>
                        <AdminV2NavLink
                            href="/adminV2/settings"
                            active={onSettings}
                            className="rounded-md px-2 py-1.5 font-medium hover:bg-alloy-stone/10"
                            style={{ color: brand.primary }}
                        >
                            Settings
                        </AdminV2NavLink>
                    </div>
                </div>
            )}
        </aside>
    );
}
