/**
 * Lifecycle Builder — curated base actions (not full catalog).
 */

export type LifecycleBaseActionKey =
    | "add_person"
    | "add_child"
    | "send_form"
    | "schedule_tour"
    | "waitlist_child"
    | "enroll_child"
    | "close_lead"
    | "create_task"
    | "create_record"
    | "quick_message";

export type LifecycleBaseActionDefinition = {
    key: LifecycleBaseActionKey;
    label: string;
    /** Platform action_definitions.key */
    definition_key: string;
};

/**
 * Process Actions may bind Lead (opportunity) or child Enrollment participation (OCM) grains.
 * Filtering to opportunity-only dropped Waitlist Child / Enroll Child after a successful save.
 */
export function isLifecycleProcessActionDefinitionEntityType(
    entityType: string | null | undefined,
): boolean {
    if (entityType == null || !String(entityType).trim()) return true;
    const t = String(entityType).trim();
    return (
        t === "opportunity"
        || t === "opportunity_customer_member"
        || t === "opportunity_customer_members"
    );
}

export const LIFECYCLE_BASE_ACTIONS: readonly LifecycleBaseActionDefinition[] = [
    { key: "add_person", label: "Add Parent", definition_key: "add_family_member" },
    { key: "add_child", label: "Add Child", definition_key: "add_child" },
    { key: "send_form", label: "Send Form", definition_key: "send_form" },
    { key: "schedule_tour", label: "Schedule Tour", definition_key: "schedule_tour" },
    // Domain verbs — process owns available actions; operators never pick a generic
    // "Change Status". Each routes to its own outcome/mutation path (definition keys match
    // platformActionCatalog keys). The generic status commands remain runtime-internal only.
    { key: "waitlist_child", label: "Waitlist Child", definition_key: "waitlist_child" },
    { key: "enroll_child", label: "Enroll Child", definition_key: "enroll_child" },
    { key: "close_lead", label: "Close Lead", definition_key: "close_lead" },
    { key: "create_task", label: "Create Work Item", definition_key: "create_task" },
    { key: "quick_message", label: "Message", definition_key: "quick_message" },
] as const;

export type LifecycleActionPlacementOption = {
    id: string;
    label: string;
    surface: string;
    slot: string;
};

/**
 * Canonical operator-facing action placements (Command Surface).
 *
 * These are the ONLY placements offered in the process/lifecycle action editors:
 *   - Focus Panel Manage  → `record_header` / `overflow`  (Focus Panel "Manage" menu)
 *   - Work Unit right rail → `work_unit` / `primary`       (Work Unit Actions rail)
 *   - Workspace           → `workspace` / `primary`        (Workspace root actions rail)
 *
 * Each `surface` here is the exact `action_placements.surface` consumed by the matching rail,
 * so a saved placement resolves on the surface its label promises (e.g. "Work Unit right rail"
 * → `work_unit`, which the Work Unit page requests via `placementSurfaces: ["work_unit"]`).
 *
 * Configuration places actions; it does not create executable behavior.
 */
export const LIFECYCLE_ACTION_PLACEMENTS: readonly LifecycleActionPlacementOption[] = [
    { id: "overflow", label: "Focus Panel Manage", surface: "record_header", slot: "overflow" },
    { id: "work_unit_rail", label: "Work Unit right rail", surface: "work_unit", slot: "primary" },
    { id: "workspace_root", label: "Workspace", surface: "workspace", slot: "primary" },
] as const;

/** Activation wizard uses the same canonical placement set as the process action editor. */
export const LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS: readonly LifecycleActionPlacementOption[] =
    LIFECYCLE_ACTION_PLACEMENTS;

/**
 * Deprecated placements retained ONLY so previously-saved configs load/resolve without
 * breaking. They are never offered in the editor. Legacy saved data is normalized onto the
 * canonical set (see {@link normalizeLifecyclePlacementId} /
 * {@link lifecycleActivationPlacementIdForSurfaceSlot}):
 *   - Department right rail (`department`/`primary`) → Workspace
 *   - Focus Panel          (`record_header`/`primary`) → Focus Panel Manage
 *   - Work Unit Queue row  (`queue_row`/`row_inline`)  → dropped (no longer surfaced)
 */
export const LIFECYCLE_DEPRECATED_ACTION_PLACEMENTS: readonly LifecycleActionPlacementOption[] = [
    { id: "drawer", label: "Focus Panel", surface: "record_header", slot: "primary" },
    { id: "queue_row", label: "Work Unit Queue row", surface: "queue_row", slot: "row_inline" },
    { id: "department_rail", label: "Department right rail", surface: "department", slot: "primary" },
] as const;

/**
 * Normalize a placement id (canonical or deprecated) onto the canonical set.
 * Returns `null` for placements that are deprecated and no longer surfaced.
 */
export function normalizeLifecyclePlacementId(id: string): string | null {
    switch ((id ?? "").trim()) {
        case "department_rail":
            return "workspace_root"; // Department right rail → Workspace
        case "drawer":
            return "overflow"; // Focus Panel → Focus Panel Manage
        case "queue_row":
            return null; // deprecated, no longer surfaced
        default:
            return (id ?? "").trim() || null;
    }
}

/**
 * Map a saved physical (`surface`, `slot`) back to a canonical editor placement id,
 * normalizing deprecated surfaces. Returns `null` when the saved placement is deprecated and
 * no longer surfaced (e.g. `queue_row`), so legacy data renders gracefully without breaking.
 */
export function lifecycleActivationPlacementIdForSurfaceSlot(
    surface: string,
    slot: string
): string | null {
    const s = (surface ?? "").trim();
    const sl = (slot ?? "").trim();
    for (const p of LIFECYCLE_ACTION_PLACEMENTS) {
        if (p.surface === s && p.slot === sl) return p.id;
    }
    // Legacy normalization onto canonical placements.
    if (s === "department" && sl === "primary") return "workspace_root"; // → Workspace
    if (s === "record_header" && sl === "primary") return "overflow"; // Focus Panel → Focus Panel Manage
    // queue_row / row_inline → deprecated, not surfaced.
    return null;
}

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
        LIFECYCLE_DEPRECATED_ACTION_PLACEMENTS.find((p) => p.id === id) ??
        null
    );
}
