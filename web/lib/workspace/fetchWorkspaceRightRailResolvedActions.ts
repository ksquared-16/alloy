import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";

const SURFACES = ["right_rail", "work_unit", "department"] as const;

/**
 * Loads registry actions for workspace right rails. Placements may live under `right_rail`, `work_unit`,
 * or `department` surfaces depending on seed/version — merge so ops / scoped personas still see safe defaults.
 */
export async function fetchWorkspaceRightRailResolvedActions(params: {
    departmentId: string;
    workUnitId: string;
    fetchInit?: RequestInit;
}): Promise<ResolvedActionForClient[]> {
    const { departmentId, workUnitId, fetchInit } = params;
    const init = fetchInit ?? {};
    const settled = await Promise.allSettled(
        SURFACES.map((surface) => {
            const route =
                `/api/admin/actions?` +
                new URLSearchParams({
                    surface,
                    entity_type: "opportunity",
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                }).toString();
            return dedupeAdminFetchWithTtl(route, init, 8000);
        })
    );
    const parts: ResolvedActionsBySlot[] = [];
    for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        const res = s.value;
        if (!res.ok) continue;
        const j = (await res.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
        if (j.actions) parts.push(j.actions);
    }
    const merged = mergeResolvedActionsBySlot(...parts);
    return rightRailResolvedFromActionsPayload(merged);
}
