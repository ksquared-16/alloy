import { DepartmentQueueRouteShell } from "@/components/admin/workspace/DepartmentQueueRouteShell";

export default function WorkspaceNeedsAttentionPage() {
    return <DepartmentQueueRouteShell workspaceBase="/admin/workspace" mode="needs_attention" />;
}
