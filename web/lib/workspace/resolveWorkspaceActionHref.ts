import type { WorkspaceActionItem } from "./types";

export type WorkspaceDeptQueueRoute = "unassigned" | "scheduled-today" | "needs-attention";

/** Deep link to an existing department queue page under a workspace base path. */
export function workspaceDeptQueueHref(
    workspaceBasePath: string,
    departmentId: string,
    deptRoute: WorkspaceDeptQueueRoute
): string {
    const base = workspaceBasePath.replace(/\/$/, "");
    const tail = deptRoute === "unassigned" ? "unassigned" : deptRoute;
    return `${base}/dept/${encodeURIComponent(departmentId)}/${tail}`;
}

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
