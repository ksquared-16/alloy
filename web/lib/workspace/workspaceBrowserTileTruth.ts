import type { WorkspaceRootDepartmentRow } from "@/lib/workspace/workspaceRootDepartmentTypes";
import { OPERATOR_WORKSPACE_HREF } from "@/lib/admin/canonicalOperatorRoutes";
import { findWorkspaceRootCacheForPrincipal } from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { bustWorkspaceDepartmentsFetchDedupe } from "@/lib/workspace/workspaceAdminFetchDedupe";
import {
    departmentIdInRenderedWorkspaceTiles,
    traceWorkspaceRootDepartmentTiles,
    type WorkspaceTilePipelineTrace,
} from "@/lib/workspace/workspaceRootTilePipeline";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";

export type WorkspaceBrowserTileTruth = {
    networkTrace: WorkspaceTilePipelineTrace;
    cachedTrace: WorkspaceTilePipelineTrace | null;
    check: LifecycleActivationCheckResult;
};

/** Client-only: compare network departments vs sessionStorage workspace root cache. */
export async function evaluateWorkspaceBrowserTileTruth(
    orgId: string,
    principalUserId: string | null,
    departmentId: string
): Promise<WorkspaceBrowserTileTruth> {
    bustWorkspaceDepartmentsFetchDedupe();
    const init = workspaceDataFetchInit() ?? {};
    const res = await fetch("/api/admin/departments", { ...init, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
        items?: WorkspaceRootDepartmentRow[];
        error?: string;
    };
    if (!res.ok) {
        const check: LifecycleActivationCheckResult = {
            id: "workspace_browser_cache",
            label: "Visible in browser (/workspace)",
            pass: false,
            href: OPERATOR_WORKSPACE_HREF,
            detail: json.error ?? "Failed to load departments for browser truth check.",
        };
        return {
            networkTrace: { apiDepartmentIds: [], afterActiveFilterIds: [], renderedTileIds: [] },
            cachedTrace: null,
            check,
        };
    }

    const items = json.items ?? [];
    const networkTrace = traceWorkspaceRootDepartmentTiles(items);
    const cached = findWorkspaceRootCacheForPrincipal(orgId, principalUserId);
    const cachedTrace = cached ? traceWorkspaceRootDepartmentTiles(cached.departments) : null;

    const inNetwork = departmentIdInRenderedWorkspaceTiles(networkTrace, departmentId);
    const inCache = cachedTrace ? departmentIdInRenderedWorkspaceTiles(cachedTrace, departmentId) : null;

    let pass = false;
    let detail = "";

    if (!inNetwork) {
        const apiIds = networkTrace.apiDepartmentIds.join(", ") || "(none)";
        detail = `Fail: Selected lifecycle department ID is not returned by /workspace API. Selected=${departmentId}. Browser API ids=[${apiIds}].`;
    } else if (cachedTrace && inCache === false) {
        detail = `sessionStorage workspace cache is stale (${cachedTrace.renderedTileIds.length} tile(s), missing this department). Network has ${networkTrace.renderedTileIds.length} tile(s). Open /workspace — it refetches after lifecycle changes.`;
    } else if (cachedTrace && inCache === true) {
        pass = true;
        detail = `Network and sessionStorage both include this department (${networkTrace.renderedTileIds.length} workspace tile(s)).`;
    } else {
        pass = true;
        detail = `Network includes this department (${networkTrace.renderedTileIds.length} tile(s)); no workspace session cache yet.`;
    }

    const check: LifecycleActivationCheckResult = {
        id: "workspace_browser_cache",
        label: "Visible in browser (/workspace)",
        pass,
        href: OPERATOR_WORKSPACE_HREF,
        detail,
    };

    return { networkTrace, cachedTrace, check };
}
