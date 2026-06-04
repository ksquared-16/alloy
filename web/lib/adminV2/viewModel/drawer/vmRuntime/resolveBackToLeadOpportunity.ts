import type { AdminDrawerState, DrawerStackItem } from "@/contexts/AdminDrawerContext";
import { DRAWER_BACK_TO_LEAD_OPEN_SOURCE } from "@/contexts/AdminDrawerContext";
import type { PersonDrawerOpenSeed } from "@/lib/admin/drawer/personDrawerOpenSeed";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/**
 * Resolve pinned Back to Lead opportunity from drawer navigation context.
 * Order: stack (nearest opportunity) → explicit seed opportunity id.
 */
export function findBackToLeadOpportunityInStack(
    stack: DrawerStackItem[],
    drawer: Pick<AdminDrawerState, "personDrawerOpenSeed">
): DrawerStackItem | null {
    for (let i = stack.length - 1; i >= 0; i--) {
        const item = stack[i];
        if (item.type === "opportunities" && trimId(item.id)) {
            return item;
        }
    }
    const seedOppId = trimId(drawer.personDrawerOpenSeed?.opportunity_id);
    if (seedOppId) {
        return {
            type: "opportunities",
            id: seedOppId,
            openSource: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
            opportunityWorkspaceContext: null,
        };
    }
    return null;
}

export function backToLeadOpportunityIdFromRecord(
    record: Record<string, unknown>,
    seed?: PersonDrawerOpenSeed | null
): string | null {
    return (
        trimId(seed?.opportunity_id) ||
        trimId(record.opportunity_id) ||
        trimId((record._opportunity as { id?: unknown } | undefined)?.id) ||
        trimId(
            (record._enrollment_mirror as { opportunity_id?: unknown } | undefined)?.opportunity_id
        )
    );
}
