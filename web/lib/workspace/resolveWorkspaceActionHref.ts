import type { WorkspaceActionItem } from "./types";

export type WorkspaceDeptQueueRoute = "unassigned" | "scheduled-today" | "needs-attention";

/** Deep link to an existing department queue page under a workspace base path. */
export function workspaceDeptQueueHref(
    workspaceBasePath: string,
    departmentId: string,
    deptRoute: WorkspaceDeptQueueRoute,
    query?: Record<string, string | undefined>
): string {
    const base = workspaceBasePath.replace(/\/$/, "");
    const tail = deptRoute === "unassigned" ? "unassigned" : deptRoute;
    const path = `${base}/dept/${encodeURIComponent(departmentId)}/${tail}`;
    if (!query || Object.keys(query).length === 0) return path;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== "") params.set(k, v);
    }
    const q = params.toString();
    return q ? `${path}?${q}` : path;
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
