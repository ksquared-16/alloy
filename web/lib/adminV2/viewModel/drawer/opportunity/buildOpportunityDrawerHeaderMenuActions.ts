import {
    emptyResolvedActionsBySlot,
    type ResolvedActionForClient,
    type ResolvedActionsBySlot,
} from "@/lib/admin/actions/types";
import { flattenOpportunityRecordHeaderActionsForMenu } from "@/lib/admin/actions/flattenOpportunityRecordHeaderActionsForMenu";
import {
    CHANGE_LEAD_LOCATION_ACTION_KEY,
    CHANGE_LEAD_LOCATION_FORM_KEY,
    CHANGE_LEAD_LOCATION_LABEL,
} from "@/lib/admin/actions/changeLeadLocationContract";

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

/** Platform-guaranteed Manage item — present even before DB seed is applied. */
function ensureChangeLeadLocationInMenu(actions: ResolvedActionForClient[]): ResolvedActionForClient[] {
    if (actions.some((a) => a.key === CHANGE_LEAD_LOCATION_ACTION_KEY)) return actions;
    return [
        ...actions,
        {
            key: CHANGE_LEAD_LOCATION_ACTION_KEY,
            label: CHANGE_LEAD_LOCATION_LABEL,
            description: null,
            action_type: "ui_intent",
            icon: null,
            style: null,
            display_style: "outline",
            payload: { form_key: CHANGE_LEAD_LOCATION_FORM_KEY },
            workflow_id: null,
        },
    ];
}

/**
 * Flatten registry record_header slots for the BOS command rail when copilot routing is enabled.
 */
export function buildOpportunityDrawerHeaderMenuActions(
    resolved: ResolvedActionsBySlot | null | undefined,
    hasActiveTourBooking: boolean
): ResolvedActionForClient[] {
    const base = resolved ?? emptyResolvedActionsBySlot();
    return ensureChangeLeadLocationInMenu(
        flattenOpportunityRecordHeaderActionsForMenu(
            relabelResolvedActionsForActiveTour(base, hasActiveTourBooking),
        ),
    );
}
