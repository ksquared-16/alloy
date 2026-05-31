import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";

/**
 * Flatten resolved record_header slots into a single Actions menu list.
 * Preserves resolver order: primary → secondary → overflow → header; dedupes by action key.
 */
export function flattenOpportunityRecordHeaderActionsForMenu(
    actions: ResolvedActionsBySlot
): ResolvedActionForClient[] {
    const seen = new Set<string>();
    const out: ResolvedActionForClient[] = [];
    for (const a of [
        ...(actions.primary ?? []),
        ...(actions.secondary ?? []),
        ...(actions.overflow ?? []),
        ...(actions.header ?? []),
    ]) {
        if (seen.has(a.key)) continue;
        seen.add(a.key);
        out.push(a);
    }
    return out;
}
