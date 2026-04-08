"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { WorkspaceRenderer } from "@/components/admin/workspace/WorkspaceRenderer";
import { getDepartmentWorkspaceLayout } from "@/lib/workspace";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";

export default function WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";

    const { dept, title, runtime, error } = useOperationsWorkspaceData(departmentId);

    const layout = useMemo(() => getDepartmentWorkspaceLayout(dept?.key ?? null), [dept?.key]);

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: "/admin/workspace", label: "Workspace" },
                { href: `/admin/workspace/dept/${departmentId}`, label: title },
            ]}
            title={title}
            subtitle="Configurable operational surface — blocks are driven by workspace layout config, not hardcoded department pages."
        >
            {error && <p className="text-sm text-amber-800 px-1">{error}</p>}
            <WorkspaceRenderer
                layout={layout}
                departmentId={departmentId}
                runtime={runtime}
                presentation="department_bridge"
                bridgeBriefTitle={title}
                bridgeBriefSubtitle="Signals and queues use live org data; registry drives layout."
            />
        </WorkspaceChrome>
    );
}
