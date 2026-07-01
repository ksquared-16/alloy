import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

/** Slim row action shape for Work Unit VM first paint — full payload stays on live handlers until cutover. */
export type WorkUnitViewModelRowAction = Pick<
    ResolvedActionForClient,
    "key" | "label" | "action_type" | "display_style" | "icon" | "style"
>;

export type WorkUnitViewModelRightRailAction = Pick<
    ResolvedActionForClient,
    "key" | "label" | "action_type" | "display_style" | "icon" | "style"
>;

export type WorkUnitViewModelActions = {
    row_actions_by_record_id: Record<string, WorkUnitViewModelRowAction[]>;
    right_rail_actions: WorkUnitViewModelRightRailAction[];
    action_availability_state: "ready" | "empty";
};

function slimRowAction(action: ResolvedActionForClient): WorkUnitViewModelRowAction {
    return {
        key: action.key,
        label: action.label,
        action_type: action.action_type,
        display_style: action.display_style,
        icon: action.icon,
        style: action.style,
    };
}

function slimRightRailAction(action: ResolvedActionForClient): WorkUnitViewModelRightRailAction {
    return slimRowAction(action);
}

export function buildWorkUnitViewModelActions(params: {
    opportunityQueueRowResolved: ResolvedActionForClient[] | null;
    enrollmentRightRailResolved: ResolvedActionForClient[] | null;
    queueRowActionsReady: boolean;
    enrollmentActionsSettled: boolean;
    queueRecordIds: string[];
}): WorkUnitViewModelActions {
    const rowTemplates = (params.opportunityQueueRowResolved ?? []).map(slimRowAction);
    const rightRail = (params.enrollmentRightRailResolved ?? []).map(slimRightRailAction);

    const row_actions_by_record_id: Record<string, WorkUnitViewModelRowAction[]> = {};
    for (const recordId of params.queueRecordIds) {
        if (!recordId.trim()) continue;
        row_actions_by_record_id[recordId] = rowTemplates;
    }

    const rowsNeedActions = params.queueRecordIds.length > 0;
    const rowResolved = !rowsNeedActions || params.queueRowActionsReady;
    const railResolved = params.enrollmentActionsSettled;
    const hasAnyActions = rowTemplates.length > 0 || rightRail.length > 0;
    const action_availability_state: WorkUnitViewModelActions["action_availability_state"] =
        rowResolved && railResolved ? (hasAnyActions ? "ready" : "empty") : "empty";

    return {
        row_actions_by_record_id,
        right_rail_actions: rightRail,
        action_availability_state,
    };
}

export function collectWorkUnitViewModelActionKeys(actions: WorkUnitViewModelActions): {
    row_action_keys: string[];
    right_rail_action_keys: string[];
} {
    const rowKeys = new Set<string>();
    for (const list of Object.values(actions.row_actions_by_record_id)) {
        for (const a of list) rowKeys.add(a.key);
    }
    const rightRailKeys = actions.right_rail_actions.map((a) => a.key);
    return {
        row_action_keys: [...rowKeys].sort(),
        right_rail_action_keys: [...rightRailKeys].sort(),
    };
}
