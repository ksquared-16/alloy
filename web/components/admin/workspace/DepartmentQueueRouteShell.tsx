"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DepartmentJobsQueuePage } from "@/components/admin/workspace/DepartmentJobsQueuePage";
import type { DepartmentJobsQueueMode } from "@/hooks/useDepartmentQueueData";

export function DepartmentQueueRouteShell({
    workspaceBase,
    mode,
}: {
    workspaceBase: string;
    mode: DepartmentJobsQueueMode;
}) {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";
    const [deptName, setDeptName] = useState("Department");

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/departments");
                const json = (await res.json().catch(() => ({}))) as {
                    items?: { id: string; name: string | null }[];
                };
                if (!res.ok) return;
                const d = (json.items ?? []).find((x) => x.id === departmentId);
                if (!cancelled && d?.name?.trim()) setDeptName(d.name.trim());
            } catch {
                /* keep default */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    if (!departmentId) {
        return <p className="text-sm text-alloy-midnight/60 px-1">Invalid department.</p>;
    }

    return (
        <DepartmentJobsQueuePage workspaceBase={workspaceBase} departmentId={departmentId} mode={mode} deptName={deptName} />
    );
}
