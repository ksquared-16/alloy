import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

const RAIL_SLOT_ORDER: (keyof ResolvedActionsBySlot)[] = ["right_rail", "primary", "secondary"];

/**
 * Flatten merged workspace rail surfaces into one list for the right rail UI.
 * Includes `work_unit` + `department` primary-slot placements (not only legacy `right_rail` surface).
 */
export function rightRailResolvedFromActionsPayload(
    actions: ResolvedActionsBySlot | undefined
): ResolvedActionForClient[] {
    if (!actions) return [];
    const seen = new Set<string>();
    const out: ResolvedActionForClient[] = [];
    for (const slot of RAIL_SLOT_ORDER) {
        for (const a of actions[slot] ?? []) {
            if (seen.has(a.key)) continue;
            seen.add(a.key);
            out.push(a);
        }
    }
    return out;
}
