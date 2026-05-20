import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";

/**
 * Loads registry actions for workspace right rails — one auth pass via right-rail-bundle API.
 */
export async function fetchWorkspaceRightRailResolvedActions(params: {
    departmentId: string;
    workUnitId: string;
    fetchInit?: RequestInit;
}): Promise<ResolvedActionForClient[]> {
    const { departmentId, workUnitId, fetchInit } = params;
    const init = fetchInit ?? {};
    const route =
        `/api/admin/actions/right-rail-bundle?` +
        new URLSearchParams({
            department_id: departmentId,
            work_unit_id: workUnitId,
        }).toString();
    const res = await dedupeAdminFetchWithTtl(route, init, 8000);
    if (!res.ok) return [];
    const j = (await res.json().catch(() => ({}))) as {
        actions?: ResolvedActionForClient[] | ResolvedActionsBySlot;
    };
    if (Array.isArray(j.actions)) return j.actions;
    if (j.actions && typeof j.actions === "object") {
        return rightRailResolvedFromActionsPayload(j.actions as ResolvedActionsBySlot);
    }
    return [];
}
