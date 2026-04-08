import { DepartmentQueueRouteShell } from "@/components/admin/workspace/DepartmentQueueRouteShell";

export default function AdminV2WorkspaceNeedsAttentionPage() {
    return <DepartmentQueueRouteShell workspaceBase="/adminV2/workspace" mode="needs_attention" />;
}
