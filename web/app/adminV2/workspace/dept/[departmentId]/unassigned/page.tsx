import { DepartmentQueueRouteShell } from "@/components/admin/workspace/DepartmentQueueRouteShell";

export default function AdminV2UnassignedJobsWorkspacePage() {
    return <DepartmentQueueRouteShell workspaceBase="/workspace" mode="unassigned" />;
}
