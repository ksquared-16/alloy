"use client";

import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";
import {
    useDepartmentQueueData,
    type AdminJobListRow,
    type DepartmentJobsQueueMode,
} from "@/hooks/useDepartmentQueueData";

const MODE_COPY: Record<
    DepartmentJobsQueueMode,
    { title: string; subtitle: string; empty: string; hint: string; crumb: string; path: string }
> = {
    unassigned: {
        title: "Unassigned jobs",
        subtitle:
            "Jobs with no work unit — from GET /api/admin/jobs?unassigned_work_unit=true. Row opens the resolver-backed drawer.",
        empty: "No unassigned jobs.",
        hint: "These jobs are not assigned to a work unit yet. Assign from the drawer or the full job page when needed.",
        crumb: "Unassigned jobs",
        path: "unassigned",
    },
    scheduled_today: {
        title: "Scheduled today",
        subtitle:
            "Jobs whose next visit falls on today (local time), combining department work units and org-wide unassigned rows. Sample capped at 200 jobs per API request.",
        empty: "No jobs with a visit scheduled for today in the current sample.",
        hint: "Derived from merged lists — not a full-org rollup. Use All jobs in the rail for the full list.",
        crumb: "Scheduled today",
        path: "scheduled-today",
    },
    needs_attention: {
        title: "Needs attention",
        subtitle:
            "Overdue next visits or outstanding receivables on the merged job sample (max 200 rows per source).",
        empty: "Nothing flagged in the current sample.",
        hint: "Triage lens only — open the drawer or full record to resolve.",
        crumb: "Needs attention",
        path: "needs-attention",
    },
};

export function DepartmentJobsQueuePage({
    workspaceBase,
    departmentId,
    mode,
    deptName,
}: {
    workspaceBase: string;
    departmentId: string;
    mode: DepartmentJobsQueueMode;
    deptName: string;
}) {
    const { openDrawer } = useAdminDrawer();
    const copy = MODE_COPY[mode];
    const { jobs, loading, error } = useDepartmentQueueData(departmentId, mode);

    const openJobDrawer = (id: string) => {
        openDrawer({ type: "jobs", id, jobRecordSurface: "drawer" });
    };

    const showNextCol = mode !== "unassigned";

    return (
        <WorkspaceChrome
            breadcrumbs={[
                { href: workspaceBase, label: "Workspace" },
                { href: `${workspaceBase}/dept/${departmentId}`, label: deptName },
                {
                    href: `${workspaceBase}/dept/${departmentId}/${copy.path}`,
                    label: copy.crumb,
                },
            ]}
            title={copy.title}
            subtitle={copy.subtitle}
        >
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="rounded-lg border border-admin-border bg-alloy-stone/20 px-4 py-3 text-sm text-alloy-midnight/75">
                {copy.hint}
            </div>

            {loading ? (
                <p className="text-sm text-alloy-midnight/60">Loading queue…</p>
            ) : (
                <div className="rounded-xl border border-admin-border bg-white overflow-hidden shadow-sm">
                    <table className="min-w-full text-sm">
                        <thead className="bg-alloy-stone/40 text-left text-xs font-semibold uppercase text-alloy-forge/80">
                            <tr>
                                <th className="px-4 py-2">Job</th>
                                <th className="px-4 py-2">Customer</th>
                                <th className="px-4 py-2">Status</th>
                                {showNextCol ? <th className="px-4 py-2">Next visit</th> : null}
                                <th className="px-4 py-2">Created</th>
                                <th className="px-4 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={showNextCol ? 6 : 5}
                                        className="px-4 py-8 text-center text-alloy-midnight/55"
                                    >
                                        {copy.empty}
                                    </td>
                                </tr>
                            ) : (
                                jobs.map((j: AdminJobListRow) => (
                                    <tr
                                        key={j.id}
                                        className="border-t border-admin-border hover:bg-alloy-stone/25 cursor-pointer"
                                        onClick={() => openJobDrawer(j.id)}
                                    >
                                        <td className="px-4 py-2 font-medium text-alloy-midnight">
                                            {(j._job_label ?? j.title)?.trim() || "—"}
                                        </td>
                                        <td className="px-4 py-2 text-alloy-forge/90">{j._customer_name ?? "—"}</td>
                                        <td className="px-4 py-2">{j._status_display ?? j.status_key ?? "—"}</td>
                                        {showNextCol ? (
                                            <td className="px-4 py-2 text-alloy-midnight/80 whitespace-nowrap">
                                                {j._next_schedule ? formatDateTime(j._next_schedule) : "—"}
                                            </td>
                                        ) : null}
                                        <td className="px-4 py-2 text-alloy-midnight/70">
                                            {j.created_at ? formatDateTime(j.created_at) : "—"}
                                        </td>
                                        <td className="px-4 py-2 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                className="text-xs text-alloy-blue font-medium hover:underline mr-3"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openJobDrawer(j.id);
                                                }}
                                            >
                                                Drawer
                                            </button>
                                            <Link
                                                href={`/admin/jobs/${j.id}`}
                                                className="text-xs text-alloy-blue font-medium hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Full record
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </WorkspaceChrome>
    );
}
