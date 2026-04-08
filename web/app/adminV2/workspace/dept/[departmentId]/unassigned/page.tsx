"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";

const WORKSPACE_BASE = "/adminV2/workspace";

type JobRow = {
    id: string;
    title?: string | null;
    created_at?: string;
    status_key?: string | null;
    _customer_name?: string | null;
    _status_display?: string | null;
    _job_label?: string | null;
};

export default function AdminV2UnassignedJobsWorkspacePage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";
    const { openDrawer } = useAdminDrawer();

    const [deptName, setDeptName] = useState("Department");
    const [jobs, setJobs] = useState<JobRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [dRes, jRes] = await Promise.all([
                    fetch("/api/admin/departments"),
                    fetch("/api/admin/jobs?unassigned_work_unit=true&limit=200"),
                ]);
                const dj = (await dRes.json().catch(() => ({}))) as { items?: { id: string; name: string | null }[] };
                const jj = (await jRes.json().catch(() => ({}))) as { jobs?: JobRow[]; error?: string };
                if (!jRes.ok) throw new Error(jj.error ?? "Failed to load jobs");
                const depts = dj.items ?? [];
                const d = depts.find((x) => x.id === departmentId);
                if (!cancelled) {
                    if (d?.name?.trim()) setDeptName(d.name.trim());
                    setJobs(jj.jobs ?? []);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    const openJobDrawer = (id: string) => {
        openDrawer({ type: "jobs", id, jobRecordSurface: "drawer" });
    };

    return (
        <WorkspaceChrome
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: deptName },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}/unassigned`, label: "Unassigned jobs" },
            ]}
            title="Unassigned jobs"
            subtitle="Jobs from GET /api/admin/jobs?unassigned_work_unit=true. Row opens the entity drawer (resolver surface=drawer); full record stays on /admin/jobs/[id] until migrated."
        >
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="rounded-lg border border-admin-border bg-alloy-stone/20 px-4 py-3 text-sm text-alloy-midnight/75">
                These jobs are not assigned to a work unit yet. Assign from the drawer or the full job page when needed.
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
                                <th className="px-4 py-2">Created</th>
                                <th className="px-4 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-alloy-midnight/55">
                                        No unassigned jobs.
                                    </td>
                                </tr>
                            ) : (
                                jobs.map((j) => (
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
