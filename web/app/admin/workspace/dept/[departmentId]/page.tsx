"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { WorkspaceRenderer } from "@/components/admin/workspace/WorkspaceRenderer";
import { getDepartmentWorkspaceLayout, type WorkspaceRuntimeData } from "@/lib/workspace";

type Dept = { id: string; name: string | null; key?: string | null };
type WU = { id: string; name: string | null; department_id: string; key?: string | null };

export default function WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";

    const [dept, setDept] = useState<Dept | null>(null);
    const [workUnits, setWorkUnits] = useState<WU[]>([]);
    const [unassignedTotal, setUnassignedTotal] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const title = useMemo(() => dept?.name?.trim() || "Department", [dept]);

    const layout = useMemo(() => getDepartmentWorkspaceLayout(dept?.key ?? null), [dept?.key]);

    const runtime: WorkspaceRuntimeData = useMemo(
        () => ({
            metrics: { "jobs.unassigned_count": unassignedTotal },
            workUnits,
        }),
        [unassignedTotal, workUnits]
    );

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

    return (
        <WorkspaceChrome
            breadcrumbs={[
                { href: "/admin/workspace", label: "Workspace" },
                { href: `/admin/workspace/dept/${departmentId}`, label: title },
            ]}
            title={title}
            subtitle="Configurable operational surface — blocks are driven by workspace layout config, not hardcoded department pages."
        >
            {error && <p className="text-sm text-red-600">{error}</p>}
            <WorkspaceRenderer layout={layout} departmentId={departmentId} runtime={runtime} />
        </WorkspaceChrome>
    );
}
