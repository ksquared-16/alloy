"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { WorkspaceRenderer } from "@/components/admin/workspace/WorkspaceRenderer";
import { getDepartmentWorkspaceLayout, type DepartmentWorkspaceLayout } from "@/lib/workspace";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";

const WORKSPACE_BASE = "/adminV2/workspace";

/** Generic fallback still carries a KPI placeholder — hide it in the V2 shell. */
function layoutForAdminV2Slice(base: DepartmentWorkspaceLayout): DepartmentWorkspaceLayout {
    return {
        ...base,
        blocks: base.blocks.filter((b) => b.type !== "kpi"),
    };
}

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";

    const { dept, title, runtime, error } = useOperationsWorkspaceData(departmentId);

    const layout = useMemo(
        () => layoutForAdminV2Slice(getDepartmentWorkspaceLayout(dept?.key ?? null)),
        [dept?.key]
    );

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: title },
            ]}
            title={title}
            subtitle="Operations workspace — signals, queues, and actions are opinionated defaults from the shared registry."
        >
            {error && <p className="text-sm text-amber-800 px-1">{error}</p>}
            <WorkspaceRenderer
                layout={layout}
                departmentId={departmentId}
                runtime={runtime}
                presentation="department_bridge"
                bridgeBriefTitle={title}
                bridgeBriefSubtitle="Live job samples power the strip; queues link to real routes under this workspace."
                workspaceBasePath={WORKSPACE_BASE}
            />
        </WorkspaceChrome>
    );
}
