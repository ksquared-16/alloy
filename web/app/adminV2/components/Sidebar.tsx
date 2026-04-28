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
// Navigation is top-level only; department/work-unit context lives in breadcrumbs.

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
    const onInquiries = path.startsWith("/adminV2/inquiries");
    const onFinance = path.startsWith("/adminV2/finance");
    const onOps = path.startsWith("/adminV2/operations");
    const onSystem = path.startsWith("/adminV2/system");
    const onCompliance = path.startsWith("/adminV2/compliance");

    const [depts] = useState<Dept[]>([]);
    const [wus] = useState<WU[]>([]);
    const [treeError] = useState<string | null>(null);
    useEffect(() => {}, []);

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
                        href="/adminV2/inquiries"
                        title="Inquiries"
                        aria-label="Inquiries"
                        active={onInquiries}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <ClipboardCheck size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/finance"
                        title="Finance"
                        aria-label="Finance"
                        active={onFinance}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <DollarSign size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/operations"
                        title="Operations"
                        aria-label="Operations"
                        active={onOps}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <Wrench size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/compliance"
                        title="Compliance"
                        aria-label="Compliance"
                        active={onCompliance}
                        className="adminv2-sidebar-rail-link"
                        style={{ color: brand.primary }}
                    >
                        <ShieldCheck size={20} strokeWidth={1.75} />
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/system"
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
                        href="/adminV2/inquiries"
                        active={onInquiries}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <ClipboardCheck size={16} strokeWidth={1.75} />
                            Inquiries
                        </span>
                    </AdminV2NavLink>
                    <AdminV2NavLink
                        href="/adminV2/finance"
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
                        href="/adminV2/operations"
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
                        href="/adminV2/compliance"
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
                        href="/adminV2/system"
                        active={onSystem}
                        className="rounded-md px-2 py-1.5 font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10"
                        style={{ color: brand.primary }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <Settings size={16} strokeWidth={1.75} />
                            System
                        </span>
                    </AdminV2NavLink>

                    <div className="flex-1 min-h-[8px]" />

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
