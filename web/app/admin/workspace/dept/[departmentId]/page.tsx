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

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const layout = useMemo(() => getDepartmentWorkspaceLayout(dept?.key ?? null), [dept?.key]);

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: "/admin/workspace", label: "Workspace" },
                { href: `/admin/workspace/dept/${departmentId}`, label: loading ? "…" : title },
            ]}
            title={loading ? "Loading…" : title}
            subtitle="Live queues and attention for this department — layout comes from the workspace registry."
        >
            {error && <p className="text-sm text-amber-800 px-1">{error}</p>}
            {loading || !dept ? (
                <div className="rounded-xl border border-admin-border px-4 py-10 text-center text-sm text-alloy-midnight/55">
                    Loading department workspace…
                </div>
            ) : (
                <WorkspaceRenderer
                    layout={layout}
                    departmentId={departmentId}
                    runtime={runtime}
                    presentation="department_bridge"
                    bridgeBriefTitle={title}
                    bridgeBriefSubtitle="Signal strip is a quick read — primary work is in the lanes below."
                />
            )}
        </WorkspaceChrome>
    );
}
