/**
 * Operator-facing subject clarity for Work Template action refs.
 * No grain / OCM / registry vocabulary in product copy.
 */

import {
    normalizeActionRefToIntentKey,
    workTemplateActionIntentForKey,
} from "@/lib/lifecycle/workTemplateActionIntentCatalog";

/**
 * Short “Applies to …” line for stage Actions & Results configuration.
 * Returns null when no special related-subject or subject clarity is needed.
 */
export function workTemplateActionAppliesToLabel(actionRef: string): string | null {
    const raw = actionRef.trim();
    if (!raw) return null;
    const intentKey = normalizeActionRefToIntentKey(raw);
    const intent = workTemplateActionIntentForKey(raw) ?? workTemplateActionIntentForKey(intentKey);

    if (intent?.intentKey === "move_to_waitlist" || raw === "waitlist_child") {
        return "Applies to: Child → Waitlist";
    }
    if (intent?.intentKey === "close_lead" || raw === "close_lead") {
        return "Applies to: Family";
    }
    if (intent?.intentKey === "enroll_subject") {
        return intent.defaultRef === "enroll_child" || raw === "enroll_child"
            ? "Applies to: Child"
            : "Applies to: Family";
    }
    if (raw === "schedule_tour" || raw === "reschedule_tour") {
        return "Applies to: Family";
    }
    return null;
}
