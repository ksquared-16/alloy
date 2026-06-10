import { DepartmentQueueRouteShell } from "@/components/admin/workspace/DepartmentQueueRouteShell";

export default function AdminV2WorkspaceNeedsAttentionPage() {
    return <DepartmentQueueRouteShell workspaceBase="/workspace" mode="needs_attention" />;
}
