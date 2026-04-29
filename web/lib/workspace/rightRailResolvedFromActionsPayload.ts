import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

/**
 * Normalize GET /api/admin/actions?surface=right_rail JSON into a single list for the workspace rail.
 * Prefer `actions.right_rail`; if empty, fall back to primary/secondary buckets (some historical seeds used non–right_rail slots).
 */
export function rightRailResolvedFromActionsPayload(actions: ResolvedActionsBySlot | undefined): ResolvedActionForClient[] {
    if (!actions) return [];
    const rr = actions.right_rail ?? [];
    if (rr.length) return rr;
    return [...(actions.primary ?? []), ...(actions.secondary ?? [])];
}
