import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";

/**
 * Current Work action surface policy — config-first, category-backed.
 *
 * Current Work owns operational progression (outcome completion + checklist handoffs).
 * Manage, supporting actions, and right rail must not compete with that primary path.
 *
 * Classification order:
 * 1. Slot placement (overflow → Manage only; never supporting)
 * 2. Canonical action category (cross-domain)
 * 3. Legacy enrollment-specific keys (compat until all domains use categories)
 */

/** Legacy admin keys — prefer `record_header` overflow slot in config. */
const LEGACY_MANAGE_ONLY_ACTION_KEYS = new Set([
    "duplicate_lead",
    "merge_lead",
    "transfer_lead",
    "export_lead",
    "archive_lead",
    "delete_lead",
    "open_record",
]);

/** Legacy completion duplicates not yet in canonical catalog. */
const LEGACY_COMPLETION_DUPLICATE_KEYS = new Set([
    "complete_stage_contact_attempts",
    "contact_attempted",
]);

/** Generic umbrella lifecycle editors — never surface as Current Work helpful actions. */
export const GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS = new Set([
    "update_enrollment_status",
    "update_lead_status",
    "update_child_enrollment_status",
    "update_status_add_note",
]);

export function isGenericUmbrellaLifecycleAction(actionKey: string): boolean {
    const key = actionKey.trim();
    if (!key) return false;
    return GENERIC_UMBRELLA_LIFECYCLE_ACTION_KEYS.has(key);
}

export function isManageOnlyRecordHeaderAction(actionKey: string): boolean {
    const key = actionKey.trim();
    if (!key) return false;
    if (LEGACY_MANAGE_ONLY_ACTION_KEYS.has(key)) return true;
    return false;
}

export function actionCategoryCompetesWithCurrentWorkCompletion(actionKey: string): boolean {
    const category = canonicalActionDefinition(actionKey)?.category;
    return category === "status_lifecycle";
}

export function actionCompetesWithCurrentWorkCompletion(actionKey: string): boolean {
    const key = actionKey.trim();
    if (!key) return false;
    if (LEGACY_COMPLETION_DUPLICATE_KEYS.has(key)) return true;
    if (isGenericUmbrellaLifecycleAction(key)) return true;
    return false;
}

export function actionCompetesWithCurrentWorkOnRail(actionKey: string): boolean {
    const key = actionKey.trim();
    if (!key) return false;
    if (actionCompetesWithCurrentWorkCompletion(key)) return true;

    const category = canonicalActionDefinition(key)?.category;
    if (category === "communication") return true;
    if (category === "status_lifecycle") return true;

    // Legacy placeholders not in canonical catalog.
    if (key === "send_message_placeholder") return true;

    return false;
}
