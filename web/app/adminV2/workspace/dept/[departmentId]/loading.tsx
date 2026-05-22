import { DepartmentWorkspaceColdShell } from "@/components/admin/workspace/DepartmentWorkspaceColdShell";

/** Segment loader — bridge shell + oper-region-only reserve (shell-first; matches work-unit `loading.tsx`). */
export default function Loading() {
    return <DepartmentWorkspaceColdShell />;
}
