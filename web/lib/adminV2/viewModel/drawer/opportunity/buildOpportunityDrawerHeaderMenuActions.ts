import {
    emptyResolvedActionsBySlot,
    type ResolvedActionForClient,
    type ResolvedActionsBySlot,
} from "@/lib/admin/actions/types";
import { flattenOpportunityRecordHeaderActionsForMenu } from "@/lib/admin/actions/flattenOpportunityRecordHeaderActionsForMenu";

function relabelScheduleTourWhenActive(
    actions: ResolvedActionForClient[]
): ResolvedActionForClient[] {
    return actions.map((a) =>
        a.key === "schedule_tour" ? { ...a, label: "Reschedule tour" } : a
    );
}

function relabelResolvedActionsForActiveTour(
    resolved: ResolvedActionsBySlot,
    hasActiveTourBooking: boolean
): ResolvedActionsBySlot {
    if (!hasActiveTourBooking) return resolved;
    const relabel = relabelScheduleTourWhenActive;
    return {
        ...resolved,
        primary: relabel(resolved.primary ?? []),
        secondary: relabel(resolved.secondary ?? []),
        overflow: relabel(resolved.overflow ?? []),
        right_rail: relabel(resolved.right_rail ?? []),
        row_inline: relabel(resolved.row_inline ?? []),
        header: relabel(resolved.header ?? []),
    };
}

/**
 * Flatten all record_header slots for the Actions dropdown — matches legacy drawer menu exposure.
 */
export function buildOpportunityDrawerHeaderMenuActions(
    resolved: ResolvedActionsBySlot | null | undefined,
    hasActiveTourBooking: boolean
): ResolvedActionForClient[] {
    const base = resolved ?? emptyResolvedActionsBySlot();
    return flattenOpportunityRecordHeaderActionsForMenu(
        relabelResolvedActionsForActiveTour(base, hasActiveTourBooking)
    );
}
