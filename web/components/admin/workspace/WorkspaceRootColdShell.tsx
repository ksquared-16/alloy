"use client";

import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { WorkspaceRootShell } from "@/components/admin/workspace/WorkspaceRootShell";

/** Shell-first workspace root while departments fetch — stable chrome, skeleton KPI + dept grid. */
export function WorkspaceRootColdShell() {
    const { orgName } = useWorkspaceOrg();
    return (
        <WorkspaceRootShell
            orgName={orgName}
            departments={[]}
            deptTileStats={{}}
            metrics={null}
            metricsLoading
            kpiStripPlaceholder
            departmentsPending
        />
    );
}
