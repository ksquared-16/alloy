"use client";

import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

const WORKSPACE_BASE = "/adminV2/workspace";

type Props = {
    /** When known (hydrated page); route `loading.tsx` omits. */
    departmentTitle?: string;
};

/** Stable chrome only — operational bridge renders after `deptPageOperationalReady` (PR-4.6). */
export function DepartmentWorkspaceColdShell({ departmentTitle = "Department" }: Props) {
    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { label: departmentTitle },
            ]}
            title={departmentTitle}
            subtitle=""
        >
            <AdminV2RouteLoadingState
                variant="department"
                showRibbon={false}
                title="Loading department operations"
                description="Fetching queues, attention, and metrics…"
            />
        </WorkspaceChrome>
    );
}
