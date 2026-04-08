import type { WorkspaceActionItem } from "./types";

export function resolveWorkspaceActionHref(
    action: WorkspaceActionItem,
    ctx: { departmentId: string; workspaceBasePath: string }
): string {
    if ("href" in action) return action.href;
    const base = `${ctx.workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(ctx.departmentId)}`;
    const seg = action.deptRoute;
    const tail = seg === "unassigned" ? "unassigned" : seg;
    return `${base}/${tail}`;
}
