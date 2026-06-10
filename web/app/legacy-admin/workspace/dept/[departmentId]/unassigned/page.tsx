import { DepartmentQueueRouteShell } from "@/components/admin/workspace/DepartmentQueueRouteShell";

export default function UnassignedJobsWorkspacePage() {
    return <DepartmentQueueRouteShell workspaceBase="/admin/workspace" mode="unassigned" />;
}
