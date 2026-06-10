/**
 * Lifecycle Builder — curated base actions (not full catalog).
 */

export type LifecycleBaseActionKey =
    | "add_person"
    | "add_child"
    | "send_form"
    | "schedule_tour"
    | "change_status"
    | "create_task"
    | "create_record"
    | "quick_message";

export type LifecycleBaseActionDefinition = {
    key: LifecycleBaseActionKey;
    label: string;
    /** Platform action_definitions.key */
    definition_key: string;
};

export const LIFECYCLE_BASE_ACTIONS: readonly LifecycleBaseActionDefinition[] = [
    { key: "add_person", label: "Add Parent", definition_key: "add_family_member" },
    { key: "add_child", label: "Add Child", definition_key: "add_child" },
    { key: "send_form", label: "Send Form", definition_key: "send_form" },
    { key: "schedule_tour", label: "Schedule Tour", definition_key: "schedule_tour" },
    { key: "change_status", label: "Update Status", definition_key: "update_status_add_note" },
    { key: "create_task", label: "Create Task", definition_key: "create_task" },
    { key: "quick_message", label: "Message", definition_key: "quick_message" },
] as const;

export type LifecycleActionPlacementOption = {
    id: string;
    label: string;
    surface: string;
    slot: string;
};

/** Operator-facing placement labels for Lifecycle Builder. */
export const LIFECYCLE_ACTION_PLACEMENTS: readonly LifecycleActionPlacementOption[] = [
    { id: "drawer", label: "Drawer", surface: "record_header", slot: "primary" },
    { id: "queue_row", label: "Work Unit Queue Row", surface: "queue_row", slot: "row_inline" },
    { id: "work_unit_rail", label: "Work Unit Right Rail", surface: "work_unit", slot: "primary" },
    { id: "department_rail", label: "Department Right Rail", surface: "department", slot: "primary" },
    { id: "workspace_root", label: "Workspace root", surface: "workspace", slot: "primary" },
    { id: "overflow", label: "Overflow Menu", surface: "record_header", slot: "overflow" },
] as const;

/** Activation wizard — user-facing placement labels. */
export const LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS: readonly LifecycleActionPlacementOption[] = [
    { id: "overflow", label: "Drawer Actions menu", surface: "record_header", slot: "overflow" },
    { id: "queue_row", label: "Work Unit Queue row", surface: "queue_row", slot: "row_inline" },
    { id: "work_unit_rail", label: "Work Unit right rail", surface: "work_unit", slot: "primary" },
    { id: "department_rail", label: "Department right rail", surface: "department", slot: "primary" },
    { id: "workspace_root", label: "Workspace root", surface: "workspace", slot: "primary" },
] as const;

/** Base actions for activation, including create-record with configured primary label. */
export function lifecycleActivationBaseActions(primaryRecordLabel: string): readonly LifecycleBaseActionDefinition[] {
    const leadLabel = primaryRecordLabel.trim() || "Lead";
    return [
        { key: "create_record", label: `Create ${leadLabel}`, definition_key: "create_lead" },
        ...LIFECYCLE_BASE_ACTIONS,
    ];
}

export function lifecycleBaseActionByKey(key: string): LifecycleBaseActionDefinition | null {
    return LIFECYCLE_BASE_ACTIONS.find((a) => a.key === key) ?? null;
}

/** Resolves activation-only base actions (e.g. create_record) and curated catalog actions. */
export function lifecycleActivationBaseActionByKey(
    key: string,
    primaryRecordLabel = "Lead"
): LifecycleBaseActionDefinition | null {
    return (
        lifecycleActivationBaseActions(primaryRecordLabel).find((a) => a.key === key) ??
        lifecycleBaseActionByKey(key)
    );
}

export function lifecyclePlacementById(id: string): LifecycleActionPlacementOption | null {
    return (
        LIFECYCLE_ACTION_PLACEMENTS.find((p) => p.id === id) ??
        LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.find((p) => p.id === id) ??
        null
    );
}
