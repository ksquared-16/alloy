"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";

type Dept = { id: string; name: string | null };
type WU = { id: string; name: string | null; department_id: string; key?: string | null };

export default function WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";

    const [dept, setDept] = useState<Dept | null>(null);
    const [workUnits, setWorkUnits] = useState<WU[]>([]);
    const [unassignedTotal, setUnassignedTotal] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const title = useMemo(() => dept?.name?.trim() || "Department", [dept]);

    const unassignedHref = `/admin/workspace/dept/${departmentId}/unassigned`;

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            try {
                const [dRes, wRes, jRes] = await Promise.all([
                    fetch("/api/admin/departments"),
                    fetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`),
                    fetch("/api/admin/jobs?unassigned_work_unit=true&limit=1"),
                ]);
                const dj = (await dRes.json().catch(() => ({}))) as { items?: Dept[]; error?: string };
                const wj = (await wRes.json().catch(() => ({}))) as { items?: WU[]; error?: string };
                const jj = (await jRes.json().catch(() => ({}))) as { total?: number; error?: string };
                if (!dRes.ok) throw new Error(dj.error ?? "Departments request failed");
                if (!wRes.ok) throw new Error(wj.error ?? "Work units request failed");
                if (jRes.ok && typeof jj.total === "number" && !cancelled) setUnassignedTotal(jj.total);
                const depts = dj.items ?? [];
                const wus = wj.items ?? [];
                const d = depts.find((x) => x.id === departmentId) ?? null;
                if (!cancelled) {
                    setDept(d);
                    setWorkUnits(wus);
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    const otherWorkUnits = workUnits.filter((wu) => {
        const n = (wu.name ?? "").toLowerCase();
        const k = (wu.key ?? "").toLowerCase();
        return !n.includes("unassign") && k !== "unassigned";
    });

    return (
        <WorkspaceChrome
            breadcrumbs={[
                { href: "/admin/workspace", label: "Workspace" },
                { href: `/admin/workspace/dept/${departmentId}`, label: title },
            ]}
            title={title}
            subtitle="Department surface — pick a work unit to open its queue. This slice focuses on navigation, not a full dashboard."
        >
            {error && <p className="text-sm text-red-600">{error}</p>}

            <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-alloy-midnight">Signals</h2>
                <p className="text-xs text-alloy-midnight/60 mt-1">Light counts only (slice 1).</p>
                <p className="mt-3 text-sm text-alloy-forge/90">
                    Jobs with no work unit:{" "}
                    <span className="font-medium text-alloy-midnight">
                        {unassignedTotal === null ? "—" : unassignedTotal}
                    </span>
                </p>
            </section>

            <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-alloy-midnight">Work units</h2>
                <p className="text-xs text-alloy-midnight/60 mt-1">
                    Primary entry points for queues in this department.
                </p>
                <ul className="mt-4 divide-y divide-admin-border border border-admin-border rounded-lg overflow-hidden">
                    <li>
                        <Link
                            href={unassignedHref}
                            className="block px-4 py-3 hover:bg-alloy-stone/30 transition-colors"
                        >
                            <span className="font-medium text-alloy-midnight">Unassigned jobs</span>
                            <p className="text-xs text-alloy-midnight/55 mt-0.5">
                                Triage queue — jobs where work unit is not set.
                            </p>
                        </Link>
                    </li>
                    {otherWorkUnits.map((wu) => (
                        <li key={wu.id} className="px-4 py-3 bg-alloy-stone/10">
                            <span className="text-sm text-alloy-midnight/70">{wu.name ?? "Work unit"}</span>
                            <p className="text-xs text-alloy-midnight/45 mt-0.5">
                                Queue UI deferred — use Unassigned jobs for the V2 proving path.
                            </p>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-xl border border-dashed border-admin-border bg-alloy-stone/15 p-4 text-sm text-alloy-midnight/70">
                <p className="font-medium text-alloy-midnight/85">KPIs</p>
                <p className="mt-1">Placeholder strip for slice 1 — wire analytics later.</p>
            </section>

            <p className="text-xs text-alloy-midnight/50">
                Manage hierarchy in{" "}
                <Link href="/admin/system/work-units" className="text-alloy-blue hover:underline">
                    Organization → Work units
                </Link>
                .
            </p>
        </WorkspaceChrome>
    );
}
